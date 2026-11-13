import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeEnv, seedListing, seedMedia, call, adminCookie } from './helpers.mjs';
import { applyListingHealthProposal } from './listing-health-support.mjs';
import { buildPublicAddressReview } from '../../server/public-address.js';
import { readLive } from '../../server/routes/public.js';

const { shownOnSite } = createRequire(import.meta.url)('../../site/lib.js');
const NOW = '2026-10-25T12:00:00Z'; // Jersey clock changes during this 30-day interval
const stamp = '2026-10-01T12:00:00.000Z';
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const get = async (env, query = '') => call(env, 'GET', `/admin/insights/listing-health${query}`, { cookie: await adminCookie() });
function listing(env, id, changes = {}) {
  seedListing(env, { id, title: `Property ${id}`, ...changes });
  seedMedia(env, { id: `M${id.replace(/[^A-Za-z0-9]/g, '')}`, listing_id: id });
}
const stat = (env, id, n, day = '2026-10-01', metric = 'view') => run(env,
  'INSERT INTO daily_stats (day, listing_id, metric, n) VALUES (?, ?, ?, ?)', day, id, metric, n);
const request = (env, id, created = '2026-10-01T12:00:00.000Z', status = 'requested') => run(env,
  `INSERT INTO viewing_requests (listing_id, kind, date, time, name, email, status, created_at)
   VALUES (?, 'In person', '2026-10-20', '10:00', 'Synthetic visitor', 'visitor@example.test', ?, ?)`, id, status, created);

function setup(t) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(NOW) });
  return { ...applyListingHealthProposal(makeEnv()), LISTING_HEALTH_READY: '1' };
}

test('health requires Staff and an explicit readiness gate', async t => {
  const env = setup(t);
  assert.equal((await call(env, 'GET', '/admin/insights/listing-health')).status, 401);
  delete env.LISTING_HEALTH_READY;
  const disabled=await get(env);
  assert.equal(disabled.status, 200); assert.equal(disabled.data.enabled,false);
});

test('health uses view and request thresholds and Jersey day boundaries without multiplying joins', async t => {
  const env = setup(t);
  for (const id of ['A','B','C','D']) listing(env,id);
  stat(env,'A',29); stat(env,'B',30); stat(env,'C',45); stat(env,'D',60);
  stat(env,'B',200,'2026-10-02','photos'); stat(env,'B',100,'2026-10-03','tour');
  stat(env,'B',8,'2026-09-25'); // before the range
  stat(env,'B',99,'2020-01-01','photos'); // earliest non-view is not the first view observation
  request(env,'B','2026-09-26T00:00:00.000+01:00','cancelled'); // inclusive local midnight, explicit offset
  request(env,'B','now'); // malformed legacy value must not become a request in the period
  request(env,'B','2026-09-31T12:00:00.000Z'); // invalid calendar date must not be normalized into October
  request(env,'B','2026-10-01'); // date without a time is not a verified instant
  request(env,'B','2026-10-01T24:59:59.000Z');
  request(env,'B','2026-10-01T10:60:00.000Z');
  request(env,'B','2026-10-01T10:00:60.000Z');
  request(env,'B','2026-10-01T10:00:00.000'); // no time zone
  request(env,'B','2026-10-01T10:00:00.000+14:01');
  request(env,'B','2026-10-01T10:00:00.000+25:00');
  request(env,'B','2026-09-25T22:59:59.999Z'); // before local midnight
  request(env,'B','2026-10-26T00:00:00.000Z'); // after local midnight, following DST
  request(env,'D'); request(env,'D','2026-10-03T12:00:00.000Z');
  const r = await get(env);
  assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.deepEqual(r.data.period,{days:30,from:'2026-09-26',to:'2026-10-25'});
  assert.equal(r.data.first_day,'2026-09-25');
  assert.equal(r.data.coverage,'unknown');
  assert.deepEqual(r.data.rows.map(x=>[x.listing_id,x.views,x.viewing_requests]),[['C',45,0],['B',30,1]]);
  assert.equal(r.data.next_cursor,null);
  assert.ok(!JSON.stringify(r.data).includes('Synthetic visitor'));
  assert.ok(!JSON.stringify(r.data).includes('visitor@example.test'));
});

test('health excludes listings unavailable to the public, including hidden addresses', async t => {
  const env=setup(t);
  for (const id of ['VISIBLE','NO_PHOTO','ARCHIVED','DRAFT','SOLD','AGREED','LET','WITHDRAWN','DISABLED','PRIVATE']) {
    listing(env,id); stat(env,id,30);
  }
  run(env,"UPDATE media SET public=0 WHERE listing_id='NO_PHOTO'");
  run(env,"UPDATE listings SET archived_at=? WHERE id='ARCHIVED'",stamp);
  run(env,"UPDATE listings SET published=0 WHERE id='DRAFT'");
  for (const [id,status] of [['SOLD','sold'],['AGREED','let_agreed'],['LET','let'],['WITHDRAWN','withdrawn']])
    run(env,'UPDATE listings SET availability=? WHERE id=?',status,id);
  run(env,"UPDATE listings SET viewings_enabled=0 WHERE id='DISABLED'");
  run(env,"UPDATE listings SET title='17 Orchard Road', road_name='Orchard Road' WHERE id='PRIVATE'");
  run(env,"INSERT INTO listing_details (listing_id,building_name_or_number) VALUES ('PRIVATE','17')");
  const r=await get(env);
  assert.equal(r.status,200);
  assert.deepEqual(r.data.rows.map(x=>x.listing_id),['VISIBLE']);
  assert.ok(!JSON.stringify(r.data).includes('Orchard'));
});

