// BUS-12 with the market inventory: a commercial search is offered the commercial adverts of the market, judged by
// BUS-12's own rules; a home search never sees them. An advert that does not say its use stays residential.
// Synthetic sources, adverts and people only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie } from './helpers.mjs';
import { normalizeObservation } from '../../server/market-extraction.js';
import { RECOMPUTE_FLAGS } from '../../server/market-daily-sweep.js';
import { classifyMarketChange, marketRematchPass } from '../../server/market-rematch.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AT = '2026-11-20T10:00:00.000Z';
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
let clock = 0;
const tick = () => new Date(Date.parse(AT) + ++clock * 600000).toISOString();

function world() {
  const env = makeEnv(), db = env.DB.raw;
  Object.assign(env, { EST01_SEARCH_STATE_READY: '1', BUS10_IDENTITY_READY: '1', MARKET_INVENTORY_READY: '1',
    BUS01_MARKET_MATCHING_READY: '1', BUS04_REMATCH_READY: '1' });
  for (const flag of RECOMPUTE_FLAGS) env[flag] = '1';
  db.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,?,'accepted')").run('rev', 'a'.repeat(64), '2000-01-01T00:00:00.000Z', 'review');
  db.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class,access_status,method,
    policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at) VALUES ('agency-a','site','rev','external','general',
    'allowed','manual',1,'evidence','retention','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')`).run();
  db.prepare(`INSERT INTO market_runs(id,kind,manifest_revision,manifest_sha256,operation_id,created_at,created_by)
    VALUES(?,'initial','rev',?,?,?,'fixture')`).run(id(100), 'a'.repeat(64), id(101), AT);
  env.seq = 0;
  return env;
}
// One advert reading, normalised by the real normaliser; change: also its BUS-06 outbox row.
function advert(env, key, { amount = 250000, change = false, ...more } = {}) {
  const seq = ++env.seq, page = id(1000 + seq), observation = id(2000 + seq), seen = new Date(Date.parse(AT) + seq * 1000).toISOString();
  const normalized = normalizeObservation({ country_code: 'JE', territory_evidence: 'Address on the listing: Jersey', operation: 'rent',
    observed_at: seen, title: `Advert ${key}`, parish: 'St Helier', ...more,
    financial_terms: [{ kind: 'rent', amount_minor: amount, currency: 'GBP', period: 'month' }] });
  env.DB.raw.prepare(`INSERT INTO market_pages(id,run_id,source_ref,channel_id,page_key,content_sha256,exhausted,observed_at,
    committed_at,committed_by,lease_token,lease_generation,policy_version) VALUES(?,?,'agency-a','site',?,?,0,?,?,'fixture','fixture',1,1)`)
    .run(page, id(100), `page-${seq}`, 'b'.repeat(64), seen, seen);
  env.DB.raw.prepare(`INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,
    normalized_sha256,source_at,origin_sha256) VALUES(?,?,'agency-a','site',?,?,?,?,?,?)`).run(observation, page, key,
    JSON.stringify({ listing_url: `https://agency-a.example.test/${key}` }), JSON.stringify(normalized), 'c'.repeat(64), seen, 'd'.repeat(64));
  if (change) env.DB.raw.prepare(`INSERT INTO market_change_outbox(id,observation_id,observation_version,kind)
    VALUES (?,?,1,'observation_changed')`).run(id(3000 + seq), observation);
  return observation;
}
const register = async (env, o = {}) => ok(await req(env, 'POST', '/admin/applicants', { name: `Jane Le Brocq ${++env.seq}`,
  email: `j${env.seq}@example.je`, phone: `07797 ${100000 + env.seq}`, source: 'phone', operation: 'rent', ...o }), 201).id;
const homeSearch = env => register(env, { budget_max: 3000, bedrooms_min: 1 });
// An office to rent: at least 500 sq ft, up to £3,000 a month.
const officeSearch = env => register(env, { search_category: 'commercial', commercial_kind: 'property', area_min: 500,
  area_unit: 'sqft', commercial_rent: 3000, commercial_rent_period: 'month' });
const key = k => JSON.stringify(['agency-a', 'site', k, 'rent']);
const held = (env, applicant) => Object.fromEntries(rows(env, 'SELECT home_key,result,checks FROM market_matches WHERE applicant_id=?', applicant)
  .map(m => [JSON.parse(m.home_key)[2], { result: m.result, checks: JSON.parse(m.checks) }]));
