import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEnv,seedListing,seedMedia,adminCookie,call,T0} from './helpers.mjs';
import {serveMedia} from '../../server/media.js';
import {listingPage,sitemapResponse} from '../../server/seo.js';
import {bookStatement} from '../../server/viewing-store.js';
import {processExpiredRentalClosures} from '../../server/rental-closure-job.js';

const photo=readFileSync(new URL('../fixtures/photo.jpg',import.meta.url));
const get=(env,sql,...args)=>env.DB.raw.prepare(sql).get(...args);
async function setup(enabled=true) {
  const env=makeEnv();env.SITE_URL='https://hampton.test';seedListing(env,{operation:'rent',availability:'to_let',published:1,cover_media_id:'A00001'});
  seedMedia(env,{id:'A00001',kind:'photo',public:1,r2_key:'synthetic/photo.jpg',thumb_key:null,content_type:'image/jpeg'});
  seedMedia(env,{id:'A00002',kind:'document',public:0,r2_key:'synthetic/document.pdf'});
  await env.MEDIA.put('synthetic/photo.jpg',photo,{httpMetadata:{contentType:'image/jpeg'}});
  if(enabled){env.PUB16_TIMED_CLOSURE_READY='1';}
  return {env,cookie:await adminCookie()};
}
async function close(env,cookie) {
  const updated_at=get(env,"SELECT updated_at FROM listings WHERE id='HE-R001'").updated_at;
  const response=await call(env,'POST','/admin/listings/HE-R001/rental-marketing',{cookie,body:{
    request_id:'synthetic-close',updated_at,action:'let',reason_code:'completed',occurred_at:T0,evidence_refs:['media:A00002']}});
  assert.equal(response.status,200);
  return get(env,"SELECT * FROM rental_closure_windows WHERE listing_id='HE-R001' AND state='open'");
}
function dbClock(env,initial) {
  let current=initial;const prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=statement=>prepare(statement.replaceAll("strftime('%Y-%m-%dT%H:%M:%fZ','now')",`'${current}'`));
  return value=>{current=value;};
}
const media=env=>serveMedia(new Request('https://hampton.test/media/A00001'),env,'A00001');
const page=env=>listingPage(new Request('https://hampton.test/p/HE-R001'),env,'HE-R001');

test('gate off preserves the existing cache contract without consulting the closure table',async()=>{
  const {env}=await setup(false);
  assert.match((await call(env,'GET','/listings')).headers.get('cache-control'),/max-age=60/);
  assert.match((await media(env)).headers.get('cache-control'),/max-age=86400/);
  assert.match((await page(env)).headers.get('cache-control'),/max-age=300/);
});

test('at the precise deadline the public list, SEO and media hide the closed rental without a job',async()=>{
  const {env,cookie}=await setup(),closure=await close(env,cookie);
  const changeClock=dbClock(env,new Date(Date.parse(closure.due_at)-1).toISOString());
  const before=await call(env,'GET','/listings');assert.equal(before.status,200);
  assert.equal(before.data[0].status,'Let agreed');assert.match(before.headers.get('cache-control'),/no-store/);
  assert.equal((await page(env)).status,200);assert.match((await page(env)).headers.get('cache-control'),/no-store/);
  const image=await media(env);assert.equal(image.status,200);assert.match(image.headers.get('cache-control'),/no-store/);
  changeClock(closure.due_at);
  const after=await call(env,'GET','/listings');assert.equal(after.status,200);assert.deepEqual(after.data,[]);
  assert.equal((await page(env)).status,404);assert.equal((await media(env)).status,404);
  const sitemap=await sitemapResponse(new Request('https://hampton.test/sitemap.xml'),env);
  assert.doesNotMatch(await sitemap.text(),/HE-R001/);
  assert.equal(get(env,"SELECT published FROM listings WHERE id='HE-R001'").published,1,'the read does not run the job');
});

test('if the deadline passes during asynchronous public projection, the response fails closed',async()=>{
  const {env,cookie}=await setup(),closure=await close(env,cookie);
  const changeClock=dbClock(env,new Date(Date.parse(closure.due_at)-1).toISOString());
  const batch=env.DB.batch.bind(env.DB);let raced=false;
  env.DB.batch=async statements=>{
    const result=await batch(statements);
    if(!raced&&statements.some(s=>s.sql.includes('FROM listings l LEFT JOIN listing_details'))){raced=true;changeClock(closure.due_at);}
    return result;
  };
  // Read once more: the second reading agrees, and the rental past its deadline is not shown.
  const result=await call(env,'GET','/listings');assert.equal(raced,true);assert.equal(result.status,200);
  assert.deepEqual(result.data,[]);
});

