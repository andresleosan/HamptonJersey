import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, seedListing, call, adminCookie, T0 } from './helpers.mjs';

const ID = 'HE-R001';
const code = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function fixture() {
  const env = makeEnv();
  env.PUB09_WITHDRAWALS_READY = '1';
  seedListing(env, { id: ID, published: 1, published_at: '2026-01-01T00:00:00.000Z', availability: 'for_sale' });
  return { env, cookie: await adminCookie() };
}
const request = (env, cookie, path, body) => call(env, 'POST', path, { cookie, body });
const withdraw = (env, cookie, body) => request(env, cookie, `/admin/listings/${ID}/unpublish`, body);
const input = n => ({ updated_at: T0, reason_code: 'owner_request', note: 'Private fixture note', operation_id: code(n) });
const count = (env, table) => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('explicit withdrawal requires a reason, and other requires a note', async () => {
  const { env, cookie } = await fixture();
  for (const reason_code of [null, 'unknown', '']) {
    const r = await withdraw(env, cookie, { ...input(1), reason_code });
    assert.equal(r.status, 400);
  }
  assert.equal((await withdraw(env, cookie, { ...input(2), reason_code: 'other', note: '' })).status, 400);
  assert.equal(env.DB.raw.prepare('SELECT published FROM listings WHERE id=?').get(ID).published, 1);
});

test('one withdrawal preserves publication history, availability and private notes without duplicating events', async () => {
  const { env, cookie } = await fixture();
  const body = input(3), first = await withdraw(env, cookie, body);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.withdrawal.reason_code, 'owner_request');
  const again = await withdraw(env, cookie, body);
  assert.equal(again.status, 200);
  assert.equal(again.data.replayed, true);
  assert.equal(again.data.withdrawal.id, first.data.withdrawal.id);
  assert.equal(count(env, 'listing_withdrawals'), 1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_id=? AND type='listing.unpublished'").get(ID).n, 1);
  const row = env.DB.raw.prepare('SELECT published,published_at,availability FROM listings WHERE id=?').get(ID);
  assert.equal(row.published, 0);
  assert.equal(row.published_at, '2026-01-01T00:00:00.000Z');
  assert.equal(row.availability, 'for_sale');
  const event = env.DB.raw.prepare("SELECT data FROM events WHERE entity_id=? AND type='listing.unpublished'").get(ID);
  assert.ok(!event.data.includes(body.note));
  assert.equal(JSON.parse(event.data).withdrawal_id, first.data.withdrawal.id);
  const publicResponse = await call(env, 'GET', '/listings');
  assert.equal(publicResponse.status, 200);
  assert.ok(!JSON.stringify(publicResponse.data).includes(body.note));
});

test('a system recalculation may record an unknown reason without inventing one', async () => {
  const { env } = await fixture();
  const { recordListingWithdrawal } = await import('../../server/listing-traceability.js');
  const result = await recordListingWithdrawal(env, { listing_id: ID, expected_at: T0,
    reason_code: null, operation_id: code(17) }, 'system', { allowSystemUnknown: true, source: 'recalculate' });
  assert.equal(result.withdrawal.reason_code, null);
  assert.equal(env.DB.raw.prepare('SELECT reason_code FROM listing_withdrawals WHERE id=?').get(result.withdrawal.id).reason_code, null);
});

