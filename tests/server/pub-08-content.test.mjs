import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {listingBatch} from '../../server/listing-events.js';
let content;
try { content = await import('../../server/listing-content.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const need = () => assert.ok(content, 'PUB-08 content validation is not implemented');

test('known staff-selected tags and an independent supported video validate', () => {
  need();
  const r=content.validateListingContent({tags:['sea_view','renovated'],video_url:'https://player.vimeo.com/video/123?h=fixture'});
  assert.deepEqual(r.value,{tags:['renovated','sea_view'],video_url:'https://player.vimeo.com/video/123?h=fixture'});
  assert.equal(r.errors,undefined);
  assert.equal(Object.hasOwn(r.value,'tour_url'),false);
});

test('unknown or duplicate tags and unrequested social fields are rejected', () => {
  need();
  for (const tags of [['unknown'],['sea_view','sea_view'],'sea_view',[null],new Array(4).fill('renovated')])
    assert.ok(content.validateListingContent({tags}).errors?.tags);
  assert.ok(content.validateListingContent({tags:[],social_text:'fixture'}).errors?.social_text);
});

test('video requires a supported HTTPS player and rejects credentials, spoofing and unrelated queries', () => {
  need();
  for (const video_url of ['javascript:alert(1)','http://player.vimeo.com/video/123','https://player.vimeo.com.evil.test/video/123',
    'https://user:pass@player.vimeo.com/video/123','https://player.vimeo.com:8443/video/123','https://player.vimeo.com/account',
    'https://www.youtube-nocookie.com/embed/abc?tracking=1'])
    assert.ok(content.validateListingContent({video_url}).errors?.video_url,video_url);
  assert.equal(content.validateListingContent({video_url:null}).value.video_url,null);
  assert.equal(content.validateListingContent({video_url:'https://www.youtube-nocookie.com/embed/fixture'}).value.video_url,
    'https://www.youtube-nocookie.com/embed/fixture');
});

const {makeEnv,seedListing,seedMedia,adminCookie,call,T0}=await import('./helpers.mjs');
async function world(enabled=true) {
  const env=makeEnv();seedListing(env,{tour_url:'https://my.matterport.com/show/?m=fixture'});
  if(enabled)env.PUB08_CONTENT_READY='1';
  return {env,cookie:await adminCookie()};
}

test('disabled feature rejects content writes without requiring its migration', async () => {
  const {env,cookie}=await world(false);
  env.DB.raw.exec('DROP TABLE listing_content');
  const detail=await call(env,'GET','/admin/listings/HE-R001',{cookie});
  assert.equal(detail.status,200);
  assert.equal(detail.data.content_tracking,undefined);
  const result=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,
    content:{tags:['sea_view'],video_url:'https://player.vimeo.com/video/123'}}});
  assert.equal(result.status,404);
  assert.equal(env.DB.raw.prepare("SELECT tour_url FROM listings WHERE id='HE-R001'").get().tour_url,'https://my.matterport.com/show/?m=fixture');
});

test('staff saves content atomically without overwriting the existing tour', async () => {
  const {env,cookie}=await world();
  const before=await call(env,'GET','/admin/listings/HE-R001',{cookie});
  assert.equal(before.data.content_tracking,true);
  assert.deepEqual(before.data.content,{tags:[],video_url:null});
  const result=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,
    content:{tags:['sea_view'],video_url:'https://player.vimeo.com/video/123'}}});
  assert.equal(result.status,200);
  assert.deepEqual(result.data.content,{tags:['sea_view'],video_url:'https://player.vimeo.com/video/123'});
  assert.equal(result.data.listing.tour_url,'https://my.matterport.com/show/?m=fixture');
  assert.notEqual(result.data.listing.updated_at,T0);
  const again=await call(env,'GET','/admin/listings/HE-R001',{cookie});
  assert.deepEqual(again.data.content,result.data.content);
  const events=env.DB.raw.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id='HE-R001'").all().map(row=>JSON.parse(row.data));
  assert.ok(events.at(-1).fields.includes('content_tags'));
  assert.ok(events.at(-1).fields.includes('video_url'));
  assert.equal(JSON.stringify(events).includes('player.vimeo.com'),false);
});

test('stale or invalid content cannot change a listing or its event history', async () => {
  const {env,cookie}=await world();
  const valid=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,content:{tags:['sea_view']}}});
  assert.equal(valid.status,200);
  const count=env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_type='listing'").get().n;
  const stale=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,content:{tags:['town_centre']}}});
  assert.equal(stale.status,409);
  const invalid=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:valid.data.listing.updated_at,
    content:{tags:['unknown'],video_url:'javascript:alert(1)'}}});
  assert.equal(invalid.status,400);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_type='listing'").get().n,count);
  assert.deepEqual((await call(env,'GET','/admin/listings/HE-R001',{cookie})).data.content,{tags:['sea_view'],video_url:null});
});

