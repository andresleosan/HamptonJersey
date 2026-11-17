import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {createOwnerRequest} from '../../server/owner-requests.js';
const require=createRequire(import.meta.url),at='2026-11-13T00:00:00.000Z';
const run=(d,q,...a)=>d.prepare(q).bind(...a).run();
const one=(d,q,...a)=>d.prepare(q).bind(...a).first();
const count=async(d,t)=>(await one(d,`SELECT COUNT(*) n FROM ${t}`)).n;
const request=new Request('https://hampton.test/api/owner-requests',{method:'POST'});
const body=()=>({request_id:crypto.randomUUID(),name:'Fixture Owner',phone:'07700123456',email:'owner@example.test',address:'12 Example Road',operation:'sale',valuation_requested:false,privacy_version:'reviewed-v1',token:'fixture'});
// Local D1 (Miniflare) with every migration, 0118 included: real batch and trigger semantics.
test('local D1: 0118 supports atomic concurrent owner intake and rolls back a failed task insert',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery:split}=require('wrangler');
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'pub10-owner-fixture'}}));
 try{
  const d=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
  for(const file of readdirSync(dir).filter(x=>/^[0-9].*\.sql$/.test(x)).sort())await d.batch(split(readFileSync(new URL(file,dir),'utf8')).map(sql=>d.prepare(sql)));
  await run(d,"INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES('owner_enquiries',?,?,?)",JSON.stringify({enabled:true,privacy_version:'reviewed-v1'}),at,'fixture');
  const env={DB:d,OWNER_REQUESTS_READY:'1'},opts={verify:async()=>true},b=body();
  const attempts=await Promise.all(Array.from({length:20},()=>createOwnerRequest(env,request,b,opts)));
  assert.equal(attempts.filter(x=>!x.replayed).length,1);assert.equal(await count(d,'owner_requests'),1);assert.equal(await count(d,'owner_request_receipts'),1);
  assert.equal((await one(d,"SELECT COUNT(*) n FROM notifications WHERE task_key GLOB 'owner-request:*'")).n,1);
  const events=await count(d,'events');
  await run(d,"CREATE TRIGGER fixture_owner_abort BEFORE INSERT ON notifications WHEN NEW.task_key GLOB 'owner-request:*' BEGIN SELECT RAISE(ABORT,'fixture abort'); END");
  await assert.rejects(createOwnerRequest(env,request,body(),opts));assert.equal(await count(d,'owner_requests'),1);assert.equal(await count(d,'events'),events);
  assert.deepEqual((await d.prepare('PRAGMA foreign_key_check').all()).results,[]);
 }finally{await mf.dispose();}
});
