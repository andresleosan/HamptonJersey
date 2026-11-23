// BUS-09: Hermes as a market reader through the app's door (/api/hermes/market/*), on synthetic sources. The door maps
// Hermes's adverts to the sweep's reader records and commits them through the same lease and page path as the code
// readers; the sweep leaves Hermes's channels to it. No real source, network or person.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeEnv, call } from './helpers.mjs';
import { marketSweepPass } from '../../server/market-daily-sweep.js';
import { advertRecord, normaliseUrl, parsePrice } from '../../server/market-hermes.js';

const DAY0 = Date.parse(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) + 'T03:00:00.000Z');
const at = (day, minutes = 0) => new Date(DAY0 + day * 86400000 + minutes * 60000).toISOString();
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const one = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
const n = (env, sql, ...a) => one(env, sql, ...a).n;
const KEY = 'hermes-market-key-hermes-market-key-012345', GENERAL = 'hermes-test-key-hermes-test-key-0123456789',
  MAIL = 'hermes-mail-key-hermes-mail-key-0123456789';
const REV = 'rev-1', REVIEWED = ['2000-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z'];

const source = (env, ref, channel, hosts, paths) => env.DB.raw.prepare(`INSERT INTO market_sources(source_ref,channel_id,
  directory_revision,source_kind,source_class,access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,
  review_due_at,allowed_hosts,allowed_paths) VALUES (?,?,?,'external','general','allowed','http',1,'e','r',?,?,?,?)`)
  .run(ref, channel, REV, ...REVIEWED, JSON.stringify(hosts), JSON.stringify(paths));
function world(flags = { HERMES_MARKET_READY: '1', HERMES_MARKET_SOURCES: 'agency-a' }) {
  const env = { ...makeEnv(), BUS08_SWEEP_READY: '1', MARKET_INVENTORY_READY: '1', HERMES_KEY: GENERAL, HERMES_MAIL_KEY: MAIL,
    HERMES_MARKET_KEY: KEY, ...flags };
  env.DB.raw.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,'fixture','accepted')").run(REV, 'a'.repeat(64), REVIEWED[0]);
  for (const ref of ['agency-a', 'agency-b']) source(env, ref, 'site', [`www.${ref}.example.test`], ['/properties']);
  return env;
}
// D1's own clock paces channels and leases; between steps they are released as time would.
const rest = env => env.DB.raw.exec(`UPDATE market_source_activity SET last_acquired_at=NULL;
  UPDATE market_source_runs SET next_due='2000-01-01T00:00:00.000Z' WHERE next_due IS NOT NULL;`);
const door = (env, method, path, body) => call(env, method, `/hermes/market${path}`, { body, bearer: KEY, origin: null });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

const url = (ref, key) => `https://www.${ref}.example.test/properties/${key}`;
const advert = (ref, key, over = {}) => ({ listing_url: url(ref, key), operation: 'rent', use: 'residential',
  price_text: '£1,500 pcm', parish: 'St Helier', bedrooms: 2, bathrooms: 1, parking: null, area_sqft: null, title: `Flat ${key}`, ...over });
const many = (ref, prefix, count) => Array.from({ length: count }, (_, i) => advert(ref, `${prefix}-${i + 1}`));
// A code reader of fixture adverts, like bus-08's.
function fixtures(listings) {
  const reader = { calls: [], async readPage({ source_ref, cursor }) {
    reader.calls.push([source_ref, cursor]);
    const all = listings[source_ref], start = Number(cursor ?? 0), end = start + 10;
    return { exhausted: end >= all.length, next_cursor: end >= all.length ? null : String(end),
      records: all.slice(start, end).map(key => ({ external_key: `code:${key}`, raw: { listing_url: `${url(source_ref, key)}/` },
        observation: { country_code: 'JE', territory_evidence: 'fixture', operation: 'rent', title: `Flat ${key}`,
          financial_terms: [{ kind: 'rent', amount_minor: 150000, currency: 'GBP', period: 'month' }] } })) };
  } };
  return { reader, readers: Object.fromEntries(Object.keys(listings).map(ref => [ref, reader])) };
}
const runOf = (env, day) => one(env, "SELECT * FROM market_runs WHERE kind='daily' AND jersey_day=?", at(day).slice(0, 10));
// Deliver a whole channel in slices of ten, as the custodian does. Door calls run at the mocked time.
async function deliver(t, env, run, ref, adverts, minute) {
  const out = [];
  for (let i = 0; i === 0 || i < adverts.length; i += 10) {
    rest(env);
    t.mock.timers.setTime(Date.parse(minute) + i * 1000);
    const { lease } = ok(await door(env, 'POST', '/claim', { run_id: run, source_ref: ref, channel_id: 'site' }));
    out.push(ok(await door(env, 'POST', '/page', { lease, records: adverts.slice(i, i + 10), exhausted: i + 10 >= adverts.length })));
  }
  return out;
}

