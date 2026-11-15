import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,seedListing,seedMedia,adminCookie,call,T0} from './helpers.mjs';
import * as jobs from '../../server/rental-closure-job.js';

const get=(env,sql,...args)=>env.DB.raw.prepare(sql).get(...args);
async function setup() {
  const env=makeEnv(); env.PUB16_TIMED_CLOSURE_READY='1';
  seedListing(env,{operation:'rent',availability:'to_let',published:1});
  seedMedia(env,{kind:'document',public:0});
  const version=get(env,"SELECT updated_at FROM listings WHERE id='HE-R001'").updated_at;
  const response=await call(env,'POST','/admin/listings/HE-R001/rental-marketing',{cookie:await adminCookie(),body:{
    request_id:'job-fixture',updated_at:version,action:'let',reason_code:'completed',occurred_at:T0,evidence_refs:['media:A00001']}});
  assert.equal(response.status,200); return env;
}
function dbClock(env,initial) {
  let current=initial;const prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=statement=>prepare(statement.replaceAll("strftime('%Y-%m-%dT%H:%M:%fZ','now')",`'${current}'`));
  return value=>{current=value;};
}

test('job does nothing before the due instant and withdraws once on or after it',async()=>{
  assert.equal(typeof jobs.processExpiredRentalClosures,'function');
  const env=await setup(),w=get(env,"SELECT * FROM rental_closure_windows WHERE state='open'");
  let sent=0;env.EMAIL={send:async()=>{sent++;}};
  env.DB.raw.prepare(`INSERT INTO viewing_requests(listing_id,kind,date,time,name,email,status,created_at)
    VALUES('HE-R001','In person','2030-01-01','11:00','Synthetic','view@example.test','requested',?)`).run(T0);
  const move=dbClock(env,new Date(Date.parse(w.due_at)-1).toISOString());
  await jobs.processExpiredRentalClosures(env);
  assert.equal(get(env,"SELECT published FROM listings WHERE id='HE-R001'").published,1);
  assert.equal(get(env,"SELECT state FROM rental_closure_windows WHERE closure_id=?",w.closure_id).state,'open');
  assert.equal(get(env,'SELECT status FROM viewing_requests').status,'requested');
  move(w.due_at);
  await Promise.all([jobs.processExpiredRentalClosures(env),jobs.processExpiredRentalClosures(env)]);
  assert.equal(get(env,"SELECT published FROM listings WHERE id='HE-R001'").published,0);
  assert.equal(get(env,"SELECT state FROM rental_closure_windows WHERE closure_id=?",w.closure_id).state,'withdrawn');
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE entity_type='listing' AND type='listing.unpublished'").n,1);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM media').n,1);assert.equal(sent,0);
  assert.equal(get(env,'SELECT status FROM viewing_requests').status,'requested','visits remain pending; cancellation is not implemented');
});

test('failure creates one urgent task, later recovery resolves it, and no email is sent',async()=>{
  assert.equal(typeof jobs.processExpiredRentalClosures,'function');
  const env=await setup(),w=get(env,"SELECT * FROM rental_closure_windows WHERE state='open'");
  let sent=0;env.EMAIL={send:async()=>{sent++;}}; dbClock(env,w.due_at);
  env.DB.raw.exec("CREATE TRIGGER fail_pub16 BEFORE UPDATE OF published ON listings WHEN NEW.published=0 BEGIN SELECT RAISE(ABORT,'synthetic withdrawal failure'); END");
  await jobs.processExpiredRentalClosures(env); await jobs.processExpiredRentalClosures(env);
  assert.equal(get(env,"SELECT state FROM rental_closure_windows WHERE closure_id=?",w.closure_id).state,'open');
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE task_key=? AND urgency='urgent' AND resolved_at IS NULL",`pub16:withdrawal:${w.closure_id}`).n,1);
  env.DB.raw.exec('DROP TRIGGER fail_pub16'); await jobs.processExpiredRentalClosures(env);
  assert.equal(get(env,"SELECT state FROM rental_closure_windows WHERE closure_id=?",w.closure_id).state,'withdrawn');
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE task_key=? AND resolved_at IS NULL",`pub16:withdrawal:${w.closure_id}`).n,0);
  assert.equal(sent,0);
});

