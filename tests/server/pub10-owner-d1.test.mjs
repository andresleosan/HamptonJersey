import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {createOwnerRequest} from '../../server/owner-requests.js';
const require=createRequire(import.meta.url),at='2026-11-13T00:00:00.000Z';
const run=(d,q,...a)=>d.prepare(q).bind(...a).run();
const one=(d,q,...a)=>d.prepare(q).bind(...a).first();
const count=async(d,t)=>(await one(d,`SELECT COUNT(*) n FROM ${t}`)).n;
const syntheticPolicy=async env=>{const r=await env.DB.prepare("SELECT json_extract(value,'$.privacy_version') AS version FROM app_settings WHERE key='owner_enquiries' AND json_extract(value,'$.enabled')=1").first();return r?.version??null};
const request=new Request('https://hampton.test/api/owner-requests',{method:'POST'});
const body=()=>({request_id:crypto.randomUUID(),name:'Fixture Owner',phone:'07700123456',email:'owner@example.test',address:'12 Example Road',operation:'sale',valuation_requested:false,privacy_version:'reviewed-v1',token:'fixture'});
test('local D1 migration preserves historic children, rejects drift and supports atomic concurrent owner intake',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery:split}=require('wrangler');
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'pub10-owner-fixture'}}));
 try{
  const d=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
  for(const file of readdirSync(dir).filter(x=>/^[0-9].*\.sql$/.test(x)).sort())await d.batch(split(readFileSync(new URL(file,dir),'utf8')).map(sql=>d.prepare(sql)));
  await run(d,'INSERT INTO admins(email,added_at) VALUES(?,?)','admin@example.test',at);
  await run(d,"INSERT INTO events(id,at,actor,entity_type,entity_id,type) VALUES(9001,?,'system','admin','fixture','fixture')",at);
  await run(d,"INSERT INTO notifications(id,event_id,category,title,action_required,created_at,task_key) VALUES(9001,9001,'task','Fixture',1,?,'fixture:pub10')",at);
  await run(d,"INSERT INTO notification_reads(admin,notification_id,read_revision) VALUES('admin@example.test',9001,1)");
  await run(d,"INSERT INTO notification_task_operations(actor,operation_id,task_id,payload_hash,result_revision) VALUES('admin@example.test','fixture-operation',9001,'fixture',1)");
  // Populate every externally referenced history table with linked synthetic rows.
  await run(d,"INSERT INTO listings(id,use,title,operation,availability,created_at,updated_at) VALUES('fixture-listing','residential','Fixture','sale','for_sale',?,?)",at,at);
  await run(d,"INSERT INTO viewing_requests(id,listing_id,kind,date,time,name,email,created_at) VALUES(9001,'fixture-listing','viewing','2026-11-13','10:00','Fixture','viewer@example.test',?)",at);
  await run(d,"INSERT INTO history_viewing_events(event_id,viewing_id,listing_id,at) VALUES(9001,9001,'fixture-listing',?)",at);
  await run(d,"INSERT INTO listing_withdrawals(id,listing_id,occurred_at,source_revision,event_id,actor) VALUES('fixture-withdrawal','fixture-listing',?,1,9001,'admin@example.test')",at);
  await run(d,"INSERT INTO listing_event_operations(actor,operation_id,request_hash,event_id) VALUES('admin@example.test','fixture-listing-operation','fixture-hash',9001)");
  await run(d,"INSERT INTO notification_observations(task_key,kind,entity_id,cycle,signature,active,target_kind,target_id,event_id) VALUES('fixture:pub10','check','fixture','fixture','fixture',1,'rental','1',9001)");
  const protectedTables=['events','notifications','notification_reads','notification_task_operations','history_viewing_events','listing_withdrawals','listing_event_operations','notification_observations'];
  const snapshot=async()=>Object.fromEntries(await Promise.all(protectedTables.map(async t=>[t,(await d.prepare(`SELECT * FROM ${t}`).all()).results])));
  const before=await snapshot();
  const structure=async()=> (await d.prepare("SELECT type,name,sql FROM sqlite_schema WHERE type IN ('index','trigger','view') AND sql IS NOT NULL ORDER BY type,name").all()).results;
  const beforeStructure=await structure();
  await run(d,"CREATE TRIGGER fixture_schema_drift AFTER INSERT ON events BEGIN SELECT 1; END");
  const proposal=readFileSync(new URL('../../server/proposed-schema/owner-requests-rebuild.sql',import.meta.url),'utf8');
  await assert.rejects(d.batch(split(proposal).map(sql=>d.prepare(sql))));
  assert.equal(await count(d,'notifications'),1);assert.equal(await count(d,'notification_reads'),1);
  assert.deepEqual(await snapshot(),before);
  await run(d,'DROP TRIGGER fixture_schema_drift');
  // New referencing tables may cascade on DROP and leave foreign_key_check clean.
  // The proposed rebuild must reject them before touching either parent table.
  await run(d,'CREATE TABLE fixture_extra_event(id INTEGER PRIMARY KEY,event_id INTEGER REFERENCES events(id) ON DELETE CASCADE)');
  await run(d,'INSERT INTO fixture_extra_event VALUES(1,9001)');
  await assert.rejects(d.batch(split(proposal).map(sql=>d.prepare(sql))));
  assert.equal(await count(d,'fixture_extra_event'),1);assert.deepEqual(await snapshot(),before);
  await run(d,'DROP TABLE fixture_extra_event');
  await run(d,'CREATE TABLE fixture_extra_notice(id INTEGER PRIMARY KEY,notice_id INTEGER REFERENCES notifications(id) ON DELETE CASCADE)');
  await run(d,'INSERT INTO fixture_extra_notice VALUES(1,9001)');
  await assert.rejects(d.batch(split(proposal).map(sql=>d.prepare(sql))));
  assert.equal(await count(d,'fixture_extra_notice'),1);assert.deepEqual(await snapshot(),before);
  await run(d,'DROP TABLE fixture_extra_notice');
  // Abort after both parent tables were dropped, not merely at a preflight guard.
  // D1 must roll back their definitions and every populated referencing row.
  const rollbackStatements=split(proposal),dropEvent=rollbackStatements.findIndex(sql=>/^\s*DROP\s+TABLE\s+events\s*;?\s*$/i.test(sql));
  assert.notEqual(dropEvent,-1);rollbackStatements.splice(dropEvent+1,0,'INSERT INTO pub10_guard VALUES(1)');
  await assert.rejects(d.batch(rollbackStatements.map(sql=>d.prepare(sql))));
  assert.deepEqual(await snapshot(),before);assert.deepEqual(await structure(),beforeStructure);
  assert.deepEqual((await d.prepare('PRAGMA foreign_key_check').all()).results,[]);
  await d.batch(split(proposal).map(sql=>d.prepare(sql)));
  assert.deepEqual(await snapshot(),before);assert.deepEqual(await structure(),beforeStructure);
  await d.batch(split(readFileSync(new URL('../../server/proposed-schema/owner-requests.sql',import.meta.url),'utf8')).map(sql=>d.prepare(sql)));
  assert.equal(await count(d,'notifications'),1);assert.equal(await count(d,'notification_reads'),1);assert.equal(await count(d,'notification_task_operations'),1);
  assert.deepEqual((await d.prepare('PRAGMA foreign_key_check').all()).results,[]);
  await run(d,"INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES('owner_enquiries',?,?,?)",JSON.stringify({enabled:true,privacy_version:'reviewed-v1'}),at,'fixture');
  const env={DB:d,OWNER_REQUESTS_READY:'1'},b=body(),attempts=await Promise.all(Array.from({length:20},()=>createOwnerRequest(env,request,b,{verify:async()=>true,policyReader:syntheticPolicy})));
  assert.equal(attempts.filter(x=>!x.replayed).length,1);assert.equal(await count(d,'owner_requests'),1);assert.equal(await count(d,'owner_request_receipts'),1);assert.equal(await count(d,'notifications'),2);
  const old=await count(d,'events');await run(d,"CREATE TRIGGER fixture_owner_abort BEFORE INSERT ON notifications WHEN NEW.target_kind='owner_request' BEGIN SELECT RAISE(ABORT,'fixture abort'); END");
  await assert.rejects(createOwnerRequest(env,request,body(),{verify:async()=>true,policyReader:syntheticPolicy}));assert.equal(await count(d,'owner_requests'),1);assert.equal(await count(d,'events'),old);
  assert.deepEqual((await d.prepare('PRAGMA foreign_key_check').all()).results,[]);
 }finally{await mf.dispose();}
});
