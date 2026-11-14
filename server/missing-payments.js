import { fail, now } from './http.js';
import { realDate, jerseyToday } from './viewings.js';
import { FINANCIAL_BALANCE_CTES } from './arrears-policy.js';
import { ARREARS_STEPS } from './rentals.js';
import { OWED_SQL } from './routes/rent.js';

// NOT-05's grace period, shared by the tab below and the internal projection: app_settings 'missing_payments'
// {grace_days 0..30, revision >= 1}; without the row, DEFAULT_GRACE at revision 0. It only decides when a debt shows:
// it never moves a due date or the arrears steps (+1/+5/+7/+10/+14).
const DEFAULT_GRACE = 3;
const POLICY = `SELECT json_type(value,'$.grace_days') AS grace_type,json_extract(value,'$.grace_days') AS grace_days,
  json_type(value,'$.revision') AS revision_type,json_extract(value,'$.revision') AS revision
  FROM app_settings WHERE key='missing_payments'`;
const GRACE_SQL = `COALESCE((SELECT json_extract(value,'$.grace_days') FROM app_settings WHERE key='missing_payments'),${DEFAULT_GRACE})`;
function gracePolicy(policy) {
  if (!policy) return { grace_days: DEFAULT_GRACE, revision: 0 };
  if (policy.grace_type!=='integer' || !Number.isSafeInteger(policy.grace_days) || policy.grace_days<0 || policy.grace_days>30 ||
      policy.revision_type!=='integer' || !Number.isSafeInteger(policy.revision) || policy.revision<1) fail(503, 'Missing-payment policy is unavailable');
  return { grace_days: policy.grace_days, revision: policy.revision };
}

