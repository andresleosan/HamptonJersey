import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {makeEnv,seedListing,call,adminCookie} from './helpers.mjs';
import {weeklyPeriod,weeklyInsightsPass} from '../../server/weekly-insights.js';

const TS='2026-11-09T08:00:00.000Z', WEEK='2026-11-02';
const row=(env,sql,...args)=>env.DB.raw.prepare(sql).get(...args);
const run=(env,sql,...args)=>env.DB.raw.prepare(sql).run(...args);
const report=env=>JSON.parse(row(env,'SELECT payload FROM weekly_insights WHERE week_start=?',WEEK).payload);
const get=async(env,path,cookie)=>call(env,'GET',path,{cookie:cookie??await adminCookie('admin@example.test')});
function world(){
  const env=makeEnv();seedListing(env);
  for(const [day,n] of [['2026-11-01',7],[WEEK,2],['2026-11-08',3],['2026-11-09',11]])run(env,"INSERT INTO daily_stats VALUES(?,'HE-R001','view',?)",day,n);
  const cid=Number(run(env,"INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Private fixture','private@example.test',?,?,?)",TS,TS,TS).lastInsertRowid);
  for(const [op,at,archived] of [['rent',WEEK+'T00:00:00.000Z',null],['buy','2026-11-08T23:59:59.999Z',null],['rent',TS,TS]])
    run(env,"INSERT INTO applicants(contact_id,operation,stage,source,created_at,updated_at,archived_at) VALUES(?,?,'searching','phone',?,?,?)",cid,op,at,TS,archived);
  for(const [at,date] of [['2026-11-01T23:59:59.999Z',WEEK],[WEEK+'T00:00:00.000Z',WEEK],['2026-11-08T23:59:59.999Z','2026-11-08'],['2026-11-09T00:00:00.000Z','2026-11-09']])
    run(env,"INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at) VALUES('HE-R001','In person',?,'10:00','Private visitor','visitor@example.test','completed',?)",date,at);
  return env;
}

test('weekly calendar: Monday 08:00 Jersey, closed local week, DST and current-week catch-up',()=>{
  assert.equal(weeklyPeriod('2026-11-09T07:59:59.999Z'),null);
  for(const [ts,start,end] of [
    [TS,'2026-11-02T00:00:00.000Z','2026-11-09T00:00:00.000Z'],
    ['2026-07-06T07:00:00.000Z','2026-06-28T23:00:00.000Z','2026-07-05T23:00:00.000Z'],
    ['2026-03-30T07:00:00.000Z','2026-03-23T00:00:00.000Z','2026-03-29T23:00:00.000Z'],
    ['2026-10-26T08:00:00.000Z','2026-10-18T23:00:00.000Z','2026-10-26T00:00:00.000Z'],
  ]){const p=weeklyPeriod(ts);assert.equal(p.startUtc,start);assert.equal(p.endUtc,end);}
  assert.equal(weeklyPeriod('2026-11-10T09:00:00.000Z').from,WEEK);
  assert.equal(weeklyPeriod('2026-11-15T23:59:59.000Z').from,WEEK);
  assert.equal(weeklyPeriod('2026-11-16T07:59:59.000Z'),null);
  assert.throws(()=>weeklyPeriod('invalid'),/timestamp/i);
});

