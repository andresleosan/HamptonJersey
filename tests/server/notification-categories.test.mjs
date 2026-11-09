import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {makeEnv,call,adminCookie,T0} from './helpers.mjs';
import {TASK_CATEGORIES} from '../../server/notification-query.js';
import {sha256} from '../../server/http.js';
import {notificationsPass} from '../../server/notification-reconcile.js';
import {rentalEvent} from '../../server/routes/rentals.js';

const ADMIN='admin@example.test';
async function fixture(){
  const env=makeEnv();
  env.DB.raw.exec(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Category fixture','category@example.test','${T0}','${T0}','${T0}');
    INSERT INTO applicants(contact_id,operation,source,created_at,updated_at) VALUES(1,'rent','phone','${T0}','${T0}');
    INSERT INTO landlords(name,created_at,updated_at) VALUES('Fixture','${T0}','${T0}');
    INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(1,'Fixture rental','St Helier','full',10,'${T0}','${T0}');
    INSERT INTO compliance_items(rental_id,kind,done_on,expires_on) VALUES(1,'gas','2025-11-01','2026-11-01');`);
  return {env,cookie:await adminCookie()};
}
const create=(env,cookie,body)=>call(env,'POST','/admin/notification-tasks',{cookie,body});
const body=(category)=>({operation_id:crypto.randomUUID(),target:{kind:'applicant',id:'1'},title:'Recorded follow-up',...(category?{category}:{})});
const size=env=>['events','notifications','notification_task_operations'].map(t=>env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n);

test('the seven closed categories are accepted by tasks, filters and preferences',async()=>{
  assert.deepEqual(TASK_CATEGORIES,['new_applicant','viewing','matched','task','agency_reply','message','compliance']);
  const {env,cookie}=await fixture();
  for(const category of ['agency_reply','message','compliance']){
    const r=await create(env,cookie,body(category));assert.equal(r.status,201);assert.equal(r.data.task.category,category);
    const list=await call(env,'GET',`/admin/notifications?box=action&category=${category}`,{cookie});
    assert.equal(list.status,200);assert.equal(list.data.notifications.length,1);assert.equal(list.data.counts[category],1);
  }
  const prefs=await call(env,'PUT','/admin/notification-preferences',{cookie,body:{revision:0,feed_categories:['message','compliance']}});
  assert.equal(prefs.status,200);assert.deepEqual(prefs.data.feed_categories,['message','compliance']);
  assert.equal((await call(env,'GET','/admin/notifications?box=action',{cookie})).data.counts.action,3);
});

test('category is part of new receipts while omitted category retains the legacy hash',async()=>{
  const {env,cookie}=await fixture(),legacy=body();
  assert.equal((await create(env,cookie,legacy)).status,201);
  const expected=await sha256(JSON.stringify({target:legacy.target,title:legacy.title,reason:null,assigned:null,due:null}));
  assert.equal(env.DB.raw.prepare('SELECT payload_hash FROM notification_task_operations WHERE operation_id=?').get(legacy.operation_id).payload_hash,expected);
  assert.equal((await create(env,cookie,legacy)).status,200);
  const request=body('agency_reply'),first=await create(env,cookie,request);assert.equal(first.status,201);
  assert.equal((await create(env,cookie,request)).data.task.id,first.data.task.id);
  assert.equal((await create(env,cookie,{...request,category:'message'})).status,409);
  assert.deepEqual(size(env),[2,2,2]);
});

test('manual rental follow-ups preserve typed context and reject foreign context without writes',async()=>{
  const {env,cookie}=await fixture();
  const request={...body('compliance'),target:{kind:'rental',id:'1',context:{compliance_kind:'gas'}}};
  const r=await create(env,cookie,request);assert.equal(r.status,201);assert.match(r.data.task.link,/rental.*1|rentals/);assert.match(r.data.task.link,/gas/);
  const before=size(env);
  for(const context of [{tenancy_id:999},{compliance_kind:'eicr'}]){
    assert.equal((await create(env,cookie,{...request,operation_id:crypto.randomUUID(),target:{kind:'rental',id:'1',context}})).status,409);
    assert.deepEqual(size(env),before);
  }
  for(const change of [{category:'invented'},{category:'matched'},{actor:'forged'},{target:{kind:'rental',id:'1',context:{url:'https://example.test'}}}]){
    assert.equal((await create(env,cookie,{...request,operation_id:crypto.randomUUID(),...change})).status,400);assert.deepEqual(size(env),before);
  }
});

test('the list limit does not truncate category or All counters',async()=>{
  const {env,cookie}=await fixture();
  for(let i=0;i<201;i++)assert.equal((await create(env,cookie,body('message'))).status,201);
  const r=await call(env,'GET','/admin/notifications?box=action&category=message',{cookie});
  assert.equal(r.status,200);assert.equal(r.data.notifications.length,200);assert.equal(r.data.counts.message,201);assert.equal(r.data.counts.action,201);
});

test('current Compliance tasks and new facts use the category without inventing historical Feed',async()=>{
  const {env,cookie}=await fixture();
  await notificationsPass(env,'2026-11-09T12:00:00.000Z');
  const t=env.DB.raw.prepare("SELECT * FROM notifications WHERE task_key LIKE 'queue:check:%'").get();
  assert.equal(t.category,'compliance');assert.match((await call(env,'GET',`/admin/notification-tasks/${t.id}`,{cookie})).data.task.link,/check=gas/);
  const result=await call(env,'PUT',`/admin/notification-tasks/${t.id}`,{cookie,body:{operation_id:crypto.randomUUID(),revision:t.revision,action:'done'}});
  assert.equal(result.status,200);assert.equal(env.DB.raw.prepare("SELECT expires_on FROM compliance_items WHERE kind='gas'").get().expires_on,'2026-11-01');
  await env.DB.batch([rentalEvent(env,{rental_id:1,actor:ADMIN,type:'compliance.updated',data:{compliance_kind:'gas'}})]);
  const fact=env.DB.raw.prepare("SELECT * FROM notifications WHERE task_key LIKE 'event:%' ORDER BY id DESC").get();
  assert.equal(fact.category,'compliance');
});

test('same-signature pending tasks are reclassified preserving source event and receipt identities',async()=>{
  const {env,cookie}=await fixture();await notificationsPass(env,'2026-11-09T12:00:00.000Z');
  const id=env.DB.raw.prepare("SELECT id FROM notifications WHERE task_key LIKE 'queue:check:%'").get().id;
  env.DB.raw.prepare("UPDATE notifications SET category='task',assigned_to=? WHERE id=?").run(ADMIN,id);
  const before=env.DB.raw.prepare('SELECT * FROM notifications WHERE id=?').get(id);
  env.DB.raw.prepare('INSERT INTO notification_reads VALUES(?,?,?)').run(ADMIN,id,before.revision);
  const counts=size(env);
  await notificationsPass(env,'2026-11-09T12:01:00.000Z');
  const after=env.DB.raw.prepare('SELECT * FROM notifications WHERE id=?').get(id);
  assert.equal(after.category,'compliance');assert.equal(after.event_id,before.event_id);assert.equal(after.task_key,before.task_key);
  assert.equal(after.assigned_to,ADMIN);assert.equal(after.revision,before.revision+1);assert.deepEqual(size(env),counts);
  assert.equal(env.DB.raw.prepare('SELECT read_revision FROM notification_reads WHERE notification_id=?').get(id).read_revision,before.revision);
  assert.equal((await call(env,'GET',`/admin/notification-tasks/${id}`,{cookie})).data.task.is_read,0);
});

test('a task insert failure rolls back the classified event and operation receipt',async()=>{
  const {env,cookie}=await fixture(),before=size(env);
  env.DB.raw.exec("CREATE TRIGGER category_failure BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'fixture category failure'); END");
  assert.equal((await create(env,cookie,body('message'))).status,500);assert.deepEqual(size(env),before);
});

test('0035 populated rebuild preserves every table, read, receipt, preference, FK and trigger',()=>{
  const dir=new URL('../../migrations/',import.meta.url),migration=new URL('0035_notification_categories.sql',dir);
  assert.ok(existsSync(migration),'category migration exists');
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0035').sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
  db.exec(readFileSync(new URL('../fixtures/seed.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO events(id,at,actor,entity_type,entity_id,type) VALUES(9001,'${T0}','system','admin','fixture','fixture');
    INSERT INTO notifications(id,event_id,category,title,action_required,created_at,task_key) VALUES(9001,9001,'task','Historical fixture',1,'${T0}','fixture:category');
    INSERT INTO notification_reads VALUES('${ADMIN}',9001,1);
    INSERT INTO notification_task_operations VALUES('${ADMIN}','fixture-operation',9001,'synthetic-fixture-digest',1);
    INSERT INTO notification_preferences VALUES('${ADMIN}',3,'["viewing"]');
    INSERT INTO notification_observations VALUES('fixture:category','check','1:gas','fixture','fixture',1,'rental','1',9001);`);
  const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const snapshots=Object.fromEntries(tables.map(n=>[n,db.prepare(`SELECT * FROM ${n}`).all()]));
  const triggers=db.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name").all();
  const indexes=db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL ORDER BY name").all();
  db.exec('BEGIN');db.exec(readFileSync(migration,'utf8'));db.exec('COMMIT');
  for(const n of tables)assert.deepEqual(db.prepare(`SELECT * FROM ${n}`).all(),snapshots[n],n);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name").all(),triggers);
  assert.deepEqual(db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL ORDER BY name").all(),indexes);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  db.exec("INSERT INTO notifications(event_id,category,title,action_required,created_at) VALUES(9001,'compliance','New category',0,'2026-11-09')");
  assert.equal(db.prepare("SELECT revision FROM notifications WHERE title='New category'").get().revision,1);
  db.close();
});