test('price_text: per month, week and year are rent; a sale without period is the price; POA is nothing', () => {
  const term = (amount, period, kind = 'rent', raw) => [{ kind, amount_minor: amount, currency: 'GBP', period, raw_text: raw }];
  for (const [text, op, want] of [
    ['£1,950 pcm', 'rent', term(195000, 'month', 'rent', '£1,950 pcm')],
    ['£1,950 per month', 'rent', term(195000, 'month', 'rent', '£1,950 per month')],
    ['£2,100pm', 'rent', term(210000, 'month', 'rent', '£2,100pm')],
    ['£450 pw', 'rent', term(45000, 'week', 'rent', '£450 pw')],
    ['£450 per week', 'rent', term(45000, 'week', 'rent', '£450 per week')],
    ['£25,000 pa', 'rent', term(2500000, 'year', 'rent', '£25,000 pa')],
    ['£25,000.50 per annum', 'rent', term(2500050, 'year', 'rent', '£25,000.50 per annum')],
    ['£18,000 per year', 'rent', term(1800000, 'year', 'rent', '£18,000 per year')],
    ['£650,000', 'sale', term(65000000, 'sale', 'sale_price', '£650,000')],
    ['Offers over £1,250,000', 'sale', term(125000000, 'sale', 'sale_price', 'Offers over £1,250,000')],
    ['£1,800', 'rent', term(180000, 'unknown', 'rent', '£1,800')],
    ['POA', 'sale', []], ['Price on application', 'rent', []], ['Call us', 'sale', []], [null, 'rent', []],
  ]) assert.deepEqual(parsePrice(text, op), want, String(text));
});

test('an advert maps to a reader record only on the channel host (any path); facts only', () => {
  const hosts = ['www.agency-a.example.test'];
  assert.equal(normaliseUrl('https://WWW.Agency-A.example.test/properties/X-1/?ref=feed#top'), 'https://agency-a.example.test/properties/X-1');
  const r = advertRecord({ ...advert('agency-a', 'X-1'), parking: true, area_sqft: 850, description: 'never', phone: '0' }, hosts);
  assert.equal(r.url, 'https://agency-a.example.test/properties/X-1');
  assert.deepEqual(r.raw, { listing_url: url('agency-a', 'X-1'), price_text: '£1,500 pcm' });
  assert.deepEqual(advertRecord(advert('agency-a', 'X-1', { listing_url: `${url('agency-a', 'X-1')}?ref=feed#top` }), hosts).raw.listing_url,
    url('agency-a', 'X-1'));
  assert.deepEqual(r.observation, { country_code: 'JE', territory_evidence: 'Advert on agency-a.example.test: St Helier', operation: 'rent',
    title: 'Flat X-1', parish: 'St Helier', bedrooms: 2, bathrooms: 1, parking: true, use: 'residential', area_sqft: 850,
    financial_terms: [{ kind: 'rent', amount_minor: 150000, currency: 'GBP', period: 'month', raw_text: '£1,500 pcm' }] });
  assert.ok(!('parking' in advertRecord(advert('agency-a', 'X-2'), hosts).observation));
  assert.equal(advertRecord(advert('agency-a', 'X-3', { parish: 'Atlantis' }), hosts).observation.parish, null);
  for (const bad of [{ listing_url: 'https://evil.example.test/properties/X' }, { listing_url: 'http://www.agency-a.example.test/properties/X' },
    { listing_url: 'https://www.agency-a.example.test.evil.test/properties/X' }, { operation: 'lease' }, { use: 'land' }, { listing_url: 7 }])
    assert.equal(advertRecord({ ...advert('agency-a', 'X'), ...bad }, hosts), null, JSON.stringify(bad));
  // Only the pages Hermes reads are bound to the channel's paths (the custodian checks them); a listing may live anywhere on the host.
  for (const u of ['https://agency-a.example.test/about/X', 'https://www.agency-a.example.test/propertiesX/1'])
    assert.ok(advertRecord(advert('agency-a', 'X', { listing_url: u }), hosts), u);
});

