#!/usr/bin/env node
// PRE-14 · Task 6: inspección y ensayo de restauración aislada de una copia HamptonBackupV1
// (plan 2026-11-09-tp01-pre-14-plan.md, complemento de tanda 8 §5). Nunca toca producción: lee una copia
// local del bucket (directorio) y, en restore-test, escribe solo en un directorio NUEVO fuera del repositorio.
//
//   node scripts/backup-recovery.mjs inspect      --source <dir> --backup <runUUID> --week <ISO> --key-fd 3 --trust-fd 4
//   node scripts/backup-recovery.mjs restore-test --source <dir> --backup <runUUID> --week <ISO> --key-fd 3 --trust-fd 4 \
//        --destination <dir nuevo>
//
// key-fd: clave privada de recuperación (PEM PKCS8, RSA-OAEP-3072). trust-fd: trust bundle externo
// {"keys":{"<signing_key_id>":"<Ed25519 pública raw en base64>"}}. Ninguna clave pasa por argv ni sale por stdout.
// Disposición en el bucket (la escribe la captura, Task 3):
//   runs/<run>/COMMIT.json = {certificate (firmado), manifest_receipt}; manifest_key = entry_id de la raíz y
//   manifest_cipher_sha256 = su cipher_hash. Raíz = {kind:'manifest_root', run_id, attempt_id, entry_count,
//   references:[{table,column}], pages:[recibo]}; página = {kind:'manifest_page', entries:[{kind:'d1'|'r2', receipt}]}.
//   Metadatos cifrados de cada entrada: d1 {kind, size, sha256}; r2 {kind, key, size, sha256, content_type, custom_metadata}.
import {
  readFileSync, writeFileSync, openSync, closeSync, fstatSync, writeSync, mkdtempSync, mkdirSync, rmSync, chmodSync,
  copyFileSync, lstatSync, realpathSync, renameSync, unlinkSync, constants as C,
} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync, constants as SQL} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readBackupEntry, verifyBackupCommit, keyFingerprint} from '../server/backup-crypto.js';

const subtle = globalThis.crypto.subtle;
const REPO = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const SAFE_KEY = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const td = new TextDecoder();

const fail = reason => { throw new Error(`backup_${reason}`); };
export const commitKey = run => `runs/${run}/COMMIT.json`;
const safeKey = k => typeof k === 'string' && SAFE_KEY.test(k) && !k.split('/').some(s => s === '.' || s === '..');
const json = bytes => { try { return JSON.parse(td.decode(bytes)); } catch { return fail('invalid_json'); } };
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);

// --- claves por descriptor de archivo ---
function readFD(fd) {
  if (!Number.isInteger(fd) || fd < 3) fail('invalid_fd');
  try { return readFileSync(fd); } finally { closeSync(fd); }
}

async function readRecoveryKey(fd) {
  const pem = readFD(fd);
  const b64 = td.decode(pem).replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, '');
  pem.fill(0);
  let privateKey;
  try {
    privateKey = await subtle.importKey('pkcs8', Buffer.from(b64, 'base64'), {name: 'RSA-OAEP', hash: 'SHA-256'},
      true, ['unwrapKey']);
  } catch { fail('invalid_recovery_key'); }
  if (privateKey.algorithm.modulusLength !== 3072) fail('invalid_recovery_key');
  const {n, e} = await subtle.exportKey('jwk', privateKey);
  const pub = await subtle.importKey('jwk', {kty: 'RSA', n, e, alg: 'RSA-OAEP-256', ext: true},
    {name: 'RSA-OAEP', hash: 'SHA-256'}, true, ['wrapKey']);
  return {privateKey, fingerprint: await keyFingerprint(pub)};
}

async function readTrust(fd) {
  const bundle = json(readFD(fd));
  const out = {};
  for (const [id, raw] of Object.entries(bundle?.keys || {})) {
    try { out[id] = await subtle.importKey('raw', Buffer.from(raw, 'base64'), {name: 'Ed25519'}, false, ['verify']); }
    catch { fail('invalid_trust_bundle'); }
  }
  if (!Object.keys(out).length) fail('invalid_trust_bundle');
  return out;
}

// --- origen (copia local del bucket) y staging fijado ---
function readRegular(file) {
  let fd;
  try { fd = openSync(file, C.O_RDONLY | C.O_NOFOLLOW); } catch (e) { if (e.code === 'ENOENT') return null; fail('unreadable_object'); }
  try {
    if (!fstatSync(fd).isFile()) fail('not_regular_file');
    return readFileSync(fd);
  } finally { closeSync(fd); }
}