test('content edits do not cross property IDs and no-op edits create no event', async () => {
  const {env,cookie}=await world();
  seedListing(env,{id:'HE-R002',tour_url:'https://my.matterport.com/show/?m=second'});
  const none=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,content:{tags:[],video_url:null}}});
  assert.equal(none.status,200);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_type='listing'").get().n,0);
  const saved=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,content:{tags:['sea_view']}}});
  assert.equal(saved.status,200);
  const other=await call(env,'GET','/admin/listings/HE-R002',{cookie});
  assert.deepEqual(other.data.content,{tags:[],video_url:null});
  assert.equal(other.data.listing.tour_url,'https://my.matterport.com/show/?m=second');
  const missing=await call(env,'PUT','/admin/listings/HE-R999',{cookie,body:{updated_at:T0,content:{tags:['town_centre']}}});
  assert.equal(missing.status,404);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_content').get().n,1);
});

test('staff revocation before the batch cannot commit content or a listing event', async () => {
  const {env,cookie}=await world();
  const original=env.DB.batch.bind(env.DB);let revoked=false;
  env.DB.batch=statements=>{
    if (!revoked && statements.some(statement=>statement.sql.includes('UPDATE listings SET') && statement.sql.includes('added_at=?'))) {
      revoked=true;
      env.DB.raw.prepare('DELETE FROM admins WHERE email=?').run('admin@example.test');
    }
    return original(statements);
  };
  const result=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,content:{tags:['sea_view']}}});
  assert.equal(revoked,true);
  assert.equal(result.status,409);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_content').get().n,0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_type='listing'").get().n,0);
  assert.equal(env.DB.raw.prepare("SELECT updated_at FROM listings WHERE id='HE-R001'").get().updated_at,T0);
});

test('changing public content invalidates the exact-address snapshot hash', async () => {
  const {env}=await world();
  const {buildPublicAddressReview}=await import('../../server/public-address.js');
  const row=env.DB.raw.prepare("SELECT * FROM listings WHERE id='HE-R001'").get();
  const listing={...row}, details={building_name_or_number:'Fixture building',postcode:'JE1 1AA'};
  listing.road_name='Fixture road';listing.country='Jersey';
  const base=await buildPublicAddressReview(listing,details,[],null,'https://hampton.test');
  const empty=await buildPublicAddressReview({...listing,_pub08_content:{tags:[],video_url:null}},details,[],null,'https://hampton.test');
  const changed=await buildPublicAddressReview({...listing,_pub08_content:{tags:['sea_view'],video_url:'https://player.vimeo.com/video/123'}},details,[],null,'https://hampton.test');
  assert.equal(base.public_snapshot_hash,empty.public_snapshot_hash);
  assert.notEqual(base.public_snapshot_hash,changed.public_snapshot_hash);
});

test('public content is projected only when enabled and never replaces the tour', async () => {
  const {env,cookie}=await world();
  env.DB.raw.prepare("UPDATE listings SET published=1 WHERE id='HE-R001'").run();
  const saved=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,
    content:{tags:['sea_view'],video_url:'https://player.vimeo.com/video/123'}}});
  assert.equal(saved.status,200);
  let response=await call(env,'GET','/listings');
  assert.equal(response.status,200);
  const listing=response.data.find(x=>x.id==='HE-R001');
  assert.deepEqual(listing.tags,['Sea view']);
  assert.equal(listing.videoUrl,'https://player.vimeo.com/video/123');
  assert.equal(listing.tourUrl,'https://my.matterport.com/show/?m=fixture');
  env.PUB08_CONTENT_READY='0';
  response=await call(env,'GET','/listings');
  const disabled=response.data.find(x=>x.id==='HE-R001');
  assert.equal(disabled.tags,undefined);
  assert.equal(disabled.videoUrl,undefined);
});

