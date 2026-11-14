// BUS-06: the directory manifest, manual batches and coverage, through the routes. Synthetic sources only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeEnv, call, adminCookie } from './helpers.mjs';

const op = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = text => createHash('sha256').update(text).digest('hex');
const channel = (source_ref, channel_id, over = {}) => ({ source_ref, channel_id, source_kind: 'external',
  source_class: 'unclassified', access_status: 'pending', coverage_claim: 'unknown', channel_url_known: true,
  review_state: 'terms_and_method_review', handoff_row: 2, ...over });
const candidate = (revision = 'bus23-fixture-1', channels = [channel('agency-a', 'web'), channel('agency-b', 'web'),
  channel('portal-h', 'web', { source_class: 'homely', review_state: 'excluded_by_project' })]) =>
  JSON.stringify({ schema_version: 1, status: 'candidate_not_authorized', revision, channels }) + '\n';
const count = (env, table) => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const ready = async () => { const env = makeEnv(); env.MARKET_INVENTORY_READY = '1'; return { env, cookie: await adminCookie() }; };
const accept = (env, cookie, manifest = candidate(), sha256 = sha(manifest)) =>
  call(env, 'POST', '/admin/market/manifests', { cookie, body: { manifest, sha256 } });
const review = (env, cookie, over = {}) => call(env, 'POST', '/admin/market/sources/review', { cookie, body: {
  source_ref: 'agency-a', channel_id: 'web', version: 1, operation_id: op(90), source_class: 'general', status: 'manual_only',
  method: 'manual', allowed_hosts: ['agency-a.example.test'], allowed_paths: ['/properties'], allowed_redirect_hosts: [],
  min_interval_s: 60, evidence_ref: 'fixture-evidence', retention_ref: 'fixture-retention',
  review_due_at: '2999-01-01T00:00:00.000Z', ...over } });
const start = (env, cookie, n = 1, manifest_revision = 'bus23-fixture-1') =>
  call(env, 'POST', '/admin/market/runs', { cookie, body: { kind: 'initial', manifest_revision, operation_id: op(n) } });
const stamp = offset => new Date(Date.now() + offset).toISOString();
function batch(run_id, over = {}) {
  const at = stamp(-3000);
  return { schema_version: 1, run_id, source_ref: 'agency-a', channel_id: 'web', policy_version: 2, page_key: 'batch-1',
    observed_at: at, records: [{ external_key: 'ref-1', source_at: at, listing_url: 'https://agency-a.example.test/properties/one',
      observation: { country_code: 'JE', territory_evidence: 'fixture:territory', operation: 'rent', observed_at: at,
        title: 'Synthetic flat', bedrooms: 2, financial_terms: [{ kind: 'rent', amount_minor: 150000, currency: 'GBP',
          period: 'month', raw_text: 'Synthetic rent', evidence_ref: 'fixture:rent' }] } }], ...over };
}
const upload = (env, cookie, body) => call(env, 'POST', '/admin/market/manual-pages', { cookie, body });
const coverage = async (env, cookie, id) => (await call(env, 'GET', `/admin/market/runs/${id}/coverage`, { cookie })).data;

test('the manifest route is gated, needs staff and same origin, and grants nothing', async () => {
  const env = makeEnv(), cookie = await adminCookie(), manifest = candidate();
  assert.equal((await accept(env, cookie)).status, 404);
  env.MARKET_INVENTORY_READY = '1';
  assert.equal((await call(env, 'POST', '/admin/market/manifests', { body: { manifest, sha256: sha(manifest) } })).status, 401);
  assert.equal((await call(env, 'POST', '/admin/market/manifests',
    { cookie, origin: 'https://attacker.test', body: { manifest, sha256: sha(manifest) } })).status, 403);
  assert.equal(count(env, 'market_directory_manifests'), 0);
  const done = await accept(env, cookie);
  assert.equal(done.status, 201);
  assert.deepEqual({ revision: done.data.manifest.revision, channels: done.data.manifest.channels },
    { revision: 'bus23-fixture-1', channels: 3 });
  const row = env.DB.raw.prepare('SELECT * FROM market_directory_manifests').get();
  assert.equal(row.reviewer_ref, 'admin@example.test'); assert.equal(row.sha256, sha(manifest)); assert.equal(row.status, 'accepted');
  const sources = env.DB.raw.prepare('SELECT * FROM market_sources ORDER BY source_ref').all();
  assert.deepEqual(sources.map(s => [s.source_ref, s.source_class, s.access_status, s.method, s.next_action, s.directory_revision]), [
    ['agency-a', 'unclassified', 'pending', null, 'terms_and_method_review', 'bus23-fixture-1'],
    ['agency-b', 'unclassified', 'pending', null, 'terms_and_method_review', 'bus23-fixture-1'],
    ['portal-h', 'homely', 'pending', null, 'excluded_by_project', 'bus23-fixture-1']]);
  const list = await call(env, 'GET', '/admin/market/manifests', { cookie });
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.manifests.map(m => [m.revision, m.status, m.channels]), [['bus23-fixture-1', 'accepted', 3]]);
  assert.equal(JSON.stringify(list.data).includes('admin@example.test'), false);
});

