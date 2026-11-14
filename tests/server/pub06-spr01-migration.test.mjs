// Canonical migration behavior against the deployed baseline and disposable D1 only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeEnv, seedListing, seedMedia, call, adminCookie, T0 } from './helpers.mjs';
import { structuredEconomicsReady } from '../../server/listing-economics.js';
import { runRetention } from '../../server/retention.js';

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery: split } = require('wrangler');
const dir = new URL('../../migrations/', import.meta.url);
const migration = new URL('0052_listing_economics_history.sql', dir);
// Missing migration deliberately leaves the actual legacy behavior visible in RED.
const upgrade = () => existsSync(migration) ? readFileSync(migration, 'utf8') : '';
const plain = value => JSON.parse(JSON.stringify(value));
const getEvents = async DB => plain((await DB.prepare("SELECT * FROM events WHERE entity_type='listing' AND entity_id='HE-R001' ORDER BY id").all()).results);

async function proveLifecycle(env, cookie) {
  const DB = env.DB;
  const before = await DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first();
  const saved = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: before.updated_at, rental_deposit_amount: 0, parish_rates_amount: 0.29, parish_rates_period: 'year',
    service_charge_amount: 10, service_charge_period: 'month' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.listing.confirmed_at, before.confirmed_at);
  const dated = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: saved.data.listing.updated_at, available_on: '2028-02-29' } });
  assert.equal(dated.status, 200);
  const event = JSON.parse((await getEvents(DB)).at(-1).data);
  assert.deepEqual(event.fields, ['available_on']);
  assert.equal(event.before.available_on, '2026-11-12');
  assert.equal(event.after.available_on, '2028-02-29');
  for (const key of ['availability','published','confirmed_at','archived_at','parish'])
    assert.equal(dated.data.listing[key], before[key], key);
  const cleared = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: dated.data.listing.updated_at, available_on: null } });
  assert.equal(cleared.status, 200);
  const clearEvent = JSON.parse((await getEvents(DB)).at(-1).data);
  assert.equal(clearEvent.before.available_on, '2028-02-29'); assert.equal(clearEvent.after.available_on, null);
  const audit = await getEvents(DB);
  assert.equal((await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: cleared.data.listing.updated_at, available_on: null } })).status, 200);
  assert.deepEqual(await getEvents(DB), audit);
  assert.equal((await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: T0, available_on: '2029-03-01' } })).status, 409);
  assert.deepEqual(await getEvents(DB), audit);
  const row = plain(await DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first());
  await DB.prepare("CREATE TRIGGER fixture_migration_event_failure BEFORE INSERT ON events WHEN NEW.entity_type='listing' BEGIN SELECT RAISE(ABORT,'synthetic migration event failure'); END").run();
  const failed = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
    updated_at: row.updated_at, available_on: '2030-01-01', rental_deposit_amount: 4 } });
  assert.equal(failed.status, 500);
  assert.deepEqual(plain(await DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first()), row);
  assert.deepEqual(await getEvents(DB), audit);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM listing_event_context').first()).n, 0);
  await DB.prepare('DROP TRIGGER fixture_migration_event_failure').run();
  const migratedEvents = await getEvents(DB);
  // Existing personal retention must not acquire a new property/event purge.
  await runRetention(env, '2035-01-01T12:00:00.000Z');
  assert.deepEqual(await getEvents(DB), migratedEvents);
  assert.equal((await DB.prepare("SELECT rental_deposit_amount FROM listings WHERE id='HE-R001'").first()).rental_deposit_amount, 0);
  const current = await DB.prepare("SELECT updated_at FROM listings WHERE id='HE-R001'").first();
  const archived = await call(env, 'POST', '/admin/listings/HE-R001/archive', { cookie, body: { updated_at: current.updated_at } });
  assert.equal(archived.status, 200);
  const deleted = await call(env, 'DELETE', '/admin/listings/HE-R001', { cookie, body: { confirm: 'HE-R001' } });
  assert.equal(deleted.status, 200);
  assert.equal(await DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first(), null);
  assert.ok(await DB.prepare("SELECT id FROM deleted_listings WHERE id='HE-R001'").first());
  assert.deepEqual((await getEvents(DB)).slice(0, migratedEvents.length), migratedEvents);
  const history = await call(env, 'GET', '/admin/listings/HE-R001/history', { cookie });
  assert.equal(history.status, 200);
  assert.ok(history.data.items.some(item => item.changes.some(change => change.field === 'rental_deposit_amount' && change.after === 0)));
  assert.deepEqual(plain((await DB.prepare('PRAGMA foreign_key_check').all()).results), []);
}

