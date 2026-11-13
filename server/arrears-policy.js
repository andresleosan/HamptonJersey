import { fail } from './http.js';
import { realDate } from './viewings.js';
import { ARREARS_STEPS } from './rentals.js';
import { requireCaseCapability, prepareCaseCapabilityGuard } from './case-capabilities.js';

// Read-only internal projection. It creates no payment, adjustment, route or
// capability. The exported reader below checks case access in the same batch.
// Source dates must be selected by the server: a past date re-evaluates mutable
// charges/payments and is not a historical accounting snapshot.
// Internal parameters: ?1 Jersey date, ?2 optional tenancy, optional cursor.
const financialBalanceCtes = selection => `finance_scope AS MATERIALIZED (
  SELECT t.id AS tenancy_id,t.rental_id,t.financial_revision FROM tenancies t
  JOIN rentals r ON r.id=t.rental_id WHERE (?2 IS NULL OR t.id=?2) AND (${selection})
), adjusted AS MATERIALIZED (
  SELECT c.id,c.tenancy_id,c.due_on,c.amount,
    COALESCE((SELECT SUM(CASE a.kind WHEN 'writeoff' THEN a.amount_pence ELSE -a.amount_pence END)
      FROM charge_adjustments a WHERE a.charge_id=c.id AND a.effective_on<=?1),0) AS adjustment
  FROM charges c JOIN finance_scope s ON s.tenancy_id=c.tenancy_id WHERE c.due_on<=?1
), totals AS (
  SELECT tenancy_id,SUM(amount) AS due_pence,SUM(adjustment) AS adjustments_pence,
    SUM(CASE WHEN typeof(amount)<>'integer' THEN 1 ELSE 0 END) AS invalid_charges
    FROM adjusted GROUP BY tenancy_id
), paid AS (
  SELECT p.tenancy_id,SUM(p.amount) AS paid_pence,
    SUM(CASE WHEN typeof(p.amount)<>'integer' THEN 1 ELSE 0 END) AS invalid_payments
    FROM payments p JOIN finance_scope s ON s.tenancy_id=p.tenancy_id
  WHERE p.kind='rent' AND p.received_on<=?1 GROUP BY p.tenancy_id
), ordered AS (
  SELECT a.id,a.tenancy_id,a.due_on,SUM(a.amount-a.adjustment) OVER
    (PARTITION BY a.tenancy_id ORDER BY a.due_on,a.id ROWS UNBOUNDED PRECEDING) AS running
  FROM adjusted a JOIN totals t ON t.tenancy_id=a.tenancy_id LEFT JOIN paid p ON p.tenancy_id=a.tenancy_id
  WHERE t.due_pence-t.adjustments_pence>COALESCE(p.paid_pence,0)
), oldest AS (
  SELECT o.tenancy_id,MIN(o.due_on) AS oldest_unpaid_on FROM ordered o
  LEFT JOIN paid p ON p.tenancy_id=o.tenancy_id WHERE o.running>COALESCE(p.paid_pence,0) GROUP BY o.tenancy_id
), finance_balances AS (
  SELECT s.tenancy_id,s.rental_id,COALESCE(t.due_pence,0) AS due_pence,
    COALESCE(t.adjustments_pence,0) AS adjustments_pence,COALESCE(p.paid_pence,0) AS paid_pence,
    max(0,COALESCE(t.due_pence,0)-COALESCE(t.adjustments_pence,0)-COALESCE(p.paid_pence,0)) AS debt_pence,
    max(0,COALESCE(p.paid_pence,0)-(COALESCE(t.due_pence,0)-COALESCE(t.adjustments_pence,0))) AS credit_pence,
    o.oldest_unpaid_on,s.financial_revision AS source_revision,
    COALESCE(t.invalid_charges,0)+COALESCE(p.invalid_payments,0) AS invalid_amounts
  FROM finance_scope s LEFT JOIN totals t ON t.tenancy_id=s.tenancy_id LEFT JOIN paid p ON p.tenancy_id=s.tenancy_id
  LEFT JOIN oldest o ON o.tenancy_id=s.tenancy_id
)`;

