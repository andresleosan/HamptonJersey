import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedListing, seedMedia, call, adminCookie, T0 } from './helpers.mjs';

const PATH = '/admin/listings/HE-R001/media';
const row = (env, id) => env.DB.raw.prepare('SELECT * FROM media WHERE id=?').get(id);
const plain = value => JSON.parse(JSON.stringify(value));
function snapshot(env) {
  return plain(Object.fromEntries(['listings','media','events','notifications','listing_event_context'].map(table =>
    [table, env.DB.raw.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'listing_event_context' ? 'listing_id' : 'id'}`).all()])));
}
function cleanContext(env) {
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM listing_event_context').get().n, 0);
}
function item(id, over = {}) {
  return { id, position: id === 'A00001' ? 1 : 0, public: true, kind: 'photo', label: `Saved ${id}`, ...over };
}
function payload(over = {}) {
  return { updated_at: T0, cover_media_id: 'A00001', items: [item('A00001'), item('A00002')], ...over };
}
async function fixture() {
  const env = makeEnv(); seedListing(env, { published: 0 }); seedListing(env, { id: 'HE-R002', published: 0 });
  for (const [id, position] of [['A00001',0],['A00002',1],['A00003',2]])
    seedMedia(env, { id, origin: 'upload', position, label: `Before ${id}`, r2_key: `synthetic/${id}.jpg`, thumb_key: `synthetic/${id}-thumb.jpg` });
  const cookie = await adminCookie();
  return { env, cookie, save: body => call(env, 'PUT', PATH, { cookie, body }) };
}
const mediaWrite = statements => statements.some(s => /\bUPDATE\s+listings\b/i.test(s.sql));
function beforeNextWrite(env, action) {
  const original = env.DB.batch.bind(env.DB);
  let pending = action;
  env.DB.batch = async statements => {
    if (pending && mediaWrite(statements)) {
      const run = pending; pending = null; await run();
    }
    return original(statements);
  };
}
function overlapWrites(env) {
  const original = env.DB.batch.bind(env.DB);
  let arrived = 0, release;
  const ready = new Promise(resolve => { release = resolve; });
  env.DB.batch = async statements => {
    if (mediaWrite(statements) && ++arrived <= 2) {
      if (arrived === 2) release();
      await ready;
    }
    return original(statements);
  };
}

test('PUB-11 media save commits cover, both media and listing revision together', async () => {
  const { env, save } = await fixture();
  const response = await save(payload());
  assert.equal(response.status, 200);
  const listing = env.DB.raw.prepare("SELECT * FROM listings WHERE id='HE-R001'").get();
  assert.equal(listing.cover_media_id, 'A00001'); assert.ok(listing.updated_at > T0);
  for (const desired of payload().items) {
    const actual = row(env, desired.id);
    for (const field of ['position','kind','label']) assert.equal(actual[field], desired[field]);
    assert.equal(actual.public, 1);
  }
  const events = env.DB.raw.prepare("SELECT * FROM events WHERE entity_type='listing' AND entity_id='HE-R001'").all();
  assert.equal(events.length, 1); assert.equal(JSON.parse(events[0].data).source, 'media');
  assert.equal(events[0].actor, 'admin@example.test');
  cleanContext(env);
});

test('PUB-11 failure on the second media rolls back first media, cover, revision and event', async () => {
  const { env, save } = await fixture();
  env.DB.raw.exec("CREATE TRIGGER fixture_media_abort BEFORE UPDATE ON media WHEN NEW.id='A00002' BEGIN SELECT RAISE(ABORT,'synthetic media failure'); END");
  const before = snapshot(env);
  assert.equal((await save(payload())).status, 500);
  assert.deepEqual(snapshot(env), before); cleanContext(env);
});

test('PUB-11 an ignored second media update aborts the save without partial metadata', async () => {
  const { env, save } = await fixture();
  env.DB.raw.exec("CREATE TRIGGER fixture_media_ignore BEFORE UPDATE ON media WHEN NEW.id='A00002' BEGIN SELECT RAISE(IGNORE); END");
  const before = snapshot(env);
  assert.equal((await save(payload())).status, 409);
  assert.deepEqual(snapshot(env), before); cleanContext(env);
});

test('PUB-11 event failure rolls back the entire media save', async () => {
  const { env, save } = await fixture();
  env.DB.raw.exec("CREATE TRIGGER fixture_event_abort BEFORE INSERT ON events WHEN NEW.entity_type='listing' BEGIN SELECT RAISE(ABORT,'synthetic event failure'); END");
  const before = snapshot(env);
  assert.equal((await save(payload())).status, 500);
  assert.deepEqual(snapshot(env), before); cleanContext(env);
});

test('PUB-11 concurrent saves with one listing revision preserve exactly one complete payload', async () => {
  const { env, save } = await fixture(); overlapWrites(env);
  const bodies = [payload({ items: [item('A00001',{position:10,label:'First A'}),item('A00002',{position:11,label:'First B'})] }),
    payload({ cover_media_id:'A00002', items:[item('A00001',{position:20,label:'Second A',public:false}),item('A00002',{position:21,label:'Second B'})] })];
  const responses = await Promise.all(bodies.map(save));
  assert.deepEqual(responses.map(r => r.status).sort(), [200,409]);
  const winner = bodies[responses.findIndex(r => r.status === 200)];
  assert.equal(env.DB.raw.prepare("SELECT cover_media_id FROM listings WHERE id='HE-R001'").get().cover_media_id, winner.cover_media_id);
  for (const desired of winner.items) {
    const actual = row(env, desired.id);
    for (const field of ['position','kind','label']) assert.equal(actual[field], desired[field]);
    assert.equal(actual.public, Number(desired.public));
  }
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE entity_type='listing' AND entity_id='HE-R001'").get().n, 1);
  cleanContext(env);
});

test('PUB-11 a stale editor adds no media changes, revisions or events', async () => {
  const { env, save } = await fixture(); assert.equal((await save(payload())).status, 200);
  const before = snapshot(env);
  assert.equal((await save(payload({ cover_media_id:'A00002', items:[item('A00001',{label:'Stale'})] }))).status,409);
  assert.deepEqual(snapshot(env), before); cleanContext(env);
});

for (const [name, sql] of [
  ['deleted', "DELETE FROM media WHERE id='A00002'"],
  ['moved to another listing', "UPDATE media SET listing_id='HE-R002' WHERE id='A00002'"],
  ['changed to external', "UPDATE media SET origin='external',public=0 WHERE id='A00002'"],
  ['renamed', "UPDATE media SET label='Concurrent label' WHERE id='A00002'"],
  ['changed kind', "UPDATE media SET kind='document' WHERE id='A00002'"],
  ['changed visibility', "UPDATE media SET public=0 WHERE id='A00002'"],
  ['reordered', "UPDATE media SET position=17 WHERE id='A00002'"],
]) {
  test(`PUB-11 requested media ${name} after preflight aborts and preserves the concurrent change`, async () => {
    const { env, save } = await fixture(); let concurrent;
    beforeNextWrite(env, () => { env.DB.raw.exec(sql); concurrent = snapshot(env); });
    assert.equal((await save(payload())).status,409);
    assert.ok(concurrent, 'race ran immediately before the write batch');
    assert.deepEqual(snapshot(env), concurrent); cleanContext(env);
  });
}

test('PUB-11 a valid own cover outside the submitted items remains supported', async () => {
  const { env, save } = await fixture(), spare = plain(row(env,'A00003'));
  assert.equal((await save(payload({cover_media_id:'A00003'}))).status,200);
  assert.equal(env.DB.raw.prepare("SELECT cover_media_id FROM listings WHERE id='HE-R001'").get().cover_media_id,'A00003');
  assert.deepEqual(plain(row(env,'A00003')),spare); cleanContext(env);
});

for (const [name, sql] of [
  ['deleted', "DELETE FROM media WHERE id='A00003'"],
  ['moved', "UPDATE media SET listing_id='HE-R002' WHERE id='A00003'"],
  ['changed to external', "UPDATE media SET origin='external',public=0 WHERE id='A00003'"],
  ['changed kind', "UPDATE media SET kind='document' WHERE id='A00003'"],
  ['renamed', "UPDATE media SET label='Concurrent cover' WHERE id='A00003'"],
]) {
  test(`PUB-11 cover outside items ${name} in the race aborts the entire save`, async () => {
    const { env, save } = await fixture(); let concurrent;
    beforeNextWrite(env, () => { env.DB.raw.exec(sql); concurrent=snapshot(env); });
    assert.equal((await save(payload({cover_media_id:'A00003'}))).status,409);
    assert.ok(concurrent); assert.deepEqual(snapshot(env),concurrent); cleanContext(env);
  });
}

test('PUB-11 deleting the listing before the batch returns 404 with no resurrected context', async () => {
  const { env, save } = await fixture(); let concurrent;
  beforeNextWrite(env, () => {env.DB.raw.exec("DELETE FROM listings WHERE id='HE-R001'");concurrent=snapshot(env);});
  assert.equal((await save(payload())).status,404);
  assert.ok(concurrent);assert.deepEqual(snapshot(env),concurrent);cleanContext(env);
});

test('PUB-11 duplicate media IDs are rejected before any database write', async () => {
  const { env, save } = await fixture(),before=snapshot(env);
  assert.equal((await save(payload({items:[item('A00001'),item('A00001',{position:2,label:'Duplicate'})]}))).status,400);
  assert.deepEqual(snapshot(env),before);cleanContext(env);
});

test('PUB-11 foreign media and a foreign cover are rejected without partial changes', async () => {
  const { env, save } = await fixture();seedMedia(env,{id:'B00001',listing_id:'HE-R002'});
  const before=snapshot(env);
  assert.equal((await save(payload({items:[item('A00001'),item('B00001')]}))).status,400);
  assert.deepEqual(snapshot(env),before);
  assert.equal((await save(payload({cover_media_id:'B00001'}))).status,400);
  assert.deepEqual(snapshot(env),before);cleanContext(env);
});

test('PUB-11 external media stay private and cannot be selected as cover even with a forged origin', async () => {
  const { env, save } = await fixture();seedMedia(env,{id:'E00001',origin:'external',public:0});
  const before=snapshot(env);
  assert.equal((await save(payload({items:[item('E00001',{origin:'upload',public:true})]}))).status,400);
  assert.deepEqual(snapshot(env),before);
  assert.equal((await save(payload({cover_media_id:'E00001'}))).status,400);
  assert.deepEqual(snapshot(env),before);
  assert.equal((await save(payload({items:[item('E00001',{public:false,label:'Private reference'})]}))).status,200);
  assert.equal(row(env,'E00001').origin,'external');assert.equal(row(env,'E00001').public,0);
  cleanContext(env);
});
