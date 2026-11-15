// BUS-01 / BUS-03: a search crosses the homes of the common market inventory as well as Hampton's listings, and the
// inventory screen shows each home with its adverts and what every search made of it. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeEnv, seedListing, call, adminCookie } from './helpers.mjs';
import { normalizeObservation } from '../../server/market-extraction.js';
import { marketHomeFacts } from '../../server/match-store.js';
import { recomputeForApplicant } from '../../server/search-state.js';
import { evaluate } from '../../server/matching.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AT = '2026-11-14T10:00:00.000Z';
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));

function world({ on = true, open = true } = {}) {
  const env = makeEnv(), db = env.DB.raw;
  Object.assign(env, { EST01_SEARCH_STATE_READY: '1', BUS10_IDENTITY_READY: '1', MARKET_INVENTORY_READY: '1', BUS07_PROVENANCE_READY: '1' });
  if (on) env.BUS01_MARKET_MATCHING_READY = '1';
  seedListing(env, { id: 'HE-R001', title: 'Own flat', operation: 'rent', availability: 'to_let', rent: 1500, rent_period: 'month',
    sale_price: null, parish: 'St Helier', bedrooms: 2, matchable: 1 });
  db.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,?,'accepted')").run('rev', 'a'.repeat(64), '2000-01-01T00:00:00.000Z', 'review');
  for (const source of ['agency-a', 'agency-b']) db.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,
    source_class,access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at)
    VALUES (?,'site','rev','external','general','allowed','manual',1,'evidence','retention',?,?)`)
    .run(source, '2000-01-01T00:00:00.000Z', open ? '2999-01-01T00:00:00.000Z' : '2001-01-01T00:00:00.000Z');
  db.prepare(`INSERT INTO market_runs(id,kind,manifest_revision,manifest_sha256,operation_id,created_at,created_by)
    VALUES(?,'initial','rev',?,?,?,'fixture')`).run(id(100), 'a'.repeat(64), id(101), AT);
  env.seq = 0;
  return env;
}
// One advert as the manual upload stores it, normalised by the real normaliser.
function advert(env, source, key, { amount = 150000, seen = AT, parish = 'St Helier', bedrooms = 2, operation = 'rent', ...more } = {}) {
  const seq = ++env.seq, page = id(1000 + seq), observation = id(2000 + seq);
  const normalized = normalizeObservation({ country_code: 'JE', territory_evidence: 'Address on the listing: Jersey', operation,
    observed_at: seen, title: `Advert ${key}`, parish, bedrooms, bathrooms: 1, ...more, financial_terms: [operation === 'sale'
      ? { kind: 'sale_price', amount_minor: amount, currency: 'GBP', period: 'sale' }
      : { kind: 'rent', amount_minor: amount, currency: 'GBP', period: 'month' }] });
  env.DB.raw.prepare(`INSERT INTO market_pages(id,run_id,source_ref,channel_id,page_key,content_sha256,exhausted,observed_at,
    committed_at,committed_by,lease_token,lease_generation,policy_version) VALUES(?,?,?,'site',?,?,0,?,?,'fixture','fixture',1,1)`)
    .run(page, id(100), source, `page-${seq}`, 'b'.repeat(64), seen, seen);
  env.DB.raw.prepare(`INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,
    normalized_sha256,source_at,origin_sha256) VALUES(?,?,?,'site',?,?,?,?,?,?)`).run(observation, page, source, key,
    JSON.stringify({ listing_url: `https://${source}.example.test/${key}` }), JSON.stringify(normalized), 'c'.repeat(64), seen, 'd'.repeat(64));
  return observation;
}
const sameHome = async (env, left, right) => ok(await req(env, 'POST', '/admin/market/identity/decisions',
  { action: 'same_property', left_observation_id: left, right_observation_id: right, operation_id: randomUUID() }), 201);
const linkListing = async (env, observation_id, lid = 'HE-R001') =>
  ok(await req(env, 'POST', `/admin/listings/${lid}/market-link`, { observation_id, operation_id: randomUUID() }), 201);
