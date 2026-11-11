import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,seedListing,seedMedia,adminCookie,call,T0} from './helpers.mjs';

async function world(over={}) {const env=makeEnv();seedListing(env,{published:0,...over});return {env,cookie:await adminCookie()};}
const pub=(env,cookie,version=T0)=>call(env,'POST','/admin/listings/HE-R001/publish',{cookie,body:{updated_at:version}});
const listing=env=>env.DB.raw.prepare("SELECT * FROM listings WHERE id='HE-R001'").get();

test('publishing needs an eligible public photo but allows a private price and incomplete recommendations',async()=>{
 const {env,cookie}=await world({sale_price:null,price_text:'Price on request'});
 let r=await pub(env,cookie); assert.equal(r.status,400);assert.equal(listing(env).published,0);
 seedMedia(env,{origin:'external',public:0});r=await pub(env,cookie);assert.equal(r.status,400);
 env.DB.raw.prepare("UPDATE media SET origin='upload', public=1 WHERE id='A00001'").run();
 r=await pub(env,cookie);assert.equal(r.status,200);assert.equal(listing(env).published,1);
});
test('a stale version is rejected before publishing',async()=>{
 const {env,cookie}=await world();seedMedia(env);assert.equal((await pub(env,cookie,'2020-01-01')).status,409);assert.equal(listing(env).published,0);
});
test('a photo removed between validation and the listing write prevents publication',async()=>{
 const {env,cookie}=await world();seedMedia(env);
 const batch=env.DB.batch.bind(env.DB);let removed=false;
 env.DB.batch=async statements=>{if(!removed&&statements.some(s=>/UPDATE listings (?:AS l )?SET/.test(s.sql))){removed=true;env.DB.raw.prepare("DELETE FROM media WHERE id='A00001'").run();}return batch(statements);};
 const r=await pub(env,cookie);assert.equal(removed,true);assert.ok([400,409].includes(r.status));assert.equal(listing(env).published,0);
 assert.equal(env.DB.raw.prepare("SELECT count(*) n FROM events WHERE type='listing.published'").get().n,0);
});

async function queueWorld(over={}) {
 const {env,cookie}=await world({parish:'St Helier',description:'Fixture details',...over});
 env.DB.raw.prepare("INSERT INTO drive_imports(id,folder_id,folder_name,status,listing_id,requested_by,created_at) VALUES(77,'fixture','Fixture','review','HE-R001','fixture',?)").run(T0);
 return {env,cookie};
}
const approve=(env,cookie)=>call(env,'POST','/admin/queue/77/approve',{cookie,body:{updated_at:T0}});
const queueState=env=>env.DB.raw.prepare('SELECT status FROM drive_imports WHERE id=77').get().status;
test('Queue retains price, parish and description, and accepts the existing business price',async()=>{
 const missing=await queueWorld({operation:'business',use:'commercial',premium:null,price_text:null,parish:null,description:null});seedMedia(missing.env);
 const bad=await approve(missing.env,missing.cookie);assert.equal(bad.status,400);
 for(const label of ['Price','Parish','Description'])assert.ok(bad.data.missing.includes(label));
 assert.equal(queueState(missing.env),'review');assert.equal(listing(missing.env).published,0);
 const good=await queueWorld({operation:'business',use:'commercial',premium:12000,price_text:null});seedMedia(good.env);
 assert.equal((await approve(good.env,good.cookie)).status,200);assert.equal(listing(good.env).published,1);assert.equal(queueState(good.env),'published');
});
test('Queue restores review when the last eligible photo disappears during approval',async()=>{
 const {env,cookie}=await queueWorld();seedMedia(env);const batch=env.DB.batch.bind(env.DB);let removed=false;
 env.DB.batch=async statements=>{if(!removed&&statements.some(s=>s.sql.includes('UPDATE listings SET'))){removed=true;env.DB.raw.prepare("UPDATE media SET public=0 WHERE id='A00001'").run();}return batch(statements);};
 const r=await approve(env,cookie);assert.equal(removed,true);assert.ok([400,409].includes(r.status));
 assert.equal(listing(env).published,0);assert.equal(queueState(env),'review');
 assert.equal(env.DB.raw.prepare("SELECT count(*) n FROM events WHERE type='listing.published'").get().n,0);
});
test('a failed event transaction rolls back publishing and existing visible rows are not changed',async()=>{
 const {env,cookie}=await world();seedMedia(env);
 env.DB.raw.exec("CREATE TRIGGER reject_pub BEFORE INSERT ON events WHEN NEW.type='listing.published' BEGIN SELECT RAISE(ABORT,'fixture event failure'); END");
 assert.equal((await pub(env,cookie)).status,500);assert.equal(listing(env).published,0);
 assert.equal(env.DB.raw.prepare("SELECT count(*) n FROM events WHERE type='listing.published'").get().n,0);
 const historical=await world({published:1});assert.equal(listing(historical.env).published,1);
 assert.equal((await call(historical.env,'GET','/admin/listings/HE-R001',{cookie:historical.cookie})).status,200);
 assert.equal(listing(historical.env).published,1);
});

