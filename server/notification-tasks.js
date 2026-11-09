import {fail,now,sha256} from './http.js';
import {NOTICE_SELECT,noticeDto,TASK_CATEGORIES} from './notification-query.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const targetExists=(kind,id)=>`((${kind}='applicant' AND EXISTS(SELECT 1 FROM applicants WHERE id=${id}))
  OR (${kind}='viewing' AND EXISTS(SELECT 1 FROM viewing_requests WHERE id=${id}))
  OR (${kind}='contact' AND EXISTS(SELECT 1 FROM contacts WHERE id=${id}))
  OR (${kind}='listing' AND EXISTS(SELECT 1 FROM listings WHERE id=${id})))`;
const currentTarget=targetExists('e.entity_type','e.entity_id');
const keyText=(value,label,max)=>{
  if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail(400,`Invalid ${label}`);
  return value.trim();
};
export function deadline(value) {
  if(value===null)return null;
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    ||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail(400,'Use a valid UTC deadline');
  return value;
}
export function taskTarget(value,manual=false) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['kind','id'].includes(k)))fail(400,'Choose a task target');
  const kind=value.kind,id=String(value.id??'');
  if(!(manual?['applicant','viewing']:['applicant','viewing','contact','listing']).includes(kind))fail(400,'Invalid task target');
  if(kind==='listing'?!/^HE-[A-Z]\d{3,}$/.test(id):!(/^[1-9]\d*$/.test(id)&&Number.isSafeInteger(Number(id))))fail(400,'Invalid task target');
  return {kind,id};
}
function projectDescriptor(d) {
  if(!d||typeof d!=='object')fail(400,'Invalid task descriptor');
  const target=taskTarget(d.target),taskKey=keyText(d.taskKey,'task key',200),title=keyText(d.title,'task title',200);
  if(!/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/.test(taskKey)||!TASK_CATEGORIES.includes(d.category))fail(400,'Invalid task identity or category');
  if(d.sourceVersion!=null&&(!Number.isSafeInteger(d.sourceVersion)||d.sourceVersion<1))fail(400,'Invalid source version');
  for(const field of ['requiresAction','resolved','reopen'])if(d[field]!==undefined&&typeof d[field]!=='boolean')fail(400,`Invalid ${field}`);
  const reason=d.reason==null?null:keyText(d.reason,'task reason',500);
  const dueSet=Object.hasOwn(d,'dueAt'),due=dueSet?deadline(d.dueAt):null;
  const urgencySet=Object.hasOwn(d,'urgency'),urgency=d.urgency??'normal';
  if(!['normal','urgent'].includes(urgency))fail(400,'Invalid urgency');
  const assigned=d.initialAssignedTo==null?null:keyText(d.initialAssignedTo,'assignee',254);
  const actor=d.actor==null?null:keyText(d.actor,'actor',254);
  return {taskKey,title,category:d.category,target,reason,due,dueSet,urgency,urgencySet,assigned,actor,
    version:d.sourceVersion??null,action:d.requiresAction===false?0:1,resolved:d.resolved===true?1:0,reopen:d.reopen===true?1:0};
}

// One materialized source and one UPSERT also handle a group of projections. No later projection
// can consume a notice/history rowid or another projection's changes(). Concrete event IDs work outside a producer batch.
export function taskStatements(env,descriptor,{ifInserted=false}={}) {
  const descriptors=Array.isArray(descriptor)?descriptor:[descriptor];
  if(!descriptors.length||descriptors.length>50)fail(400,'Use between 1 and 50 task projections');
  const eventId=descriptors[0]?.eventId??null;
  if(eventId===null&&!ifInserted)fail(400,'A fresh event reference requires the ifInserted guard');
  if(eventId!==null&&(!Number.isSafeInteger(eventId)||eventId<1))fail(400,'Invalid event ID');
  if(descriptors.some(d=>(d.eventId??null)!==eventId))fail(400,'Grouped projections must reference one event');
  const values=descriptors.map(projectDescriptor);
  if(new Set(values.map(d=>d.taskKey)).size!==values.length)fail(400,'Duplicate task projection key');
  const ts=now(),args=[eventId];
  for(const d of values)args.push(d.taskKey,d.version,d.category,d.title,d.reason,
    d.target.kind,d.target.id,d.action,d.resolved,d.due,Number(d.dueSet),d.assigned,d.actor,d.urgency,Number(d.urgencySet),d.reopen);
  args.push(ts,ts);
  const columns='task_key,source_version,category,title,reason,target_kind,target_id,requires_action,resolved,due_at,due_set,assigned_to,actor,urgency,urgency_set,reopen';
  return [env.DB.prepare(`WITH source AS MATERIALIZED (
      SELECT id,actor,entity_type,entity_id FROM events WHERE id=COALESCE(?,last_insert_rowid())${ifInserted?' AND changes()=1':''}
    ),incoming(${columns}) AS (VALUES ${values.map(()=>`(${Array(16).fill('?').join(',')})`).join(',')})
    INSERT INTO notifications(task_key,event_id,source_version,category,title,task_reason,action_required,created_at,
      resolved_at,resolved_by,due_at,assigned_to,urgency,closed_by_source,task_actor,task_action)
    SELECT i.task_key,e.id,COALESCE(i.source_version,e.id),i.category,i.title,i.reason,i.requires_action,?,
      CASE WHEN i.resolved=1 THEN ? END,CASE WHEN i.resolved=1 THEN COALESCE(i.actor,e.actor) END,
      i.due_at,i.assigned_to,i.urgency,i.resolved,COALESCE(i.actor,e.actor),CASE WHEN i.resolved=1 THEN 'source_resolved' ELSE 'source_update' END
    FROM incoming i CROSS JOIN source e
    WHERE e.entity_type=i.target_kind AND e.entity_id=i.target_id AND ${currentTarget}
      AND (i.assigned_to IS NULL OR EXISTS(SELECT 1 FROM admins WHERE email=i.assigned_to))
    ON CONFLICT(task_key) DO UPDATE SET event_id=excluded.event_id,source_version=excluded.source_version,
      category=excluded.category,title=excluded.title,task_reason=excluded.task_reason,action_required=excluded.action_required,
      due_at=CASE WHEN (SELECT due_set FROM incoming WHERE task_key=excluded.task_key)=1 THEN excluded.due_at ELSE notifications.due_at END,
      urgency=CASE WHEN (SELECT urgency_set FROM incoming WHERE task_key=excluded.task_key)=1 THEN excluded.urgency ELSE notifications.urgency END,
      resolved_at=CASE WHEN excluded.resolved_at IS NOT NULL THEN COALESCE(notifications.resolved_at,excluded.resolved_at)
        WHEN notifications.closed_by_source=1 AND (SELECT reopen FROM incoming WHERE task_key=excluded.task_key)=0 THEN notifications.resolved_at ELSE NULL END,
      resolved_by=CASE WHEN excluded.resolved_at IS NOT NULL THEN COALESCE(notifications.resolved_by,excluded.resolved_by)
        WHEN notifications.closed_by_source=1 AND (SELECT reopen FROM incoming WHERE task_key=excluded.task_key)=0 THEN notifications.resolved_by ELSE NULL END,
      closed_by_source=CASE WHEN excluded.resolved_at IS NOT NULL THEN 1
        WHEN notifications.closed_by_source=1 AND (SELECT reopen FROM incoming WHERE task_key=excluded.task_key)=0 THEN 1 ELSE 0 END,
      task_actor=excluded.task_actor,task_action=excluded.task_action
    WHERE excluded.source_version>notifications.source_version AND EXISTS(
      SELECT 1 FROM events previous JOIN source current ON current.entity_type=previous.entity_type AND current.entity_id=previous.entity_id
      WHERE previous.id=notifications.event_id)`).bind(...args)];
}

export async function syncTask(env,descriptor) {
  const descriptors=Array.isArray(descriptor)?descriptor:[descriptor];
  if(descriptors.some(d=>d.eventId==null))fail(400,'syncTask needs a concrete event ID');
  const keys=descriptors.map(d=>d.taskKey);
  const results=await env.DB.batch([...taskStatements(env,descriptor),env.DB.prepare(
    `SELECT id,revision,source_version FROM notifications WHERE task_key IN (${keys.map(()=>'?').join(',')})`).bind(...keys)]);
  return {changed:results[0].meta.changes,tasks:results[1].results};
}
export async function getTask(env,id,admin) {
  const row=await env.DB.prepare(`${NOTICE_SELECT} WHERE n.id=?`).bind(admin,id).first();
  if(!row)fail(404,'Task not found');return noticeDto(row);
}
export function operationInput(body,allowed) {
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))fail(400,'Invalid task operation');
  if(typeof body.operation_id!=='string'||!UUID.test(body.operation_id))fail(400,'Send a valid operation ID');
}
async function replay(env,actor,operationId,hash,id=null) {
  const op=await env.DB.prepare('SELECT task_id,payload_hash FROM notification_task_operations WHERE actor=? AND operation_id=?').bind(actor,operationId).first();
  if(!op)return null;
  if(op.payload_hash!==hash||(id!==null&&op.task_id!==id))fail(409,'That operation ID was already used for a different change');
  return {task:await getTask(env,op.task_id,actor),replayed:true};
}

export async function mutateTask(env,id,actor,body) {
  operationInput(body,['operation_id','revision','action','assigned_to','due_at']);
  if(!Number.isSafeInteger(body.revision)||body.revision<1)fail(400,'Send the task revision you reviewed');
  const {action}=body;
  let set,args=[],condition='';
  if(action==='claim'){set='assigned_to=?';args=[actor];condition=' AND (assigned_to IS NULL OR assigned_to=?)';}
  else if(action==='assign'||action==='edit') {
    if(!Object.hasOwn(body,'assigned_to')||(body.assigned_to!==null&&typeof body.assigned_to!=='string'))fail(400,'Choose an assignee');
    if(action==='edit'&&!Object.hasOwn(body,'due_at'))fail(400,'Send a deadline or null');
    set=action==='edit'?'assigned_to=?,due_at=?':'assigned_to=?';
    args=action==='edit'?[body.assigned_to,deadline(body.due_at)]:[body.assigned_to];
    condition=' AND (? IS NULL OR EXISTS(SELECT 1 FROM admins WHERE email=?))';
  } else if(action==='deadline'){if(!Object.hasOwn(body,'due_at'))fail(400,'Send a deadline or null');set='due_at=?';args=[deadline(body.due_at)];}
  else if(action==='done'){set='resolved_at=?,resolved_by=?';args=[now(),actor];condition=' AND action_required=1 AND resolved_at IS NULL';}
  else if(action==='reopen'){set='resolved_at=NULL,resolved_by=NULL';condition=' AND action_required=1 AND resolved_at IS NOT NULL AND closed_by_source=0';}
  else fail(400,'Invalid task action');
  if(!['assign','edit'].includes(action)&&Object.hasOwn(body,'assigned_to')||!['deadline','edit'].includes(action)&&Object.hasOwn(body,'due_at'))fail(400,'Unexpected task action fields');
  const hash=await sha256(JSON.stringify({id,revision:body.revision,action,
    ...(['assign','edit'].includes(action)?{assigned_to:body.assigned_to}:{}),
    ...(['deadline','edit'].includes(action)?{due_at:action==='edit'?args[1]:args[0]}:{})}));
  const prior=await replay(env,actor,body.operation_id,hash,id);if(prior)return prior;
  await getTask(env,id,actor);
  const extra=action==='claim'?[actor]:['assign','edit'].includes(action)?[body.assigned_to,body.assigned_to]:[];
  const target=`EXISTS(SELECT 1 FROM events e WHERE e.id=notifications.event_id AND ${currentTarget})`;
  const [updated]=await env.DB.batch([
    env.DB.prepare(`UPDATE notifications SET ${set},task_actor=?,task_action=? WHERE id=? AND revision=?
      AND ${target}${condition} AND EXISTS(SELECT 1 FROM admins WHERE email=?)
      AND NOT EXISTS(SELECT 1 FROM notification_task_operations WHERE actor=? AND operation_id=?)`)
      .bind(...args,actor,action,id,body.revision,...extra,actor,actor,body.operation_id),
    env.DB.prepare(`INSERT INTO notification_task_operations(actor,operation_id,task_id,payload_hash,result_revision)
      SELECT ?,?,id,?,revision FROM notifications WHERE id=? AND changes()=1`).bind(actor,body.operation_id,hash,id),
    env.DB.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT ?,?,e.entity_type,e.entity_id,?,json_object('version',1,'task_id',n.id,'revision',n.revision,'operation_id',?)
      FROM notifications n JOIN events e ON e.id=n.event_id WHERE n.id=? AND n.revision>? AND changes()=1`)
      .bind(now(),actor,`task.${action}`,body.operation_id,id,body.revision),
  ]);
  const result=await replay(env,actor,body.operation_id,hash,id);
  if(!result)fail(409,'This task changed or its target is no longer available. Reload before trying again.');
  return {...result,replayed:updated.meta.changes===0};
}