test('a write between the two public readings is read again once; only a second one answers 503',async()=>{
  const {env}=await setup();const batch=env.DB.batch.bind(env.DB);let writes=1;
  env.DB.batch=async statements=>{
    const result=await batch(statements);
    if(writes>0&&statements.some(s=>s.sql.includes('FROM listings l LEFT JOIN listing_details'))){
      writes--;env.DB.raw.exec("UPDATE listings SET title=title||'.' WHERE id='HE-R001'");}
    return result;
  };
  const once=await call(env,'GET','/listings');assert.equal(once.status,200);assert.equal(once.data[0].id,'HE-R001');
  writes=99;assert.equal((await call(env,'GET','/listings')).status,503,'changing at every reading');
});

test('switched on before migration 0087, the public website reads as switched off',async()=>{
  const {env}=await setup(false);env.PUB16_TIMED_CLOSURE_READY='1';env.DB.raw.exec('DROP TABLE rental_closure_windows');
  const result=await call(env,'GET','/listings');assert.equal(result.status,200);assert.equal(result.data[0].id,'HE-R001');
  const image=await media(env);assert.equal(image.status,200);assert.match(image.headers.get('cache-control'),/max-age=86400/);
  assert.equal((await page(env)).status,200);
  const slots=await call(env,'GET','/availability?listing_id=HE-R001');assert.equal(slots.status,200,JSON.stringify(slots.data));
});

test('a withdrawn rental is not published by Publish, and Return to market leaves it unpublished',async()=>{
  const {env,cookie}=await setup(),closure=await close(env,cookie);dbClock(env,closure.due_at);
  assert.equal((await processExpiredRentalClosures(env)).withdrawn,1);
  const version=()=>get(env,"SELECT updated_at FROM listings WHERE id='HE-R001'").updated_at;
  const publish=()=>call(env,'POST','/admin/listings/HE-R001/publish',{cookie,body:{updated_at:version()}});
  const before={...get(env,'SELECT * FROM listings WHERE id=?','HE-R001')};
  const refused=await publish();
  assert.equal(refused.status,409);assert.match(refused.data.error,/Return to market/);
  assert.deepEqual({...get(env,'SELECT * FROM listings WHERE id=?','HE-R001')},before);
  // Even if an older writer had published it, Return to market leaves it off the website.
  env.DB.raw.exec("UPDATE listings SET published=1 WHERE id='HE-R001'");
  const back=await call(env,'POST','/admin/listings/HE-R001/rental-marketing',{cookie,body:{request_id:'reopen',updated_at:version(),
    action:'return_to_market',reason_code:'fell_through',occurred_at:T0,evidence_refs:['media:A00002']}});
  assert.equal(back.status,200,JSON.stringify(back.data));
  assert.deepEqual({...get(env,"SELECT availability,published FROM listings WHERE id='HE-R001'")},{availability:'to_let',published:0});
  assert.deepEqual((await call(env,'GET','/listings')).data,[]);
  // Reopened, Publish works as usual.
  assert.equal((await publish()).status,200);
  assert.equal((await call(env,'GET','/listings')).data[0]?.id,'HE-R001');
});

test('Publish is refused during the 24 hours too, if the rental was unpublished meanwhile',async()=>{
  const {env,cookie}=await setup();await close(env,cookie);
  env.DB.raw.exec("UPDATE listings SET published=0 WHERE id='HE-R001'");
  const updated_at=get(env,"SELECT updated_at FROM listings WHERE id='HE-R001'").updated_at;
  assert.equal((await call(env,'POST','/admin/listings/HE-R001/publish',{cookie,body:{updated_at}})).status,409);
  assert.equal(get(env,"SELECT published FROM listings WHERE id='HE-R001'").published,0);
});

test('a media request crossing the deadline cannot return its bytes',async()=>{
  const {env,cookie}=await setup(),closure=await close(env,cookie);
  const changeClock=dbClock(env,new Date(Date.parse(closure.due_at)-1).toISOString());
  const getObject=env.MEDIA.get.bind(env.MEDIA);let crossed=false;
  env.MEDIA.get=async key=>{const object=await getObject(key);crossed=true;changeClock(closure.due_at);return object;};
  const response=await media(env);assert.equal(crossed,true);assert.equal(response.status,404);
  assert.match(response.headers.get('cache-control'),/no-store/);
});

