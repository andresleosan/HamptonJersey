import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,call,adminCookie,T0} from './helpers.mjs';
import {createOwnerRequest} from '../../server/owner-requests.js';
const body=(over={})=>({request_id:crypto.randomUUID(),name:'Fixture Owner',phone:'07700123456',email:'owner@example.test',address:'12 Example Road',operation:'sale',valuation_requested:false,privacy_version:'reviewed-v1',token:'fixture',...over});
const request=new Request('https://hampton.test/api/owner-requests',{method:'POST'});
const ok={verify:async()=>true};
// All migrations, 0118 included; the settings row and the switch are what Luis sets to open intake.
function fixture(){const env=makeEnv();env.OWNER_REQUESTS_READY='1';env.DB.raw.prepare("INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES('owner_enquiries',?,?,?)").run(JSON.stringify({enabled:true,privacy_version:'reviewed-v1'}),T0,'fixture');return env;}
const counts=e=>['owner_requests','owner_request_receipts','events','notifications'].map(t=>e.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);
const ownerTask=async e=>(await call(e,'GET','/admin/notifications?box=action',{cookie:await adminCookie()})).data.notifications.find(x=>x.title.startsWith('Contact property owner'));
const firstOwner=e=>e.DB.raw.prepare('SELECT id,updated_at FROM owner_requests ORDER BY created_at,id').get();

