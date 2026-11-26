import test from 'node:test';
import assert from 'node:assert/strict';
import { adminCookie, call, makeEnv, seedListing } from './listing-client.mjs';

const path = '/admin/listings/import';
function advert(unit, extras = {}) {
  const address = `${unit} Maisons Les Arches`;
  return { url: `https://www.example.je/PropertyDetail?id=1396_${unit}`, title: address,
    identity: address, location: `${address}, St Helier`, parish: 'St Helier', source: 'Agency',
    operation: 'sale', use: 'residential', price: 255000, availability: 'Available', verified: true, ...extras };
}

test('listing CSV preview does not write and holds incomplete, ambiguous and closed rows', async () => {
  const env = makeEnv(), cookie = await adminCookie();
  const rows = [advert(148), advert(171), advert(174, { verified: false }),
    advert(186, { availability: 'Under offer' }), advert(148, { url: 'https://agency.example/148' })];
  const preview = await call(env, 'POST', path, { cookie, body: { mode: 'preview', rows } });
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.data.results.map(r => r.status), ['review','ready','review','review','review']);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM listings').get().n, 0);
  assert.equal((await call(env, 'POST', path, { body: { mode: 'apply', rows: [rows[1]] } })).status, 401);
});

test('listing CSV creates distinct units, preserves a missing price, and replays as existing', async () => {
  const env = makeEnv(), cookie = await adminCookie();
  const rows = [advert(148), advert(171, { price: null, availability: 'Available Off-Plan' })];
  const apply = rows => call(env, 'POST', path, { cookie, body: { mode: 'apply', rows } });
  const first = await apply(rows);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.results.map(r => r.status), ['created','created']);
  const aliases = await apply([advert(148, { url: 'http://example.je/PropertyDetail?utm_source=test&id=1396_148' }),
    advert(171, { url: 'https://agency.example/171', title: 'Apartment 171, Maisons Les Arches' })]);
  assert.deepEqual(aliases.data.results.map(r => r.status), ['existing','existing']);
  assert.deepEqual(aliases.data.results.map(r => r.listingId), first.data.results.map(r => r.listingId));
  const saved = env.DB.raw.prepare('SELECT published,matchable,viewings_enabled,sale_price,description FROM listings ORDER BY id').all();
  assert.deepEqual(saved.map(r => [r.published,r.matchable,r.viewings_enabled,r.sale_price]), [[0,0,0,255000],[0,0,0,null]]);
  assert.match(saved[0].description, /1396_148/);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM events WHERE type='listing.created'").get().n, 2);
});

test('listing CSV detects legacy URLs and addresses, and refuses unsupported claims', async () => {
  const env = makeEnv(), cookie = await adminCookie();
  seedListing(env, { title: 'Apartment 148, Maisons Les Arches', parish: 'St Helier', location: 'St Helier' });
  env.DB.raw.prepare('INSERT INTO research_sources(source_id,property_id,url) VALUES(?,?,?)')
    .run('legacy-source', 'HE-R001', 'https://agency.example/a148');
  const results = await call(env, 'POST', path, { cookie, body: { mode: 'preview', rows: [
    advert(148, { url: 'https://agency.example/a148' }), advert(148), advert(171, { hampton_code: 'HE-R001' })
  ] } });
  assert.deepEqual(results.data.results.map(r => [r.status, r.listingId]), [
    ['existing','HE-R001'], ['existing','HE-R001'], ['review',undefined]
  ]);
});

test('two import requests for the same address cannot both create drafts', async () => {
  const env = makeEnv(), cookie = await adminCookie();
  const run = row => call(env, 'POST', path, { cookie, body: { mode: 'apply', rows: [row] } });
  const result = await Promise.all([run(advert(148)), run(advert(148, { url: 'https://other.example/a148' }))]);
  assert.deepEqual(result.map(r => r.data.results[0].status).sort(), ['created','existing']);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM listings').get().n, 1);
});

test('listing CSV reads structured addresses and keeps generic title matches in review', async () => {
  const env = makeEnv(), cookie = await adminCookie();
  seedListing(env, { title: 'Bright apartment overlooking the bay', parish: 'St Helier', location: 'St Helier', road_name: 'Queen Street' });
  env.DB.raw.prepare('INSERT INTO listing_details(listing_id,building_name_or_number) VALUES(?,?)')
    .run('HE-R001', 'Apartment 101, Queens Gate');
  const rows = [
    advert(101, { title: 'Queens Gate, Apartment 101', identity: 'Apartment 101, Queens Gate', location: 'Apartment 101, Queens Gate, Queen Street, St Helier' }),
    advert(120, { title: 'Bright apartment overlooking the bay', identity: '12 Belle Avenue', location: '12 Belle Avenue, St Helier' }),
    advert(130, { operation: 'rent', use: 'commercial', rent_period: 'year', availability: 'To Let' }),
  ];
  const preview = await call(env, 'POST', path, { cookie, body: { mode: 'preview', rows } });
  assert.deepEqual(preview.data.results.map(r => r.status), ['existing','review','review']);
  assert.equal(preview.data.results[0].listingId, 'HE-R001');
  assert.match(preview.data.results[2].reason, /commercial rentals/);
});
