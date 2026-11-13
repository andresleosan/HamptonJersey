import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie } from './helpers.mjs';

const operation = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function seed(env) {
  const db = env.DB.raw;
  db.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,?,'accepted')")
    .run('fixture-rev', 'a'.repeat(64), '2000-01-01T00:00:00.000Z', 'fixture-review');
  db.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class,access_status,method,
    policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at) VALUES (?,?,?,'external','general','allowed','manual',1,?,?,?,?)`)
    .run('fixture-source', 'fixture-channel', 'fixture-rev', 'fixture-evidence', 'fixture-retention', '2000-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z');
}

test('market routes remain unavailable by default, including before the migration is applied', async () => {
  const env = makeEnv();
  env.DB.raw.exec('DROP TABLE market_runs');
  const cookie = await adminCookie();
  const result = await call(env, 'GET', '/admin/market/runs', { cookie });
  assert.equal(result.status, 404);
  assert.equal((await call(env, 'GET', '/admin/automations', { cookie })).status, 200);
});

test('inventory routes require staff and same-origin; an accepted run exposes only coverage metadata', async () => {
  const env = makeEnv(); env.MARKET_INVENTORY_READY = '1'; seed(env);
  const body = { kind: 'initial', manifest_revision: 'fixture-rev', operation_id: operation(1) };
  assert.equal((await call(env, 'GET', '/admin/market/runs')).status, 401);
  const cookie = await adminCookie();
  assert.equal((await call(env, 'POST', '/admin/market/runs', { body, cookie, origin: 'https://attacker.test' })).status, 403);
  const created = await call(env, 'POST', '/admin/market/runs', { body, cookie });
  assert.equal(created.status, 201);
  assert.equal(created.data.run.status, 'open');
  assert.equal(created.data.run.created_by, undefined);
  const listing = await call(env, 'GET', '/admin/market/runs', { cookie });
  assert.equal(listing.status, 200);
  assert.equal(listing.data.runs[0].id, created.data.run.id);
  const coverage = await call(env, 'GET', `/admin/market/runs/${created.data.run.id}/coverage`, { cookie });
  assert.equal(coverage.status, 200);
  assert.equal(coverage.data.overall.external_coverage, 'unknown');
  assert.equal(coverage.headers.get('cache-control'), 'no-store');
});

test('pause and resume reject stale versions and reconcile duplicate actions', async () => {
  const env = makeEnv(); env.MARKET_INVENTORY_READY = '1'; seed(env);
  const cookie = await adminCookie();
  const created = await call(env, 'POST', '/admin/market/runs', { cookie,
    body: { kind: 'initial', manifest_revision: 'fixture-rev', operation_id: operation(2) } });
  const run = created.data.run;
  const pause = { version: run.version, operation_id: operation(3) };
  const path = `/admin/market/runs/${run.id}/pause`;
  const first = await call(env, 'POST', path, { cookie, body: pause });
  assert.equal(first.status, 200);
  assert.equal(first.data.run.status, 'paused');
  assert.deepEqual((await call(env, 'POST', path, { cookie, body: pause })).data, first.data);
  assert.equal((await call(env, 'POST', `/admin/market/runs/${run.id}/resume`,
    { cookie, body: { version: run.version, operation_id: operation(4) } })).status, 409);
  const resumed = await call(env, 'POST', `/admin/market/runs/${run.id}/resume`,
    { cookie, body: { version: first.data.run.version, operation_id: operation(5) } });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.data.run.status, 'open');
});
