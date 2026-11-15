// BUS-01 / BUS-03: cost with 2,000 synthetic adverts. Not a test: run by hand with node tests/server/bus-01-measure.mjs.
// Worker time is the time outside the database calls (node:sqlite runs in process, D1 does not).
import { performance } from 'node:perf_hooks';
import { makeEnv, seedListing, call, adminCookie } from './helpers.mjs';
import { normalizeObservation } from '../../server/market-extraction.js';
import { recomputeForApplicant } from '../../server/search-state.js';

const AT = '2026-11-14T10:00:00.000Z', id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const env = makeEnv(), db = env.DB.raw;
Object.assign(env, { EST01_SEARCH_STATE_READY: '1', BUS10_IDENTITY_READY: '1', MARKET_INVENTORY_READY: '1', BUS07_PROVENANCE_READY: '1',
  BUS01_MARKET_MATCHING_READY: '1' });
seedListing(env, { id: 'HE-R001', operation: 'rent', availability: 'to_let', rent: 1500, rent_period: 'month', sale_price: null,
  parish: 'St Helier', bedrooms: 2, matchable: 1 });
db.prepare("INSERT INTO market_directory_manifests VALUES ('rev',?,?,'review','accepted')").run('a'.repeat(64), '2000-01-01T00:00:00.000Z');
for (const s of ['agency-a', 'agency-b']) db.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,
  source_class,access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at)
  VALUES (?,'site','rev','external','general','allowed','manual',1,'e','r','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z')`).run(s);
db.prepare(`INSERT INTO market_runs(id,kind,manifest_revision,manifest_sha256,operation_id,created_at,created_by)
  VALUES(?,'initial','rev',?,?,?,'x')`).run(id(1), 'a'.repeat(64), id(2), AT);
const parishes = ['St Helier', 'Grouville', 'St Brelade', 'Trinity', 'St Clement'];
// Readings per advert: node tests/server/bus-01-measure.mjs 10 for 20,000 readings of the same 2,000 adverts.
const readings = Number(process.argv[2] ?? 1);
for (let r = 0, k = 0; r < readings; r++) for (let i = 0; i < 2000; i++, k++) {
  const operation = i % 5 ? 'rent' : 'sale', amount = (100000 + (i % 30) * 10000) * (operation === 'sale' ? 300 : 1), source = i % 2 ? 'agency-a' : 'agency-b';
  const seen = new Date(Date.parse(AT) - (readings - r) * 3600000).toISOString();
  const n = normalizeObservation({ country_code: 'JE', territory_evidence: 'Jersey', operation, observed_at: seen, title: `Home ${i}`,
    parish: parishes[i % 5], bedrooms: 1 + (i % 4), bathrooms: 1, financial_terms: [operation === 'sale'
      ? { kind: 'sale_price', amount_minor: amount, currency: 'GBP', period: 'sale' } : { kind: 'rent', amount_minor: amount, currency: 'GBP', period: 'month' }] });
  db.prepare(`INSERT INTO market_pages(id,run_id,source_ref,channel_id,page_key,content_sha256,exhausted,observed_at,committed_at,committed_by,
    lease_token,lease_generation,policy_version) VALUES(?,?,?,'site',?,?,0,?,?,'x','x',1,1)`).run(id(100000 + k), id(1), source, `p${k}`, 'b'.repeat(64), seen, seen);
  db.prepare(`INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,normalized_sha256,
    source_at,origin_sha256) VALUES(?,?,?,'site',?,?,?,?,?,?)`).run(id(300000 + k), id(100000 + k), source, `K-${i}`,
    JSON.stringify({ listing_url: `https://${source}.example.test/k-${i}` }), JSON.stringify(n), 'c'.repeat(64), seen, 'd'.repeat(64));
}
// Time inside the database, statements per market batch and rows written to market_matches.
let inDb = 0, depth = 0, since = 0;
// Only the outermost call counts, so a batch and its statements, or two reads in parallel, are not counted twice.
const timed = fn => async (...a) => {
  if (!depth++) since = performance.now();
  try { return await fn(...a); } finally { if (!--depth) inDb += performance.now() - since; }
};
const prepare = env.DB.prepare.bind(env.DB);
env.DB.prepare = sql => { const wrap = st => ({ ...st, bind: (...a) => wrap(st.bind(...a)), all: timed(st.all), first: timed(st.first), run: timed(st.run) }); return wrap(prepare(sql)); };
const batches = [], batch = env.DB.batch.bind(env.DB);
env.DB.batch = timed(async stmts => { if (stmts.some(s => /market_matches/.test(s.sql))) batches.push(stmts.length); return batch(stmts); });
const changes = () => db.prepare('SELECT total_changes() AS n').get().n;
const cookie = await adminCookie();
const register = async (name, o) => (await call(env, 'POST', '/admin/applicants', { cookie, body: { name, email: `${name}@example.je`,
  phone: `07797 ${100000 + name.length * 7 + (o.budget_max % 997)}`, source: 'phone', operation: 'rent', ...o } })).data.id;
const ids = { narrow: await register('narrow', { budget_max: 1200, bedrooms_min: 4 }), typical: await register('typical', { budget_max: 2000, bedrooms_min: 2 }),
  wide: await register('wide', { budget_max: 4000, bedrooms_min: 1 }) };
db.prepare('UPDATE applicants SET requirement_priorities=? WHERE id=?')
  .run(JSON.stringify({ version: 1, values: { budget: 'must', bedrooms: 'must' }, unknown: [] }), ids.wide);
const measure = async (label, fn) => {
  for (let i = 0; i < 3; i++) await fn(); // warm up
  const rows0 = db.prepare('SELECT COUNT(*) AS n FROM market_matches').get().n;
  inDb = 0; batches.length = 0;
  const t = performance.now(), c0 = changes(); await fn(); const total = performance.now() - t;
  console.log(`${label}: total ${total.toFixed(1)} ms, worker (outside DB) ${(total - inDb).toFixed(1)} ms, DB ${inDb.toFixed(1)} ms,`,
    `market batch statements ${JSON.stringify(batches)}, rows changed ${changes() - c0}, market rows ${rows0}→${db.prepare('SELECT COUNT(*) AS n FROM market_matches').get().n}`);
};
for (const [k, v] of Object.entries(ids)) {
  db.prepare('DELETE FROM market_matches WHERE applicant_id=?').run(v);
  inDb = 0; batches.length = 0;
  const t = performance.now(), c0 = changes(); await recomputeForApplicant(env, v, 'system'); const total = performance.now() - t;
  const r = db.prepare('SELECT market_state,market_homes FROM applicant_search_runs WHERE applicant_id=?').get(v);
  console.log(`first run ${k}: total ${total.toFixed(1)} ms, worker ${(total - inDb).toFixed(1)} ms, DB ${inDb.toFixed(1)} ms, state ${r.market_state}, evaluated ${r.market_homes},`,
    `market batch statements ${JSON.stringify(batches)}, rows changed ${changes() - c0}`);
  await measure(`repeat ${k}`, () => recomputeForApplicant(env, v, 'system'));
}
await measure('GET /admin/market/homes (first page)', () => call(env, 'GET', '/admin/market/homes', { cookie }));
await measure('POST /admin/matches/recalculate (5 searches)', () => call(env, 'POST', '/admin/matches/recalculate', { cookie, body: { phase: 'applicants', after: null } }));
env.BUS01_MARKET_MATCHING_READY = '0';
await measure('switched off, typical search', () => recomputeForApplicant(env, ids.typical, 'system'));
