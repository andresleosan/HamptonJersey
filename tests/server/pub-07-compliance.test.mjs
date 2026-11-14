// PUB-07: staff-only legal and technical compliance of a listing. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateListing, checkCompliance, toPublic, COMPLIANCE_FIELDS } from '../../server/listing.js';
import { updateListingEvent } from '../../server/listing-events.js';
import { extractFeatures } from '../../server/listing-features.js';
import { makeEnv, seedListing, seedMedia, adminCookie, call, T0 } from './helpers.mjs';

const ID = 'HE-R001', PATH = `/admin/listings/${ID}`, REF = 'LIC-FIXTURE-0001';
async function world({ enabled = true, schema } = {}) {
  const env = makeEnv(schema); seedListing(env);
  if (enabled) env.PUB07_COMPLIANCE_READY = '1';
  return { env, cookie: await adminCookie() };
}
const events = env => env.DB.raw.prepare("SELECT data FROM events WHERE entity_type='listing' ORDER BY id").all().map(r => JSON.parse(r.data));

test('compliance values validate only when the family is enabled, and unknown is a stored value', () => {
  const input = { occupancy: 'tenanted', rental_licence: 'provided', rental_licence_ref: ` ${REF} `, rental_licence_valid_until: '2027-06-30',
    energy_certificate: 'unknown', energy_certificate_ref: null, energy_certificate_valid_until: '' };
  assert.deepEqual(validateListing(input, { partial: true }).value, {});
  assert.deepEqual(validateListing(input, { partial: true, compliance: true }).value, { occupancy: 'tenanted', rental_licence: 'provided',
    rental_licence_ref: REF, rental_licence_valid_until: '2027-06-30', energy_certificate: 'unknown', energy_certificate_ref: null,
    energy_certificate_valid_until: null });
  assert.equal(validateListing({ occupancy: '' }, { partial: true, compliance: true }).value.occupancy, 'unknown');
  const bad = validateListing({ occupancy: 'no', rental_licence: 'yes', energy_certificate: 'A', rental_licence_ref: 'x'.repeat(101),
    energy_certificate_valid_until: '2027-02-30' }, { partial: true, compliance: true }).errors;
  assert.deepEqual(Object.keys(bad).sort(), ['energy_certificate', 'energy_certificate_valid_until', 'occupancy', 'rental_licence', 'rental_licence_ref']);
});

test('a status follows its evidence: no reference is unknown, a reference is provided, verified also needs its expiry date', () => {
  const row = over => ({ rental_licence: 'unknown', energy_certificate: 'unknown', ...over });
  assert.deepEqual(checkCompliance(row({})), {});
  assert.deepEqual(checkCompliance(row({ rental_licence: 'not_applicable' })), {});
  assert.ok(checkCompliance(row({ rental_licence: 'provided' })).rental_licence_ref, 'missing_doc_unknown');
  assert.deepEqual(checkCompliance(row({ rental_licence: 'provided', rental_licence_ref: REF })), {}, 'provided_not_verified');
  assert.ok(checkCompliance(row({ energy_certificate: 'verified', energy_certificate_ref: REF })).energy_certificate_valid_until, 'forged_verified_denied');
  assert.ok(checkCompliance(row({ energy_certificate: 'verified', energy_certificate_valid_until: '2030-01-01' })).energy_certificate_ref);
  assert.deepEqual(checkCompliance(row({ energy_certificate: 'verified', energy_certificate_ref: REF, energy_certificate_valid_until: '2030-01-01' })), {});
  assert.ok(checkCompliance(row({ rental_licence_ref: REF })).rental_licence_ref, 'a reference never stays under unknown');
  assert.ok(checkCompliance(row({ energy_certificate: 'not_applicable', energy_certificate_valid_until: '2030-01-01' })).energy_certificate_valid_until);
});