test('switched off: every route answers 404, nothing is written, and the sweep runs exactly as today', async () => {
  for (const flags of [{}, { HERMES_MARKET_READY: '0', HERMES_MARKET_SOURCES: '*' }]) {
    const env = world(flags);
    for (const [m, p] of [['GET', '/work'], ['POST', '/claim'], ['POST', '/page'], ['POST', '/fail']]) assert.equal((await door(env, m, p, m === 'GET' ? undefined : {})).status, 404);
    assert.equal(n(env, "SELECT COUNT(*) AS n FROM app_settings WHERE key LIKE 'hermes%'"), 0);
  }
  const record = async flags => {
    const env = world(flags), seen = [], prepare = env.DB.prepare.bind(env.DB), { readers } = fixtures({ 'agency-a': ['A-1'] });
    env.DB.prepare = sql => { seen.push(sql); return prepare(sql); };
    const outs = [];
    for (let i = 0; i < 3; i++) { rest(env); outs.push(await marketSweepPass(env, at(0, i * 10), { readers })); }
    return { seen, outs: outs.map(({ run, ...o }) => o), attempts: rows(env, 'SELECT source_ref,outcome,records FROM market_sweep_attempts ORDER BY source_ref,attempted_at') };
  };
  const absent = await record({}), off = await record({ HERMES_MARKET_READY: '0', HERMES_MARKET_SOURCES: 'agency-a' }),
    empty = await record({ HERMES_MARKET_READY: '1', HERMES_MARKET_SOURCES: '' });
  assert.deepEqual(off, absent);
  assert.deepEqual(empty, absent);
  assert.deepEqual(absent.attempts.map(a => [a.source_ref, a.outcome]), [['agency-a', 'complete'], ['agency-b', 'no_reader']]);
});

test("the door's own key: missing, wrong, or the same as another Hermes key is refused", async () => {
  const env = world();
  assert.equal((await call(env, 'GET', '/hermes/market/work', { bearer: GENERAL, origin: null })).status, 401);
  assert.equal((await call(env, 'GET', '/hermes/market/work', { bearer: MAIL, origin: null })).status, 401);
  assert.equal((await call(env, 'GET', '/hermes/status', { bearer: KEY, origin: null })).status, 401);
  for (const same of [GENERAL, MAIL]) assert.equal((await door({ ...world(), HERMES_MARKET_KEY: same }, 'GET', '/work')).status, 401);
  assert.equal((await door({ ...world(), HERMES_MARKET_KEY: undefined }, 'GET', '/work')).status, 401);
  assert.deepEqual(ok(await door(env, 'GET', '/work')), { day: null, run_id: null, items: [] });
  assert.ok(JSON.parse(one(env, "SELECT value FROM app_settings WHERE key='hermes_market_seen'").value).at);
});

