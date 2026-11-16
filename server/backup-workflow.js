// PRE-14 · Task 4: la copia semanal como Cloudflare Workflow (plan 2026-11-09-tp01-pre-14-plan.md, Task 4; spec TP-01
// «Opciones y arquitectura»). El reloj (server/backup-start.js) crea una instancia por semana con id = run_id; la clase
// WeeklyBackupWorkflow (backups/index.js) llama a runWeeklyBackup. Hasta tres intentos a +0/+10/+40 min del primero,
// cada uno un solo paso de captura y sello sin reintento implícito (retries.limit = 0). Después de cada intento,
// settleRun lee el estado durable de D1: un paso muerto a medias se concilia solo cuando vence el plazo de la compuerta
// (el proceso podría seguir vivo): drenando → failed y reintentable; exportando → unknown, sin más exportaciones;
// sellado → se certifica con el mismo sello. Si la semana acaba sin copia, un aviso en el Inbox (backup-notices.js).
// Los resultados de los pasos son C0 (estados, UUID, códigos, fechas): nunca SQL, claves, URLs firmadas ni rutas.
// Journal C0 en BACKUPS/control/<run>.json, con CAS por ETag: los intentos iniciados y su resultado. Con él se purgan
// los parciales sin COMMIT 24 h después de que el run acabe; nunca si queda unknown o sealed.
import {captureBackup, sealBackup, certifyBackup} from './backups.js';
import {BACKUP_POLICY, attemptAt} from './backup-policy.js';
import {openWriteGate} from './backup-write-gate.js';
import {backupFailureNotice} from './backup-notices.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CAPTURE = {retries: {limit: 0, delay: '1 second'}, timeout: '10 minutes'};
// Espera a que venza el plazo de la compuerta (300 s) o a que R2 responda para certificar.
const SETTLE = {retries: {limit: 10, delay: '1 minute', backoff: 'constant'}, timeout: '10 minutes'};
const D1_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const journalKey = run_id => `control/${run_id}.json`;

async function readJournal(bucket, run_id) {
  const o = await bucket.get(journalKey(run_id));
  return o ? {doc: JSON.parse(await o.text()), etag: o.etag} : null;
}
// change() debe ser idempotente: si la respuesta de un put se pierde, se relee y se vuelve a aplicar.
async function journal(bucket, run_id, change) {
  for (let i = 0; i < 3; i++) {
    const cur = await readJournal(bucket, run_id);
    const doc = cur?.doc ?? {version: 1, run_id, attempts: {}};
    change(doc);
    const put = await bucket.put(journalKey(run_id), JSON.stringify(doc),
      {onlyIf: cur ? {etagMatches: cur.etag} : new Headers({'if-none-match': '*'})}).catch(() => null);
    if (put) return;
  }
  throw new Error('backup_journal_conflict');
}

const runRow = (env, run_id) => env.DB.prepare(`SELECT status, attempt, attempt_id, started_at, reason_code
  FROM backup_runs WHERE id = ?1`).bind(run_id).first();

async function captureAndSeal(env, ids, clock) {
  const cap = await captureBackup(env, ids, clock);
  if (cap.status !== 'captured') return {status: cap.status, reason: cap.reason ?? null};
  await sealBackup(env, {run_id: ids.run_id, epoch: cap.epoch, manifest_key: cap.manifest_key, cipher_hash: cap.cipher_hash});
  return {status: 'complete'};
}

// Lleva el run a un estado del que se puede decidir: certifica un sello pendiente, concilia un intento cuyo proceso
// murió (solo con la compuerta vencida o ya abierta) y marca failed un run que no llegó a empezar (result: lo que
// devolvió el paso). Lanza un error para que el paso se repita más tarde cuando aún no se puede decidir.
export async function settleRun(env, run_id, result = null) {
  let row = await runRow(env, run_id);
  if (!row) return {status: 'missing', retry: false};
  if (row.status === 'sealed') {
    try { await certifyBackup(env, run_id); } catch (e) { if ((await runRow(env, run_id)).status === 'sealed') throw e; }
  } else if (row.status === 'draining' || row.status === 'capturing') {
    const gate = await env.DB.prepare(`SELECT epoch, deadline <= ${D1_NOW} AS expired FROM backup_write_gate
      WHERE id = 1 AND state = 'closed' AND run_id = ?1`).bind(run_id).first();
    if (gate && !gate.expired) throw new Error('backup_capture_running');
    // Sin exportación a medias (drenando, o la descarga ya acabó) se puede reintentar; si no, la exportación es incierta.
    await env.DB.prepare(`UPDATE backup_runs SET status = CASE WHEN status = 'draining' OR manifest_key IS NOT NULL
        THEN 'failed' ELSE 'unknown' END, reason_code = 'interrupted', version = version + 1, updated_at = ${D1_NOW}
      WHERE id = ?1 AND attempt_id = ?2 AND status IN ('draining', 'capturing')`).bind(run_id, row.attempt_id).run();
    if (gate) await openWriteGate(env, {run_id, epoch: gate.epoch});
  } else if (row.status === 'queued' && result) { // no configurado, fuente no cubierta, apagado o no iniciable
    await env.DB.prepare(`UPDATE backup_runs SET status = 'failed', reason_code = ?2, version = version + 1,
      updated_at = ${D1_NOW} WHERE id = ?1 AND status = 'queued'`).bind(run_id, result.reason ?? result.status).run();
  }
  row = await runRow(env, run_id);
  if (row.attempt_id) {
    await journal(env.BACKUPS, run_id, d => {
      d.attempts[row.attempt_id] = {...d.attempts[row.attempt_id], outcome: row.status, reason: row.reason_code};
    });
  }
  return {status: row.status, attempt: row.attempt, retry: row.status === 'failed' && row.attempt > 0 && row.attempt < 3,
    next_at: attemptAt(row.started_at, row.attempt + 1)};
}

