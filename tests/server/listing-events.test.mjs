import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, seedListing, call, adminCookie, T0 } from './helpers.mjs';

const ADMIN = 'admin@example.test';
const events = (env, id = 'HE-R001') => env.DB.raw.prepare(
  "SELECT * FROM events WHERE entity_type='listing' AND entity_id=? ORDER BY id").all(id)
  .map(e => ({ ...e, data: JSON.parse(e.data) }));
const listing = env => env.DB.raw.prepare("SELECT * FROM listings WHERE id='HE-R001'").get();
async function fixture(over = {}) {
  const env = makeEnv(); seedListing(env, over);
  return { env, cookie: await adminCookie() };
}

test('EST-18: a price edit records actual values and actor, without copying free text, and NOT-01 projects Feed', async () => {
  const { env, cookie } = await fixture();
  const r = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie,
    body: { updated_at: T0, sale_price: 800000, description: 'Private synthetic customer note' } });
  assert.equal(r.status, 200);
  const es = events(env); assert.equal(es.length, 1);
  assert.equal(es[0].actor, ADMIN);
  assert.equal(es[0].data.source, 'panel');
  assert.equal(es[0].data.revision, 1);
  assert.equal(es[0].data.before.sale_price, 779000);
  assert.equal(es[0].data.after.sale_price, 800000);
  assert.ok(es[0].data.fields.includes('description'));
  assert.ok(!JSON.stringify(es).includes('Private synthetic'));
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM notifications WHERE action_required=0 AND task_key=?').get(`event:${es[0].id}`).n, 1);
});

test('EST-18: no-op saves and rejected stale saves add no events', async () => {
  const { env, cookie } = await fixture();
  const save = body => call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body });
  assert.equal((await save({ updated_at: T0, sale_price: 800000 })).status, 200);
  const at = listing(env).updated_at;
  assert.equal((await save({ updated_at: at, sale_price: 800000 })).status, 200);
  assert.equal(events(env).length, 1);
  assert.equal((await save({ updated_at: T0, sale_price: 900000 })).status, 409);
  assert.equal(events(env).length, 1);
});

test('EST-18: event failure rolls back the price edit and context', async () => {
  const { env, cookie } = await fixture();
  env.DB.raw.exec("CREATE TRIGGER reject_listing_event BEFORE INSERT ON events WHEN NEW.entity_type='listing' BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END");
  const r = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie,
    body: { updated_at: T0, sale_price: 800000 } });
  assert.equal(r.status, 500);
  assert.equal(listing(env).sale_price, 779000);
  assert.equal(events(env).length, 0);
});

test('EST-18: create, archive and deletion preserve ordered history and stable identity', async () => {
  const env = makeEnv(), cookie = await adminCookie();
  const created = await call(env, 'POST', '/admin/listings', { cookie,
    body: { title: 'Synthetic', use: 'residential', country: 'Jersey', operation: 'sale', availability: 'for_sale' } });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(events(env, id)[0]?.type, 'listing.created');
  assert.equal((await call(env, 'POST', `/admin/listings/${id}/archive`, { cookie })).status, 200);
  assert.equal((await call(env, 'DELETE', `/admin/listings/${id}`, { cookie, body: { confirm: id } })).status, 200);
  assert.deepEqual(events(env, id).map(e => [e.type, e.data.revision]),
    [['listing.created', 1], ['listing.archived', 2], ['listing.deleted', 3]]);
  assert.ok(env.DB.raw.prepare('SELECT 1 FROM deleted_listings WHERE id=?').get(id));
  assert.deepEqual(env.DB.raw.prepare('PRAGMA foreign_key_check').all(), []);
});

