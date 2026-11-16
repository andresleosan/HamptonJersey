// PRE-14 · Task 6: inspección y restore-test aislado, solo con datos y claves sintéticos (D1 en node:sqlite,
// «bucket» en un directorio temporal). Nada toca producción.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto as crypto, createHash} from 'node:crypto';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync, openSync, rmSync,
} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {encryptBackupEntry, signBackupCertificate, keyFingerprint} from '../../server/backup-crypto.js';
import {recoveryInspect, restoreTest, dirSource, commitKey, parseArgs} from '../../scripts/backup-recovery.mjs';
import {makeDb, T0} from './helpers.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/backup-recovery.mjs', import.meta.url));
const REPO = path.resolve(path.dirname(SCRIPT), '..');
const RUN = '11111111-1111-4111-8111-111111111111';
const ATTEMPT = '22222222-2222-4222-8222-222222222222';
const WEEK = '2026-11-15T02:00:00.000Z';
const CHUNK = 64;

const rsa = () => crypto.subtle.generateKey(
  {name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'},
  true, ['wrapKey', 'unwrapKey']);
const recovery = await rsa();
const otherRecovery = await rsa();
const signing = await crypto.subtle.generateKey({name: 'Ed25519'}, true, ['sign', 'verify']);
const rogue = await crypto.subtle.generateKey({name: 'Ed25519'}, true, ['sign', 'verify']);

const tmp = mkdtempSync(path.join(os.tmpdir(), 'pre14-recovery-test-'));
test.after(() => rmSync(tmp, {recursive: true, force: true}));
let n = 0;
const fresh = name => path.join(tmp, `${name}-${n++}`);

const pem = async key => {
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', key)).toString('base64');
  return `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
};
const KEY_FILE = path.join(tmp, 'recovery.pem'), OTHER_KEY_FILE = path.join(tmp, 'other.pem');
const TRUST_FILE = path.join(tmp, 'trust.json');
writeFileSync(KEY_FILE, await pem(recovery.privateKey), {mode: 0o600});
writeFileSync(OTHER_KEY_FILE, await pem(otherRecovery.privateKey), {mode: 0o600});
const rawSigning = Buffer.from(await crypto.subtle.exportKey('raw', signing.publicKey)).toString('base64');
writeFileSync(TRUST_FILE, JSON.stringify({keys: {'sign-test': rawSigning}}), {mode: 0o600});
const RECOVERY_ID = await keyFingerprint(recovery.publicKey);

// --- D1 sintética con el esquema real (todas las migraciones) y su volcado SQL ---
const PHOTO = 'listings/HE-T001/photo-1.jpg', DOC = 'private-docs/HE-T001/plan.pdf';
const bytes = (len, seed) => Uint8Array.from({length: len}, (_, i) => (i * 31 + seed) & 255);
const OBJECTS = {[PHOTO]: bytes(150, 3), [DOC]: bytes(65, 9)};
const sha = b => createHash('sha256').update(b).digest('hex');

function sourceDb({orphan = false} = {}) {
  const db = makeDb().raw;
  db.prepare(`INSERT INTO listings (id, use, title, operation, availability, created_at, updated_at)
    VALUES ('HE-T001', 'residential', 'Test cottage', 'rent', 'to_let', ?, ?)`).run(T0, T0);
  if (orphan) db.exec('PRAGMA foreign_keys = OFF');
  db.prepare(`INSERT INTO media (id, listing_id, r2_key, origin, kind, created_at)
    VALUES ('m1', ?, ?, 'upload', 'photo', ?)`).run(orphan ? 'HE-NONE' : 'HE-T001', PHOTO, T0);
  db.prepare(`INSERT INTO listing_documents (id, listing_id, r2_key, bytes, sha256, status, created_at, created_by)
    VALUES ('d1', 'HE-T001', ?, 65, ?, 'stored', ?, 'admin@example.test')`).run(DOC, sha(OBJECTS[DOC]), T0);
  return db;
}

const lit = v => v === null ? 'NULL' : typeof v === 'number' || typeof v === 'bigint' ? String(v)
  : v instanceof Uint8Array ? `X'${Buffer.from(v).toString('hex')}'` : `'${String(v).replaceAll("'", "''")}'`;
// Volcado al estilo de la exportación de D1: tablas, filas y después índices, vistas y triggers.
function dump(db) {
  const objs = db.prepare(`SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL
    AND name NOT LIKE 'sqlite_%' ORDER BY rowid`).all();
  const out = ['PRAGMA defer_foreign_keys=TRUE;'];
  for (const t of objs.filter(o => o.type === 'table')) {
    out.push(`${t.sql};`);
    const cols = db.prepare(`SELECT name FROM pragma_table_info('${t.name}')`).all().map(c => `"${c.name}"`);
    for (const r of db.prepare(`SELECT ${cols.join(', ')} FROM "${t.name}"`).all()) {
      out.push(`INSERT INTO "${t.name}" (${cols.join(', ')}) VALUES (${Object.values(r).map(lit).join(', ')});`);
    }
  }
  for (const o of objs.filter(o => o.type !== 'table')) out.push(`${o.sql};`);
  return out.join('\n');
}

// --- «bucket» local con la disposición que escribirá la captura (Task 3) ---
function dirSink(root) {
  return {
    async put(key, value) {
      mkdirSync(path.dirname(path.join(root, key)), {recursive: true});
      writeFileSync(path.join(root, key), value);
    },
  };
}
async function* chunks(b, size = 23) { for (let i = 0; i < b.length; i += size) yield b.slice(i, i + size); }
const encode = o => new TextEncoder().encode(JSON.stringify(o));

async function buildBackup(o = {}) {
  const db = o.db ?? sourceDb(o);
  const sql = new TextEncoder().encode(dump(db) + (o.sqlExtra ?? ''));
  const root = fresh('bucket');
  const sink = dirSink(root);
  const publicKey = o.publicKey ?? recovery.publicKey;
  const entry = async (source, metadata, chunkBytes = CHUNK) => (await encryptBackupEntry({run_id: RUN, attempt_id: ATTEMPT,
    entry_id: crypto.randomUUID(), source, metadata, publicKey, chunkBytes}, sink)).receipt;

  // El volcado con el esquema completo ocupa cientos de KiB: chunks de 64 KiB para no crear miles de archivos.
  const entries = [{kind: 'd1', receipt: await entry(chunks(sql, 4096), {kind: 'd1', size: sql.length, sha256: sha(sql)}, 65536)}];
  for (const [key, data] of Object.entries(o.objects ?? OBJECTS)) {
    entries.push({kind: 'r2', receipt: await entry(chunks(data),
      {kind: 'r2', key, size: data.length, sha256: sha(data), content_type: 'application/octet-stream', custom_metadata: {}})});
  }
  const pages = [];
  for (let i = 0; i < entries.length; i += 2) {
    const page = encode({kind: 'manifest_page', entries: entries.slice(i, i + 2)});
    pages.push(await entry(chunks(page), {kind: 'manifest_page'}));
  }
  const rootDoc = encode({kind: 'manifest_root', run_id: RUN, attempt_id: ATTEMPT,
    entry_count: o.entryCount ?? entries.length, pages,
    references: [{table: 'media', column: 'r2_key'}, {table: 'media', column: 'thumb_key'},
      {table: 'listing_documents', column: 'r2_key'}]});
  const manifest = await entry(chunks(rootDoc), {kind: 'manifest_root'});
  const certificate = await signBackupCertificate({
    run_id: RUN, attempt_id: ATTEMPT, week_start: WEEK, cutoff: '2026-11-15T02:03:10.000Z', policy_hash: 'a'.repeat(64),
    manifest_key: manifest.entry_id, manifest_cipher_sha256: manifest.cipher_hash, signing_key_id: 'sign-test',
    recovery_key_id: RECOVERY_ID}, o.signingKey ?? signing.privateKey);
  await sink.put(commitKey(RUN), encode({certificate, manifest_receipt: manifest}));
  return {root, db, sql, entries, manifest};
}

const fd = file => openSync(file, 'r');
const opts = (source, extra = {}) => ({source, backup_id: RUN, week_start: WEEK, keyFD: fd(KEY_FILE),
  trustFD: fd(TRUST_FILE), stagingParent: extra.stagingParent ?? mkStaging(), ...extra});
const mkStaging = () => { const d = fresh('staging'); mkdirSync(d); return d; };
const recordPath = (root, receipt, i) => path.join(root, `runs/${RUN}/${ATTEMPT}/${receipt.entry_id}/${i}.bin`);
const rows = (db, sql) => db.prepare(sql).all().map(r => ({...r}));

test('inspect verifica firma, manifiesto, filas, FK, referencias y objetos sin escribir destino', async () => {
  const b = await buildBackup();
  const stagingParent = mkStaging();
  const report = await recoveryInspect(opts(b.root, {stagingParent}));
  assert.equal(report.status, 'verified');
  assert.equal(report.backup_id, RUN);
  assert.equal(report.recovery_key_id, RECOVERY_ID);
  assert.equal(report.entries, 3);
  assert.deepEqual(report.objects, {count: 2, bytes: 215});
  assert.equal(report.d1.sha256, sha(b.sql));
  assert.equal(report.d1.foreign_key_violations, 0);
  assert.equal(report.d1.references_checked, 3);
  assert.equal(report.d1.tables.listings, 1);
  assert.equal(report.d1.tables.media, 1);
  assert.equal(report.d1.tables.admins, 2);
  assert.doesNotMatch(JSON.stringify(report), /HE-T001|private-docs|photo|PRIVATE/);
  assert.deepEqual(readdirSync(stagingParent), [], 'staging eliminado al terminar');
});

test('restore-test devuelve la copia (no los cambios posteriores) en cuarentena, con 0700/0600', async () => {
  const b = await buildBackup();
  b.db.prepare(`INSERT INTO listings (id, use, title, operation, availability, created_at, updated_at)
    VALUES ('HE-T002', 'residential', 'Later', 'sale', 'for_sale', ?, ?)`).run(T0, T0); // posterior a la copia
  const destination = fresh('dest');
  const report = await restoreTest(opts(b.root, {destination}));
  assert.equal(report.status, 'restored_quarantined');
  assert.equal(report.quarantine.reactivation, 'blocked');
  assert.ok(report.quarantine.reasons.includes('survivor_registry_missing'));
  assert.equal(statSync(destination).mode & 0o777, 0o700);
  assert.equal(existsSync(path.join(destination, 'INCOMPLETE')), false);
  const q = JSON.parse(readFileSync(path.join(destination, 'QUARANTINE.json'), 'utf8'));
  assert.deepEqual([q.reactivation, q.cron, q.outbound_messages, q.models], ['blocked', false, false, false]);

  const restored = new DatabaseSync(path.join(destination, 'd1.sqlite'));
  assert.equal(statSync(path.join(destination, 'd1.sqlite')).mode & 0o777, 0o600);
  assert.deepEqual(rows(restored, 'SELECT id, title FROM listings'), [{id: 'HE-T001', title: 'Test cottage'}]);
  assert.deepEqual(rows(restored, 'SELECT id, listing_id, r2_key FROM media'), [{id: 'm1', listing_id: 'HE-T001', r2_key: PHOTO}]);
  assert.deepEqual(rows(restored, 'PRAGMA foreign_key_check'), []);
  for (const t of ['admins', 'listing_documents', 'media']) {
    assert.deepEqual(rows(restored, `SELECT * FROM ${t}`), rows(b.db, `SELECT * FROM ${t}`), t);
  }
  restored.close();
  for (const [key, data] of Object.entries(OBJECTS)) {
    assert.deepEqual(new Uint8Array(readFileSync(path.join(destination, 'objects', key))), data);
    assert.equal(statSync(path.join(destination, 'objects', key)).mode & 0o777, 0o600);
  }
  const index = readFileSync(path.join(destination, 'objects.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(index.map(i => [i.key, i.size, i.sha256]).sort(),
    Object.entries(OBJECTS).map(([k, d]) => [k, d.length, sha(d)]).sort());
});

// Cada caso falla con su razón, no crea el destino y no deja temporales.
async function rejects(b, reason, extra = {}) {
  const destination = fresh('dest'), stagingParent = mkStaging();
  await assert.rejects(restoreTest(opts(b.root ?? b, {destination, stagingParent, ...extra})),
    {message: `backup_${reason}`}, reason);
  assert.equal(existsSync(destination), false, `${reason}: destino sin escribir`);
  assert.deepEqual(readdirSync(stagingParent), [], `${reason}: staging limpio`);
}

test('clave de recuperación errónea o copia cifrada para otra clave fallan sin escribir destino', async () => {
  const b = await buildBackup();
  await rejects(b, 'wrong_recovery_key', {keyFD: fd(OTHER_KEY_FILE)});
  await rejects(await buildBackup({publicKey: otherRecovery.publicKey}), 'decrypt_failed');
});

test('firma ajena, semana o copia distintas y COMMIT ausente fallan antes de descifrar', async () => {
  await rejects(await buildBackup({signingKey: rogue.privateKey}), 'bad_signature');
  const b = await buildBackup();
  await rejects(b, 'unexpected_backup', {week_start: '2026-11-22T02:00:00.000Z'});
  await rejects(b, 'commit_missing', {backup_id: '99999999-9999-4999-8999-999999999999'});
});

test('manifiesto truncado o que no cuadra con lo firmado falla', async () => {
  const b = await buildBackup();
  const last = recordPath(b.root, b.manifest, b.manifest.chunks);
  writeFileSync(last, readFileSync(last).subarray(0, -1));
  await rejects(b, 'decrypt_failed');

  const c = await buildBackup();
  const commitFile = path.join(c.root, commitKey(RUN));
  const commit = JSON.parse(readFileSync(commitFile, 'utf8'));
  commit.manifest_receipt.cipher_hash = 'f'.repeat(64);
  writeFileSync(commitFile, JSON.stringify(commit));
  await rejects(c, 'manifest_not_certified');

  await rejects(await buildBackup({entryCount: 4}), 'manifest_count_mismatch');
});

test('último objeto corrupto, truncado o ausente deja el destino intacto', async () => {
  for (const [mutate, reason] of [
    [f => { const b = readFileSync(f); b[b.length - 1] ^= 1; writeFileSync(f, b); }, 'decrypt_failed'],
    [f => writeFileSync(f, readFileSync(f).subarray(0, -1)), 'decrypt_failed'],
    [f => rmSync(f), 'record_missing'],
  ]) {
    const b = await buildBackup();
    const lastEntry = b.entries.at(-1).receipt;
    mutate(recordPath(b.root, lastEntry, lastEntry.chunks));
    await rejects(b, reason);
  }
});

test('ruta de escape, referencia sin objeto, FK rota o SQL que adjunta archivos fallan antes de escribir', async () => {
  await rejects(await buildBackup({objects: {...OBJECTS, '../../escape.txt': bytes(4, 1)}}), 'unsafe_object_key');
  await rejects(await buildBackup({objects: {[DOC]: OBJECTS[DOC]}}), 'missing_object');
  await rejects(await buildBackup({orphan: true}), 'foreign_key_violation');
  const attached = path.join(tmp, 'attached.sqlite');
  await rejects(await buildBackup({sqlExtra: `\nATTACH DATABASE '${attached}' AS x;`}), 'sql_import_failed');
  assert.equal(existsSync(path.join(tmp, 'escape.txt')), false);
  assert.equal(existsSync(attached), false);
});

test('destino de producción, existente, relativo o dentro del repositorio se rechaza sin leer la copia', async () => {
  let reads = 0;
  const source = {async get() { reads++; return null; }};
  const existing = fresh('exists'); mkdirSync(existing);
  const checkout = fresh('other-checkout'); mkdirSync(path.join(checkout, '.git'), {recursive: true});
  mkdirSync(path.join(checkout, 'sub'));
  for (const [destination, reason] of [
    [path.join(tmp, 'hampton-media'), 'production_destination'],
    [path.join(tmp, '1da41b63-c61f-4491-9f8d-3a9afde6e0fb'), 'production_destination'],
    [path.join(REPO, 'restore-dest'), 'destination_in_repo'],
    [existing, 'destination_exists'],
    [path.join(checkout, 'restore-x'), 'destination_in_repo'],
    [path.join(checkout, 'sub', 'restore-x'), 'destination_in_repo'],
    ['relative/dir', 'invalid_destination'],
    ['d1://hampton', 'invalid_destination'],
  ]) {
    await assert.rejects(restoreTest(opts(source, {destination})), {message: `backup_${reason}`}, reason);
  }
  assert.equal(reads, 0);
  assert.equal(existsSync(path.join(REPO, 'restore-dest')), false);
});

test('la importación usa los bytes fijados: cambiar el origen tras leerlo no altera la restauración', async () => {
  const b = await buildBackup();
  const base = dirSource(b.root), seen = new Map();
  const stagingParent = mkStaging();
  let checkedModes = false;
  const source = {
    async get(key) {
      seen.set(key, (seen.get(key) ?? 0) + 1);
      const v = await base.get(key);
      // Tras la primera lectura el atacante sustituye el objeto en el bucket.
      if (v) writeFileSync(path.join(b.root, key), Buffer.alloc(v.length, 0));
      const [dir] = readdirSync(stagingParent);
      if (dir) {
        assert.equal(statSync(path.join(stagingParent, dir)).mode & 0o777, 0o700);
        for (const f of readdirSync(path.join(stagingParent, dir))) {
          assert.equal(statSync(path.join(stagingParent, dir, f)).mode & 0o777, 0o600, f);
          checkedModes = true;
        }
      }
      return v;
    },
  };
  const destination = fresh('dest');
  const report = await restoreTest(opts(source, {destination, stagingParent}));
  assert.equal(report.status, 'restored_quarantined');
  assert.ok(checkedModes);
  assert.ok([...seen.values()].every(c => c === 1), 'cada clave se lee una sola vez del origen');
  assert.deepEqual(new Uint8Array(readFileSync(path.join(destination, 'objects', PHOTO))), OBJECTS[PHOTO]);
  assert.deepEqual(readdirSync(stagingParent), []);
});

test('CLI: claves solo por descriptor, stdout sin secretos ni claves de objetos, errores con razón C0', async () => {
  const b = await buildBackup();
  const run = (args, stdio = ['ignore', 'pipe', 'pipe', fd(KEY_FILE), fd(TRUST_FILE)]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], {stdio, encoding: 'utf8'});
  const base = ['--source', b.root, '--backup', RUN, '--week', WEEK, '--key-fd', '3', '--trust-fd', '4'];
  const ok = run(['inspect', ...base]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).status, 'verified');
  const pemBody = readFileSync(KEY_FILE, 'utf8').split('\n')[1];
  for (const out of [ok.stdout, ok.stderr]) assert.doesNotMatch(out, new RegExp(`PRIVATE|${pemBody.slice(0, 20)}|HE-T001|private-docs`));

  const bad = run(['inspect', ...base.slice(0, 6), '--week', '2026-11-22T02:00:00.000Z', '--key-fd', '3', '--trust-fd', '4']);
  assert.equal(bad.status, 1);
  assert.deepEqual(JSON.parse(bad.stderr), {status: 'failed', reason: 'backup_usage'});
  assert.throws(() => parseArgs(['inspect', ...base, '--key', 'secreto']), /backup_usage/);
  assert.throws(() => parseArgs(['restore-production', ...base]), /backup_usage/);
  assert.throws(() => parseArgs(['restore-test', ...base]), /backup_usage/);
  const wrongWeek = run(['inspect', ...base.map(a => a === WEEK ? '2026-11-22T02:00:00.000Z' : a)]);
  assert.equal(wrongWeek.status, 1);
  assert.deepEqual(JSON.parse(wrongWeek.stderr), {status: 'failed', reason: 'backup_unexpected_backup'});
});

test('SIGTERM o Ctrl-C durante la verificación borran el staging antes de salir', async () => {
  for (const [signal, code] of [['SIGTERM', 143], ['SIGINT', 130]]) {
    const stagingParent = mkStaging();
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import {openSync} from 'node:fs';
      import {recoveryInspect} from ${JSON.stringify(new URL('../../scripts/backup-recovery.mjs', import.meta.url).href)};
      await recoveryInspect({backup_id: ${JSON.stringify(RUN)}, week_start: ${JSON.stringify(WEEK)},
        keyFD: openSync(${JSON.stringify(KEY_FILE)}, 'r'), trustFD: openSync(${JSON.stringify(TRUST_FILE)}, 'r'),
        stagingParent: ${JSON.stringify(stagingParent)},
        source: {get: () => { setInterval(() => {}, 1000); console.log('ready'); return new Promise(() => {}); }}});
    `], {stdio: ['ignore', 'pipe', 'inherit']});
    await new Promise(resolve => child.stdout.on('data', d => { if (String(d).includes('ready')) resolve(); }));
    assert.equal(readdirSync(stagingParent).length, 1, 'staging creado');
    const exited = new Promise(resolve => child.on('exit', c => resolve(c)));
    child.kill(signal);
    assert.equal(await exited, code, signal);
    assert.deepEqual(readdirSync(stagingParent), [], `${signal}: staging borrado`);
  }
});
