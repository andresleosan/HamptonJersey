// BUS-10: the staff review of possible duplicate homes, through the real routes. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie } from './helpers.mjs';
import { createHash } from 'node:crypto';
import { normalizeObservation } from '../../server/market-extraction.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-11-14T10:00:00.000Z';
const count = (env, table) => env.DB.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

function setup({ ready = true } = {}) {
  const env = makeEnv(), db = env.DB.raw;
  env.MARKET_INVENTORY_READY = '1';
  if (ready) env.BUS10_IDENTITY_READY = '1';
  db.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,?,'accepted')")
    .run('fixture-rev', 'a'.repeat(64), '2000-01-01T00:00:00.000Z', 'fixture-review');
  for (const source of ['agency-a', 'agency-b', 'agency-c']) db.prepare(`INSERT INTO market_sources(source_ref,channel_id,
    directory_revision,source_kind,source_class,access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at)
    VALUES (?,'site','fixture-rev','external','general','allowed','manual',1,'evidence','retention',?,?)`)
    .run(source, '2000-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z');
  db.prepare(`INSERT INTO market_runs(id,kind,manifest_revision,manifest_sha256,operation_id,created_at,created_by)
    VALUES(?,'initial','fixture-rev',?,?,?,'fixture')`).run(id(100), 'a'.repeat(64), id(101), at);
  env.seq = 0;
  return env;
}
// One listing as the manual upload stores it: its own page and observation, normalised by the real normaliser.
function listing(env, source, key, over = {}) {
  const seq = ++env.seq, page = id(1000 + seq), observation = id(2000 + seq);
  const { operation = 'rent', title = 'Two bedroom flat', parish = 'St Helier', bedrooms = 2, bathrooms = 1, amount = 150000, seen = at } = over;
  const financial_terms = amount == null ? [] : [operation === 'sale'
    ? { kind: 'sale_price', amount_minor: amount, currency: 'GBP', period: 'sale' }
    : { kind: 'rent', amount_minor: amount, currency: 'GBP', period: 'month' }];
  const normalized = normalizeObservation({ country_code: 'JE', territory_evidence: 'Address on the listing: Jersey',
    operation, observed_at: seen, title, parish, bedrooms, bathrooms, financial_terms });
  env.DB.raw.prepare(`INSERT INTO market_pages(id,run_id,source_ref,channel_id,page_key,content_sha256,exhausted,observed_at,
    committed_at,committed_by,lease_token,lease_generation,policy_version) VALUES(?,?,?,'site',?,?,0,?,?,'fixture','fixture',1,1)`)
    .run(page, id(100), source, `page-${seq}`, 'b'.repeat(64), seen, seen);
  env.DB.raw.prepare(`INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,
    normalized_sha256,source_at,origin_sha256) VALUES(?,?,?,'site',?,?,?,?,?,?)`).run(observation, page, source, key,
    JSON.stringify({ listing_url: `https://${source}.example.test/properties/${key}` }), JSON.stringify(normalized),
    'c'.repeat(64), seen, 'd'.repeat(64));
  return observation;
}
const review = async (env, cookie) => (await call(env, 'GET', '/admin/market/identity', { cookie })).data;
let operations = 500;
const decide = (env, cookie, action, left, right, operation_id = id(++operations)) => call(env, 'POST', '/admin/market/identity/decisions',
  { cookie, body: { action, left_observation_id: left, right_observation_id: right, operation_id } });
const undo = (env, cookie, decision_id) => call(env, 'POST', '/admin/market/identity/undo',
  { cookie, body: { decision_id, operation_id: id(++operations) } });
const refs = candidate => [candidate.left.external_key, candidate.right.external_key].sort().join(' + ');

test('the review is absent with the switch off and needs a staff session on the same origin with it on', async () => {
  const off = setup({ ready: false }), cookie = await adminCookie();
  const a = listing(off, 'agency-a', 'A-1'), b = listing(off, 'agency-b', 'B-1');
  assert.equal((await call(off, 'GET', '/admin/market/identity', { cookie })).status, 404);
  assert.equal((await decide(off, cookie, 'same_property', a, b)).status, 404);
  assert.equal((await undo(off, cookie, id(1))).status, 404);
  assert.equal((await call(off, 'GET', '/admin/market/runs', { cookie })).status, 200);
  assert.equal(count(off, 'market_properties'), 0);

  const on = setup();
  const x = listing(on, 'agency-a', 'A-1'), y = listing(on, 'agency-b', 'B-1');
  assert.equal((await call(on, 'GET', '/admin/market/identity')).status, 401);
  assert.equal((await decide(on, undefined, 'same_property', x, y)).status, 401);
  assert.equal((await call(on, 'POST', '/admin/market/identity/decisions', { cookie, origin: 'https://attacker.test',
    body: { action: 'same_property', left_observation_id: x, right_observation_id: y, operation_id: id(2) } })).status, 403);
  const read = await call(on, 'GET', '/admin/market/identity', { cookie });
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.equal(count(on, 'market_properties'), 0);
});