test('EST-18: migration preserves populated events and referencing notices', () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  const dir = new URL('../../migrations/', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files.filter(f => f < '0029')) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  db.exec("INSERT INTO events VALUES(17,'2026-11-07T12:00:00.000Z','system','viewing','1','viewing.requested',NULL); INSERT INTO notifications(id,event_id,category,title,action_required,created_at) VALUES(31,17,'viewing','Synthetic',1,'2026-11-07T12:00:00.000Z')");
  const before = db.prepare('SELECT * FROM events').all();
  const migration = files.find(f => f.startsWith('0029'));
  assert.ok(migration, 'listing event migration exists');
  db.exec('BEGIN'); db.exec(readFileSync(new URL(migration, dir), 'utf8')); db.exec('COMMIT');
  assert.deepEqual(db.prepare('SELECT * FROM events').all(), before);
  assert.equal(db.prepare('SELECT event_id FROM notifications WHERE id=31').get().event_id, 17);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('EST-18: fixed-clock edits conflict and explicit confirmations remain distinct', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(T0) });
  const { env, cookie } = await fixture();
  const save = () => call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: { updated_at: T0, sale_price: 800000,
    actor: 'spoof', source: 'sales', revision: 90 } });
  const rs = await Promise.all([save(), save()]);
  assert.deepEqual(rs.map(r => r.status).sort(), [200, 409]);
  assert.ok(listing(env).updated_at > T0);
  const at = listing(env).updated_at;
  for (let i = 0; i < 2; i++) assert.equal((await call(env, 'POST', '/admin/listings/HE-R001/confirm', { cookie })).status, 200);
  assert.equal(listing(env).updated_at, at);
  assert.deepEqual(events(env).map(e => e.type), ['listing.updated', 'listing.confirmed', 'listing.confirmed']);
  assert.ok(events(env).every(e => e.actor === ADMIN && e.data.source === 'panel'));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_event_context').get().n, 0);
});

test('EST-18: publish, republish, unpublish, restore and featured record intentional state changes', async () => {
  const { env, cookie } = await fixture({ published: 0 });
  const post = action => call(env, 'POST', `/admin/listings/HE-R001/${action}`, { cookie });
  assert.equal((await post('publish')).status, 200);
  const at = listing(env).published_at;
  assert.equal((await post('publish')).status, 200); assert.equal(listing(env).published_at, at);
  for (const action of ['unpublish', 'archive', 'restore']) assert.equal((await post(action)).status, 200);
  seedListing(env, { id: 'HE-R002' });
  for (const id of ['HE-R001', 'HE-R002', 'HE-R001']) assert.equal((await call(env, 'PUT', `/admin/listings/${id}/featured`,
    { cookie, body: { featured: true } })).status, 200);
  assert.equal((await call(env, 'PUT', '/admin/listings/HE-R001/featured', { cookie, body: { featured: false } })).status, 200);
  assert.equal(events(env, 'HE-R002').length, 1, 'rank compression is not another intentional starring');
  assert.deepEqual(events(env).map(e => e.type), ['listing.published', 'listing.confirmed', 'listing.unpublished',
    'listing.archived', 'listing.restored', 'listing.featured_changed', 'listing.featured_changed']);
});

test('EST-18: internal identity replays once, binds payload, survives later edits and deletion', async () => {
  const { updateListingEvent } = await import('../../server/listing-events.js');
  const { env } = await fixture();
  const op = { id: 'HE-R001', actor: ADMIN, source: 'panel', action: 'updated', expectedAt: T0,
    operationId: 'test-operation-1', patch: { sale_price: 800000 } };
  const results = await Promise.all([updateListingEvent(env, op), updateListingEvent(env, op)]);
  assert.deepEqual(results.map(r => r.replayed).sort(), [false, true]);
  assert.equal(results[0].event_id, results[1].event_id);
  assert.equal(events(env).length, 1);
  await assert.rejects(updateListingEvent(env, { ...op, patch: { sale_price: 900000 } }), e => e.status === 409);
  await updateListingEvent(env, { ...op, operationId: 'test-operation-2', expectedAt: listing(env).updated_at,
    patch: { sale_price: 850000 } });
  assert.deepEqual(await updateListingEvent(env, op), { event_id: results[0].event_id, changed: true, replayed: true });
  assert.equal(listing(env).sale_price, 850000);
  env.DB.raw.exec("DELETE FROM listings WHERE id='HE-R001'");
  assert.equal((await updateListingEvent(env, op)).event_id, results[0].event_id);
  assert.equal(listing(env), undefined);
  const receipt = env.DB.raw.prepare('SELECT * FROM listing_event_operations LIMIT 1').get();
  assert.match(receipt.request_hash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(receipt).includes('800000'));
});