test('address consent remains identical to readLive when approval becomes stale', async t => {
  const env=setup(t), id='CONSENT';
  listing(env,id,{title:'17 Orchard Road',road_name:'Orchard Road'});stat(env,id,30);
  run(env,"INSERT INTO listing_details(listing_id,building_name_or_number,postcode) VALUES (?,'17','JE2 3AB')",id);
  let row=env.DB.raw.prepare(`SELECT l.*,d.building_name_or_number,d.postcode,d.public_address_snapshot,d.public_address_snapshot_hash
    FROM listings l JOIN listing_details d ON d.listing_id=l.id WHERE l.id=?`).get(id);
  const media=env.DB.raw.prepare('SELECT * FROM media WHERE listing_id=? ORDER BY position,id').all(id);
  const details={building_name_or_number:row.building_name_or_number,postcode:row.postcode};
  const approval=await buildPublicAddressReview({...row,active_interest:0},details,media,null,'https://hampton.test');
  run(env,`UPDATE listing_details SET public_address_snapshot=?,public_address_snapshot_hash=?,public_address_evidence_ref='fixture',
    public_address_reviewed_by='staff',public_address_reviewed_at=? WHERE listing_id=?`,approval.address,approval.public_snapshot_hash,stamp,id);
  assert.equal((await readLive(env,id)).length,1);
  assert.deepEqual((await get(env)).data.rows.map(r=>r.listing_id),[id]);
  run(env,"UPDATE listings SET description='Changed after review' WHERE id=?",id);
  assert.equal((await readLive(env,id)).length,0);
  assert.deepEqual((await get(env)).data.rows,[]);
});

test('health pages the complete ordered set and rejects changed counts or eligibility', async t => {
  const env=setup(t);
  for(let i=0;i<55;i++) { const id=`P${String(i).padStart(3,'0')}`; listing(env,id); stat(env,id,30); }
  const first=await get(env);
  assert.equal(first.status,200); assert.equal(first.data.rows.length,50); assert.ok(first.data.next_cursor);
  const path=`?cursor=${encodeURIComponent(first.data.next_cursor)}`;
  const second=await get(env,path);
  assert.equal(second.status,200); assert.equal(second.data.rows.length,5);
  assert.equal(new Set([...first.data.rows,...second.data.rows].map(x=>x.listing_id)).size,55);
  run(env, "DELETE FROM listings WHERE id='P054'");
  listing(env,'P054',{ title:'Replacement' }); stat(env,'P054',30);
  assert.equal((await get(env,path)).status,409); // deletion and reuse of an ID is a different result
  const refreshed=await get(env);
  const refreshedPath=`?cursor=${encodeURIComponent(refreshed.data.next_cursor)}`;
  run(env,"UPDATE daily_stats SET n=31 WHERE listing_id='P054' AND metric='view'");
  assert.equal((await get(env,refreshedPath)).status,409);
  run(env,"UPDATE daily_stats SET n=30 WHERE listing_id='P054' AND metric='view'");
  run(env,"UPDATE listings SET viewings_enabled=0 WHERE id='P054'");
  assert.equal((await get(env,refreshedPath)).status,409);
  for (const query of ['?cursor=nope','?cursor=eyJ2ZXJzaW9uIjoxLCJvZmZzZXQiOi0xLCJoYXNoIjoiYSJ9','?cursor='])
    assert.equal((await get(env,query)).status,400);
});

test('health reports a source failure rather than an empty result', async t => {
  const env=setup(t); env.DB.raw.exec('DROP TABLE daily_stats');
  assert.equal((await get(env)).status,500);
});


test('health follows the website visibility rule for the selected cover photo', async t => {
  const env=setup(t);
  listing(env,'GOOD'); listing(env,'BAD'); listing(env,'BADCOVER');
  for(const id of ['GOOD','BAD','BADCOVER']) stat(env,id,30);
  run(env,"UPDATE media SET id='M-BAD' WHERE listing_id='BAD'");
  seedMedia(env,{id:'M-BADCOVER',listing_id:'BADCOVER'});
  run(env,"UPDATE listings SET cover_media_id='M-BADCOVER' WHERE id='BADCOVER'");
  const good=await readLive(env,'GOOD'), bad=await readLive(env,'BAD'), cover=await readLive(env,'BADCOVER');
  assert.equal(shownOnSite(good[0].pub),true);
  assert.equal(shownOnSite(bad[0].pub),false);
  assert.equal(shownOnSite(cover[0].pub),false);
  const response=await get(env);
  assert.deepEqual(response.data.rows.map(row=>row.listing_id),['GOOD']);
});

test('health agrees with public media eligibility for known documents and legacy photos', async t => {
  const env = setup(t);
  for (const id of ['GOOD', 'LEGACYNULL', 'DOCMIME', 'DOCNAME']) { listing(env, id); stat(env, id, 30); }
  run(env, "UPDATE media SET content_type=NULL WHERE listing_id='LEGACYNULL'");
  run(env, "UPDATE media SET content_type='application/pdf' WHERE listing_id='DOCMIME'");
  run(env, "UPDATE media SET content_type=NULL,r2_key='synthetic/file.pdf' WHERE listing_id='DOCNAME'");
  for (const id of ['GOOD', 'LEGACYNULL']) assert.ok((await readLive(env, id))[0].pub.image);
  for (const id of ['DOCMIME', 'DOCNAME']) assert.equal((await readLive(env, id))[0].pub.image, null);
  const health = await get(env);
  assert.equal(health.status, 200);
  assert.deepEqual(health.data.rows.map(row => row.listing_id), ['GOOD', 'LEGACYNULL']);
});