test("Hermes's channel is not read by code nor marked no_reader; the door's pages commit and the day compares", async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at(0)) });
  const env = world(), { readers, reader } = fixtures({ 'agency-b': ['B-1'] });
  await marketSweepPass(env, at(0), { readers });
  const run = runOf(env, 0).id;
  assert.deepEqual(rows(env, 'SELECT source_ref,outcome FROM market_sweep_attempts'), [{ source_ref: 'agency-b', outcome: 'complete' }]);
  assert.ok(!reader.calls.some(([ref]) => ref === 'agency-a'));
  assert.equal(one(env, "SELECT status FROM market_source_runs WHERE source_ref='agency-a'").status, 'pending');
  // The day waits for Hermes's channel.
  rest(env); assert.equal((await marketSweepPass(env, at(0, 10), { readers })).compared, false);
  assert.deepEqual(ok(await door(env, 'GET', '/work')), { day: at(0).slice(0, 10), run_id: run, items: [{ source_ref: 'agency-a',
    channel_id: 'site', hosts: ['www.agency-a.example.test'], paths: ['/properties'], status: 'pending', min_interval_s: 60 }] });
  // Not Hermes's: refused.
  assert.equal((await door(env, 'POST', '/claim', { run_id: run, source_ref: 'agency-b', channel_id: 'site' })).status, 404);
  const adverts = [...many('agency-a', 'A', 11), advert('agency-a', 'off', { listing_url: 'https://elsewhere.example.test/properties/1' })];
  const pages = await deliver(t, env, run, 'agency-a', adverts, at(0, 20));
  assert.deepEqual(pages.map(p => [p.accepted, p.skipped]), [[true, 0], [true, 1]]);
  assert.deepEqual(rows(env, "SELECT outcome,records,skipped FROM market_sweep_attempts WHERE source_ref='agency-a' ORDER BY attempted_at"),
    [{ outcome: 'page', records: 10, skipped: null }, { outcome: 'complete', records: 1, skipped: 1 }]);
  const keys = rows(env, "SELECT DISTINCT external_key FROM market_observations WHERE source_ref='agency-a'").map(r => r.external_key);
  assert.equal(keys.length, 11);
  assert.ok(keys.every(k => /^hermes:[0-9a-f]{32}$/.test(k)));
  const obs = JSON.parse(one(env, "SELECT normalized_json FROM market_observations WHERE source_ref='agency-a' LIMIT 1").normalized_json);
  assert.equal(obs.monthly_rent_minor, 150000);
  assert.equal(one(env, "SELECT status FROM market_source_runs WHERE source_ref='agency-a'").status, 'complete');
  assert.deepEqual(ok(await door(env, 'GET', '/work')).items, []);
  rest(env); assert.equal((await marketSweepPass(env, at(0, 30), { readers })).compared, true);
});

test('a bad envelope is 400; the same page sent twice is a replay; a stale lease is 409 and not counted', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at(0, 5)) });
  const env = world();
  await marketSweepPass(env, at(0), { readers: {} });
  const run = runOf(env, 0).id, claim = { run_id: run, source_ref: 'agency-a', channel_id: 'site' };
  const { lease } = ok(await door(env, 'POST', '/claim', claim));
  // Leased: a second claim waits, uncounted.
  const again = await door(env, 'POST', '/claim', claim);
  assert.equal(again.status, 409);
  assert.ok(again.data.retry_after_s >= 1);
  for (const body of [{ lease, records: many('agency-a', 'A', 11), exhausted: false }, { lease, records: 'x', exhausted: true },
    { lease, records: [], exhausted: 'yes' }, { lease: null, records: [], exhausted: true }, { lease, records: [], exhausted: false }])
    assert.equal((await door(env, 'POST', '/page', body)).status, 400, JSON.stringify(body).slice(0, 80));
  const body = { lease, records: many('agency-a', 'A', 3), exhausted: false };
  assert.deepEqual(ok(await door(env, 'POST', '/page', body)), { accepted: true, skipped: 0 });
  // The channel's pace holds: no claim again within its interval.
  assert.deepEqual(await door(env, 'POST', '/claim', claim).then(r => [r.status, r.data]), [409, { retry_after_s: 60 }]);
  t.mock.timers.setTime(Date.parse(at(0, 6)));
  assert.deepEqual(ok(await door(env, 'POST', '/page', body)), { accepted: true, skipped: 0, replayed: true });
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_pages WHERE source_ref='agency-a'"), 1);
  // A lease that expired before its page arrived.
  rest(env);
  const { lease: late } = ok(await door(env, 'POST', '/claim', claim));
  env.DB.raw.exec(`UPDATE market_source_runs SET lease_until='2000-01-01T00:00:00.000Z' WHERE source_ref='agency-a';
    UPDATE market_source_activity SET lease_until='2000-01-01T00:00:00.000Z' WHERE source_ref='agency-a'`);
  assert.equal((await door(env, 'POST', '/page', { lease: late, records: many('agency-a', 'B', 2), exhausted: true })).status, 409);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_pages WHERE source_ref='agency-a'"), 1);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_sweep_attempts WHERE source_ref='agency-a' AND outcome<>'page'"), 0);
});