test('snapshot bounds all counts, stores only aggregates and keeps historical values on replay',async()=>{
  const env=world();
  assert.deepEqual(await weeklyInsightsPass(env,'2026-11-09T07:59:00.000Z'),{created:false,week_start:null});
  const results=await Promise.all([weeklyInsightsPass(env,TS),weeklyInsightsPass(env,TS)]);
  assert.equal(results.filter(r=>r.created).length,1);
  const saved=report(env);
  assert.deepEqual(saved.period,{days:7,from:WEEK,to:'2026-11-08'});
  assert.deepEqual(saved.totals,{views:5,viewing_requests:2,new_applicants:2,viewings_completed:3});
  assert.deepEqual(saved.most_viewed,[{listing_id:'HE-R001',views:5}]);
  assert.equal(saved.coverage.first_day,'2026-11-01');
  const json=JSON.stringify(saved);for(const privateValue of ['Private fixture','private@example.test','Private visitor','visitor@example.test'])assert.ok(!json.includes(privateValue));
  run(env,'UPDATE daily_stats SET n=100');
  assert.equal((await weeklyInsightsPass(env,'2026-11-10T10:00:00.000Z')).created,false);
  assert.deepEqual(report(env),saved);
  const linked=row(env,"SELECT n.*,e.type FROM notifications n JOIN events e ON e.id=n.event_id WHERE n.task_key=?",'insights:weekly:'+WEEK);
  assert.equal(linked.type,'analytics.weekly_created');assert.equal(linked.source_version,linked.event_id);
  assert.equal(linked.action_required,0);assert.equal(linked.target_kind,'collection');
  assert.equal(row(env,"SELECT COUNT(*) AS n FROM events WHERE type='analytics.weekly_created'").n,1);
  assert.equal(row(env,'SELECT COUNT(*) AS n FROM notification_task_history WHERE task_id=?',linked.id).n,1);
  assert.deepEqual(env.DB.raw.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('notice failure rolls back the snapshot and event; next tick recovers',async()=>{
  const env=makeEnv();env.DB.raw.exec("CREATE TRIGGER fixture_fail BEFORE INSERT ON notifications WHEN NEW.task_key LIKE 'insights:weekly:%' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  await assert.rejects(weeklyInsightsPass(env,TS),/fixture failure/);
  assert.equal(row(env,'SELECT COUNT(*) AS n FROM weekly_insights').n,0);
  assert.equal(row(env,"SELECT COUNT(*) AS n FROM events WHERE type='analytics.weekly_created'").n,0);
  env.DB.raw.exec('DROP TRIGGER fixture_fail');await weeklyInsightsPass(env,TS);
  assert.deepEqual(report(env).totals,{views:0,viewing_requests:0,new_applicants:0,viewings_completed:0});
  assert.deepEqual(report(env).most_viewed,[]);assert.equal(report(env).coverage.first_day,null);
});

test('migration is additive and rejects a non-Monday or impossible week',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const dir=new URL('../../migrations/',import.meta.url);
  for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<'0036_').sort())db.exec(readFileSync(new URL(f,dir),'utf8'));
  db.exec("INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES('2026-11-01','system','admin','fixture','fixture'); INSERT INTO notifications(event_id,category,title,action_required,created_at) VALUES(last_insert_rowid(),'message','Existing',0,'2026-11-01');");
  const before=db.prepare('SELECT * FROM notifications').all(),history=db.prepare('SELECT * FROM notification_task_history').all();
  db.exec(readFileSync(new URL('0036_weekly_insights.sql',dir),'utf8'));
  assert.deepEqual(db.prepare('SELECT * FROM notifications').all(),before);assert.deepEqual(db.prepare('SELECT * FROM notification_task_history').all(),history);
  for(const invalid of ['2026-11-03','2026-02-30','no-date'])assert.throws(()=>db.prepare('INSERT INTO weekly_insights VALUES(?,?,?,?)').run(invalid,'2026-11-09',TS,'{"version":1}'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
});

test('saved report API requires Staff and validates a real Monday; later activity does not change it',async()=>{
  const env=world(),path='/admin/insights/weekly/'+WEEK;
  assert.equal((await call(env,'GET',path)).status,401);
  for(const bad of ['2026-02-30','2026-11-03','bad'])assert.equal((await get(env,'/admin/insights/weekly/'+bad)).status,400);
  assert.equal((await get(env,path)).status,404);
  await weeklyInsightsPass(env,TS);const saved=report(env);
  assert.deepEqual((await get(env,path)).data,saved);
  run(env,'DELETE FROM listings');
  assert.deepEqual((await get(env,path,await adminCookie('colleague@example.test'))).data,saved);
  assert.equal((await get(env,'/admin/insights?days=7')).status,200);
});

test('weekly Feed notices have exact links, per-Staff read receipts, preferences and no task mutations',async()=>{
  const env=makeEnv();await weeklyInsightsPass(env,TS);
  const cookie=await adminCookie('admin@example.test'),other=await adminCookie('colleague@example.test');
  const feed=()=>get(env,'/admin/notifications?box=feed',cookie);
  const n=(await feed()).data.notifications.find(n=>n.entity_id==='weekly-insights:'+WEEK);
  assert.equal(n.link,'#/insights/weekly/'+WEEK);assert.equal(n.weekly_insights,WEEK);assert.equal(n.target_exists,true);
  assert.equal(n.can_reopen,false);assert.equal(n.phone,null);assert.equal(n.is_read,0);
  assert.equal((await get(env,'/admin/notifications?box=action')).data.notifications.length,0);
  assert.equal((await get(env,'/admin/notifications/counts')).data.action,0);
  assert.equal((await get(env,'/admin/notification-alerts?version=0&id=0')).data.alerts.length,0);
  assert.equal((await call(env,'PUT',`/admin/notification-tasks/${n.id}/read`,{cookie,body:{revision:n.revision}})).status,200);
  assert.equal((await feed()).data.notifications.find(x=>x.id===n.id).is_read,1);
  assert.equal((await get(env,'/admin/notifications?box=feed',other)).data.notifications.find(x=>x.id===n.id).is_read,0);
  for(const action of ['claim','assign','deadline','edit','done','reopen']){
    const r=await call(env,'PUT',`/admin/notification-tasks/${n.id}`,{cookie,body:{operation_id:crypto.randomUUID(),revision:n.revision,action,assigned_to:null,due_at:null}});
    assert.equal(r.status,400);assert.equal(r.data.error,'Weekly Insights is an informational notice');
  }
  run(env,"INSERT INTO notification_preferences VALUES('admin@example.test',1,'[\"task\"]')");
  assert.equal((await feed()).data.notifications.length,0);
  assert.equal((await get(env,'/admin/notification-tasks/'+n.id)).status,200);
});

test('unrelated events and invented collection IDs cannot create weekly links',async()=>{
  const env=makeEnv();await weeklyInsightsPass(env,TS);
  run(env,"INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES(?,'system','admin',?,'fixture')",TS,'weekly-insights:'+WEEK);
  const eid=row(env,'SELECT MAX(id) AS id FROM events').id;
  run(env,"INSERT INTO notifications(event_id,category,title,action_required,created_at,target_kind,target_id) VALUES(?,'message','Forged',0,?,'collection',?)",eid,TS,'weekly-insights:'+WEEK);
  const n=(await get(env,'/admin/notifications?box=feed')).data.notifications.find(n=>n.title==='Forged');
  assert.equal(n.link,null);assert.equal(n.weekly_insights,undefined);
  const manual=await call(env,'POST','/admin/notification-tasks',{cookie:await adminCookie('admin@example.test'),body:{operation_id:crypto.randomUUID(),target:{kind:'collection',id:'weekly-insights:'+WEEK},title:'Invalid'}});
  assert.equal(manual.status,400);
});
