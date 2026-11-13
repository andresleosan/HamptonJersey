import {fail} from './http.js';
import {realDate,weekday} from './viewings.js';
import {saleFollowupWindow} from './sale-followup-schedule.js';
import {taskStatements,deadline} from './notification-tasks.js';
import {requireCaseCapability,prepareCaseCapabilityGuard} from './case-capabilities.js';

// Disconnected prototype: its schema, source identity and schedule authority
// are not installed or proved by this module. It must not be wired to a clock.
const GENERATION=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validate(input){
  if(!input||!Number.isSafeInteger(input.saleId)||input.saleId<1||!realDate(input.weekStart)||input.weekStart.startsWith('0000-')||weekday(input.weekStart)!=='mon'
      ||typeof input.sourceGeneration!=='string'||!GENERATION.test(input.sourceGeneration)
      ||!Number.isSafeInteger(input.sourceRevision)||input.sourceRevision<1)fail(400,'Invalid follow-up identity');
}
async function authority(env,input,actor){
  const request={caseRef:{kind:'sale',id:input.saleId},capability:'case_data_write',purpose:'sale_review'};
  const snapshot=await requireCaseCapability(env,request,actor);
  return {request,guard:await prepareCaseCapabilityGuard(env,request,actor,snapshot)};
}
async function execute(env,request,actor,statements){
  try{return await env.DB.batch(statements);}
  catch(error){
    // A concurrent revocation must remain a denial, not a database error or write.
    await requireCaseCapability(env,request,actor);
    throw error;
  }
}
const marker=(env,token)=>env.DB.prepare(`INSERT INTO ofe06_pending(operation_id,event_id)
  SELECT ?,last_insert_rowid() WHERE changes()=1`).bind(token);
const assertion=(env,token)=>env.DB.prepare(`INSERT INTO ofe06_batch_assertions(operation_id,valid)
  SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM ofe06_pending WHERE operation_id=?)
    OR EXISTS(SELECT 1 FROM ofe06_pending p JOIN ofe06_followups f ON f.event_id=p.event_id WHERE p.operation_id=?)
    THEN 1 ELSE 0 END`).bind(token,token,token);
const cleanup=(env,token)=>[
  env.DB.prepare('DELETE FROM ofe06_batch_assertions WHERE operation_id=?').bind(token),
  env.DB.prepare('DELETE FROM ofe06_pending WHERE operation_id=?').bind(token),
];

