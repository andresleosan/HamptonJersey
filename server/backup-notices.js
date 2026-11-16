// PRE-14 · Task 5 (aviso): una tarea en el Inbox de Staff cuando la copia de una semana falla, se pierde o queda
// incierta (plan 2026-11-09-tp01-pre-14-plan.md, Task 5). Mismo patrón que la revisión del barrido diario (BUS-08):
// un evento del sistema sobre la colección backups:<run> y su tarea, en un batch. Una por semana (task_key con
// week_start): si el equipo la cierra, no se vuelve a abrir. Solo semana, estado, código de razón e intentos: ningún
// dato de personas, casas, archivos, claves ni del bucket.
import {withApplicationWrite} from './backup-write-gate.js';

const KEY = "'backup:failed:'||json_extract(e.data,'$.week_start')";

// Statements para un batch: el aviso solo nace si el run existe y no acabó bien (ni sigue en cola).
export const backupNoticeStatements = (env, run_id, ts) => [
  env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
    SELECT ?1, 'system', 'collection', 'backups:'||id, 'backup.failed', json_object('version', version,
      'week_start', week_start, 'status', status, 'reason', reason_code, 'attempt', attempt)
    FROM backup_runs WHERE id = ?2 AND status NOT IN ('queued', 'complete', 'purged')
      AND NOT EXISTS (SELECT 1 FROM notifications WHERE task_key = 'backup:failed:'||week_start)`).bind(ts, run_id),
  env.DB.prepare(`INSERT INTO notifications (event_id, category, title, task_reason, action_required, created_at, task_key)
    SELECT e.id, 'task', 'Weekly backup needs review', 'Week of '||substr(json_extract(e.data,'$.week_start'),1,10)||': backup '||
      json_extract(e.data,'$.status')||' ('||COALESCE(json_extract(e.data,'$.reason'),'no reason recorded')||') '||
      CASE json_extract(e.data,'$.attempt') WHEN 0 THEN 'before any attempt' WHEN 1 THEN 'after 1 attempt'
        ELSE 'after '||json_extract(e.data,'$.attempt')||' attempts' END||'. Earlier backups are kept.', 1, e.at, ${KEY}
    FROM events e WHERE e.entity_type = 'collection' AND e.entity_id = 'backups:'||?1 AND e.type = 'backup.failed'
      AND e.actor = 'system' AND NOT EXISTS (SELECT 1 FROM notifications WHERE task_key = ${KEY})
    ORDER BY e.id DESC LIMIT 1`).bind(run_id),
];

// Escritura de negocio (events, notifications): dentro de su propio permiso, como cualquier escritor.
export const backupFailureNotice = (env, run_id, ts = new Date().toISOString()) =>
  withApplicationWrite(env, {operation_id: 'backup:notice'}, () => env.DB.batch(backupNoticeStatements(env, run_id, ts)));
