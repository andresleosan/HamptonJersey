// PRE-14 · Task 3: captura D1/R2 y sello. D1 en node:sqlite, R2 simulado (MEDIA y BACKUPS), API de exportación de D1
// simulada con fetch y claves de prueba generadas aquí (nunca en archivos versionados). Nada toca Cloudflare.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto as crypto, createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, openSync, closeSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureBackup, sealBackup, certifyBackup} from '../../server/backups.js';
import {withApplicationWrite, BackupMaintenanceError} from '../../server/backup-write-gate.js';
import {keyFingerprint} from '../../server/backup-crypto.js';
import {makeDb, T0, dumpD1} from './helpers.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/backup-recovery.mjs', import.meta.url));
const RUN = '11111111-1111-4111-8111-111111111111';
const ATTEMPT = '22222222-2222-4222-8222-222222222222';
const ATTEMPT2 = '33333333-3333-4333-8333-333333333333';
const WEEK = '2026-11-15T02:00:00.000Z';
const POLICY = 'a'.repeat(64);
const API = 'https://api.cloudflare.com/client/v4/accounts/acct-test/d1/database/db-test/export';

const recovery = await crypto.subtle.generateKey(
  {name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['wrapKey', 'unwrapKey']);
const signing = await crypto.subtle.generateKey({name: 'Ed25519'}, true, ['sign', 'verify']);
const b64 = async (fmt, key) => Buffer.from(await crypto.subtle.exportKey(fmt, key)).toString('base64');
const TOKEN = `token-${crypto.randomUUID()}`;

const tmp = mkdtempSync(path.join(os.tmpdir(), 'pre14-capture-test-'));
test.after(() => rmSync(tmp, {recursive: true, force: true}));
let n = 0;
const fresh = name => path.join(tmp, `${name}-${n++}`);
const KEY_FILE = path.join(tmp, 'recovery.pem'), TRUST_FILE = path.join(tmp, 'trust.json');
writeFileSync(KEY_FILE, `-----BEGIN PRIVATE KEY-----\n${(await b64('pkcs8', recovery.privateKey)).match(/.{1,64}/g).join('\n')}
-----END PRIVATE KEY-----\n`, {mode: 0o600});
writeFileSync(TRUST_FILE, JSON.stringify({keys: {'sign-test': await b64('raw', signing.publicKey)}}), {mode: 0o600});

const sha = b => createHash('sha256').update(b).digest('hex');
const bytes = (len, seed) => Uint8Array.from({length: len}, (_, i) => (i * 31 + seed) & 255);
const PHOTO = 'media/hampton/a.jpg', THUMB = 'thumbs/hampton/a.jpg', DOC = 'private-docs/HE-T001/plan.pdf';
const OBJECTS = {[PHOTO]: bytes(150, 3), [THUMB]: bytes(40, 5), [DOC]: bytes(65, 9)};

// R2 simulado: etag por contenido, list paginado de 2 en 2, put condicional If-None-Match: * y checksums.sha256.
function bucket() {
  const m = new Map();
  const b = {
    m, hooks: {},
    async put(key, body, opts = {}) {
      if (opts.onlyIf instanceof Headers && opts.onlyIf.get('if-none-match') === '*' && m.has(key)) return null;
      const data = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body).slice();
      const etag = createHash('md5').update(data).digest('hex');
      m.set(key, {data, etag, httpMetadata: opts.httpMetadata ?? {}, customMetadata: opts.customMetadata ?? {},
        checksums: opts.sha256 ? {sha256: Uint8Array.from(Buffer.from(opts.sha256, 'hex')).buffer} : {}});
      return {key, etag, size: data.length};
    },
    async get(key) {
      await b.hooks.get?.(key);
      const o = m.get(key);
      if (!o) return null;
      const data = o.data.slice();
      return {key, size: data.length, etag: o.etag, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata,
        checksums: o.checksums, body: new Blob([data]).stream(), arrayBuffer: async () => data.buffer};
    },
    async list({prefix = '', cursor} = {}) {
      const keys = [...m.keys()].filter(k => k.startsWith(prefix)).sort(), start = Number(cursor ?? 0);
      const truncated = start + 2 < keys.length;
      return {objects: keys.slice(start, start + 2).map(k => ({key: k, size: m.get(k).data.length, etag: m.get(k).etag})),
        truncated, ...(truncated ? {cursor: String(start + 2)} : {})};
    },
    async delete(keys) { for (const k of [].concat(keys)) m.delete(k); },
  };
  return b;
}

