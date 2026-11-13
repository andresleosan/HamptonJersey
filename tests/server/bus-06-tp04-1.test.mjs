import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeDb } from './helpers.mjs';

// A missing implementation is an explicit failing assertion, not a loader error.
let store;
try { store = await import('../../server/market-inventory-store.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const needStore = () => assert.ok(store, 'BUS-06 inventory store is not implemented yet');
const time = new Date().toISOString();
const later = seconds => new Date(Date.parse(time) + seconds * 1000).toISOString();
const clock = value => () => new Date(value);
const actor = 'fixture-staff';
const manifest = 'fixture-revision';
const source = 'fixture-source';
const channel = 'fixture-channel';
const op = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sql = (db, query, ...params) => db.prepare(query).bind(...params).run();
const count = async (db, table) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;

async function seed(db) {
  await sql(db, `INSERT INTO market_directory_manifests
    (revision, sha256, accepted_at, reviewer_ref, status) VALUES (?, ?, ?, ?, 'accepted')`,
    manifest, 'a'.repeat(64), time, 'fixture-review');
  await sql(db, `INSERT INTO market_sources
    (source_ref, channel_id, directory_revision, source_kind, source_class, access_status, method,
     policy_version, evidence_ref, retention_ref, reviewed_at, review_due_at, allowed_hosts, min_interval_s)
    VALUES (?, ?, ?, 'external', 'general', 'allowed', 'manual', 1, 'fixture-evidence', 'fixture-retention', ?, ?, '["fixture.invalid"]', 60)`,
    source, channel, manifest, '2000-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z');
}

async function start(db, operation = 1) {
  return store.createInventoryRun({ DB: db }, { kind: 'initial', manifest_revision: manifest, operation_id: op(operation) }, actor, clock(time));
}
async function claim(db, run, when = time) {
  return store.claimSourcePage({ DB: db }, { run_id: run.id, source_ref: source, channel_id: channel }, clock(when));
}
function page(overrides = {}) {
  return { page_key: 'page-one', cursor: null, next_cursor: 'next-page', exhausted: false,
    observed_at: time, records: [{ external_key: 'fixture-listing', raw: { title: 'Example' },
      normalized: { operation: 'rent', bedrooms: 1 }, source_at: time }], ...overrides };
}
const commit = (db, lease, data = page(), when = time) =>
  store.commitObservationPage({ DB: db }, { lease, page: data }, actor, clock(when));

test('initial inventory requires an accepted external directory and operation IDs are idempotent', async () => {
  needStore();
  const db = makeDb();
  await assert.rejects(start(db), error => error.status === 409);
  assert.equal(await count(db, 'market_runs'), 0);
  await seed(db);
  const first = await start(db), retry = await start(db);
  assert.equal(retry.id, first.id);
  await assert.rejects(start(db, 2), error => error.status === 409);
  assert.equal(await count(db, 'market_runs'), 1);
});

test('a daily run is unique by Jersey date and a later retry reconciles its original operation', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const create = (operation, at) => store.createInventoryRun({ DB: db },
    { kind: 'daily', manifest_revision: manifest, operation_id: op(operation) }, actor, clock(at));
  const first = await create(10, '2026-10-24T23:30:00.000Z');
  assert.equal(first.jersey_day, '2026-10-25');
  await assert.rejects(create(11, '2026-10-25T01:30:00.000Z'), error => error.status === 409);
  const retry = await create(10, '2026-10-26T05:00:00.000Z');
  assert.equal(retry.id, first.id);
  assert.equal(await count(db, 'market_runs'), 1);
});

test('an internal pilot never claims coverage of external sources', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  await sql(db, `INSERT INTO market_sources(source_ref,channel_id,source_kind,source_class,access_status,method,
    policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at) VALUES ('fixture-own','catalog','internal',
    'internal','allowed','internal',1,'fixture-policy','fixture-retention','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')`);
  const run = await store.createInventoryRun({ DB: db }, { kind: 'own_pilot', operation_id: op(12) }, actor, clock(time));
  const result = await store.getInventoryCoverage({ DB: db }, { run_id: run.id });
  assert.equal(result.overall.external_coverage, 'unknown');
  assert.deepEqual(result.sources.map(item => item.source_ref), ['fixture-own']);
});