test('three failures in a day block the channel, as for a code reader; refused access blocks at once', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at(0, 5)) });
  const env = world({ HERMES_MARKET_READY: '1', HERMES_MARKET_SOURCES: '*' });
  await marketSweepPass(env, at(0), { readers: {} });
  const run = runOf(env, 0).id, ch = ref => ({ run_id: run, source_ref: ref, channel_id: 'site' });
  assert.equal((await door(env, 'POST', '/fail', { ...ch('agency-a'), lease: null, reason: 'bored' })).status, 400);
  for (let i = 0; i < 3; i++) {
    rest(env);
    const { lease } = ok(await door(env, 'POST', '/claim', ch('agency-a')));
    assert.deepEqual(ok(await door(env, 'POST', '/fail', { ...ch('agency-a'), lease, reason: 'unavailable' })), { ok: true });
  }
  assert.equal(one(env, "SELECT status FROM market_source_runs WHERE source_ref='agency-a'").status, 'blocked');
  ok(await door(env, 'POST', '/fail', { ...ch('agency-b'), lease: null, reason: 'access_denied' }));
  assert.equal(one(env, "SELECT status FROM market_source_runs WHERE source_ref='agency-b'").status, 'blocked');
  assert.deepEqual(ok(await door(env, 'GET', '/work')).items, []);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_sweep_attempts WHERE outcome='no_reader'"), 0);
  // A blocked channel keeps its count; a closed run is refused like a claim too soon.
  const before = n(env, 'SELECT COUNT(*) AS n FROM market_sweep_attempts');
  ok(await door(env, 'POST', '/fail', { ...ch('agency-a'), lease: null, reason: 'unavailable' }));
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_sweep_attempts'), before);
  env.DB.raw.prepare("UPDATE market_source_runs SET status='pending',next_due=NULL WHERE source_ref='agency-a'").run();
  env.DB.raw.prepare("UPDATE market_runs SET status='partial',version=version+1 WHERE id=?").run(run);
  rest(env);
  const closed = await door(env, 'POST', '/claim', ch('agency-a'));
  assert.equal(closed.status, 409);
  assert.ok(closed.data.retry_after_s >= 1);
  // Nothing more is written into a closed run: a failure is not recorded, a page on an old lease is refused.
  const lease = { ...ch('agency-a'), token: crypto.randomUUID(), generation: 1, policy_version: 1, run_version: 1, cursor: null };
  env.DB.raw.prepare("UPDATE market_source_runs SET lease_token=?,lease_generation=1,lease_until=? WHERE source_ref='agency-a'")
    .run(lease.token, at(0, 30));
  const state = () => [n(env, 'SELECT COUNT(*) AS n FROM market_sweep_attempts'), one(env, "SELECT status,lease_token FROM market_source_runs WHERE source_ref='agency-a'")];
  const was = state();
  assert.deepEqual(ok(await door(env, 'POST', '/fail', { ...ch('agency-a'), lease, reason: 'unavailable' })), { ok: true });
  assert.equal((await door(env, 'POST', '/page', { lease, records: many('agency-a', 'Z', 2), exhausted: true })).status, 409);
  assert.deepEqual(state(), was);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_pages WHERE source_ref='agency-a'"), 0);
  assert.deepEqual(ok(await door(env, 'GET', '/work')), { day: null, run_id: null, items: [] });
});