test('Queue approval and public visibility are atomic against a competing normal publish',async()=>{
 const {env,cookie}=await queueWorld();seedMedia(env);
 const originalPrepare=env.DB.prepare.bind(env.DB),originalBatch=env.DB.batch.bind(env.DB);let attempted=false,competing;
 const compete=async()=>{if(attempted)return;attempted=true;competing=await pub(env,cookie);};
 env.DB.prepare=sql=>{
  const s=originalPrepare(sql);
  if(!sql.includes("UPDATE drive_imports SET status = 'published'"))return s;
  return {...s,bind:(...args)=>{const bound=s.bind(...args);return {...bound,first:async()=>{const r=await bound.first();await compete();return r;}};}};
 };
 env.DB.batch=async statements=>{
  if(statements.some(s=>s.sql.includes("UPDATE drive_imports SET status = 'published'"))) await compete();
  return originalBatch(statements);
 };
 const result=await approve(env,cookie);
 assert.equal(attempted,true);assert.equal(competing.status,409);
 assert.equal(result.status,200);assert.equal(listing(env).published,1);assert.equal(queueState(env),'published');
 assert.equal(env.DB.raw.prepare("SELECT count(*) n FROM events WHERE type='listing.published'").get().n,1);
});

test('empty storage key is not a public photo for either publication path',async()=>{
 const a=await world();seedMedia(a.env,{r2_key:''});assert.equal((await pub(a.env,a.cookie)).status,400);assert.equal(listing(a.env).published,0);
 const b=await queueWorld();seedMedia(b.env,{r2_key:''});assert.equal((await approve(b.env,b.cookie)).status,400);assert.equal(queueState(b.env),'review');
});
test('a Queue review created before a normal publication write blocks that write',async()=>{
 const {env,cookie}=await world();seedMedia(env);const batch=env.DB.batch.bind(env.DB);let inserted=false;
 env.DB.batch=async statements=>{if(!inserted&&statements.some(s=>s.sql.includes('UPDATE listings SET'))){inserted=true;
   env.DB.raw.prepare("INSERT INTO drive_imports(id,folder_id,folder_name,status,listing_id,requested_by,created_at) VALUES(77,'fixture','Fixture','review','HE-R001','fixture',?)").run(T0);}
  return batch(statements);};
 const r=await pub(env,cookie);assert.equal(inserted,true);assert.equal(r.status,409);assert.equal(listing(env).published,0);assert.equal(queueState(env),'review');
});
test('a concurrent Queue approval cannot be erased by a delayed discard',async()=>{
 const {env,cookie}=await queueWorld();seedMedia(env,{origin:'upload'});const prepare=env.DB.prepare.bind(env.DB);let approved, storageDeleted=false;
 env.MEDIA.delete=async()=>{storageDeleted=true;};
 env.DB.prepare=sql=>{const stmt=prepare(sql);if(!sql.startsWith('SELECT r2_key, thumb_key FROM media'))return stmt;
  return {...stmt,bind:(...args)=>{const b=stmt.bind(...args);return {...b,all:async()=>{const r=await b.all();approved=await approve(env,cookie);return r;}};}};};
 const r=await call(env,'POST','/admin/queue/77/discard',{cookie});
 assert.equal(approved.status,200);assert.equal(r.status,409);assert.equal(listing(env).published,1);assert.equal(queueState(env),'published');assert.equal(storageDeleted,false);
});