test('the same page is committed once and changing its contents conflicts', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const run = await start(db), lease = await claim(db, run);
  assert.deepEqual(await commit(db, lease), { accepted: true, replayed: false, next_cursor: 'next-page' });
  assert.deepEqual(await commit(db, lease), { accepted: true, replayed: true, next_cursor: 'next-page' });
  await assert.rejects(commit(db, lease, page({ next_cursor: 'different' })), error => error.status === 409);
  assert.equal(await count(db, 'market_pages'), 1);
  assert.equal(await count(db, 'market_observations'), 1);
  assert.equal(await count(db, 'market_change_outbox'), 1);
});

test('revocation after acquisition and paused runs block all writes', async () => {
  needStore();
  for (const change of [
    "UPDATE market_sources SET access_status='denied', policy_version=policy_version+1",
    "UPDATE market_runs SET status='paused', version=version+1",
  ]) {
    const db = makeDb(); await seed(db);
    const run = await start(db), lease = await claim(db, run);
    await sql(db, change);
    await assert.rejects(commit(db, lease), error => error.status === 409);
    assert.equal(await count(db, 'market_pages'), 0);
    assert.equal(await count(db, 'market_observations'), 0);
    assert.equal(await count(db, 'market_change_outbox'), 0);
  }
});

test('an expired lease cannot commit after the next worker acquires a newer generation', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const run = await start(db), old = await claim(db, run);
  await sql(db, 'UPDATE market_source_runs SET lease_until=? WHERE run_id=?', new Date(Date.now() - 1000).toISOString(), run.id);
  await sql(db, "UPDATE market_source_activity SET lease_until='2000-01-01T00:00:00.000Z',last_acquired_at='2000-01-01T00:00:00.000Z'");
  const recent = await claim(db, run, later(121));
  assert.ok(recent.generation > old.generation);
  await assert.rejects(commit(db, old, page(), later(122)), error => error.status === 409);
  assert.equal(await count(db, 'market_pages'), 0);
  assert.equal((await commit(db, recent, page(), later(122))).accepted, true);
});

test('a channel has one active acquisition and one shared rate limit across runs', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const first = await start(db), lease = await claim(db, first);
  const second = await store.createInventoryRun({ DB: db },
    { kind: 'daily', manifest_revision: manifest, operation_id: op(23) }, actor, clock(time));
  await assert.rejects(claim(db, second), error => error.status === 409);
  await commit(db, lease);
  await assert.rejects(claim(db, second), error => error.status === 409);
  await sql(db, `UPDATE market_source_activity SET last_acquired_at='2000-01-01T00:00:00.000Z'
    WHERE source_ref=? AND channel_id=?`, source, channel);
  assert.equal((await claim(db, second)).run_id, second.id);
});

test('a page commit does not delete an unrelated transaction guard', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const run = await start(db), lease = await claim(db, run);
  await sql(db, "INSERT INTO market_commit_guard(id,allowed) VALUES ('unrelated',1)");
  await commit(db, lease);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM market_commit_guard WHERE id='unrelated'").first()).n, 1);
});

test('a lease expired on the database clock cannot commit with an older caller clock', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const run = await start(db), lease = await claim(db, run);
  const stale = new Date(Date.now() - 1000).toISOString();
  await sql(db, 'UPDATE market_source_runs SET lease_until=? WHERE run_id=?', stale, run.id);
  const olderCallerClock = new Date(Date.parse(stale) - 1000).toISOString();
  await assert.rejects(commit(db, lease, page(), olderCallerClock), error => error.status === 409);
  assert.equal(await count(db, 'market_pages'), 0);
});