test('EST-18: no-op identities are consumed; stale or failed writes leave no receipt', async () => {
  const { updateListingEvent } = await import('../../server/listing-events.js');
  const { env } = await fixture();
  const op = { id: 'HE-R001', actor: ADMIN, source: 'panel', action: 'updated', expectedAt: T0,
    operationId: 'noop', patch: { sale_price: 779000 } };
  assert.deepEqual(await updateListingEvent(env, op), { event_id: null, replayed: false, changed: false });
  assert.deepEqual(await updateListingEvent(env, op), { event_id: null, replayed: true, changed: false });
  await assert.rejects(updateListingEvent(env, { ...op, operationId: 'stale', patch: { sale_price: 700000 } }), e => e.status === 409);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_event_operations').get().n, 1);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_event_context').get().n, 0);
});

test('EST-18: Sales records availability for the property and buyer with matching offer reference', async () => {
  const { env, cookie } = await fixture();
  const post = (path, body) => call(env, 'POST', path, { cookie, body });
  const b = await post('/admin/applicants', { name: 'Synthetic buyer', email: 'synthetic@example.test', source: 'phone', operation: 'buy' });
  assert.equal(b.status, 201);
  const o = await post('/admin/offers', { listing_id: 'HE-R001', applicant_id: b.data.id, amount: 750000 });
  assert.equal(o.status, 201);
  const accepted = await post(`/admin/offers/${o.data.offer.id}/accept`); assert.equal(accepted.status, 201);
  const e = events(env).at(-1);
  assert.equal(e?.data.source, 'sales'); assert.equal(e.data.related.offer_id, o.data.offer.id);
  assert.equal(e.data.before.availability, 'for_sale'); assert.equal(e.data.after.availability, 'under_offer');
  const buyer = env.DB.raw.prepare("SELECT * FROM events WHERE entity_type='applicant' AND type='listing.availability_changed'").get();
  assert.equal(JSON.parse(buyer.data).offer_id, e.data.related.offer_id);
  assert.equal(JSON.parse(buyer.data).sale_id, accepted.data.sale_id);
  assert.equal((await post(`/admin/sales/${accepted.data.sale_id}/fall-through`, { reason: 'buyer_withdrew' })).status, 200);
  assert.equal(events(env).at(-1).data.after.availability, 'for_sale');
  assert.equal(events(env).at(-1).data.related.sale_id, accepted.data.sale_id);
  assert.deepEqual(env.DB.raw.prepare('PRAGMA foreign_key_check').all(), []);
});

test('EST-18: Queue draft, publication and discard carry the import identity', async () => {
  const env = makeEnv(), cookie = await adminCookie();
  const post = (path, body) => call(env, 'POST', path, { cookie, body });
  env.DB.raw.prepare("INSERT INTO drive_imports(id,folder_id,folder_name,status,requested_by,created_at) VALUES(1,'synthetic-folder','Synthetic','ready',?,?)").run(ADMIN, T0);
  const created = await post('/admin/queue/1/draft', { title: 'Synthetic', use: 'residential', operation: 'sale',
    availability: 'for_sale', country: 'Jersey', sale_price: 500000, currency: 'GBP', parish: 'St Helier', description: 'Synthetic listing description' });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(events(env, id)[0]?.data.source, 'queue');
  assert.equal(events(env, id)[0].data.related.import_id, 1);
  const { seedMedia } = await import('./helpers.mjs'); seedMedia(env, { listing_id: id });
  assert.equal((await post('/admin/queue/1/approve')).status, 200);
  assert.equal(events(env, id).at(-1).type, 'listing.published');
  assert.equal(events(env, id).at(-1).data.related.import_id, 1);
  env.DB.raw.prepare("INSERT INTO drive_imports(id,folder_id,folder_name,status,requested_by,created_at) VALUES(2,'synthetic-folder-2','Synthetic','ready',?,?)").run(ADMIN, T0);
  const draft = await post('/admin/queue/2/draft', { title: 'Synthetic 2', use: 'residential', operation: 'sale', availability: 'for_sale', country: 'Jersey' });
  assert.equal(draft.status, 201);
  assert.equal((await post('/admin/queue/2/discard')).status, 200);
  const deleted = events(env, draft.data.id).at(-1);
  assert.equal(deleted.type, 'listing.deleted'); assert.equal(deleted.data.related.import_id, 2);
  assert.deepEqual(deleted.data.before, {}); assert.deepEqual(deleted.data.after, {});
});