test('a takeover keeps each home: a known listing_url reuses the code reader key, so nothing looks gone and new', async t => {
  const env = world({}), { readers, reader } = fixtures({ 'agency-a': ['A-1', 'A-2', 'A-3'] });
  for (let i = 0; i < 3; i++) { rest(env); if ((await marketSweepPass(env, at(0, i * 10), { readers })).compared) break; }
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_latest_observations'), 3);
  // Day 1: Hermes takes the source over although a code reader exists.
  Object.assign(env, { HERMES_MARKET_READY: '1', HERMES_MARKET_SOURCES: 'agency-a' });
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at(1)) });
  reader.calls.length = 0;
  await marketSweepPass(env, at(1), { readers });
  assert.deepEqual(reader.calls, []);
  const run = runOf(env, 1).id;
  // The same homes, written as Hermes copies them (no www., no trailing slash), and one new.
  await deliver(t, env, run, 'agency-a', [advert('agency-a', 'A-1', { listing_url: 'https://agency-a.example.test/properties/A-1' }),
    advert('agency-a', 'A-2'), advert('agency-a', 'A-3', { listing_url: `${url('agency-a', 'A-3')}?utm=x` }), advert('agency-a', 'A-9')], at(1, 5));
  assert.deepEqual(rows(env, 'SELECT external_key FROM market_latest_observations ORDER BY external_key').map(r => r.external_key.replace(/[0-9a-f]{32}$/, 'H')),
    ['code:A-1', 'code:A-2', 'code:A-3', 'hermes:H']);
  rest(env); assert.equal((await marketSweepPass(env, at(1, 10), { readers })).compared, true);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_sweep_missing'), 0);
});

test('a Gaudin-shaped channel (index page paths) takes its /property/<slug>/<id> listings', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at(0, 5)) });
  const env = world({ HERMES_MARKET_READY: '1', HERMES_MARKET_SOURCES: 'agency-g' });
  source(env, 'agency-g', 'site', ['gaudin.example.test'], ['/residential-for-rent']);
  await marketSweepPass(env, at(0), { readers: {} });
  const pages = await deliver(t, env, runOf(env, 0).id, 'agency-g', [1, 2, 3].map(i => advert('agency-g', `G-${i}`,
    { listing_url: `https://www.gaudin.example.test/property/flat-in-st-helier/10${i}` })), at(0, 10));
  assert.deepEqual(pages, [{ accepted: true, skipped: 0 }]);
  assert.deepEqual(rows(env, "SELECT json_extract(raw_json,'$.listing_url') AS u FROM market_observations WHERE source_ref='agency-g' ORDER BY u").map(r => r.u),
    [1, 2, 3].map(i => `https://www.gaudin.example.test/property/flat-in-st-helier/10${i}`));
});

test('a pass that ends with no advert taken, over several slices, on a channel with live adverts fails; it does not complete empty', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at(0, 5)) });
  const env = world();
  await marketSweepPass(env, at(0), { readers: {} });
  await deliver(t, env, runOf(env, 0).id, 'agency-a', many('agency-a', 'A', 3), at(0, 10));
  rest(env); assert.equal((await marketSweepPass(env, at(0, 20), { readers: {} })).compared, true);
  // Day 1: every advert Hermes sends is off the channel's host, in two slices.
  t.mock.timers.setTime(Date.parse(at(1)));
  await marketSweepPass(env, at(1), { readers: {} });
  const run = runOf(env, 1).id, off = Array.from({ length: 13 }, (_, i) => advert('agency-a', `X-${i}`,
    { listing_url: `https://elsewhere.example.test/properties/X-${i}` })), claim = { run_id: run, source_ref: 'agency-a', channel_id: 'site' };
  rest(env); t.mock.timers.setTime(Date.parse(at(1, 5)));
  let { lease } = ok(await door(env, 'POST', '/claim', claim));
  assert.deepEqual(ok(await door(env, 'POST', '/page', { lease, records: off.slice(0, 10), exhausted: false })), { accepted: true, skipped: 10 });
  rest(env); t.mock.timers.setTime(Date.parse(at(1, 6)));
  ({ lease } = ok(await door(env, 'POST', '/claim', claim)));
  assert.equal((await door(env, 'POST', '/page', { lease, records: off.slice(10), exhausted: true })).status, 409);
  assert.deepEqual({ ...one(env, 'SELECT status,lease_token FROM market_source_runs WHERE run_id=? AND source_ref=?', run, 'agency-a') },
    { status: 'failed', lease_token: null });
  assert.deepEqual(rows(env, "SELECT outcome FROM market_sweep_attempts WHERE run_id=? AND source_ref='agency-a' ORDER BY attempted_at", run)
    .map(r => r.outcome), ['page', 'invalid_response']);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_latest_observations WHERE source_ref='agency-a' AND gone=0"), 3);
});

