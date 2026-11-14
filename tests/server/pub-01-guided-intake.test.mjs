// PUB-01: a new draft is created once per operation_id, so a retry after a lost answer recovers it. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPropertyText, draftBody, legalFields } from '../../server/listing-import.js';
import { makeEnv, adminCookie, call } from './helpers.mjs';

const OP = '3f2a8c1e-5b7d-4e9a-8c1f-0a1b2c3d4e5f', OTHER = '9b1d6f2a-7c3e-4a5b-9d8e-1f2a3b4c5d6e';
const BODY = { title: 'Fixture cottage', use: 'residential', operation: 'sale', availability: 'for_sale', country: 'Jersey' };
const world = async () => ({ env: makeEnv(), cookie: await adminCookie() });
const create = (env, cookie, body) => call(env, 'POST', '/admin/listings', { cookie, body });
const count = (env, sql) => env.DB.raw.prepare(sql).get().n;
const listings = env => count(env, 'SELECT COUNT(*) AS n FROM listings');
const created = env => count(env, "SELECT COUNT(*) AS n FROM events WHERE type='listing.created'");

test('a repeated creation with the same operation returns the same draft, never a second one', async () => {
  const { env, cookie } = await world();
  const first = await create(env, cookie, { ...BODY, operation_id: OP });
  assert.equal(first.status, 201);
  const again = await create(env, cookie, { ...BODY, operation_id: OP });
  assert.equal(again.status, 200);
  assert.deepEqual(again.data, { id: first.data.id, replayed: true });
  assert.equal(listings(env), 1);
  assert.equal(created(env), 1);
});

test('two simultaneous creations with the same operation make one draft', async () => {
  const { env, cookie } = await world();
  const [a, b] = await Promise.all([create(env, cookie, { ...BODY, operation_id: OP }), create(env, cookie, { ...BODY, operation_id: OP })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(a.data.id, b.data.id);
  assert.equal(listings(env), 1);
  assert.equal(created(env), 1);
});

test('an operation already used for other details is refused and creates nothing', async () => {
  const { env, cookie } = await world();
  await create(env, cookie, { ...BODY, operation_id: OP });
  const other = await create(env, cookie, { ...BODY, title: 'Another fixture', operation_id: OP });
  assert.equal(other.status, 409);
  assert.equal(listings(env), 1);
});

test('a draft deleted after its creation is never created again by a late retry', async () => {
  const { env, cookie } = await world();
  const { data: { id } } = await create(env, cookie, { ...BODY, operation_id: OP });
  env.DB.raw.prepare("UPDATE listings SET archived_at = updated_at WHERE id = ?").run(id);
  assert.equal((await call(env, 'DELETE', `/admin/listings/${id}`, { cookie, body: { confirm: id } })).status, 200);
  const late = await create(env, cookie, { ...BODY, operation_id: OP });
  assert.equal(late.status, 410);
  assert.equal(listings(env), 0);
});

test("another account's operation never returns or blocks this account's draft", async () => {
  const { env, cookie } = await world();
  const mine = await create(env, cookie, { ...BODY, operation_id: OP });
  const theirs = await create(env, await adminCookie('colleague@example.test'), { ...BODY, operation_id: OP });
  assert.equal(theirs.status, 201);
  assert.notEqual(theirs.data.id, mine.data.id);
});

test('a refused draft leaves no receipt, so the corrected one is created under the same operation', async () => {
  const { env, cookie } = await world();
  assert.equal((await create(env, cookie, { ...BODY, title: '', operation_id: OP })).status, 400);
  assert.equal((await create(env, cookie, { ...BODY, operation_id: 'not-a-uuid' })).status, 400);
  assert.equal(listings(env), 0);
  assert.equal((await create(env, cookie, { ...BODY, operation_id: OP })).status, 201);
});

test('without an operation, creation works as before', async () => {
  const { env, cookie } = await world();
  const a = await create(env, cookie, BODY), b = await create(env, cookie, BODY);
  assert.deepEqual([a.status, b.status], [201, 201]);
  assert.notEqual(a.data.id, b.data.id);
  assert.equal(count(env, 'SELECT COUNT(*) AS n FROM listing_event_operations'), 0);
  assert.equal((await create(env, cookie, { ...BODY, operation_id: OTHER })).status, 201);
  assert.equal(listings(env), 3);
});

// property.txt: occupancy, licence and certificate (PUB-07). They travel apart from the draft: the editor's own save writes them.
test('property.txt reads occupancy, licence and certificate as provided, never as verified', () => {
  const r = readPropertyText(['Title: Fixture', 'Occupancy: Tenanted', 'Rented dwelling licence: LIC-FIXTURE-0001',
    'Licence valid until: 2027-06-30', 'Energy performance certificate: not applicable'].join('\n'));
  assert.deepEqual(r.notes, []);
  assert.deepEqual(legalFields(r.fields), { occupancy: 'tenanted', rental_licence: 'provided', rental_licence_ref: 'LIC-FIXTURE-0001',
    rental_licence_valid_until: '2027-06-30', energy_certificate: 'not_applicable' });
  assert.deepEqual(draftBody(r.fields, BODY).body, BODY);
});

test('property.txt leaves out legal values it cannot trust and says why', () => {
  const r = readPropertyText(['Occupancy: sometimes', 'Rented dwelling licence: Verified', 'Licence valid until: 30/06/2027',
    'Certificate valid until: 2027-06-30', `Energy performance certificate: ${'x'.repeat(101)}`].join('\n'));
  assert.deepEqual(legalFields(r.fields), {});
  assert.deepEqual(r.notes, ['Occupancy: "sometimes" isn\'t one of the accepted values.',
    'Rented dwelling licence: write the document\'s reference or Not applicable. Staff verify it in the editor.',
    'Licence valid until: Enter a valid date as YYYY-MM-DD',
    'Certificate valid until: needs the reference of its document, so it wasn\'t imported.',
    'Energy performance certificate: At most 100 characters']);
});

test('the template names every legal line the import reads', () => {
  const template = readFileSync(new URL('../../admin/public/property.txt', import.meta.url), 'utf8');
  for (const line of ['Occupancy:', 'Rented dwelling licence:', 'Licence valid until:', 'Energy performance certificate:', 'Certificate valid until:'])
    assert.ok(template.split(/\r?\n/).includes(line), line);
});
