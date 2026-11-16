// PRE-14 · Task 1: política semanal y compuerta de escrituras, sobre D1 local (node:sqlite) con la migración 0094.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {makeDb} from './helpers.mjs';
import {backupDue, attemptAt} from '../../server/backup-policy.js';
import {
  withApplicationWrite, closeWriteGate, drainState, sealable, openWriteGate, reconcileWritePermit, BackupMaintenanceError,
} from '../../server/backup-write-gate.js';

const RUN = '11111111-1111-4111-8111-111111111111', RUN2 = '22222222-2222-4222-8222-222222222222';
const T = '2026-11-15T02:00:00.000Z';
const plus = (iso, s) => new Date(Date.parse(iso) + s * 1000).toISOString();
const week = iso => backupDue(iso).week_start;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const env = () => ({DB: makeDb(), BACKUP_READY: '1'});
const openPermits = e => e.DB.raw.prepare('SELECT count(*) AS n FROM backup_writers WHERE closed_at IS NULL').get().n;

test('domingo 02:00 de Jersey, en invierno y en verano', () => {
  assert.deepEqual(backupDue(T), {week_start: T, due_at: T});
  assert.equal(week('2026-11-15T01:59:59.000Z'), '2026-11-08T02:00:00.000Z');
  assert.equal(week('2026-11-18T12:00:00.000Z'), T); // miércoles
  assert.equal(week('2026-07-05T01:00:00.000Z'), '2026-07-05T01:00:00.000Z'); // 02:00 BST
  assert.equal(week('2026-07-05T00:59:59.000Z'), '2026-06-28T01:00:00.000Z');
  for (const bad of ['2026-11-15 02:00', '', null, '2026-11-15T02:00:00Z']) assert.equal(backupDue(bad), null);
});

test('cambios de hora: 02:00 existe una sola vez en marzo y en octubre', () => {
  assert.equal(week('2026-03-29T00:59:59.000Z'), '2026-03-22T02:00:00.000Z'); // aún GMT
  assert.equal(week('2026-03-29T01:00:00.000Z'), '2026-03-29T01:00:00.000Z'); // salta a 02:00 BST
  assert.equal(week('2026-10-25T00:30:00.000Z'), '2026-10-18T01:00:00.000Z'); // 01:30 BST
  assert.equal(week('2026-10-25T01:30:00.000Z'), '2026-10-18T01:00:00.000Z'); // 01:30 GMT, la hora repetida
  assert.equal(week('2026-10-25T02:00:00.000Z'), '2026-10-25T02:00:00.000Z'); // 02:00 GMT
});

test('tick repetido o retrasado no crea una segunda semana ni copias retroactivas', () => {
  const weeks = new Set();
  for (let t = Date.parse(T); t < Date.parse('2026-11-22T02:00:00.000Z'); t += 600_000) weeks.add(week(new Date(t).toISOString()));
  assert.deepEqual([...weeks], [T]);
  assert.equal(week('2027-01-06T09:00:00.000Z'), '2027-01-03T02:00:00.000Z'); // semanas sin reloj: solo la última
});

test('tres intentos a +0, +10 y +40 minutos del primero', () => {
  const first = '2026-11-15T02:00:07.000Z';
  assert.deepEqual([1, 2, 3, 4].map(n => attemptAt(first, n)),
    [first, '2026-11-15T02:10:07.000Z', '2026-11-15T02:40:07.000Z', null]);
});

test('con BACKUP_READY apagado la escritura corre sin permiso ni compuerta', async () => {
  const e = env(); e.BACKUP_READY = '0';
  await closeWriteGate(e, {run_id: RUN, now: T});
  assert.equal(await withApplicationWrite(e, {operation_id: 'api:test'}, async () => 'ok'), 'ok');
  assert.equal(e.DB.raw.prepare('SELECT count(*) AS n FROM backup_writers').get().n, 0);
});