const register = async (env, o = {}) => ok(await req(env, 'POST', '/admin/applicants', { name: 'Jane Le Brocq', email: `j${++env.seq}@example.je`,
  phone: '07797 123456', source: 'phone', operation: 'rent', budget_max: 2000, bedrooms_min: 2, ...o }), 201).id;
const market = (env, applicant) => rows(env, 'SELECT * FROM market_matches WHERE applicant_id=? ORDER BY home_key', applicant)
  .map(r => ({ ...r, checks: JSON.parse(r.checks) }));
const runOf = (env, applicant) => env.DB.raw.prepare('SELECT * FROM applicant_search_runs WHERE applicant_id=?').get(applicant);
const check = (m, key) => m.checks.find(c => c.key === key);
// The usual inventory: one home on two sites, linked by a person; one advert of its own; one home linked to the
// Hampton listing (BUS-07); one home for sale.
async function inventory(env) {
  const a = advert(env, 'agency-a', 'A-1'), b = advert(env, 'agency-b', 'B-1');
  const c = advert(env, 'agency-a', 'C-1', { bedrooms: 3, amount: 180000 });
  const d = advert(env, 'agency-b', 'D-1', { amount: 140000 });
  advert(env, 'agency-a', 'S-1', { operation: 'sale', amount: 50000000 });
  await sameHome(env, a, b);
  await linkListing(env, d);
  return { a, b, c, d };
}

test('switched off, nothing is read or written for the market and the screen is absent', async () => {
  const env = world({ on: false });
  await inventory(env);
  const applicant = await register(env);
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM market_matches')[0].n, 0);
  assert.deepEqual(rows(env, 'SELECT listing_id FROM matches WHERE applicant_id=?', applicant), [{ listing_id: 'HE-R001' }]);
  assert.equal(runOf(env, applicant).market_state, null);
  const run = ok(await req(env, 'GET', `/admin/applicants/${applicant}`)).search_run;
  assert.equal('scope' in run, false);
  assert.equal('market' in run, false);
  assert.equal((await req(env, 'GET', '/admin/market/homes')).status, 404);
});

test('a registration crosses each market home once, never one linked to a listing nor another operation', async () => {
  const env = world();
  await inventory(env);
  const applicant = await register(env);
  const found = market(env, applicant);
  assert.equal(found.length, 2);
  const merged = found.find(m => !m.home_key.startsWith('['));
  const own = found.find(m => m.home_key.startsWith('['));
  assert.ok(merged, 'the two linked adverts are one home');
  assert.deepEqual(JSON.parse(own.home_key).slice(0, 3), ['agency-a', 'site', 'C-1']);
  for (const m of found) {
    assert.equal(m.operation, 'rent');
    assert.ok(['meets', 'pending'].includes(m.result), m.result);
    assert.equal(check(m, 'budget').result, 'meets');
    assert.equal(m.observed_at, AT);
  }
  // Hampton's own listing is matched as before; the home linked to it is not proposed a second time.
  assert.deepEqual(rows(env, 'SELECT listing_id FROM matches WHERE applicant_id=?', applicant), [{ listing_id: 'HE-R001' }]);
  assert.deepEqual([runOf(env, applicant).market_state, runOf(env, applicant).market_homes], ['searched', 2]);
  const run = ok(await req(env, 'GET', `/admin/applicants/${applicant}`)).search_run;
  assert.equal(run.state, 'searched');
  assert.equal(run.scope, 'listings_and_market');
  assert.deepEqual(run.market, { state: 'searched', homes: 2 });
});