test('EST-18: media cover commit stays recorded if later media steps fail; removal clears it', async () => {
  const { env, cookie } = await fixture();
  const { seedMedia } = await import('./helpers.mjs'); seedMedia(env, { origin: 'upload' });
  env.DB.raw.exec("CREATE TRIGGER reject_media_update BEFORE UPDATE ON media BEGIN SELECT RAISE(ABORT,'synthetic media failure'); END");
  const r = await call(env, 'PUT', '/admin/listings/HE-R001/media', { cookie, body: { updated_at: T0, cover_media_id: 'A00001',
    items: [{ id: 'A00001', position: 0, public: true, kind: 'photo' }] } });
  assert.equal(r.status, 500); assert.equal(listing(env).cover_media_id, 'A00001');
  assert.equal(events(env).at(-1)?.data.source, 'media');
  assert.equal(events(env).at(-1).data.after.cover_media_id, 'A00001');
  assert.equal((await call(env, 'DELETE', '/admin/media/A00001', { cookie })).status, 200);
  assert.equal(events(env).at(-1).data.after.cover_media_id, null);
  assert.equal(events(env).at(-1).actor, ADMIN);
});

test('EST-18: recalculate records actual derived changes once, preserves human parish and editor version', async () => {
  const { env, cookie } = await fixture({ parish: 'St Helier', location: 'St Saviour', description: 'Pets allowed. Private synthetic description' });
  const recalc = () => call(env, 'POST', '/admin/matches/recalculate', { cookie, body: { phase: 'listings' } });
  assert.equal((await recalc()).status, 200);
  const e = events(env).at(-1); assert.equal(e?.type, 'listing.recalculated');
  assert.equal(e.actor, 'system'); assert.equal(e.data.source, 'recalculate');
  assert.ok(e.data.derived_fields.includes('feat_pets'));
  assert.equal(listing(env).parish, 'St Helier'); assert.equal(listing(env).updated_at, T0);
  assert.ok(!e.data.fields.includes('parish')); assert.ok(!JSON.stringify(e).includes('synthetic description'));
  assert.equal((await recalc()).status, 200); assert.equal(events(env).length, 1);
});

test('EST-18: structured arrays, unknown values and all free-text fields are minimized', async () => {
  const { env, cookie } = await fixture();
  const text = { title: 'Private synthetic title', property_type: 'Private synthetic type', country: 'Private synthetic country',
    location: 'Private synthetic location', road_name: 'Private synthetic road', tenure: 'Private synthetic tenure',
    price_text: 'Private synthetic price', summary: 'Private synthetic summary', description: 'Private synthetic description',
    tour_url: 'https://example.test/private-synthetic', specs: [{ label: 'Private synthetic label', value: 'Private synthetic value' }] };
  const hours = [{ day: 1, start: '09:00', end: '12:00' }];
  const r = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: { updated_at: T0, ...text,
    parish: null, bedrooms: null, viewings_enabled: 0, viewing_hours: hours } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const e = events(env).at(-1);
  assert.deepEqual(e.data.after.viewing_hours, hours); assert.equal(e.data.after.bedrooms, null);
  assert.equal(e.data.after.viewings_enabled, 0);
  for (const key of Object.keys(text)) {
    assert.ok(e.data.fields.includes(key), key); assert.ok(!(key in e.data.before), key); assert.ok(!(key in e.data.after), key);
  }
  assert.ok(!JSON.stringify(e).includes('Private synthetic'));
  assert.ok(!JSON.stringify(e).includes('private-synthetic'));
  assert.ok(!e.data.derived_fields.includes('parish'), 'explicit parish is not attributed to extraction');
});

