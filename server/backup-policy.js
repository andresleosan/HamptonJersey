// PRE-14 · Task 1: política de la copia semanal (spec 2026-11-09-tp01-consistent-backup-design.md, «Estado y
// contratos»). Domingo 02:00 Europe/Jersey, tres intentos a +0/+10/+40 min del primero, 12 copias verificadas.
// La idempotencia la da week_start (UNIQUE en backup_runs): un tick repetido o retrasado devuelve la misma semana.
export const BACKUP_POLICY = Object.freeze({
  weekday: 0, hour: 2, attempt_offsets_min: Object.freeze([0, 10, 40]), keep_weeks: 12, drain_ms: 60_000, gate_ms: 300_000,
});

const DAY = 86_400_000, HOUR = 3_600_000;
const fmt = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});
// Hora de pared de Jersey como milisegundos «UTC» (sin zona), para operar con el calendario.
const wall = ms => {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
};
const instant = v => {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && new Date(t).toISOString() === v ? t : null;
};

// La última semana vencida (≤ now). Jersey cambia de hora a la 01:00 UTC, así que las 02:00 locales existen
// siempre: en marzo son las 01:00Z (BST) y en octubre las 02:00Z (GMT), una sola vez.
export function backupDue(nowUTC, policy = BACKUP_POLICY) {
  const now = instant(nowUTC);
  if (now === null) return null;
  const local = new Date(wall(now));
  const back = (local.getUTCDay() - policy.weekday + 7) % 7;
  let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back, policy.hour);
  if (target > local.getTime()) target -= 7 * DAY;
  const due = [target - HOUR, target].find(ms => wall(ms) === target);
  const week_start = new Date(due).toISOString();
  return {week_start, due_at: week_start};
}

// Hora del intento n (1..3), contada desde el inicio real del primero; null cuando no quedan intentos.
export function attemptAt(firstStartedAt, attempt, policy = BACKUP_POLICY) {
  const first = instant(firstStartedAt);
  const offset = policy.attempt_offsets_min[attempt - 1];
  return first === null || offset === undefined ? null : new Date(first + offset * 60_000).toISOString();
}
