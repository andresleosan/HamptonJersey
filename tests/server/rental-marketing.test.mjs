import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv, seedListing, seedMedia, adminCookie, call, T0} from './helpers.mjs';
const ADMIN='admin@example.test';

const row=env=>env.DB.raw.prepare("SELECT * FROM listings WHERE id='HE-R001'").get();
const count=(env,table)=>env.DB.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
async function setup(over={}){
  const env=makeEnv();seedListing(env,{operation:'rent',availability:'to_let',...over});
  seedMedia(env,{kind:'document',public:0});return {env,cookie:await adminCookie()};
}
const command=(env,over={})=>({request_id:crypto.randomUUID(),updated_at:row(env).updated_at,
  action:'let_agreed',reason_code:'agreement',occurred_at:T0,evidence_refs:['media:A00001'],...over});
const send=(env,cookie,body)=>call(env,'POST','/admin/listings/HE-R001/rental-marketing',{cookie,body});

test('EST-17: rental marketing records evidence/actor and replay survives a later transition',async()=>{
  const {env,cookie}=await setup(), first=command(env);
  const r=await send(env,cookie,first);assert.equal(r.status,200);assert.equal(row(env).availability,'let_agreed');
  const event=env.DB.raw.prepare('SELECT * FROM events WHERE id=?').get(r.data.event_id);
  assert.equal(event.actor,ADMIN);assert.equal(event.type,'listing.availability_changed');
  assert.equal(count(env,'listing_marketing_evidence'),1);
  assert.equal((await send(env,cookie,command(env,{action:'let',reason_code:'completed'}))).status,200);
  const again=await send(env,cookie,first);assert.equal(again.status,200);assert.equal(again.data.event_id,r.data.event_id);
  assert.equal(again.data.replayed,true);assert.equal(row(env).availability,'let');assert.equal(count(env,'listing_marketing_evidence'),2);
  assert.equal((await send(env,cookie,{...first,action:'let',reason_code:'completed'})).status,409);
  assert.equal(count(env,'tenancies'),0);assert.equal(count(env,'sales'),0);
});

test('EST-17: wrong operation, foreign evidence, future date and stale version leave no event',async()=>{
  const {env,cookie}=await setup();
  for(const over of [{request_id:123},{evidence_refs:[]},{evidence_refs:['media:missing']},{occurred_at:'2999-01-01T00:00:00.000Z'},
    {action:'let',reason_code:'agreement'}]) assert.ok((await send(env,cookie,command(env,over))).status>=400);
  const first=command(env);assert.equal((await send(env,cookie,first)).status,200);
  assert.equal((await send(env,cookie,command(env,{updated_at:T0,action:'let',reason_code:'completed'}))).status,409);
  const other=await setup({operation:'sale',availability:'for_sale'});
  assert.equal((await send(other.env,other.cookie,command(other.env))).status,400);
  assert.equal(count(other.env,'events'),0);
});

test('EST-17: generic writers cannot forge rental confirmation or escape it by changing operation',async()=>{
  const {env,cookie}=await setup();
  assert.equal((await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,availability:'let'}})).status,400);
  assert.equal((await call(env,'POST','/admin/listings',{cookie,body:{title:'Unconfirmed',use:'residential',operation:'rent',availability:'let'}})).status,400);
  await send(env,cookie,command(env));
  for(const patch of [{operation:'sale'},{availability:'to_let'}]) assert.equal((await call(env,'PUT','/admin/listings/HE-R001',{
    cookie,body:{updated_at:row(env).updated_at,...patch}})).status,400);
  assert.equal((await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:row(env).updated_at,title:'Still agreed'}})).status,200);
});

test('EST-17: evidence insertion failure rolls back listing, event and receipt',async()=>{
  const {env,cookie}=await setup();
  env.DB.raw.exec("CREATE TRIGGER fail_marketing BEFORE INSERT ON listing_marketing_evidence BEGIN SELECT RAISE(ABORT,'synthetic evidence failure'); END");
  assert.equal((await send(env,cookie,command(env))).status,500);
  assert.equal(row(env).availability,'to_let');assert.equal(row(env).updated_at,T0);
  assert.equal(count(env,'events'),0);assert.equal(count(env,'listing_event_operations'),0);
});

