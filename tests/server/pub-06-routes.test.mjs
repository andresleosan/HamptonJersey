import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv, seedListing, adminCookie, call, T0 } from './helpers.mjs';
import { toPublic } from '../../server/listing.js';

const proposal = readFileSync(new URL('../../docs/roadmap/work/PUB-06/structured-economics.proposed.sql', import.meta.url), 'utf8');
const setup = async ({ install = false, enabled = false } = {}) => {
  const env = makeEnv();
  seedListing(env, { currency: 'GBP', confirmed_at: T0, rental_deposit: 'Public legacy text', parish_rates: 'Public rates' });
  if (install) env.DB.raw.exec(proposal);
  if (enabled) env.PUB06_STRUCTURED_ECONOMICS_READY = '1';
  return { env, cookie: await adminCookie() };
};
const events = env => env.DB.raw.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id='HE-R001' ORDER BY id").all().map(r=>JSON.parse(r.data));

test('disabled or missing schema rejects structured fields and leaves the existing editor usable', async () => {
  for (const options of [{}, { enabled: true }, { install: true }]) {
    const { env, cookie } = await setup(options);
    const detail = await call(env, 'GET', '/admin/listings/HE-R001', { cookie });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.structured_economics, false);
    const refused = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie,
      body: { updated_at: T0, rental_deposit_amount: 0 } });
    assert.equal(refused.status, 503);
    assert.equal(events(env).length, 0);
    const normal = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie,
      body: { updated_at: T0, title: 'Synthetic changed' } });
    assert.equal(normal.status, 200);
    assert.equal(normal.data.listing.title, 'Synthetic changed');
  }
});

test('enabled structured costs create, edit, clear and audit without altering the public text', async () => {
  const { env, cookie } = await setup({ install: true, enabled: true });
  const detail = await call(env, 'GET', '/admin/listings/HE-R001', { cookie });
  assert.equal(detail.data.structured_economics, true);
  const input = { rental_deposit_amount: 0, parish_rates_amount: 0.29, parish_rates_period: 'year',
    service_charge_amount: 10, service_charge_period: 'month' };
  const saved = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: { updated_at: T0, ...input } });
  assert.equal(saved.status, 200);
  for (const [key, value] of Object.entries(input)) assert.equal(saved.data.listing[key], value);
  assert.equal(saved.data.listing.rental_deposit, 'Public legacy text');
  assert.equal(saved.data.listing.parish_rates, 'Public rates');
  assert.equal(saved.data.listing.confirmed_at, T0);
  const audit = events(env).at(-1);
  for (const [key, value] of Object.entries(input)) {
    assert.ok(audit.fields.includes(key), key);
    assert.equal(audit.before[key], null);
    assert.equal(audit.after[key], value);
  }
  const history = await call(env, 'GET', '/admin/listings/HE-R001/history', { cookie });
  assert.equal(history.status, 200);
  const changes = history.data.items[0].changes;
  for (const [key, value] of Object.entries(input)) {
    const change = changes.find(item => item.field === key);
    assert.ok(change, key);
    assert.equal(change.before, null);
    assert.equal(change.after, value);
  }
  const publicListing = toPublic({ ...saved.data.listing, specs: JSON.stringify(saved.data.listing.specs) }, []);
  for (const key of Object.keys(input)) assert.equal(Object.hasOwn(publicListing, key), false);
  assert.ok(publicListing.specs.some(item => item.value === 'Public legacy text'));
  assert.equal(JSON.stringify(publicListing).includes('0.29'), false);
  const edit = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie,
    body: { updated_at: saved.data.listing.updated_at, service_charge_amount: null } });
  assert.equal(edit.status, 200);
  assert.equal(edit.data.listing.rental_deposit_amount, 0);
  assert.equal(edit.data.listing.parish_rates_period, 'year');
  assert.equal(edit.data.listing.service_charge_amount, null);
});

test('incomplete costs and stale edits produce no write or event', async () => {
  const { env, cookie } = await setup({ install: true, enabled: true });
  const before = { ...env.DB.raw.prepare("SELECT * FROM listings WHERE id='HE-R001'").get() };
  for (const body of [
    { updated_at: T0, parish_rates_amount: 0 },
    { updated_at: T0, currency: null, rental_deposit_amount: 0 },
    { updated_at: T0, service_charge_amount: 1.001, service_charge_period: 'year' },
  ]) {
    const result = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body });
    assert.equal(result.status, 400);
  }
  const stale = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie,
    body: { updated_at: '2000-01-01T00:00:00.000Z', rental_deposit_amount: 1 } });
  assert.equal(stale.status, 409);
  assert.deepEqual({ ...env.DB.raw.prepare("SELECT * FROM listings WHERE id='HE-R001'").get() }, before);
  assert.equal(events(env).length, 0);
});

