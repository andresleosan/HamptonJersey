import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeEnv, seedListing, adminCookie, call, T0 } from './helpers.mjs';
import { structuredEconomicsReady, ECONOMICS_GUARD_SQL } from '../../server/listing-economics.js';
import { listingBatch } from '../../server/listing-events.js';

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery } = require('wrangler');
const proposal = new URL('../../docs/roadmap/work/PUB-06/structured-economics.proposed.sql', import.meta.url);
const migrations = new URL('../../migrations/', import.meta.url);
const source = readFileSync(proposal, 'utf8');
const flag = { PUB06_STRUCTURED_ECONOMICS_READY: '1' };

async function apply(DB, file) {
  const statements = unstable_splitSqlQuery(readFileSync(file, 'utf8')).map(sql => DB.prepare(sql));
  if (statements.length) await DB.batch(statements);
}

test('SQLite proposal preserves existing texts, SPR-01 date snapshots, and atomic structured history', async () => {
  const env = { ...makeEnv(), ...flag }, db = env.DB.raw;
  seedListing(env, { currency: 'GBP', available_on: '2026-11-12', rental_deposit: 'Synthetic legacy deposit',
    parish_rates: 'Synthetic rates', service_charge: 'Synthetic service', confirmed_at: T0 });
  const before = { ...db.prepare('SELECT * FROM listings WHERE id=?').get('HE-R001') };
  const oldEvents = db.prepare('SELECT * FROM events ORDER BY id').all();
  const oldNotifications = db.prepare('SELECT * FROM notifications ORDER BY id').all();
  assert.equal(await structuredEconomicsReady(env), false);
  db.exec(source);
  assert.equal(await structuredEconomicsReady(env), true);
  const { rental_deposit_amount, parish_rates_amount, parish_rates_period, service_charge_amount, service_charge_period, ...after } =
    db.prepare('SELECT * FROM listings WHERE id=?').get('HE-R001');
  assert.deepEqual({ ...after }, before);
  assert.deepEqual([rental_deposit_amount, parish_rates_amount, parish_rates_period, service_charge_amount, service_charge_period], [null,null,null,null,null]);
  assert.deepEqual(db.prepare('SELECT * FROM events ORDER BY id').all(), oldEvents);
  assert.deepEqual(db.prepare('SELECT * FROM notifications ORDER BY id').all(), oldNotifications);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  await listingBatch(env, 'HE-R001', { actor: 'synthetic@example.test', source: 'panel', action: 'updated' }, [
    env.DB.prepare(`UPDATE listings SET rental_deposit_amount=0,parish_rates_amount=0.29,parish_rates_period='year',
      available_on='2028-02-29',updated_at='2026-01-01T00:00:01.000Z' WHERE id='HE-R001' AND ${ECONOMICS_GUARD_SQL}`),
  ]);
  const event = JSON.parse(db.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id='HE-R001' ORDER BY id DESC LIMIT 1").get().data);
  assert.equal(event.before.rental_deposit_amount, null);
  assert.equal(event.after.rental_deposit_amount, 0);
  assert.equal(event.before.parish_rates_amount, null);
  assert.equal(event.after.parish_rates_amount, 0.29);
  assert.equal(event.after.parish_rates_period, 'year');
  assert.equal(event.before.available_on, '2026-11-12');
  assert.equal(event.after.available_on, '2028-02-29');
  assert.equal(JSON.stringify(event).includes('Synthetic legacy'), false);
  assert.equal(db.prepare('SELECT confirmed_at FROM listings WHERE id=?').get('HE-R001').confirmed_at, T0);
  assert.throws(() => db.prepare("UPDATE listings SET parish_rates_period=NULL WHERE id='HE-R001'").run());
  assert.equal(db.prepare('SELECT parish_rates_period FROM listings WHERE id=?').get('HE-R001').parish_rates_period, 'year');
  db.exec('DROP TRIGGER pub06_costs_guard_update');
  assert.equal(await structuredEconomicsReady(env), false);
  assert.equal(db.prepare(`UPDATE listings SET rental_deposit_amount=1 WHERE id='HE-R001' AND ${ECONOMICS_GUARD_SQL}`).run().changes, 0);
});

test('D1 local installs the combined proposal without losing the row and records exact zero and dates', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default { fetch() { return new Response('fixture') } }", compatibilityDate: '2025-10-01',
    host: '127.0.0.1', port: 0, d1Databases: { DB: 'pub06-structured-synthetic' } }));
  try {
    const DB = await mf.getD1Database('DB');
    for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) await apply(DB, new URL(file, migrations));
    await DB.prepare(`INSERT INTO listings (id,use,title,operation,availability,currency,available_on,rental_deposit,created_at,updated_at)
      VALUES ('HE-R001','residential','Synthetic','rent','to_let','GBP','2026-11-12','Legacy',?,?)`).bind(T0,T0).run();
    const before = await DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first();
    await apply(DB, proposal);
    const { rental_deposit_amount, parish_rates_amount, parish_rates_period, service_charge_amount, service_charge_period, ...after } =
      await DB.prepare("SELECT * FROM listings WHERE id='HE-R001'").first();
    assert.deepEqual(after, before);
    assert.deepEqual([rental_deposit_amount, parish_rates_amount, parish_rates_period, service_charge_amount, service_charge_period], [null,null,null,null,null]);
    const env = { DB, ...flag };
    assert.equal(await structuredEconomicsReady(env), true);
    await listingBatch(env, 'HE-R001', { actor: 'synthetic@example.test', source: 'panel', action: 'updated' }, [
      DB.prepare(`UPDATE listings SET service_charge_amount=0,service_charge_period='month',available_on='2028-02-29'
        WHERE id='HE-R001' AND ${ECONOMICS_GUARD_SQL}`),
    ]);
    const event = JSON.parse((await DB.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id='HE-R001' ORDER BY id DESC LIMIT 1").first()).data);
    assert.equal(event.after.service_charge_amount, 0);
    assert.equal(event.after.service_charge_period, 'month');
    assert.equal(event.before.available_on, '2026-11-12');
    assert.equal(event.after.available_on, '2028-02-29');
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results, []);
    await assert.rejects(DB.prepare("UPDATE listings SET service_charge_period=NULL WHERE id='HE-R001'").run());
    await DB.prepare('DROP TRIGGER pub06_costs_guard_update').run();
    assert.equal(await structuredEconomicsReady(env), false);
    assert.equal((await DB.prepare(`UPDATE listings SET service_charge_amount=1 WHERE id='HE-R001' AND ${ECONOMICS_GUARD_SQL}`).run()).meta.changes, 0);
  } finally { await mf.dispose(); }
});

