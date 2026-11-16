// PRE-14 · Task 1: compuerta de escrituras para la copia coherente (spec TP-01 «Estado y contratos» y «Frontera de
// escritura»). Toda operación que escribe en D1 o R2 corre dentro de un permiso registrado en backup_writers; la
// captura cierra la compuerta (epoch nuevo), espera a cero permisos abiertos de CUALQUIER epoch y solo sella si su
// epoch sigue vigente y el plazo no venció. Con BACKUP_READY distinto de "1" nada de esto se usa.
// La lista de entradas que deben pasar por aquí está en docs/roadmap/work/PRE-14/writer-coverage.md.
import {BACKUP_POLICY} from './backup-policy.js';

export const backupReady = env => env?.BACKUP_READY === '1';

export class BackupMaintenanceError extends Error {
  constructor() { super('backup_maintenance'); this.code = 'backup_maintenance'; this.retryAfter = 60; }
}

const OPERATION = /^[a-z0-9:._/-]{1,80}$/;
const iso = ms => new Date(ms).toISOString();

// Admisión atómica: una sola sentencia inserta el permiso solo si la compuerta está abierta o su plazo venció
// (un runner caído no deja mantenimiento infinito; esa captura ya no puede sellar). El permiso se cierra en
// finally, después de fn, que debe esperar dentro todos sus efectos y waitUntil. Si el cierre falla, el permiso
// queda abierto y bloquea el sello hasta reconcileWritePermit: nunca se da por terminado por antigüedad.
export async function withApplicationWrite(env, {operation_id}, fn, now = () => new Date().toISOString()) {
  if (!backupReady(env)) return fn();
  if (!OPERATION.test(operation_id ?? '')) throw new Error('backup_invalid_operation');
  const id = crypto.randomUUID(), at = now();
  const admitted = await env.DB.prepare(`INSERT INTO backup_writers (id, epoch, operation, started_at)
    SELECT ?1, epoch, ?2, ?3 FROM backup_write_gate WHERE id = 1 AND (state = 'open' OR deadline <= ?3)`)
    .bind(id, operation_id, at).run();
  if (admitted.meta.changes !== 1) throw new BackupMaintenanceError();
  try {
    return await fn();
  } finally {
    await env.DB.prepare(`UPDATE backup_writers SET closed_at = ?2, close_reason = 'finished'
      WHERE id = ?1 AND closed_at IS NULL`).bind(id, now()).run().catch(() => {
      console.error('backup_permit_close_failed'); // C0: el permiso sigue abierto y se concilia antes de sellar.
    });
  }
}

// Cierra la compuerta para run_id con un epoch nuevo. Solo si estaba abierta o vencida.
export async function closeWriteGate(env, {run_id, now, gate_ms = BACKUP_POLICY.gate_ms}) {
  const deadline = iso(Date.parse(now) + gate_ms);
  return env.DB.prepare(`UPDATE backup_write_gate SET state = 'closed', epoch = epoch + 1, run_id = ?1, deadline = ?2,
    updated_at = ?3 WHERE id = 1 AND (state = 'open' OR deadline <= ?3) RETURNING epoch, deadline`)
    .bind(run_id, deadline, now).first();
}

// drained: cero permisos abiertos (de cualquier epoch) con la compuerta aún cerrada para este run y epoch.
export async function drainState(env, {run_id, epoch, now}) {
  const row = await env.DB.prepare(`SELECT g.state, g.epoch, g.run_id, g.deadline,
      (SELECT count(*) FROM backup_writers WHERE closed_at IS NULL) AS open_writers
    FROM backup_write_gate g WHERE g.id = 1`).first();
  if (!row || row.state !== 'closed' || row.epoch !== epoch || row.run_id !== run_id || row.deadline <= now) return 'expired';
  return row.open_writers === 0 ? 'drained' : 'waiting';
}

// La misma condición que tendrá el CAS de sealBackup (Task 3): epoch y run vigentes, plazo no vencido, cero permisos.
export const sealable = async (env, args) => (await drainState(env, args)) === 'drained';

// Reabre solo la compuerta de este run y epoch; el epoch sube para que un runner antiguo no pueda sellar después.
export async function openWriteGate(env, {run_id, epoch, now}) {
  const r = await env.DB.prepare(`UPDATE backup_write_gate SET state = 'open', epoch = epoch + 1, run_id = NULL,
    deadline = NULL, updated_at = ?3 WHERE id = 1 AND state = 'closed' AND epoch = ?1 AND run_id = ?2`)
    .bind(epoch, run_id, now).run();
  return r.meta.changes === 1;
}

// Un permiso abierto solo se cierra con una revisión de un admin que acredita que ya no puede mutar.
// La edad del permiso no es prueba: sin prueba válida el resultado es 'unknown' y la copia no se certifica.
export async function reconcileWritePermit(env, {id, proof}, now = () => new Date().toISOString()) {
  if (proof?.kind !== 'authorized_review' || typeof proof.reviewer !== 'string') return 'unknown';
  const r = await env.DB.prepare(`UPDATE backup_writers SET closed_at = ?3, close_reason = 'reconciled', reconciled_by = ?2
    WHERE id = ?1 AND closed_at IS NULL AND EXISTS (SELECT 1 FROM admins WHERE email = ?2)`)
    .bind(id, proof.reviewer, now()).run();
  if (r.meta.changes === 1) return 'closed';
  const row = await env.DB.prepare('SELECT closed_at FROM backup_writers WHERE id = ?1').bind(id).first();
  return row?.closed_at ? 'closed' : 'unknown';
}