export async function prepareSaleFollowup(env,input,actor){
  validate(input);
  const window=saleFollowupWindow(input.at,input.schedule);
  const due=window.state==='due'&&window.dueWindows.find(item=>item.weekStart===input.weekStart);
  if(!due)fail(400,'Follow-up window unavailable');
  const {request,guard}=await authority(env,input,actor);
  // Read under the same capability snapshot and require an exact UTC birth date.
  // The write batch below rechecks this value alongside identity and revision.
  const source=env.DB.prepare(`SELECT s.created_at FROM sales s JOIN ofe06_sale_sources v ON v.sale_id=s.id
    WHERE s.id=? AND s.status='in_progress' AND v.generation=? AND v.revision=?`)
    .bind(input.saleId,input.sourceGeneration,input.sourceRevision);
  const observed=await execute(env,request,actor,[guard.assertion,source,guard.release]);
  const createdAt=observed[1].results[0]?.created_at;
  if(typeof createdAt!=='string'||createdAt.startsWith('0000-'))return {state:'unavailable'};
  try{deadline(createdAt);}catch{return {state:'unavailable'};}
  // Equality does not establish whether creation preceded a deadline within the same millisecond.
  if(createdAt>=due.dueAt)return {state:'unavailable'};
  const token=crypto.randomUUID(),key=`sale-followup:${input.saleId}:${input.weekStart}`;
  const event=env.DB.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    SELECT ?,?,'applicant',CAST(s.applicant_id AS TEXT),'sale.followup_due',
      json_object('version',1,'sale_id',s.id,'week_start',?,'due_at',?)
    FROM sales s JOIN ofe06_sale_sources v ON v.sale_id=s.id
    WHERE s.id=? AND s.status='in_progress' AND v.generation=? AND v.revision=?
      AND s.created_at=? AND s.created_at<?
      AND NOT EXISTS(SELECT 1 FROM ofe06_followups f WHERE f.sale_id=s.id AND f.week_start=?)
      AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.task_key=?)`)
    .bind(input.at,actor,input.weekStart,due.dueAt,input.saleId,input.sourceGeneration,input.sourceRevision,createdAt,due.dueAt,input.weekStart,key);
  const projection=taskStatements(env,{eventId:null,taskKey:key,target:{kind:'sale',id:String(input.saleId)},
    category:'task',title:'Review sale progress',dueAt:due.dueAt,preserveDone:true},{ifInserted:true});
  const insert=env.DB.prepare(`INSERT INTO ofe06_followups(sale_id,generation,week_start,scheduled_due_at,source_revision,task_id,event_id,status)
    SELECT ?,?,?,?,?,n.id,p.event_id,'open' FROM ofe06_pending p JOIN notifications n ON n.task_key=? AND n.event_id=p.event_id
    WHERE p.operation_id=? AND changes()=1`).bind(input.saleId,input.sourceGeneration,input.weekStart,due.dueAt,input.sourceRevision,key,token);
  const read=env.DB.prepare(`SELECT f.id AS followup_id,f.task_id,f.source_revision,f.status,f.scheduled_due_at FROM ofe06_followups f
    JOIN sales s ON s.id=f.sale_id JOIN ofe06_sale_sources v ON v.sale_id=s.id
    JOIN notifications n ON n.id=f.task_id JOIN events e ON e.id=f.event_id AND e.id=n.event_id
    WHERE f.sale_id=? AND f.week_start=? AND f.generation=? AND v.generation=? AND v.revision=? AND s.status='in_progress'
      AND s.created_at=? AND s.created_at<? AND s.created_at<f.scheduled_due_at
      AND f.status='open' AND f.source_revision<=v.revision AND n.task_key=? AND n.target_deleted=0
      AND n.target_kind='sale' AND n.target_id=CAST(s.id AS TEXT) AND e.type='sale.followup_due'
      AND e.entity_type='applicant' AND e.entity_id=CAST(s.applicant_id AS TEXT)
      AND CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.sale_id') END=s.id
      AND CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.week_start') END=f.week_start
      AND CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.due_at') END=f.scheduled_due_at`)
    .bind(input.saleId,input.weekStart,input.sourceGeneration,input.sourceGeneration,input.sourceRevision,createdAt,due.dueAt,key);
  const statements=[guard.assertion,event,marker(env,token),...projection,insert,assertion(env,token),read,...cleanup(env,token),guard.release];
  const result=await execute(env,request,actor,statements),row=result[statements.indexOf(read)].results[0];
  if(!row||typeof row.scheduled_due_at!=='string'||row.scheduled_due_at.startsWith('0000-'))return {state:'unavailable'};
  try{deadline(row.scheduled_due_at);}catch{return {state:'unavailable'};}
  return {state:result[1].meta.changes===1?'created':row.source_revision===input.sourceRevision&&row.scheduled_due_at===due.dueAt?'existing':'needs_review',
    followupId:row.followup_id,taskId:row.task_id};
}
export async function closeSaleFollowup(env,input,actor){
  validate(input);
  if(typeof input.at!=='string'||input.at.startsWith('0000-'))fail(400,'Invalid processing time');
  deadline(input.at);
  const {request,guard}=await authority(env,input,actor),token=crypto.randomUUID();
  const key=`sale-followup:${input.saleId}:${input.weekStart}`;
  const event=env.DB.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    SELECT ?,?,'applicant',CAST(s.applicant_id AS TEXT),'sale.followup_closed',
      json_object('version',1,'sale_id',s.id,'week_start',?,'due_at',f.scheduled_due_at)
    FROM sales s JOIN ofe06_sale_sources v ON v.sale_id=s.id
    JOIN ofe06_followups f ON f.sale_id=s.id JOIN notifications n ON n.id=f.task_id
    JOIN events previous ON previous.id=n.event_id
    WHERE s.id=? AND s.status IN ('completed','fallen_through') AND s.closed_at<=?
      AND strftime('%Y-%m-%dT%H:%M:%fZ',s.closed_at) IS s.closed_at
      AND v.generation=? AND v.revision=? AND f.week_start=? AND f.generation=? AND f.status='open' AND f.source_revision<=v.revision
      AND n.task_key=? AND n.target_kind='sale' AND n.target_id=CAST(s.id AS TEXT) AND n.target_deleted=0
      AND f.event_id=n.event_id AND previous.type='sale.followup_due'
      AND previous.entity_type='applicant' AND previous.entity_id=CAST(s.applicant_id AS TEXT)
      AND CASE WHEN json_valid(previous.data) THEN json_extract(previous.data,'$.sale_id') END=s.id
      AND CASE WHEN json_valid(previous.data) THEN json_extract(previous.data,'$.week_start') END=f.week_start
      AND CASE WHEN json_valid(previous.data) THEN json_extract(previous.data,'$.due_at') END=f.scheduled_due_at`)
    .bind(input.at,actor,input.weekStart,input.saleId,input.at,input.sourceGeneration,input.sourceRevision,
      input.weekStart,input.sourceGeneration,key);
  const projection=taskStatements(env,{eventId:null,taskKey:key,target:{kind:'sale',id:String(input.saleId)},
    category:'task',title:'Review sale progress',resolved:true,preserveDone:true},{ifInserted:true});
  const update=env.DB.prepare(`UPDATE ofe06_followups SET status='source_closed',source_revision=?,
      event_id=(SELECT p.event_id FROM ofe06_pending p WHERE p.operation_id=?)
    WHERE sale_id=? AND week_start=? AND generation=? AND status='open' AND changes()=1
      AND EXISTS(SELECT 1 FROM ofe06_pending p JOIN notifications n ON n.id=ofe06_followups.task_id
        AND n.event_id=p.event_id WHERE p.operation_id=?)`)
    .bind(input.sourceRevision,token,input.saleId,input.weekStart,input.sourceGeneration,token);
  const read=env.DB.prepare(`SELECT f.id AS followup_id,f.task_id,f.status FROM ofe06_followups f
    JOIN sales s ON s.id=f.sale_id JOIN ofe06_sale_sources v ON v.sale_id=s.id
    JOIN notifications n ON n.id=f.task_id JOIN events e ON e.id=f.event_id AND e.id=n.event_id
    WHERE f.sale_id=? AND f.week_start=? AND f.generation=? AND v.generation=? AND v.revision=?
      AND s.status IN ('completed','fallen_through') AND s.closed_at<=? AND f.status='source_closed'
      AND f.source_revision<=v.revision AND n.task_key=? AND n.target_deleted=0
      AND n.target_kind='sale' AND n.target_id=CAST(s.id AS TEXT) AND e.type='sale.followup_closed'
      AND e.entity_type='applicant' AND e.entity_id=CAST(s.applicant_id AS TEXT)
      AND CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.sale_id') END=s.id
      AND CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.week_start') END=f.week_start
      AND CASE WHEN json_valid(e.data) THEN json_extract(e.data,'$.due_at') END=f.scheduled_due_at`)
    .bind(input.saleId,input.weekStart,input.sourceGeneration,input.sourceGeneration,input.sourceRevision,input.at,key);
  const statements=[guard.assertion,event,marker(env,token),...projection,update,assertion(env,token),read,...cleanup(env,token),guard.release];
  const result=await execute(env,request,actor,statements),row=result[statements.indexOf(read)].results[0];
  return row?.status==='source_closed'?{state:'closed',followupId:row.followup_id,taskId:row.task_id}:{state:'unavailable'};
}