test('a manifest whose fingerprint or contents are wrong writes nothing', async () => {
  const { env, cookie } = await ready();
  assert.equal((await accept(env, cookie, candidate(), 'b'.repeat(64))).status, 400);
  for (const channels of [[], [channel('a', 'web'), channel('a', 'web')], [channel('a', 'web', { source_kind: 'internal' })],
    [channel('a', 'web', { source_class: 'internal' })], [channel('', 'web')]])
    assert.equal((await accept(env, cookie, candidate('bus23-bad', channels))).status, 400);
  assert.equal((await accept(env, cookie, '{"schema_version":2}')).status, 400);
  assert.equal((await accept(env, cookie, 'not json')).status, 400);
  assert.equal(count(env, 'market_directory_manifests') + count(env, 'market_sources'), 0);
});

test('accepting twice is a replay; the same revision with other contents is refused', async () => {
  const { env, cookie } = await ready();
  assert.equal((await accept(env, cookie)).status, 201);
  const again = await accept(env, cookie);
  assert.equal(again.status, 200); assert.equal(again.data.manifest.channels, 3);
  assert.equal((await accept(env, cookie, candidate('bus23-fixture-1', [channel('other', 'web')]))).status, 409);
  assert.equal(count(env, 'market_sources'), 3);
});

test('a later revision moves the channels it lists and keeps each reviewed decision', async () => {
  const { env, cookie } = await ready();
  await accept(env, cookie);
  assert.equal((await review(env, cookie)).status, 200);
  const next = candidate('bus23-fixture-2', [channel('agency-a', 'web', { review_state: 'manual_review_required' }), channel('agency-c', 'web')]);
  assert.equal((await accept(env, cookie, next)).status, 201);
  const rows = env.DB.raw.prepare('SELECT source_ref,directory_revision,source_class,access_status,policy_version,next_action FROM market_sources ORDER BY source_ref').all();
  assert.deepEqual(rows.map(r => Object.values(r)), [
    ['agency-a', 'bus23-fixture-2', 'general', 'manual_only', 3, 'manual_review_required'],
    ['agency-b', 'bus23-fixture-1', 'unclassified', 'pending', 1, 'terms_and_method_review'],
    ['agency-c', 'bus23-fixture-2', 'unclassified', 'pending', 1, 'terms_and_method_review'],
    ['portal-h', 'bus23-fixture-1', 'homely', 'pending', 1, 'excluded_by_project']]);
});

test('a later revision never reopens a channel of a revoked directory nor one it classes as restricted', async () => {
  const { env, cookie } = await ready();
  await accept(env, cookie);
  assert.equal((await review(env, cookie)).status, 200);
  assert.equal((await review(env, cookie, { source_ref: 'agency-b', operation_id: op(91) })).status, 200);
  env.DB.raw.prepare("UPDATE market_directory_manifests SET status='revoked' WHERE revision='bus23-fixture-1'").run();
  const next = candidate('bus23-fixture-2', [channel('agency-a', 'web')]);
  assert.equal((await accept(env, cookie, next)).status, 201);
  const state = ref => Object.values(env.DB.raw.prepare('SELECT source_class,access_status FROM market_sources WHERE source_ref=?').get(ref));
  assert.deepEqual(state('agency-a'), ['general', 'pending'], 'a revoked directory leaves its decision behind');
  // The directory itself now says the channel is Homely: it closes and the reviewer cannot class it back to general.
  const third = candidate('bus23-fixture-3', [channel('agency-a', 'web', { source_class: 'homely' }),
    channel('agency-b', 'web', { source_class: 'jfsc' })]);
  assert.equal((await accept(env, cookie, third)).status, 201);
  assert.deepEqual(state('agency-a'), ['homely', 'pending']);
  assert.deepEqual(state('agency-b'), ['jfsc', 'pending'], 'every class that cannot be granted closes the channel');
  assert.equal((await review(env, cookie, { version: 4, operation_id: op(92) })).status, 409);
  assert.equal((await review(env, cookie, { source_ref: 'agency-b', version: 3, operation_id: op(93) })).status, 409);
  assert.deepEqual(state('agency-a'), ['homely', 'pending']);
  assert.deepEqual(state('agency-b'), ['jfsc', 'pending']);
});

