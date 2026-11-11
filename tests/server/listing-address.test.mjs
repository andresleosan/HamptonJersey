import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedListing, seedMedia, adminCookie, call, T0 } from './helpers.mjs';
import { toPublic } from '../../server/listing.js';
import { exactAddressErrors, formatExactAddress } from '../../server/listing-details.js';
import { listingPage } from '../../server/seo.js';
import { headTags } from '../../server/listing-meta.js';

const ADMIN = 'admin@example.test';
async function setup() {
  const env = makeEnv();
  seedListing(env, { published: 0, confirmed_at: T0 });
  return { env, cookie: await adminCookie() };
}

test('PUB-04: private listing details are returned only by the authenticated admin detail route', async () => {
  const { env, cookie } = await setup();
  assert.equal((await call(env, 'GET', '/admin/listings/HE-R001')).status, 401);
  const response = await call(env, 'GET', '/admin/listings/HE-R001', { cookie });
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.details, {
    building_name_or_number: null, postcode: null, property_condition: null, developer_name: null, public_address_snapshot: null,
    public_address_snapshot_hash: null, public_address_evidence_ref: null, public_address_reviewed_by: null, public_address_reviewed_at: null,
  });
});

test('PUB-04: Jersey postcode is normalized and the shared condition and developer are stored internally', async () => {
  const { env, cookie } = await setup();
  const response = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0,
    details: { building_name_or_number: ' Flat 2 ', postcode: 'je23ab', property_condition: 'new_build', developer_name: 'Example Homes' },
  } });
  assert.equal(response.status, 200, response.text);
  assert.deepEqual(response.data.details, {
    building_name_or_number: 'Flat 2', postcode: 'JE2 3AB', property_condition: 'new_build', developer_name: 'Example Homes',
    public_address_snapshot: null, public_address_snapshot_hash: null, public_address_evidence_ref: null,
    public_address_reviewed_by: null, public_address_reviewed_at: null,
  });
  assert.equal(response.data.listing.confirmed_at, T0);
});

test('PUB-04: postcode format and condition enum errors are field-specific', async () => {
  const { env, cookie } = await setup();
  const postcode = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: { postcode: 'JE2 3ZZZ' },
  } });
  assert.equal(postcode.status, 400);
  assert.ok(postcode.data.fields.postcode);
  const condition = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: { property_condition: 'nearly_new' },
  } });
  assert.equal(condition.status, 400);
  assert.ok(condition.data.fields.property_condition);
});

test('PUB-04: developer name can be added only when condition is new build', async () => {
  const { env, cookie } = await setup();
  const rejected = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: { developer_name: 'Fixture Developer' },
  } });
  assert.equal(rejected.status, 400);
  assert.ok(rejected.data.fields.developer_name);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM listing_details').get().n, 0);

  const accepted = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: { property_condition: 'new_build', developer_name: 'Fixture Developer' },
  } });
  assert.equal(accepted.status, 200, accepted.text);
  assert.equal(accepted.data.details.developer_name, 'Fixture Developer');
});

test('PUB-04: a foreign postcode is not forced into the Jersey format', async () => {
  const { env, cookie } = await setup();
  const response = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, country: 'France', details: { postcode: '750 01' },
  } });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.data.details.postcode, '750 01');
});

test('PUB-04: event history records private field names and condition values, never address contents', async () => {
  const { env, cookie } = await setup();
  const response = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0,
    details: { building_name_or_number: 'Fixture Place', postcode: 'JE1 1AA', property_condition: 'new_build', developer_name: 'Fixture Builder' },
  } });
  assert.equal(response.status, 200, response.text);
  const event = env.DB.raw.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id='HE-R001'").get();
  const data = JSON.parse(event.data);
  assert.ok(data.fields.includes('building_name_or_number'));
  assert.ok(data.fields.includes('postcode'));
  assert.ok(data.fields.includes('developer_name'));
  assert.equal(data.before.property_condition, null);
  assert.equal(data.after.property_condition, 'new_build');
  const serialized = JSON.stringify(data);
  assert.equal(serialized.includes('Fixture Place'), false);
  assert.equal(serialized.includes('JE1 1AA'), false);
  assert.equal(serialized.includes('Fixture Builder'), false);
  const history = await call(env, 'GET', '/admin/listings/HE-R001/history', { cookie });
  assert.equal(history.status, 200);
  assert.ok(history.data.items[0].changes.some(change => change.field === 'building_name_or_number'));
  const condition = history.data.items[0].changes.find(change => change.field === 'property_condition');
  assert.deepEqual(condition, { field: 'property_condition', derived: false, before: null, after: 'new_build' });
  const verified = await call(env, 'POST', '/admin/listings/HE-R001/history/validate', { cookie, body: { ids: [history.data.items[0].id] } });
  assert.equal(verified.status, 200);
  assert.equal(JSON.stringify(history.data).includes('Fixture Place'), false);
  assert.equal(JSON.stringify(history.data).includes('JE1 1AA'), false);
  assert.equal(JSON.stringify(history.data).includes('Fixture Builder'), false);
});