test('a replaced audit guard between validation and SQL cannot write an amount', async () => {
  const { env, cookie } = await setup({ install: true, enabled: true });
  const prepare = env.DB.prepare.bind(env.DB);
  let removed = false;
  env.DB.prepare = sql => {
    if (!removed && sql.startsWith('UPDATE listings SET') && sql.includes('rental_deposit_amount')) {
      removed = true;
      env.DB.raw.exec('DROP TRIGGER pub06_costs_guard_update');
    }
    return prepare(sql);
  };
  const result = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie,
    body: { updated_at: T0, rental_deposit_amount: 1 } });
  assert.equal(result.status, 503);
  assert.equal(env.DB.raw.prepare("SELECT rental_deposit_amount FROM listings WHERE id='HE-R001'").get().rental_deposit_amount, null);
  assert.equal(events(env).length, 0);
});

test('an older panel preserves structured amounts and cannot silently change their currency while capability is off', async () => {
  const { env, cookie } = await setup({ install: true, enabled: true });
  const first = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie,
    body: { updated_at: T0, rental_deposit_amount: 0, parish_rates_amount: 0.29, parish_rates_period: 'year' } });
  assert.equal(first.status, 200);
  delete env.PUB06_STRUCTURED_ECONOMICS_READY;
  const oldPanel = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: first.data.listing.updated_at, title: 'Legacy panel edit', currency: 'GBP',
    rental_deposit: 'Public legacy text', parish_rates: 'Public rates' } });
  assert.equal(oldPanel.status, 200);
  assert.equal(oldPanel.data.listing.rental_deposit_amount, 0);
  assert.equal(oldPanel.data.listing.parish_rates_amount, 0.29);
  assert.equal(oldPanel.data.listing.parish_rates_period, 'year');
  const count = events(env).length;
  const blocked = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: oldPanel.data.listing.updated_at, title: 'Must not save', currency: 'EUR' } });
  assert.equal(blocked.status, 503);
  const stale = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: first.data.listing.updated_at, title: 'Stale panel edit', currency: 'GBP' } });
  assert.equal(stale.status, 409);
  const row = env.DB.raw.prepare("SELECT title,currency,rental_deposit_amount,parish_rates_amount,parish_rates_period FROM listings WHERE id='HE-R001'").get();
  assert.deepEqual({ ...row }, { title: 'Legacy panel edit', currency: 'GBP', rental_deposit_amount: 0,
    parish_rates_amount: 0.29, parish_rates_period: 'year' });
  assert.equal(events(env).length, count);
});

test('create obeys the capability and audits the new amounts once; repeating unchanged values is a no-op', async () => {
  const body = { title: 'Synthetic new listing', use: 'residential', operation: 'rent', availability: 'to_let',
    currency: 'GBP', available_on: '2028-02-29', rental_deposit_amount: 0,
    service_charge_amount: 0.29, service_charge_period: 'month' };
  const disabled = await setup();
  assert.equal((await call(disabled.env, 'POST', '/admin/listings', { cookie: disabled.cookie, body })).status, 503);
  const { env, cookie } = await setup({ install: true, enabled: true });
  const created = await call(env, 'POST', '/admin/listings', { cookie, body });
  assert.equal(created.status, 201);
  const listing = await call(env, 'GET', `/admin/listings/${created.data.id}`, { cookie });
  assert.equal(listing.data.listing.rental_deposit_amount, 0);
  assert.equal(listing.data.listing.service_charge_amount, 0.29);
  const getEvents = () => env.DB.raw.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id=? ORDER BY id")
    .all(created.data.id).map(row => JSON.parse(row.data));
  const history = getEvents();
  assert.equal(history.length, 1);
  assert.equal(history[0].after.rental_deposit_amount, 0);
  assert.equal(history[0].after.service_charge_amount, 0.29);
  assert.equal(history[0].after.service_charge_period, 'month');
  assert.equal(history[0].after.available_on, '2028-02-29');
  const unchanged = await call(env, 'PUT', `/admin/listings/${created.data.id}`, { cookie, body: {
    updated_at: listing.data.listing.updated_at, rental_deposit_amount: 0, service_charge_amount: 0.29,
    service_charge_period: 'month' } });
  assert.equal(unchanged.status, 200);
  assert.equal(getEvents().length, 1);
});
