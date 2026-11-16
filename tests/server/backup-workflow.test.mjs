// PRE-14 · Task 4 y Task 5 (aviso): el reloj inicia una instancia de Workflow por semana; el Workflow hace hasta tres
// intentos de captura+sello sin reintento implícito, concilia un paso muerto a medias, lleva un journal C0 en BACKUPS,
// purga los parciales sin COMMIT tras 24 h y deja un aviso en el Inbox si la semana queda sin copia o incierta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto as crypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import worker from '../../server/jobs.js';
import {backupStartPass} from '../../server/backup-start.js';
import {runWeeklyBackup, reconcileBackupControl} from '../../server/backup-workflow.js';
import {backupFailureNotice} from '../../server/backup-notices.js';
import {backupPolicyHash, BACKUP_POLICY} from '../../server/backup-policy.js';
import {makeEnv, call, adminCookie, T0} from './helpers.mjs';
import {backupEnv, exportApi, fakeClock, fakeStep, dies, TOKEN} from './backup-fixtures.mjs';

const WEEK = '2026-11-15T02:00:00.000Z'; // domingo 15-nov-2026, 02:00 en Jersey (GMT)
const at = min => new Date(Date.parse(WEEK) + min * 60_000).toISOString();
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({...r}));
const one = (env, sql, ...a) => ({...env.DB.raw.prepare(sql).get(...a)});
const workflow = () => {
  const made = new Map();
  return {made, async create({id, params}) {
    if (made.has(id)) throw new Error('instance.already_exists');
    made.set(id, params);
    return {id};
  }, async get(id) {
    if (!made.has(id)) throw new Error('instance.not_found');
    return {id};
  }};
};
function quiet(t) {
  const logs = [];
  for (const m of ['log', 'error', 'warn', 'info']) t.mock.method(console, m, (...a) => logs.push(a.map(String).join(' ')));
  return logs;
}
const run = (env, id) => one(env, 'SELECT * FROM backup_runs WHERE id = ?', id);
const gate = env => one(env, 'SELECT state, run_id FROM backup_write_gate');
const notices = env => rows(env, "SELECT * FROM notifications WHERE task_key LIKE 'backup:failed:%'");
async function queued(env) {
  const id = crypto.randomUUID(), policy_hash = await backupPolicyHash();
  env.DB.raw.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, WEEK, policy_hash, T0, T0);
  return {run_id: id, week_start: WEEK, policy_hash};
}
// Las pruebas del Workflow corren el domingo a las 02:05 de Jersey (dentro de la ventana); D1 usa su propio reloj.
const sunday = t => t.mock.timers.enable({apis: ['Date'], now: Date.parse(at(5))});
const journal = (env, id) => JSON.parse(Buffer.from(env.BACKUPS.m.get(`control/${id}.json`).data).toString());
// Ningún resultado de paso lleva el token, la URL firmada, SQL ni rutas de archivos de MEDIA.
function c0(step, api) {
  const text = JSON.stringify(step.log);
  for (const s of [TOKEN, api.signedUrl, 'export.test', 'INSERT INTO', 'media/a.jpg']) assert.ok(!text.includes(s), `filtrado: ${s}`);
}