test('PUB-04: detail-only edits preserve unknown and do not expose details through the public projection', async () => {
  const { env, cookie } = await setup();
  const response = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: { building_name_or_number: 'Internal label', property_condition: 'good' },
  } });
  assert.equal(response.status, 200, response.text);
  const publicListing = toPublic({
    ...response.data.listing, specs: '[]', active_interest: 0,
    building_name_or_number: response.data.details.building_name_or_number,
    postcode: response.data.details.postcode,
    property_condition: response.data.details.property_condition,
    developer_name: response.data.details.developer_name,
  }, []);
  assert.equal('details' in publicListing, false);
  assert.equal('building_name_or_number' in publicListing, false);
  assert.equal('postcode' in publicListing, false);
  assert.equal('property_condition' in publicListing, false);
  assert.equal('developer_name' in publicListing, false);
});

test('PUB-04: developer is retained when condition changes, and a no-op does not add history', async () => {
  const { env, cookie } = await setup();
  const first = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: { property_condition: 'new_build', developer_name: 'Fixture Builder' },
  } });
  assert.equal(first.status, 200, first.text);
  const afterFirst = first.data.listing.updated_at;
  const second = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: afterFirst, details: { property_condition: 'existing' },
  } });
  assert.equal(second.status, 200, second.text);
  assert.equal(second.data.details.property_condition, 'existing');
  assert.equal(second.data.details.developer_name, 'Fixture Builder');
  assert.notEqual(second.data.listing.updated_at, afterFirst);
  const eventCount = env.DB.raw.prepare("SELECT count(*) AS n FROM events WHERE entity_type='listing'").get().n;
  const third = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: second.data.listing.updated_at, details: {
      property_condition: second.data.details.property_condition, developer_name: second.data.details.developer_name,
    },
  } });
  assert.equal(third.status, 200, third.text);
  assert.equal(third.data.listing.updated_at, second.data.listing.updated_at);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM events WHERE entity_type='listing'").get().n, eventCount);
});

test('PUB-04: stale or failed detail writes leave both data and event history unchanged', async () => {
  const { env, cookie } = await setup();
  const stale = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: '2026-10-06T10:00:00.000Z', details: { building_name_or_number: 'Stale value' },
  } });
  assert.equal(stale.status, 409);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM listing_details').get().n, 0);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM events WHERE entity_type='listing'").get().n, 0);

  env.DB.raw.exec("CREATE TRIGGER fail_listing_address_event BEFORE INSERT ON events WHEN NEW.type='listing.updated' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  const failed = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: { building_name_or_number: 'Rollback value', property_condition: 'good' },
  } });
  assert.equal(failed.status, 500);
  assert.equal(env.DB.raw.prepare('SELECT updated_at FROM listings WHERE id=?').get('HE-R001').updated_at, T0);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM listing_details').get().n, 0);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM events WHERE entity_type='listing'").get().n, 0);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM listing_event_context').get().n, 0);
});

test('PUB-04: switching an existing foreign listing to Jersey revalidates its retained postcode', async () => {
  const { env, cookie } = await setup();
  const foreign = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, country: 'France', details: { postcode: '750 01' },
  } });
  assert.equal(foreign.status, 200, foreign.text);
  const jersey = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: foreign.data.listing.updated_at, country: 'Jersey',
  } });
  assert.equal(jersey.status, 400);
  assert.ok(jersey.data.fields.postcode);
  assert.equal((await call(env, 'GET', '/admin/listings/HE-R001', { cookie })).data.details.postcode, '750 01');
});

