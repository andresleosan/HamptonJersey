import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEnv,seedListing,seedMedia,adminCookie,call,T0} from './helpers.mjs';
import * as jobs from '../../server/rental-closure-job.js';

const proposal=readFileSync(new URL('../../docs/roadmap/work/PUB-16/rental-closure.proposed.sql',import.meta.url),'utf8');
const get=(env,sql,...args)=>env.DB.raw.prepare(sql).get(...args);
async function setup() {
  const env=makeEnv(); env.DB.raw.exec(proposal);env.PUB16_TIMED_CLOSURE_READY='1';
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
  assert.match(plan,/rental_closure_due/);assert.ok(plan.includes('(due_at,closure_id)>(?,?)'));
  const visibility=raw.prepare(`EXPLAIN QUERY PLAN SELECT closure_id FROM rental_closure_windows
    WHERE listing_id=? AND COALESCE(state,'') NOT IN ('corrected','withdrawn')`).all('HE-R027').map(row=>row.detail).join(' ');
  assert.match(visibility,/rental_closure_listing/);
});
