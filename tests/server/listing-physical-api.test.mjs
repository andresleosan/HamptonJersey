import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedListing, adminCookie, call, T0 } from './helpers.mjs';

test('staff physical facts persist, appear in history and survive text edits', async () => {
  const env = makeEnv();
  seedListing(env, { confirmed_at: T0, description: 'No pets. Parking for 2 cars.' });
  const cookie = await adminCookie();
  const saved = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, interior_area_sqft: 1000, separate_wcs: 0, has_lift: 0, heating_types: [],
    feature_overrides: { pets: 'yes', parking: 0 },
  } });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.data.listing.separate_wcs, 0);
  assert.deepEqual(saved.data.listing.heating_types, []);
  assert.deepEqual(saved.data.listing.feature_overrides, { pets: 'yes', parking: 0 });
  assert.equal(saved.data.listing.feat_pets, 'yes');
  assert.equal(saved.data.listing.feat_parking, 0);
  assert.equal(saved.data.listing.confirmed_at, T0);
  const evidence = JSON.parse(saved.data.listing.feat_evidence);
  assert.deepEqual(evidence._requirements.parking, { value: 0, kind: 'exact' });
  const again = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: saved.data.listing.updated_at, description: 'No pets. Parking for 4 cars.'
  } });
  assert.equal(again.status, 200, again.text);
  assert.equal(again.data.listing.feat_pets, 'yes');
  assert.equal(again.data.listing.feat_parking, 0);
  const events = env.DB.raw.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id='HE-R001' ORDER BY id").all().map(r => JSON.parse(r.data));
  const event = events.find(e => e.fields.includes('feature_overrides'));
  assert.deepEqual(event.after.feature_overrides, { pets: 'yes', parking: 0 });
  assert.deepEqual(event.after.heating_types, []);
});

test('cross-field errors and stale writes do not change stored physical facts', async () => {
  const env = makeEnv(); seedListing(env); const cookie = await adminCookie();
  const bad = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, floor_level: 1, building_floors: 1, separate_wcs: 0,
  } });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.floor_level);
  assert.equal(env.DB.raw.prepare("SELECT separate_wcs FROM listings WHERE id='HE-R001'").get().separate_wcs, null);
});

test('recalculation preserves staff facts and the editor version', async () => {
  const env = makeEnv(); seedListing(env); const cookie = await adminCookie();
  const saved = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, description: 'No pets. Parking for 3 cars.', feature_overrides: { pets: null, parking: 1 },
  } });
  assert.equal(saved.status, 200, saved.text);
  const recalculated = await call(env, 'POST', '/admin/matches/recalculate', { cookie, body: { phase: 'listings' } });
  assert.equal(recalculated.status, 200, recalculated.text);
  const listing = (await call(env, 'GET', '/admin/listings/HE-R001', { cookie })).data.listing;
  assert.equal(listing.updated_at, saved.data.listing.updated_at);
  assert.equal(listing.feat_pets, null); assert.equal(listing.feat_parking, 1);
  assert.deepEqual(JSON.parse(listing.feat_evidence)._requirements.parking, { value: 1, kind: 'exact' });
  const reset = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: listing.updated_at, feature_overrides: null,
  } });
  assert.equal(reset.status, 200, reset.text);
  assert.equal(reset.data.listing.feat_pets, 'no'); assert.equal(reset.data.listing.feat_parking, 3);
});

test('stale edits are rejected and the public shape does not expose physical fields', async () => {
  const env = makeEnv(); seedListing(env); const cookie = await adminCookie();
  const saved = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: { updated_at: T0, separate_wcs: 0 } });
  assert.equal(saved.status, 200, saved.text);
  const stale = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: { updated_at: T0, separate_wcs: 2 } });
  assert.equal(stale.status, 409);
  assert.equal(env.DB.raw.prepare("SELECT separate_wcs FROM listings WHERE id='HE-R001'").get().separate_wcs, 0);
  const { toPublic } = await import('../../server/listing.js');
  const listing = (await call(env, 'GET', '/admin/listings/HE-R001', { cookie })).data.listing;
  const publicListing = toPublic({ ...listing, specs: JSON.stringify(listing.specs) }, []);
  assert.equal(Object.hasOwn(publicListing, 'separate_wcs'), false);
  assert.equal(Object.hasOwn(publicListing, 'feature_overrides'), false);
});

test('failed audit event rolls back manual facts, projections and version', async () => {
  const env = makeEnv(); seedListing(env); const cookie = await adminCookie();
  env.DB.raw.exec("CREATE TRIGGER reject_physical_event BEFORE INSERT ON events WHEN NEW.entity_type='listing' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  const failed = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, separate_wcs: 0, feature_overrides: { pets: 'yes' },
  } });
  assert.equal(failed.status, 500);
  const row = env.DB.raw.prepare("SELECT separate_wcs,feature_overrides,feat_pets,updated_at FROM listings WHERE id='HE-R001'").get();
  assert.equal(row.separate_wcs, null); assert.equal(row.feature_overrides, '{}');
  assert.equal(row.feat_pets, null); assert.equal(row.updated_at, T0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_event_context').get().n, 0);
});

test('queue source cannot present imported facts as staff confirmation', async () => {
  const env = makeEnv();
  const { createListing } = await import('../../server/routes/listings.js');
  const response = await createListing(env, 'admin@example.test', { title: 'Fixture', use: 'residential', operation: 'sale',
    availability: 'for_sale', feature_overrides: { pets: 'yes' } }, { source: 'queue' });
  assert.equal(response.status, 400);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listings').get().n, 0);
});

test('physical migration preserves existing rows and foreign keys', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { readdirSync, readFileSync } = await import('node:fs');
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  const dir = new URL('../../migrations/', import.meta.url);
  for (const name of readdirSync(dir).filter(name => name.endsWith('.sql') && name < '0041').sort())
    db.exec(readFileSync(new URL(name, dir), 'utf8'));
  db.exec("INSERT INTO listings(id,title,use,operation,availability,created_at,updated_at,updated_by,specs) VALUES ('HE-R999','Fixture','residential','sale','for_sale','2026-01-01','2026-01-01','fixture','[]')");
  db.exec(readFileSync(new URL('0041_listing_physical.sql', dir), 'utf8'));
  const row = db.prepare("SELECT title,feature_overrides,interior_area_sqft FROM listings WHERE id='HE-R999'").get();
  assert.equal(row.title, 'Fixture'); assert.equal(row.feature_overrides, '{}'); assert.equal(row.interior_area_sqft, null);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});
