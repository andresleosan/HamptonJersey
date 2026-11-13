import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, call, adminCookie } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery } = require('wrangler');
const operation = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input = n => ({source_ref:'fixture-source',channel_id:'site',version:1,operation_id:operation(n),
  status:'allowed',method:'http',allowed_hosts:['fixture.invalid'],allowed_paths:['/listings/'],allowed_redirect_hosts:[],
  min_interval_s:60,evidence_ref:'fixture-evidence',retention_ref:'fixture-retention',review_due_at:'2999-01-01T00:00:00.000Z'});

test('D1 local serializes concurrent source reviews and rolls back a failing policy history insert', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'bus19-policy-routes-fixture'}}));
  try {
    const db=await mf.getD1Database('DB'), dir=new URL('../../migrations/',import.meta.url);
    for (const name of readdirSync(dir).filter(name=>name.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(q=>db.prepare(q)));
    await db.prepare("INSERT INTO admins (email,added_by,added_at) VALUES ('admin@example.test','fixture','2026-01-01T00:00:00.000Z')").run();
    await db.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,?,'accepted')")
      .bind('fixture-rev','a'.repeat(64),'2000-01-01T00:00:00.000Z','fixture-review').run();
    await db.prepare("INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class,access_status) VALUES ('fixture-source','site','fixture-rev','external','general','pending')").run();
    const env=makeEnv(); env.DB=db; env.MARKET_INVENTORY_READY='1'; const cookie=await adminCookie();
    const results=await Promise.all([1,2].map(n=>call(env,'POST','/admin/market/sources/review',{cookie,body:input(n)})));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    await db.prepare("CREATE TRIGGER fixture_abort_history BEFORE INSERT ON market_source_policy_history BEGIN SELECT RAISE(ABORT,'fixture failure'); END").run();
    const originalError=console.error; console.error=()=>{};
    let failure;
    try { failure=await call(env,'POST','/admin/market/sources/review',{cookie,body:{...input(3),version:2,status:'denied'}}); }
    finally { console.error=originalError; }
    assert.equal(failure.status,500);
    const detail=await call(env,'GET','/admin/market/sources/detail?source_ref=fixture-source&channel_id=site',{cookie});
    assert.equal(detail.status,200); assert.equal(detail.data.decision.version,2); assert.equal(detail.data.decision.status,'allowed');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM market_source_policy_history').first()).n,1);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally { await mf.dispose(); }
});
