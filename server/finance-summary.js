import {fail} from './http.js';
import {realDate} from './viewings.js';

// Read in the same batch as each snapshot. A partially applied schema must
// never make stale revisions appear valid to a future consumer.
const revisionTriggers=['finance_revision_monotonic','finance_charge_insert','finance_charge_update','finance_charge_delete',
  'finance_payment_insert','finance_payment_update','finance_payment_delete','finance_adjustment_insert',
  'finance_arrears_step_insert','finance_arrears_step_update','finance_arrears_step_delete'];
export const financeRevisionSchema=env=>env.DB.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger'
  AND name IN (${revisionTriggers.map(()=>'?').join(',')})`).bind(...revisionTriggers);
export function validateFinanceRevisionSchema(result){
  if(result?.results?.[0]?.n!==revisionTriggers.length)fail(503,'Financial data unavailable');
}

// Pure presentation of one already-authorized row. This helper grants no
// access: the query and all case guards must share the caller's D1 batch.
export function financeSummary(row,as_of){
  if(!row)fail(403,'Case access unavailable');
  const integers=['tenancy_id','rental_id','due_pence','adjustments_pence','paid_pence','debt_pence','credit_pence','source_revision','due_charge_count'];
  if(row.invalid_amounts!==0||integers.some(k=>!Number.isSafeInteger(row[k]))||row.source_revision<1||
    row.tenancy_id<1||row.rental_id<1||row.due_charge_count<0||
    (row.oldest_unpaid_on!==null&&!realDate(row.oldest_unpaid_on))||
    (row.days_late!==null&&!Number.isSafeInteger(row.days_late)))fail(503,'Financial data unavailable');
  // Recorded charges do not prove the history is complete. Missing charges
  // have no defensible zero balance or zero pending count.
  const recorded=row.due_charge_count>0;
  return {tenancy_id:row.tenancy_id,as_of,source_revision:row.source_revision,financial_status:recorded?'recorded_only':'unknown',
    balance:recorded?{due_pence:row.due_pence,adjustments_pence:row.adjustments_pence,paid_pence:row.paid_pence,
      debt_pence:row.debt_pence,credit_pence:row.credit_pence}:null,
    arrears:recorded?{oldest_unpaid_on:row.oldest_unpaid_on,days_late:row.days_late,next_step:row.next_step}:null,
    recorded_pending_count:recorded?(row.next_step===null?0:1):null,reconciliation_ready:false};
}
