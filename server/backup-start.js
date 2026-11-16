// PRE-14 · Task 4: el reloj (hampton-jobs) inicia la copia semanal (plan 2026-11-09-tp01-pre-14-plan.md, Task 4).
// Corre después del tick y FUERA de su permiso jobs:scheduled: es control de la copia, no escritura de negocio
// (condición c de la ficha), y así el permiso del tick ya está cerrado cuando el Workflow empieza a drenar.
// Una instancia por semana con id = run_id (backup_runs.week_start es UNIQUE): un tick repetido o retrasado no crea
// otra. El reloj nunca cierra la compuerta. Con BACKUP_READY distinto de "1" no consulta nada.
import {BACKUP_POLICY, backupDue, backupPolicyHash} from './backup-policy.js';
import {backupReady, withApplicationWrite} from './backup-write-gate.js';
import {backupNoticeStatements} from './backup-notices.js';

export async function backupStartPass(env, nowUTC) {
  if (!backupReady(env)) return {status: 'disabled'};
  if (!env.BACKUP_WORKFLOW) return {status: 'not_configured'}; // sin binding: ni run ni compuerta
  const due = backupDue(nowUTC);
  if (!due) return {status: 'invalid_time'};
  const {week_start} = due;
  const read = () => env.DB.prepare(`SELECT r.id, r.status, r.policy_hash, EXISTS (SELECT 1 FROM backup_runs) AS any_run
    FROM (SELECT 1) LEFT JOIN backup_runs r ON r.week_start = ?1`).bind(week_start).first();
  let row = await read();
  if (!row.id && Date.parse(nowUTC) - Date.parse(week_start) > BACKUP_POLICY.start_window_min * 60_000) {
    if (!row.any_run) return {status: 'outside_window'}; // recién encendida: la primera copia será el domingo siguiente
    // Semana perdida (reloj caído toda la ventana): run failed y aviso en un batch, sin iniciar una copia de día.
    const id = crypto.randomUUID();
    const [inserted] = await withApplicationWrite(env, {operation_id: 'backup:missed'}, async () => env.DB.batch([
      env.DB.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, status, reason_code, created_at, updated_at)
        SELECT ?1, ?2, ?3, 'failed', 'missed_window', ?4, ?4 WHERE 1 ON CONFLICT (week_start) DO NOTHING`)
        .bind(id, week_start, await backupPolicyHash(), nowUTC),
      ...backupNoticeStatements(env, id, nowUTC)]));
    return inserted.meta.changes === 1 ? {status: 'missed', run_id: id} : {status: 'outside_window'};
  }
  if (!row.id) {
    await env.DB.prepare(`INSERT INTO backup_runs (id, week_start, policy_hash, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT (week_start) DO NOTHING`)
      .bind(crypto.randomUUID(), week_start, await backupPolicyHash(), nowUTC).run();
    row = await read();
  }
  if (row.status !== 'queued') return {status: row.status, run_id: row.id};
  try {
    await env.BACKUP_WORKFLOW.create({id: row.id, params: {run_id: row.id, week_start, policy_hash: row.policy_hash}});
    return {status: 'started', run_id: row.id};
  } catch {
    // Ya existe (tick repetido) o la respuesta se perdió: el Workflow avanza el run; nunca una segunda instancia.
    return {status: 'queued', run_id: row.id};
  }
}