test('gate off never reads the proposed schema',async()=>{
  assert.equal(typeof jobs.processExpiredRentalClosures,'function');
  const env=makeEnv(); const result=await jobs.processExpiredRentalClosures(env);
  assert.deepEqual(result,{processed:0,withdrawn:0,failed:0});
});

test('a corrected closure is not withdrawn when the original deadline arrives',async()=>{
  const env=await setup(),w=get(env,"SELECT * FROM rental_closure_windows WHERE state='open'");
  const version=get(env,"SELECT updated_at FROM listings WHERE id='HE-R001'").updated_at;
  const correction=await call(env,'POST','/admin/listings/HE-R001/rental-marketing',{cookie:await adminCookie(),body:{
    request_id:'job-correction',updated_at:version,action:'return_to_market',reason_code:'correction',occurred_at:T0,evidence_refs:['media:A00001']}});
  assert.equal(correction.status,200);dbClock(env,w.due_at);await jobs.processExpiredRentalClosures(env);
  assert.equal(get(env,"SELECT published FROM listings WHERE id='HE-R001'").published,1);
  assert.equal(get(env,"SELECT availability FROM listings WHERE id='HE-R001'").availability,'to_let');
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='listing.unpublished'").n,0);
});

test('a failure after the listing update rolls back the listing and event before creating the urgent task',async()=>{
  const env=await setup(),w=get(env,"SELECT * FROM rental_closure_windows WHERE state='open'");dbClock(env,w.due_at);
  env.DB.raw.exec("CREATE TRIGGER fail_window BEFORE UPDATE OF state ON rental_closure_windows WHEN NEW.state='withdrawn' BEGIN SELECT RAISE(ABORT,'synthetic state failure'); END");
  await jobs.processExpiredRentalClosures(env);
  assert.equal(get(env,"SELECT published FROM listings WHERE id='HE-R001'").published,1);
  assert.equal(get(env,"SELECT state FROM rental_closure_windows WHERE closure_id=?",w.closure_id).state,'open');
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='listing.unpublished'").n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE task_key=? AND urgency='urgent' AND resolved_at IS NULL",`pub16:withdrawal:${w.closure_id}`).n,1);
});

test('an already unpublished listing closes the window only when the rental state is still consistent',async()=>{
  const env=await setup(),w=get(env,"SELECT * FROM rental_closure_windows WHERE state='open'");dbClock(env,w.due_at);
  env.DB.raw.exec("UPDATE listings SET published=0 WHERE id='HE-R001'");
  assert.equal((await jobs.processExpiredRentalClosures(env)).withdrawn,1);
  assert.equal(get(env,'SELECT state FROM rental_closure_windows WHERE closure_id=?',w.closure_id).state,'withdrawn');
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='listing.unpublished'").n,0);
});

test('an unpublished listing with changed operation, availability or archive requires urgent review',async()=>{
  for(const field of ['operation','availability','archived_at']){
    const env=await setup(),w=get(env,"SELECT * FROM rental_closure_windows WHERE state='open'");dbClock(env,w.due_at);
    const value=field==='operation'?'sale':field==='availability'?'to_let':'2026-11-01T00:00:00.000Z';
    env.DB.raw.prepare(`UPDATE listings SET published=0,${field}=? WHERE id='HE-R001'`).run(value);
    const result=await jobs.processExpiredRentalClosures(env);assert.equal(result.failed,1,field);
    assert.equal(get(env,'SELECT state FROM rental_closure_windows WHERE closure_id=?',w.closure_id).state,'open',field);
    assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE task_key=? AND urgency='urgent' AND resolved_at IS NULL",`pub16:withdrawal:${w.closure_id}`).n,1,field);
  }
});

test('a concurrent change after reading an unpublished listing prevents falsely closing its window',async()=>{
  const env=await setup(),w=get(env,"SELECT * FROM rental_closure_windows WHERE state='open'");dbClock(env,w.due_at);
  env.DB.raw.exec("UPDATE listings SET published=0 WHERE id='HE-R001'");
  const batch=env.DB.batch.bind(env.DB);let injected=false;
  env.DB.batch=async statements=>{
    if(!injected&&statements[0].sql.startsWith("UPDATE rental_closure_windows SET state='withdrawn'")){
      injected=true;env.DB.raw.exec("UPDATE listings SET operation='sale' WHERE id='HE-R001'");
    }
    return batch(statements);
  };
  const result=await jobs.processExpiredRentalClosures(env);assert.equal(injected,true);assert.equal(result.failed,1);
  assert.equal(get(env,'SELECT state FROM rental_closure_windows WHERE closure_id=?',w.closure_id).state,'open');
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE task_key=? AND urgency='urgent' AND resolved_at IS NULL",`pub16:withdrawal:${w.closure_id}`).n,1);
});