test('PUB-04: address write follows the successful CAS when the listing clock is ahead of wall time', async () => {
  const { env, cookie } = await setup();
  const ahead = '2099-12-31T23:59:59.000Z';
  env.DB.raw.prepare('UPDATE listings SET updated_at=? WHERE id=?').run(ahead, 'HE-R001');
  const response = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: ahead, details: { building_name_or_number: 'Clock-safe fixture' },
  } });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.data.details.building_name_or_number, 'Clock-safe fixture');
  assert.ok(response.data.listing.updated_at > ahead);
});

test('PUB-04: exact address publication requires reviewed full snapshot and unpublish/archive clear approval', async () => {
  const { env, cookie } = await setup();
  env.SITE_URL = 'https://hampton.test';
  const address = { building_name_or_number: 'Harbour House', postcode: 'je23ab' };
  env.DB.raw.prepare(`UPDATE listings SET published=1,road_name='High Street',location='St Saviour',parish='St Saviour',
    title='Family home in St Saviour' WHERE id=?`).run('HE-R001');
  seedMedia(env);
  const legacy = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: address, address_publication: 'publish',
  } });
  assert.equal(legacy.status, 400);
  assert.ok(legacy.data.fields.address_publication);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM listing_details').get().n, 0);

  const published = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: address,
  } });
  assert.equal(published.status, 200, published.text);
  assert.deepEqual(exactAddressErrors(published.data.listing, published.data.details), {});
  const preview = await call(env, 'GET', '/admin/listings/HE-R001/address-review', { cookie });
  assert.equal(preview.status, 200, preview.text);
  assert.equal(preview.data.expected_at, published.data.listing.updated_at);
  assert.equal(preview.data.preview.listing.exactAddress, 'Harbour House, High Street, St Saviour, JE2 3AB, Jersey');
  assert.equal(formatExactAddress(published.data.listing, published.data.details), preview.data.preview.listing.exactAddress);
  const unchecked = await call(env, 'POST', '/admin/listings/HE-R001/address-review', { cookie, body: {
    action: 'authorize', expected_at: preview.data.expected_at, public_snapshot_hash: preview.data.public_snapshot_hash,
    address_publication_authorized: false, evidence_ref: 'fixture:owner-consent-1',
  } });
  assert.equal(unchecked.status, 400);
  assert.ok(unchecked.data.fields.address_publication_authorized);
  const noEvidence = await call(env, 'POST', '/admin/listings/HE-R001/address-review', { cookie, body: {
    action: 'authorize', expected_at: preview.data.expected_at, public_snapshot_hash: preview.data.public_snapshot_hash,
    address_publication_authorized: true, evidence_ref: '',
  } });
  assert.equal(noEvidence.status, 400);
  assert.ok(noEvidence.data.fields.evidence_ref);
  const approved = await call(env, 'POST', '/admin/listings/HE-R001/address-review', { cookie, body: {
    action: 'authorize', expected_at: preview.data.expected_at, public_snapshot_hash: preview.data.public_snapshot_hash,
    address_publication_authorized: true, evidence_ref: 'fixture:owner-consent-1',
  } });
  assert.equal(approved.status, 200, approved.text);
  assert.equal(approved.data.details.public_address_snapshot, preview.data.preview.listing.exactAddress);
  assert.equal(approved.data.details.public_address_snapshot_hash, preview.data.public_snapshot_hash);
  assert.equal(approved.data.details.public_address_evidence_ref, 'fixture:owner-consent-1');
  assert.equal(approved.data.details.public_address_reviewed_by, ADMIN);
  assert.ok(approved.data.details.public_address_reviewed_at);

  const event = env.DB.raw.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id=? ORDER BY id DESC LIMIT 1")
    .get('HE-R001');
  const eventData = JSON.parse(event.data);
  assert.ok(eventData.fields.includes('public_address_publication'));
  assert.equal(JSON.stringify(eventData).includes('Harbour House'), false);
  assert.equal(JSON.stringify(eventData).includes('fixture:owner-consent-1'), false);
  const history = await call(env, 'GET', '/admin/listings/HE-R001/history', { cookie });
  assert.equal(history.status, 200);
  assert.equal(JSON.stringify(history.data).includes('Harbour House'), false);

  const publicResponse = await call(env, 'GET', '/listings');
  assert.equal(publicResponse.data[0].exactAddress, approved.data.details.public_address_snapshot);
  assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
  const page = await listingPage(new Request('https://hampton.test/p/HE-R001'), env, 'HE-R001');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.head, headTags(preview.data.preview.seo), 'OG, canonical and JSON-LD match the reviewed preview');
  assert.match(page.head, /Harbour House, High Street, St Saviour, JE2 3AB, Jersey/);

  const privateEdit = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: approved.data.listing.updated_at, details: { building_name_or_number: 'Harbour Court' },
  } });
  assert.equal(privateEdit.status, 200, privateEdit.text);
  assert.equal(privateEdit.data.details.public_address_snapshot, approved.data.details.public_address_snapshot);
  const stalePreview = await call(env, 'GET', '/admin/listings/HE-R001/address-review', { cookie });
  assert.equal(stalePreview.data.existing_review.valid_for_current_content, false);
  const staleApproval = await call(env, 'POST', '/admin/listings/HE-R001/address-review', { cookie, body: {
    action: 'authorize', expected_at: preview.data.expected_at, public_snapshot_hash: preview.data.public_snapshot_hash,
    address_publication_authorized: true, evidence_ref: 'fixture:owner-consent-2',
  } });
  assert.equal(staleApproval.status, 409);
  const afterAddressEdit = await call(env, 'GET', '/listings');
  assert.equal('exactAddress' in afterAddressEdit.data[0], false);

  const off = await call(env, 'POST', '/admin/listings/HE-R001/unpublish', { cookie, body: {
    updated_at: privateEdit.data.listing.updated_at,
  } });
  assert.equal(off.status, 200, off.text);
  assert.equal(off.data.details.public_address_snapshot, null);
  assert.equal(off.data.details.public_address_evidence_ref, null);
  assert.deepEqual((await call(env, 'GET', '/listings')).data, []);

  const republish = await call(env, 'POST', '/admin/listings/HE-R001/publish', { cookie, body: {
    updated_at: off.data.listing.updated_at,
  } });
  assert.equal(republish.status, 200, republish.text);
  const secondPreview = await call(env, 'GET', '/admin/listings/HE-R001/address-review', { cookie });
  const optedAgain = await call(env, 'POST', '/admin/listings/HE-R001/address-review', { cookie, body: {
    action: 'authorize', expected_at: secondPreview.data.expected_at, public_snapshot_hash: secondPreview.data.public_snapshot_hash,
    address_publication_authorized: true, evidence_ref: 'fixture:owner-consent-3',
  } });
  assert.equal(optedAgain.status, 200, optedAgain.text);
  const archived = await call(env, 'POST', '/admin/listings/HE-R001/archive', { cookie, body: {
    updated_at: optedAgain.data.listing.updated_at,
  } });
  assert.equal(archived.status, 200, archived.text);
  assert.equal(archived.data.details.public_address_snapshot, null);
  assert.equal(archived.data.details.public_address_snapshot_hash, null);
});

