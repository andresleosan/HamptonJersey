import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, seedListing, call } from './helpers.mjs';
import { bookStatement } from '../../server/viewing-store.js';

const day = '2026-10-29';
const counts = env => ['viewing_requests','events','notifications'].map(table =>
  env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
const request = env => call(env, 'POST', '/viewings', { body:{ listing_id:'HE-R001', negotiator_id:1,
  kind:'In person', date:day, time:'11:00', name:'Test Buyer', email:'buyer@example.test', turnstile:'fixture' } });

async function world(t) {
  t.mock.timers.enable({ apis:['Date'], now:Date.parse('2026-10-28T09:00:00.000Z') });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({success:true,hostname:'hampton.test'})));
  const env=makeEnv(); seedListing(env);
  return env;
}

for (const state of ['sold','let_agreed','let','withdrawn']) {
  test(`${state} properties cannot offer or accept public bookings`, async t => {
    const env=await world(t);
    env.DB.raw.prepare('UPDATE listings SET availability=? WHERE id=?').run(state,'HE-R001');
    const availability=await call(env,'GET',`/availability?from=${day}&days=1&listing_id=HE-R001`);
    assert.equal(availability.status,404,state);
    const result=await request(env);
    assert.equal(result.status,400,state);
    assert.match(result.data.fields?.listing_id ?? '', /no longer available/i, state);
    assert.deepEqual(counts(env),[0,0,0],state);
  });
}

test('a property sold between the eligibility check and slot read tells the client to reload', async t => {
  const env=await world(t), original=env.DB.batch.bind(env.DB);
  let raced=false;
  env.DB.batch=statements => {
    if (!raced && statements.some(statement=>statement.sql.includes('SELECT viewings_enabled, viewing_hours FROM listings'))) {
      raced=true;
      env.DB.raw.prepare("UPDATE listings SET availability='sold' WHERE id='HE-R001'").run();
    }
    return original(statements);
  };
  const result=await request(env);
  assert.equal(raced,true);
  assert.equal(result.status,400);
  assert.match(result.data.fields?.listing_id ?? '', /no longer available/i);
  assert.deepEqual(counts(env),[0,0,0]);
});

test('a property sold after the slot check cannot create a booking, event or notice', async t => {
  const env=await world(t), original=env.DB.batch.bind(env.DB);
  let raced=false;
  env.DB.batch=statements => {
    if (!raced && statements.some(statement=>statement.sql.includes('INSERT INTO viewing_requests'))) {
      raced=true;
      env.DB.raw.prepare("UPDATE listings SET availability='sold' WHERE id='HE-R001'").run();
    }
    return original(statements);
  };
  const result=await request(env);
  assert.equal(raced,true);
  assert.equal(result.status,409);
  assert.deepEqual(counts(env),[0,0,0]);
});

test('the public listing exposes viewing policy without exposing internal hours', async t => {
  const env=await world(t);
  env.DB.raw.prepare("UPDATE listings SET viewings_enabled=0, viewing_hours=NULL WHERE id='HE-R001'").run();
  const result=await call(env,'GET','/listings');
  assert.equal(result.status,200);
  const listing=result.data.find(item=>item.id==='HE-R001');
  assert.equal(listing.viewingsEnabled,false);
  assert.equal(Object.hasOwn(listing,'viewing_hours'),false);
  const booking=await request(env);
  assert.equal(booking.status,400);
  assert.ok(booking.data.fields?.listing_id);
  assert.deepEqual(counts(env),[0,0,0]);
});

test('under offer remains bookable when the property and schedule permit it', async t => {
  const env=await world(t);
  env.DB.raw.prepare("UPDATE listings SET availability='under_offer' WHERE id='HE-R001'").run();
  assert.equal((await request(env)).status,201);
});

test('real local D1 rejects a booking after the property becomes sold', async () => {
  const require=createRequire(import.meta.url);
  const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
  const {unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
    script:"export default {fetch(){return new Response('fixture')}}",compatibilityDate:'2025-10-01',
    host:'127.0.0.1',port:0,d1Databases:{DB:'pub16-synthetic'}}));
  try {
    const DB=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const file of readdirSync(dir).filter(name=>name.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(file,dir),'utf8')).map(sql=>DB.prepare(sql)));
    await DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,country,published,created_at,updated_at)
      VALUES('HE-R001','residential','Fixture','sale','for_sale','Jersey',1,?,?)`).bind('2026-10-28T09:00:00.000Z','2026-10-28T09:00:00.000Z').run();
    assert.equal((await DB.prepare("SELECT availability FROM listings WHERE id='HE-R001'").first()).availability,'for_sale');
    await DB.prepare("UPDATE listings SET availability='sold' WHERE id='HE-R001'").run();
    const v={listing_id:'HE-R001',negotiator_id:1,kind:'In person',date:day,time:'11:00',
      name:'Fixture',email:'buyer@example.test',phone:null};
    const [result]=await DB.batch([bookStatement({DB},v,{status:'requested',publicOnly:true})]);
    assert.equal(result.meta.changes,0);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM viewing_requests').first()).n,0);
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally { await mf.dispose(); }
});