test('a bounded page of repeated failures does not starve a later due closure',async()=>{
  const env=await setup(),raw=env.DB.raw,opened='2026-11-10T00:00:00.000Z',due='2026-11-11T00:00:00.000Z';
  for(let n=2;n<=27;n++){
    const id=`HE-R${String(n).padStart(3,'0')}`,closureId=String(n).padStart(64,'0');
    seedListing(env,{id,operation:'rent',availability:'let_agreed',published:1});
    const event=raw.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,'fixture','listing',?,'listing.availability_changed',json_object('revision',1))").run(T0,id);
    raw.prepare(`INSERT INTO rental_closure_windows(closure_id,listing_id,close_event_id,state,opened_at,due_at,
      previous_availability,previous_published,previous_viewings_enabled,previous_confirmed_at,applied_confirmed_at,applied_updated_at)
      VALUES(?,?,?,'open',?,?,'to_let',1,1,NULL,NULL,?)`).run(closureId,id,event.lastInsertRowid,opened,due,T0);
  }
  dbClock(env,due);const queries=[],prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=sql=>{if(sql.includes('FROM rental_closure_windows w LEFT JOIN'))queries.push(sql);return prepare(sql);};
  raw.exec("CREATE TRIGGER fail_page BEFORE UPDATE OF published ON listings WHEN NEW.published=0 AND OLD.id<>'HE-R027' BEGIN SELECT RAISE(ABORT,'synthetic page failure'); END");
  const first=await jobs.processExpiredRentalClosures(env),second=await jobs.processExpiredRentalClosures(env);
  assert.deepEqual(first,{processed:25,withdrawn:0,failed:25});
  assert.deepEqual(second,{processed:1,withdrawn:1,failed:0});
  assert.equal(get(env,"SELECT published FROM listings WHERE id='HE-R027'").published,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE task_key LIKE 'pub16:withdrawal:%' AND urgency='urgent' AND resolved_at IS NULL").n,25);
  const plan=raw.prepare(`EXPLAIN QUERY PLAN ${queries[1]}`)
    .all(due,String(26).padStart(64,'0')).map(row=>row.detail).join(' ');
  // One row per letting ever recorded: the windows are scanned, each listing is read by its key.
  assert.match(plan,/SEARCH l USING INDEX sqlite_autoindex_listings_1/);assert.doesNotMatch(plan,/SCAN l/);
  const visibility=raw.prepare(`EXPLAIN QUERY PLAN SELECT closure_id FROM rental_closure_windows
    WHERE listing_id=? AND COALESCE(state,'') NOT IN ('corrected','withdrawn')`).all('HE-R027').map(row=>row.detail).join(' ');
  assert.match(visibility,/SEARCH rental_closure_windows USING PRIMARY KEY \(listing_id=\?\)/);
});

// After the 24 hours: the other viewings of the property, booked before it was let or sold, each get one Inbox task.
// Nothing is cancelled or sent: cancelling and telling the client is the team's until AUT-17 can send the notice.
const TOMORROW=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
const viewing=(env,o={})=>String(env.DB.raw.prepare(`INSERT INTO viewing_requests(listing_id,kind,date,time,end_time,name,email,status,created_at)
  VALUES('HE-R001','In person',?,'10:00','10:30',?,'client@example.test',?,?)`)
  .run(o.date??TOMORROW,o.name??'Synthetic client',o.status??'confirmed',o.created_at??T0).lastInsertRowid);
const tasks=env=>env.DB.raw.prepare(`SELECT e.entity_id AS viewing,n.title,n.category,n.action_required FROM notifications n
  JOIN events e ON e.id=n.event_id WHERE e.type='viewing.property_closed' ORDER BY CAST(e.entity_id AS INTEGER)`).all().map(t=>({...t}));
const task=(viewing,title)=>({viewing,title,category:'task',action_required:1});
const untouched=env=>JSON.stringify(env.DB.raw.prepare('SELECT * FROM viewing_requests').all());

