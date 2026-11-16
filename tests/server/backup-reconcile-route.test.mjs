// PRE-14 · Task 1: la ruta de admin que concilia un permiso de escritura huérfano, incluso con la compuerta cerrada.
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv, adminCookie, call} from './helpers.mjs';
import {closeWriteGate} from '../../server/backup-write-gate.js';

const RUN = '11111111-1111-4111-8111-111111111111', GATE = '22222222-2222-4222-8222-222222222222';
const T = '2026-11-15T02:00:00.000Z';
const orphan = e => e.DB.raw.prepare(`INSERT INTO backup_writers (id, epoch, operation, started_at) VALUES (?, 0, 'api:lost', ?)`).run(RUN, T);
const row = e => e.DB.raw.prepare('SELECT closed_at, close_reason, reconciled_by FROM backup_writers WHERE id = ?').get(RUN);

test('apagada, la ruta no existe', async () => {
  const e = makeEnv();
  assert.equal((await call(e, 'GET', '/admin/backups/permits', {cookie: await adminCookie()})).status, 404);
});

test('lista y cierra un permiso huérfano con la compuerta cerrada, solo un admin', async () => {
  const e = {...makeEnv(), BACKUP_READY: '1'};
  orphan(e);
  await closeWriteGate(e, {run_id: GATE, now: T});
  assert.equal((await call(e, 'GET', '/admin/backups/permits')).status, 401);
  const list = await call(e, 'GET', '/admin/backups/permits', {cookie: await adminCookie()});
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.permits.map(p => p.id), [RUN]);
  const path = `/admin/backups/permits/${RUN}/reconcile`;
  assert.equal((await call(e, 'POST', path)).status, 401);
  assert.equal((await call(e, 'POST', path, {cookie: await adminCookie('nobody@example.test')})).status, 401);
  assert.equal(row(e).closed_at, null);
  const done = await call(e, 'POST', path, {cookie: await adminCookie('colleague@example.test')});
  assert.deepEqual([done.status, done.data], [200, {result: 'closed'}]);
  assert.equal(row(e).reconciled_by, 'colleague@example.test');
  assert.equal((await call(e, 'POST', '/admin/backups/permits/not-an-id/reconcile', {cookie: await adminCookie()})).status, 404);
});