export async function runWeeklyBackup(env, payload, step, clock) {
  const {run_id, week_start, policy_hash} = payload ?? {};
  if (!UUID.test(run_id ?? '') || !Number.isFinite(Date.parse(week_start)) || !/^[0-9a-f]{64}$/.test(policy_hash ?? '')) {
    return {status: 'invalid'};
  }
  await step.do('reconcile', SETTLE, () => reconcileBackupControl(env, run_id)).catch(() => null);
  // Tarde (instancia creada al final de la ventana o retenida): no se pausa la web en horario de trabajo.
  // Si un paso de control falla del todo, el bucle se corta y outcome corre igual: el run no queda en cola sin aviso.
  try {
    let state = await step.do('window', async () => {
      if (Date.now() - Date.parse(week_start) > BACKUP_POLICY.start_window_min * 60_000) {
        await env.DB.prepare(`UPDATE backup_runs SET status = 'failed', reason_code = 'missed_window', version = version + 1,
          updated_at = ${D1_NOW} WHERE id = ?1 AND status = 'queued'`).bind(run_id).run();
      }
      return {retry: (await runRow(env, run_id))?.status === 'queued', next_at: null};
    });
    for (let n = 1; n <= 3 && state.retry; n++) {
      if (n > 1 && state.next_at) await step.sleepUntil(`wait ${n}`, Date.parse(state.next_at));
      const attempt_id = await step.do(`attempt ${n}`, async () => {
        const id = crypto.randomUUID();
        await journal(env.BACKUPS, run_id, d => { d.attempts[id] ??= {started_at: new Date().toISOString(), outcome: null}; });
        return id;
      });
      const result = await step.do(`capture ${n}`, CAPTURE,
        () => captureAndSeal(env, {run_id, attempt_id, week_start, policy_hash}, clock)).catch(() => ({status: 'interrupted'}));
      state = await step.do(`settle ${n}`, SETTLE, () => settleRun(env, run_id, result)).catch(() => ({retry: false}));
    }
  } catch { /* outcome decide con lo que haya en D1 */ }
  return step.do('outcome', async () => {
    await env.DB.prepare(`UPDATE backup_runs SET status = 'failed', reason_code = 'workflow_step_failed', version = version + 1,
      updated_at = ${D1_NOW} WHERE id = ?1 AND status = 'queued'`).bind(run_id).run();
    const row = await runRow(env, run_id);
    if (row && !['complete', 'purged'].includes(row.status)) await backupFailureNotice(env, run_id);
    // Cierre en el journal: desde aquí ningún intento de este run puede volver a empezar (requisito de la purga).
    await journal(env.BACKUPS, run_id, d => { d.final ??= {status: row?.status ?? 'missing', at: new Date().toISOString()}; })
      .catch(() => console.error('backup_journal_failed'));
    return {status: row?.status ?? 'missing', attempt: row?.attempt ?? 0, reason: row?.reason_code ?? null};
  });
}

// Al empezar cada semana: concilia runs anteriores que quedaron a medias y purga los intentos sin COMMIT de runs
// terminados (complete o failed) hace más de 24 h, solo si su Workflow ya cerró el journal (final) y el intento tiene
// resultado registrado. Devuelve solo conteos.
export async function reconcileBackupControl(env, current = null) {
  const counts = {settled: 0, waiting: 0, purged_attempts: 0};
  const {results: open} = await env.DB.prepare(`SELECT id FROM backup_runs
    WHERE status IN ('draining', 'capturing', 'sealed') AND id IS NOT ?1`).bind(current).all();
  for (const {id} of open) {
    try { await settleRun(env, id); counts.settled++; } catch { counts.waiting++; }
  }
  const {results: done} = await env.DB.prepare(`SELECT id, status, attempt_id FROM backup_runs
    WHERE status IN ('complete', 'failed') AND updated_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')`).all();
  for (const run of done) {
    const doc = (await readJournal(env.BACKUPS, run.id))?.doc;
    if (!doc?.final) continue;
    for (const [attempt_id, a] of Object.entries(doc.attempts)) {
      if (a.purged_at || a.outcome == null || !UUID.test(attempt_id)
        || (run.status === 'complete' && attempt_id === run.attempt_id)) continue;
      for (;;) {
        const page = await env.BACKUPS.list({prefix: `runs/${run.id}/${attempt_id}/`});
        if (!page.objects.length) break;
        await env.BACKUPS.delete(page.objects.map(o => o.key));
      }
      await journal(env.BACKUPS, run.id, d => { d.attempts[attempt_id].purged_at ??= new Date().toISOString(); });
      counts.purged_attempts++;
    }
  }
  return counts;
}