test('withdrawal clears an approved address and rollback restores it on failure', async () => {
  for (const failReceipt of [false, true]) {
    const { env, cookie } = await fixture();
    env.DB.raw.prepare(`INSERT INTO listing_details(listing_id,public_address_snapshot,public_address_snapshot_hash,
      public_address_evidence_ref,public_address_reviewed_by,public_address_reviewed_at) VALUES(?,?,?,?,?,?)`)
      .run(ID, 'Synthetic address', 'a'.repeat(64), 'synthetic-evidence', 'synthetic-staff', T0);
    if (failReceipt) env.DB.raw.exec("CREATE TRIGGER fixture_fail_address BEFORE INSERT ON listing_withdrawal_receipts BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    const result = await withdraw(env, cookie, input(failReceipt ? 18 : 19));
    assert.equal(result.status, failReceipt ? 500 : 200);
    assert.equal(env.DB.raw.prepare('SELECT public_address_snapshot FROM listing_details WHERE listing_id=?').get(ID).public_address_snapshot,
      failReceipt ? 'Synthetic address' : null);
    assert.equal(env.DB.raw.prepare('SELECT published FROM listings WHERE id=?').get(ID).published, failReceipt ? 1 : 0);
  }
});

test('correction appends a revision without another unpublish event and rejects stale edits', async () => {
  const { env, cookie } = await fixture();
  const first = await withdraw(env, cookie, input(4));
  const id = first.data.withdrawal.id;
  const path = `/admin/listings/${ID}/withdrawals/${id}/correct`;
  const change = { expected_revision: 1, reason_code: 'data_correction', note: 'Updated private note', operation_id: code(5) };
  const result = await request(env, cookie, path, change);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.withdrawal.revision, 2);
  assert.equal((await request(env, cookie, path, change)).data.replayed, true);
  assert.equal((await request(env, cookie, path, { ...change, operation_id: code(6) })).status, 409);
  assert.equal(count(env, 'listing_withdrawal_revisions'), 1);
  assert.equal(env.DB.raw.prepare('SELECT reason_code FROM listing_withdrawals WHERE id=?').get(id).reason_code, 'owner_request');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_id=? AND type='listing.unpublished'").get(ID).n, 1);
});

