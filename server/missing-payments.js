import { fail } from './http.js';
import { realDate } from './viewings.js';
import { FINANCIAL_BALANCE_CTES } from './arrears-policy.js';

// Internal projection only. It does not create notices or payments, grant
// capabilities, or expose case information through a route. Before any
// producer or endpoint can use it, it must enforce case-scoped access and
// revalidate every observation in its write transaction.
export async function missingPaymentRows(env, { today, grace_days, after = null, limit = 100 } = {}) {
  if (!realDate(today) || (grace_days !== undefined && (!Number.isSafeInteger(grace_days) || grace_days < 0 || grace_days > 30)) ||
      (after !== null && (!Number.isSafeInteger(after) || after < 1)) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail(400, 'Invalid missing-payment query');
  const grace=`COALESCE(?4,(SELECT json_extract(value,'$.grace_days') FROM app_settings WHERE key='missing_payments'),3)`;
  const [settings,result] = await env.DB.batch([
    env.DB.prepare(`SELECT json_type(value,'$.grace_days') AS grace_type,json_extract(value,'$.grace_days') AS grace_days,
      json_type(value,'$.revision') AS revision_type,json_extract(value,'$.revision') AS revision
      FROM app_settings WHERE key='missing_payments'`),
    env.DB.prepare(`WITH ${FINANCIAL_BALANCE_CTES}
    SELECT tenancy_id,rental_id,oldest_unpaid_on,debt_pence,source_revision,invalid_amounts,
      date(oldest_unpaid_on,'+'||${grace}||' days') AS visible_on FROM finance_balances
    WHERE invalid_amounts>0 OR (debt_pence>0 AND oldest_unpaid_on IS NOT NULL AND date(oldest_unpaid_on,'+'||${grace}||' days')<=?1)
    ORDER BY tenancy_id LIMIT ?5`).bind(today,null,after,grace_days??null,limit+1),
  ]);
  const policy=settings.results[0];
  if (policy && (policy.grace_type!=='integer' || !Number.isSafeInteger(policy.grace_days) || policy.grace_days<0 || policy.grace_days>30 ||
      policy.revision_type!=='integer' || !Number.isSafeInteger(policy.revision) || policy.revision<1)) fail(503, 'Missing-payment policy is unavailable');
  if (result.results.some(row=>row.invalid_amounts!==0 || !Number.isSafeInteger(row.debt_pence) || !Number.isSafeInteger(row.source_revision)))
    fail(503,'Financial data unavailable');
  const rows=result.results.slice(0,limit);
  for (const row of rows) delete row.invalid_amounts;
  return { rows, next: result.results.length>limit ? rows.at(-1).tenancy_id : null, policy_revision:policy?.revision??0 };
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