test('a reviewed channel takes a manual batch; unread channels stay pending and are never counted as empty', async () => {
  const { env, cookie } = await ready();
  await accept(env, cookie);
  assert.equal((await review(env, cookie)).status, 200);
  const run = (await start(env, cookie)).data.run;
  const before = await coverage(env, cookie, run.id);
  assert.deepEqual(before.sources.map(s => [s.source_ref, s.listings, s.policy_version]).sort(),
    [['agency-a', null, 2], ['agency-b', null, 1], ['portal-h', null, 1]]);
  const saved = await upload(env, cookie, batch(run.id));
  assert.equal(saved.status, 201); assert.deepEqual(saved.data, { accepted: true, records: 1 });
  const after = await coverage(env, cookie, run.id), by = Object.fromEntries(after.sources.map(s => [s.source_ref, s]));
  assert.equal(by['agency-a'].listings, 1); assert.ok(by['agency-a'].last_capture_at);
  assert.equal(by['agency-a'].status, 'pending'); assert.equal(by['agency-a'].last_full_pass_at, null);
  assert.equal(by['agency-b'].listings, null); assert.equal(by['agency-b'].last_capture_at, null);
  assert.equal(by['portal-h'].listings, null); assert.equal(by['portal-h'].next_action, 'excluded_by_project');
  assert.equal(after.overall.external_coverage, 'unknown');
  const stored = env.DB.raw.prepare('SELECT source_ref,external_key FROM market_observations').all();
  assert.deepEqual(stored.map(r => Object.values(r)), [['agency-a', 'ref-1']]);
  assert.equal(env.DB.raw.prepare('SELECT committed_by FROM market_pages').get().committed_by, 'admin@example.test');
  // The channel's minimum interval also holds for manual batches: the next one waits, and nothing partial is kept.
  assert.equal((await upload(env, cookie, batch(run.id, { page_key: 'batch-2' }))).status, 409);
  assert.equal(count(env, 'market_pages'), 1);
});

test('a manual batch is refused without writes when the channel, decision, links or body are not valid', async () => {
  const { env, cookie } = await ready();
  await accept(env, cookie); await review(env, cookie);
  const run = (await start(env, cookie)).data.run;
  const refused = async (body, status) => assert.equal((await upload(env, cookie, body)).status, status, JSON.stringify(body).slice(0, 160));
  await refused(batch(run.id, { source_ref: 'agency-b', policy_version: 1 }), 409); // never reviewed
  await refused(batch(run.id, { source_ref: 'portal-h', policy_version: 1 }), 409); // excluded by the project
  await refused(batch(run.id, { policy_version: 1 }), 409); // decision changed since the form was loaded
  const outside = batch(run.id); outside.records[0].listing_url = 'https://elsewhere.example.test/properties/one';
  await refused(outside, 400);
  await refused(batch('20000000-0000-4000-8000-999999999999'), 404);
  await refused({ ...batch(run.id), exhausted: true }, 400);
  await refused(batch(run.id, { records: [] }), 400);
  const noTerritory = batch(run.id); delete noTerritory.records[0].observation.territory_evidence;
  await refused(noTerritory, 400);
  assert.equal(count(env, 'market_pages') + count(env, 'market_observations'), 0);
  assert.equal((await call(env, 'POST', '/admin/market/manual-pages', { body: batch(run.id) })).status, 401);
  // None of the refusals used up the channel: a valid batch is recorded straight away.
  assert.equal((await upload(env, cookie, batch(run.id))).status, 201);
});

test('closing a batch keeps its history, stops uploads and lets the next batch start', async () => {
  const { env, cookie } = await ready();
  await accept(env, cookie); await review(env, cookie);
  const run = (await start(env, cookie)).data.run, path = `/admin/market/runs/${run.id}/close`;
  assert.equal((await start(env, cookie, 2)).status, 409);
  assert.equal((await upload(env, cookie, batch(run.id))).status, 201);
  assert.equal((await call(env, 'POST', path, { cookie, body: { version: 9, operation_id: op(3) } })).status, 409);
  const closed = await call(env, 'POST', path, { cookie, body: { version: run.version, operation_id: op(4) } });
  assert.equal(closed.status, 200); assert.equal(closed.data.run.status, 'partial');
  assert.equal((await call(env, 'POST', path, { cookie, body: { version: closed.data.run.version, operation_id: op(5) } })).status, 409);
  env.DB.raw.prepare("UPDATE market_source_activity SET last_acquired_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal((await upload(env, cookie, batch(run.id, { page_key: 'batch-2' }))).status, 409);
  assert.equal(count(env, 'market_observations'), 1);
  assert.equal((await start(env, cookie, 6)).status, 201);
});