// Internal SQL building blocks, not authorization. The paginated projection
// owns ?3; the arrears projection leaves ?3 and later binds to its caller.
// Do not substitute this in legacy routes until every reader is case-scoped
// and validates invalid_amounts in the same transaction as its operation.
export const FINANCIAL_BALANCE_CTES = financialBalanceCtes('?3 IS NULL OR t.id>?3');
const dueStep=`CASE ${ARREARS_STEPS.toReversed().map(([days,key])=>`WHEN days_late >= ${days} THEN '${key}'`).join(' ')} END`;
const arrearsCtes=selection=>`${financialBalanceCtes(selection)},
  finance_late AS (SELECT tenancy_id,rental_id,debt_pence-credit_pence AS balance,oldest_unpaid_on,
    CAST(julianday(?1)-julianday(oldest_unpaid_on) AS INTEGER) AS days_late,source_revision,invalid_amounts
    FROM finance_balances),
  arrears AS (SELECT a.*,CASE WHEN NOT EXISTS (SELECT 1 FROM arrears_steps x WHERE x.tenancy_id=a.tenancy_id
    AND x.charge_due_on=a.oldest_unpaid_on AND x.step=a.due_step) THEN a.due_step END AS next_step
    FROM (SELECT *,${dueStep} AS due_step FROM finance_late) a)`;
export const ARREARS_BALANCE_CTES = arrearsCtes('1');
// Internal fixed-set selection only. ?3 is a JSON array of validated tenancy
// IDs; the authorization guards for all IDs must run in the same batch.
export const SELECTED_ARREARS_BALANCE_CTES = arrearsCtes('t.id IN (SELECT value FROM json_each(?3))');

async function guardedFinancialRead(env, { tenancy_id, as_of } = {}, actor, projection) {
  if (!Number.isSafeInteger(tenancy_id) || tenancy_id <= 0 || !realDate(as_of)) fail(400, 'Invalid tenancy or date');
  const request={caseRef:{kind:'tenancy',id:tenancy_id},capability:'sensitive_finance',purpose:'arrears_management'};
  const snapshot=await requireCaseCapability(env,request,actor);
  const guard=await prepareCaseCapabilityGuard(env,request,actor,snapshot);
  const query=projection==='balance'
    ? env.DB.prepare(`WITH ${FINANCIAL_BALANCE_CTES}
      SELECT due_pence,adjustments_pence,paid_pence,debt_pence,credit_pence,oldest_unpaid_on,source_revision,invalid_amounts
      FROM finance_balances`).bind(as_of,tenancy_id,null)
    : env.DB.prepare(`WITH ${ARREARS_BALANCE_CTES}
      SELECT balance,oldest_unpaid_on,days_late,next_step,source_revision,invalid_amounts FROM arrears`).bind(as_of,tenancy_id);
  let result;
  try {
    [,result]=await env.DB.batch([guard.assertion,query,guard.release]);
  } catch (error) {
    // Convert a revoked or replaced grant to the same non-disclosing denial;
    // otherwise preserve database errors for the caller's normal handling.
    const current=await requireCaseCapability(env,request,actor);
    if (['grantId','grantVersion','membershipVersion','policyRevision'].some(k=>current[k]!==snapshot[k]))
      fail(403,'Case access unavailable');
    throw error;
  }
  result=result.results[0];
  if (!result) fail(403, 'Case access unavailable');
  const integers=projection==='balance'
    ? ['due_pence','adjustments_pence','paid_pence','debt_pence','credit_pence','source_revision']
    : ['balance','source_revision'];
  if (result.invalid_amounts!==0 || integers.some(key=>!Number.isSafeInteger(result[key])) ||
      (result.days_late!=null&&!Number.isSafeInteger(result.days_late))) fail(503,'Financial data unavailable');
  delete result.invalid_amounts;
  return result;
}

export const readTenancyBalance = (env, input, actor) => guardedFinancialRead(env,input,actor,'balance');
// source_revision covers financial movements; consumers changing an arrears
// step must also revalidate that step in their own transaction.
export const readTenancyArrears = (env, input, actor) => guardedFinancialRead(env,input,actor,'arrears');