export function dirSource(root) {
  const base = realpathSync(root);
  return {
    async get(key) {
      if (!safeKey(key)) fail('unsafe_source_key');
      const file = path.join(base, key);
      let dir;
      try { dir = realpathSync(path.dirname(file)); } catch { return null; }
      if (!inside(dir, base)) fail('unsafe_source_key');
      return readRegular(file);
    },
  };
}

// Cada objeto se lee UNA vez del origen, se fija en staging (0600, sin seguir symlinks) y todo lo demás,
// verificación e importación, lee esa copia. Tras seal() no se admiten lecturas nuevas del origen.
function pinningStore(source, dir) {
  const staged = new Map();
  let sealed = false;
  return {
    async get(key) {
      if (staged.has(key)) return staged.get(key) && readRegular(staged.get(key));
      if (sealed) fail('unstaged_read');
      const bytes = await source.get(key);
      if (!bytes) { staged.set(key, null); return null; }
      const file = path.join(dir, `${staged.size.toString(16)}.bin`);
      writeFileSync(file, bytes, {mode: 0o600, flag: 'wx'});
      staged.set(key, file);
      return readRegular(file);
    },
    seal() { sealed = true; },
  };
}

// --- verificación completa antes de cualquier escritura al destino ---
async function* manifestEntries(store, privateKey, receipt, cert) {
  const read = async (r, kind) => {
    if (r?.run_id !== cert.run_id || r.attempt_id !== cert.attempt_id) fail('foreign_entry');
    const parts = [];
    const {metadata} = await readBackupEntry(r, {privateKey}, store, c => parts.push(c));
    const doc = json(Buffer.concat(parts));
    if (metadata?.kind !== kind || doc?.kind !== kind) fail('invalid_manifest');
    return doc;
  };
  const root = await read(receipt, 'manifest_root');
  if (!Array.isArray(root.pages) || !Number.isInteger(root.entry_count) || !Array.isArray(root.references)) {
    fail('invalid_manifest');
  }
  yield {root};
  for (const pageReceipt of root.pages) {
    const page = await read(pageReceipt, 'manifest_page');
    if (!Array.isArray(page.entries)) fail('invalid_manifest');
    for (const e of page.entries) {
      if (e?.receipt?.run_id !== cert.run_id || e.receipt.attempt_id !== cert.attempt_id) fail('foreign_entry');
      yield e;
    }
  }
}