test('switched off, with or without migration 0061, the editor API works as before', async () => {
  for (const schema of [{ through: 60 }, {}]) {
    const { env, cookie } = await world({ enabled: false, schema });
    const detail = await call(env, 'GET', PATH, { cookie });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.compliance_tracking, undefined);
    assert.equal(Object.hasOwn(detail.data, 'seller_solicitor'), false);
    const saved = await call(env, 'PUT', PATH, { cookie, body: { updated_at: T0, title: 'New title', occupancy: 'tenanted', rental_licence: 'verified' } });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.listing.title, 'New title');
    assert.ok([undefined, 'unknown'].includes(saved.data.listing.occupancy));
    assert.ok(!events(env).at(-1).fields.includes('occupancy'));
  }
});

test('switched on before migration 0061, an unrelated save still works', async () => {
  const { env, cookie } = await world({ schema: { through: 60 } });
  assert.equal((await call(env, 'GET', PATH, { cookie })).data.compliance_tracking, true);
  const saved = await call(env, 'PUT', PATH, { cookie, body: { updated_at: T0, title: 'New title', occupancy: 'unknown', rental_licence: 'unknown',
    rental_licence_ref: null, rental_licence_valid_until: null, energy_certificate: 'unknown', energy_certificate_ref: null, energy_certificate_valid_until: null } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.listing.title, 'New title');
});

test('staff save compliance; history keeps field names only and nothing reaches the website', async () => {
  const { env, cookie } = await world(); seedMedia(env);
  const before = await call(env, 'GET', PATH, { cookie });
  assert.equal(before.data.compliance_tracking, true);
  assert.equal(before.data.listing.occupancy, 'unknown');
  assert.equal(before.data.listing.rental_licence, 'unknown');
  const saved = await call(env, 'PUT', PATH, { cookie, body: { updated_at: T0, occupancy: 'tenanted', rental_licence: 'provided', rental_licence_ref: REF } });
  assert.equal(saved.status, 200);
  const l = saved.data.listing;
  assert.deepEqual([l.occupancy, l.rental_licence, l.rental_licence_ref, l.rental_licence_valid_until, l.energy_certificate],
    ['tenanted', 'provided', REF, null, 'unknown']);
  assert.equal(l.viewings_enabled, before.data.listing.viewings_enabled, 'occupied_not_consent: occupancy never changes viewing consent');
  const event = events(env).at(-1);
  assert.deepEqual(event.fields.filter(f => COMPLIANCE_FIELDS.includes(f)).sort(), ['occupancy', 'rental_licence', 'rental_licence_ref']);
  assert.ok(!JSON.stringify(event).includes(REF), 'the reference is not copied into history');
  const history = await call(env, 'GET', `${PATH}/history`, { cookie });
  assert.equal(history.status, 200);
  assert.ok(JSON.stringify(history.data).includes('rental_licence_ref'));
  const site = await call(env, 'GET', '/listings');
  assert.equal(site.status, 200);
  assert.equal(site.data.length, 1);
  for (const secret of [REF, 'tenanted', 'occupancy', 'licence', 'energy']) assert.ok(!JSON.stringify(site.data).includes(secret), `scan_not_public: ${secret}`);
  const shape = toPublic({ ...l, specs: '[]' }, []);
  for (const key of Object.keys(shape)) assert.ok(!/occupan|licen|energy|solicitor/i.test(key), key);
});

test('unsupported, stale and repeated saves change nothing', async () => {
  const { env, cookie } = await world();
  const forged = await call(env, 'PUT', PATH, { cookie, body: { updated_at: T0, energy_certificate: 'verified', energy_certificate_ref: REF } });
  assert.equal(forged.status, 400);
  assert.ok(forged.data.fields.energy_certificate_valid_until);
  assert.equal(events(env).length, 0);
  const saved = await call(env, 'PUT', PATH, { cookie, body: { updated_at: T0, energy_certificate: 'verified', energy_certificate_ref: REF,
    energy_certificate_valid_until: '2030-01-01' } });
  assert.equal(saved.status, 200);
  const at = saved.data.listing.updated_at;
  assert.equal((await call(env, 'PUT', PATH, { cookie, body: { updated_at: T0, occupancy: 'vacant' } })).status, 409);
  const same = await call(env, 'PUT', PATH, { cookie, body: { updated_at: at, energy_certificate: 'verified', energy_certificate_ref: REF,
    energy_certificate_valid_until: '2030-01-01', occupancy: 'unknown' } });
  assert.equal(same.status, 200);
  assert.equal(same.data.listing.updated_at, at);
  assert.equal(events(env).length, 1);
  const cleared = await call(env, 'PUT', PATH, { cookie, body: { updated_at: at, energy_certificate: 'unknown' } });
  assert.equal(cleared.status, 400, 'the evidence is cleared together with its status');
  assert.equal(env.DB.raw.prepare('SELECT energy_certificate FROM listings').get().energy_certificate, 'verified');
});

test('only a staff save in the editor sets compliance: imports, new listings and internal writers cannot', async () => {
  const { env, cookie } = await world();
  const created = await call(env, 'POST', '/admin/listings', { cookie, body: { title: 'Fixture flat', use: 'residential', operation: 'rent',
    availability: 'to_let', description: 'Qualified housing with a verified licence and EPC.', rental_licence: 'verified', occupancy: 'tenanted' } });
  assert.equal(created.status, 201);
  const row = env.DB.raw.prepare('SELECT occupancy, rental_licence, housing_category FROM listings WHERE id=?').get(created.data.id);
  assert.deepEqual({ ...row }, { occupancy: 'unknown', rental_licence: 'unknown', housing_category: null });
  assert.equal(Object.hasOwn(extractFeatures({ description: 'Qualified housing', specs: '[]' }), 'housing_category'), false, 'category_not_model_guessed');
  for (const field of COMPLIANCE_FIELDS)
    await assert.rejects(updateListingEvent(env, { id: ID, actor: 'admin@example.test', source: 'recalculate', action: 'recalculated',
      patch: { [field]: 'verified' }, expectedAt: T0 }), /Invalid internal listing update/);
});

test("the seller's solicitor is read from this listing's own sale file, without contact details", async () => {
  const { env, cookie } = await world(); seedListing(env, { id: 'HE-R002' });
  assert.equal((await call(env, 'GET', PATH, { cookie })).data.seller_solicitor, null);
  const buyer = await call(env, 'POST', '/admin/applicants', { cookie, body: { name: 'Fixture buyer', email: 'buyer@example.test', source: 'phone', operation: 'buy' } });
  assert.equal(buyer.status, 201);
  const a = env.DB.raw.prepare('SELECT id FROM applicants LIMIT 1').get().id;
  const offer = Number(env.DB.raw.prepare(`INSERT INTO offers(listing_id,applicant_id,amount,status,created_at,updated_at)
    VALUES(?,?,700000,'accepted',?,?)`).run(ID, a, T0, T0).lastInsertRowid);
  const sale = Number(env.DB.raw.prepare(`INSERT INTO sales(listing_id,applicant_id,offer_id,price,seller_lawyer_firm,seller_lawyer_name,
    seller_lawyer_email,seller_lawyer_phone,created_at,updated_at) VALUES(?,?,?,700000,'Fixture Law','A. Fixture','lawyer@example.test','01534 000000',?,?)`)
    .run(ID, a, offer, T0, T0).lastInsertRowid);
  const own = await call(env, 'GET', PATH, { cookie });
  assert.deepEqual(own.data.seller_solicitor, { sale_id: sale, firm: 'Fixture Law', name: 'A. Fixture' });
  assert.ok(!JSON.stringify(own.data).includes('lawyer@example.test') && !JSON.stringify(own.data).includes('01534 000000'), 'private_contact_denied');
  assert.equal((await call(env, 'GET', '/admin/listings/HE-R002', { cookie })).data.seller_solicitor, null, 'solicitor_reference_scope');
  assert.ok(!JSON.stringify((await call(env, 'GET', '/listings')).data).includes('Fixture Law'));
});
