import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {makeEnv,seedListing,call,adminCookie,T0} from './helpers.mjs';
import {logEvent} from '../../server/events.js';
import {taskStatements,getTask} from '../../server/notification-tasks.js';
import {rentalEvent} from '../../server/routes/rentals.js';
import {sha256} from '../../server/http.js';

const ADMIN='admin@example.test';
function fixture() {
  const env=makeEnv();seedListing(env);
  env.DB.raw.exec(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at)
    VALUES('Source fixture','source@example.test','${T0}','${T0}','${T0}');
    INSERT INTO applicants(contact_id,operation,source,created_at,updated_at) VALUES(1,'buy','phone','${T0}','${T0}');
    INSERT INTO viewing_requests(kind,date,time,name,email,created_at) VALUES('In person','2030-01-10','11:30','Viewing fixture','viewing@example.test','${T0}');
    INSERT INTO offers(listing_id,applicant_id,amount,created_at,updated_at) VALUES('HE-R001',1,500000,'${T0}','${T0}');
    INSERT INTO landlords(name,created_at,updated_at) VALUES('Landlord fixture','${T0}','${T0}');
    INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at)
      VALUES(1,'Rental fixture','St Helier','full',10,'${T0}','${T0}');
    INSERT INTO payments(received_on,amount,kind,source,created_at) VALUES('2026-10-07',10000,'rent','import','${T0}');`);
  return env;
}
const rows=(env,sql,...args)=>env.DB.raw.prepare(sql).all(...args);

test('0033 preserves populated event IDs, notifications, history, FKs and listing triggers without backfill',()=>{
  const path=new URL('../../migrations/0033_notification_events.sql',import.meta.url);
  assert.equal(existsSync(path),true,'the additive notification migration must exist');
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const dir=new URL('../../migrations/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0033_').sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
  db.exec(`INSERT INTO events(id,at,actor,entity_type,entity_id,type) VALUES(17,'${T0}','system','admin','fixture','fixture');
    INSERT INTO notifications(id,event_id,category,title,action_required,created_at) VALUES(42,17,'task','Legacy task',1,'${T0}');`);
  // D1 applies each migration transactionally; the populated FK test must do the same.
  db.exec('BEGIN');db.exec(readFileSync(path,'utf8'));db.exec('COMMIT');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('SELECT event_id FROM notifications WHERE id=42').get().event_id,17);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notification_task_history').get().n,1);
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='listing_event_update'").get());db.close();
});

test('50 projections fit the real D1 bound parameter cap and capture one event despite divergent notice/history IDs',async()=>{
  const env=fixture();env.DB.raw.exec(`INSERT INTO events(id,at,actor,entity_type,entity_id,type) VALUES(99,'${T0}','system','applicant','1','fixture');
    INSERT INTO notifications(id,event_id,category,title,action_required,created_at) VALUES(300,99,'task','Old task',1,'${T0}');`);
  const capped={DB:{prepare(sql){return {bind(...args){assert.ok(args.length<=100,`D1 accepts 100 parameters, got ${args.length}`);return env.DB.prepare(sql).bind(...args);}};}}};
  const group=Array.from({length:50},(_,i)=>({taskKey:`group:${i}`,eventId:null,target:{kind:'applicant',id:'1'},category:'task',title:'Projection fixture'}));
  await env.DB.batch([...logEvent(env,{actor:'system',entity_type:'applicant',entity_id:'1',type:'fixture.group'}),
    ...taskStatements(capped,group,{ifInserted:true})]);
  const notices=rows(env,"SELECT event_id FROM notifications WHERE task_key LIKE 'group:%'");
  assert.equal(notices.length,50);assert.ok(notices.every(n=>n.event_id===100));
  await env.DB.batch([env.DB.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type) SELECT ?,'system','applicant','1','fixture.omitted' WHERE 0").bind(T0),
    ...taskStatements(capped,group.map(d=>({...d,taskKey:d.taskKey+':skipped'})),{ifInserted:true})]);
  assert.equal(rows(env,"SELECT id FROM notifications WHERE task_key LIKE '%:skipped'").length,0);
});

test('new viewing facts project Feed atomically while preserving the parent changes and rowid',async()=>{
  const env=fixture();
  const result=await env.DB.batch([
    env.DB.prepare("UPDATE viewing_requests SET status='confirmed' WHERE id=1"),
    ...logEvent(env,{actor:ADMIN,entity_type:'viewing',entity_id:'1',type:'viewing.confirmed'},null,{ifInserted:true}),
    env.DB.prepare('SELECT changes() AS changed,last_insert_rowid() AS event_id'),
  ]);
  const eventId=rows(env,'SELECT id FROM events')[0].id;
  assert.equal(result.at(-1).results[0].changed,1);assert.equal(result.at(-1).results[0].event_id,eventId);
  const notices=rows(env,'SELECT * FROM notifications');assert.equal(notices.length,1);
  assert.equal(notices[0].action_required,0);assert.equal(notices[0].task_key,`event:${eventId}`);
  assert.equal((await getTask(env,notices[0].id,ADMIN)).link,'#/viewings?viewing=1');
});

test('a Feed projection failure rolls back its business update and source event',async()=>{
  const env=fixture();env.DB.raw.exec("CREATE TRIGGER reject_feed BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'synthetic Feed failure'); END;");
  await assert.rejects(env.DB.batch([env.DB.prepare("UPDATE viewing_requests SET status='confirmed' WHERE id=1"),
    ...logEvent(env,{actor:ADMIN,entity_type:'viewing',entity_id:'1',type:'viewing.confirmed'},null,{ifInserted:true})]),/synthetic Feed failure/);
  assert.equal(rows(env,'SELECT status FROM viewing_requests')[0].status,'requested');assert.equal(rows(env,'SELECT id FROM events').length,0);
});

test('a rental event without a rental can bridge a real payment but never its free bank data',async()=>{
  const env=fixture();await env.DB.batch([rentalEvent(env,{actor:ADMIN,type:'payment.updated',data:{payment_id:1,bank_line:'Do not copy this private bank line'}})]);
  const events=rows(env,'SELECT * FROM events');assert.equal(events.length,1);assert.equal(events[0].entity_type,'payment');assert.equal(events[0].entity_id,'1');
  assert.equal(events[0].rental_event_id,1);assert.ok(!JSON.stringify(events[0]).includes('private bank'));
  const n=rows(env,'SELECT id FROM notifications')[0];assert.ok(n);assert.equal((await getTask(env,n.id,ADMIN)).link,'#/rentals?payment=1');
});

test('a Sales applicant event may target only its own exact offer',async()=>{
  const env=fixture();await env.DB.batch(logEvent(env,{actor:ADMIN,entity_type:'applicant',entity_id:'1',type:'fixture.offer',data:{offer_id:1}}));
  await assert.doesNotReject(env.DB.batch(taskStatements(env,{taskKey:'offer:fixture',eventId:1,category:'task',title:'Review offer',target:{kind:'offer',id:'1'}})));
  const n=rows(env,'SELECT id FROM notifications')[0];assert.equal((await getTask(env,n.id,ADMIN)).link,'#/sales?offer=1');
});

test('deleting a viewing directly sanitizes and removes its task link without waiting for a tick',async()=>{
  const env=fixture();await env.DB.batch(logEvent(env,{actor:ADMIN,entity_type:'viewing',entity_id:'1',type:'viewing.requested'},
    {category:'viewing',title:'Private viewing context',action_required:true}));
  const id=rows(env,'SELECT id FROM notifications')[0].id;env.DB.raw.exec('DELETE FROM viewing_requests WHERE id=1');
  const task=await getTask(env,id,ADMIN);assert.equal(task.link,null);assert.equal(task.phone,null);assert.ok(task.resolved_at);assert.ok(!task.title.includes('Private'));
});

test('a manual operation receipt from before0033 retains its exact canonical hash',async()=>{
  const env=fixture(),operation_id=crypto.randomUUID(),body={operation_id,target:{kind:'applicant',id:1},title:'Legacy follow-up'};
  await env.DB.batch(logEvent(env,{actor:ADMIN,entity_type:'applicant',entity_id:'1',type:'fixture.legacy'},
    {category:'task',title:'Legacy follow-up',action_required:true}));
  const id=rows(env,'SELECT id FROM notifications')[0].id;
  const hash=await sha256(JSON.stringify({target:{kind:'applicant',id:'1'},title:body.title,reason:null,assigned:null,due:null}));
  env.DB.raw.prepare('INSERT INTO notification_task_operations VALUES(?,?,?,?,?)').run(ADMIN,operation_id,id,hash,1);
  const r=await call(env,'POST','/admin/notification-tasks',{cookie:await adminCookie(),body});
  assert.equal(r.status,200);assert.equal(r.data.replayed,true);assert.equal(r.data.task.id,id);assert.equal(rows(env,'SELECT id FROM notifications').length,1);
});