async function setup({extra = 0} = {}) {
  const env = {DB: makeDb(), MEDIA: bucket(), BACKUPS: bucket(), BACKUP_READY: '1', CF_ACCOUNT_ID: 'acct-test',
    D1_DATABASE_ID: 'db-test', D1_EXPORT_TOKEN: TOKEN, BACKUP_RECOVERY_PUBLIC_KEY: await b64('spki', recovery.publicKey),
    BACKUP_SIGNING_KEY: await b64('pkcs8', signing.privateKey), BACKUP_SIGNING_KEY_ID: 'sign-test'};
  const db = env.DB.raw;
  db.prepare(`INSERT INTO listings (id, use, title, operation, availability, created_at, updated_at)
    VALUES ('HE-T001', 'residential', 'Test cottage', 'rent', 'to_let', ?, ?)`).run(T0, T0);
  db.prepare(`INSERT INTO media (id, listing_id, r2_key, thumb_key, origin, kind, created_at)
    VALUES ('m1', 'HE-T001', ?, ?, 'upload', 'photo', ?)`).run(PHOTO, THUMB, T0);
  db.prepare(`INSERT INTO listing_documents (id, listing_id, r2_key, bytes, sha256, status, created_at, created_by)
    VALUES ('d1', 'HE-T001', ?, 65, ?, 'stored', ?, 'admin@example.test')`).run(DOC, sha(OBJECTS[DOC]), T0);
  for (const [k, v] of Object.entries(OBJECTS)) {
    await env.MEDIA.put(k, v, {httpMetadata: {contentType: 'image/jpeg'}, customMetadata: {origin: 'test'},
      sha256: k === DOC ? sha(v) : undefined});
  }
  for (let i = 0; i < extra; i++) await env.MEDIA.put(`media/extra/${i}.jpg`, bytes(3, i));
  db.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(RUN, WEEK, POLICY, T0, T0);
  return env;
}

// API de exportación de D1 simulada. s.start/s.poll/s.download sustituyen una respuesta; lengthDelta trunca.
function exportApi(env, s = {}) {
  const signedUrl = `https://export.test/dl/${crypto.randomUUID()}?X-Amz-Signature=${crypto.randomUUID()}`;
  const ok = result => new Response(JSON.stringify({success: true, errors: [], messages: [], result}), {status: 200});
  const state = {calls: [], exporting: false, d1Calls: 0, polls: 0, signedUrl};
  const complete = () => ok({at_bookmark: 'bm-1', status: 'complete', type: 'export',
    result: {filename: 'hampton.sql', signed_url: signedUrl}});
  state.fetch = async (url, init = {}) => {
    url = String(url);
    state.calls.push({url, method: init.method ?? 'GET', auth: new Headers(init.headers).get('authorization'),
      body: init.body ? JSON.parse(init.body) : null});
    if (url === signedUrl) {
      if (s.download) return s.download();
      const sql = state.sql = new TextEncoder().encode(dumpD1(env.DB.raw));
      return new Response(new ReadableStream({pull(c) { c.enqueue(sql); c.close(); state.exporting = false; }}),
        {status: 200, headers: {'content-length': String(sql.length + (s.lengthDelta ?? 0))}});
    }
    assert.equal(url, API);
    if (!JSON.parse(init.body).current_bookmark) {
      state.exporting = true;
      return s.start ? s.start() : ok({at_bookmark: 'bm-1', status: 'active', type: 'export'});
    }
    state.polls++;
    if (s.poll) return s.poll(state.polls, complete);
    return state.polls < 2 ? ok({at_bookmark: 'bm-1', status: 'active', type: 'export'}) : complete();
  };
  return state;
}
const okBody = result => () => new Response(JSON.stringify({success: true, errors: [], result}), {status: 200});

const fakeClock = () => { let t = 0; return {now: () => null, ms: () => t, sleep: async ms => { t += ms; }}; };
const args = (attempt_id = ATTEMPT) => ({run_id: RUN, attempt_id, week_start: WEEK, policy_hash: POLICY});
const runRow = env => ({...env.DB.raw.prepare('SELECT * FROM backup_runs WHERE id = ?').get(RUN)});
const gate = env => ({...env.DB.raw.prepare('SELECT state, epoch FROM backup_write_gate').get()});
const commitOf = env => env.BACKUPS.m.get(`runs/${RUN}/COMMIT.json`);
const insertLate = env => env.DB.raw.prepare(`INSERT INTO listings (id, use, title, operation, availability, created_at,
  updated_at) VALUES ('HE-LATE', 'residential', 'Later', 'sale', 'for_sale', ?, ?)`).run(T0, T0);
