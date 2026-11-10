import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,makeDb,seedListing,call,adminCookie,T0} from './helpers.mjs';
import {signSession,COOKIE} from '../../server/auth.js';

const QA_ID='HE-Q999', KEY='only-local-qa-key-for-tests-0123456789';
const qaPath='/qa/history';
function addEvent(db,id,type='listing.created',actor='Test actor',at=T0) {
  return Number(db.raw.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    VALUES(?,?,?,?,?,?)`).run(at,actor,'listing',id,type,JSON.stringify({fields:[]})).lastInsertRowid);
}
function fixture() {
  const env=makeEnv();env.QA_DB=makeDb();env.QA_HISTORY_KEY=KEY;env.QA_HISTORY_ACTIVE='true';
  env.QA_DB.raw.exec("CREATE TABLE qa_history_guard(id INTEGER PRIMARY KEY,marker TEXT NOT NULL);"+
    "INSERT INTO qa_history_guard VALUES(1,'hampton-qa-history-v1')");
  const qa={DB:env.QA_DB};
  seedListing(qa,{id:QA_ID,title:'Fictional QA property',published:0,sale_price:null,updated_by:'test'});
  addEvent(env.QA_DB,QA_ID,'listing.created','system','2026-11-10T09:00:00.000Z');
  seedListing(env,{id:QA_ID,title:'PRIVATE production data'});
  addEvent(env.DB,QA_ID,'listing.updated','PRIVATE production actor');
  return env;
}

test('QA identity reads only isolated fixture and validates same D1 rows',async()=>{
  const env=fixture();
  const res=await call(env,'GET',qaPath,{bearer:KEY});
  assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal(res.data.listing.id,QA_ID);assert.equal(res.data.items.length,1);
  assert.ok(!res.text.includes('PRIVATE'));
  const ok=await call(env,'POST',qaPath+'/validate',{bearer:KEY,body:{ids:[res.data.items[0].id]}});
  assert.equal(ok.status,200);
  const other=addEvent(env.DB,QA_ID,'listing.updated','PRIVATE other');
  assert.equal((await call(env,'POST',qaPath+'/validate',{bearer:KEY,body:{ids:[other]}})).status,409);
});

test('QA bearer never authenticates admin and admin cookie never authenticates QA',async()=>{
  const env=fixture(),cookie=await adminCookie();
  assert.equal((await call(env,'GET',qaPath,{cookie})).status,401);
  assert.equal((await call(env,'GET',qaPath)).status,401);
  assert.equal((await call(env,'GET',qaPath,{bearer:'wrong-key-long-enough-for-negative-test'})).status,401);
  assert.equal((await call(env,'GET','/admin/listings/'+QA_ID+'/history',{bearer:KEY})).status,401);
  assert.equal((await call(env,'GET','/me',{bearer:KEY})).status,401);
  for(const p of ['/qa/other','/qa/history/extra','/qa/%68istory'])
    assert.notEqual((await call(env,'GET',p,{bearer:KEY})).status,200,p);
  assert.notEqual((await call(env,'DELETE',qaPath,{bearer:KEY})).status,200);
  assert.equal((await call(env,'POST',qaPath+'/validate',{bearer:KEY,body:{ids:[1]},origin:'https://evil.example'})).status,403);
});

test('QA route fails closed when key, binding or distinctness is missing',async()=>{
  for(const which of ['key','binding','same-db','same-underlying-db','marker','marker-wrong','hermes-key','session-key']){
    const env=fixture();
    if(which==='key')delete env.QA_HISTORY_KEY;
    if(which==='binding')delete env.QA_DB;
    if(which==='same-db')env.QA_DB=env.DB;
    if(which==='same-underlying-db')env.DB={prepare:env.QA_DB.prepare.bind(env.QA_DB)};
    if(which==='marker')env.QA_DB.raw.exec('DELETE FROM qa_history_guard');
    if(which==='marker-wrong')env.QA_DB.raw.exec("UPDATE qa_history_guard SET marker='wrong'");
    if(which==='hermes-key')env.HERMES_KEY=KEY;
    if(which==='session-key')env.SESSION_SECRET=KEY;
    assert.notEqual((await call(env,'GET',qaPath,{bearer:KEY})).status,200,which);
  }
});

test('QA stays disabled after publication even if the binding and key are configured',async()=>{
  const env=fixture();
  delete env.QA_HISTORY_ACTIVE;
  for(const path of [qaPath,'/qa/production-check']){
    const r=await call(env,'GET',path,{bearer:KEY});
    assert.equal(r.status,503,path);
    assert.equal(r.headers.get('cache-control'),'no-store');
    assert.ok(!r.text.includes(QA_ID));
  }
  env.QA_HISTORY_ACTIVE='false';
  assert.equal((await call(env,'POST',qaPath+'/validate',{bearer:KEY,body:{ids:[1]}})).status,503);
});

test('a QA key reused for another role cannot open that role',async()=>{
  const env=fixture();env.HERMES_KEY=KEY;
  assert.equal((await call(env,'GET','/hermes/status',{bearer:KEY})).status,401);
  assert.equal(env.DB.raw.prepare("SELECT value FROM app_settings WHERE key='hermes'").get(),undefined);
  env.HERMES_KEY='different-hermes-secret-012345678901';env.SESSION_SECRET=KEY;
  const cookie=`${COOKIE}=${await signSession('admin@example.test',KEY)}`;
  assert.equal((await call(env,'GET','/me',{cookie})).status,401);
});

test('QA projection refuses a changed actor or monetary event even inside QA_DB',async()=>{
  const env=fixture();
  env.QA_DB.raw.exec("UPDATE events SET actor='PRIVATE actor' WHERE entity_type='listing'");
  const actor=await call(env,'GET',qaPath,{bearer:KEY});
  assert.equal(actor.status,503);assert.ok(!actor.text.includes('PRIVATE'));
  env.QA_DB.raw.exec("UPDATE events SET actor='system', data='{"+
    '"fields":["sale_price"],"before":{"sale_price":1},"after":{"sale_price":2}}'+
    "' WHERE entity_type='listing'");
  const money=await call(env,'GET',qaPath,{bearer:KEY});
  assert.equal(money.status,503);assert.ok(!money.text.includes('sale_price'));
});

test('production check executes real History read+row validation but returns no data',async()=>{
  const env=fixture();
  const r=await call(env,'GET','/qa/production-check',{bearer:KEY});
  assert.equal(r.status,200);assert.deepEqual(r.data,{ok:true});
  assert.ok(!r.text.includes(QA_ID)&&!r.text.includes('PRIVATE'));
  assert.equal((await call(env,'GET','/qa/production-check')).status,401);
  const empty=fixture();empty.DB=makeDb();
  const unavailable=await call(empty,'GET','/qa/production-check',{bearer:KEY});
  assert.notEqual(unavailable.status,200);assert.ok(!unavailable.text.includes('PRIVATE'));
});