test('a revoked manifest cannot be silently restored for an old run', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const run = await start(db), lease = await claim(db, run);
  await sql(db, "UPDATE market_directory_manifests SET status='revoked' WHERE revision=?", manifest);
  await assert.rejects(sql(db, "UPDATE market_directory_manifests SET status='accepted' WHERE revision=?", manifest));
  await assert.rejects(commit(db, lease), error => error.status === 409);
  assert.equal(await count(db, 'market_pages'), 0);
});

test('coverage is unknown after access is revoked even if an earlier pass was marked complete', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const run = await start(db);
  await sql(db, "UPDATE market_source_runs SET status='complete' WHERE run_id=?", run.id);
  await sql(db, "UPDATE market_sources SET access_status='denied', policy_version=policy_version+1");
  const result = await store.getInventoryCoverage({ DB: db }, { run_id: run.id });
  assert.equal(result.overall.external_coverage, 'unknown');
  assert.equal(result.sources[0].access_status, 'denied');
});

test('access cannot become allowed without evidence authorizing retention', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  await assert.rejects(sql(db, 'UPDATE market_sources SET retention_ref=NULL, policy_version=policy_version+1'));
  await sql(db, "UPDATE market_sources SET retention_ref=NULL, access_status='denied', policy_version=policy_version+1");
  const run = await start(db);
  await assert.rejects(claim(db, run), error => error.status === 409);
  assert.equal(await count(db, 'market_observations'), 0);
});

test('new policy and method do not inherit complete coverage from an earlier policy', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  await sql(db, "UPDATE market_sources SET method='http', policy_version=policy_version+1");
  const run = await start(db), lease = await claim(db, run);
  await commit(db, lease, page({ exhausted: true, next_cursor: null }));
  assert.equal((await store.getInventoryCoverage({ DB: db }, { run_id: run.id })).overall.external_coverage, 'complete');
  await sql(db, "UPDATE market_sources SET access_status='denied', policy_version=policy_version+1");
  await sql(db, "UPDATE market_sources SET access_status='manual_only', method='manual', policy_version=policy_version+1");
  assert.equal((await store.getInventoryCoverage({ DB: db }, { run_id: run.id })).overall.external_coverage, 'unknown');
});

test('a material change with the same source timestamp still enters the outbox', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const first = await start(db), firstLease = await claim(db, first);
  await commit(db, firstLease);
  await sql(db, "UPDATE market_source_activity SET last_acquired_at='2000-01-01T00:00:00.000Z'");
  const second = await store.createInventoryRun({ DB: db },
    { kind: 'daily', manifest_revision: manifest, operation_id: op(22) }, actor, clock(time));
  const secondLease = await claim(db, second);
  await commit(db, secondLease, page({ records: [{ external_key: 'fixture-listing', raw: { title: 'Changed' },
    normalized: { operation: 'rent', bedrooms: 2 }, source_at: time }] }));
  assert.equal(await count(db, 'market_observations'), 2);
  assert.equal(await count(db, 'market_change_outbox'), 2);
});

test('an outbox failure rolls back the page, observations and cursor', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const run = await start(db), lease = await claim(db, run);
  await sql(db, "CREATE TRIGGER fixture_outbox_failure BEFORE INSERT ON market_change_outbox BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
  await assert.rejects(commit(db, lease));
  for (const table of ['market_pages', 'market_observations', 'market_change_outbox']) assert.equal(await count(db, table), 0);
  assert.equal((await db.prepare('SELECT cursor FROM market_source_runs WHERE run_id=?').bind(run.id).first()).cursor, null);
});