function quiet(t) {
  const logs = [];
  for (const m of ['log', 'error', 'warn', 'info']) t.mock.method(console, m, (...a) => logs.push(a.map(String).join(' ')));
  return logs;
}
// Ningún rastro del token ni de la URL firmada en logs, resultados, filas de control ni en el bucket de copias.
function noSecrets(env, api, logs, ...results) {
  const rows = env.DB.raw.prepare('SELECT * FROM backup_runs').all().concat(env.DB.raw.prepare('SELECT * FROM backup_writers').all());
  const bucketText = [...env.BACKUPS.m].map(([k, o]) => k + Buffer.from(o.data).toString('latin1')).join('\n');
  const all = [logs.join('\n'), JSON.stringify(results), JSON.stringify(rows), bucketText].join('\n');
  for (const secret of [TOKEN, api.signedUrl, new URL(api.signedUrl).search.slice(1), 'export.test']) {
    assert.ok(!all.includes(secret), 'secreto filtrado');
  }
}

test('captura → sello → backup-recovery inspect y restore-test sobre lo capturado (extremo a extremo)', async t => {
  const env = await setup({extra: 300}); // 304 entradas: manifiesto e inventario en varias páginas
  const api = exportApi(env), logs = quiet(t);
  t.mock.method(globalThis, 'fetch', api.fetch);
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => { if (api.exporting) api.d1Calls++; return prepare(sql); };
  // Durante la copia, una escritura de la aplicación no entra (compuerta cerrada) y no aparece en la copia.
  let refused = 0;
  env.MEDIA.hooks.get = async () => {
    if (refused) return;
    await assert.rejects(withApplicationWrite(env, {operation_id: 'api:test'}, async () => insertLate(env)), BackupMaintenanceError);
    refused++;
  };

  const cap = await captureBackup(env, args(), fakeClock());
  assert.equal(cap.status, 'captured');
  assert.equal(refused, 1);
  assert.equal(api.d1Calls, 0, 'D1 no se consulta mientras exporta');
  assert.equal(gate(env).state, 'closed', 'la compuerta sigue cerrada hasta el sello');

  // Protocolo de exportación: polling, at_bookmark → current_bookmark, sin token hacia la URL firmada.
  const starts = api.calls.filter(c => c.url === API && !c.body.current_bookmark);
  assert.equal(starts.length, 1);
  assert.deepEqual(starts[0].body, {output_format: 'polling', dump_options: {compatibility: 'd1'}});
  assert.equal(starts[0].method, 'POST');
  assert.equal(starts[0].auth, `Bearer ${TOKEN}`);
  const polls = api.calls.filter(c => c.url === API && c.body.current_bookmark);
  assert.ok(polls.length >= 1);
  for (const p of polls) assert.deepEqual(p.body, {output_format: 'polling', current_bookmark: 'bm-1'});
  const dl = api.calls.filter(c => c.url === api.signedUrl);
  assert.equal(dl.length, 1);
  assert.equal(dl[0].auth, null);

  const cert = await sealBackup(env, {run_id: RUN, epoch: cap.epoch, manifest_key: cap.manifest_key, cipher_hash: cap.cipher_hash});
  assert.equal(cert.cutoff, cap.cutoff);
  assert.equal(cert.manifest_key, cap.manifest_key);
  assert.equal(cert.manifest_cipher_sha256, cap.cipher_hash);
  const row = runRow(env);
  assert.equal(row.status, 'complete');
  assert.equal(row.format, 'HamptonBackupV1');
  assert.equal(row.fence_epoch, cap.epoch);
  assert.equal(row.signing_key_id, 'sign-test');
  assert.equal(row.recovery_key_id, await keyFingerprint(recovery.publicKey));
  for (const f of ['sealed_at', 'cutoff', 'inventory_key', 'inventory_sha256']) assert.ok(row[f], f);
  assert.equal(gate(env).state, 'open');
  await withApplicationWrite(env, {operation_id: 'api:test'}, async () => insertLate(env)); // posterior al sello
  noSecrets(env, api, logs, cap, cert);

  // La copia del bucket a un directorio local y la herramienta de recuperación (CLI, claves por descriptor).
  const root = fresh('bucket');
  for (const [k, o] of env.BACKUPS.m) { mkdirSync(path.dirname(path.join(root, k)), {recursive: true}); writeFileSync(path.join(root, k), o.data); }
  const cli = argv => {
    const fds = [openSync(KEY_FILE, 'r'), openSync(TRUST_FILE, 'r')];
    try { return spawnSync(process.execPath, [SCRIPT, ...argv], {stdio: ['ignore', 'pipe', 'pipe', ...fds], encoding: 'utf8'}); }
    finally { fds.forEach(closeSync); }
  };
  const base = ['--source', root, '--backup', RUN, '--week', WEEK, '--key-fd', '3', '--trust-fd', '4'];
  const inspect = cli(['inspect', ...base]);
  assert.equal(inspect.status, 0, inspect.stderr);
  const report = JSON.parse(inspect.stdout);
  assert.equal(report.status, 'verified');
  assert.equal(report.cutoff, cap.cutoff);
  assert.equal(report.entries, 304);
  assert.deepEqual(report.objects, {count: 303, bytes: 150 + 40 + 65 + 900});
  assert.equal(report.d1.sha256, sha(api.sql));
  assert.equal(report.d1.references_checked, 3);
  assert.equal(report.d1.tables.listings, 1);

  const destination = fresh('restore');
  const restore = cli(['restore-test', ...base, '--destination', destination]);
  assert.equal(restore.status, 0, restore.stderr);
  assert.equal(JSON.parse(restore.stdout).status, 'restored_quarantined');
  const restored = new DatabaseSync(path.join(destination, 'd1.sqlite'));
  assert.deepEqual(restored.prepare('SELECT id FROM listings').all().map(r => r.id), ['HE-T001'], 'sin cambios posteriores');
  assert.equal(restored.prepare('SELECT r2_key FROM media').get().r2_key, PHOTO);
  restored.close();
  for (const [k, v] of Object.entries(OBJECTS)) assert.deepEqual(new Uint8Array(readFileSync(path.join(destination, 'objects', k))), v);
  const index = readFileSync(path.join(destination, 'objects.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(index.find(o => o.key === DOC),
    {key: DOC, size: 65, sha256: sha(OBJECTS[DOC]), content_type: 'image/jpeg', custom_metadata: {origin: 'test'}});
});

test('exportación: cada fallo se clasifica, no repite la exportación, reabre la compuerta y no publica COMMIT', async t => {
  const active = okBody({at_bookmark: 'bm-1', status: 'active'});
  const cases = [
    ['inicio 429', {start: () => new Response('{}', {status: 429})}, 'unknown', 'export_start_uncertain'],
    ['inicio 503', {start: () => new Response('{}', {status: 503})}, 'unknown', 'export_start_uncertain'],
    ['inicio sin respuesta (timeout)', {start: () => { throw new DOMException('timeout', 'TimeoutError'); }}, 'unknown', 'export_start_uncertain'],
    ['inicio 401', {start: () => new Response('{"success":false}', {status: 401})}, 'failed', 'export_rejected'],
    ['inicio sin at_bookmark', {start: okBody({status: 'active'})}, 'unknown', 'export_bookmark_missing'],
    ['bookmark distinto', {poll: okBody({at_bookmark: 'bm-2', status: 'active'})}, 'unknown', 'export_bookmark_mismatch'],
    ['estado error', {poll: okBody({at_bookmark: 'bm-1', status: 'error', error: 'boom'})}, 'failed', 'export_error'],
    ['URL firmada no https', {poll: okBody({at_bookmark: 'bm-1', status: 'complete', result: {signed_url: 'http://x.test/a'}})},
      'failed', 'export_result_invalid'],
    ['URL vencida', {download: () => new Response('expired', {status: 403})}, 'failed', 'export_download_failed'],
    ['descarga truncada', {lengthDelta: 10}, 'failed', 'export_truncated'],
    ['plazo agotado con la exportación activa', {poll: active}, 'unknown', 'export_deadline'],
  ];
  for (const [name, s, status, reason] of cases) {
    const env = await setup(), api = exportApi(env, s), logs = quiet(t);
    t.mock.method(globalThis, 'fetch', api.fetch);
    const r = await captureBackup(env, args(), fakeClock());
    assert.deepEqual(r, {status, reason}, name);
    assert.deepEqual([runRow(env).status, runRow(env).reason_code], [status, reason], name);
    assert.equal(gate(env).state, 'open', name);
    assert.equal(commitOf(env), undefined, name);
    assert.equal(api.calls.filter(c => c.url === API && !c.body.current_bookmark).length, 1, `${name}: una sola exportación`);
    noSecrets(env, api, logs, r);
    t.mock.restoreAll();
  }
  // 429/503 o timeout en el polling no inician otra exportación: se sigue consultando el mismo bookmark.
  const env = await setup();
  const api = exportApi(env, {poll: (n, complete) => n === 1 ? new Response('', {status: 503})
    : n === 2 ? Promise.reject(new DOMException('timeout', 'TimeoutError')) : complete()});
  t.mock.method(globalThis, 'fetch', api.fetch);
  assert.equal((await captureBackup(env, args(), fakeClock())).status, 'captured');
  assert.equal(api.calls.filter(c => c.url === API && !c.body.current_bookmark).length, 1);
});

test('objeto ausente, cambiado o con hash incorrecto, copia guardada corrupta o fuente no cubierta impiden COMMIT', async t => {
  const cases = [
    ['objeto referenciado ausente', env => env.MEDIA.m.delete(THUMB), 'missing_object'],
    ['objeto cambiado durante la copia', env => { env.MEDIA.hooks.get = async k => { if (k === PHOTO) await env.MEDIA.put(PHOTO, bytes(150, 4)); }; }, 'object_changed'],
    ['objeto añadido durante la copia', env => { env.MEDIA.hooks.get = async () => { await env.MEDIA.put('media/new.jpg', bytes(5, 1)); }; }, 'object_changed'],
    ['SHA-256 de origen distinto', env => env.MEDIA.put(DOC, OBJECTS[DOC], {sha256: sha(bytes(65, 1))}), 'object_hash_mismatch'],
    ['registro guardado alterado antes de verificarlo', env => {
      const put = env.BACKUPS.put.bind(env.BACKUPS);
      env.BACKUPS.put = async (k, body, o) => { const r = await put(k, body, o); if (k.endsWith('/1.bin')) env.BACKUPS.m.get(k).data[0] ^= 1; return r; };
    }, 'entry_verify_failed'],
    ['columna de archivo no registrada', env => env.DB.raw.exec('CREATE TABLE extra_files (id INTEGER PRIMARY KEY, blob_key TEXT)'), 'uncovered_source'],
  ];
  for (const [name, mutate, reason] of cases) {
    const env = await setup();
    await mutate(env);
    t.mock.method(globalThis, 'fetch', exportApi(env).fetch);
    quiet(t);
    const r = await captureBackup(env, args(), fakeClock());
    assert.deepEqual(r, {status: 'failed', reason}, name);
    assert.equal(commitOf(env), undefined, name);
    assert.equal(gate(env).state, 'open', name);
    assert.notEqual(runRow(env).status, 'complete', name);
    t.mock.restoreAll();
  }
  // Sin un binding o una clave no se cierra la compuerta ni se toca el run.
  const env = await setup();
  delete env.MEDIA;
  const api = exportApi(env);
  t.mock.method(globalThis, 'fetch', api.fetch);
  assert.deepEqual(await captureBackup(env, args(), fakeClock()), {status: 'failed', reason: 'not_configured'});
  assert.deepEqual(gate(env), {state: 'open', epoch: 0});
  assert.equal(runRow(env).status, 'queued');
  assert.equal(api.calls.length, 0);
  // Apagada (BACKUP_READY distinto de "1"): no hace nada.
  const off = await setup();
  off.BACKUP_READY = '0';
  assert.deepEqual(await captureBackup(off, args(), fakeClock()), {status: 'disabled'});
  assert.deepEqual(gate(off), {state: 'open', epoch: 0});
});

test('drenaje: un permiso abierto agota los 60 s y falla sin exportar; el intento siguiente usa otro attempt_id', async t => {
  const env = await setup(), api = exportApi(env);
  t.mock.method(globalThis, 'fetch', api.fetch);
  quiet(t);
  env.DB.raw.prepare(`INSERT INTO backup_writers (id, epoch, operation, started_at) VALUES (?, 0, 'api:slow', ?)`)
    .run(crypto.randomUUID(), T0);
  assert.deepEqual(await captureBackup(env, args(), fakeClock()), {status: 'failed', reason: 'drain_timeout'});
  assert.equal(api.calls.length, 0);
  assert.equal(gate(env).state, 'open');
  env.DB.raw.exec(`UPDATE backup_writers SET closed_at = '${T0}', close_reason = 'finished'`);
  assert.equal((await captureBackup(env, args(ATTEMPT2), fakeClock())).status, 'captured');
  assert.deepEqual([runRow(env).attempt, runRow(env).attempt_id], [2, ATTEMPT2]);
});

test('sello: CAS rechazado con plazo vencido, escritor tardío o manifiesto distinto; repetido devuelve el mismo certificado', async t => {
  const breakers = [
    ['plazo vencido', env => env.DB.raw.exec(`UPDATE backup_write_gate SET deadline = '2000-01-01T00:00:00.000Z'`), {}],
    ['escritor en el epoch cerrado', (env, cap) => env.DB.raw.prepare(`INSERT INTO backup_writers (id, epoch, operation,
      started_at, closed_at, close_reason) VALUES (?, ?, 'api:late', ?, ?, 'finished')`).run(crypto.randomUUID(), cap.epoch, T0, T0), {}],
    ['manifiesto distinto', () => {}, {cipher_hash: 'b'.repeat(64)}],
    ['epoch antiguo', () => {}, {epoch: 0}],
  ];
  for (const [name, mutate, over] of breakers) {
    const env = await setup();
    t.mock.method(globalThis, 'fetch', exportApi(env).fetch);
    quiet(t);
    const cap = await captureBackup(env, args(), fakeClock());
    await mutate(env, cap);
    await assert.rejects(sealBackup(env, {run_id: RUN, epoch: cap.epoch, manifest_key: cap.manifest_key,
      cipher_hash: cap.cipher_hash, ...over}), /backup_seal_rejected/, name);
    assert.equal(commitOf(env), undefined, name);
    assert.notEqual(runRow(env).status, 'complete', name);
    t.mock.restoreAll();
  }
  const env = await setup();
  t.mock.method(globalThis, 'fetch', exportApi(env).fetch);
  const cap = await captureBackup(env, args(), fakeClock());
  const s = {run_id: RUN, epoch: cap.epoch, manifest_key: cap.manifest_key, cipher_hash: cap.cipher_hash};
  const first = await sealBackup(env, s);
  assert.deepEqual(await sealBackup(env, s), first);
});

test('muerte tras el sello: se concilia con el mismo sello, sin otra exportación; alteración, conflicto o clave rotada no certifican', async t => {
  quiet(t);
  async function sealedButNoCommit() {
    const env = await setup(), api = exportApi(env);
    t.mock.method(globalThis, 'fetch', api.fetch);
    const cap = await captureBackup(env, args(), fakeClock());
    const put = env.BACKUPS.put.bind(env.BACKUPS);
    env.BACKUPS.put = async (k, body, o) => {
      if (!k.endsWith('COMMIT.json')) return put(k, body, o);
      env.BACKUPS.put = put;
      throw new Error('worker killed');
    };
    await assert.rejects(sealBackup(env, {run_id: RUN, epoch: cap.epoch, manifest_key: cap.manifest_key, cipher_hash: cap.cipher_hash}));
    assert.equal(runRow(env).status, 'sealed');
    assert.equal(gate(env).state, 'open');
    return {env, api, cap, fetches: api.calls.length};
  }
  {
    const {env, api, cap, fetches} = await sealedButNoCommit();
    const cert = await certifyBackup(env, RUN);
    assert.equal(cert.cutoff, cap.cutoff);
    assert.equal(runRow(env).status, 'complete');
    assert.equal(api.calls.length, fetches, 'sin otra exportación');
    assert.deepEqual(JSON.parse(Buffer.from(commitOf(env).data)).certificate, cert);
    assert.deepEqual(await certifyBackup(env, RUN), cert, 'mismos bytes canónicos y misma firma');
  }
  { // PUT de COMMIT escrito pero con la respuesta perdida: se lee el publicado y se compara byte a byte.
    const env = await setup();
    t.mock.method(globalThis, 'fetch', exportApi(env).fetch);
    const cap = await captureBackup(env, args(), fakeClock());
    const put = env.BACKUPS.put.bind(env.BACKUPS);
    env.BACKUPS.put = async (k, body, o) => { const r = await put(k, body, o); if (k.endsWith('COMMIT.json')) throw new Error('lost'); return r; };
    const cert = await sealBackup(env, {run_id: RUN, epoch: cap.epoch, manifest_key: cap.manifest_key, cipher_hash: cap.cipher_hash});
    assert.equal(runRow(env).status, 'complete');
    assert.deepEqual(JSON.parse(Buffer.from(commitOf(env).data)).certificate, cert);
  }
  const tamper = [
    ['ciphertext alterado', env => { const k = [...env.BACKUPS.m.keys()].find(k => k.endsWith('/1.bin')); env.BACKUPS.m.get(k).data[3] ^= 1; },
      'inventory_mismatch'],
    ['envelope del manifiesto alterado', (env, cap) => {
      const k = [...env.BACKUPS.m.keys()].find(k => k.endsWith(`${cap.manifest_key}/envelope.json`));
      env.BACKUPS.m.get(k).data = Uint8Array.from([...env.BACKUPS.m.get(k).data, 32]);
    }, 'inventory_mismatch'],
    ['página de inventario ausente', env => {
      for (const k of [...env.BACKUPS.m.keys()].filter(k => k.includes('/inventory/'))) env.BACKUPS.m.delete(k);
    }, 'inventory_mismatch'],
    ['COMMIT distinto ya publicado', env => env.BACKUPS.put(`runs/${RUN}/COMMIT.json`, '{"other":true}'), 'commit_conflict'],
    ['clave de firma rotada', env => { env.BACKUP_SIGNING_KEY_ID = 'sign-2'; }, 'signing_key_unavailable'],
  ];
  for (const [name, mutate, reason] of tamper) {
    const {env, cap} = await sealedButNoCommit();
    const before = commitOf(env);
    await mutate(env, cap);
    await assert.rejects(certifyBackup(env, RUN), new RegExp(`backup_${reason}`), name);
    assert.deepEqual([runRow(env).status, runRow(env).reason_code], ['unknown', reason], name);
    if (reason !== 'commit_conflict') assert.equal(commitOf(env), before, `${name}: sin COMMIT`);
  }
});

test('conservación: un fallo no borra nada; tras una copia completa se purgan las que pasan de 12 salvo recovery_hold', async t => {
  quiet(t);
  const env = await setup();
  const old = Array.from({length: 13}, (_, i) => ({id: crypto.randomUUID(),
    week: new Date(Date.parse(WEEK) - (i + 1) * 7 * 86_400_000).toISOString()}));
  for (const [i, o] of old.entries()) {
    env.DB.raw.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, status, recovery_hold, created_at, updated_at)
      VALUES (?, ?, ?, 'complete', ?, ?, ?)`).run(o.id, o.week, POLICY, i === 12 ? 1 : 0, T0, T0);
    await env.BACKUPS.put(`runs/${o.id}/COMMIT.json`, '{}');
    for (let j = 0; j < 3; j++) await env.BACKUPS.put(`runs/${o.id}/a/b/${j}.bin`, 'x');
  }
  const keysOf = id => [...env.BACKUPS.m.keys()].filter(k => k.startsWith(`runs/${id}/`));
  const total = env.BACKUPS.m.size;

  env.MEDIA.m.delete(THUMB); // primer intento falla
  t.mock.method(globalThis, 'fetch', exportApi(env).fetch);
  assert.equal((await captureBackup(env, args(), fakeClock())).reason, 'missing_object');
  assert.ok(env.BACKUPS.m.size >= total);
  for (const o of old) assert.equal(keysOf(o.id).length, 4, 'ninguna copia anterior borrada tras el fallo');

  await env.MEDIA.put(THUMB, OBJECTS[THUMB]);
  const cap = await captureBackup(env, args(ATTEMPT2), fakeClock());
  await sealBackup(env, {run_id: RUN, epoch: cap.epoch, manifest_key: cap.manifest_key, cipher_hash: cap.cipher_hash});
  const status = id => env.DB.raw.prepare('SELECT status FROM backup_runs WHERE id = ?').get(id).status;
  for (const o of old.slice(0, 11)) { assert.equal(status(o.id), 'complete'); assert.equal(keysOf(o.id).length, 4); }
  assert.equal(status(old[11].id), 'purged');
  assert.deepEqual(keysOf(old[11].id), []);
  assert.equal(status(old[12].id), 'complete', 'recovery_hold se respeta');
  assert.equal(keysOf(old[12].id).length, 4);
  assert.ok(keysOf(RUN).length > 0, 'los parciales del intento fallido no se purgan aquí');
});