test('a pair is proposed with its evidence only for the same operation, parish and bedrooms plus the same price or title', async () => {
  const env = setup(), cookie = await adminCookie();
  listing(env, 'agency-a', 'A-1');
  listing(env, 'agency-b', 'B-1', { parish: 'St. Helier', title: 'Harbour view apartment', bathrooms: 2 });
  listing(env, 'agency-c', 'C-1', { parish: 'Saint Helier', title: 'Two Bedroom Flat!', amount: 160000 });
  listing(env, 'agency-a', 'A-3BED', { bedrooms: 3 });
  listing(env, 'agency-b', 'B-SALE', { operation: 'sale' });
  listing(env, 'agency-c', 'C-NOPARISH', { parish: null });
  listing(env, 'agency-c', 'C-NOBEDS', { bedrooms: null });
  listing(env, 'agency-b', 'B-GROUVILLE', { parish: 'Grouville' });
  const data = await review(env, cookie);
  assert.deepEqual(data.candidates.map(refs).sort(), ['A-1 + B-1', 'A-1 + C-1']);
  const byPrice = data.candidates.find(c => refs(c) === 'A-1 + B-1'), byTitle = data.candidates.find(c => refs(c) === 'A-1 + C-1');
  assert.deepEqual(byPrice.same, ['operation', 'parish', 'bedrooms', 'price']);
  assert.deepEqual(byTitle.same, ['operation', 'parish', 'bedrooms', 'title']);
  const other = byPrice.left.external_key === 'B-1' ? byPrice.left : byPrice.right;
  assert.deepEqual({ ...other, observation_id: null }, { observation_id: null, source_ref: 'agency-b', channel_id: 'site',
    external_key: 'B-1', listing_url: 'https://agency-b.example.test/properties/B-1', operation: 'rent',
    title: 'Harbour view apartment', parish: 'St. Helier', bedrooms: 2, bathrooms: 2,
    price: { amount_minor: 150000, currency: 'GBP', period: 'month' }, location: 'Address on the listing: Jersey', observed_at: at });
  assert.deepEqual([data.homes, data.separated, data.truncated], [[], [], false]);
  // Proposing is a reading: no home, link or decision is written.
  for (const table of ['market_properties', 'market_listings', 'market_identity_decisions', 'market_identity_separations'])
    assert.equal(count(env, table), 0, table);
});

test('a home on three sites becomes one home with three listings; a second unit at the same address stays separate', async () => {
  const env = setup(), cookie = await adminCookie();
  const a = listing(env, 'agency-a', 'A-1'), b = listing(env, 'agency-b', 'B-1'), c = listing(env, 'agency-c', 'C-1');
  const flat2 = listing(env, 'agency-a', 'A-FLAT2');
  assert.equal((await review(env, cookie)).candidates.length, 6);

  const first = await decide(env, cookie, 'same_property', a, b, id(7));
  assert.equal(first.status, 201);
  assert.equal(first.data.action, 'same_property');
  // The same click sent twice is one decision.
  const again = await decide(env, cookie, 'same_property', a, b, id(7));
  assert.deepEqual([again.status, again.data], [200, first.data]);
  assert.equal(count(env, 'market_identity_decisions'), 1);
  let data = await review(env, cookie);
  assert.equal(data.homes.length, 1);
  assert.deepEqual(data.homes[0].publications.map(p => p.external_key).sort(), ['A-1', 'B-1']);
  // One question per pair of homes: the joined home against C-1, against the second flat, and C-1 against the flat.
  assert.equal(data.candidates.length, 3);
  // Already one home: a second "same" for them is refused, not recorded.
  assert.equal((await decide(env, cookie, 'same_property', b, a)).status, 409);

  assert.equal((await decide(env, cookie, 'same_property', b, c)).status, 201);
  assert.equal((await decide(env, cookie, 'different_properties', a, flat2)).status, 201);
  data = await review(env, cookie);
  assert.equal(data.homes.length, 1);
  assert.deepEqual(data.homes[0].publications.map(p => `${p.source_ref} ${p.external_key}`).sort(),
    ['agency-a A-1', 'agency-b B-1', 'agency-c C-1']);
  assert.equal(data.homes[0].linked, 3);
  assert.deepEqual(data.separated.map(refs), ['A-1 + A-FLAT2']);
  // The refusal covers the whole home: the flat is not proposed again through its other listings, nor joined through them.
  assert.deepEqual(data.candidates, []);
  assert.equal((await decide(env, cookie, 'same_property', c, flat2)).status, 409);
  assert.equal((await review(env, cookie)).homes[0].linked, 3);
  // Identity never removes or rewrites what was captured.
  assert.equal(count(env, 'market_observations'), 4);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM market_observations WHERE deleted_tombstone<>0 OR revision<>1').get().n, 0);
});

