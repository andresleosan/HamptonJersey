// PRE-14 · Formato HamptonBackupV1 (spec 2026-11-09-tp01-consistent-backup-design.md, «Cifrado y manifiesto»
// y «Autenticidad»). Solo WebCrypto: corre igual en el worker y en Node (recuperación).
// Cada entrada: DEK AES-256-GCM nueva, envuelta con RSA-OAEP-3072/SHA-256 (pública de Luis);
// registro 0 = metadatos privados cifrados, registros 1..n = chunks de datos.
// Nonce = prefijo aleatorio de 64 bits + índice de 32 bits big-endian; AAD = [1,run,attempt,entry,index,plainLength].
const subtle = globalThis.crypto.subtle;
const FORMAT = 'HamptonBackupV1';
const CHUNK = 4 * 1024 * 1024;
const TAG = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const te = new TextEncoder(), td = new TextDecoder();

const fail = reason => { throw new Error(`backup_${reason}`); };
const uuid = (v, name) => (typeof v === 'string' && UUID.test(v)) || fail(`invalid_${name}`);
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const sha = async bytes => new Uint8Array(await subtle.digest('SHA-256', bytes));
const recordKey = (r, i) => `runs/${r.run_id}/${r.attempt_id}/${r.entry_id}/${i}.bin`;
const aad = (r, index, plainLength) => te.encode(JSON.stringify([1, r.run_id, r.attempt_id, r.entry_id, index, plainLength]));

function nonce(prefix, index) {
  if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) fail('counter_exhausted');
  const n = new Uint8Array(12);
  n.set(prefix);
  new DataView(n.buffer).setUint32(8, index);
  return n;
}

// ponytail: hash de la lista de hashes por registro; WebCrypto no tiene SHA-256 incremental.
async function chainHash(digests) {
  const all = new Uint8Array(digests.length * 32);
  digests.forEach((d, i) => all.set(d, i * 32));
  return hex(await sha(all));
}

export async function keyFingerprint(publicKey) {
  return hex(await sha(new Uint8Array(await subtle.exportKey('spki', publicKey))));
}

function checkRecoveryKey(publicKey) {
  const a = publicKey?.algorithm;
  if (a?.name !== 'RSA-OAEP' || a.modulusLength !== 3072 || a.hash?.name !== 'SHA-256' || publicKey.type !== 'public') {
    fail('recovery_key_not_rsa_oaep_3072_sha256');
  }
}