test('the atomic public booking insert rejects an open closure even if a legacy writer changes availability',async()=>{
  const {env,cookie}=await setup();await close(env,cookie);
  env.DB.raw.exec("UPDATE listings SET availability='to_let' WHERE id='HE-R001'");
  const v={listing_id:'HE-R001',negotiator_id:1,kind:'In person',date:'2030-01-01',time:'11:00',
    name:'Synthetic',email:'view@example.test',phone:null};
  const [result]=await env.DB.batch([bookStatement(env,v,{status:'requested',publicOnly:true})]);
  assert.equal(result.meta.changes,0);assert.equal(get(env,'SELECT COUNT(*) AS n FROM viewing_requests').n,0);
});

test('a withdrawn rental stays hidden and unbookable if an unrelated writer republishes it',async()=>{
  const {env,cookie}=await setup(),closure=await close(env,cookie);dbClock(env,closure.due_at);
  assert.equal((await processExpiredRentalClosures(env)).withdrawn,1);
  env.DB.raw.exec("UPDATE listings SET published=1,availability='to_let' WHERE id='HE-R001'");
  const publicResponse=await call(env,'GET','/listings');assert.equal(publicResponse.status,200);assert.deepEqual(publicResponse.data,[]);
  assert.equal((await page(env)).status,404);assert.equal((await media(env)).status,404);
  const v={listing_id:'HE-R001',negotiator_id:1,kind:'In person',date:'2030-01-01',time:'11:00',
    name:'Synthetic',email:'view@example.test',phone:null};
  const [result]=await env.DB.batch([bookStatement(env,v,{status:'requested',publicOnly:true})]);
  assert.equal(result.meta.changes,0);assert.equal(get(env,'SELECT COUNT(*) AS n FROM viewing_requests').n,0);
});

test('after withdrawal, Return to market reopens the rental unpublished; once published again it is public and a new let opens a new window',async()=>{
  const {env,cookie}=await setup(),closure=await close(env,cookie);dbClock(env,closure.due_at);
  assert.equal((await processExpiredRentalClosures(env)).withdrawn,1);
  const send=(request_id,action,reason_code)=>call(env,'POST','/admin/listings/HE-R001/rental-marketing',{cookie,body:{request_id,
    updated_at:get(env,"SELECT updated_at FROM listings WHERE id='HE-R001'").updated_at,action,reason_code,occurred_at:T0,evidence_refs:['media:A00002']}});
  // Only Return to market leaves a withdrawal; Let again is refused.
  assert.equal((await send('let-after-withdrawal','let','completed')).status,409);
  const response=await send('reopen-after-withdrawal','return_to_market','fell_through');
  assert.equal(response.status,200,JSON.stringify(response.data));
  assert.deepEqual({...get(env,"SELECT availability,published FROM listings WHERE id='HE-R001'")},{availability:'to_let',published:0});
  const reopened=get(env,"SELECT state,withdrawn_at,reopened_at FROM rental_closure_windows WHERE closure_id=?",closure.closure_id);
  assert.equal(reopened.state,'reopened');assert.ok(reopened.withdrawn_at&&reopened.reopened_at);
  assert.deepEqual((await call(env,'GET','/listings')).data,[],'still unpublished: the team publishes it as usual');
  assert.equal((await call(env,'POST','/admin/listings/HE-R001/publish',{cookie,
    body:{updated_at:get(env,"SELECT updated_at FROM listings WHERE id='HE-R001'").updated_at}})).status,200);
  assert.equal((await call(env,'GET','/listings')).data[0]?.id,'HE-R001');
  assert.equal((await page(env)).status,200);
  assert.match((await media(env)).headers.get('cache-control'),/max-age=86400/,'no window left: its photos are cached again');
  // A used request id is not reused for another change, and a new letting starts its own window.
  assert.equal((await send('reopen-after-withdrawal','return_to_market','fell_through')).status,409);
  assert.equal((await send('second-let','let','completed')).status,200);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM rental_closure_windows WHERE listing_id='HE-R001' AND state='open'").n,1);
});

test('an invalid deadline or unrecognized window state fails closed even before the original deadline',async()=>{
  for(const [field,value] of [['opened_at','2026-02-30T00:00:00.000Z'],['due_at','invalid-date'],['state','unknown']]){
    const {env,cookie}=await setup(),closure=await close(env,cookie);
    dbClock(env,new Date(Date.parse(closure.due_at)-1).toISOString());
    env.DB.raw.exec('DROP TRIGGER rental_closure_transition');
    env.DB.raw.exec('PRAGMA ignore_check_constraints=ON');
    env.DB.raw.prepare(`UPDATE rental_closure_windows SET ${field}=? WHERE closure_id=?`).run(value,closure.closure_id);
    const response=await call(env,'GET','/listings');assert.equal(response.status,200);assert.deepEqual(response.data,[],field);
    assert.equal((await media(env)).status,404,field);
  }
});
