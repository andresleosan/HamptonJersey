import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv, seedListing, seedMedia, adminCookie, call, T0} from './helpers.mjs';
const ADMIN='admin@example.test';

const row = env => env.DB.raw.prepare("SELECT * FROM listings WHERE id='HE-R001'").get();
const events = env => env.DB.raw.prepare("SELECT * FROM events WHERE entity_type='listing' ORDER BY id").all();
async function setup() {const env=makeEnv();seedListing(env,{published:0});return {env,cookie:await adminCookie()};}
const review = (env,cookie,action,at=row(env).updated_at) => call(env,'POST','/admin/listings/HE-R001/review',{
  cookie,body:{action,updated_at:at}});

test('EST-17: review is hidden, keeps availability and confirmation, edits keep ready, return clears it',async()=>{
  const {env,cookie}=await setup(), before=row(env);
  assert.equal((await review(env,cookie,'submit_review')).status,200);
  assert.equal(row(env).published,0);assert.equal(row(env).review_requested_by,ADMIN);
  assert.equal(row(env).availability,before.availability);assert.equal(row(env).confirmed_at,before.confirmed_at);
  assert.equal((await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:row(env).updated_at,title:'Reviewed title'}})).status,200);
  assert.ok(row(env).review_requested_at);
  const list=await call(env,'GET','/admin/listings',{cookie});assert.ok(list.data.listings[0].review_requested_at);
  assert.equal((await review(env,cookie,'return_draft')).status,200);assert.equal(row(env).review_requested_at,null);
  assert.deepEqual(events(env).map(e=>e.type),['listing.review_requested','listing.updated','listing.review_returned']);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM notifications WHERE title IN ('Property ready for review','Property returned to draft')").get().n,2);
});

test('EST-17: stale publication cannot publish a different revision; success clears review',async()=>{
  const {env,cookie}=await setup();await review(env,cookie,'submit_review');
  const post=at=>call(env,'POST','/admin/listings/HE-R001/publish',{cookie,body:{updated_at:at}});
  assert.equal((await post(T0)).status,409);assert.equal(row(env).published,0);
  assert.equal((await post(row(env).updated_at)).status,200);assert.equal(row(env).review_requested_at,null);
  assert.equal(row(env).published,1);
});

test('EST-17: review validates identity, origin, action, state and version',async()=>{
  const {env,cookie}=await setup();
  assert.equal((await review(env,undefined,'submit_review')).status,401);
  assert.equal((await call(env,'POST','/admin/listings/HE-R001/review',{cookie,origin:'https://elsewhere.test',body:{action:'submit_review',updated_at:T0}})).status,403);
  assert.equal((await review(env,cookie,'invented')).status,400);
  assert.equal((await call(env,'POST','/admin/listings/HE-R001/publish',{cookie})).status,400);
  assert.equal((await review(env,cookie,'return_draft')).status,409);
  const rs=await Promise.all([review(env,cookie,'submit_review',T0),review(env,cookie,'submit_review',T0)]);
  assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);assert.equal(events(env).length,1);
});

test('EST-17: event failure rolls back review markers',async()=>{
  const {env,cookie}=await setup();
  env.DB.raw.exec("CREATE TRIGGER fail_review BEFORE INSERT ON events WHEN NEW.type='listing.review_requested' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  assert.equal((await review(env,cookie,'submit_review')).status,500);
  assert.equal(row(env).review_requested_at,null);assert.equal(row(env).updated_at,T0);assert.equal(events(env).length,0);
});

test('EST-17: queue approval publishes only the version reviewed by staff',async()=>{
  const {env,cookie}=await setup();seedMedia(env);
  env.DB.raw.exec("UPDATE listings SET parish='St Helier',description='Synthetic complete description' WHERE id='HE-R001'; INSERT INTO drive_imports(id,folder_id,folder_name,status,listing_id,requested_by,created_at) VALUES(77,'fixture','Fixture','review','HE-R001','admin@example.test','2026-11-01')");
  assert.equal((await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,title:'A newer version'}})).status,200);
  assert.equal((await call(env,'POST','/admin/queue/77/approve',{cookie,body:{updated_at:T0}})).status,409);
  assert.equal(row(env).published,0);
  assert.equal(env.DB.raw.prepare('SELECT status FROM drive_imports WHERE id=77').get().status,'review');
  assert.equal((await call(env,'POST','/admin/queue/77/approve',{cookie,body:{updated_at:row(env).updated_at}})).status,200);
});

test('EST-17: review receipt identifies its own event when another edit immediately follows',async()=>{
  const {env,cookie}=await setup(),batch=env.DB.batch.bind(env.DB);let interleaved=false;
  env.DB.batch=async statements=>{
    const result=await batch(statements);
    if(!interleaved&&statements.some(s=>s.sql.includes('SET review_requested_at='))){interleaved=true;
      assert.equal((await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:row(env).updated_at,title:'Interleaved edit'}})).status,200);}
    return result;
  };
  const r=await review(env,cookie,'submit_review');assert.equal(r.status,200);
  assert.equal(env.DB.raw.prepare('SELECT type FROM events WHERE id=?').get(r.data.event_id).type,'listing.review_requested');
});

test('EST-17: restoring a historical archived row always leaves a hidden draft',async()=>{
  const {env,cookie}=await setup();
  env.DB.raw.exec("UPDATE listings SET published=1,archived_at='2026-11-01' WHERE id='HE-R001'");
  const r=await call(env,'POST','/admin/listings/HE-R001/restore',{cookie,body:{updated_at:T0}});
  assert.equal(r.status,200);assert.equal(r.data.listing.published,0);assert.equal(r.data.listing.review_requested_at,null);
});