test('a fact the adverts disagree on stays unknown, and an undated reading counts for nothing', () => {
  const base = { operation: 'rent', bathrooms: 1, observed_at: AT, price: { amount_minor: 150000, currency: 'GBP', period: 'month' } };
  const { row, disagree } = marketHomeFacts({ key: 'h', operation: 'rent', publications: [
    { ...base, parish: 'St. Helier', bedrooms: 2, pets: true, parking: null },
    { ...base, parish: 'Saint Helier', bedrooms: 3, pets: null, parking: false },
    { ...base, observed_at: null, bathrooms: 4, pets: false } ] });
  assert.deepEqual(disagree, ['bedrooms']);
  assert.equal(row.parish, 'St Helier');
  assert.equal(row.bedrooms, null);
  assert.equal(row.bathrooms, 1);
  assert.deepEqual([row.rent, row.rent_period, row.currency, row.sale_price], [1500, 'month', 'GBP', null]);
  assert.deepEqual([row.feat_pets, row.feat_parking], ['yes', 0]);
  // Nothing the adverts do not state is assumed.
  for (const k of ['housing_category', 'tenure_type', 'feat_type', 'feat_furnished', 'feat_outdoor', 'availability']) assert.equal(row[k], null, k);
  // A parish that is not one of the twelve is not a parish.
  assert.equal(marketHomeFacts({ key: 'h', operation: 'rent', publications: [{ ...base, parish: 'Jersey' }] }).row.parish, null);
  // Prices that differ are unknown.
  const prices = marketHomeFacts({ key: 'h', operation: 'rent', publications: [base, { ...base, price: { ...base.price, amount_minor: 160000 } }] });
  assert.deepEqual([prices.row.rent, prices.disagree], [null, ['price']]);
  // evaluate() reads the home as it reads a listing: every stated must-have met is a full match, an unanswered one is not.
  const must = { operation: 'rent', budget_max: 2000, bedrooms_min: 2, area_answer: 'any', pets: '[{"kind":"none"}]',
    requirement_priorities: JSON.stringify({ version: 1, values: { budget: 'must', bedrooms: 'must', area: 'must' }, unknown: [] }) };
  const home = { key: 'h', operation: 'rent', publications: [{ ...base, parish: 'St Helier', bedrooms: 2 }] };
  assert.equal(evaluate(must, marketHomeFacts(home).row).requirements_status, 'meets');
  assert.equal(evaluate({ ...must, pets: null }, marketHomeFacts(home).row).requirements_status, 'pending');
});

test('each result is kept with what it does not meet: disagreement, over budget and pets refused', async () => {
  const env = world();
  advert(env, 'agency-a', 'X-1', { bedrooms: 2 });
  advert(env, 'agency-b', 'X-2', { bedrooms: 3 });
  advert(env, 'agency-a', 'OVER', { amount: 250000 });
  advert(env, 'agency-a', 'NOPETS', { pets: false });
  const [x1, x2] = rows(env, "SELECT id FROM market_observations WHERE external_key IN ('X-1','X-2') ORDER BY external_key").map(r => r.id);
  await sameHome(env, x1, x2);
  const applicant = await register(env, { pets: [{ kind: 'dog', count: 1 }] });
  const found = market(env, applicant), by = key => found.find(m => m.home_key.includes(`"${key}"`));
  const disputed = found.find(m => !m.home_key.startsWith('['));
  assert.deepEqual([check(disputed, 'bedrooms').result, check(disputed, 'bedrooms').evidence], ['unknown', 'The adverts disagree']);
  assert.notEqual(disputed.result, 'meets');
  assert.equal(by('OVER').result, 'excluded');
  assert.equal(check(by('OVER'), 'budget').result, 'fails');
  assert.equal(by('NOPETS').result, 'excluded');
  assert.equal(check(by('NOPETS'), 'pets').result, 'fails');
});

test('no open source is recorded as such, not as an empty market, and a closed source takes its homes out', async () => {
  const env = world();
  advert(env, 'agency-a', 'A-1');
  const applicant = await register(env);
  assert.equal(market(env, applicant).length, 1);
  env.DB.raw.prepare("UPDATE market_sources SET review_due_at='2001-01-01T00:00:00.000Z', policy_version=policy_version+1").run();
  await recomputeForApplicant(env, applicant, 'system');
  assert.equal(market(env, applicant).length, 0);
  assert.deepEqual([runOf(env, applicant).market_state, runOf(env, applicant).market_homes], ['no_source', 0]);
  const run = ok(await req(env, 'GET', `/admin/applicants/${applicant}`)).search_run;
  assert.deepEqual(run.market, { state: 'no_source', homes: 0 });
  // Sources open and nothing advertised: searched, none found.
  const empty = world();
  const other = await register(empty);
  assert.deepEqual([runOf(empty, other).market_state, runOf(empty, other).market_homes], ['searched', 0]);
});