test('reloj: una instancia por semana con id = run_id; tick repetido, retrasado o sin binding no crea otra ni congela', async t => {
  quiet(t);
  const env = makeEnv();
  env.BACKUP_READY = '1';
  assert.deepEqual(await backupStartPass(env, at(5)), {status: 'not_configured'}, 'sin binding');
  assert.equal(rows(env, 'SELECT * FROM backup_runs').length, 0);
  assert.deepEqual(gate(env), {state: 'open', run_id: null});

  env.BACKUP_WORKFLOW = workflow();
  const first = await backupStartPass(env, at(5));
  assert.equal(first.status, 'started');
  const [row] = rows(env, 'SELECT * FROM backup_runs');
  assert.deepEqual([row.id, row.week_start, row.status, row.policy_hash], [first.run_id, WEEK, 'queued', await backupPolicyHash()]);
  assert.deepEqual(env.BACKUP_WORKFLOW.made.get(row.id), {run_id: row.id, week_start: WEEK, policy_hash: row.policy_hash},
    'el payload solo lleva run_id, semana y política');
  assert.deepEqual(await backupStartPass(env, at(15)), {status: 'queued', run_id: row.id}, 'tick repetido');
  env.DB.raw.prepare(`UPDATE backup_runs SET status = 'complete'`).run();
  assert.deepEqual(await backupStartPass(env, at(200)), {status: 'complete', run_id: row.id}, 'tick retrasado, misma semana');
  assert.equal(env.BACKUP_WORKFLOW.made.size, 1);
  assert.equal(rows(env, 'SELECT * FROM backup_runs').length, 1);
  assert.deepEqual(gate(env), {state: 'open', run_id: null}, 'el reloj nunca cierra la compuerta');
});

