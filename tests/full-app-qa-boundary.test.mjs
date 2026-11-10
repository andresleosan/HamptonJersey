import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQaWorker, QA_ORIGIN, QA_DB_ID} from '../docs/qa/full-app/publish/qa-boundary.mjs';

function fixture({row, guardError=false, admin='qa-agent@example.test'}={}) {
  const calls={app:0,sim:0,guard:0};
  const env={DB:{prepare(){return {async first(){calls.guard++;if(guardError)throw Error('not printed');return row===undefined?{marker:'hampton-app-qa-v1',database_id:QA_DB_ID,fixture_version:1}:row;}};}},
    MEDIA:{get(){},put(){},delete(){}},ASSETS:{fetch(){}},SESSION_SECRET:'local-test-placeholder-not-a-runtime-credential'};
  const worker=createQaWorker({app:{async fetch(){calls.app++;return new Response('fictional app');}},
    qaEnvironment:value=>value, currentAdmin:async()=>admin,
    qaSimulation:async()=>{calls.sim++;return new Response('{"simulated":true}');}});
  return {worker,env,calls};
}

test('guard applies to pages, static assets, APIs and media; no cached success bypass',async()=>{
  const {worker,env,calls}=fixture();
  for(const path of ['/','/admin/','/qa-runtime.js','/media/QAM00001','/p/HE-Q001','/api/listings']){
    const response=await worker.fetch(new Request(QA_ORIGIN+path),env,{});
    assert.equal(response.status,200);assert.match(response.headers.get('x-robots-tag'),/noindex/);
  }
  assert.equal(calls.guard,6);assert.equal(calls.app,6);
});
test('wrong host, absent binding, missing/mismatched marker or DB errors fail before app',async()=>{
  for(const option of [{row:null},{row:{marker:'hampton-app-qa-v1',database_id:'other',fixture_version:1}},{guardError:true}]){
    const {worker,env,calls}=fixture(option);assert.equal((await worker.fetch(new Request(QA_ORIGIN+'/'),env,{})).status,503);assert.equal(calls.app,0);
  }
  const {worker,env,calls}=fixture();
  for(const url of ['https://hamptonjersey.pages.dev/','https://hash.hamptonjersey-qa.pages.dev/','http://hamptonjersey-qa.pages.dev/'])
    assert.equal((await worker.fetch(new Request(url),env,{})).status,503);
  delete env.MEDIA;assert.equal((await worker.fetch(new Request(QA_ORIGIN+'/'),env,{})).status,503);assert.equal(calls.app,0);
});
test('Google sign-in and previous History/Hermes doors stay disabled',async()=>{
  const {worker,env,calls}=fixture();
  for(const path of ['/api/session','/api/%73ession'])
    assert.equal((await worker.fetch(new Request(QA_ORIGIN+path,{method:'POST',headers:{origin:QA_ORIGIN}}),env,{})).status,403);
  for(const path of ['/api/qa/history','/api/hermes/status'])
    assert.equal((await worker.fetch(new Request(QA_ORIGIN+path),env,{})).status,404);
  assert.equal(calls.app,0);
});
test('mutations require same origin and helpers additionally require normal admin',async()=>{
  const a=fixture();assert.equal((await a.worker.fetch(new Request(QA_ORIGIN+'/api/admin/users',{method:'POST'}),a.env,{})).status,403);
  const b=fixture({admin:null});assert.equal((await b.worker.fetch(new Request(QA_ORIGIN+'/api/qa-app/state'),b.env,{})).status,401);
  assert.equal(b.calls.sim,0);
  const c=fixture();assert.equal((await c.worker.fetch(new Request(QA_ORIGIN+'/api/qa-app/simulate',{method:'POST',headers:{origin:QA_ORIGIN}}),c.env,{})).status,400);
});
test('simulation is bounded by run ID and cannot target base fixture listings',async()=>{
  const {worker,env,calls}=fixture();
  const request=new Request(QA_ORIGIN+'/api/qa-app/simulate',{method:'POST',headers:{origin:QA_ORIGIN,'x-qa-run':'run-unit'},body:'{"simulation":"drive"}'});
  assert.equal((await worker.fetch(request,env,{})).status,200);assert.equal(calls.sim,1);
});
test('server exceptions are sanitized; off-origin redirects are blocked',async()=>{
  const f=fixture();const deps={qaEnvironment:x=>x,currentAdmin:async()=>null,qaSimulation:async()=>new Response('unused')};
  const crash=createQaWorker({...deps,app:{fetch(){throw Error('sensitive-looking-value-must-not-be-returned');}}});
  const response=await crash.fetch(new Request(QA_ORIGIN+'/'),f.env,{});assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/sensitive/);
  const redirect=createQaWorker({...deps,app:{fetch(){return Response.redirect('https://outside.example.test/',302);}}});
  assert.equal((await redirect.fetch(new Request(QA_ORIGIN+'/'),f.env,{})).status,403);
});
