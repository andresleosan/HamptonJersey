import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,call,adminCookie,T0} from './helpers.mjs';
import {logEvent} from '../../server/events.js';

const ADMIN='admin@example.test', OTHER='colleague@example.test';
const operation=()=>crypto.randomUUID();
async function setup() {
  const env=makeEnv();
  env.DB.raw.exec(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at)
    VALUES('Task example','task@example.test','${T0}','${T0}','${T0}');
    INSERT INTO applicants(contact_id,operation,source,created_at,updated_at)
    VALUES(1,'rent','web','${T0}','${T0}');`);
  await env.DB.batch(logEvent(env,{actor:'system',entity_type:'applicant',entity_id:'1',type:'applicant.created'},
    {category:'new_applicant',title:'Review task example',action_required:true}));
  const id=env.DB.raw.prepare('SELECT id FROM notifications').get().id;
  return {env,id,cookie:await adminCookie(),other:await adminCookie(OTHER)};
}
const change=(env,id,cookie,body)=>call(env,'PUT',`/admin/notification-tasks/${id}`,{cookie,body});

test('shared tasks enrich legacy notices without changing their original event or ID',async()=>{
  const {env,id,cookie}=await setup();
  const list=await call(env,'GET','/admin/notifications?box=action',{cookie});
  assert.equal(list.status,200);
  const n=list.data.notifications.find(n=>n.id===id);
  assert.equal(n.revision,1);assert.equal(n.assigned_to,null);assert.equal(n.due_at,null);assert.equal(n.is_read,0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);
  const detail=await call(env,'GET',`/admin/notification-tasks/${id}`,{cookie});
  assert.equal(detail.status,200);assert.equal(detail.data.task.id,id);
  assert.match(detail.headers.get('cache-control'),/no-store/);
});

for(const action of ['claim','done'])test(`two employees performing ${action} on one revision commit one action, receipt and task event`,async()=>{
  const {env,id,cookie,other}=await setup();
  const results=await Promise.all([change(env,id,cookie,{operation_id:operation(),revision:1,action}),
    change(env,id,other,{operation_id:operation(),revision:1,action})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
  const n=env.DB.raw.prepare('SELECT * FROM notifications WHERE id=?').get(id);
  assert.equal(n.revision,2);assert.ok([ADMIN,OTHER].includes(action==='claim'?n.assigned_to:n.resolved_by));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM notification_task_operations').get().n,1);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM events WHERE type=?').get(`task.${action}`).n,1);
});

test('a useful source reply between the read and Done prevents closing stale context',async()=>{
  const {env,id,cookie}=await setup();const {taskStatements}=await import('../../server/notification-tasks.js');
  const originalBatch=env.DB.batch.bind(env.DB);let injected=false;
  env.DB.batch=async statements=>{
    if(!injected){injected=true;await originalBatch(taskStatements(env,{taskKey:`legacy:${id}`,eventId:1,sourceVersion:2,
      target:{kind:'applicant',id:'1'},category:'new_applicant',title:'A useful reply arrived',resolved:true}));}
    return originalBatch(statements);
  };
  assert.equal((await change(env,id,cookie,{operation_id:operation(),revision:1,action:'done'})).status,409);
  const n=env.DB.raw.prepare('SELECT * FROM notifications WHERE id=?').get(id);
  assert.equal(n.title,'A useful reply arrived');assert.equal(n.closed_by_source,1);assert.equal(n.revision,2);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM notification_task_operations').get().n,0);
});

test('task operations replay once and reject a reused key with a different payload',async()=>{
  const {env,id,cookie}=await setup(), op=operation();
  const body={operation_id:op,revision:1,action:'deadline',due_at:'2026-12-01T12:00:00.000Z'};
  const first=await change(env,id,cookie,body);assert.equal(first.status,200);
  const replay=await change(env,id,cookie,body);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
  assert.equal(replay.data.task.revision,2);
  assert.equal((await change(env,id,cookie,{...body,due_at:null})).status,409);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM notification_task_operations').get().n,1);
});

test('owner and deadline edit atomically in one reviewed revision',async()=>{
  const {env,id,cookie}=await setup();
  const r=await change(env,id,cookie,{operation_id:operation(),revision:1,action:'edit',assigned_to:OTHER,due_at:'2026-12-02T10:30:00.000Z'});
  assert.equal(r.status,200);assert.equal(r.data.task.revision,2);assert.equal(r.data.task.assigned_to,OTHER);
  assert.equal(r.data.task.due_at,'2026-12-02T10:30:00.000Z');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE type='task.edit'").get().n,1);
});

test('Done and Reopen never resolve an applicant search and stale legacy Done cannot close changed context',async()=>{
  const {env,id,cookie}=await setup();
  env.DB.raw.prepare('UPDATE notifications SET title=? WHERE id=?').run('New source context',id);
  assert.equal((await call(env,'PUT',`/admin/notifications/${id}`,{cookie,body:{resolved:true}})).status,409);
  assert.equal((await change(env,id,cookie,{operation_id:operation(),revision:1,action:'done'})).status,409);
  const done=await change(env,id,cookie,{operation_id:operation(),revision:2,action:'done'});assert.equal(done.status,200);
  assert.equal(done.data.task.closed_by_source,0);
  const reopened=await change(env,id,cookie,{operation_id:operation(),revision:done.data.task.revision,action:'reopen'});
  assert.equal(reopened.status,200);assert.equal(reopened.data.task.resolved_at,null);
  assert.equal(env.DB.raw.prepare('SELECT search_state FROM applicants WHERE id=1').get().search_state,'active');
});

test('personal reads do not close shared tasks or mark a newer revision as read',async()=>{
  const {env,id,cookie,other}=await setup();
  const read=await call(env,'PUT',`/admin/notification-tasks/${id}/read`,{cookie,body:{revision:1}});assert.equal(read.status,200);
  const mine=await call(env,'GET','/admin/notifications?box=action',{cookie});
  const theirs=await call(env,'GET','/admin/notifications?box=action',{cookie:other});
  assert.equal(mine.data.notifications[0].is_read,1);assert.equal(theirs.data.notifications[0].is_read,0);
  assert.equal(mine.data.counts.action,1);assert.equal(theirs.data.counts.action,1);
  env.DB.raw.prepare('UPDATE notifications SET title=? WHERE id=?').run('Later context',id);
  assert.equal((await call(env,'PUT',`/admin/notification-tasks/${id}/read`,{cookie,body:{revision:1}})).status,409);
  const newer=await call(env,'GET','/admin/notifications?box=action',{cookie});assert.equal(newer.data.notifications[0].is_read,0);
});

test('task mutation and its receipt roll back when the state event fails',async()=>{
  const {env,id,cookie}=await setup();
  env.DB.raw.exec("CREATE TRIGGER reject_task_event BEFORE INSERT ON events WHEN NEW.type='task.done' BEGIN SELECT RAISE(ABORT,'synthetic task event failure'); END;");
  assert.equal((await change(env,id,cookie,{operation_id:operation(),revision:1,action:'done'})).status,500);
  const n=env.DB.raw.prepare('SELECT * FROM notifications WHERE id=?').get(id);assert.equal(n.revision,1);assert.equal(n.resolved_at,null);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM notification_task_operations').get().n,0);
});

test('concurrent retries of manual creation create one task and return one replay',async()=>{
  const {env,cookie}=await setup();
  const body={operation_id:operation(),target:{kind:'applicant',id:'1'},title:'Check the reply',reason:'Follow up tomorrow',
    assigned_to:ADMIN,due_at:'2026-12-01T12:00:00.000Z'};
  const send=()=>call(env,'POST','/admin/notification-tasks',{cookie,body});
  const responses=await Promise.all([send(),send()]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
  assert.equal(new Set(responses.map(r=>r.data.task.id)).size,1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE type='task.created'").get().n,1);
  assert.equal((await call(env,'POST','/admin/notification-tasks',{cookie,body:{...body,title:'Different work'}})).status,409);
});

test('feed preferences are personal and never hide shared open work or completed tasks',async()=>{
  const {env,id,cookie,other}=await setup();
  await env.DB.batch(logEvent(env,{actor:'system',entity_type:'applicant',entity_id:'1',type:'fixture.info'},
    {category:'new_applicant',title:'Informational update',action_required:false}));
  const first=await call(env,'GET','/admin/notification-preferences',{cookie});assert.equal(first.data.revision,0);
  const saved=await call(env,'PUT','/admin/notification-preferences',{cookie,body:{revision:0,feed_categories:[]}});assert.equal(saved.status,200);
  assert.equal((await call(env,'PUT','/admin/notification-preferences',{cookie,body:{revision:0,feed_categories:['task']}})).status,409);
  const mine=await call(env,'GET','/admin/notifications?box=feed',{cookie});assert.equal(mine.data.notifications.length,0);
  const theirs=await call(env,'GET','/admin/notifications?box=feed',{cookie:other});assert.equal(theirs.data.notifications.length,1);
  const open=await call(env,'GET','/admin/notifications?box=action',{cookie});assert.equal(open.data.notifications[0].id,id);
  await change(env,id,cookie,{operation_id:operation(),revision:1,action:'done'});
  const completed=await call(env,'GET','/admin/notifications?box=feed',{cookie});assert.ok(completed.data.notifications.some(n=>n.id===id));
});

test('task routes require authentication and reject forged metadata, unsafe targets and invalid deadlines',async()=>{
  const {env,id,cookie}=await setup();
  assert.equal((await call(env,'GET',`/admin/notification-tasks/${id}`)).status,401);
  assert.equal((await call(env,'GET','/admin/notification-preferences')).status,401);
  const mutation={operation_id:operation(),revision:1,action:'claim'};
  assert.equal((await change(env,id,cookie,{...mutation,actor:OTHER})).status,400);
  assert.equal((await change(env,id,cookie,{...mutation,action:'deadline',due_at:'not a date'})).status,400);
  assert.equal((await change(env,id,cookie,{...mutation,action:'assign',assigned_to:'removed@example.test'})).status,409);
  assert.equal((await call(env,'POST','/admin/notification-tasks',{cookie,body:{operation_id:operation(),target:{kind:'applicant',id:'1/../../x'},title:'Unsafe'}})).status,400);
  assert.equal((await call(env,'POST','/admin/notification-tasks',{cookie,body:{operation_id:operation(),target:{kind:'applicant',id:'999'},title:'Gone'}})).status,409);
  const denied=await call(env,'PUT',`/admin/notification-tasks/${id}`,{cookie,origin:'https://elsewhere.test',body:mutation});assert.equal(denied.status,403);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM notification_task_operations').get().n,0);
});

test('deleting an applicant sanitizes task reason and replay, and a late source cannot restore it',async()=>{
  const {env,cookie}=await setup(),op=operation();
  const body={operation_id:op,target:{kind:'applicant',id:'1'},title:'Private task title',reason:'Private task reason'};
  const made=await call(env,'POST','/admin/notification-tasks',{cookie,body});assert.equal(made.status,201);
  env.DB.raw.prepare('UPDATE applicants SET archived_at=? WHERE id=1').run(T0);
  assert.equal((await call(env,'DELETE','/admin/applicants/1',{cookie,body:{confirm:'Task example'}})).status,200);
  const detail=await call(env,'GET',`/admin/notification-tasks/${made.data.task.id}`,{cookie});
  assert.equal(detail.data.task.title,'Deleted applicant');assert.equal(detail.data.task.task_reason,null);
  const replay=await call(env,'POST','/admin/notification-tasks',{cookie,body});assert.equal(replay.status,200);
  assert.equal(replay.data.task.task_reason,null);assert.equal(replay.data.task.target_exists,false);
  assert.ok(!JSON.stringify(detail.data.history).includes('Private task'));
  const {taskStatements}=await import('../../server/notification-tasks.js');
  const row=env.DB.raw.prepare('SELECT event_id,task_key FROM notifications WHERE id=?').get(made.data.task.id);
  await env.DB.batch(taskStatements(env,{taskKey:row.task_key,eventId:row.event_id,sourceVersion:999,category:'task',
    title:'Late private task',reason:'Late private reason',target:{kind:'applicant',id:'1'}}));
  assert.equal(env.DB.raw.prepare('SELECT task_reason FROM notifications WHERE id=?').get(made.data.task.id).task_reason,null);
});

test('a task can open the exact viewing outside the first 500 rows and invalid links fail explicitly',async()=>{
  const env=makeEnv(),cookie=await adminCookie();
  env.DB.raw.exec(`WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x WHERE n<501)
    INSERT INTO viewing_requests(kind,date,time,name,email,created_at)
    SELECT 'In person','2030-01-10','11:30','Viewing '||n,'viewing-'||n||'@example.test','${T0}' FROM x;`);
  const list=await call(env,'GET','/admin/viewings?tab=requests',{cookie});assert.equal(list.data.viewings.length,500);
  const exact=await call(env,'GET','/admin/viewings/501',{cookie});assert.equal(exact.status,200);
  assert.equal(exact.data.viewing.id,501);assert.equal(exact.data.tab,'requests');
  assert.equal((await call(env,'GET','/admin/viewings/not-a-number',{cookie})).status,400);
  assert.equal((await call(env,'GET','/admin/viewings/999999',{cookie})).status,404);
  assert.equal((await call(env,'GET','/admin/viewings/501')).status,401);
});
