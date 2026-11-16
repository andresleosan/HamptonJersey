// PRE-14 · Task 3: captura coherente D1/R2 y sello comprobable (plan 2026-11-09-tp01-pre-14-plan.md, Task 3, y
// complemento de tanda 8 §1 y §4). Cierra la compuerta, drena, exporta D1 por la API de exportación (polling), copia
// cada objeto de MEDIA cifrado con HamptonBackupV1 a BACKUPS y escribe la disposición que lee
// scripts/backup-recovery.mjs. Después, el CAS de sealBackup fija el sello en D1, reabre la compuerta, verifica el
// inventario sin DEK, firma y publica runs/<run>/COMMIT.json. Solo con BACKUP_READY = "1"; corre en el worker de
// respaldo de Task 4, que necesita nodejs_compat (node:crypto, para el SHA-256 por flujo).
// Secretos solo desde env (token de exportación, clave privada de firma). La URL firmada vive en una variable local:
// nunca en logs, D1, R2 ni en el resultado. Los resultados y logs son C0 (estado y código de razón).
import {createHash} from 'node:crypto';
import {encryptBackupEntry, verifyBackupEntry, verifyStoredEntry, signBackupCertificate, keyFingerprint} from './backup-crypto.js';
import {BACKUP_POLICY} from './backup-policy.js';
import {backupReady, closeWriteGate, drainState, openWriteGate} from './backup-write-gate.js';

// Fuentes registradas: la D1 entera y el bucket MEDIA entero. Columnas que nombran un archivo de MEDIA: las de
// REFERENCES deben existir en la copia; property_capture_assets.blob_key puede nombrar uno ausente a propósito (0084)
// y se copia con el bucket sin exigirlo. Otra columna r2_key/thumb_key/blob_key no registrada impide la copia.
export const REFERENCES = Object.freeze([{table: 'media', column: 'r2_key'}, {table: 'media', column: 'thumb_key'},
  {table: 'listing_documents', column: 'r2_key'}]);
const UNCHECKED = ['property_capture_assets.blob_key'];
const PAGE = 256; // entradas por página de manifiesto y de inventario
const API = 'https://api.cloudflare.com/client/v4';
const D1_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
// now: null = reloj de D1 (solo las pruebas fijan un instante); ms/sleep: plazos del Worker, sin consultar D1.
const CLOCK = {now: () => null, ms: () => Date.now(), sleep: ms => new Promise(r => setTimeout(r, ms))};
const te = new TextEncoder(), td = new TextDecoder();