test('drain_races_with_admission: lo admitido antes del cierre se drena; nada entra después', async () => {
  const e = env(), inflight = deferred();
  const write = withApplicationWrite(e, {operation_id: 'api:listings/save'}, () => inflight.promise, () => T);
  await new Promise(r => setImmediate(r));
  const gate = await closeWriteGate(e, {run_id: RUN, now: plus(T, 1)});
  assert.equal(gate.epoch, 1);
  assert.equal(await drainState(e, {run_id: RUN, epoch: 1, now: plus(T, 2)}), 'waiting');
  await assert.rejects(withApplicationWrite(e, {operation_id: 'api:other'}, async () => assert.fail('no debe correr'),
    () => plus(T, 2)), err => err instanceof BackupMaintenanceError && err.retryAfter === 60);
  inflight.resolve('saved');
  assert.equal(await write, 'saved');
  assert.equal(await drainState(e, {run_id: RUN, epoch: 1, now: plus(T, 3)}), 'drained');
  assert.equal(await sealable(e, {run_id: RUN, epoch: 1, now: plus(T, 3)}), true);
  assert.equal(await closeWriteGate(e, {run_id: RUN2, now: plus(T, 3)}), null, 'no se cierra dos veces');
});

test('inflight waitUntil: el permiso sigue abierto hasta el final aunque venza el plazo', async () => {
  const e = env(), waitUntil = deferred();
  const write = withApplicationWrite(e, {operation_id: 'api:drive'}, async () => { await waitUntil.promise; }, () => T);
  await new Promise(r => setImmediate(r));
  await closeWriteGate(e, {run_id: RUN, now: T});
  const late = plus(T, 3600);
  assert.equal(openPermits(e), 1);
  assert.equal(await sealable(e, {run_id: RUN, epoch: 1, now: late}), false);
  assert.equal(await reconcileWritePermit(e, {id: 'x', proof: {kind: 'age', seconds: 3600}}), 'unknown');
  assert.equal(openPermits(e), 1, 'la edad no cierra un escritor activo');
  waitUntil.resolve();
  await write;
  assert.equal(openPermits(e), 0);
});

test('un fallo de la operación también cierra su permiso', async () => {
  const e = env();
  await assert.rejects(withApplicationWrite(e, {operation_id: 'jobs:retention'}, async () => { throw new Error('boom'); }), /boom/);
  assert.equal(openPermits(e), 0);
  await assert.rejects(withApplicationWrite(e, {operation_id: 'Nombre Con Espacios'}, async () => 1), /backup_invalid_operation/);
});

test('deadline_or_old_epoch: plazo vencido u epoch antiguo no sellan; un runner caído no deja mantenimiento infinito', async () => {
  const e = env();
  await closeWriteGate(e, {run_id: RUN, now: T, gate_ms: 300_000});
  const after = plus(T, 301);
  assert.equal(await drainState(e, {run_id: RUN, epoch: 1, now: after}), 'expired');
  assert.equal(await sealable(e, {run_id: RUN, epoch: 1, now: after}), false);
  assert.equal(await withApplicationWrite(e, {operation_id: 'api:after'}, async () => 'ok', () => after), 'ok');
  const again = await closeWriteGate(e, {run_id: RUN2, now: after});
  assert.equal(again.epoch, 2);
  assert.equal(await sealable(e, {run_id: RUN, epoch: 1, now: plus(after, 1)}), false, 'epoch antiguo');
  assert.equal(await openWriteGate(e, {run_id: RUN, epoch: 1, now: after}), false, 'el runner antiguo no reabre');
  assert.equal(await sealable(e, {run_id: RUN2, epoch: 2, now: plus(after, 1)}), true);
  assert.equal(await openWriteGate(e, {run_id: RUN2, epoch: 2, now: plus(after, 2)}), true);
  assert.equal(await sealable(e, {run_id: RUN2, epoch: 2, now: plus(after, 3)}), false, 'tras reabrir no se sella');
  const g = e.DB.raw.prepare('SELECT state, epoch, run_id, deadline FROM backup_write_gate').get();
  assert.deepEqual({...g}, {state: 'open', epoch: 3, run_id: null, deadline: null});
});

