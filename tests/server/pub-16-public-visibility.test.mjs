import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEnv,seedListing,seedMedia,adminCookie,call,T0} from './helpers.mjs';
import {serveMedia} from '../../server/media.js';
import {listingPage,sitemapResponse} from '../../server/seo.js';
import {bookStatement} from '../../server/viewing-store.js';
import {processExpiredRentalClosures} from '../../server/rental-closure-job.js';

const proposal=readFileSync(new URL('../../docs/roadmap/work/PUB-16/rental-closure.proposed.sql',import.meta.url),'utf8');
const photo=readFileSync(new URL('../fixtures/photo.jpg',import.meta.url));
const get=(env,sql,...args)=>env.DB.raw.prepare(sql).get(...args);
async function setup(enabled=true) {
  const env=makeEnv();env.SITE_URL='https://hampton.test';seedListing(env,{operation:'rent',availability:'to_let',published:1,cover_media_id:'A00001'});
  seedMedia(env,{id:'A00001',kind:'photo',public:1,r2_key:'synthetic/photo.jpg',thumb_key:null,content_type:'image/jpeg'});
  seedMedia(env,{id:'A00002',kind:'document',public:0,r2_key:'synthetic/document.pdf'});
  await env.MEDIA.put('synthetic/photo.jpg',photo,{httpMetadata:{contentType:'image/jpeg'}});
  if(enabled){env.DB.raw.exec(proposal);env.PUB16_TIMED_CLOSURE_READY='1';}
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

test('gate off preserves the existing cache contract without consulting the proposed table',async()=>{
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
  const result=await call(env,'GET','/listings');assert.equal(raced,true);assert.equal(result.status,503);
  assert.equal(Array.isArray(result.data),false);
});

test('enabled mode without its proposed schema cannot expose an unchecked listing or media',async()=>{
  const {env}=await setup(false);env.PUB16_TIMED_CLOSURE_READY='1';
  const result=await call(env,'GET','/listings');assert.ok(result.status>=500);assert.equal(Array.isArray(result.data),false);
  await assert.rejects(()=>media(env));
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

test('a withdrawn closure cannot be presented as a successful return without a reviewed reopening transition',async()=>{
  const {env,cookie}=await setup(),closure=await close(env,cookie);dbClock(env,closure.due_at);
  assert.equal((await processExpiredRentalClosures(env)).withdrawn,1);
  const before=get(env,"SELECT availability,published,updated_at FROM listings WHERE id='HE-R001'");
  const response=await call(env,'POST','/admin/listings/HE-R001/rental-marketing',{cookie,body:{
    request_id:'reopen-after-withdrawal',updated_at:before.updated_at,action:'return_to_market',
    reason_code:'correction',occurred_at:T0,evidence_refs:['media:A00002']}});
  assert.equal(response.status,409);
  assert.deepEqual(get(env,"SELECT availability,published,updated_at FROM listings WHERE id='HE-R001'"),before);
  assert.equal(get(env,"SELECT state FROM rental_closure_windows WHERE closure_id=?",closure.closure_id).state,'withdrawn');
});

test('an invalid deadline or unrecognized window state fails closed even before the original deadline',async()=>{
  for(const [field,value] of [['opened_at','2026-02-30T00:00:00.000Z'],['due_at','invalid-date'],['state','unknown']]){
    const {env,cookie}=await setup(),closure=await close(env,cookie);
    dbClock(env,new Date(Date.parse(closure.due_at)-1).toISOString());
    env.DB.raw.exec('DROP TRIGGER rental_closure_original_immutable');
    env.DB.raw.exec('DROP TRIGGER rental_closure_terminal_immutable');
    env.DB.raw.exec('PRAGMA ignore_check_constraints=ON');
    env.DB.raw.prepare(`UPDATE rental_closure_windows SET ${field}=? WHERE closure_id=?`).run(value,closure.closure_id);
    const response=await call(env,'GET','/listings');assert.equal(response.status,200);assert.deepEqual(response.data,[],field);
    assert.equal((await media(env)).status,404,field);
  }
});