test('every decision is recorded and reversible: undoing a link and reopening a refusal bring the pair back', async () => {
  const env = setup(), cookie = await adminCookie();
  const a = listing(env, 'agency-a', 'A-1'), b = listing(env, 'agency-b', 'B-1');
  const joined = await decide(env, cookie, 'same_property', a, b);
  let data = await review(env, cookie);
  assert.equal(data.homes[0].last_decision.id, joined.data.decision_id);
  const undone = await undo(env, cookie, joined.data.decision_id);
  assert.deepEqual([undone.status, undone.data.action], [200, 'undo']);
  data = await review(env, cookie);
  assert.deepEqual([data.homes.length, data.candidates.length], [0, 1]);
  assert.equal((await undo(env, cookie, joined.data.decision_id)).status, 409);

  const refused = await decide(env, cookie, 'different_properties', a, b);
  assert.equal(refused.data.action, 'different_properties');
  assert.equal((await decide(env, cookie, 'different_properties', b, a)).status, 409);
  data = await review(env, cookie);
  assert.deepEqual([data.candidates.length, data.separated.length], [0, 1]);
  assert.equal(data.separated[0].id, refused.data.decision_id);
  const reopened = await undo(env, cookie, refused.data.decision_id);
  assert.deepEqual([reopened.status, reopened.data.action], [200, 'reopen']);
  assert.equal((await undo(env, cookie, refused.data.decision_id)).status, 409);
  data = await review(env, cookie);
  assert.deepEqual([data.candidates.length, data.separated.length], [1, 0]);
  assert.equal((await decide(env, cookie, 'same_property', a, b)).status, 201);

  // The history stays: link, undo, link again; refusal and its reopening. Each with who decided.
  const history = env.DB.raw.prepare('SELECT action,actor FROM market_identity_decisions').all()
    .concat(env.DB.raw.prepare('SELECT action,actor FROM market_identity_separations').all());
  assert.deepEqual(history.map(row => row.action).sort(), ['different_properties', 'reopen', 'same_property', 'same_property', 'undo']);
  assert.ok(history.every(row => row.actor === 'admin@example.test'));
  assert.throws(() => env.DB.raw.prepare("UPDATE market_identity_separations SET actor='x'").run(), /immutable/);
});

test('a later reading of the same listing keeps its home and shows the latest facts', async () => {
  const env = setup(), cookie = await adminCookie();
  const a = listing(env, 'agency-a', 'A-1'), b = listing(env, 'agency-b', 'B-1');
  await decide(env, cookie, 'same_property', a, b);
  const newer = listing(env, 'agency-a', 'A-1', { amount: 155000, seen: '2026-11-14T12:00:00.000Z' });
  const c = listing(env, 'agency-c', 'C-1', { amount: 155000, seen: '2026-11-14T12:00:00.000Z' });
  const data = await review(env, cookie);
  assert.equal(data.homes.length, 1);
  assert.equal(data.homes[0].publications.find(p => p.external_key === 'A-1').price.amount_minor, 155000);
  assert.deepEqual(data.candidates.map(refs), ['A-1 + C-1']);
  // Deciding from the newer reading reuses the listing's home instead of opening another.
  assert.equal((await decide(env, cookie, 'same_property', newer, c)).status, 201);
  assert.equal(count(env, 'market_properties'), 3);
  assert.equal(count(env, 'market_listings'), 3);
  assert.equal((await review(env, cookie)).homes[0].publications.length, 3);
});