const inventory = env => {
  advert(env, 'HOME', { bedrooms: 2, bathrooms: 1 }); // says nothing of its use: residential
  advert(env, 'FLAT', { use: 'residential', bedrooms: 1 });
  advert(env, 'OFFICE', { use: 'commercial', area_sqft: 800 });
  advert(env, 'SMALL', { use: 'commercial', area_sqft: 300 });
  advert(env, 'DEAR', { use: 'commercial', area_sqft: 900, amount: 400000 });
};

test('an advert states its use and floor area; one that states neither reads as before', () => {
  const base = { country_code: 'JE', territory_evidence: 'Jersey', operation: 'rent', observed_at: AT };
  const plain = normalizeObservation(base);
  assert.equal('use' in plain.fields, false);
  assert.equal('area_sqft' in plain.fields, false);
  const office = normalizeObservation({ ...base, use: 'commercial', area_sqft: 812.5 });
  assert.equal(office.fields.use, 'commercial');
  assert.equal(office.fields.area_sqft, 812.5);
  assert.ok(office.present_fields.includes('use') && office.present_fields.includes('area_sqft'));
  for (const bad of [{ use: 'industrial' }, { area_sqft: 0 }, { area_sqft: -3 }, { area_sqft: '800' }])
    assert.throws(() => normalizeObservation({ ...base, ...bad }), TypeError, JSON.stringify(bad));
});

test('an office search is offered commercial adverts by its own rules, and never a home', async () => {
  const env = world();
  inventory(env);
  const office = await officeSearch(env);
  const got = held(env, office);
  assert.deepEqual(Object.keys(got).sort(), ['DEAR', 'OFFICE', 'SMALL']);
  assert.equal(got.OFFICE.result, 'meets');
  assert.equal(got.OFFICE.checks.find(c => c.key === 'floor_area').result, 'meets');
  assert.equal(got.SMALL.result, 'alternative');
  assert.equal(got.SMALL.checks.find(c => c.key === 'floor_area').result, 'fails');
  assert.equal(got.DEAR.result, 'alternative');
  assert.equal(got.DEAR.checks.find(c => c.key === 'rent').result, 'fails');
  const run = rows(env, 'SELECT market_state,market_homes FROM applicant_search_runs WHERE applicant_id=?', office)[0];
  assert.deepEqual(run, { market_state: 'searched', market_homes: 3 });
  // The inventory screen shows the office search on the offices only.
  const homes = ok(await req(env, 'GET', '/admin/market/homes')).homes;
  const on = k => homes.find(h => h.key === key(k)).searches.map(s => s.applicant_id);
  assert.deepEqual(on('OFFICE'), [office]);
  assert.deepEqual(on('HOME'), []);
});

test('a home search is offered homes, including adverts that do not state their use, and never an office', async () => {
  const env = world();
  inventory(env);
  const home = await homeSearch(env);
  assert.deepEqual(Object.keys(held(env, home)).sort(), ['FLAT', 'HOME']);
});

test('switched off, a commercial search reads nothing of the market', async () => {
  const env = world();
  env.BUS01_MARKET_MATCHING_READY = '0';
  inventory(env);
  const office = await officeSearch(env);
  assert.deepEqual(held(env, office), {});
});

test('a change to a commercial advert crosses the commercial searches of its operation, not the home searches', async () => {
  const env = world();
  const [home, office] = [await homeSearch(env), await officeSearch(env)];
  const attempt = a => rows(env, 'SELECT last_attempt_at FROM applicant_search_runs WHERE applicant_id=?', a)[0].last_attempt_at;
  const before = attempt(home);
  advert(env, 'OFFICE', { use: 'commercial', area_sqft: 800, change: true });
  for (let i = 0; i < 5; i++) { const out = await marketRematchPass(env, tick()); if (!out.consumed && !out.crossed.length) break; }
  assert.equal(held(env, office).OFFICE.result, 'meets');
  assert.deepEqual(rows(env, 'SELECT reason FROM market_match_proposals WHERE applicant_id=?', office), [{ reason: 'new' }]);
  assert.equal(attempt(home), before);
  // A change of use or of floor area is material; a change of use reaches both kinds of search.
  const was = { operation: 'rent', observed_at: AT, fields: { parish: 'St Helier', use: 'commercial', area_sqft: 800 } };
  const now = o => JSON.stringify({ ...was, fields: { ...was.fields, ...o } });
  assert.equal(classifyMarketChange({ before: JSON.stringify(was), after: now({ area_sqft: 900 }) }).material, true);
  assert.deepEqual(classifyMarketChange({ before: JSON.stringify(was), after: now({ use: undefined }) }).searches.sort(),
    ['commercial:rent', 'residential:rent']);
});
