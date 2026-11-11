import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedListing } from './helpers.mjs';
import { publicViewingSummary } from '../../server/public-viewing-summary.js';

const instant = new Date('2026-11-11T10:00:00Z');
function add(env, date, time, status = 'confirmed', listing = 'HE-R001') {
  env.DB.raw.prepare(`INSERT INTO viewing_requests (listing_id,agent,kind,date,time,end_time,name,email,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(listing, 'Fixture', 'In person', date, time, time, 'Fixture', 'fixture@example.test', status, '2026-11-01T00:00:00Z');
}
test('only future confirmed appointments for the public property this Jersey week count', async () => {
  const env = makeEnv(); seedListing(env); seedListing(env,{id:'HE-R002',published:0});
  const read = id => publicViewingSummary(env,{listing_id:id,now:instant});
  assert.equal((await read('HE-R001')).booked_this_week,null);
  add(env,'2026-11-12','10:00');
  assert.equal((await read('HE-R001')).booked_this_week,null);
  add(env,'2026-11-13','11:00');
  add(env,'2026-11-13','12:00','requested');
  add(env,'2026-11-13','13:00','cancelled');
  add(env,'2026-11-10','13:00');
  add(env,'2026-11-16','13:00');
  assert.deepEqual(await read('HE-R001'),{booked_this_week:2,from:'2026-11-09',to:'2026-11-16'});
  assert.equal(await read('HE-R002'),null);
  env.DB.raw.prepare("UPDATE viewing_requests SET status='cancelled' WHERE date='2026-11-13' AND status='confirmed'").run();
  assert.equal((await read('HE-R001')).booked_this_week,null);
});
test('week boundaries use Jersey local date even across the UTC boundary', async () => {
  const env=makeEnv(); seedListing(env);
  const r=await publicViewingSummary(env,{listing_id:'HE-R001',now:new Date('2026-03-29T23:30:00Z')});
  assert.deepEqual(r,{booked_this_week:null,from:'2026-03-30',to:'2026-04-06'});
});

test('availability exposes only the aggregate for visible properties', async () => {
  const { call } = await import('./helpers.mjs');
  const env=makeEnv(); seedListing(env); seedListing(env,{id:'HE-R002',published:0});
  const result=await call(env,'GET','/availability?listing_id=HE-R001');
  assert.equal(result.status,200);
  assert.equal(result.data.confirmed_viewings_this_week,null);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal((await call(env,'GET','/availability?listing_id=HE-R002')).status,404);
});

test('rescheduling and interest removal are independent of the confirmed booking count', async () => {
  const env=makeEnv(); seedListing(env);
  add(env,'2026-11-12','10:00'); add(env,'2026-11-13','11:00');
  const read=async () => (await publicViewingSummary(env,{listing_id:'HE-R001',now:instant})).booked_this_week;
  env.DB.raw.prepare("UPDATE viewing_requests SET interest_removed_at='2026-11-11T00:00:00Z', interest_reason='not_buyer' WHERE date='2026-11-12'").run();
  assert.equal(await read(),2);
  env.DB.raw.prepare("UPDATE viewing_requests SET date='2026-11-16' WHERE date='2026-11-13'").run();
  assert.equal(await read(),null);
});

test('availability returns actual confirmed counts without personal data and rechecks visibility', async () => {
  const { call } = await import('./helpers.mjs');
  const env=makeEnv(); seedListing(env);
  const ActualDate=globalThis.Date;
  globalThis.Date=class extends ActualDate { constructor(...args) { super(...(args.length ? args : ['2026-11-11T10:00:00Z'])); } static now() {return instant.getTime();} };
  try {
    add(env,'2026-11-12','10:00'); add(env,'2026-11-13','11:00');
    let r=await call(env,'GET','/availability?listing_id=HE-R001');
    assert.equal(r.data.confirmed_viewings_this_week,2);
    assert.doesNotMatch(JSON.stringify(r.data),/fixture@example|Fixture/);
    env.DB.raw.prepare("UPDATE viewing_requests SET status='cancelled' WHERE date='2026-11-13'").run();
    r=await call(env,'GET','/availability?listing_id=HE-R001');
    assert.equal(r.data.confirmed_viewings_this_week,null);
    const batch=env.DB.batch.bind(env.DB); let loaded=false;
    env.DB.batch=async statements => {
      if (loaded && statements.some(s=>s.sql.includes('AS active_interest'))) {
        env.DB.raw.prepare("UPDATE listings SET published=0 WHERE id='HE-R001'").run(); loaded=false;
      }
      const result=await batch(statements);
      if (statements.some(s=>s.sql.includes('SELECT negotiator_id, date, time, end_time'))) loaded=true;
      return result;
    };
    assert.equal((await call(env,'GET','/availability?listing_id=HE-R001')).status,404);
  } finally {globalThis.Date=ActualDate;}
});

test('the final visibility snapshot also determines the current confirmed count', async () => {
  const {call}=await import('./helpers.mjs');
  const env=makeEnv(); seedListing(env);
  const ActualDate=globalThis.Date;
  globalThis.Date=class extends ActualDate { constructor(...args) {super(...(args.length ? args : ['2026-11-11T10:00:00Z']));} static now(){return instant.getTime();} };
  try {
    add(env,'2026-11-12','10:00'); add(env,'2026-11-13','11:00');
    const batch=env.DB.batch.bind(env.DB); let afterAvailability=false, changed=false;
    env.DB.batch=async statements => {
      const isVisibility=statements.some(s=>s.sql.includes('AS active_interest'));
      if (afterAvailability && isVisibility && !changed) {
        env.DB.raw.prepare("UPDATE viewing_requests SET status='cancelled' WHERE date='2026-11-13'").run(); changed=true;
      }
      const result=await batch(statements);
      if (statements.some(s=>s.sql.includes('SELECT negotiator_id, date, time, end_time'))) afterAvailability=true;
      return result;
    };
    const response=await call(env,'GET','/availability?listing_id=HE-R001');
    assert.equal(changed,true);
    assert.equal(response.status,200);
    assert.equal(response.data.confirmed_viewings_this_week,null);
  } finally {globalThis.Date=ActualDate;}
});

test('a change after the visibility snapshot invalidates the response', async () => {
  const {call}=await import('./helpers.mjs');
  const env=makeEnv(); seedListing(env);
  const ActualDate=globalThis.Date;
  globalThis.Date=class extends ActualDate { constructor(...args){super(...(args.length?args:['2026-11-11T10:00:00Z']));} static now(){return instant.getTime();} };
  try {
    add(env,'2026-11-12','10:00'); add(env,'2026-11-13','11:00');
    const batch=env.DB.batch.bind(env.DB); let revoked=false;
    env.DB.batch=async statements => {
      const result=await batch(statements);
      if (!revoked && statements.some(s=>s.sql.includes('AS confirmed_viewings'))) {
        env.DB.raw.prepare("UPDATE listings SET published=0 WHERE id='HE-R001'").run(); revoked=true;
      }
      return result;
    };
    const response=await call(env,'GET','/availability?listing_id=HE-R001');
    assert.equal(revoked,true);
    assert.notEqual(response.status,200);
    assert.equal('confirmed_viewings_this_week' in response.data,false);
  } finally {globalThis.Date=ActualDate;}
});

test('revoking address consent after the snapshot prevents the aggregate response', async () => {
  const {call}=await import('./helpers.mjs');
  const {buildPublicAddressReview}=await import('../../server/public-address.js');
  const env=makeEnv();
  seedListing(env,{title:'Harbour House High Street',road_name:'High Street',parish:'St Saviour'});
  const listing=env.DB.raw.prepare("SELECT * FROM listings WHERE id='HE-R001'").get();
  const details={building_name_or_number:'Harbour House',postcode:'JE2 3AB'};
  const review=await buildPublicAddressReview(listing,details,[],null,'https://hampton.test');
  env.DB.raw.prepare(`INSERT INTO listing_details (listing_id,building_name_or_number,postcode,public_address_snapshot,
    public_address_snapshot_hash,public_address_evidence_ref,public_address_reviewed_by,public_address_reviewed_at)
    VALUES (?,?,?,?,?,?,?,?)`).run('HE-R001',details.building_name_or_number,details.postcode,review.address,review.public_snapshot_hash,
      'fixture-consent','fixture-reviewer','2026-11-01T00:00:00Z');
  const ActualDate=globalThis.Date;
  globalThis.Date=class extends ActualDate {constructor(...args){super(...(args.length?args:['2026-11-11T10:00:00Z']));} static now(){return instant.getTime();}};
  try {
    add(env,'2026-11-12','10:00'); add(env,'2026-11-13','11:00');
    assert.equal((await call(env,'GET','/availability?listing_id=HE-R001')).data.confirmed_viewings_this_week,2);
    const batch=env.DB.batch.bind(env.DB); let revoked=false;
    env.DB.batch=async statements=>{
      const result=await batch(statements);
      if(!revoked && statements.some(s=>s.sql.includes('AS confirmed_viewings'))) {
        env.DB.raw.prepare(`UPDATE listing_details SET public_address_snapshot=NULL,public_address_snapshot_hash=NULL,
          public_address_evidence_ref=NULL,public_address_reviewed_by=NULL,public_address_reviewed_at=NULL WHERE listing_id='HE-R001'`).run();
        revoked=true;
      }
      return result;
    };
    const result=await call(env,'GET','/availability?listing_id=HE-R001');
    assert.equal(revoked,true); assert.notEqual(result.status,200);
    assert.equal('confirmed_viewings_this_week' in result.data,false);
  } finally {globalThis.Date=ActualDate;}
});