test('a source that is no longer open is neither proposed nor decided, and bad requests change nothing', async () => {
  const env = setup(), cookie = await adminCookie();
  const a = listing(env, 'agency-a', 'A-1'), b = listing(env, 'agency-b', 'B-1');
  assert.equal((await decide(env, cookie, 'merge', a, b)).status, 400);
  assert.equal((await decide(env, cookie, 'same_property', a, a)).status, 400);
  assert.equal((await decide(env, cookie, 'same_property', a, 'not-an-id')).status, 400);
  assert.equal((await decide(env, cookie, 'same_property', a, id(999999))).status, 409);
  assert.equal((await call(env, 'POST', '/admin/market/identity/decisions', { cookie,
    body: { action: 'same_property', left_observation_id: a, right_observation_id: b, operation_id: id(3), extra: 1 } })).status, 400);
  env.DB.raw.prepare("UPDATE market_sources SET access_status='denied',policy_version=policy_version+1 WHERE source_ref='agency-b'").run();
  assert.deepEqual((await review(env, cookie)).candidates, []);
  assert.equal((await decide(env, cookie, 'same_property', a, b)).status, 409);
  assert.equal((await decide(env, cookie, 'different_properties', a, b)).status, 409);
  assert.equal(count(env, 'market_identity_decisions') + count(env, 'market_identity_separations') + count(env, 'market_identity_aliases'), 0);
});

test('listings typed in through the real upload route are proposed, linked and unlinked', async () => {
  const env = makeEnv(), cookie = await adminCookie(), post = (path, body) => call(env, 'POST', path, { cookie, body });
  env.MARKET_INVENTORY_READY = '1'; env.BUS10_IDENTITY_READY = '1';
  const manifest = JSON.stringify({ schema_version: 1, status: 'candidate_not_authorized', revision: 'bus10-fixture',
    channels: ['agency-a', 'agency-b'].map(source_ref => ({ source_ref, channel_id: 'web', source_kind: 'external',
      source_class: 'unclassified', access_status: 'pending', coverage_claim: 'unknown', channel_url_known: true,
      review_state: 'terms_and_method_review', handoff_row: 2 })) }) + '\n';
  assert.equal((await post('/admin/market/manifests', { manifest, sha256: createHash('sha256').update(manifest).digest('hex') })).status, 201);
  for (const [n, source_ref] of ['agency-a', 'agency-b'].entries()) assert.equal((await post('/admin/market/sources/review', {
    source_ref, channel_id: 'web', version: 1, operation_id: id(10 + n), source_class: 'general', status: 'manual_only', method: 'manual',
    allowed_hosts: [`${source_ref}.example.test`], allowed_paths: ['/properties'], allowed_redirect_hosts: [], min_interval_s: 60,
    evidence_ref: 'fixture-evidence', retention_ref: 'fixture-retention', review_due_at: '2999-01-01T00:00:00.000Z' })).status, 200);
  const run = (await post('/admin/market/runs', { kind: 'initial', manifest_revision: 'bus10-fixture', operation_id: id(20) })).data.run;
  const seen = new Date(Date.now() - 3000).toISOString();
  for (const source_ref of ['agency-a', 'agency-b']) assert.equal((await post('/admin/market/manual-pages', { schema_version: 1,
    run_id: run.id, source_ref, channel_id: 'web', policy_version: 2, page_key: 'batch-1', observed_at: seen,
    records: [{ external_key: `${source_ref}-ref`, source_at: seen, listing_url: `https://${source_ref}.example.test/properties/one`,
      observation: { country_code: 'JE', territory_evidence: 'Address on the listing: St Helier, Jersey', operation: 'rent',
        observed_at: seen, title: `Flat seen by ${source_ref}`, parish: 'St Helier', bedrooms: 2,
        financial_terms: [{ kind: 'rent', amount_minor: 150000, currency: 'GBP', period: 'month', raw_text: '£1,500 pcm' }] } }] })).status, 201);

  let data = await review(env, cookie);
  assert.deepEqual(data.candidates.map(c => c.same), [['operation', 'parish', 'bedrooms', 'price']]);
  const [{ left, right }] = data.candidates;
  assert.equal(left.listing_url, 'https://agency-a.example.test/properties/one');
  const joined = await decide(env, cookie, 'same_property', left.observation_id, right.observation_id);
  assert.equal(joined.status, 201);
  data = await review(env, cookie);
  assert.deepEqual([data.candidates.length, data.homes[0].publications.length], [0, 2]);
  assert.equal((await undo(env, cookie, joined.data.decision_id)).status, 200);
  data = await review(env, cookie);
  assert.deepEqual([data.candidates.length, data.homes.length], [1, 0]);
  // The inventory is as it was uploaded.
  assert.equal(count(env, 'market_observations'), 2);
});
