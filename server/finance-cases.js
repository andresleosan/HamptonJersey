import {fail} from './http.js';
import {realDate} from './viewings.js';
import {SELECTED_ARREARS_BALANCE_CTES} from './arrears-policy.js';
import {requireCaseCapability,prepareCaseCapabilityGuard} from './case-capabilities.js';
import {financeSummary,financeRevisionSchema,validateFinanceRevisionSchema} from './finance-summary.js';

// Internal bounded selection only; no discovery endpoint, aggregate across
// unknown cases, global clock, or authority to reconcile is provided here.
// A future route supplies the authenticated actor and server-selected date.
export async function readFinanceCases(env,{tenancy_ids,as_of}={},actor){
  if(!Array.isArray(tenancy_ids)||tenancy_ids.length<1||tenancy_ids.length>10||!realDate(as_of)||
    tenancy_ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(tenancy_ids).size!==tenancy_ids.length)
    fail(400,'Invalid financial case selection');
  const ids=[...tenancy_ids].sort((a,b)=>a-b);
  const requests=ids.map(id=>({caseRef:{kind:'tenancy',id},capability:'sensitive_finance',purpose:'arrears_management'}));
  const capabilities=await Promise.all(requests.map(request=>requireCaseCapability(env,request,actor)));
  const guards=await Promise.all(requests.map((request,i)=>prepareCaseCapabilityGuard(env,request,actor,capabilities[i])));
  const query=env.DB.prepare(`WITH ${SELECTED_ARREARS_BALANCE_CTES}
    SELECT f.tenancy_id,f.rental_id,f.due_pence,f.adjustments_pence,f.paid_pence,f.debt_pence,f.credit_pence,
      f.oldest_unpaid_on,f.source_revision,f.invalid_amounts,a.days_late,a.next_step,
      (SELECT COUNT(*) FROM charges c WHERE c.tenancy_id=f.tenancy_id AND c.due_on<=?1) AS due_charge_count
    FROM finance_balances f JOIN arrears a ON a.tenancy_id=f.tenancy_id ORDER BY f.tenancy_id`)
    .bind(as_of,null,JSON.stringify(ids));
  let result;
  try{result=await env.DB.batch([...guards.map(g=>g.assertion),financeRevisionSchema(env),query,...guards.map(g=>g.release)]);}
  catch(error){
    const current=await Promise.all(requests.map(request=>requireCaseCapability(env,request,actor)));
    if(current.some((snapshot,i)=>['grantId','grantVersion','membershipVersion','policyRevision']
      .some(key=>snapshot[key]!==capabilities[i][key])))fail(403,'Case access unavailable');
    throw error;
  }
  validateFinanceRevisionSchema(result[guards.length]);
  const rows=result[guards.length+1].results;
  if(rows.length!==ids.length||rows.some((row,i)=>row.tenancy_id!==ids[i]))fail(403,'Case access unavailable');
  return {as_of,cases:rows.map(row=>financeSummary(row,as_of))};
}
