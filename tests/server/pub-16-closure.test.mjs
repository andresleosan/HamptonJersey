import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEnv,seedListing,seedMedia,adminCookie,call,T0} from './helpers.mjs';
import {listingBatch} from '../../server/listing-events.js';

const proposal=readFileSync(new URL('../../docs/roadmap/work/PUB-16/rental-closure.proposed.sql',import.meta.url),'utf8');
const get=(env,sql,...args)=>env.DB.raw.prepare(sql).get(...args);
const run=(env,sql,...args)=>env.DB.raw.prepare(sql).run(...args);
const listing=env=>get(env,"SELECT * FROM listings WHERE id='HE-R001'");
const window=env=>get(env,"SELECT * FROM rental_closure_windows WHERE listing_id='HE-R001' ORDER BY opened_at DESC LIMIT 1");
async function setup({enabled=true,...over}={}) {
  const env=makeEnv(); seedListing(env,{operation:'rent',availability:'to_let',published:1,viewings_enabled:1,...over});
  seedMedia(env,{kind:'document',public:0});
  if(enabled){env.DB.raw.exec(proposal);env.PUB16_TIMED_CLOSURE_READY='1';}
  return {env,cookie:await adminCookie()};
}
const command=(env,over={})=>({request_id:crypto.randomUUID(),updated_at:listing(env).updated_at,
  action:'let',reason_code:'completed',occurred_at:T0,evidence_refs:['media:A00001'],...over});
const send=(env,cookie,body)=>call(env,'POST','/admin/listings/HE-R001/rental-marketing',{cookie,body});
const confirm=async(env,value)=>listingBatch(env,'HE-R001',{actor:'admin@example.test',source:'panel',action:'confirmed'},[
  env.DB.prepare("UPDATE listings SET confirmed_at=? WHERE id='HE-R001'").bind(value),
]);

test('gate off keeps the current rental transition without consulting proposed schema',async()=>{
  const {env,cookie}=await setup({enabled:false});
  assert.equal((await send(env,cookie,command(env))).status,200);
  assert.equal(listing(env).availability,'let');
});

test('a confirmed rental starts one exact 24-hour window and replays without resetting it',async()=>{
  const {env,cookie}=await setup(),close=command(env);
  const first=await send(env,cookie,close); assert.equal(first.status,200);
  assert.equal(listing(env).availability,'let_agreed'); assert.equal(listing(env).published,1);
  const started=window(env); assert.equal(started.state,'open');
  assert.equal(Date.parse(started.due_at)-Date.parse(started.opened_at),86400000);
  assert.equal(started.previous_availability,'to_let'); assert.equal(started.previous_published,1);
  const replay=await send(env,cookie,close); assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);
  assert.deepEqual({...window(env)},{...started});
  const again=await send(env,cookie,command(env)); assert.equal(again.status,409);
  assert.deepEqual({...window(env)},{...started});
});

test('correction restores the exact prior state and preserves disabled viewings',async()=>{
  const {env,cookie}=await setup({availability:'lease',viewings_enabled:0,confirmed_at:null});
  assert.equal((await send(env,cookie,command(env))).status,200);
  const result=await send(env,cookie,command(env,{action:'return_to_market',reason_code:'correction'}));
  assert.equal(result.status,200); assert.equal(listing(env).availability,'lease');
  assert.equal(listing(env).viewings_enabled,0);assert.equal(listing(env).published,1);assert.equal(listing(env).confirmed_at,null);
  assert.equal(window(env).state,'corrected');
});

test('a later confirmation without an updated_at change makes correction conflict',async()=>{
  const {env,cookie}=await setup();
  assert.equal((await send(env,cookie,command(env))).status,200);
  const version=listing(env).updated_at;
  run(env,"UPDATE listings SET confirmed_at='2026-11-12T12:00:00.000Z' WHERE id='HE-R001'");
  assert.equal(listing(env).updated_at,version);
  const result=await send(env,cookie,command(env,{action:'return_to_market',reason_code:'correction'}));
  assert.equal(result.status,409);assert.equal(listing(env).confirmed_at,'2026-11-12T12:00:00.000Z');
  assert.equal(window(env).state,'open');
});

test('closure and evidence failures leave the listing, event and window unchanged',async()=>{
  const {env,cookie}=await setup();
  env.DB.raw.exec("CREATE TRIGGER fail_closure BEFORE INSERT ON rental_closure_windows BEGIN SELECT RAISE(ABORT,'synthetic closure failure'); END");
  assert.equal((await send(env,cookie,command(env))).status,500);
  assert.equal(listing(env).availability,'to_let');assert.equal(listing(env).updated_at,T0);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM rental_closure_windows').n,0);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM events').n,0);
});