test('an unknown batch response reconciles the existing receipt before repeating work', async () => {
  needStore();
  const db = makeDb(); await seed(db);
  const run = await start(db), lease = await claim(db, run);
  const batch = db.batch.bind(db); let once = true;
  db.batch = async statements => {
    const result = await batch(statements);
    if (once) { once = false; throw new Error('fixture: lost response'); }
    return result;
  };
  assert.deepEqual(await commit(db, lease), { accepted: true, replayed: true, next_cursor: 'next-page' });
  assert.equal(await count(db, 'market_pages'), 1);
  assert.equal(await count(db, 'market_observations'), 1);
});

test('real local D1 rolls back a failing page batch and rejects stale leases', async () => {
  needStore();
  const require = createRequire(import.meta.url);
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const { unstable_splitSqlQuery } = require('wrangler');
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default {fetch(){return new Response('fixture')}}", compatibilityDate: '2025-10-01',
    host: '127.0.0.1', port: 0, d1Databases: { DB: 'market-synthetic' } }));
  try {
    const db = await mf.getD1Database('DB'), dir = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter(f => f.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), 'utf8')).map(statement => db.prepare(statement)));
    await seed(db);
    const run = await start(db), old = await claim(db, run);
    await sql(db, 'UPDATE market_source_runs SET lease_until=? WHERE run_id=?', new Date(Date.now() - 1000).toISOString(), run.id);
    await sql(db, "UPDATE market_source_activity SET lease_until='2000-01-01T00:00:00.000Z',last_acquired_at='2000-01-01T00:00:00.000Z'");
    const current = await claim(db, run, later(121));
    await assert.rejects(commit(db, old, page(), later(122)), error => error.status === 409);
    await sql(db, "CREATE TRIGGER fixture_outbox_failure BEFORE INSERT ON market_change_outbox BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    await assert.rejects(commit(db, current, page(), later(122)));
    for (const table of ['market_pages', 'market_observations', 'market_change_outbox']) assert.equal(await count(db, table), 0);
    assert.equal((await db.prepare('SELECT cursor FROM market_source_runs WHERE run_id=?').bind(run.id).first()).cursor, null);
    await sql(db, 'DROP TRIGGER fixture_outbox_failure');
    assert.equal((await commit(db, current, page(), later(122))).accepted, true);
    assert.equal(await count(db, 'market_observations'), 1);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  } finally { await mf.dispose(); }
});

test('real local D1 serializes the same channel across runs and rejects a late result', async () => {
  needStore();
  const require = createRequire(import.meta.url);
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const { unstable_splitSqlQuery } = require('wrangler');
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default {fetch(){return new Response('fixture')}}", compatibilityDate: '2025-10-01',
    host: '127.0.0.1', port: 0, d1Databases: { DB: 'market-channel-synthetic' } }));
  try {
    const db = await mf.getD1Database('DB'), dir = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter(f => f.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), 'utf8')).map(statement => db.prepare(statement)));
    await seed(db);
    const runs = [await start(db), await store.createInventoryRun({ DB: db },
      { kind: 'daily', manifest_revision: manifest, operation_id: op(24) }, actor, clock(time))];
    const outcomes = await Promise.allSettled(runs.map(run => claim(db, run)));
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(item => item.status === 'rejected' && item.reason.status === 409).length, 1);
    const winner = outcomes.findIndex(item => item.status === 'fulfilled');
    const loser = 1 - winner, oldLease = outcomes[winner].value;
    await sql(db, "UPDATE market_source_activity SET lease_until='2000-01-01T00:00:00.000Z'");
    await assert.rejects(claim(db, runs[loser]), error => error.status === 409);
    await sql(db, "UPDATE market_source_activity SET last_acquired_at='2000-01-01T00:00:00.000Z'");
    const newLease = await claim(db, runs[loser]);
    await assert.rejects(commit(db, oldLease), error => error.status === 409);
    assert.equal(await count(db, 'market_pages'), 0);
    assert.equal((await commit(db, newLease)).accepted, true);
    assert.equal(await count(db, 'market_pages'), 1);
  } finally { await mf.dispose(); }
});
