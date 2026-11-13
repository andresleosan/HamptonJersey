import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEnv,call,adminCookie,T0} from './helpers.mjs';
import {createOwnerRequest} from '../../server/owner-requests.js';
const body=()=>({request_id:crypto.randomUUID(),name:'Fixture Owner',phone:'07700123456',email:'owner@example.test',address:'12 Example Road',operation:'sale',valuation_requested:false,privacy_version:'reviewed-v1',token:'fixture'});
const syntheticPolicy=async env=>{const r=await env.DB.prepare("SELECT json_extract(value,'$.privacy_version') AS version FROM app_settings WHERE key='owner_enquiries' AND json_extract(value,'$.enabled')=1").first();return r?.version??null};
const request=new Request('https://hampton.test/api/owner-requests',{method:'POST'});
function fixture(){const env=makeEnv();env.DB.raw.exec('BEGIN');env.DB.raw.exec(readFileSync(new URL('../../server/proposed-schema/owner-requests-rebuild.sql',import.meta.url),'utf8'));env.DB.raw.exec(readFileSync(new URL('../../server/proposed-schema/owner-requests.sql',import.meta.url),'utf8'));env.DB.raw.exec('COMMIT');env.OWNER_REQUESTS_READY='1';env.DB.raw.prepare("INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES('owner_enquiries',?,?,?)").run(JSON.stringify({enabled:true,privacy_version:'reviewed-v1'}),T0,'fixture');return env;}
const counts=e=>['owner_requests','owner_request_receipts','events','notifications'].map(t=>e.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);
test('disabled gate leaves existing inbox working and public availability false',async()=>{const env=makeEnv();const a=await call(env,'GET','/owner-requests/availability');assert.equal(a.data.available,false);const n=await call(env,'GET','/admin/notifications?box=action',{cookie:await adminCookie()});assert.equal(n.status,200);});
test('one submission creates owner, receipt, minimal event and staff task; replay is generic',async()=>{
 const e=fixture(),b=body(),before=counts(e),ok=await createOwnerRequest(e,request,b,{verify:async()=>true,policyReader:syntheticPolicy});assert.equal(ok.replayed,false);assert.deepEqual(counts(e).map((n,i)=>n-before[i]),[1,1,1,1]);
 assert.equal((await createOwnerRequest(e,request,b,{verify:async()=>{throw Error('replay spent token')},policyReader:syntheticPolicy})).replayed,true);
 await assert.rejects(createOwnerRequest(e,request,{...b,address:'13 Other Road'},{verify:async()=>true,policyReader:syntheticPolicy}),x=>x.status===409);
 const event=e.DB.raw.prepare("SELECT data FROM events WHERE type='owner.requested'").get();assert.ok(!event.data.includes(b.name)&&!event.data.includes(b.email)&&!event.data.includes(b.address));
 const list=await call(e,'GET','/admin/notifications?box=action',{cookie:await adminCookie()});assert.equal(list.status,200);const task=list.data.notifications.find(x=>x.link?.startsWith('#/owners/'));assert.ok(task);assert.equal(task.target_exists,true);
 const id=task.link.slice('#/owners/'.length);assert.equal((await call(e,'GET',`/admin/owner-requests/${id}`)).status,401);assert.equal((await call(e,'GET',`/admin/owner-requests/${id}`,{cookie:await adminCookie()})).status,200);
 const done=await call(e,'PUT',`/admin/notification-tasks/${task.id}`,{cookie:await adminCookie(),body:{operation_id:crypto.randomUUID(),revision:task.revision,action:'done'}});assert.equal(done.status,200);assert.equal(e.DB.raw.prepare('SELECT status FROM owner_requests WHERE id=?').get(id).status,'new');
});
test('policy change during verification fails without any effects',async()=>{
 const e=fixture(),before=counts(e);await assert.rejects(createOwnerRequest(e,request,body(),{verify:async()=>{e.DB.raw.prepare("UPDATE app_settings SET value=? WHERE key='owner_enquiries'").run(JSON.stringify({enabled:false,privacy_version:'reviewed-v1'}));return true},policyReader:syntheticPolicy}),x=>x.status===503);assert.deepEqual(counts(e),before);
});
test('atomic trigger failure rolls back all effects',async()=>{
 const e=fixture(),before=counts(e);e.DB.raw.exec("CREATE TRIGGER fixture_fail_owner_notice BEFORE INSERT ON notifications WHEN NEW.target_kind='owner_request' BEGIN SELECT RAISE(ABORT,'fixture'); END");await assert.rejects(createOwnerRequest(e,request,body(),{verify:async()=>true,policyReader:syntheticPolicy}));assert.deepEqual(counts(e),before);
});
test('twenty concurrent retries share one receipt and same details do not merge new IDs',async()=>{
 const e=fixture(),b=body(),values=await Promise.all(Array.from({length:20},()=>createOwnerRequest(e,request,b,{verify:async()=>true,policyReader:syntheticPolicy})));assert.equal(values.filter(x=>!x.replayed).length,1);await createOwnerRequest(e,request,{...b,request_id:crypto.randomUUID()},{verify:async()=>true,policyReader:syntheticPolicy});assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM owner_requests').get().n,2);
});
test('disabling intake keeps prior staff task readable and resolvable while rejecting new submissions',async()=>{
 const e=fixture(),b=body();await createOwnerRequest(e,request,b,{verify:async()=>true,policyReader:syntheticPolicy});e.OWNER_REQUESTS_READY='0';
 await assert.rejects(createOwnerRequest(e,request,body(),{verify:async()=>true,policyReader:syntheticPolicy}),x=>x.status===503);
 const list=await call(e,'GET','/admin/notifications?box=action',{cookie:await adminCookie()});const task=list.data.notifications.find(x=>x.link?.startsWith('#/owners/'));assert.ok(task);const id=task.link.slice('#/owners/'.length);
 assert.equal((await call(e,'GET',`/admin/owner-requests/${id}`,{cookie:await adminCookie()})).status,200);
 assert.equal((await call(e,'PUT',`/admin/notification-tasks/${task.id}`,{cookie:await adminCookie(),body:{operation_id:crypto.randomUUID(),revision:task.revision,action:'done'}})).status,200);
});
test('production intake remains disabled even if an enabled setting and runtime gate exist',async()=>{
 const e=fixture(),before=counts(e);const a=await call(e,'GET','/owner-requests/availability');assert.equal(a.data.available,false);const r=await call(e,'POST','/owner-requests',{body:body()});assert.equal(r.status,503);assert.deepEqual(counts(e),before);
});