export async function createTask(env,actor,body) {
  operationInput(body,['operation_id','target','title','reason','assigned_to','due_at']);
  const target=taskTarget(body.target,true),title=keyText(body.title,'task title',200);
  const reason=body.reason==null||body.reason===''?null:keyText(body.reason,'task reason',500);
  const assigned=body.assigned_to??null;if(assigned!==null&&typeof assigned!=='string')fail(400,'Choose an assignee');
  const due=body.due_at==null?null:deadline(body.due_at);
  const hash=await sha256(JSON.stringify({target,title,reason,assigned,due}));
  const prior=await replay(env,actor,body.operation_id,hash);if(prior)return prior;
  const taskKey=`manual:${await sha256(actor)}:${body.operation_id}`,ts=now();
  const [created]=await env.DB.batch([
    env.DB.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT ?,?,?,?,'task.created','{"version":1,"manual":true}' WHERE ${targetExists('?','?')}
      AND (? IS NULL OR EXISTS(SELECT 1 FROM admins WHERE email=?))
      AND EXISTS(SELECT 1 FROM admins WHERE email=?)
      AND NOT EXISTS(SELECT 1 FROM notification_task_operations WHERE actor=? AND operation_id=?)`)
      .bind(ts,actor,target.kind,target.id,...Array(4).fill([target.kind,target.id]).flat(),assigned,assigned,actor,actor,body.operation_id),
    ...taskStatements(env,{taskKey,eventId:null,category:'task',title,reason,target,requiresAction:true,resolved:false,
      dueAt:due,initialAssignedTo:assigned,actor},{ifInserted:true}),
    env.DB.prepare(`INSERT INTO notification_task_operations(actor,operation_id,task_id,payload_hash,result_revision)
      SELECT ?,?,id,?,revision FROM notifications WHERE task_key=? AND changes()=1`).bind(actor,body.operation_id,hash,taskKey),
  ]);
  const result=await replay(env,actor,body.operation_id,hash);
  if(!result)fail(409,'The target or assignee is no longer available');
  return {...result,replayed:created.meta.changes===0};
}