// Internal ADM-09 projection only, not the tab's reader: it needs migration 0045 (charge_adjustments and
// tenancies.financial_revision). It does not create notices or payments, grant
// capabilities, or expose case information through a route. Before any
// producer or endpoint can use it, it must enforce case-scoped access and
// revalidate every observation in its write transaction.
export async function missingPaymentRows(env, { today, grace_days, after = null, limit = 100 } = {}) {
  if (!realDate(today) || (grace_days !== undefined && (!Number.isSafeInteger(grace_days) || grace_days < 0 || grace_days > 30)) ||
      (after !== null && (!Number.isSafeInteger(after) || after < 1)) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail(400, 'Invalid missing-payment query');
  const grace=`COALESCE(?4,${GRACE_SQL})`;
  const [settings,result] = await env.DB.batch([
    env.DB.prepare(POLICY),
    env.DB.prepare(`WITH ${FINANCIAL_BALANCE_CTES}
    SELECT tenancy_id,rental_id,oldest_unpaid_on,debt_pence,source_revision,invalid_amounts,
      date(oldest_unpaid_on,'+'||${grace}||' days') AS visible_on FROM finance_balances
    WHERE invalid_amounts>0 OR (debt_pence>0 AND oldest_unpaid_on IS NOT NULL AND date(oldest_unpaid_on,'+'||${grace}||' days')<=?1)
    ORDER BY tenancy_id LIMIT ?5`).bind(today,null,after,grace_days??null,limit+1),
  ]);
  const policy=gracePolicy(settings.results[0]);
  if (result.results.some(row=>row.invalid_amounts!==0 || !Number.isSafeInteger(row.debt_pence) || !Number.isSafeInteger(row.source_revision)))
    fail(503,'Financial data unavailable');
  const rows=result.results.slice(0,limit);
  for (const row of rows) delete row.invalid_amounts;
  return { rows, next: result.results.length>limit ? rows.at(-1).tenancy_id : null, policy_revision:policy.revision };
}

export function missingPaymentDescriptor(row) {
  if (!row || !Number.isSafeInteger(row.tenancy_id) || row.tenancy_id < 1 ||
      !Number.isSafeInteger(row.rental_id) || row.rental_id < 1 || !realDate(row.oldest_unpaid_on) ||
      !Number.isSafeInteger(row.debt_pence) || row.debt_pence < 1 ||
      !Number.isSafeInteger(row.source_revision) || row.source_revision < 1) fail(400, 'Invalid missing-payment projection');
  return { taskKey:`rental:${row.tenancy_id}:${row.oldest_unpaid_on}`, category:'payment',
    title:'Missing rent payment', target:{kind:'rental',id:String(row.rental_id),context:{tenancy_id:row.tenancy_id}},
    // A future producer must compare this token in its write batch. It is not
    // the notification's sourceVersion, which is an observation event ID.
    observedFinancialRevision:row.source_revision, requiresAction:true, resolved:false, preserveDone:true };
}

// NOT-05 (flag NOT05_MISSING_PAYMENTS_READY, no migration): the Inbox's Missing payments tab. Rent charges due and not
// paid in full, from the balances Rentals › To do › Arrears shows (OWED_SQL: the same CTEs, ended tenancies too: a tenant
// who moved out still owes it), once grace_days have passed since the oldest unpaid charge fell due. Read only: it makes
// no charge, payment, step or notice; the charges are those the Rentals screen and its nav count keep up to date.
// next_step is the Arrears step to take (none after move-out: steps are for running tenancies); done_step, the step due
// that was marked done, which is no proof of payment. ponytail: the LIMIT longest overdue; count and owed cover them all.
const STEP = Object.fromEntries(ARREARS_STEPS.map(([days, step, label]) => [step, { days, step, label }]));
const LIMIT = 200;
export const missingPaymentsReady = env => env?.NOT05_MISSING_PAYMENTS_READY === '1';
export async function missingPayments(env, today = jerseyToday()) {
  const [settings, owed] = (await env.DB.batch([env.DB.prepare(POLICY),
    env.DB.prepare(`WITH ${OWED_SQL} SELECT a.tenancy_id, a.rental_id, r.address, t.tenant_name, t.payment_ref, t.ended_on, a.balance,
      a.oldest_unpaid_on, a.days_late, a.due_step, a.next_step, COUNT(*) OVER () AS n, SUM(a.balance) OVER () AS total
      FROM arrears a JOIN tenancies t ON t.id = a.tenancy_id JOIN rentals r ON r.id = a.rental_id
      WHERE a.balance > 0 AND a.oldest_unpaid_on IS NOT NULL AND a.days_late >= ${GRACE_SQL}
      ORDER BY a.days_late DESC, r.address COLLATE NOCASE, a.tenancy_id LIMIT ${LIMIT}`).bind(today, null)])).map(r => r.results);
  const { grace_days, revision } = gracePolicy(settings[0]);
  if (owed.some(p => !Number.isSafeInteger(p.balance) || !Number.isSafeInteger(p.days_late) || !Number.isSafeInteger(p.total)))
    fail(503, 'Financial data unavailable');
  const payments = owed.map(({ due_step, next_step, n, total, ...p }) => {
    const ended = p.ended_on != null && p.ended_on <= today;
    return { ...p, next_step: ended ? null : STEP[next_step] ?? null, done_step: ended || next_step ? null : STEP[due_step] ?? null };
  });
  return { as_of: today, grace_days, revision, count: owed[0]?.n ?? 0, owed: owed[0]?.total ?? 0, payments };
}

// The grace period, compare-and-set on its revision in one statement (a stale form is a 409, nothing written).
export async function saveGrace(env, body, admin) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Invalid format');
  const { grace_days, expectedRevision } = body;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail(400, 'Reload the page and try again');
  if (!Number.isSafeInteger(grace_days) || grace_days < 0 || grace_days > 30)
    return { errors: { grace_days: 'Enter a whole number of days from 0 to 30' } };
  const { meta } = await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at, updated_by)
    SELECT 'missing_payments', json_object('grace_days', CAST(?1 AS INTEGER), 'revision', CAST(?2 AS INTEGER) + 1), ?3, ?4
    WHERE COALESCE((SELECT json_extract(value, '$.revision') FROM app_settings WHERE key = 'missing_payments'), 0) = ?2
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(grace_days, expectedRevision, now(), admin).run();
  if (!meta.changes) fail(409, 'Someone else changed the grace period meanwhile. Reload to see it.');
  return { grace_days, revision: expectedRevision + 1 };
}