test('0052 upgrades populated SQLite through 0042 plus 0048 without the other pending schemas', async () => {
  const env = { ...makeEnv({ through: 42 }), PUB06_STRUCTURED_ECONOMICS_READY: '1' }, db = env.DB.raw;
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='listing_content'").get()) db.exec(readFileSync(new URL('0048_listing_content.sql', dir), 'utf8'));
  seedListing(env, { currency: 'GBP', parish: 'St Saviour', available_on: '2026-11-12', confirmed_at: T0,
    rental_deposit: 'Synthetic old public text' }); seedMedia(env);
  const cookie = await adminCookie();
  const legacy = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: { updated_at: T0, sale_price: 800000 } });
  assert.equal(legacy.status, 200);
  const row = plain(await env.DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first());
  const oldEvents = await getEvents(env.DB), notices = plain(db.prepare('SELECT * FROM notifications ORDER BY id').all());
  db.exec(upgrade());
  assert.equal(await structuredEconomicsReady(env), true);
  const { rental_deposit_amount, parish_rates_amount, service_charge_amount, parish_rates_period, service_charge_period, ...after } =
    plain(await env.DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first());
  assert.deepEqual(after, row);
  assert.deepEqual([rental_deposit_amount, parish_rates_amount, service_charge_amount, parish_rates_period, service_charge_period], [null,null,null,null,null]);
  assert.deepEqual(await getEvents(env.DB), oldEvents); assert.deepEqual(plain(db.prepare('SELECT * FROM notifications ORDER BY id').all()), notices);
  assert.deepEqual(plain(db.prepare('PRAGMA integrity_check').all()), [{ integrity_check: 'ok' }]);
  await proveLifecycle(env, cookie);
});

test('0052 upgrades populated D1 through 0042 plus 0048 and preserves atomic date-only history and lifecycle', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, host: '127.0.0.1', port: 0,
    compatibilityDate: '2025-10-01', script: 'export default {fetch(){return new Response("fixture")}}',
    d1Databases: { DB: 'pub06-spr01-migration-synthetic' } }));
  try {
    const DB = await mf.getD1Database('DB');
    for (const name of readdirSync(dir).filter(n => n.endsWith('.sql') && (Number(n.slice(0,4)) <= 42 || n.startsWith('0048_'))).sort())
      await DB.batch(split(readFileSync(new URL(name,dir),'utf8')).map(sql => DB.prepare(sql)));
    await DB.prepare("INSERT INTO admins(email,added_at) VALUES('admin@example.test',?)").bind(T0).run();
    await DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,country,currency,parish,available_on,confirmed_at,rental_deposit,sale_price,published,created_at,updated_at)
      VALUES('HE-R001','residential','Synthetic','sale','for_sale','Jersey','GBP','St Saviour','2026-11-12',?,'Synthetic old public text',800000,1,?,?)`).bind(T0,T0,T0).run();
    const env = { ...makeEnv(), DB, PUB06_STRUCTURED_ECONOMICS_READY: '1' }, cookie = await adminCookie();
    const legacy = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: { updated_at: T0, sale_price: 800001 } });
    assert.equal(legacy.status, 200);
    const row = plain(await DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first()), oldEvents = await getEvents(DB);
    assert.equal(oldEvents.length, 1, 'the pre-migration database contains real existing property history');
    const oldNotices = plain((await DB.prepare('SELECT * FROM notifications ORDER BY id').all()).results);
    if (upgrade()) await DB.batch(split(upgrade()).map(sql => DB.prepare(sql)));
    assert.equal(await structuredEconomicsReady(env), true);
    const { rental_deposit_amount, parish_rates_amount, service_charge_amount, parish_rates_period, service_charge_period, ...after } =
      plain(await DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first());
    assert.deepEqual(after, row); assert.deepEqual(await getEvents(DB), oldEvents);
    assert.deepEqual(plain((await DB.prepare('SELECT * FROM notifications ORDER BY id').all()).results), oldNotices);
    assert.deepEqual([rental_deposit_amount, parish_rates_amount, service_charge_amount, parish_rates_period, service_charge_period], [null,null,null,null,null]);
    await proveLifecycle(env, cookie);
  } finally { await mf.dispose(); }
});
