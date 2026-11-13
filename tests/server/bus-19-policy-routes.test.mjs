import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie } from './helpers.mjs';

const op = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const path = '/admin/market/sources';
function seed(env, count = 1) {
  const db = env.DB.raw;
  db.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,?,'accepted')")
    .run('fixture-rev', 'a'.repeat(64), '2000-01-01T00:00:00.000Z', 'fixture-review');
  for (let n = 0; n < count; n++) db.prepare(`INSERT INTO market_sources
    (source_ref,channel_id,directory_revision,source_kind,source_class,access_status)
    VALUES (?,?,'fixture-rev','external','general','pending')`).run(`source-${String(n).padStart(3,'0')}`, 'site');
}
const review = (n, overrides = {}) => ({ source_ref:'source-000', channel_id:'site', version:1,
  operation_id:op(n), status:'allowed', method:'http', allowed_hosts:['fixture.invalid'], allowed_paths:['/listings/'],
  allowed_redirect_hosts:[], min_interval_s:60, evidence_ref:'fixture-evidence', retention_ref:'fixture-retention',
  review_due_at:'2999-01-01T00:00:00.000Z', ...overrides });

test('source review routes are gated, require staff and deny cross-origin writes', async () => {
  const env = makeEnv(); seed(env); const cookie = await adminCookie();
  assert.equal((await call(env,'GET',path,{cookie})).status,404);
  env.MARKET_INVENTORY_READY = '1';
  assert.equal((await call(env,'GET',path)).status,401);
  assert.equal((await call(env,'POST',path+'/review',{cookie,origin:'https://attacker.test',body:review(1)})).status,403);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM market_source_policy_history').get().n,0);
});

test('paginated list does not expose private evidence, detail is scoped to source and channel', async () => {
  const env = makeEnv(); env.MARKET_INVENTORY_READY='1'; seed(env,51); const cookie=await adminCookie();
  const first=await call(env,'GET',path,{cookie});
  assert.equal(first.status,200); assert.equal(first.headers.get('cache-control'),'no-store');
  assert.equal(first.data.sources.length,50); assert.ok(first.data.next);
  assert.equal(JSON.stringify(first.data).includes('evidence_ref'),false);
  const second=await call(env,'GET',`${path}?after=${encodeURIComponent(first.data.next)}`,{cookie});
  assert.equal(second.data.sources.length,1); assert.equal(second.data.next,null);
  assert.notEqual(second.data.sources[0].source_ref,first.data.sources[49].source_ref);
  assert.equal((await call(env,'GET',path+'/detail?source_ref=source-000&channel_id=missing',{cookie})).status,404);
  assert.equal((await call(env,'GET',path+'?after=invalid',{cookie})).status,400);
});

test('reviews use authenticated actor, enforce version, preserve idempotence and do not resurrect revocation', async () => {
  const env=makeEnv(); env.MARKET_INVENTORY_READY='1'; seed(env); const cookie=await adminCookie();
  const endpoint=path+'/review', input=review(2);
  assert.equal((await call(env,'POST',endpoint,{cookie,body:{...input,actor:'spoof'}})).status,400);
  const first=await call(env,'POST',endpoint,{cookie,body:input});
  assert.equal(first.status,200); assert.equal(first.data.decision.status,'allowed');
  assert.equal((await call(env,'POST',endpoint,{cookie,body:review(3,{status:'denied'})})).status,409);
  const revoked=await call(env,'POST',endpoint,{cookie,body:review(4,{version:2,status:'denied'})});
  assert.equal(revoked.data.decision.status,'denied');
  const retry=await call(env,'POST',endpoint,{cookie,body:input});
  assert.equal(retry.status,200); assert.equal(retry.data.decision.status,'denied');
  const wrong=await call(env,'POST',endpoint,{cookie,body:review(5,{channel_id:'other'})});
  assert.equal(wrong.status,409);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM market_source_policy_history').get().n,2);
});

test('revoked manifest is pending in the list and detail even after an idempotent review replay', async () => {
  const env=makeEnv(); env.MARKET_INVENTORY_READY='1'; seed(env); const cookie=await adminCookie();
  const input=review(6);
  assert.equal((await call(env,'POST',path+'/review',{cookie,body:input})).status,200);
  env.DB.raw.prepare("UPDATE market_directory_manifests SET status='revoked' WHERE revision='fixture-rev'").run();
  const list=await call(env,'GET',path,{cookie}); assert.equal(list.data.sources[0].status,'pending'); assert.equal(list.data.sources[0].method,null);
  const detail=await call(env,'GET',path+'/detail?source_ref=source-000&channel_id=site',{cookie});
  assert.equal(detail.data.decision.status,'pending'); assert.equal(detail.data.decision.method,null);
  const retry=await call(env,'POST',path+'/review',{cookie,body:input});
  assert.equal(retry.data.decision.status,'pending'); assert.equal(retry.data.recorded_version,2);
});

test('cursor accepts long Unicode source and channel identifiers on the next page', async () => {
  const env=makeEnv(); env.MARKET_INVENTORY_READY='1'; const db=env.DB.raw;
  db.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,?,'accepted')")
    .run('fixture-rev','a'.repeat(64),'2000-01-01T00:00:00.000Z','fixture-review');
  const insert=db.prepare("INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class,access_status) VALUES (?,?,'fixture-rev','external','general','pending')");
  for (let n=0;n<51;n++) insert.run('界'.repeat(160),'界'.repeat(157)+String(n).padStart(3,'0'));
  const cookie=await adminCookie(), first=await call(env,'GET',path,{cookie});
  assert.ok(first.data.next); const second=await call(env,'GET',`${path}?after=${encodeURIComponent(first.data.next)}`,{cookie});
  assert.equal(second.status,200); assert.equal(second.data.sources.length,1); assert.equal(second.data.next,null);
});