test('switch off: availability false and direct POST 503 even with an enabled setting',async()=>{
 const e=fixture();e.OWNER_REQUESTS_READY='0';const before=counts(e);
 assert.equal((await call(e,'GET','/owner-requests/availability')).data.available,false);
 assert.equal((await call(e,'POST','/owner-requests',{body:body()})).status,503);assert.deepEqual(counts(e),before);
 const n=await call(e,'GET','/admin/notifications?box=action',{cookie:await adminCookie()});assert.equal(n.status,200);
});
test('switch on without the settings row stays closed',async()=>{
 const e=makeEnv();e.OWNER_REQUESTS_READY='1';
 assert.equal((await call(e,'GET','/owner-requests/availability')).data.available,false);
 assert.equal((await call(e,'POST','/owner-requests',{body:body()})).status,503);
});
test('switch on with the settings row opens intake through the public route',async()=>{
 const e=fixture(),fetch0=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({success:true,hostname:'hampton.test'}));
 try{
  const a=await call(e,'GET','/owner-requests/availability');assert.deepEqual(a.data,{available:true,privacy_version:'reviewed-v1'});
  const b=body(),r=await call(e,'POST','/owner-requests',{body:b});assert.equal(r.status,201);assert.deepEqual(r.data,{ok:true});
  const again=await call(e,'POST','/owner-requests',{body:b});assert.equal(again.status,200);assert.deepEqual(again.data,{ok:true});
  assert.equal((await call(e,'POST','/owner-requests',{body:body(),origin:'https://evil.test'})).status,403);
 }finally{globalThis.fetch=fetch0;}
});
test('one submission creates owner, receipt, minimal event and staff task; replay is generic',async()=>{
 const e=fixture(),b=body(),before=counts(e),first=await createOwnerRequest(e,request,b,ok);assert.equal(first.replayed,false);assert.deepEqual(counts(e).map((n,i)=>n-before[i]),[1,1,1,1]);
 assert.equal((await createOwnerRequest(e,request,b,{verify:async()=>{throw Error('replay spent token')}})).replayed,true);
 await assert.rejects(createOwnerRequest(e,request,{...b,address:'13 Other Road'},ok),x=>x.status===409);
 const {id}=firstOwner(e),event=e.DB.raw.prepare("SELECT entity_type,entity_id,actor,data FROM events WHERE type='owner.requested'").get();
 assert.deepEqual({...event},{entity_type:'collection',entity_id:`owner-request:${id}`,actor:'public',data:'{"operation":"sale","valuation_requested":0}'});
 const task=await ownerTask(e);assert.equal(task.link,`#/owners/${id}`);assert.equal(task.target_exists,true);
 assert.equal((await call(e,'GET',`/admin/owner-requests/${id}`)).status,401);assert.equal((await call(e,'GET',`/admin/owner-requests/${id}`,{cookie:await adminCookie()})).status,200);
 const done=await call(e,'PUT',`/admin/notification-tasks/${task.id}`,{cookie:await adminCookie(),body:{operation_id:crypto.randomUUID(),revision:task.revision,action:'done'}});assert.equal(done.status,200);assert.equal(e.DB.raw.prepare('SELECT status FROM owner_requests WHERE id=?').get(id).status,'new');
});
test('policy change during verification fails without any effects',async()=>{
 const e=fixture(),before=counts(e);await assert.rejects(createOwnerRequest(e,request,body(),{verify:async()=>{e.DB.raw.prepare("UPDATE app_settings SET value=? WHERE key='owner_enquiries'").run(JSON.stringify({enabled:false,privacy_version:'reviewed-v1'}));return true}}),x=>x.status===503);assert.deepEqual(counts(e),before);
});
test('atomic trigger failure rolls back all effects',async()=>{
 const e=fixture(),before=counts(e);e.DB.raw.exec("CREATE TRIGGER fixture_fail_owner_notice BEFORE INSERT ON notifications WHEN NEW.task_key GLOB 'owner-request:*' BEGIN SELECT RAISE(ABORT,'fixture'); END");await assert.rejects(createOwnerRequest(e,request,body(),ok));assert.deepEqual(counts(e),before);
});
test('twenty concurrent retries share one receipt and same details do not merge new IDs',async()=>{
 const e=fixture(),b=body(),values=await Promise.all(Array.from({length:20},()=>createOwnerRequest(e,request,b,ok)));assert.equal(values.filter(x=>!x.replayed).length,1);await createOwnerRequest(e,request,{...b,request_id:crypto.randomUUID()},ok);assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM owner_requests').get().n,2);
});
test('disabling intake keeps prior staff task readable and resolvable while rejecting new submissions',async()=>{
 const e=fixture();await createOwnerRequest(e,request,body(),ok);e.OWNER_REQUESTS_READY='0';
 await assert.rejects(createOwnerRequest(e,request,body(),ok),x=>x.status===503);
 const task=await ownerTask(e),{id}=firstOwner(e);assert.equal(task.link,`#/owners/${id}`);
 assert.equal((await call(e,'GET',`/admin/owner-requests/${id}`,{cookie:await adminCookie()})).status,200);
 assert.equal((await call(e,'PUT',`/admin/notification-tasks/${task.id}`,{cookie:await adminCookie(),body:{operation_id:crypto.randomUUID(),revision:task.revision,action:'done'}})).status,200);
});
test('reconciliation: detail lists other requests with the same email or phone; status changes only by explicit action',async()=>{
 const e=fixture();await createOwnerRequest(e,request,body(),ok);await createOwnerRequest(e,request,body({email:'other@example.test'}),ok);await createOwnerRequest(e,request,body({phone:'07700999999',email:'third@example.test'}),ok);
 const {id,updated_at}=firstOwner(e),cookie=await adminCookie(),d=await call(e,'GET',`/admin/owner-requests/${id}`,{cookie});
 assert.equal(d.data.related.length,1);assert.deepEqual(Object.keys(d.data.related[0]).sort(),['created_at','id','status']);
 assert.equal((await call(e,'PUT',`/admin/owner-requests/${id}`,{body:{status:'contacted',updated_at}})).status,401);
 assert.equal((await call(e,'PUT',`/admin/owner-requests/${id}`,{cookie,body:{status:'contacted',updated_at},origin:'https://evil.test'})).status,403);
 assert.equal((await call(e,'PUT',`/admin/owner-requests/${id}`,{cookie,body:{status:'gone',updated_at}})).status,400);
 assert.equal((await call(e,'PUT',`/admin/owner-requests/${id}`,{cookie,body:{status:'contacted',updated_at:'2000-01-01T00:00:00.000Z'}})).status,409);
 const r=await call(e,'PUT',`/admin/owner-requests/${id}`,{cookie,body:{status:'contacted',updated_at}});assert.equal(r.status,200);assert.equal(r.data.owner.status,'contacted');
 const ev=e.DB.raw.prepare("SELECT actor,data FROM events WHERE type='owner.status_changed'").get();assert.deepEqual({...ev},{actor:'admin@example.test',data:'{"status":"contacted"}'});
});
test('erasure deletes the request and its receipt, closes its task and keeps an audit event without personal data',async()=>{
 const e=fixture(),b=body();await createOwnerRequest(e,request,b,ok);const {id}=firstOwner(e),cookie=await adminCookie();
 assert.equal((await call(e,'DELETE',`/admin/owner-requests/${id}`)).status,401);
 assert.equal((await call(e,'DELETE',`/admin/owner-requests/${id}`,{cookie,origin:'https://evil.test'})).status,403);
 assert.equal((await call(e,'DELETE',`/admin/owner-requests/${id}`,{cookie})).status,200);
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM owner_requests').get().n,0);assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM owner_request_receipts').get().n,0);
 const ev=e.DB.raw.prepare("SELECT entity_id,actor,data FROM events WHERE type='owner.erased'").get();assert.deepEqual({...ev},{entity_id:`owner-request:${id}`,actor:'admin@example.test',data:'{}'});
 const leaked=e.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE data LIKE ? OR data LIKE ? OR data LIKE ?").get(`%${b.name}%`,`%${b.email}%`,`%${b.address}%`).n;assert.equal(leaked,0);
 const n=e.DB.raw.prepare("SELECT title,target_deleted,resolved_at FROM notifications WHERE task_key=?").get(`owner-request:${id}`);assert.equal(n.title,'Deleted owner request');assert.equal(n.target_deleted,1);assert.ok(n.resolved_at);
 assert.equal((await call(e,'GET',`/admin/owner-requests/${id}`,{cookie})).status,404);assert.equal((await call(e,'DELETE',`/admin/owner-requests/${id}`,{cookie})).status,404);
});