test('a sub-channel of a source read at "/" is completed empty by the sweep and is not Hermes work', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at(0, 5)) });
  const env = world();
  source(env, 'agency-a', 'root', ['agency-a.example.test'], ['/']);
  await marketSweepPass(env, at(0), { readers: {} });
  assert.deepEqual(rows(env, "SELECT channel_id,status FROM market_source_runs WHERE source_ref='agency-a' ORDER BY channel_id"),
    [{ channel_id: 'root', status: 'pending' }, { channel_id: 'site', status: 'complete' }]);
  assert.deepEqual(rows(env, "SELECT channel_id,outcome,records FROM market_sweep_attempts WHERE source_ref='agency-a'"),
    [{ channel_id: 'site', outcome: 'complete', records: 0 }]);
  assert.deepEqual(ok(await door(env, 'GET', '/work')).items.map(i => i.channel_id), ['root']);
  const run = runOf(env, 0).id;
  assert.equal((await door(env, 'POST', '/claim', { run_id: run, source_ref: 'agency-a', channel_id: 'site' })).status, 404);
});

test('both switches exist off, and equal, in both wrangler files', () => {
  const vars = f => [...readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').matchAll(/^(HERMES_MARKET_\w+) = (.*)$/gm)].map(m => m.slice(1));
  assert.deepEqual(vars('wrangler.toml'), [['HERMES_MARKET_READY', '"0"'], ['HERMES_MARKET_SOURCES', '""']]);
  assert.deepEqual(vars('jobs/wrangler.toml'), vars('wrangler.toml'));
});

test('D1 local: a sub-channel completes empty, and Hermes reads its root channel through the door in the real runtime', async () => {
  const require = createRequire(import.meta.url);
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare'), { unstable_splitSqlQuery } = require('wrangler');
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: '2025-10-01', host: '127.0.0.1', port: 0, d1Databases: { DB: 'bus09-hermes-door-fixture' } }));
  try {
    const DB = await mf.getD1Database('DB'), dir = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter(f => f.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), 'utf8')).map(sql => DB.prepare(sql)));
    const src = (channel, hosts, paths) => DB.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,
      source_class,access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at,allowed_hosts,allowed_paths)
      VALUES ('agency-a',?,'rev-1','external','general','allowed','http',1,'e','r',?,?,?,?)`).bind(channel, ...REVIEWED,
      JSON.stringify(hosts), JSON.stringify(paths));
    await DB.batch([DB.prepare("INSERT INTO market_directory_manifests VALUES ('rev-1',?,'2000-01-01T00:00:00.000Z','fixture','accepted')")
      .bind('a'.repeat(64)), src('root', ['www.agency-a.example.test'], ['/']), src('lettings', ['agency-a.example.test'], ['/to-let'])]);
    const env = { DB, BUS08_SWEEP_READY: '1', HERMES_MARKET_READY: '1', HERMES_MARKET_SOURCES: 'agency-a', HERMES_MARKET_KEY: KEY,
      HERMES_KEY: GENERAL };
    const out = await marketSweepPass(env, at(0), { readers: {} });
    assert.deepEqual(out.read, ['complete']);
    const work = ok(await door(env, 'GET', '/work'));
    assert.deepEqual(work.items.map(i => i.channel_id), ['root']);
    const { lease } = ok(await door(env, 'POST', '/claim', { run_id: work.run_id, source_ref: 'agency-a', channel_id: 'root' }));
    const records = [advert('agency-a', 'A-1', { listing_url: 'https://www.agency-a.example.test/to-let/A-1' }),
      advert('agency-a', 'A-2', { listing_url: 'https://www.agency-a.example.test/to-let/A-2', operation: 'sale', price_text: 'POA' })];
    assert.deepEqual(ok(await door(env, 'POST', '/page', { lease, records, exhausted: true })), { accepted: true, skipped: 0 });
    const count = async sql => (await DB.prepare(sql).first()).n;
    assert.equal(await count("SELECT COUNT(*) AS n FROM market_observations WHERE external_key LIKE 'hermes:%'"), 2);
    assert.equal(await count("SELECT COUNT(*) AS n FROM market_source_runs WHERE status='complete'"), 2);
  } finally { await mf.dispose(); }
});