// source: iterable asíncrono de Uint8Array (ReadableStream o generador). Nunca guarda más de un chunk en memoria.
// Devuelve el recibo (sin secretos) y la DEK, que el llamador usa para verificar dentro del intento y luego olvida.
export async function encryptBackupEntry({run_id, attempt_id, entry_id, source, metadata = {}, publicKey, chunkBytes = CHUNK}, store) {
  uuid(run_id, 'run_id'); uuid(attempt_id, 'attempt_id'); uuid(entry_id, 'entry_id');
  checkRecoveryKey(publicKey);
  if (!Number.isInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > CHUNK) fail('invalid_chunk_size');
  const r = {run_id, attempt_id, entry_id};
  const dek = await subtle.generateKey({name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']);
  const prefix = globalThis.crypto.getRandomValues(new Uint8Array(8));
  const cipherDigests = [], plainDigests = [];
  let index = 0, size = 0;

  const seal = async plain => {
    const cipher = new Uint8Array(await subtle.encrypt(
      {name: 'AES-GCM', iv: nonce(prefix, index), additionalData: aad(r, index, plain.length), tagLength: 128}, dek, plain));
    await store.put(recordKey(r, index), cipher);
    cipherDigests.push(await sha(cipher));
    if (index > 0) { plainDigests.push(await sha(plain)); size += plain.length; }
    index++;
  };

  await seal(te.encode(JSON.stringify(metadata)));
  let buf = new Uint8Array(chunkBytes), fill = 0;
  for await (const piece of source) {
    const bytes = piece instanceof Uint8Array ? piece : new Uint8Array(piece);
    for (let off = 0; off < bytes.length;) {
      const n = Math.min(chunkBytes - fill, bytes.length - off);
      buf.set(bytes.subarray(off, off + n), fill);
      fill += n; off += n;
      if (fill === chunkBytes) { await seal(buf); buf = new Uint8Array(chunkBytes); fill = 0; }
    }
  }
  if (fill) await seal(buf.slice(0, fill));

  const envelope = te.encode(JSON.stringify({
    format: FORMAT, key_id: await keyFingerprint(publicKey), entry_id,
    wrapped_dek: b64(new Uint8Array(await subtle.wrapKey('raw', dek, publicKey, {name: 'RSA-OAEP'}))),
    prefix: b64(prefix),
  }));
  const envelope_ref = `runs/${run_id}/${attempt_id}/${entry_id}/envelope.json`;
  await store.put(envelope_ref, envelope);
  return {
    receipt: {
      format: FORMAT, run_id, attempt_id, entry_id, envelope_ref, envelope_sha256: hex(await sha(envelope)),
      cipher_hash: await chainHash(cipherDigests), plain_hash: await chainHash(plainDigests), size, chunks: index - 1,
    },
    dek,
  };
}

// Descifra y comprueba TODA la entrada. onChunk recibe datos autenticados chunk a chunk, pero la entrada solo
// es válida cuando la promesa se resuelve: quien restaura escribe en staging y nunca en el destino antes.
export async function readBackupEntry(receipt, {privateKey, dek} = {}, store, onChunk = () => {}) {
  const r = receipt || {};
  if (r.format !== FORMAT) fail('unknown_format');
  uuid(r.run_id, 'run_id'); uuid(r.attempt_id, 'attempt_id'); uuid(r.entry_id, 'entry_id');
  if (!Number.isInteger(r.chunks) || r.chunks < 0 || !Number.isInteger(r.size) || r.size < 0) fail('invalid_receipt');

  const envBytes = await store.get(r.envelope_ref);
  if (!envBytes || hex(await sha(envBytes)) !== r.envelope_sha256) fail('envelope_mismatch');
  const env = JSON.parse(td.decode(envBytes));
  if (env.format !== FORMAT || env.entry_id !== r.entry_id) fail('envelope_mismatch');
  const prefix = unb64(env.prefix);
  if (prefix.length !== 8) fail('envelope_mismatch');
  const key = dek || await subtle.unwrapKey('raw', unb64(env.wrapped_dek), privateKey, {name: 'RSA-OAEP'},
    {name: 'AES-GCM', length: 256}, false, ['decrypt']);

  const cipherDigests = [], plainDigests = [];
  let metadata, size = 0;
  for (let index = 0; index <= r.chunks; index++) {
    const cipher = await store.get(recordKey(r, index));
    if (!cipher || cipher.length < TAG) fail('record_missing');
    const plain = new Uint8Array(await subtle.decrypt(
      {name: 'AES-GCM', iv: nonce(prefix, index), additionalData: aad(r, index, cipher.length - TAG), tagLength: 128},
      key, cipher));
    cipherDigests.push(await sha(cipher));
    if (index === 0) { metadata = JSON.parse(td.decode(plain)); continue; }
    if (!plain.length) fail('empty_chunk');
    plainDigests.push(await sha(plain));
    size += plain.length;
    await onChunk(plain);
  }
  if (await store.get(recordKey(r, r.chunks + 1))) fail('unexpected_record');
  if (size !== r.size || await chainHash(cipherDigests) !== r.cipher_hash || await chainHash(plainDigests) !== r.plain_hash) {
    fail('hash_mismatch');
  }
  return {metadata, size};
}

export async function verifyBackupEntry(receipt, dek, store) {
  return readBackupEntry(receipt, {dek}, store).then(() => true, () => false);
}

// --- Certificado firmado (Ed25519, algoritmo fijo por formato) ---
const CERT_FIELDS = ['run_id', 'attempt_id', 'week_start', 'cutoff', 'policy_hash', 'manifest_key',
  'manifest_cipher_sha256', 'signing_key_id', 'recovery_key_id'];

function checkCertificate(p) {
  const keys = Object.keys(p || {});
  if (keys.length !== CERT_FIELDS.length || !CERT_FIELDS.every(f => keys.includes(f))) fail('certificate_schema');
  for (const f of ['run_id', 'attempt_id', 'manifest_key']) uuid(p[f], f);
  for (const f of ['week_start', 'cutoff']) {
    const d = typeof p[f] === 'string' && new Date(p[f]);
    if (!d || isNaN(d) || d.toISOString() !== p[f]) fail(`invalid_${f}`);
  }
  for (const f of ['policy_hash', 'manifest_cipher_sha256']) if (!HEX64.test(p[f] ?? '')) fail(`invalid_${f}`);
  for (const f of ['signing_key_id', 'recovery_key_id']) if (!KEY_ID.test(p[f] ?? '')) fail(`invalid_${f}`);
  return CERT_FIELDS.map(f => p[f]);
}
const certMessage = values => te.encode(JSON.stringify([1, 'hampton-backup', ...values]));

export async function signBackupCertificate(payload, signingPrivateKey) {
  const values = checkCertificate(payload);
  if (signingPrivateKey?.algorithm?.name !== 'Ed25519' || signingPrivateKey.type !== 'private') fail('signing_key');
  const sig = new Uint8Array(await subtle.sign({name: 'Ed25519'}, signingPrivateKey, certMessage(values)));
  return {...Object.fromEntries(CERT_FIELDS.map((f, i) => [f, values[i]])), signature_base64: b64(sig)};
}

// trustedSigningKeys: {signing_key_id: CryptoKey pública}, leído fuera del bucket y de D1.
// ponytail: revocar = quitar la clave del trust bundle; sin lista de revocación aparte.
export async function verifyBackupCommit(commit, {trustedSigningKeys, expectedBackupId, expectedWeek}) {
  const {signature_base64, ...payload} = commit || {};
  const values = checkCertificate(payload);
  const key = Object.hasOwn(trustedSigningKeys || {}, payload.signing_key_id) ? trustedSigningKeys[payload.signing_key_id] : null;
  if (!key || key.algorithm?.name !== 'Ed25519') fail('untrusted_signing_key');
  if (typeof signature_base64 !== 'string' || !await subtle.verify({name: 'Ed25519'}, key, unb64(signature_base64), certMessage(values))) {
    fail('bad_signature');
  }
  if (payload.run_id !== expectedBackupId || payload.week_start !== expectedWeek) fail('unexpected_backup');
  return Object.fromEntries(CERT_FIELDS.map((f, i) => [f, values[i]]));
}