test('a confirmation arriving between read and batch blocks starting the closure',async()=>{
  const {env,cookie}=await setup(),batch=env.DB.batch.bind(env.DB); let injected=false;
  env.DB.batch=async statements=>{
    if(!injected&&statements.some(s=>s.sql.includes('INSERT INTO rental_closure_windows'))){
      injected=true;run(env,"UPDATE listings SET confirmed_at='2026-11-12T12:00:00.000Z' WHERE id='HE-R001'");
    }
    return batch(statements);
  };
  const result=await send(env,cookie,command(env));
  assert.equal(injected,true);assert.equal(result.status,409);
  assert.equal(listing(env).availability,'to_let');assert.equal(listing(env).confirmed_at,'2026-11-12T12:00:00.000Z');
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM rental_closure_windows').n,0);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM events').n,0);
});

test('a confirmation changed and restored between read and batch still blocks a stale closure',async()=>{
  const {env,cookie}=await setup(),batch=env.DB.batch.bind(env.DB),original=listing(env).confirmed_at;let injected=false;
  env.DB.batch=async statements=>{
    if(!injected&&statements.some(s=>s.sql.includes('INSERT INTO rental_closure_windows'))){
      injected=true;await confirm(env,'2026-11-12T12:00:00.000Z');await confirm(env,original);
    }
    return batch(statements);
  };
  const result=await send(env,cookie,command(env));
  assert.equal(injected,true);assert.equal(result.status,409);assert.equal(listing(env).confirmed_at,original);
  assert.equal(listing(env).availability,'to_let');assert.equal(listing(env).updated_at,T0);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM rental_closure_windows').n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='listing.confirmed'").n,2);
});

test('a confirmation changed and restored after closure makes correction conflict',async()=>{
  const {env,cookie}=await setup();assert.equal((await send(env,cookie,command(env))).status,200);
  const applied=listing(env).confirmed_at,version=listing(env).updated_at;
  await confirm(env,'2026-11-12T12:00:00.000Z');await confirm(env,applied);
  assert.equal(listing(env).updated_at,version);assert.equal(listing(env).confirmed_at,applied);
  const result=await send(env,cookie,command(env,{action:'return_to_market',reason_code:'correction'}));
  assert.equal(result.status,409);assert.equal(listing(env).availability,'let_agreed');
  assert.equal(window(env).state,'open');
});

test('an event insertion failure rolls back the closure, evidence and operation receipt',async()=>{
  const {env,cookie}=await setup();
  env.DB.raw.exec("CREATE TRIGGER fail_event BEFORE INSERT ON events WHEN NEW.type='listing.availability_changed' BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END");
  const result=await send(env,cookie,command(env));assert.equal(result.status,500);
  assert.equal(listing(env).availability,'to_let');assert.equal(listing(env).updated_at,T0);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM rental_closure_windows').n,0);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM listing_marketing_evidence').n,0);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM listing_event_operations').n,0);
});

test('a correction crossing the boundary before its final write rolls everything back',async()=>{
  const {env,cookie}=await setup();assert.equal((await send(env,cookie,command(env))).status,200);
  const before={...listing(env)},existing={...window(env)},events=get(env,'SELECT COUNT(*) AS n FROM events').n;
  const prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=statement=>prepare(statement.startsWith("UPDATE rental_closure_windows SET state='corrected'")
    ? statement.replaceAll("strftime('%Y-%m-%dT%H:%M:%fZ','now')",`'${existing.due_at}'`) : statement);
  const result=await send(env,cookie,command(env,{action:'return_to_market',reason_code:'correction'}));
  assert.equal(result.status,409); assert.deepEqual({...listing(env)},before);
  assert.deepEqual({...window(env)},existing);assert.equal(get(env,'SELECT COUNT(*) AS n FROM events').n,events);
});

test('proposal prevents replacement of an open window with recursive triggers disabled',async()=>{
  const {env,cookie}=await setup();assert.equal((await send(env,cookie,command(env))).status,200);
  const before={...window(env)};env.DB.raw.exec('PRAGMA recursive_triggers=OFF');
  assert.throws(()=>env.DB.raw.exec("INSERT OR REPLACE INTO rental_closure_windows SELECT * FROM rental_closure_windows WHERE listing_id='HE-R001'"),/already exists/);
  assert.deepEqual({...window(env)},before);
});