test('an inventory that cannot be read leaves the listings matched, its earlier results kept, and says so', async () => {
  const env = world();
  advert(env, 'agency-a', 'A-1');
  const applicant = await register(env);
  const before = market(env, applicant);
  env.DB.raw.exec('DROP TABLE listing_market_links');
  await recomputeForApplicant(env, applicant, 'system');
  assert.deepEqual(market(env, applicant), before);
  assert.deepEqual(rows(env, 'SELECT listing_id FROM matches WHERE applicant_id=?', applicant), [{ listing_id: 'HE-R001' }]);
  const r = runOf(env, applicant);
  assert.ok(r.last_success_at >= r.last_attempt_at);
  assert.equal(r.market_state, 'failed');
});

test('market rows leave matches, its triggers and its counts alone, and go with their search', async () => {
  const env = world();
  advert(env, 'agency-a', 'A-1');
  const applicant = await register(env);
  const revision = () => env.DB.raw.prepare('SELECT matches_revision FROM applicants WHERE id=?').get(applicant).matches_revision;
  const listingMatches = () => rows(env, 'SELECT * FROM matches WHERE applicant_id=?', applicant);
  const [r0, m0] = [revision(), listingMatches()];
  advert(env, 'agency-b', 'B-9', { bedrooms: 4 });
  await recomputeForApplicant(env, applicant, 'system');
  assert.equal(market(env, applicant).length, 2);
  assert.equal(revision(), r0);
  assert.deepEqual(listingMatches(), m0);
  // The listing triggers still count a listing match.
  seedListing(env, { id: 'HE-R002', operation: 'rent', availability: 'to_let', rent: 1600, rent_period: 'month', sale_price: null,
    parish: 'St Helier', bedrooms: 2, matchable: 1 });
  await recomputeForApplicant(env, applicant, 'system');
  assert.ok(revision() > r0);
  env.DB.raw.prepare('DELETE FROM applicants WHERE id=?').run(applicant);
  assert.equal(rows(env, 'SELECT COUNT(*) AS n FROM market_matches')[0].n, 0);
});

test('the inventory screen: one page of homes with their adverts and every search that evaluated them', async () => {
  const env = world();
  await inventory(env);
  advert(env, 'agency-a', 'OVER', { amount: 250000 });
  const applicant = await register(env);
  assert.equal((await call(env, 'GET', '/admin/market/homes')).status, 401);
  const d = ok(await req(env, 'GET', '/admin/market/homes'));
  assert.deepEqual(d.summary, { open_sources: 2, truncated: false });
  assert.equal(d.next, null);
  assert.equal(d.homes.length, 5);
  const merged = d.homes.find(h => h.publications.length === 2);
  assert.deepEqual(merged.publications.map(p => p.external_key).sort(), ['A-1', 'B-1']);
  assert.equal(merged.listing_id, null);
  assert.deepEqual([merged.facts.parish, merged.facts.bedrooms, merged.facts.bathrooms], ['St Helier', 2, 1]);
  assert.deepEqual(merged.facts.price, { amount_minor: 150000, currency: 'GBP', period: 'month' });
  assert.equal(merged.searches.length, 1);
  assert.equal(merged.searches[0].applicant_id, applicant);
  assert.equal(merged.searches[0].name, 'Jane Le Brocq');
  assert.ok(['meets', 'pending'].includes(merged.searches[0].result));
  // Only what is not met is listed for a search.
  assert.equal(merged.searches[0].checks.some(c => c.result === 'meets'), false);
  const over = d.homes.find(h => h.publications[0].external_key === 'OVER');
  assert.equal(over.searches[0].result, 'excluded');
  assert.deepEqual(over.searches[0].checks.find(c => c.key === 'budget').result, 'fails');
  // The home linked to a listing says so and is matched through it; a home for sale was not a rent search's.
  const linked = d.homes.find(h => h.publications[0].external_key === 'D-1');
  assert.deepEqual([linked.listing_id, linked.searches], ['HE-R001', []]);
  assert.deepEqual(d.homes.find(h => h.operation === 'sale').searches, []);
  assert.equal(JSON.stringify(d).includes('@example.je'), false);
  assert.equal(JSON.stringify(d).includes('07797'), false);
});

