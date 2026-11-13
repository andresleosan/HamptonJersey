import {fail,sha256} from './http.js';
import {realDate} from './viewings.js';
import {ARREARS_BALANCE_CTES} from './arrears-policy.js';
import {requireCaseCapability,prepareCaseCapabilityGuard} from './case-capabilities.js';

// Internal case-scoped adapter only: there is no HTTP route or activation
// switch here. A future owner must supply the authenticated actor and a
// server-selected Jersey date, enforce no-store, and apply its own UI policy.
const TYPES=new Set(['charge','payment','adjustment']);
const HASH=/^[a-f0-9]{64}$/;
const keys=['v','date','type','id','as_of','tag'];
function validateCursor(cursor,asOf){
  if(cursor===null)return;
  if(!cursor||typeof cursor!=='object'||Array.isArray(cursor)||Object.keys(cursor).length!==keys.length||
    keys.some(key=>!Object.hasOwn(cursor,key))||cursor.v!==1||!realDate(cursor.date)||!realDate(cursor.as_of)||
    cursor.date>cursor.as_of||!TYPES.has(cursor.type)||!Number.isSafeInteger(cursor.id)||cursor.id<1||
    typeof cursor.tag!=='string'||!HASH.test(cursor.tag))fail(400,'Invalid financial cursor');
  if(cursor.as_of!==asOf)fail(409,'Financial date changed; reload');
}

export async function readFinanceWorkspace(env,{tenancy_id,as_of,limit=50,cursor=null}={},actor){
  if(!Number.isSafeInteger(tenancy_id)||tenancy_id<1||!realDate(as_of)||!Number.isSafeInteger(limit)||limit<1||limit>50)
    fail(400,'Invalid financial query');
  validateCursor(cursor,as_of);
  const request={caseRef:{kind:'tenancy',id:tenancy_id},capability:'sensitive_finance',purpose:'arrears_management'};
  const capability=await requireCaseCapability(env,request,actor);
  const guard=await prepareCaseCapabilityGuard(env,request,actor,capability);
  const summary=env.DB.prepare(`WITH ${ARREARS_BALANCE_CTES}
    SELECT f.tenancy_id,f.rental_id,f.due_pence,f.adjustments_pence,f.paid_pence,f.debt_pence,f.credit_pence,
      f.oldest_unpaid_on,f.source_revision,f.invalid_amounts,a.days_late,a.next_step,
      (SELECT COUNT(*) FROM charges c WHERE c.tenancy_id=f.tenancy_id AND c.due_on<=?1) AS due_charge_count,
      (SELECT json_group_array(json_array(step,done_at)) FROM (SELECT step,done_at FROM arrears_steps
        WHERE tenancy_id=f.tenancy_id AND charge_due_on=f.oldest_unpaid_on ORDER BY step LIMIT 101)) AS steps
    FROM finance_balances f JOIN arrears a ON a.tenancy_id=f.tenancy_id`).bind(as_of,tenancy_id);
  const history=env.DB.prepare(`WITH transactions AS (
      SELECT c.due_on AS date,'charge' AS type,c.id,c.amount AS amount_pence,c.kind
        FROM charges c WHERE c.tenancy_id=?1 AND c.due_on<=?2
      UNION ALL SELECT p.received_on,'payment',p.id,p.amount,p.kind
        FROM payments p WHERE p.tenancy_id=?1 AND p.received_on<=?2
      UNION ALL SELECT a.effective_on,'adjustment',a.id,a.amount_pence,a.kind
        FROM charge_adjustments a JOIN charges c ON c.id=a.charge_id WHERE c.tenancy_id=?1 AND a.effective_on<=?2
    ) SELECT date,type,id,amount_pence,kind FROM transactions
    WHERE ?3 IS NULL OR date>?3 OR (date=?3 AND (type>?4 OR (type=?4 AND id>?5)))
    ORDER BY date,type,id LIMIT ?6`).bind(tenancy_id,as_of,cursor?.date??null,cursor?.type??null,cursor?.id??null,limit+1);
  let state,transactions;
  try{[,state,transactions]=await env.DB.batch([guard.assertion,summary,history,guard.release]);}
  catch(error){
    const current=await requireCaseCapability(env,request,actor);
    if(['grantId','grantVersion','membershipVersion','policyRevision'].some(k=>current[k]!==capability[k]))
      fail(403,'Case access unavailable');
    throw error;
  }
  const row=state.results[0];
  if(!row)fail(403,'Case access unavailable');
  const integers=['tenancy_id','rental_id','due_pence','adjustments_pence','paid_pence','debt_pence','credit_pence','source_revision','due_charge_count'];
  if(row.invalid_amounts!==0||integers.some(k=>!Number.isSafeInteger(row[k]))||row.source_revision<1||
    (row.oldest_unpaid_on!==null&&!realDate(row.oldest_unpaid_on))||
    (row.days_late!==null&&!Number.isSafeInteger(row.days_late)))fail(503,'Financial data unavailable');
  let steps;
  try{steps=JSON.parse(row.steps);}catch{fail(503,'Financial data unavailable');}
  if(!Array.isArray(steps)||steps.length>100||steps.some(s=>!Array.isArray(s)||s.length!==2||
    typeof s[0]!=='string'||s[0].length>100||typeof s[1]!=='string'||s[1].length>100))fail(503,'Financial data unavailable');
  const snapshot={v:1,actor,tenancy_id,as_of,rental_id:row.rental_id,
    source_revision:row.source_revision,grantId:capability.grantId,grantVersion:capability.grantVersion,
    membershipVersion:capability.membershipVersion,policyRevision:capability.policyRevision,
    oldest:row.oldest_unpaid_on,next_step:row.next_step,due_charge_count:row.due_charge_count,steps};
  // This fingerprint detects changes between pages; it is not a bearer
  // credential. Every page independently revalidates case authorization.
  const tagFor=position=>sha256(JSON.stringify({...snapshot,position:{date:position.date,type:position.type,id:position.id}}));
  if(cursor&&cursor.tag!==await tagFor(cursor))fail(409,'Financial data changed; reload');
  if(transactions.results.some(item=>!realDate(item.date)||!TYPES.has(item.type)||!Number.isSafeInteger(item.id)||item.id<1||
    !Number.isSafeInteger(item.amount_pence)||item.amount_pence<1||typeof item.kind!=='string'))fail(503,'Financial data unavailable');
  const items=transactions.results.slice(0,limit),last=items.at(-1);
  const next=transactions.results.length>limit?{v:1,date:last.date,type:last.type,id:last.id,as_of,tag:await tagFor(last)}:null;
  // Recorded charges do not prove the history is complete. Missing charges
  // have no defensible zero balance or zero pending count.
  const recorded=row.due_charge_count>0;
  return {tenancy_id,as_of,source_revision:row.source_revision,financial_status:recorded?'recorded_only':'unknown',
    balance:recorded?{due_pence:row.due_pence,adjustments_pence:row.adjustments_pence,paid_pence:row.paid_pence,
      debt_pence:row.debt_pence,credit_pence:row.credit_pence}:null,
    arrears:recorded?{oldest_unpaid_on:row.oldest_unpaid_on,days_late:row.days_late,next_step:row.next_step}:null,
    recorded_pending_count:recorded?(row.next_step===null?0:1):null,
    reconciliation_ready:false,transactions:items,next};
}
