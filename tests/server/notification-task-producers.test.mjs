import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {makeEnv,call,adminCookie,T0} from './helpers.mjs';
import {logEvent,resolveNotices} from '../../server/events.js';
import {closeMatchedNoticeIfEmpty} from '../../server/match-store.js';

function fixture() {
  const env=makeEnv();
  env.DB.raw.exec(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at)
    VALUES('Projection example','projection@example.test','${T0}','${T0}','${T0}');
    INSERT INTO applicants(contact_id,operation,source,created_at,updated_at)
    VALUES(1,'rent','web','${T0}','${T0}');`);
  return env;
}
const descriptor=(over={})=>({taskKey:'call:applicant:1:episode:1',eventId:1,sourceVersion:1,
  category:'task',title:'Call about the reply',reason:'Availability reply pending',
  target:{kind:'applicant',id:'1'},requiresAction:true,resolved:false,...over});
async function event(env) {
  await env.DB.batch(logEvent(env,{actor:'system',entity_type:'applicant',entity_id:'1',type:'fixture.reply'}));
  return env.DB.raw.prepare('SELECT MAX(id) AS id FROM events').get().id;
}

test('migration preserves populated legacy IDs, event references, indexes and foreign keys',async()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const dir=new URL('../../migrations/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0032_').sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
  db.exec(`INSERT INTO events(id,at,actor,entity_type,entity_id,type) VALUES(7,'${T0}','system','admin','fixture','fixture');
    INSERT INTO notifications(id,event_id,category,title,action_required,created_at) VALUES(42,7,'matched','Legacy notice',1,'${T0}');`);
  db.exec(readFileSync(new URL('0032_notification_tasks.sql',dir),'utf8'));
  const n=db.prepare('SELECT * FROM notifications WHERE id=42').get();
  assert.equal(n.event_id,7);assert.equal(n.title,'Legacy notice');assert.equal(n.task_key,'legacy:42');assert.equal(n.revision,1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  for(const name of ['notifications_open','notifications_created','notifications_event'])assert.ok(db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('index',name));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);db.close();
});

test('a newer source updates one task and preserves staff assignment and an omitted deadline',async()=>{
  const {taskStatements}=await import('../../server/notification-tasks.js');const env=fixture();
  const e1=await event(env);await env.DB.batch(taskStatements(env,descriptor({eventId:e1,dueAt:'2026-12-01T12:00:00.000Z'})));
  env.DB.raw.prepare('UPDATE notifications SET assigned_to=? WHERE task_key=?').run('admin@example.test',descriptor().taskKey);
  const e2=await event(env);await env.DB.batch(taskStatements(env,descriptor({eventId:e2,sourceVersion:2,title:'A useful reply arrived',resolved:true})));
  const n=env.DB.raw.prepare('SELECT * FROM notifications WHERE task_key=?').get(descriptor().taskKey);
  assert.equal(n.title,'A useful reply arrived');assert.ok(n.resolved_at);assert.equal(n.closed_by_source,1);
  assert.equal(n.assigned_to,'admin@example.test');assert.equal(n.due_at,'2026-12-01T12:00:00.000Z');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM notifications').get().n,1);
  const revision=n.revision;
  await env.DB.batch(taskStatements(env,descriptor({eventId:e1,sourceVersion:1,title:'Outdated source'})));
  assert.equal(env.DB.raw.prepare('SELECT revision FROM notifications').get().revision,revision);
});

test('fresh event capture projects two tasks even when notice and history rowids differ',async()=>{
  const {taskStatements}=await import('../../server/notification-tasks.js');const env=fixture();
  env.DB.raw.prepare('INSERT INTO events(id,at,actor,entity_type,entity_id,type) VALUES(?,?,?,?,?,?)').run(100,T0,'system','applicant','1','fixture.old');
  await env.DB.batch([
    ...logEvent(env,{actor:'system',entity_type:'applicant',entity_id:'1',type:'fixture.new'}),
    ...taskStatements(env,[descriptor({eventId:null}),descriptor({taskKey:'review:applicant:1',eventId:null})],{ifInserted:true}),
  ]);
  const rows=env.DB.raw.prepare('SELECT event_id FROM notifications ORDER BY id').all();
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.event_id===101));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM notification_task_history').get().n,2);
});

test('an omitted conditional event cannot reuse a previous valid rowid',async()=>{
  const {taskStatements}=await import('../../server/notification-tasks.js');const env=fixture();await event(env);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type) SELECT ?, 'system','applicant','1','fixture.skipped' WHERE 0").bind(T0),
    ...taskStatements(env,descriptor({eventId:null}),{ifInserted:true}),
  ]);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM notifications').get().n,0);
  assert.throws(()=>taskStatements(env,descriptor({eventId:null})),/guard|ifInserted/i);
});

test('task history failure rolls back the producer mutation and event in the same batch',async()=>{
  const {taskStatements}=await import('../../server/notification-tasks.js');const env=fixture();
  env.DB.raw.exec("CREATE TRIGGER reject_task_history BEFORE INSERT ON notification_task_history BEGIN SELECT RAISE(ABORT,'synthetic history failure'); END;");
  await assert.rejects(env.DB.batch([
    env.DB.prepare('UPDATE applicants SET budget_max=2000 WHERE id=1'),
    ...logEvent(env,{actor:'system',entity_type:'applicant',entity_id:'1',type:'fixture.new'}),
    ...taskStatements(env,descriptor({eventId:null}),{ifInserted:true}),
  ]),/synthetic history failure/);
  assert.equal(env.DB.raw.prepare('SELECT budget_max FROM applicants WHERE id=1').get().budget_max,null);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM events').get().n,0);
});

test('late context cannot reopen a source-closed episode without explicit producer reopening',async()=>{
  const {taskStatements}=await import('../../server/notification-tasks.js');const env=fixture();const e=await event(env);
  await env.DB.batch(taskStatements(env,descriptor({eventId:e,resolved:true})));
  await env.DB.batch(taskStatements(env,descriptor({eventId:e,sourceVersion:2,resolved:false})));
  assert.ok(env.DB.raw.prepare('SELECT resolved_at FROM notifications').get().resolved_at);
  await env.DB.batch(taskStatements(env,descriptor({eventId:e,sourceVersion:3,resolved:false,reopen:true})));
  assert.equal(env.DB.raw.prepare('SELECT resolved_at FROM notifications').get().resolved_at,null);
});

for(const source of ['projection','legacy','matches'])test(`a ${source} domain resolution after Done disables Reopen exactly once`,async()=>{
  const {taskStatements,mutateTask,getTask}=await import('../../server/notification-tasks.js');
  const env=fixture(),e=await event(env),actor='admin@example.test';
  await env.DB.batch(taskStatements(env,descriptor({eventId:e,category:source==='matches'?'matched':'task'})));
  const id=env.DB.raw.prepare('SELECT id FROM notifications').get().id;
  const done=await mutateTask(env,id,actor,{operation_id:crypto.randomUUID(),revision:1,action:'done'});
  assert.equal(done.task.can_reopen,true);
  const close=()=>source==='projection'?taskStatements(env,descriptor({eventId:e,sourceVersion:2,resolved:true})):
    [source==='legacy'?resolveNotices(env,{entity_type:'applicant',entity_id:'1'},'system'):closeMatchedNoticeIfEmpty(env,1,'system')];
  await env.DB.batch(close());
  const resolved=await getTask(env,id,actor);
  assert.equal(resolved.closed_by_source,1);assert.equal(resolved.can_reopen,false);
  assert.equal(resolved.revision,3);assert.equal(resolved.resolved_at,done.task.resolved_at);assert.equal(resolved.resolved_by,actor);
  await env.DB.batch(close());assert.equal((await getTask(env,id,actor)).revision,3);
  const r=await call(env,'PUT',`/admin/notification-tasks/${id}`,{cookie:await adminCookie(),
    body:{operation_id:crypto.randomUUID(),revision:3,action:'reopen'}});
  assert.equal(r.status,409);
});

test('missing targets and a key reused for another entity cannot overwrite task context',async()=>{
  const {taskStatements}=await import('../../server/notification-tasks.js');const env=fixture();const e=await event(env);
  await env.DB.batch(taskStatements(env,descriptor({eventId:e})));
  await env.DB.batch(taskStatements(env,descriptor({eventId:e,sourceVersion:2,target:{kind:'applicant',id:'2'},title:'Wrong entity'})));
  env.DB.raw.exec('DELETE FROM applicants WHERE id=1');
  await env.DB.batch(taskStatements(env,descriptor({eventId:e,sourceVersion:3,title:'Should not restore deleted content'})));
  const n=env.DB.raw.prepare('SELECT * FROM notifications').get();assert.equal(n.title,'Deleted applicant');assert.equal(n.source_version,1);
  assert.equal(n.target_deleted,1);assert.ok(n.resolved_at);
});

test('a duplicate arriving after contact deletion cannot retain a task reason or leave actionable deleted work',async()=>{
  const {taskStatements}=await import('../../server/notification-tasks.js');const env=fixture();
  await env.DB.batch(logEvent(env,{actor:'system',entity_type:'contact',entity_id:'1',type:'fixture.contact'}));
  const eventId=env.DB.raw.prepare('SELECT MAX(id) AS id FROM events').get().id;
  await env.DB.batch(taskStatements(env,descriptor({taskKey:'call:contact:1',eventId,target:{kind:'contact',id:'1'},reason:'Private duplicate context'})));
  const originalBatch=env.DB.batch.bind(env.DB);let removed=false;
  env.DB.batch=stmts=>{
    if(!removed){removed=true;env.DB.raw.exec('DELETE FROM applicants; DELETE FROM contacts;');}
    return originalBatch(stmts);
  };
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({success:true,hostname:'hampton.test'});
  try {
    const r=await call(env,'POST','/applicants',{body:{operation:'rent',name:'Projection example',email:'projection@example.test',
      phone:'+447797000000',budget_max:2500,bedrooms_min:2,parishes_wanted:['St Helier'],pets:[{kind:'none'}],privacy:true,marketing:false,turnstile:'fixture'}});
    assert.equal(r.status,201);
  } finally {globalThis.fetch=previousFetch;}
  const rows=env.DB.raw.prepare("SELECT n.* FROM notifications n JOIN events e ON e.id=n.event_id WHERE e.entity_type='contact'").all();
  assert.equal(rows.length,2);
  assert.ok(rows.every(n=>n.title==='Deleted applicant'&&n.task_reason===null&&n.resolved_at!==null));
});