test('PUB-04: public address review previews all public surfaces and Drive folder title before authorization', async () => {
  const { env, cookie } = await setup();
  env.SITE_URL = 'https://hampton.test';
  env.DB.raw.prepare("UPDATE listings SET published=1,road_name='High Street',title='Harbour House, High Street' WHERE id=?")
    .run('HE-R001');
  seedMedia(env);
  const saved = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: { building_name_or_number: 'Harbour House', postcode: 'JE2 3AB' },
  } });
  assert.equal(saved.status, 200, saved.text);
  const preview = await call(env, 'GET', '/admin/listings/HE-R001/address-review', { cookie });
  assert.equal(preview.status, 200, preview.text);
  assert.match(preview.data.public_snapshot_hash, /^[a-f0-9]{64}$/);
  assert.equal(preview.data.preview.listing.exactAddress, 'Harbour House, High Street, St Saviour, JE2 3AB, Jersey');
  assert.match(preview.data.preview.listing.title, /Harbour House/);
  assert.match(preview.data.preview.seo.title, /Harbour House/);
  assert.match(preview.data.preview.seo.jsonLd, /streetAddress/);
  assert.equal(preview.data.preview.drive_folder_name, null);
  assert.equal(JSON.stringify(preview.data).includes('public_address_evidence_ref'), false);
  assert.equal(preview.data.expected_at, saved.data.listing.updated_at);
  assert.equal((await listingPage(new Request('https://hampton.test/p/HE-R001'), env, 'HE-R001')).status, 404,
    'the unreviewed address in title hides the public page');
});