test('EST-18: failed internal event write creates no receipt and permits a safe retry', async () => {
  const { updateListingEvent } = await import('../../server/listing-events.js');
  const { env } = await fixture();
  const op = { id: 'HE-R001', actor: ADMIN, source: 'panel', action: 'updated', expectedAt: T0,
    operationId: 'retry-after-failure', patch: { sale_price: 800000 } };
  env.DB.raw.exec("CREATE TRIGGER reject_event BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  await assert.rejects(updateListingEvent(env, op), /synthetic failure/);
  assert.equal(listing(env).sale_price, 779000);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_event_context').get().n, 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_event_operations').get().n, 0);
  env.DB.raw.exec('DROP TRIGGER reject_event');
  assert.equal((await updateListingEvent(env, op)).replayed, false);
  assert.equal(events(env).length, 1);
});

test('EST-18: contact and viewing retention leaves property history intact', async () => {
  const { runRetention } = await import('../../server/retention.js');
  const { env, cookie } = await fixture();
  assert.equal((await call(env, 'POST', '/admin/listings/HE-R001/confirm', { cookie })).status, 200);
  const before = events(env);
  const b = await call(env, 'POST', '/admin/applicants', { cookie,
    body: { name: 'Synthetic retention', email: 'retention@example.test', source: 'phone', operation: 'buy' } });
  assert.equal(b.status, 201);
  env.DB.raw.exec("UPDATE applicants SET search_state='resolved',resolved_at='2025-01-01T00:00:00.000Z',resolved_by='system',resolution_reason='Synthetic'; UPDATE contacts SET last_activity_at='2025-01-01T00:00:00.000Z'");
  env.DB.raw.prepare("INSERT INTO viewing_requests(kind,date,time,end_time,name,email,phone,status,created_at) VALUES('In person','2025-01-01','11:00','11:30','Synthetic','view@example.test','07797000000','completed',?)").run(T0);
  const result = await runRetention(env, '2026-11-07T12:00:00.000Z');
  assert.equal(result.contacts, 1); assert.equal(result.viewings, 1);
  assert.deepEqual(events(env), before);
  assert.deepEqual(env.DB.raw.prepare('PRAGMA foreign_key_check').all(), []);
});

// Delay only the first listing write, letting another real request commit between read and write.
function holdListingWrite(env) {
  const batch = env.DB.batch.bind(env.DB);
  let held = false, signal, release;
  const reached = new Promise(resolve => { signal = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  env.DB.batch = async stmts => {
    if (!held && stmts.some(s => s.sql.includes('UPDATE listings SET'))) {
      held = true; signal(); await gate;
    }
    return batch(stmts);
  };
  return { reached, release };
}

for (const firstAction of ['archive', 'publish']) test(`EST-18: concurrent archive rejects stale ${firstAction} without a second state event`, async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(T0) });
  const { env, cookie } = await fixture({ published: 0 });
  const hold = holdListingWrite(env); t.after(hold.release);
  const first = call(env, 'POST', `/admin/listings/HE-R001/${firstAction}`, { cookie });
  await hold.reached;
  t.mock.timers.tick(20);
  const winner = await call(env, 'POST', '/admin/listings/HE-R001/archive', { cookie });
  assert.equal(winner.status, 200);
  const archivedAt = listing(env).archived_at;
  hold.release();
  assert.equal((await first).status, 409);
  assert.equal(listing(env).archived_at, archivedAt); assert.equal(listing(env).published, 0);
  assert.deepEqual(events(env).map(e => e.type), ['listing.archived']);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_event_context').get().n, 0);
});

test('EST-18: concurrent restores allow only one effective transition', async t => {
  const { env, cookie } = await fixture({ published: 0, archived_at: T0 });
  const hold = holdListingWrite(env); t.after(hold.release);
  const first = call(env, 'POST', '/admin/listings/HE-R001/restore', { cookie });
  await hold.reached;
  assert.equal((await call(env, 'POST', '/admin/listings/HE-R001/restore', { cookie })).status, 200);
  hold.release(); assert.equal((await first).status, 409);
  assert.deepEqual(events(env).map(e => e.type), ['listing.restored']);
});