test('the inventory screen pages by 25 with a cursor that cannot be forged', async () => {
  const env = world();
  for (let i = 0; i < 27; i++) advert(env, 'agency-a', `P-${String(i).padStart(2, '0')}`, { seen: `2026-11-${String(10 + (i % 5)).padStart(2, '0')}T10:00:00.000Z` });
  const first = ok(await req(env, 'GET', '/admin/market/homes'));
  assert.equal(first.homes.length, 25);
  const second = ok(await req(env, 'GET', `/admin/market/homes?after=${encodeURIComponent(first.next)}`));
  assert.equal(second.homes.length, 2);
  assert.equal(second.next, null);
  const keys = [...first.homes, ...second.homes].map(h => h.key);
  assert.equal(new Set(keys).size, 27);
  // Newest reading first.
  const seen = [...first.homes, ...second.homes].map(h => h.observed_at);
  assert.deepEqual(seen, [...seen].sort().reverse());
  assert.equal((await req(env, 'GET', '/admin/market/homes?after=nonsense!')).status, 400);
  assert.equal((await req(env, 'GET', '/admin/market/homes?other=1')).status, 400);
});

test('regression: Matches, Review, the list and the record answer the same off, off with an inventory, and on', async () => {
  const strip = value => JSON.parse(JSON.stringify(value, (k, v) => /(^|_)at$/.test(k) ? undefined : v));
  const answers = async ({ on, stocked }) => {
    const env = world({ on });
    Object.assign(env, { EST01_SEARCH_STATE_READY: '0', SAP02_COUNTS_READY: '1', EST16_AVAILABILITY_READY: '1', AGE03_ENQUIRIES_READY: '1' });
    seedListing(env, { id: 'HE-R002', title: 'Own house', operation: 'rent', availability: 'to_let', rent: 1900, rent_period: 'month',
      sale_price: null, parish: 'St Clement', bedrooms: 3, matchable: 1 });
    if (stocked) {
      await sameHome(env, advert(env, 'agency-a', 'A-1'), advert(env, 'agency-b', 'B-1'));
      advert(env, 'agency-a', 'C-1', { bedrooms: 3, amount: 180000 });
    }
    const ids = [];
    for (const [n, budget_max] of [[1, 2000], [2, 1700]])
      ids.push(ok(await req(env, 'POST', '/admin/applicants', { name: `Applicant ${n}`, email: `a${n}@example.je`, phone: `07797 12345${n}`,
        source: 'phone', operation: 'rent', budget_max, bedrooms_min: 2 }), 201).id);
    const out = { review: ok(await req(env, 'GET', '/admin/review')), list: ok(await req(env, 'GET', '/admin/applicants')) };
    for (const id of ids) {
      out[`detail ${id}`] = ok(await req(env, 'GET', `/admin/applicants/${id}`));
      for (const status of ['found', 'shortlisted', 'rejected'])
        out[`${status} ${id}`] = ok(await req(env, 'GET', `/admin/applicants/${id}/matches?status=${status}`));
    }
    return { out: strip(out), market: rows(env, 'SELECT COUNT(*) AS n FROM market_matches')[0].n };
  };
  const before = await answers({ on: false, stocked: false });
  const off = await answers({ on: false, stocked: true });
  const on = await answers({ on: true, stocked: true });
  assert.ok(before.out['found 1'].matches.length > 0);
  assert.deepEqual(off.out, before.out);
  assert.deepEqual(on.out, before.out);
  assert.deepEqual([before.market, off.market, on.market], [0, 0, 4]);
});