async function verifyCopy(store, staging, {backup_id, week_start, privateKey, fingerprint, trustedSigningKeys}) {
  const commitBytes = await store.get(commitKey(backup_id));
  if (!commitBytes) fail('commit_missing');
  const commit = json(commitBytes);
  const cert = await verifyBackupCommit(commit.certificate,
    {trustedSigningKeys, expectedBackupId: backup_id, expectedWeek: week_start});
  if (cert.recovery_key_id !== fingerprint) fail('wrong_recovery_key');
  const mr = commit.manifest_receipt;
  if (mr?.run_id !== cert.run_id || mr.attempt_id !== cert.attempt_id || mr.entry_id !== cert.manifest_key
    || mr.cipher_hash !== cert.manifest_cipher_sha256) fail('manifest_not_certified');

  const sqlFile = path.join(staging, 'restore.sql');
  let root, d1 = null, entries = 0, objectBytes = 0;
  const ids = new Set(), objectKeys = new Set();
  for await (const e of manifestEntries(store, privateKey, mr, cert)) {
    if (e.root) { root = e.root; continue; }
    if (ids.has(e.receipt.entry_id)) fail('duplicate_entry');
    ids.add(e.receipt.entry_id);
    entries++;
    const hash = createHash('sha256');
    let fd = null;
    if (e.kind === 'd1') {
      if (d1) fail('duplicate_d1_entry');
      fd = openSync(sqlFile, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW, 0o600);
    } else if (e.kind !== 'r2') fail('unknown_entry_kind');
    let meta;
    try {
      ({metadata: meta} = await readBackupEntry(e.receipt, {privateKey}, store, c => {
        hash.update(c);
        if (fd !== null) writeSync(fd, c);
      }));
    } finally { if (fd !== null) closeSync(fd); }
    const sha256 = hash.digest('hex');
    if (meta?.kind !== e.kind || meta.size !== e.receipt.size || meta.sha256 !== sha256) fail('entry_metadata_mismatch');
    if (e.kind === 'd1') { d1 = {sha256, size: meta.size}; continue; }
    if (!safeKey(meta.key)) fail('unsafe_object_key');
    if (objectKeys.has(meta.key)) fail('duplicate_object_key');
    objectKeys.add(meta.key);
    objectBytes += meta.size;
  }
  if (entries !== root.entry_count) fail('manifest_count_mismatch');
  if (!d1) fail('d1_entry_missing');

  // SQL en una base SQLite de staging (sin FK durante la carga) para comprobar FK y referencias D1→objetos.
  const dbFile = path.join(staging, 'd1.sqlite');
  const db = new DatabaseSync(dbFile, {enableForeignKeyConstraints: false});
  const tables = {};
  try {
    db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF'); // staging desechable: sin fsync por sentencia
    db.setAuthorizer(action => (action === SQL.SQLITE_ATTACH ? SQL.SQLITE_DENY : SQL.SQLITE_OK)); // el SQL no crea archivos
    try { db.exec(readFileSync(sqlFile, 'utf8')); } catch { fail('sql_import_failed'); }
    if (db.prepare('PRAGMA foreign_key_check').all().length) fail('foreign_key_violation');
    for (const ref of root.references) {
      if (!IDENT.test(ref?.table ?? '') || !IDENT.test(ref?.column ?? '')) fail('invalid_manifest');
      let found;
      try {
        found = db.prepare(`SELECT DISTINCT "${ref.column}" AS k FROM "${ref.table}" WHERE "${ref.column}" IS NOT NULL`).all();
      } catch { fail('reference_not_in_schema'); }
      if (found.some(r => !objectKeys.has(r.k))) fail('missing_object');
    }
    for (const {name} of db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'
      AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name`).all()) {
      tables[name] = Number(db.prepare(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n);
    }
  } finally { db.close(); }
  chmodSync(dbFile, 0o600);
  unlinkSync(sqlFile);

  return {
    report: {
      status: 'verified', backup_id: cert.run_id, attempt_id: cert.attempt_id, week_start: cert.week_start,
      cutoff: cert.cutoff, signing_key_id: cert.signing_key_id, recovery_key_id: cert.recovery_key_id,
      manifest_cipher_sha256: cert.manifest_cipher_sha256, entries,
      d1: {...d1, tables, foreign_key_violations: 0, references_checked: root.references.length},
      objects: {count: objectKeys.size, bytes: objectBytes},
    },
    cert, mr, dbFile,
  };
}

// --- destino desechable ---
function productionIds() {
  const ids = new Set();
  for (const f of ['wrangler.toml', 'jobs/wrangler.toml']) {
    let text = '';
    try { text = readFileSync(path.join(REPO, f), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/^\s*(?:name|database_name|database_id|bucket_name)\s*=\s*"([^"]+)"/gm)) {
      ids.add(m[1].toLowerCase());
    }
  }
  return ids;
}

export function checkDestination(destination) {
  if (typeof destination !== 'string' || !path.isAbsolute(destination) || destination.includes('://')) {
    fail('invalid_destination');
  }
  const dest = path.resolve(destination);
  let parent;
  try { parent = realpathSync(path.dirname(dest)); } catch { fail('invalid_destination'); }
  const real = path.join(parent, path.basename(dest));
  if (inside(real, REPO)) fail('destination_in_repo');
  const ids = productionIds();
  if (real.split(path.sep).some(s => ids.has(s.toLowerCase()))) fail('production_destination');
  try { lstatSync(real); fail('destination_exists'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return real;
}

function openStaging(stagingParent = os.tmpdir()) {
  const dir = mkdtempSync(path.join(realpathSync(stagingParent), 'hampton-recovery-'));
  chmodSync(dir, 0o700);
  if (inside(dir, REPO)) { rmSync(dir, {recursive: true, force: true}); fail('staging_in_repo'); }
  return dir;
}

const QUARANTINE = {
  reactivation: 'blocked',
  reasons: ['restore_test_destination', 'survivor_registry_missing', 'external_receipts_unreconciled'],
  cron: false, outbound_messages: false, models: false,
};

const normalize = e => (e?.message?.startsWith('backup_') ? e
  : new Error(e?.name === 'OperationError' ? 'backup_decrypt_failed' : 'backup_unexpected'));

async function withCopy({backup_id, week_start, keyFD, trustFD, source, stagingParent}, after) {
  const staging = openStaging(stagingParent);
  try {
    const {privateKey, fingerprint} = await readRecoveryKey(keyFD);
    const trustedSigningKeys = await readTrust(trustFD);
    const store = pinningStore(typeof source === 'string' ? dirSource(source) : source, staging);
    const verified = await verifyCopy(store, staging, {backup_id, week_start, privateKey, fingerprint, trustedSigningKeys});
    store.seal();
    return await after(verified, store, privateKey);
  } catch (e) { throw normalize(e); } finally { rmSync(staging, {recursive: true, force: true}); }
}

// Verifica firma, manifiesto y TODAS las entradas sin escribir ningún destino. Devuelve un informe C0.
export function recoveryInspect(opts) {
  return withCopy(opts, async v => v.report);
}

// Inspección completa y después restauración a un directorio nuevo: d1.sqlite, objects/<clave>, objects.jsonl
// y QUARANTINE.json. Lee solo los bytes fijados en staging. Si falla a medias, queda INCOMPLETE y no se promueve.
export async function restoreTest({destination, ...opts}) {
  const dest = checkDestination(destination);
  return withCopy(opts, async ({report, cert, mr, dbFile}, store, privateKey) => {
    mkdirSync(dest, {mode: 0o700});
    const marker = path.join(dest, 'INCOMPLETE');
    writeFileSync(marker, '', {mode: 0o600, flag: 'wx'});
    copyFileSync(dbFile, path.join(dest, 'd1.sqlite'), C.COPYFILE_EXCL);
    chmodSync(path.join(dest, 'd1.sqlite'), 0o600);
    const index = openSync(path.join(dest, 'objects.jsonl'), C.O_WRONLY | C.O_CREAT | C.O_EXCL, 0o600);
    try {
      for await (const e of manifestEntries(store, privateKey, mr, cert)) {
        if (e.kind !== 'r2') continue;
        // La clave original solo se conoce al final de la entrada: se escribe en .partial y se renombra.
        const partial = path.join(dest, '.partial');
        const hash = createHash('sha256');
        const fd = openSync(partial, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW, 0o600);
        let meta;
        try {
          ({metadata: meta} = await readBackupEntry(e.receipt, {privateKey}, store, c => { hash.update(c); writeSync(fd, c); }));
        } finally { closeSync(fd); }
        if (!safeKey(meta?.key) || meta.sha256 !== hash.digest('hex')) fail('entry_metadata_mismatch');
        const file = path.join(dest, 'objects', meta.key);
        if (!inside(file, path.join(dest, 'objects'))) fail('unsafe_object_key');
        mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
        try { lstatSync(file); fail('duplicate_object_key'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
        renameSync(partial, file);
        writeSync(index, JSON.stringify({key: meta.key, size: meta.size, sha256: meta.sha256,
          content_type: meta.content_type ?? null, custom_metadata: meta.custom_metadata ?? {}}) + '\n');
      }
    } finally { closeSync(index); }
    writeFileSync(path.join(dest, 'QUARANTINE.json'), JSON.stringify({backup_id: report.backup_id, ...QUARANTINE}, null, 2),
      {mode: 0o600, flag: 'wx'});
    unlinkSync(marker);
    return {...report, status: 'restored_quarantined', quarantine: QUARANTINE};
  });
}

// --- CLI ---
const FLAGS = {'--source': 'source', '--backup': 'backup_id', '--week': 'week_start', '--key-fd': 'keyFD',
  '--trust-fd': 'trustFD', '--destination': 'destination'};

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!['inspect', 'restore-test'].includes(command)) fail('usage');
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = FLAGS[rest[i]];
    if (!name || rest[i + 1] === undefined || name in opts) fail('usage');
    opts[name] = name.endsWith('FD') ? Number(rest[i + 1]) : rest[i + 1];
  }
  for (const k of ['source', 'backup_id', 'week_start', 'keyFD', 'trustFD']) if (!(k in opts)) fail('usage');
  if ((command === 'restore-test') !== ('destination' in opts)) fail('usage');
  return {command, opts};
}

async function main() {
  try {
    const {command, opts} = parseArgs(process.argv.slice(2));
    const report = command === 'inspect' ? await recoveryInspect(opts) : await restoreTest(opts);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch (e) {
    process.stderr.write(JSON.stringify({status: 'failed', reason: normalize(e).message}) + '\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
