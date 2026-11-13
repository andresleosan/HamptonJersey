import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeDb } from './helpers.mjs';

let policy;
try { policy = await import('../../server/market-source-policy.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const needPolicy = () => assert.ok(policy, 'BUS-19 access policy is not implemented yet');
const sql = (db, query, ...params) => db.prepare(query).bind(...params).run();
const operation = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = new Date().toISOString(), actor = 'fixture-staff';
const clock = () => new Date(at);

async function seed(db, classification = 'general') {
  await sql(db, "INSERT INTO market_directory_manifests VALUES (?, ?, ?, ?, 'accepted')", 'fixture-rev', 'a'.repeat(64), at, 'fixture-review');
  await sql(db, `INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class,access_status)
    VALUES ('fixture-source','site','fixture-rev','external',?,'pending')`, classification);
}
const decision = (n, overrides = {}) => ({ source_ref: 'fixture-source', channel_id: 'site',
  operation_id: operation(n), status: 'allowed', method: 'http', allowed_hosts: ['fixture.invalid'],
  allowed_paths: ['/listings/'], allowed_redirect_hosts: [], min_interval_s: 60,
  evidence_ref: 'fixture-evidence', retention_ref: 'fixture-retention', review_due_at: '2999-01-01T00:00:00.000Z', ...overrides });

test('an accepted directory and an unknown source are pending, not permission', async () => {
  needPolicy(); const db = makeDb(); await seed(db);
  const known = await policy.getSourceAccess({ DB: db }, 'fixture-source', 'site');
  const unknown = await policy.getSourceAccess({ DB: db }, 'missing-source', 'site');
  assert.equal(known.status, 'pending');
  assert.equal(unknown.status, 'pending');
  assert.equal(unknown.version, null);
});

test('excluded and deferred sources cannot be enabled even with evidence', async () => {
  needPolicy();
  for (const classification of ['homely', 'jfsc', 'places', 'properties', 'unclassified']) {
    const db = makeDb(); await seed(db, classification);
    await assert.rejects(policy.reviewSourceAccess({ DB: db }, decision(1), actor, 1, clock), error => error.status === 409);
    assert.equal((await policy.getSourceAccess({ DB: db }, 'fixture-source', 'site')).status, 'pending');
  }
});

test('access and retention each require evidence; HTTP needs explicit host and path scope', async () => {
  needPolicy(); const db = makeDb(); await seed(db);
  for (const invalid of [
    { evidence_ref: null }, { retention_ref: null }, { allowed_hosts: [] }, { allowed_paths: [] },
    { allowed_hosts: ['127.0.0.1'] }, { allowed_hosts: ['localhost'] }, { allowed_paths: ['//other.example/path'] },
    { review_due_at: '2000-01-01T00:00:00.000Z' },
  ]) await assert.rejects(policy.reviewSourceAccess({ DB: db }, decision(2, invalid), actor, 1, clock), error => error.status === 400);
  assert.equal((await policy.getSourceAccess({ DB: db }, 'fixture-source', 'site')).status, 'pending');
});

test('decisions are versioned, old evidence is retained, and stale edits do not overwrite', async () => {
  needPolicy(); const db = makeDb(); await seed(db);
  const first = await policy.reviewSourceAccess({ DB: db }, decision(3), actor, 1, clock);
  assert.equal(first.version, 2); assert.equal(first.status, 'allowed');
  const retry = await policy.reviewSourceAccess({ DB: db }, decision(3), actor, 1, clock);
  assert.deepEqual(retry, first);
  await assert.rejects(policy.reviewSourceAccess({ DB: db }, decision(4, { status: 'denied' }), actor, 1, clock), error => error.status === 409);
  const revoked = await policy.reviewSourceAccess({ DB: db }, decision(5, { status: 'denied' }), actor, 2, clock);
  assert.equal(revoked.version, 3); assert.equal(revoked.status, 'denied');
  const history = await db.prepare('SELECT COUNT(*) AS n FROM market_source_policy_history').first();
  assert.equal(history.n, 2);
});

test('simultaneous reviews with the same version cannot both succeed', async () => {
  needPolicy(); const db = makeDb(); await seed(db);
  const results = await Promise.allSettled([3,4].map(n =>
    policy.reviewSourceAccess({ DB: db }, decision(n), actor, 1, clock)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM market_source_policy_history').first()).n, 1);
});

test('expired policy and revoked manifest return a non-authorizing effective status', async () => {
  needPolicy();
  for (const invalidate of [
    "UPDATE market_sources SET review_due_at='2000-01-01T00:00:00.000Z',policy_version=policy_version+1",
    "UPDATE market_directory_manifests SET status='revoked'",
  ]) {
    const db = makeDb(); await seed(db);
    await policy.reviewSourceAccess({ DB: db }, decision(6), actor, 1, clock);
    await sql(db, invalidate);
    const effective = await policy.getSourceAccess({ DB: db }, 'fixture-source', 'site');
    assert.equal(effective.status, 'pending');
    assert.equal(effective.method, null);
    assert.deepEqual(effective.allowed_hosts, []);
  }
});

test('a confirmed review can be reconciled after its permission expires', async () => {
  needPolicy(); const db = makeDb(); await seed(db);
  const due = new Date(Date.parse(at) + 10000).toISOString();
  const input = decision(7, { review_due_at: due });
  const saved = await policy.reviewSourceAccess({ DB: db }, input, actor, 1, clock);
  const afterExpiry = () => new Date(Date.parse(due) + 1000);
  assert.deepEqual(await policy.reviewSourceAccess({ DB: db }, input, actor, 1, afterExpiry), saved);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM market_source_policy_history').first()).n, 1);
});

test('real local D1 serializes policy reviews and rolls back if history fails', async () => {
  needPolicy();
  const require = createRequire(import.meta.url);
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const { unstable_splitSqlQuery } = require('wrangler');
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default {fetch(){return new Response('fixture')}}", compatibilityDate: '2025-10-01',
    host: '127.0.0.1', port: 0, d1Databases: { DB: 'market-policy-synthetic' } }));
  try {
    const db = await mf.getD1Database('DB'), dir = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter(name => name.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), 'utf8')).map(query => db.prepare(query)));
    await seed(db);
    const concurrent = await Promise.allSettled([10,11].map(n => policy.reviewSourceAccess({ DB: db }, decision(n), actor, 1, clock)));
    assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter(item => item.status === 'rejected' && item.reason.status === 409).length, 1);
    await sql(db, "CREATE TRIGGER fixture_history_failure BEFORE INSERT ON market_source_policy_history BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    await assert.rejects(policy.reviewSourceAccess({ DB: db }, decision(12, { status: 'denied' }), actor, 2, clock));
    const after = await policy.getSourceAccess({ DB: db }, 'fixture-source', 'site');
    assert.equal(after.version, 2);
    assert.equal(after.status, 'allowed');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM market_source_policy_history').first()).n, 1);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  } finally { await mf.dispose(); }
});