test('PUB-04 address_in_title_not_bypass: public text containing building and road stays hidden until reviewed', async () => {
  const { env, cookie } = await setup();
  env.SITE_URL = 'https://hampton.test';
  env.DB.raw.prepare(`UPDATE listings SET published=1,road_name='High Street',location='St Saviour',parish='St Saviour',
    title='Harbour House, High Street' WHERE id=?`).run('HE-R001');
  seedMedia(env);
  const saved = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, details: { building_name_or_number: 'Harbour House', postcode: 'JE2 3AB' },
  } });
  assert.equal(saved.status, 200, saved.text);
  assert.deepEqual((await call(env, 'GET', '/listings')).data, [], 'the title cannot publish an address without review');
  assert.equal((await listingPage(new Request('https://hampton.test/p/HE-R001'), env, 'HE-R001')).status, 404);

  const preview = await call(env, 'GET', '/admin/listings/HE-R001/address-review', { cookie });
  assert.equal(preview.status, 200, preview.text);
  const approved = await call(env, 'POST', '/admin/listings/HE-R001/address-review', { cookie, body: {
    action: 'authorize', expected_at: preview.data.expected_at, public_snapshot_hash: preview.data.public_snapshot_hash,
    address_publication_authorized: true, evidence_ref: 'fixture:owner-consent-title',
  } });
  assert.equal(approved.status, 200, approved.text);
  assert.equal((await call(env, 'GET', '/listings')).data[0].exactAddress, approved.data.details.public_address_snapshot);

  const changed = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: approved.data.listing.updated_at, title: 'Harbour House, High Street — newly renovated',
  } });
  assert.equal(changed.status, 200, changed.text);
  assert.deepEqual((await call(env, 'GET', '/listings')).data, [], 'stale approval cannot leave an address in public title');
});

test('PUB-04 drive_folder_address_review: changing the linked Drive title invalidates the preview hash', async () => {
  const { env, cookie } = await setup();
  env.DB.raw.prepare('UPDATE listings SET published=1,drive_folder_id=? WHERE id=?').run('pub04-folder', 'HE-R001');
  env.DB.raw.prepare(`INSERT INTO drive_imports (folder_id,folder_name,status,listing_id,requested_by,created_at)
    VALUES (?,?, 'ready', ?, ?, ?)`).run('pub04-folder', 'Harbour House - High Street', 'HE-R001', ADMIN, T0);
  seedMedia(env);
  const saved = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, road_name: 'High Street', details: { building_name_or_number: 'Harbour House', postcode: 'JE2 3AB' },
  } });
  assert.equal(saved.status, 200, saved.text);
  const preview = await call(env, 'GET', '/admin/listings/HE-R001/address-review', { cookie });
  assert.equal(preview.data.preview.drive_folder_name, 'Harbour House - High Street');
  env.DB.raw.prepare("UPDATE drive_imports SET folder_name='Updated Harbour folder' WHERE folder_id=?").run('pub04-folder');
  const stale = await call(env, 'POST', '/admin/listings/HE-R001/address-review', { cookie, body: {
    action: 'authorize', expected_at: preview.data.expected_at, public_snapshot_hash: preview.data.public_snapshot_hash,
    address_publication_authorized: true, evidence_ref: 'fixture:owner-consent-drive',
  } });
  assert.equal(stale.status, 409);
  assert.equal(env.DB.raw.prepare('SELECT public_address_snapshot FROM listing_details WHERE listing_id=?').get('HE-R001').public_address_snapshot, null);
  const refreshed = await call(env, 'GET', '/admin/listings/HE-R001/address-review', { cookie });
  assert.equal(refreshed.data.preview.drive_folder_name, 'Updated Harbour folder');
  assert.notEqual(refreshed.data.public_snapshot_hash, preview.data.public_snapshot_hash);
});