test('EST-17: evidence moved after validation aborts atomically with a reload conflict',async()=>{
  const {env,cookie}=await setup(),batch=env.DB.batch.bind(env.DB);let moved=false;
  env.DB.batch=async statements=>{
    if(!moved&&statements.some(s=>s.sql.includes('INSERT INTO listing_marketing_evidence'))){moved=true;
      seedListing(env,{id:'HE-R099'});env.DB.raw.exec("UPDATE media SET listing_id='HE-R099' WHERE id='A00001'");}
    return batch(statements);
  };
  assert.equal((await send(env,cookie,command(env))).status,409);
  assert.equal(row(env).availability,'to_let');assert.equal(count(env,'events'),0);
});

test('EST-17: evidence ownership, public viewing guard and exclusion from matching',async()=>{
  const {env,cookie}=await setup();
  seedListing(env,{id:'HE-R099'});seedMedia(env,{id:'FOREIGN',kind:'document',listing_id:'HE-R099',public:0});
  assert.equal((await send(env,cookie,command(env,{evidence_refs:['media:FOREIGN']}))).status,404);
  assert.equal((await send(env,undefined,command(env))).status,401);
  const first=command(env,{action:'let',reason_code:'completed'});
  assert.equal((await send(env,cookie,first)).status,200);
  const {CANDIDATES_SQL}=await import('../../server/match-store.js');
  assert.equal(env.DB.raw.prepare(`SELECT count(*) AS n FROM listings WHERE id='HE-R001' AND ${CANDIDATES_SQL}`).get().n,0);
  assert.equal((await call(env,'GET','/availability?listing_id=HE-R001')).status,404);
});

test('EST-17: research refresh and normal deletion preserve the recorded evidence snapshot',async()=>{
  const {env,cookie}=await setup();
  env.DB.raw.exec("INSERT INTO research_sources(source_id,property_id,title,url,observed_status) VALUES('SOURCE1','HE-R001','Original confirmation','https://example.test/confirmation','let agreed')");
  const r=await send(env,cookie,command(env,{evidence_refs:['source:SOURCE1']}));assert.equal(r.status,200);
  const before=env.DB.raw.prepare('SELECT evidence_snapshot FROM listing_marketing_evidence WHERE event_id=?').get(r.data.event_id);
  assert.ok(JSON.parse(before.evidence_snapshot).title==='Original confirmation');
  assert.doesNotThrow(()=>env.DB.raw.exec("DELETE FROM research_sources; INSERT INTO research_sources(source_id,property_id,title) VALUES('SOURCE1','HE-R001','A different observation')"));
  assert.deepEqual(env.DB.raw.prepare('SELECT evidence_snapshot FROM listing_marketing_evidence WHERE event_id=?').get(r.data.event_id),before);
  const second=await send(env,cookie,command(env,{action:'let',reason_code:'completed'}));assert.equal(second.status,200);
  assert.doesNotThrow(()=>env.DB.raw.exec("DELETE FROM media WHERE id='A00001'"));
  // Permanent listing deletion keeps the historical event and its private evidence record.
  env.DB.raw.exec("UPDATE listings SET archived_at='2026-11-01',published=0,review_requested_at=NULL,review_requested_by=NULL WHERE id='HE-R001'");
  assert.equal((await call(env,'DELETE','/admin/listings/HE-R001',{cookie,body:{confirm:'HE-R001'}})).status,200);
  assert.equal(count(env,'listing_marketing_evidence'),2);
  assert.ok(env.DB.raw.prepare('SELECT id FROM events WHERE id=?').get(r.data.event_id));
  assert.deepEqual(env.DB.raw.prepare('PRAGMA foreign_key_check').all(),[]);
});