test('24 hours after a rental is let, each upcoming viewing booked before it gets one task; nothing is cancelled or sent',async()=>{
  const env=await setup(),w=get(env,"SELECT * FROM rental_closure_windows WHERE state='open'");
  const a=viewing(env,{name:'Ana Synthetic'}),b=viewing(env,{status:'requested',name:'Ben Synthetic'});
  viewing(env,{status:'cancelled'});viewing(env,{date:'2020-01-01'});viewing(env,{created_at:'2999-01-01T00:00:00.000Z'});
  const before=untouched(env),changeClock=dbClock(env,new Date(Date.parse(w.due_at)-1).toISOString());
  await jobs.processExpiredRentalClosures(env);assert.deepEqual(tasks(env),[]);
  changeClock(w.due_at);await jobs.processExpiredRentalClosures(env);
  assert.deepEqual(tasks(env),[task(a,'Property let, cancel the viewing: Ana Synthetic'),task(b,'Property let, cancel the viewing: Ben Synthetic')]);
  await jobs.processExpiredRentalClosures(env);assert.equal(tasks(env).length,2,'once per viewing');
  assert.equal(untouched(env),before);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE category IN ('viewing','new_applicant')").n,0);
  // They reach the Inbox and open their viewing.
  const inbox=await call(env,'GET','/admin/notifications?box=action&category=task',{cookie:await adminCookie()});
  assert.deepEqual(inbox.data.notifications.filter(n=>n.title.startsWith('Property let')).map(n=>n.link).sort(),
    [`#/viewings?viewing=${a}`,`#/viewings?viewing=${b}`]);
});

test('a corrected rental gives no viewing task',async()=>{
  const env=await setup(),w=get(env,"SELECT * FROM rental_closure_windows WHERE state='open'");viewing(env);
  env.DB.raw.prepare("UPDATE rental_closure_windows SET state='corrected',corrected_at=? WHERE closure_id=?").run(T0,w.closure_id);
  dbClock(env,w.due_at);await jobs.processExpiredRentalClosures(env);assert.deepEqual(tasks(env),[]);
});

test('a completed sale gives the same tasks only 24 hours after it closed',async()=>{
  const env=makeEnv();env.PUB16_TIMED_CLOSURE_READY='1';seedListing(env,{operation:'sale',availability:'sold',published:1});
  env.DB.raw.exec('PRAGMA foreign_keys=OFF');
  const closed='2026-10-08T10:00:00.000Z';
  env.DB.raw.prepare(`INSERT INTO sales(listing_id,applicant_id,offer_id,price,status,closed_at,created_at,updated_at)
    VALUES('HE-R001',1,1,500000,'completed',?,?,?)`).run(closed,T0,closed);
  const v=viewing(env,{name:'Cal Synthetic'}),before=untouched(env);
  const changeClock=dbClock(env,'2026-10-09T09:59:59.999Z');
  await jobs.processExpiredRentalClosures(env);assert.deepEqual(tasks(env),[]);
  changeClock('2026-10-09T10:00:00.000Z');await jobs.processExpiredRentalClosures(env);
  assert.deepEqual(tasks(env),[task(v,'Property sold, cancel the viewing: Cal Synthetic')]);
  assert.equal(untouched(env),before);
});

test('the viewing tasks read only the closed listings\' viewings to come, by index',async()=>{
  const env=await setup(),w=get(env,"SELECT * FROM rental_closure_windows WHERE state='open'");viewing(env);
  dbClock(env,w.due_at);const queries=[],prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=sql=>{const s=prepare(sql);if(sql.includes('up AS MATERIALIZED')){const bind=s.bind.bind(s);
    s.bind=(...args)=>{queries.push({sql:s.sql??sql,args});return bind(...args);};}return s;};
  await jobs.processExpiredRentalClosures(env);assert.equal(queries.length,2);
  for(const q of queries){
    const plan=env.DB.raw.prepare(`EXPLAIN QUERY PLAN ${q.sql}`).all(...q.args).map(r=>r.detail).join(' | ');
    assert.match(plan,/viewing_listing/);assert.match(plan,/events_entity/);
    assert.doesNotMatch(plan,/SCAN (v|e|events|viewing_requests)\b/,plan);
  }
});