test('approved address retains reviewed content and a later content edit hides the stale address', async () => {
  const {env,cookie}=await world();
  env.SITE_URL='https://hampton.test';
  env.DB.raw.prepare(`UPDATE listings SET published=1,road_name='Fixture Street',location='St Saviour',
    parish='St Saviour',title='Fixture home in St Saviour' WHERE id=?`).run('HE-R001');
  seedMedia(env);
  const saved=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,
    details:{building_name_or_number:'Fixture House',postcode:'JE2 3AB'},
    content:{tags:['sea_view'],video_url:'https://player.vimeo.com/video/123'}}});
  assert.equal(saved.status,200);
  const preview=await call(env,'GET','/admin/listings/HE-R001/address-review',{cookie});
  assert.equal(preview.status,200);
  assert.deepEqual(preview.data.preview.listing.tags,['Sea view']);
  const approved=await call(env,'POST','/admin/listings/HE-R001/address-review',{cookie,body:{
    action:'authorize',expected_at:preview.data.expected_at,public_snapshot_hash:preview.data.public_snapshot_hash,
    address_publication_authorized:true,evidence_ref:'fixture:owner-consent',
  }});
  assert.equal(approved.status,200);
  let current=(await call(env,'GET','/listings')).data.find(x=>x.id==='HE-R001');
  assert.equal(current.exactAddress,preview.data.preview.listing.exactAddress);
  assert.deepEqual(current.tags,['Sea view']);
  assert.equal(current.videoUrl,'https://player.vimeo.com/video/123');
  const edited=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:approved.data.listing.updated_at,
    content:{tags:['town_centre']}}});
  assert.equal(edited.status,200);
  current=(await call(env,'GET','/listings')).data.find(x=>x.id==='HE-R001');
  assert.equal(current.exactAddress,undefined);
  assert.deepEqual(current.tags,['Town centre']);
  assert.equal(current.videoUrl,'https://player.vimeo.com/video/123');
});

test('content failure rolls back the listing update and its event', async () => {
  const {env,cookie}=await world();
  env.DB.raw.exec(`CREATE TRIGGER pub08_test_abort BEFORE INSERT ON listing_content BEGIN SELECT RAISE(ABORT,'fixture failure'); END`);
  const response=await call(env,'PUT','/admin/listings/HE-R001',{cookie,body:{updated_at:T0,
    content:{tags:['sea_view']}}});
  assert.equal(response.status,500);
  assert.equal(env.DB.raw.prepare("SELECT updated_at FROM listings WHERE id='HE-R001'").get().updated_at,T0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_content').get().n,0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_type='listing'").get().n,0);
});

test('real local D1 serializes competing content saves and rolls back invalid content', async () => {
  const require=createRequire(import.meta.url);
  const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
  const {unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
    script:"export default {fetch(){return new Response('fixture')}}",compatibilityDate:'2025-10-01',
    host:'127.0.0.1',port:0,d1Databases:{DB:'pub08-synthetic'}}));
  try {
    const DB=await mf.getD1Database('DB'),env={DB},dir=new URL('../../migrations/',import.meta.url);
    const files=readdirSync(dir).filter(name=>name.endsWith('.sql')).sort();
    const contentMigration=files.find(name=>name.endsWith('_listing_content.sql'));
    assert.ok(contentMigration);
    for(const file of files.filter(name=>name!==contentMigration))
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(file,dir),'utf8')).map(sql=>DB.prepare(sql)));
    await DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,country,published,created_at,updated_at)
      VALUES('HE-R001','residential','Fixture','sale','for_sale','Jersey',1,?,?)`).bind(T0,T0).run();
    const before=await DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first();
    await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(contentMigration,dir),'utf8')).map(sql=>DB.prepare(sql)));
    assert.deepEqual(await DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first(),before);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM listing_content').first()).n,0);
    const save=(expected,next,tags)=>listingBatch(env,'HE-R001',{
      actor:'admin@example.test',source:'panel',action:'updated',extraFields:['content_tags'],
    },[DB.prepare('UPDATE listings SET updated_at=? WHERE id=? AND updated_at=?').bind(next,'HE-R001',expected),
      content.listingContentUpdateStatement(env,'HE-R001',{tags,video_url:null})]);
    const results=await Promise.all([save(T0,'2026-11-01T00:00:00.001Z',['sea_view']),
      save(T0,'2026-11-01T00:00:00.002Z',['town_centre'])]);
    assert.deepEqual(results.map(result=>Number(result[0].meta.changes>0)).sort(),[0,1]);
    const listing=await DB.prepare("SELECT updated_at FROM listings WHERE id='HE-R001'").first();
    const saved=await DB.prepare("SELECT tags FROM listing_content WHERE listing_id='HE-R001'").first();
    assert.deepEqual(JSON.parse(saved.tags),listing.updated_at.endsWith('001Z')?['sea_view']:['town_centre']);
    const events=await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_type='listing'").first();
    assert.equal(events.n,1);
    await assert.rejects(save(listing.updated_at,'2026-11-01T00:00:00.003Z',['not_allowed']));
    assert.equal((await DB.prepare("SELECT updated_at FROM listings WHERE id='HE-R001'").first()).updated_at,listing.updated_at);
    assert.equal((await DB.prepare("SELECT tags FROM listing_content WHERE listing_id='HE-R001'").first()).tags,saved.tags);
    assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_type='listing'").first()).n,events.n);
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally {await mf.dispose();}
});