test('un permiso huérfano solo se cierra con la revisión de un admin', async () => {
  const e = env();
  e.DB.raw.prepare(`INSERT INTO backup_writers (id, epoch, operation, started_at) VALUES (?, 0, 'api:lost', ?)`).run(RUN, T);
  await closeWriteGate(e, {run_id: RUN2, now: T});
  assert.equal(await sealable(e, {run_id: RUN2, epoch: 1, now: plus(T, 1)}), false, 'permiso de otro epoch también cuenta');
  assert.equal(await reconcileWritePermit(e, {id: RUN, proof: null}), 'unknown');
  assert.equal(await reconcileWritePermit(e, {id: RUN, proof: {kind: 'authorized_review', reviewer: 'nobody@example.test'}}), 'unknown');
  assert.equal(await reconcileWritePermit(e, {id: RUN, proof: {kind: 'authorized_review', reviewer: 'admin@example.test'}}), 'closed');
  assert.equal(await reconcileWritePermit(e, {id: RUN, proof: {kind: 'authorized_review', reviewer: 'admin@example.test'}}), 'closed');
  assert.equal(await sealable(e, {run_id: RUN2, epoch: 1, now: plus(T, 2)}), true);
});

test('migración 0094: aditiva, compuerta abierta y estados coherentes', () => {
  const sql = readFileSync(new URL('../../migrations/0094_backup_control.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(DROP|DELETE|UPDATE|ALTER\s+TABLE\s+\w+\s+(RENAME|DROP))\b/i);
  const db = makeDb().raw;
  assert.deepEqual({...db.prepare('SELECT id, epoch, state, run_id, deadline FROM backup_write_gate').get()},
    {id: 1, epoch: 0, state: 'open', run_id: null, deadline: null});
  assert.throws(() => db.prepare(`UPDATE backup_write_gate SET state = 'closed'`).run(), /CHECK/);
  assert.throws(() => db.prepare(`INSERT INTO backup_write_gate (id, updated_at) VALUES (2, ?)`).run(T), /CHECK/);
  assert.throws(() => db.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, status, created_at, updated_at)
    VALUES (?, ?, ?, 'done', ?, ?)`).run(RUN, T, 'a'.repeat(64), T, T), /CHECK/);
  db.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(RUN, T, 'a'.repeat(64), T, T);
  assert.throws(() => db.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`).run(RUN2, T, 'a'.repeat(64), T, T), /UNIQUE/, 'una sola copia por semana');
});

test('cobertura: toda entrada figura en el registro y BACKUP_READY sigue apagado mientras falte alguna', () => {
  const doc = readFileSync(new URL('../../docs/roadmap/work/PRE-14/writer-coverage.md', import.meta.url), 'utf8');
  const rows = doc.split('\n').filter(l => /^\| `/.test(l)).map(l => l.split('|').map(c => c.trim()));
  const walk = dir => readdirSync(new URL(dir, import.meta.url), {withFileTypes: true})
    .flatMap(d => d.isDirectory() ? walk(`${dir}${d.name}/`) : d.name.endsWith('.js') ? [`${dir}${d.name}`] : []);
  const entries = [...walk('../../functions/').map(f => f.replace('../../', '')), 'server/jobs.js` `scheduled',
    'server/jobs.js` `email', 'scripts/import_hampton.py', 'scripts/import_agencies.py', 'scripts/upload_r2.sh'];
  for (const entry of entries) assert.ok(rows.some(r => r[1].startsWith(`\`${entry}\``)), `${entry} sin fila de cobertura`);
  const uncovered = rows.some(r => r[3] !== 'cubierta');
  for (const f of ['../../wrangler.toml', '../../jobs/wrangler.toml']) {
    const ready = readFileSync(new URL(f, import.meta.url), 'utf8').match(/^BACKUP_READY = "(\w+)"/m)?.[1];
    assert.ok(ready, `${f}: BACKUP_READY declarado`);
    assert.ok(ready === '0' || !uncovered, `${f}: no se activa con escritores sin cubrir`);
  }
});