class Stop extends Error {
  constructor(reason, status = 'failed') { super(`backup_${reason}`); this.reason = reason; this.status = status; }
}
const stop = (reason, status) => { throw new Stop(reason, status); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const invKey = (run, attempt, id) => `runs/${run}/${attempt}/inventory/${id}.json`;
const commitKey = run => `runs/${run}/COMMIT.json`;
const parse = bytes => { try { return JSON.parse(td.decode(bytes)); } catch { return stop('inventory_mismatch'); } };
async function* once(doc) { yield te.encode(JSON.stringify(doc)); }
const r2Store = bucket => ({
  put: (key, bytes) => bucket.put(key, bytes),
  async get(key) { const o = await bucket.get(key); return o ? new Uint8Array(await o.arrayBuffer()) : null; },
});

// Tamaño y SHA-256 del contenido mientras pasa hacia el cifrado (un chunk en memoria).
function hashing(stream, reason) {
  const h = createHash('sha256'), out = {size: 0, digest: () => h.digest('hex')};
  out.source = (async function* () {
    try {
      for await (const c of stream) { const b = c instanceof Uint8Array ? c : new Uint8Array(c); h.update(b); out.size += b.length; yield b; }
    } catch (e) { if (e instanceof Stop) throw e; stop(reason); }
  })();
  return out;
}

async function listAll(bucket) {
  const out = [];
  let cursor;
  do {
    const page = await bucket.list({cursor});
    out.push(...page.objects.map(o => ({key: o.key, size: o.size, etag: o.etag})));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

async function recoveryKey(env) {
  if (!env.DB || !env.MEDIA || !env.BACKUPS || !env.D1_EXPORT_TOKEN || !env.CF_ACCOUNT_ID || !env.D1_DATABASE_ID
    || !env.BACKUP_RECOVERY_PUBLIC_KEY || !env.BACKUP_SIGNING_KEY || !env.BACKUP_SIGNING_KEY_ID) stop('not_configured');
  let publicKey;
  try {
    publicKey = await crypto.subtle.importKey('spki', unb64(env.BACKUP_RECOVERY_PUBLIC_KEY), {name: 'RSA-OAEP', hash: 'SHA-256'},
      true, ['wrapKey']);
  } catch { stop('not_configured'); }
  if (publicKey.algorithm.modulusLength !== 3072) stop('not_configured');
  return {publicKey, recovery_key_id: await keyFingerprint(publicKey)};
}

async function checkCoverage(env) {
  const known = new Set([...REFERENCES.map(r => `${r.table}.${r.column}`), ...UNCHECKED]);
  const {results} = await env.DB.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL`).all();
  for (const {name, sql} of results) {
    for (const [column] of sql.matchAll(/\b(?:r2|thumb|blob)_key\b/g)) if (!known.has(`${name}.${column}`)) stop('uncovered_source');
  }
}

// Exportación de D1 (tanda 8 §1). Sin respuesta, 429 o 5xx al iniciar no prueban que no empezara: unknown, nunca otra
// exportación a ciegas. En el polling, los fallos transitorios repiten el mismo bookmark hasta el plazo.
async function exportD1(env, clock, deadline) {
  const url = `${API}/accounts/${env.CF_ACCOUNT_ID}/d1/database/${env.D1_DATABASE_ID}/export`;
  const call = body => fetch(url, {method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    headers: {authorization: `Bearer ${env.D1_EXPORT_TOKEN}`, 'content-type': 'application/json'}});
  const read = res => res.json().catch(() => null);
  let res;
  try { res = await call({output_format: 'polling', dump_options: {compatibility: 'd1'}}); } catch { stop('export_start_uncertain', 'unknown'); }
  if (res.status === 429 || res.status >= 500) stop('export_start_uncertain', 'unknown');
  let body = await read(res);
  if (!res.ok || body?.success === false) stop('export_rejected');
  const bookmark = body?.result?.at_bookmark;
  if (typeof bookmark !== 'string' || !bookmark) stop('export_bookmark_missing', 'unknown');
  for (;;) {
    const r = body?.success === true ? body.result : null;
    if (r) {
      if (r.at_bookmark !== bookmark) stop('export_bookmark_mismatch', 'unknown');
      if (r.status === 'error') stop('export_error');
      if (r.status === 'complete') return download(r.result?.signed_url);
    }
    if (clock.ms() >= deadline) stop('export_deadline', 'unknown');
    await clock.sleep(1000);
    body = null;
    try {
      const p = await call({output_format: 'polling', current_bookmark: bookmark});
      if (p.ok) body = await read(p);
    } catch { /* timeout o red: se vuelve a consultar el mismo bookmark */ }
  }
}

// La URL firmada es una credencial de corta vida: solo HTTPS, sin el token de la API, y longitud exacta.
async function download(signedUrl) {
  let url;
  try { url = new URL(signedUrl); } catch { stop('export_result_invalid'); }
  if (url.protocol !== 'https:') stop('export_result_invalid');
  let res;
  try { res = await fetch(url, {signal: AbortSignal.timeout(BACKUP_POLICY.gate_ms)}); } catch { stop('export_download_failed'); }
  if (res.status !== 200 || !res.body) stop('export_download_failed');
  const header = res.headers.get('content-length'), length = Number(header);
  if (header === null || !Number.isSafeInteger(length)) stop('export_truncated');
  return {body: res.body, length};
}

// Cierra la compuerta, drena, exporta D1 y copia MEDIA a BACKUPS; deja el run en 'capturing' con el manifiesto y el
// inventario verificados y la compuerta CERRADA hasta sealBackup (o hasta su plazo). Si falla, run failed/unknown
// con razón C0, compuerta reabierta y nada borrado. Devuelve solo metadatos C0.
export async function captureBackup(env, {run_id, attempt_id, week_start, policy_hash}, clock = CLOCK) {
  if (!backupReady(env)) return {status: 'disabled'};
  let key;
  try { key = await recoveryKey(env); await checkCoverage(env); } catch (e) { if (e instanceof Stop) return {status: e.status, reason: e.reason}; throw e; }
  const at = `COALESCE(?5, ${D1_NOW})`;
  const started = await env.DB.prepare(`UPDATE backup_runs SET status = 'draining', attempt = attempt + 1, attempt_id = ?2,
      started_at = COALESCE(started_at, ${at}), fence_epoch = NULL, cutoff = NULL, manifest_key = NULL, manifest_cipher_hash = NULL,
      inventory_key = NULL, inventory_sha256 = NULL, recovery_key_id = NULL, reason_code = NULL, version = version + 1, updated_at = ${at}
    WHERE id = ?1 AND week_start = ?3 AND policy_hash = ?4 AND status IN ('queued', 'failed') AND attempt < 3`)
    .bind(run_id, attempt_id, week_start, policy_hash, clock.now()).run();
  if (started.meta.changes !== 1) return {status: 'not_startable'};
  const gate = await closeWriteGate(env, {run_id, now: clock.now()});
  try {
    if (!gate) stop('gate_busy');
    const t0 = clock.ms(), deadline = t0 + BACKUP_POLICY.gate_ms;
    for (;;) {
      const s = await drainState(env, {run_id, epoch: gate.epoch, now: clock.now()});
      if (s === 'drained') break;
      if (s !== 'waiting') stop(`gate_${s}`);
      if (clock.ms() - t0 >= BACKUP_POLICY.drain_ms) stop('drain_timeout');
      await clock.sleep(1000);
    }
    const {cutoff} = await env.DB.prepare(`UPDATE backup_runs SET status = 'capturing', fence_epoch = ?3,
        cutoff = COALESCE(?4, ${D1_NOW}), version = version + 1, updated_at = COALESCE(?4, ${D1_NOW})
      WHERE id = ?1 AND attempt_id = ?2 AND status = 'draining' RETURNING cutoff`)
      .bind(run_id, attempt_id, gate.epoch, clock.now()).first() ?? stop('run_changed');

    // Desde aquí y hasta acabar la descarga, ninguna consulta a D1.
    const backups = r2Store(env.BACKUPS), manifest = [], pages = [], inventory = [];
    const entry = async (source, metadata) => {
      const {receipt, dek} = await encryptBackupEntry({run_id, attempt_id, entry_id: crypto.randomUUID(), source, metadata,
        publicKey: key.publicKey}, backups);
      if (!await verifyBackupEntry(receipt, dek, backups)) stop('entry_verify_failed'); // la DEK se olvida aquí
      inventory.push({entry_id: receipt.entry_id, chunks: receipt.chunks, cipher_hash: receipt.cipher_hash,
        envelope_sha256: receipt.envelope_sha256});
      return receipt;
    };
    const flush = async () => pages.push(await entry(once({kind: 'manifest_page', entries: manifest.splice(0)}), {kind: 'manifest_page'}));
    const add = async (kind, receipt) => { manifest.push({kind, receipt}); if (manifest.length === PAGE) await flush(); };

    const dump = await exportD1(env, clock, deadline);
    const sql = hashing(dump.body, 'export_truncated');
    await add('d1', await entry(sql.source, () => {
      if (sql.size !== dump.length) stop('export_truncated');
      return {kind: 'd1', size: sql.size, sha256: sql.digest()};
    }));

    const listed = await listAll(env.MEDIA);
    for (const o of listed) {
      if (clock.ms() >= deadline) stop('capture_deadline');
      const obj = await env.MEDIA.get(o.key);
      if (!obj || obj.etag !== o.etag || obj.size !== o.size) stop('object_changed');
      const data = hashing(obj.body, 'object_read_failed');
      await add('r2', await entry(data.source, () => {
        const digest = data.digest(), expected = obj.checksums?.sha256;
        if (data.size !== o.size) stop('object_changed');
        if (expected && hex(expected) !== digest) stop('object_hash_mismatch'); // checksum de R2 si se subió con sha256
        return {kind: 'r2', key: o.key, size: data.size, sha256: digest, content_type: obj.httpMetadata?.contentType ?? null,
          custom_metadata: obj.customMetadata ?? {}};
      }));
    }
    if (JSON.stringify(await listAll(env.MEDIA)) !== JSON.stringify(listed)) stop('object_changed');
    const stored = new Set(listed.map(o => o.key));
    for (const {table, column} of REFERENCES) {
      const {results} = await env.DB.prepare(`SELECT DISTINCT "${column}" AS k FROM "${table}" WHERE "${column}" IS NOT NULL`).all();
      if (results.some(r => !stored.has(r.k))) stop('missing_object');
    }

    if (manifest.length) await flush();
    const root = await entry(once({kind: 'manifest_root', run_id, attempt_id, entry_count: listed.length + 1,
      references: REFERENCES, pages}), {kind: 'manifest_root'});
    // Inventario sin DEK (tanda 8 §4): hash del ciphertext y del envelope de cada entrada, incluida la raíz del manifiesto.
    const invPages = [];
    for (let i = 0; i < inventory.length; i += PAGE) {
      const bytes = te.encode(JSON.stringify({kind: 'inventory_page', entries: inventory.slice(i, i + PAGE)}));
      const id = crypto.randomUUID();
      await env.BACKUPS.put(invKey(run_id, attempt_id, id), bytes);
      invPages.push({id, sha256: sha256(bytes)});
    }
    const invRoot = te.encode(JSON.stringify({kind: 'inventory_root', run_id, attempt_id, entry_count: inventory.length,
      pages: invPages, manifest_receipt: root}));
    const inventory_key = crypto.randomUUID();
    await env.BACKUPS.put(invKey(run_id, attempt_id, inventory_key), invRoot);

    const saved = await env.DB.prepare(`UPDATE backup_runs SET manifest_key = ?3, manifest_cipher_hash = ?4, inventory_key = ?5,
        inventory_sha256 = ?6, recovery_key_id = ?7, version = version + 1, updated_at = COALESCE(?8, ${D1_NOW})
      WHERE id = ?1 AND attempt_id = ?2 AND status = 'capturing'`)
      .bind(run_id, attempt_id, root.entry_id, root.cipher_hash, inventory_key, sha256(invRoot), key.recovery_key_id, clock.now()).run();
    if (saved.meta.changes !== 1) stop('run_changed');
    return {status: 'captured', manifest_key: root.entry_id, cipher_hash: root.cipher_hash, cutoff, epoch: gate.epoch};
  } catch (e) {
    const s = e instanceof Stop ? e : new Stop('unexpected');
    console.error('backup_capture_failed', s.reason);
    await env.DB.prepare(`UPDATE backup_runs SET status = ?3, reason_code = ?4, version = version + 1,
        updated_at = COALESCE(?5, ${D1_NOW}) WHERE id = ?1 AND attempt_id = ?2 AND status IN ('draining', 'capturing')`)
      .bind(run_id, attempt_id, s.status, s.reason, clock.now()).run().catch(() => console.error('backup_run_update_failed'));
    if (gate) await openWriteGate(env, {run_id, epoch: gate.epoch, now: clock.now()}).catch(() => console.error('backup_gate_open_failed'));
    return {status: s.status, reason: s.reason};
  }
}

// CAS del sello: una sola sentencia exige compuerta cerrada para este run y epoch, plazo vigente, cero permisos abiertos
// y ninguno admitido en el epoch cerrado, y persiste el sello. Después reabre la compuerta (los cambios posteriores no
// alteran el cutoff) y certifica. Repetido con el mismo sello, devuelve el mismo certificado.
export async function sealBackup(env, {run_id, epoch, manifest_key, cipher_hash}, now = null) {
  const at = `COALESCE(?5, ${D1_NOW})`;
  const sealed = await env.DB.prepare(`UPDATE backup_runs SET status = 'sealed', sealed_at = ${at}, format = 'HamptonBackupV1',
      signing_key_id = ?6, version = version + 1, updated_at = ${at}
    WHERE id = ?1 AND status = 'capturing' AND fence_epoch = ?2 AND manifest_key = ?3 AND manifest_cipher_hash = ?4
      AND ?6 IS NOT NULL AND cutoff IS NOT NULL AND inventory_key IS NOT NULL AND inventory_sha256 IS NOT NULL
      AND recovery_key_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM backup_write_gate WHERE id = 1 AND state = 'closed' AND epoch = ?2 AND run_id = ?1
        AND deadline > ${at})
      AND NOT EXISTS (SELECT 1 FROM backup_writers WHERE closed_at IS NULL OR epoch = ?2)`)
    .bind(run_id, epoch, manifest_key, cipher_hash, now, env.BACKUP_SIGNING_KEY_ID ?? null).run();
  if (sealed.meta.changes !== 1) {
    const row = await env.DB.prepare(`SELECT status, fence_epoch, manifest_key, manifest_cipher_hash FROM backup_runs
      WHERE id = ?1`).bind(run_id).first();
    if (!(row && ['sealed', 'complete'].includes(row.status) && row.fence_epoch === epoch && row.manifest_key === manifest_key
      && row.manifest_cipher_hash === cipher_hash)) {
      await env.DB.prepare(`UPDATE backup_runs SET status = 'failed', reason_code = 'seal_rejected', version = version + 1,
        updated_at = ${at.replace('?5', '?3')} WHERE id = ?1 AND status = 'capturing' AND fence_epoch = ?2`).bind(run_id, epoch, now).run();
      await openWriteGate(env, {run_id, epoch, now});
      stop('seal_rejected');
    }
  }
  await openWriteGate(env, {run_id, epoch, now});
  return certifyBackup(env, run_id, now);
}

// Firma y publica COMMIT a partir del sello durable, sin DEK ni otra exportación: también concilia un sello cuyo
// proceso murió antes de firmar o de publicar. Con el inventario alterado, la clave de firma del sello ausente o un
// COMMIT distinto ya publicado, el run queda 'unknown' y no se certifica ni se purga nada. Un error de E/S lo deja
// 'sealed' para reintentar.
export async function certifyBackup(env, run_id, now = null) {
  const row = await env.DB.prepare('SELECT * FROM backup_runs WHERE id = ?1').bind(run_id).first();
  if (!row || !['sealed', 'complete'].includes(row.status)) stop('not_sealed');
  try {
    const backups = r2Store(env.BACKUPS), ids = {run_id: row.id, attempt_id: row.attempt_id};
    const rootBytes = await backups.get(invKey(row.id, row.attempt_id, row.inventory_key));
    if (!rootBytes || sha256(rootBytes) !== row.inventory_sha256) stop('inventory_mismatch');
    const root = parse(rootBytes), mr = root.manifest_receipt;
    if (root.run_id !== row.id || root.attempt_id !== row.attempt_id || !Array.isArray(root.pages) || mr?.run_id !== row.id
      || mr.attempt_id !== row.attempt_id || mr.entry_id !== row.manifest_key || mr.cipher_hash !== row.manifest_cipher_hash) {
      stop('inventory_mismatch');
    }
    let count = 0, manifestListed = false;
    for (const p of root.pages) {
      const bytes = await backups.get(invKey(row.id, row.attempt_id, p.id));
      if (!bytes || sha256(bytes) !== p.sha256) stop('inventory_mismatch');
      for (const e of parse(bytes).entries) {
        if (!await verifyStoredEntry({...e, ...ids}, backups)) stop('inventory_mismatch');
        if (e.entry_id === mr.entry_id) manifestListed = e.cipher_hash === mr.cipher_hash && e.envelope_sha256 === mr.envelope_sha256;
        count++;
      }
    }
    if (count !== root.entry_count || !manifestListed) stop('inventory_mismatch');

    if (env.BACKUP_SIGNING_KEY_ID !== row.signing_key_id || !env.BACKUP_SIGNING_KEY) stop('signing_key_unavailable');
    let signingKey;
    try { signingKey = await crypto.subtle.importKey('pkcs8', unb64(env.BACKUP_SIGNING_KEY), {name: 'Ed25519'}, false, ['sign']); }
    catch { stop('signing_key_unavailable'); }
    // Ed25519 es determinista: el mismo sello da los mismos bytes de COMMIT en cada conciliación.
    const certificate = await signBackupCertificate({...ids, week_start: row.week_start, cutoff: row.cutoff,
      policy_hash: row.policy_hash, manifest_key: row.manifest_key, manifest_cipher_sha256: row.manifest_cipher_hash,
      signing_key_id: row.signing_key_id, recovery_key_id: row.recovery_key_id}, signingKey);
    const commit = te.encode(JSON.stringify({certificate, manifest_receipt: mr}));
    let put = null;
    try { put = await env.BACKUPS.put(commitKey(row.id), commit, {onlyIf: new Headers({'if-none-match': '*'})}); }
    catch { /* respuesta incierta: decide lo publicado */ }
    if (!put) {
      const existing = await backups.get(commitKey(row.id));
      if (!existing) throw new Error('backup_commit_uncertain');
      if (sha256(existing) !== sha256(commit)) stop('commit_conflict');
    }
    await env.DB.prepare(`UPDATE backup_runs SET status = 'complete', version = version + 1, updated_at = COALESCE(?2, ${D1_NOW})
      WHERE id = ?1 AND status = 'sealed'`).bind(run_id, now).run();
    await purgeOld(env).catch(() => console.error('backup_purge_failed'));
    return certificate;
  } catch (e) {
    if (e instanceof Stop) {
      console.error('backup_certify_failed', e.reason);
      await env.DB.prepare(`UPDATE backup_runs SET status = 'unknown', reason_code = ?2, version = version + 1,
        updated_at = COALESCE(?3, ${D1_NOW}) WHERE id = ?1 AND status = 'sealed'`).bind(run_id, e.reason, now).run();
    }
    throw e;
  }
}

// Conserva las 12 copias completas más recientes; de las anteriores purga las que no están en recovery_hold. Solo se
// llama tras certificar una copia nueva. Borra primero COMMIT, para que una purga a medias no parezca una copia válida.
async function purgeOld(env) {
  const {results} = await env.DB.prepare(`SELECT id FROM backup_runs WHERE status = 'complete' AND recovery_hold = 0
    AND id NOT IN (SELECT id FROM backup_runs WHERE status = 'complete' ORDER BY week_start DESC LIMIT ?1)`)
    .bind(BACKUP_POLICY.keep_weeks).all();
  for (const {id} of results) {
    await env.BACKUPS.delete(commitKey(id));
    for (;;) {
      const page = await env.BACKUPS.list({prefix: `runs/${id}/`});
      if (!page.objects.length) break;
      await env.BACKUPS.delete(page.objects.map(o => o.key));
    }
    await env.DB.prepare(`UPDATE backup_runs SET status = 'purged', version = version + 1, updated_at = ${D1_NOW}
      WHERE id = ?1 AND status = 'complete' AND recovery_hold = 0`).bind(id).run();
  }
}