test('failed withdrawal batch leaves listing, history and receipts untouched', async () => {
  const { env, cookie } = await fixture();
  env.DB.raw.exec("CREATE TRIGGER fixture_fail_withdrawal BEFORE INSERT ON listing_withdrawal_receipts BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  const result = await withdraw(env, cookie, input(7));
  assert.equal(result.status, 500);
  assert.equal(env.DB.raw.prepare('SELECT published FROM listings WHERE id=?').get(ID).published, 1);
  assert.equal(count(env, 'listing_withdrawals'), 0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_id=? AND type='listing.unpublished'").get(ID).n, 0);
});

test('without the flag, existing unpublish works before the new migration', async () => {
  const env = makeEnv(), cookie = await adminCookie();
  seedListing(env, { id: ID, published: 1 });
  env.DB.raw.exec('DROP TABLE listing_withdrawal_receipts; DROP TABLE listing_withdrawal_revisions; DROP TABLE listing_withdrawals');
  const result = await withdraw(env, cookie, { updated_at: T0 });
  assert.equal(result.status, 200);
});

test('stale and concurrent withdrawals cannot produce two events or cross property scope', async () => {
  const { env, cookie } = await fixture();
  seedListing(env, { id:'HE-R002', published:1 });
  const [a,b] = await Promise.all([withdraw(env,cookie,input(8)), withdraw(env,cookie,input(9))]);
  assert.deepEqual([a.status,b.status].sort(), [200,409]);
  const winner = a.status===200 ? a : b;
  const cross = await request(env,cookie,`/admin/listings/HE-R002/withdrawals/${winner.data.withdrawal.id}/correct`,
    {expected_revision:1,reason_code:'other',note:'Fixture',operation_id:code(10)});
  assert.equal(cross.status,409);
  assert.equal(count(env,'listing_withdrawals'),1);
  assert.equal(count(env,'listing_withdrawal_revisions'),0);
});

test('revoking staff before the batch blocks both withdrawal and correction without partial writes', async () => {
  for (const action of ['withdraw','correct']) {
    const {env,cookie}=await fixture();
    let path=`/admin/listings/${ID}/unpublish`, body=input(30);
    if (action==='correct') {
      const initial=await withdraw(env,cookie,input(31));
      path=`/admin/listings/${ID}/withdrawals/${initial.data.withdrawal.id}/correct`;
      body={expected_revision:1,reason_code:'other',note:'Private correction fixture',operation_id:code(32)};
    }
    const batch=env.DB.batch.bind(env.DB);
    env.DB.batch=async statements=>{
      env.DB.raw.prepare('DELETE FROM admins WHERE email=?').run('admin@example.test');
      return batch(statements);
    };
    const response=await request(env,cookie,path,body);
    assert.equal(response.status,401);
    assert.equal(env.DB.raw.prepare('SELECT published FROM listings WHERE id=?').get(ID).published,action==='withdraw'?1:0);
    assert.equal(count(env,'listing_withdrawals'),action==='withdraw'?0:1);
    assert.equal(count(env,'listing_withdrawal_revisions'),0);
    assert.equal(count(env,'listing_withdrawal_receipts'),action==='withdraw'?0:1);
  }
});

test('revocation during a history or receipt read cannot reveal private notes', async () => {
  for (const target of ['history','receipt']) {
    const {env,cookie}=await fixture();
    assert.equal((await withdraw(env,cookie,input(33))).status,200);
    const prepare=env.DB.prepare.bind(env.DB);
    env.DB.prepare=sql=>{
      if (target==='history' ? sql.includes('WITH versions AS') : sql.includes('SELECT r.request_hash'))
        env.DB.raw.prepare('DELETE FROM admins WHERE email=?').run('admin@example.test');
      return prepare(sql);
    };
    const response=target==='history' ? await call(env,'GET',`/admin/listings/${ID}/traceability`,{cookie})
      : await withdraw(env,cookie,input(33));
    assert.equal(response.status,401);
    assert.ok(!JSON.stringify(response.data).includes('Private fixture note'));
  }
});

test('traceability is staff-only and returns recorded views without invented calls or saves', async () => {
  const { env, cookie } = await fixture();
  const path=`/admin/listings/${ID}/traceability`;
  assert.equal((await call(env,'GET',path)).status,401);
  assert.equal((await call(env,'POST',`/admin/listings/${ID}/unpublish`,{cookie,origin:'https://elsewhere.invalid',body:input(20)})).status,403);
  const first=await withdraw(env,cookie,input(11));
  assert.equal(first.status,200);
  const result=await call(env,'GET',path,{cookie});
  assert.equal(result.status,200);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal(result.data.current_publication.published,false);
  assert.equal(result.data.withdrawal_history[0].reason_code,'owner_request');
  assert.equal(result.data.metrics.saved.value,null);
  assert.equal(result.data.metrics.calls.value,null);
  const history=await call(env,'GET',`/admin/listings/${ID}/history`,{cookie});
  assert.equal(history.status,200);
  assert.ok(history.data.items.some(item=>item.type==='listing.unpublished'&&!item.details_unavailable));
  assert.ok(!JSON.stringify(history.data).includes('Private fixture note'));
});

test('withdrawal history paginates 50 records without duplication and scopes its cursor', async () => {
  const { env, cookie } = await fixture();
  const first = await withdraw(env, cookie, input(21)), id = first.data.withdrawal.id;
  const add = env.DB.raw.prepare(`INSERT INTO listing_withdrawal_revisions
    (id,withdrawal_id,revision,previous_revision,reason_code,actor,at) VALUES(?,?,?,?,'data_correction','fixture-staff',?)`);
  for (let revision=2; revision<=53; revision++)
    add.run(code(100+revision),id,revision,revision-1,new Date(Date.UTC(2026,0,1,0,0,revision)).toISOString());
  env.DB.raw.prepare('UPDATE listing_withdrawals SET current_revision=53 WHERE id=?').run(id);
  seedListing(env, {id:'HE-R002'});
  const page1 = await call(env,'GET',`/admin/listings/${ID}/traceability`,{cookie});
  assert.equal(page1.status,200); assert.equal(page1.data.withdrawal_history.length,50); assert.ok(page1.data.next_cursor);
  const cursor=encodeURIComponent(page1.data.next_cursor);
  const page2 = await call(env,'GET',`/admin/listings/${ID}/traceability?cursor=${cursor}`,{cookie});
  assert.equal(page2.status,200); assert.equal(page2.data.withdrawal_history.length,3); assert.equal(page2.data.next_cursor,null);
  assert.equal(new Set([...page1.data.withdrawal_history,...page2.data.withdrawal_history].map(item=>item.id)).size,53);
  assert.equal((await call(env,'GET',`/admin/listings/HE-R002/traceability?cursor=${cursor}`,{cookie})).status,400);
});

test('a replay after a listing is deleted never returns the private correction note', async () => {
  const { env, cookie }=await fixture();
  const first=await withdraw(env,cookie,input(15));
  const path=`/admin/listings/${ID}/withdrawals/${first.data.withdrawal.id}/correct`;
  const body={expected_revision:1,reason_code:'other',note:'Private fixture',operation_id:code(16)};
  assert.equal((await request(env,cookie,path,body)).status,200);
  env.DB.raw.prepare('DELETE FROM listings WHERE id=?').run(ID);
  const replay=await request(env,cookie,path,body);
  assert.equal(replay.status,404);
  assert.ok(!JSON.stringify(replay.data).includes(body.note));
});

test('real local D1 serializes withdrawals and rolls back a failed receipt', async () => {
  const require=createRequire(import.meta.url);
  const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
  const {unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'pub09-fixture'}}));
  try {
    const DB=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(query=>DB.prepare(query)));
    await DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,published,created_at,updated_at)
      VALUES(?,'residential','Synthetic','sale','for_sale',1,?,?)`).bind(ID,T0,T0).run();
    await DB.prepare("INSERT INTO admins(email,added_by,added_at) VALUES('fixture-staff@example.test','fixture',?)").bind(T0).run();
    const {recordListingWithdrawal}=await import('../../server/listing-traceability.js');
    const payload=n=>({listing_id:ID,expected_at:T0,reason_code:'owner_request',note:'Fixture',operation_id:code(n)});
    const results=await Promise.allSettled([12,13].map(n=>recordListingWithdrawal({DB},payload(n),'fixture-staff@example.test')));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM listing_withdrawals').first()).n,1);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='listing.unpublished'").first()).n,1);
    await DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,published,created_at,updated_at)
      VALUES('HE-R002','residential','Synthetic','sale','for_sale',1,?,?)`).bind(T0,T0).run();
    await DB.prepare("CREATE TRIGGER fixture_failure BEFORE INSERT ON listing_withdrawal_receipts BEGIN SELECT RAISE(ABORT,'fixture failure'); END").run();
    await assert.rejects(recordListingWithdrawal({DB},{...payload(14),listing_id:'HE-R002'},'fixture-staff@example.test'));
    assert.equal((await DB.prepare("SELECT published FROM listings WHERE id='HE-R002'").first()).published,1);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_id='HE-R002'").first()).n,0);
    await DB.prepare('DROP TRIGGER fixture_failure').run();
    const revokedDb={prepare:DB.prepare.bind(DB),batch:async statements=>{
      await DB.prepare("DELETE FROM admins WHERE email='fixture-staff@example.test'").run();
      return DB.batch(statements);
    }};
    await assert.rejects(recordListingWithdrawal({DB:revokedDb},{...payload(40),listing_id:'HE-R002'},'fixture-staff@example.test'),
      error=>error.status===401);
    assert.equal((await DB.prepare("SELECT published FROM listings WHERE id='HE-R002'").first()).published,1);
    await DB.prepare("INSERT INTO admins(email,added_by,added_at) VALUES('fixture-staff@example.test','fixture',?)").bind(T0).run();
    const withdrawal=await recordListingWithdrawal({DB},{...payload(41),listing_id:'HE-R002'},'fixture-staff@example.test');
    const {correctListingWithdrawal}=await import('../../server/listing-traceability.js');
    await assert.rejects(correctListingWithdrawal({DB:revokedDb},{listing_id:'HE-R002',withdrawal_id:withdrawal.withdrawal.id,
      expected_revision:1,reason_code:'other',note:'Private fixture',operation_id:code(42)},'fixture-staff@example.test'),
      error=>error.status===401);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM listing_withdrawal_revisions').first()).n,0);
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally { await mf.dispose(); }
});
