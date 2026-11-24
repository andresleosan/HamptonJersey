// AGE-15: the agencies of the import enter the Advertisers directory by themselves. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, seedListing, seedMedia, call, adminCookie } from './helpers.mjs';
import { AGENCIES, advertiserSyncPass, syncReady } from '../../server/advertiser-sync.js';

const DAY1 = '2026-11-25T06:00:00.000Z', DAY2 = '2026-11-26T06:00:00.000Z', DAY3 = '2026-11-27T06:00:00.000Z';
const rows = env => env.DB.raw.prepare('SELECT * FROM advertisers ORDER BY id').all()
  .map(r => ({ ...r, details: JSON.parse(r.details) }));
const request = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
let media = 0;
const photo = (env, listing_id, provider, over = {}) => seedMedia(env, { id: `M${++media}`, listing_id, provider,
  origin: 'upload', created_by: 'import', r2_key: `uploads/${media}.jpg`, thumb_key: `thumbs/${media}.jpg`, ...over });

function world() {
  const env = makeEnv(); env.AGE15_AUTO_ADVERTISERS_READY = '1';
  for (let n = 28; n < 28 + 105; n++) { const id = `HE-R${String(n).padStart(3, "0")}`; seedListing(env, { id }); photo(env, id, 'Hunt Estates'); }
  photo(env, 'HE-R028', 'Hunt Estates'); // a second photo of the same listing
  seedListing(env, { id: 'HE-R200' }); photo(env, 'HE-R200', 'Red Properties');
  seedListing(env, { id: 'HE-R201' }); photo(env, 'HE-R201', 'Unknown Agency'); // not in the reviewed list
  seedListing(env, { id: 'HE-R001' }); photo(env, 'HE-R001', 'Slomans Estate Agents', { origin: 'external', public: 0 }); // Hampton's
  photo(env, 'HE-R001', 'Hampton Estates', { origin: 'hampton' });
  seedListing(env, { id: 'HE-R005' }); photo(env, 'HE-R005', 'Hunt Estates'); // Hampton's own, outside the import range
  return env;
}

test('the reviewed list holds generic addresses with the page they were read on', () => {
  for (const a of AGENCIES) {
    assert.match(a.email, /^(info|enquiries|hello|help|sales|lettings)@/);
    assert.match(a.url, /^https:\/\//); assert.match(a.read_on, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(syncReady({}), false); assert.equal(syncReady({ AGE15_AUTO_ADVERTISERS_READY: '1' }), true);
  const flag = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').match(/^AGE15_AUTO_ADVERTISERS_READY = "([01])"$/m)?.[1];
  assert.ok(flag('jobs/wrangler.toml'));
});

test('one pass creates each agency with its listings and generic contact; nothing else', async () => {
  const env = world();
  await advertiserSyncPass(env, DAY1);
  const [hunt, red, ...rest] = rows(env);
  assert.equal(rest.length, 0);
  assert.equal(hunt.name, 'Hunt Estates'); assert.equal(hunt.kind, 'agency');
  assert.equal(hunt.details.listing_ids.length, 105); assert.equal(hunt.details.listing_ids[0], 'HE-R028');
  assert.deepEqual(hunt.details.contacts, [{ name: 'General enquiries', email: 'enquiries@huntestates.com', phones: [] }]);
  assert.deepEqual(red.details.listing_ids, ['HE-R200']);
  assert.deepEqual(Object.keys(hunt.details).sort(), ['channels', 'commission', 'contacts', 'listing_ids', 'photo_permission', 'source_ids']);
  // The directory opens and saves an advertiser of more than 100 listings.
  const got = await request(env, 'GET', `/admin/advertisers/${hunt.id}`);
  assert.equal(got.status, 200);
  const saved = await request(env, 'PUT', `/admin/advertisers/${hunt.id}`, { ...got.data.advertiser });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.deepEqual((await request(env, 'GET', '/admin/advertisers?listing_id=HE-R200')).data.advertisers.map(a => a.name), ['Red Properties']);
});

test('later passes only add: same day nothing, a person\'s edits stay, a new listing joins', async () => {
  const env = world();
  await advertiserSyncPass(env, DAY1);
  await advertiserSyncPass(env, DAY1);
  assert.equal(rows(env).length, 2);
  const hunt = rows(env)[0];
  const edited = { ...hunt.details, listing_ids: hunt.details.listing_ids.slice(1), contacts: [] };
  env.DB.raw.prepare('UPDATE advertisers SET name=?, details=?, version=version+1 WHERE id=?').run('Hunt Estates (Christie\'s)', JSON.stringify(edited), hunt.id);
  await advertiserSyncPass(env, DAY2);
  const after = rows(env)[0];
  assert.equal(rows(env).length, 2); assert.equal(after.name, 'Hunt Estates (Christie\'s)');
  assert.equal(after.version, hunt.version + 1); assert.deepEqual(after.details, edited);
  seedListing(env, { id: 'HE-R250' }); photo(env, 'HE-R250', 'Hunt Estates');
  await advertiserSyncPass(env, DAY3);
  const last = rows(env)[0];
  assert.deepEqual(last.details.listing_ids, [...edited.listing_ids, 'HE-R250']);
  assert.deepEqual(last.details.contacts, []); assert.equal(last.version, after.version + 1);
});

test('an advertiser whose data was removed is neither touched nor created again', async () => {
  const env = world();
  await advertiserSyncPass(env, DAY1);
  const red = rows(env)[1];
  env.DB.raw.prepare("UPDATE advertisers SET name='Removed', suppressed_at='2026-11-25' WHERE id=?").run(red.id);
  seedListing(env, { id: 'HE-R202' }); photo(env, 'HE-R202', 'Red Properties');
  await advertiserSyncPass(env, DAY2);
  assert.equal(rows(env).length, 2);
  assert.deepEqual(rows(env)[1].details.listing_ids, ['HE-R200']);
});