test('D1 real routes enforce session, stale versions and an atomic guard if audit changes before commit', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default { fetch() { return new Response('fixture') } }", compatibilityDate: '2025-10-01',
    host: '127.0.0.1', port: 0, d1Databases: { DB: 'pub06-routes-synthetic' } }));
  try {
    const DB = await mf.getD1Database('DB');
    for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) await apply(DB, new URL(file, migrations));
    await DB.prepare(`INSERT INTO listings (id,use,title,operation,availability,currency,created_at,updated_at)
      VALUES ('HE-R001','residential','Synthetic','rent','to_let','GBP',?,?)`).bind(T0,T0).run();
    await DB.prepare("INSERT INTO admins(email,added_at) VALUES ('admin@example.test',?)").bind(T0).run();
    await apply(DB, proposal);
    let sabotage = false;
    const wrapped = { prepare: sql => DB.prepare(sql), withSession: name => DB.withSession(name), batch: async statements => {
      if (sabotage) { sabotage = false; await DB.prepare('DROP TRIGGER pub06_costs_guard_update').run(); }
      return DB.batch(statements);
    } };
    const env = { ...makeEnv(), DB: wrapped, ...flag }, cookie = await adminCookie();
    assert.equal((await call(env, 'PUT', '/admin/listings/HE-R001', { body: { updated_at: T0, rental_deposit_amount: 0 } })).status, 401);
    assert.equal((await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, origin: 'https://other.example',
      body: { updated_at: T0, rental_deposit_amount: 0 } })).status, 403);
    const saved = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
      updated_at: T0, rental_deposit_amount: 0, parish_rates_amount: 0.29, parish_rates_period: 'year' } });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.listing.rental_deposit_amount, 0);
    assert.equal(saved.data.listing.parish_rates_amount, 0.29);
    const eventCount = (await DB.prepare("SELECT count(*) AS n FROM events WHERE entity_type='listing' AND entity_id='HE-R001'").first()).n;
    const stale = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: { updated_at: T0, rental_deposit_amount: 2 } });
    assert.equal(stale.status, 409);
    sabotage = true;
    const blocked = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: {
      updated_at: saved.data.listing.updated_at, rental_deposit_amount: 2, details: { building_name_or_number: 'Do not write' } } });
    assert.equal(blocked.status, 503);
    assert.equal((await DB.prepare("SELECT rental_deposit_amount FROM listings WHERE id='HE-R001'").first()).rental_deposit_amount, 0);
    const details = await DB.prepare("SELECT building_name_or_number FROM listing_details WHERE listing_id='HE-R001'").first();
    assert.ok(!details || details.building_name_or_number == null);
    assert.equal((await DB.prepare("SELECT count(*) AS n FROM events WHERE entity_type='listing' AND entity_id='HE-R001'").first()).n, eventCount);
  } finally { await mf.dispose(); }
});
