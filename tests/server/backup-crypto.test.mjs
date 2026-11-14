// PRE-14 · Task 2: formato HamptonBackupV1 (cifrado por entrada, verificación y firma del certificado).
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto as crypto} from 'node:crypto';
import {
  encryptBackupEntry, verifyBackupEntry, readBackupEntry, keyFingerprint,
  signBackupCertificate, verifyBackupCommit,
} from '../../server/backup-crypto.js';

const RUN = '11111111-1111-4111-8111-111111111111';
const ATTEMPT = '22222222-2222-4222-8222-222222222222';
const ENTRY = '33333333-3333-4333-8333-333333333333';
const SMALL = 16; // chunk pequeño para probar límites sin generar 4 MiB

const rsa = (bits = 3072) => crypto.subtle.generateKey(
  {name: 'RSA-OAEP', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'},
  true, ['wrapKey', 'unwrapKey']);
const recovery = await rsa();
const otherRecovery = await rsa();

function memStore() {
  const m = new Map();
  return {m, async put(k, v) { m.set(k, v instanceof Uint8Array ? v.slice() : v); }, async get(k) { return m.get(k) ?? null; }};
}
async function* pieces(bytes, size = 7) { for (let i = 0; i < bytes.length; i += size) yield bytes.slice(i, i + size); }
const bytes = n => Uint8Array.from({length: n}, (_, i) => (i * 31 + 7) & 255);
const enc = (store, data, extra = {}) => encryptBackupEntry({
  run_id: RUN, attempt_id: ATTEMPT, entry_id: ENTRY, source: pieces(data),
  metadata: {key: 'properties/HE-R001/photo.jpg', content_type: 'image/jpeg'},
  publicKey: recovery.publicKey, chunkBytes: SMALL, ...extra}, store);
async function plain(receipt, store, key = recovery.privateKey) {
  const out = [];
  const r = await readBackupEntry(receipt, {privateKey: key}, store, c => out.push(...c));
  return {...r, data: Uint8Array.from(out)};
}

for (const n of [0, 1, SMALL, SMALL + 1, 3 * SMALL]) {
  test(`roundtrip de ${n} bytes con chunks de ${SMALL}`, async () => {
    const store = memStore(), data = bytes(n);
    const {receipt, dek} = await enc(store, data);
    assert.equal(receipt.size, n);
    assert.equal(receipt.chunks, Math.ceil(n / SMALL));
    assert.equal(await verifyBackupEntry(receipt, dek, store), true);
    const r = await plain(receipt, store);
    assert.deepEqual(r.data, data);
    assert.deepEqual(r.metadata, {key: 'properties/HE-R001/photo.jpg', content_type: 'image/jpeg'});
  });
}

test('el chunk por defecto es de 4 MiB exactos', async () => {
  const store = memStore(), data = bytes(4 * 1024 * 1024 + 1);
  const {receipt} = await enc(store, data, {chunkBytes: undefined});
  assert.equal(receipt.chunks, 2);
  assert.equal(store.m.get(`runs/${RUN}/${ATTEMPT}/${ENTRY}/1.bin`).length, 4 * 1024 * 1024 + 16);
});

test('clave de recuperación equivocada falla', async () => {
  const store = memStore();
  const {receipt} = await enc(store, bytes(40));
  await assert.rejects(plain(receipt, store, otherRecovery.privateKey));
});

test('tag alterado, chunk truncado, ausente o reordenado fallan', async () => {
  const cases = {
    tag: m => { const k = `runs/${RUN}/${ATTEMPT}/${ENTRY}/2.bin`; const c = m.get(k); c[c.length - 1] ^= 1; },
    truncado: m => { const k = `runs/${RUN}/${ATTEMPT}/${ENTRY}/3.bin`; m.set(k, m.get(k).slice(0, 5)); },
    ausente: m => m.delete(`runs/${RUN}/${ATTEMPT}/${ENTRY}/3.bin`),
    reordenado: m => {
      const a = `runs/${RUN}/${ATTEMPT}/${ENTRY}/1.bin`, b = `runs/${RUN}/${ATTEMPT}/${ENTRY}/2.bin`;
      const x = m.get(a); m.set(a, m.get(b)); m.set(b, x);
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const store = memStore();
    const {receipt, dek} = await enc(store, bytes(3 * SMALL));
    mutate(store.m);
    assert.equal(await verifyBackupEntry(receipt, dek, store), false, name);
    await assert.rejects(plain(receipt, store), name);
  }
});

test('metadatos o envelope sustituidos por los de otra entrada fallan', async () => {
  const store = memStore();
  const {receipt} = await enc(store, bytes(20));
  const other = memStore();
  const ENTRY2 = '44444444-4444-4444-8444-444444444444';
  await enc(other, bytes(20), {entry_id: ENTRY2, metadata: {key: 'otra'}});
  // registro de metadatos (índice 0) de otra entrada
  store.m.set(`runs/${RUN}/${ATTEMPT}/${ENTRY}/0.bin`, other.m.get(`runs/${RUN}/${ATTEMPT}/${ENTRY2}/0.bin`));
  await assert.rejects(plain(receipt, store));
  // envelope alterado: su hash queda en el recibo
  const s2 = memStore();
  const {receipt: r2} = await enc(s2, bytes(20));
  const env = JSON.parse(new TextDecoder().decode(s2.m.get(r2.envelope_ref)));
  env.prefix = Buffer.from(new Uint8Array(8)).toString('base64');
  s2.m.set(r2.envelope_ref, new TextEncoder().encode(JSON.stringify(env)));
  await assert.rejects(plain(r2, s2));
});

test('cada intento usa DEK y prefijo nuevos', async () => {
  const a = memStore(), b = memStore();
  const ra = (await enc(a, bytes(20))).receipt, rb = (await enc(b, bytes(20))).receipt;
  const ea = JSON.parse(new TextDecoder().decode(a.m.get(ra.envelope_ref)));
  const eb = JSON.parse(new TextDecoder().decode(b.m.get(rb.envelope_ref)));
  assert.notEqual(ea.prefix, eb.prefix);
  assert.notEqual(ea.wrapped_dek, eb.wrapped_dek);
  assert.notEqual(ra.cipher_hash, rb.cipher_hash);
  assert.equal(ra.plain_hash, rb.plain_hash);
});

test('recibo y envelope no contienen metadatos ni DEK en claro', async () => {
  const store = memStore();
  const {receipt} = await enc(store, bytes(20));
  const visible = JSON.stringify(receipt) + new TextDecoder().decode(store.m.get(receipt.envelope_ref));
  assert.doesNotMatch(visible, /HE-R001|photo|image\/jpeg/);
  assert.deepEqual(Object.keys(JSON.parse(new TextDecoder().decode(store.m.get(receipt.envelope_ref)))).sort(),
    ['entry_id', 'format', 'key_id', 'prefix', 'wrapped_dek']);
  assert.equal(JSON.parse(new TextDecoder().decode(store.m.get(receipt.envelope_ref))).key_id,
    await keyFingerprint(recovery.publicKey));
});

test('rechaza claves RSA que no son de 3072 bits e IDs que no son UUID', async () => {
  const small = await rsa(2048);
  await assert.rejects(enc(memStore(), bytes(4), {publicKey: small.publicKey}));
  await assert.rejects(enc(memStore(), bytes(4), {entry_id: '../x'}));
});

test('memoria acotada: no lee más de un chunk por delante de lo guardado', async () => {
  let pulled = 0, stored = 0, worst = 0;
  async function* src() { for (let i = 0; i < 200; i++) { pulled += 5; worst = Math.max(worst, pulled - stored); yield bytes(5); } }
  const store = memStore(), put = store.put;
  store.put = async (k, v) => { if (k.endsWith('.bin') && !k.endsWith('/0.bin')) stored += v.length - 16; return put(k, v); };
  await encryptBackupEntry({run_id: RUN, attempt_id: ATTEMPT, entry_id: ENTRY, source: src(), metadata: {},
    publicKey: recovery.publicKey, chunkBytes: SMALL}, store);
  assert.ok(worst <= SMALL + 5, `buffer máximo ${worst}`);
});

// --- certificado firmado (Ed25519) ---
const signing = await crypto.subtle.generateKey({name: 'Ed25519'}, true, ['sign', 'verify']);
const rogue = await crypto.subtle.generateKey({name: 'Ed25519'}, true, ['sign', 'verify']);
const payload = {
  run_id: RUN, attempt_id: ATTEMPT, week_start: '2026-11-15T02:00:00.000Z', cutoff: '2026-11-15T02:03:10.000Z',
  policy_hash: 'a'.repeat(64), manifest_key: '55555555-5555-4555-8555-555555555555',
  manifest_cipher_sha256: 'b'.repeat(64), signing_key_id: 'sign-2026-11', recovery_key_id: 'c'.repeat(64),
};
const trust = {trustedSigningKeys: {'sign-2026-11': signing.publicKey}, expectedBackupId: RUN, expectedWeek: payload.week_start};

test('certificado firmado se verifica con el trust bundle externo', async () => {
  const commit = await signBackupCertificate(payload, signing.privateKey);
  assert.deepEqual(await verifyBackupCommit(commit, trust), payload);
});

test('firma ajena, clave desconocida, campo cambiado o copia distinta se rechazan', async () => {
  const good = await signBackupCertificate(payload, signing.privateKey);
  const bad = [
    await signBackupCertificate(payload, rogue.privateKey),
    await signBackupCertificate({...payload, signing_key_id: 'revocada'}, signing.privateKey),
    {...good, cutoff: '2026-11-15T02:03:11.000Z'},
    {...good, manifest_cipher_sha256: 'c'.repeat(64)},
    {...good, extra: 1},
  ];
  for (const c of bad) await assert.rejects(verifyBackupCommit(c, trust));
  await assert.rejects(verifyBackupCommit(good, {...trust, expectedBackupId: ENTRY}));
  await assert.rejects(verifyBackupCommit(good, {...trust, expectedWeek: '2026-11-22T02:00:00.000Z'}));
});

test('signBackupCertificate solo acepta el esquema fijo', async () => {
  for (const p of [{...payload, cutoff: '2026-11-15 02:03'}, {...payload, policy_hash: 'A'.repeat(64)},
    {...payload, run_id: 'x'}, {...payload, extra: 1}, (({cutoff, ...r}) => r)(payload)]) {
    await assert.rejects(signBackupCertificate(p, signing.privateKey));
  }
});