test('reloj: fuera de la ventana de 6 h no se inicia la copia; una semana perdida deja aviso, salvo antes de la primera', async t => {
  quiet(t);
  const env = makeEnv();
  Object.assign(env, {BACKUP_READY: '1', BACKUP_WORKFLOW: workflow()});
  const late = at(BACKUP_POLICY.start_window_min + 1);
  assert.deepEqual(await backupStartPass(env, late), {status: 'outside_window'}, 'recién encendido: sin aviso');
  assert.equal(rows(env, 'SELECT * FROM backup_runs').length, 0);

  env.DB.raw.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, status, created_at, updated_at)
    VALUES (?, '2026-11-08T02:00:00.000Z', ?, 'complete', ?, ?)`).run(crypto.randomUUID(), 'a'.repeat(64), T0, T0);
  const missed = await backupStartPass(env, late);
  assert.equal(missed.status, 'missed');
  assert.deepEqual([run(env, missed.run_id).status, run(env, missed.run_id).reason_code], ['failed', 'missed_window']);
  assert.equal(env.BACKUP_WORKFLOW.made.size, 0, 'no se inicia una copia en horario de trabajo');
  assert.equal(notices(env).length, 1);
  assert.match(notices(env)[0].task_reason, /backup failed \(missed_window\) before any attempt\. /);
  await backupStartPass(env, at(BACKUP_POLICY.start_window_min + 100));
  assert.equal(notices(env).length, 1, 'un aviso por semana');
});

test('reloj apagado (BACKUP_READY "0"): el tick es idéntico, sin consultas de backup ni llamada al Workflow', async t => {
  quiet(t);
  const tick = async (ready, binding = true) => {
    const env = makeEnv(), sql = [];
    if (ready) env.BACKUP_READY = ready;
    if (binding) env.BACKUP_WORKFLOW = workflow();
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = s => { sql.push(s.replace(/\s+/g, ' ')); return prepare(s); };
    t.mock.timers.enable({apis: ['Date'], now: Date.parse(at(5))});
    await worker.scheduled({cron: '*/10 * * * *', scheduledTime: Date.parse(at(0))}, env, {waitUntil() {}});
    t.mock.timers.reset();
    return {sql, made: env.BACKUP_WORKFLOW?.made.size ?? 0};
  };
  const off = await tick('0'), plain = await tick(undefined, false); // plain: como antes de Task 4, sin binding ni variable
  assert.equal(off.made, 0);
  assert.ok(!off.sql.some(s => /backup_/.test(s)), 'ninguna consulta toca backup_*');
  assert.deepEqual(off.sql, plain.sql);
  const on = await tick('1');
  assert.equal(on.made, 1, 'encendido, el domingo a las 02:05 inicia la copia');
});

test('reloj encendido: el inicio va después del permiso jobs:scheduled y no lo bloquea la compuerta cerrada', async t => {
  const logs = quiet(t);
  const env = makeEnv();
  let openAtCreate = null;
  Object.assign(env, {BACKUP_READY: '1', BACKUP_WORKFLOW: {async create() {
    openAtCreate = one(env, 'SELECT count(*) AS n FROM backup_writers WHERE closed_at IS NULL').n;
  }}});
  t.mock.timers.enable({apis: ['Date'], now: Date.parse(at(5))});
  await worker.scheduled({cron: '*/10 * * * *', scheduledTime: Date.parse(at(0))}, env, {waitUntil() {}});
  assert.equal(openAtCreate, 0, 'el permiso del tick ya está cerrado al iniciar la copia');
  assert.ok(rows(env, "SELECT * FROM backup_writers WHERE operation = 'jobs:scheduled'").length === 1);
  // Con la compuerta cerrada por una captura, el tick se pausa pero el control de la copia sigue respondiendo.
  const id = run(env, rows(env, 'SELECT id FROM backup_runs')[0].id).id;
  env.DB.raw.prepare(`UPDATE backup_write_gate SET state = 'closed', epoch = 1, run_id = ?, deadline = '2999-01-01T00:00:00.000Z'`).run(id);
  const before = rows(env, 'SELECT * FROM backup_runs');
  t.mock.timers.setTime(Date.parse(at(15)));
  await worker.scheduled({cron: '*/10 * * * *', scheduledTime: Date.parse(at(10))}, env, {waitUntil() {}});
  assert.ok(logs.includes('Clock paused for the weekly backup'));
  assert.deepEqual(rows(env, 'SELECT * FROM backup_runs'), before);
});

test('Workflow: intento único con éxito, paso de captura sin reintento implícito, journal C0 y sin aviso', async t => {
  quiet(t);
  sunday(t);
  const env = await backupEnv(), api = exportApi(env), payload = await queued(env), step = fakeStep();
  t.mock.method(globalThis, 'fetch', api.fetch);
  const out = await runWeeklyBackup(env, payload, step, fakeClock());
  assert.equal(out.status, 'complete');
  assert.equal(run(env, payload.run_id).status, 'complete');
  assert.ok(env.BACKUPS.m.has(`runs/${payload.run_id}/COMMIT.json`));
  const capture = step.log.filter(l => l.name.startsWith('capture'));
  assert.equal(capture.length, 1);
  assert.equal(capture[0].config.retries.limit, 0);
  assert.equal(api.starts(), 1);
  const j = journal(env, payload.run_id);
  assert.deepEqual(Object.keys(j.attempts), [run(env, payload.run_id).attempt_id]);
  assert.equal(Object.values(j.attempts)[0].outcome, 'complete');
  assert.deepEqual(Object.keys(j).sort(), ['attempts', 'final', 'run_id', 'version']);
  assert.equal(j.final.status, 'complete');
  assert.equal(notices(env).length, 0);
  c0(step, api);
});

test('Workflow: tres intentos a +0/+10/+40 min del primero; agotados, un aviso en el Inbox sin datos personales', async t => {
  quiet(t);
  sunday(t);
  const env = await backupEnv(), api = exportApi(env), payload = await queued(env), step = fakeStep();
  t.mock.method(globalThis, 'fetch', api.fetch);
  env.DB.raw.prepare(`INSERT INTO backup_writers (id, epoch, operation, started_at) VALUES (?, 0, 'api:slow', ?)`)
    .run(crypto.randomUUID(), T0); // un permiso que nunca se cierra: cada intento agota el drenaje
  const out = await runWeeklyBackup(env, payload, step, fakeClock());
  const r = run(env, payload.run_id);
  assert.deepEqual([out.status, r.status, r.attempt, r.reason_code], ['failed', 'failed', 3, 'drain_timeout']);
  const first = Date.parse(r.started_at);
  assert.deepEqual(step.log.filter(l => l.sleepUntil).map(l => Date.parse(l.sleepUntil) - first), [10 * 60_000, 40 * 60_000]);
  assert.equal(api.calls.length, 0, 'sin exportación');
  assert.equal(Object.keys(journal(env, payload.run_id).attempts).length, 3);
  const [n] = notices(env);
  assert.equal(n.title, 'Weekly backup needs review');
  assert.equal(n.task_key, `backup:failed:${WEEK}`);
  assert.match(n.task_reason, /^Week of 2026-11-15: backup failed \(drain_timeout\) after 3 attempts\. Earlier backups are kept\.$/);
  const e = one(env, 'SELECT * FROM events WHERE id = ?', n.event_id);
  assert.deepEqual([e.entity_type, e.entity_id, e.type, e.actor], ['collection', `backups:${payload.run_id}`, 'backup.failed', 'system']);
  assert.deepEqual(Object.keys(JSON.parse(e.data)).sort(), ['attempt', 'reason', 'status', 'version', 'week_start']);
  assert.equal(gate(env).state, 'open');
});

test('Workflow: el paso muere drenando → se concilia al vencer el plazo, failed y reintento con otro attempt_id', async t => {
  quiet(t);
  sunday(t);
  const env = await backupEnv(), api = exportApi(env), payload = await queued(env), clock = fakeClock();
  t.mock.method(globalThis, 'fetch', api.fetch);
  const permit = crypto.randomUUID();
  env.DB.raw.prepare(`INSERT INTO backup_writers (id, epoch, operation, started_at) VALUES (?, 0, 'api:slow', ?)`).run(permit, T0);
  clock.hang(() => true);
  let waits = 0;
  const step = fakeStep({kill: {'capture 1': dies}, onRetry: name => {
    if (name !== 'settle 1') return;
    waits++;
    assert.equal(gate(env).state, 'closed', 'no se reabre antes del plazo: el proceso podría seguir vivo');
    env.DB.raw.prepare(`UPDATE backup_write_gate SET deadline = '2000-01-01T00:00:00.000Z'`).run();
    env.DB.raw.prepare(`UPDATE backup_writers SET closed_at = ?, close_reason = 'finished' WHERE id = ?`).run(T0, permit);
    clock.hang(null);
  }});
  const out = await runWeeklyBackup(env, payload, step, clock);
  assert.equal(waits, 1);
  assert.equal(out.status, 'complete');
  assert.equal(step.log.find(l => l.name === 'settle 1').result.status, 'failed');
  const r = run(env, payload.run_id);
  assert.equal(r.attempt, 2);
  const attempts = journal(env, payload.run_id).attempts;
  assert.equal(Object.keys(attempts).length, 2);
  assert.equal(Object.values(attempts).find(a => a.outcome !== 'complete').reason, 'interrupted');
  assert.equal(api.starts(), 1, 'una sola exportación: el primer intento no llegó a exportar');
  assert.equal(notices(env).length, 0);
});

test('Workflow: el paso muere exportando → unknown, sin otra exportación, compuerta reabierta y aviso', async t => {
  quiet(t);
  sunday(t);
  const env = await backupEnv(), api = exportApi(env), payload = await queued(env), clock = fakeClock();
  t.mock.method(globalThis, 'fetch', api.fetch);
  clock.hang(() => api.exporting);
  const step = fakeStep({kill: {'capture 1': dies}, onRetry: () => {
    env.DB.raw.prepare(`UPDATE backup_write_gate SET deadline = '2000-01-01T00:00:00.000Z'`).run();
  }});
  const out = await runWeeklyBackup(env, payload, step, clock);
  const r = run(env, payload.run_id);
  assert.deepEqual([out.status, r.status, r.reason_code, r.attempt], ['unknown', 'unknown', 'interrupted', 1]);
  assert.equal(api.starts(), 1, 'la exportación incierta bloquea otro intento');
  assert.equal(gate(env).state, 'open');
  assert.equal(notices(env).length, 1);
  assert.match(notices(env)[0].task_reason, /backup unknown \(interrupted\) after 1 attempt\. /);
});

test('Workflow: muere tras el sello → se certifica con el mismo sello, sin otra exportación', async t => {
  quiet(t);
  sunday(t);
  const env = await backupEnv(), api = exportApi(env), payload = await queued(env);
  t.mock.method(globalThis, 'fetch', api.fetch);
  const put = env.BACKUPS.put.bind(env.BACKUPS);
  env.BACKUPS.put = async (k, b, o) => {
    if (k.endsWith('COMMIT.json')) { env.BACKUPS.put = put; throw new Error('worker killed'); }
    return put(k, b, o);
  };
  const out = await runWeeklyBackup(env, payload, fakeStep(), fakeClock());
  assert.equal(out.status, 'complete');
  assert.ok(env.BACKUPS.m.has(`runs/${payload.run_id}/COMMIT.json`));
  assert.equal(api.starts(), 1);
  assert.equal(notices(env).length, 0);
});

test('Workflow: iniciado fuera de la ventana no captura y avisa; payload inválido o apagado no hacen nada', async t => {
  quiet(t);
  const env = await backupEnv(), api = exportApi(env), payload = await queued(env);
  t.mock.method(globalThis, 'fetch', api.fetch);
  t.mock.timers.enable({apis: ['Date'], now: Date.parse(at(BACKUP_POLICY.start_window_min + 1))});
  const out = await runWeeklyBackup(env, payload, fakeStep(), fakeClock());
  t.mock.timers.reset();
  assert.deepEqual([out.status, run(env, payload.run_id).reason_code], ['failed', 'missed_window']);
  assert.equal(api.calls.length, 0);
  assert.equal(notices(env).length, 1);

  assert.deepEqual(await runWeeklyBackup(env, {run_id: 'x', week_start: WEEK, policy_hash: 'a'.repeat(64)}, fakeStep()),
    {status: 'invalid'});
  const off = await backupEnv(), p2 = await queued(off);
  off.BACKUP_READY = '0';
  sunday(t);
  const r = await runWeeklyBackup(off, p2, fakeStep(), fakeClock());
  assert.equal(r.status, 'failed');
  assert.equal(run(off, p2.run_id).reason_code, 'disabled');
  assert.deepEqual(gate(off), {state: 'open', run_id: null});
});

test('conciliación: purga los intentos sin COMMIT tras 24 h; nunca con unknown, sealed ni antes de 24 h', async t => {
  quiet(t);
  const env = await backupEnv();
  const ids = () => crypto.randomUUID();
  const mk = async (status, updated, attempts, committed, {final = true, outcome = 'failed'} = {}) => {
    const id = ids();
    env.DB.raw.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, status, attempt_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, `2026-0${rows(env, 'SELECT id FROM backup_runs').length + 1}-01T02:00:00.000Z`,
      'a'.repeat(64), status, committed ?? attempts.at(-1), T0, updated);
    const doc = {version: 1, run_id: id, attempts: {}, ...(final ? {final: {status, at: T0}} : {})};
    for (const a of attempts) {
      doc.attempts[a] = {started_at: T0, outcome: a === committed ? 'complete' : outcome};
      await env.BACKUPS.put(`runs/${id}/${a}/x/0.bin`, 'x');
      await env.BACKUPS.put(`runs/${id}/${a}/x/1.bin`, 'x');
      await env.BACKUPS.put(`runs/${id}/${a}/inventory/y.json`, 'x');
    }
    await env.BACKUPS.put(`control/${id}.json`, JSON.stringify(doc));
    return id;
  };
  const old = '2026-01-01T00:00:00.000Z', recent = new Date().toISOString();
  const [a1, a2, a3, a4, a5] = Array.from({length: 5}, ids);
  const complete = await mk('complete', old, [a1, a2], a2);
  await env.BACKUPS.put(`runs/${complete}/COMMIT.json`, '{}');
  const failed = await mk('failed', old, [a3]);
  const unknown = await mk('unknown', old, [a4]);
  const fresh = await mk('failed', recent, [a5]);
  const [a6, a7] = [ids(), ids()];
  const unfinished = await mk('failed', old, [a6], undefined, {final: false}); // el Workflow aún puede reintentar
  const noOutcome = await mk('failed', old, [a7], undefined, {outcome: null}); // intento sin resultado registrado
  const keys = id => [...env.BACKUPS.m.keys()].filter(k => k.startsWith(`runs/${id}/`));

  const counts = await reconcileBackupControl(env);
  assert.equal(counts.purged_attempts, 2);
  assert.deepEqual(keys(complete).sort(), [`runs/${complete}/${a2}/inventory/y.json`, `runs/${complete}/${a2}/x/0.bin`,
    `runs/${complete}/${a2}/x/1.bin`, `runs/${complete}/COMMIT.json`].sort(), 'se conserva la copia certificada');
  assert.deepEqual(keys(failed), []);
  assert.equal(keys(unknown).length, 3, 'unknown no se purga');
  assert.equal(keys(fresh).length, 3, 'menos de 24 h');
  assert.equal(keys(unfinished).length, 3, 'sin cierre del Workflow');
  assert.equal(keys(noOutcome).length, 3, 'intento sin resultado final');
  assert.ok(journal(env, complete).attempts[a1].purged_at);
  assert.deepEqual((await reconcileBackupControl(env)).purged_attempts, 0, 'repetida no hace nada');
});

test('aviso: uno por semana, el cierre humano se respeta, aparece en el Inbox con su objetivo y se puede cerrar', async t => {
  quiet(t);
  const env = makeEnv(), cookie = await adminCookie(), id = crypto.randomUUID();
  env.DB.raw.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, status, attempt, reason_code, created_at, updated_at)
    VALUES (?, ?, ?, 'complete', 1, NULL, ?, ?)`).run(id, WEEK, 'a'.repeat(64), T0, T0);
  await backupFailureNotice(env, id);
  assert.equal(notices(env).length, 0, 'una copia completa no avisa');
  env.DB.raw.prepare(`UPDATE backup_runs SET status = 'failed', reason_code = 'missing_object', attempt = 3`).run();
  await backupFailureNotice(env, id);
  await backupFailureNotice(env, id);
  const [n] = notices(env);
  assert.equal(notices(env).length, 1);
  const listed = (await call(env, 'GET', '/admin/notifications?box=action', {cookie})).data.notifications.find(x => x.id === n.id);
  assert.deepEqual([listed.target_exists, listed.link, listed.title], [true, null, 'Weekly backup needs review']);
  const done = await call(env, 'PUT', `/admin/notification-tasks/${n.id}`, {cookie,
    body: {operation_id: crypto.randomUUID(), revision: listed.revision, action: 'done'}});
  assert.equal(done.status, 200, JSON.stringify(done.data));
  await backupFailureNotice(env, id);
  assert.equal(notices(env).length, 1);
  assert.ok(notices(env)[0].resolved_at, 'el cierre humano se respeta');
  // Una colección backups:<uuid> sin evento backup.failed del sistema no es un objetivo válido.
  env.DB.raw.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
    VALUES (?, 'admin@example.test', 'collection', ?, 'backup.failed', '{}')`).run(T0, `backups:${crypto.randomUUID()}`);
  const fake = Number(env.DB.raw.prepare('SELECT max(id) AS id FROM events').get().id);
  env.DB.raw.prepare(`INSERT INTO notifications (event_id, category, title, action_required, created_at, task_key)
    VALUES (?, 'task', 'Fake', 1, ?, 'fake:backup')`).run(fake, T0);
  const all = (await call(env, 'GET', '/admin/notifications?box=action', {cookie})).data.notifications;
  assert.equal(all.find(x => x.title === 'Fake').target_exists, false);
});

test('configuración del worker de respaldo: sin URL, nodejs_compat, misma D1, BACKUP_READY apagado y sin secretos', () => {
  const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
  const b = read('backups/wrangler.toml'), pages = read('wrangler.toml');
  const val = (text, key) => text.match(new RegExp(`^${key} = (.+)$`, 'm'))?.[1];
  assert.equal(val(b, 'name'), '"hampton-backups"');
  assert.equal(val(b, 'workers_dev'), 'false');
  assert.equal(val(b, 'preview_urls'), 'false');
  assert.equal(val(b, 'compatibility_flags'), '["nodejs_compat"]');
  assert.equal(val(b, 'compatibility_date'), val(pages, 'compatibility_date'));
  assert.equal(val(b, 'BACKUP_READY'), '"0"');
  assert.equal(val(b, 'class_name'), '"WeeklyBackupWorkflow"');
  assert.doesNotMatch(b, /^\[triggers\]/m, 'sin cron propio: lo inicia el reloj');
  assert.doesNotMatch(b, /^routes?\s*=/m);
  for (const k of ['binding', 'database_name', 'database_id']) assert.equal(val(b, k), val(pages, k));
  assert.equal(val(b, 'D1_DATABASE_ID'), val(pages, 'database_id'));
  assert.doesNotMatch(b, /D1_EXPORT_TOKEN =|BACKUP_SIGNING_KEY =|CF_ACCOUNT_ID =/, 'secretos solo con wrangler secret');
  assert.doesNotMatch(read('backups/index.js'), /node:|fetch\(/);
});

test('Workflow: si el paso window o attempt falla del todo, outcome corre igual: run failed (no queued) y aviso', async t => {
  for (const name of ['window', 'attempt 1']) {
    quiet(t);
    sunday(t);
    const env = await backupEnv(), api = exportApi(env), payload = await queued(env);
    t.mock.method(globalThis, 'fetch', api.fetch);
    const step = fakeStep({kill: {[name]: () => Promise.reject(new Error('engine down'))}});
    const out = await runWeeklyBackup(env, payload, step, fakeClock());
    const r = run(env, payload.run_id);
    assert.deepEqual([out.status, r.status, r.reason_code], ['failed', 'failed', 'workflow_step_failed'], name);
    assert.ok(step.log.some(l => l.name === 'outcome' && !l.error), name);
    assert.equal(api.calls.length, 0, name);
    assert.equal(notices(env).length, 1, name);
    assert.ok(journal(env, payload.run_id).final, `${name}: journal cerrado`);
    t.mock.restoreAll();
    t.mock.timers.reset();
  }
});

test('reloj: create fallido distingue instancia existente de binding roto (código C0) y, pasada la ventana, avisa', async t => {
  const logs = quiet(t);
  const env = makeEnv();
  const broken = {create: async () => { throw new Error('Private provider detail'); },
    get: async () => { throw new Error('Private provider detail'); }};
  Object.assign(env, {BACKUP_READY: '1', BACKUP_WORKFLOW: broken});
  const r = await backupStartPass(env, at(5));
  assert.equal(r.status, 'start_failed');
  assert.ok(logs.some(l => /^backup_start_failed workflow_unavailable$/.test(l)), logs.join('|'));
  assert.ok(!logs.some(l => l.includes('Private provider detail')));
  assert.equal(run(env, r.run_id).status, 'queued', 'dentro de la ventana el tick siguiente lo reintenta');
  // Instancia ya creada (create repetido): sigue en cola sin error.
  env.BACKUP_WORKFLOW = {create: async () => { throw new Error('x'); }, get: async id => ({id})};
  assert.deepEqual(await backupStartPass(env, at(15)), {status: 'queued', run_id: r.run_id});
  // Pasada la ventana sin instancia: failed start_failed y un aviso; el reloj deja de intentarlo.
  env.BACKUP_WORKFLOW = broken;
  const late = await backupStartPass(env, at(BACKUP_POLICY.start_window_min + 1));
  assert.deepEqual(late, {status: 'start_failed', run_id: r.run_id});
  assert.deepEqual([run(env, r.run_id).status, run(env, r.run_id).reason_code], ['failed', 'start_failed']);
  assert.equal(notices(env).length, 1);
  assert.deepEqual(await backupStartPass(env, at(BACKUP_POLICY.start_window_min + 11)), {status: 'failed', run_id: r.run_id});
});
