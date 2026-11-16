// BUS-04: the market inventory's changes cross again only the active searches they affect, with no proposal or notice
// repeated; a lower price proposes a home again. Synthetic sources, adverts and people only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeEnv, call, adminCookie } from './helpers.mjs';
import { normalizeObservation } from '../../server/market-extraction.js';
import worker from '../../server/jobs.js';
import { RECOMPUTE_FLAGS, marketSweepPass } from '../../server/market-daily-sweep.js';
import { CHANGES_PER_TICK, classifyMarketChange, lowerPrice, marketRematchPass } from '../../server/market-rematch.js';
import { recomputeForApplicant } from '../../server/search-state.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AT = '2026-11-16T10:00:00.000Z';
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const one = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
const n = (env, sql, ...a) => one(env, sql, ...a).n;
let clock = 0;
const tick = () => new Date(Date.parse(AT) + ++clock * 600000).toISOString();

function world({ on = true } = {}) {
  const env = makeEnv(), db = env.DB.raw;
  Object.assign(env, { EST01_SEARCH_STATE_READY: '1', MARKET_INVENTORY_READY: '1' });
  for (const flag of RECOMPUTE_FLAGS) env[flag] = '1';
  if (on) env.BUS04_REMATCH_READY = '1';
  db.prepare("INSERT INTO market_directory_manifests VALUES (?,?,?,?,'accepted')").run('rev', 'a'.repeat(64), '2000-01-01T00:00:00.000Z', 'review');
  for (const source of ['agency-a', 'agency-b']) db.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,
    source_kind,source_class,access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at)
    VALUES (?,'site','rev','external','general','allowed','manual',1,'evidence','retention','2000-01-01T00:00:00.000Z',
    '2999-01-01T00:00:00.000Z')`).run(source);
  db.prepare(`INSERT INTO market_runs(id,kind,manifest_revision,manifest_sha256,operation_id,created_at,created_by)
    VALUES(?,'initial','rev',?,?,?,'fixture')`).run(id(100), 'a'.repeat(64), id(101), AT);
  env.seq = 0;
  return env;
}
// One reading of an advert, and its row in the change outbox as BUS-06 writes it (change: false for a reading that
// changed nothing, which BUS-06 does not emit).
function reading(env, key, { amount = 150000, period = 'month', operation = 'rent', title = `Advert ${key}`, bedrooms = 2,
  currency = 'GBP', change = true, source = 'agency-a' } = {}) {
  const seq = ++env.seq, page = id(1000 + seq), observation = id(2000 + seq), seen = new Date(Date.parse(AT) + seq * 1000).toISOString();
  const normalized = normalizeObservation({ country_code: 'JE', territory_evidence: 'Address on the listing: Jersey', operation,
    observed_at: seen, title, parish: 'St Helier', bedrooms, bathrooms: 1, financial_terms: [operation === 'sale'
      ? { kind: 'sale_price', amount_minor: amount, currency, period: 'sale' } : { kind: 'rent', amount_minor: amount, currency, period }] });
  env.DB.raw.prepare(`INSERT INTO market_pages(id,run_id,source_ref,channel_id,page_key,content_sha256,exhausted,observed_at,
    committed_at,committed_by,lease_token,lease_generation,policy_version) VALUES(?,?,?,'site',?,?,0,?,?,'fixture','fixture',1,1)`)
    .run(page, id(100), source, `page-${seq}`, 'b'.repeat(64), seen, seen);
  env.DB.raw.prepare(`INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,
    normalized_sha256,source_at,origin_sha256) VALUES(?,?,?,'site',?,?,?,?,?,?)`).run(observation, page, source, key,
    JSON.stringify({ listing_url: `https://${source}.example.test/${key}` }), JSON.stringify(normalized), 'c'.repeat(64), seen, 'd'.repeat(64));
  if (change) env.DB.raw.prepare(`INSERT INTO market_change_outbox(id,observation_id,observation_version,kind)
    VALUES (?,?,1,'observation_changed')`).run(id(3000 + seq), observation);
  return observation;
}
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const register = async (env, o = {}) => ok(await req(env, 'POST', '/admin/applicants', { name: `Jane Le Brocq ${++env.seq}`,
  email: `j${env.seq}@example.je`, phone: `07797 ${100000 + env.seq}`, source: 'phone', operation: 'rent', budget_max: 2000,
  bedrooms_min: 2, ...o }), 201).id;
const home = key => JSON.stringify(['agency-a', 'site', key, 'rent']);
const held = (env, applicant) => rows(env, 'SELECT home_key,result FROM market_matches WHERE applicant_id=? ORDER BY home_key', applicant);
const proposals = (env, applicant) => rows(env, `SELECT home_key,reason,price FROM market_match_proposals WHERE applicant_id=?
  ORDER BY home_key`, applicant).map(p => ({ ...p, price: p.price && JSON.parse(p.price) }));
const notices = (env, applicant) => rows(env, `SELECT n.id,n.title,n.resolved_at,e.data FROM notifications n JOIN events e ON e.id=n.event_id
  WHERE e.entity_type='applicant' AND e.entity_id=? AND e.type='applicant.market_matched' ORDER BY n.id`, String(applicant));
const attempts = (env, applicant) => one(env, 'SELECT last_attempt_at FROM applicant_search_runs WHERE applicant_id=?', applicant)?.last_attempt_at;
// Ticks until nothing is left to consume or cross.
async function drain(env) {
  const outs = [];
  for (let i = 0; i < 10; i++) {
    const out = await marketRematchPass(env, tick());
    outs.push(out);
    if (!out.consumed && !out.crossed.length) break;
  }
  return outs;
}
const resolve = (env, noticeId) => env.DB.raw.prepare("UPDATE notifications SET resolved_at=?,resolved_by='admin@example.test' WHERE id=?").run(AT, noticeId);

test('a change is material only when it touches what a search reads; a lower price only in the same terms', () => {
  const base = { operation: 'rent', observed_at: '2026-11-15T10:00:00.000Z', fields: { title: 'Flat', parish: 'St Helier', bedrooms: 2 },
    financial_terms: [{ kind: 'rent', amount_minor: 200000, currency: 'GBP', period: 'month' }] };
  const text = o => JSON.stringify(o);
  assert.deepEqual(classifyMarketChange({ before: null, after: text(base) }), { material: true, operations: ['rent'] });
  assert.equal(classifyMarketChange({ before: text(base), after: text({ ...base, fields: { ...base.fields, title: 'Bright flat' },
    observed_at: AT }) }).material, false);
  // A reading that loses its time no longer counts towards its home's facts (BUS-01): material.
  assert.equal(classifyMarketChange({ before: text(base), after: text({ ...base, observed_at: undefined }) }).material, true);
  assert.equal(classifyMarketChange({ before: text(base), after: text({ ...base, financial_terms: [{ ...base.financial_terms[0],
    amount_minor: 190000 }] }) }).material, true);
  assert.equal(classifyMarketChange({ before: text(base), after: text(base), gone: 1 }).material, true);
  assert.deepEqual(classifyMarketChange({ before: text(base), after: text({ ...base, operation: 'sale' }) }).operations, ['rent', 'sale']);
  assert.deepEqual(classifyMarketChange({ before: null, after: '{broken' }), { material: true, operations: ['rent', 'sale'] });
  const p = (amount, currency = 'GBP', period = 'month') => JSON.stringify([amount, currency, period]);
  assert.equal(lowerPrice(p(190000), p(200000)), true);
  assert.equal(lowerPrice(p(200000), p(200000)), false);
  assert.equal(lowerPrice(p(2400000, 'GBP', 'year'), p(200000)), false); // £24,000 a year is £2,000 a month: no drop
  assert.equal(lowerPrice(p(2300000, 'GBP', 'year'), p(200000)), true);
  assert.equal(lowerPrice(p(190000, 'EUR'), p(200000)), false);
  assert.equal(lowerPrice(p(190000, 'GBP', 'week'), p(200000)), false);
  assert.equal(lowerPrice(null, p(200000)), false);
  assert.equal(lowerPrice(p(190000), null), false);
});

test('a new advert crosses only the searches of its operation, once, with one notice each and nothing repeated', async () => {
  const env = world();
  const rent = [await register(env), await register(env)], buy = await register(env, { operation: 'buy', budget_max: 600000 });
  const commercial = await register(env); // a commercial search is not crossed with the market (BUS-12)
  env.DB.raw.prepare("UPDATE applicants SET search_category='commercial' WHERE id=?").run(commercial);
  const before = attempts(env, buy);
  reading(env, 'A-1');
  const outs = await drain(env);
  assert.equal(outs[0].consumed, 1);
  assert.deepEqual(outs.flatMap(o => o.crossed), ['crossed', 'crossed']);
  for (const a of rent) {
    assert.deepEqual(held(env, a).map(m => m.home_key), [home('A-1')]);
    assert.deepEqual(proposals(env, a), [{ home_key: home('A-1'), reason: 'new', price: [150000, 'GBP', 'month'] }]);
    const [notice] = notices(env, a);
    assert.match(notice.title, /^New market homes for Jane Le Brocq/);
    assert.deepEqual(JSON.parse(notice.data), { new: 1, lower_price: 0 });
  }
  assert.equal(attempts(env, buy), before); // another operation: not crossed again
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_match_proposals WHERE applicant_id=?', commercial), 0);
  assert.equal(notices(env, commercial).length, 0);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_change_outbox WHERE consumer_state='pending'"), 0);
  // Nothing new: no crossing, no notice. A new title only: consumed, nothing crossed.
  assert.deepEqual(await marketRematchPass(env, tick()), { consumed: 0, crossed: [] });
  reading(env, 'A-1', { title: 'A brighter flat' });
  assert.ok((await drain(env)).every(o => !o.crossed.length));
  // The same home read again at a higher and then the same price: crossed, never proposed nor noticed again.
  reading(env, 'A-1', { amount: 160000 });
  await drain(env);
  reading(env, 'A-1', { amount: 150000 });
  await drain(env);
  for (const a of rent) {
    assert.equal(notices(env, a).length, 1);
    assert.equal(proposals(env, a)[0].reason, 'new');
  }
  // Read cheaper than when it was proposed while the notice is open: proposed again, the open notice covers it.
  reading(env, 'A-1', { amount: 140000 });
  await drain(env);
  assert.deepEqual(proposals(env, rent[0]), [{ home_key: home('A-1'), reason: 'lower_price', price: [140000, 'GBP', 'month'] }]);
  assert.equal(notices(env, rent[0]).length, 1);
  // Once the team has dealt with it, a further drop raises a new one; it says a lower price, not a new home.
  resolve(env, notices(env, rent[0])[0].id);
  reading(env, 'A-1', { amount: 130000 });
  await drain(env);
  const after = notices(env, rent[0]);
  assert.equal(after.length, 2);
  assert.deepEqual(JSON.parse(after[1].data), { new: 0, lower_price: 1 });
  assert.equal(notices(env, rent[1]).length, 1); // still open for the other search
});

test('a price drop brings back a home the search had left out, and only a lower price brings back one it was told about', async () => {
  const env = world();
  const a = await register(env); // budget £2,000 a month
  reading(env, 'B-1', { amount: 230000 });
  await drain(env);
  assert.deepEqual(held(env, a), []); // over budget: left out
  assert.equal(notices(env, a).length, 0);
  reading(env, 'B-1', { amount: 190000 });
  await drain(env);
  assert.deepEqual(held(env, a).map(m => m.home_key), [home('B-1')]);
  assert.deepEqual(proposals(env, a).map(p => p.reason), ['new']);
  resolve(env, notices(env, a)[0].id);
  // It goes over budget and leaves; back at the price it was proposed at, it is not proposed again.
  reading(env, 'B-1', { amount: 240000 });
  await drain(env);
  assert.deepEqual(held(env, a), []);
  reading(env, 'B-1', { amount: 190000 });
  await drain(env);
  assert.deepEqual(held(env, a).map(m => m.home_key), [home('B-1')]);
  assert.equal(notices(env, a).length, 1);
  // The same rent stated per year is not a drop either; a lower one is.
  reading(env, 'B-1', { amount: 2280000, period: 'year' });
  await drain(env);
  assert.equal(notices(env, a).length, 1);
  reading(env, 'B-1', { amount: 180000 });
  await drain(env);
  assert.equal(notices(env, a).length, 2);
  assert.deepEqual(proposals(env, a)[0], { home_key: home('B-1'), reason: 'lower_price', price: [180000, 'GBP', 'month'] });
});

test('what a search held before a change crossed it is its baseline: no notice, and no earlier price invented', async () => {
  const env = world();
  reading(env, 'C-1', { change: false });
  const a = await register(env); // its first search finds C-1 with no change at all
  assert.deepEqual(held(env, a).map(m => m.home_key), [home('C-1')]);
  reading(env, 'C-1', { amount: 140000 }); // cheaper, but nothing says what it cost when the search found it
  await drain(env);
  assert.deepEqual(proposals(env, a), [{ home_key: home('C-1'), reason: 'baseline', price: [140000, 'GBP', 'month'] }]);
  assert.equal(notices(env, a).length, 0);
  reading(env, 'C-1', { amount: 130000 }); // from here on the recorded price counts
  await drain(env);
  assert.equal(proposals(env, a)[0].reason, 'lower_price');
  assert.equal(notices(env, a).length, 1);
});

test('a visit or a negotiation does not stop the crossing; a resolved or archived search is not crossed', async () => {
  const env = world();
  const viewing = await register(env), offer = await register(env), resolved = await register(env);
  env.DB.raw.prepare("UPDATE applicants SET stage='viewing' WHERE id=?").run(viewing);
  env.DB.raw.prepare("UPDATE applicants SET stage='offer' WHERE id=?").run(offer);
  env.DB.raw.prepare(`UPDATE applicants SET search_state='resolved',resolved_at=?,resolved_by='admin@example.test',
    resolution_reason='Found a home' WHERE id=?`).run(AT, resolved);
  reading(env, 'D-1');
  await drain(env);
  for (const a of [viewing, offer]) assert.equal(notices(env, a).length, 1);
  assert.equal(notices(env, resolved).length, 0);
  assert.deepEqual(held(env, resolved), []);
});

test('a tick that dies before marking the changes keeps them; overlapping ticks queue and notice once', async () => {
  const env = world();
  const a = await register(env);
  reading(env, 'E-1');
  env.DB.raw.exec("CREATE TRIGGER fixture_queue_failure BEFORE INSERT ON market_rematch_queue BEGIN SELECT RAISE(ABORT,'fixture'); END");
  await assert.rejects(marketRematchPass(env, tick()));
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_change_outbox WHERE consumer_state='pending'"), 1);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_rematch_queue'), 0);
  env.DB.raw.exec('DROP TRIGGER fixture_queue_failure');
  const ts = tick();
  await Promise.all([marketRematchPass(env, ts), marketRematchPass(env, tick())]);
  await drain(env);
  assert.equal(notices(env, a).length, 1);
  assert.equal(proposals(env, a).length, 1);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_rematch_queue'), 0);
});

test('changes are read a page at a time and every search once, however many changes touch it', async () => {
  const env = world();
  const a = await register(env);
  for (let i = 0; i < CHANGES_PER_TICK + 5; i++) reading(env, `F-${i}`);
  const first = await marketRematchPass(env, tick());
  assert.equal(first.consumed, CHANGES_PER_TICK);
  assert.deepEqual(first.crossed, ['crossed']);
  const second = await marketRematchPass(env, tick());
  assert.equal(second.consumed, 5);
  assert.deepEqual(second.crossed, ['crossed']);
  assert.equal(notices(env, a).length, 1);
});

test('a search that fails to cross is tried again behind the others and dropped after three failures', async t => {
  t.mock.method(console, 'error', () => {});
  const env = world();
  const a = await register(env);
  reading(env, 'G-1');
  env.DB.raw.exec("CREATE TRIGGER fixture_proposals_failure BEFORE INSERT ON market_match_proposals BEGIN SELECT RAISE(ABORT,'fixture'); END");
  for (let i = 1; i <= 3; i++) {
    assert.deepEqual((await marketRematchPass(env, tick())).crossed, ['failed']);
    assert.equal(one(env, 'SELECT attempts FROM market_rematch_queue WHERE applicant_id=?', a)?.attempts ?? 3, i);
  }
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_rematch_queue'), 0);
});

test('the baseline is taken once: a home a later save of the search brought in is new at the next crossing', async () => {
  const env = world();
  const a = await register(env);
  reading(env, 'M-1');
  await drain(env); // first crossing: baseline taken (nothing held), M-1 new
  resolve(env, notices(env, a)[0].id);
  reading(env, 'M-2', { change: false }); // no change emitted: only a save of the search or Recalculate all finds it
  await recomputeForApplicant(env, a, 'admin@example.test');
  assert.deepEqual(held(env, a).map(m => m.home_key), [home('M-1'), home('M-2')]);
  reading(env, 'M-9', { amount: 900000 }); // an unrelated change crosses the search again
  await drain(env);
  assert.deepEqual(proposals(env, a).map(p => [p.home_key, p.reason]), [[home('M-1'), 'new'], [home('M-2'), 'new']]);
  assert.equal(notices(env, a).length, 2);
});

test('a crossing whose market part failed is a failed attempt: old results are not proposed and it stays queued', async t => {
  t.mock.method(console, 'error', () => {});
  const env = world();
  const a = await register(env);
  reading(env, 'N-1');
  env.DB.raw.exec("CREATE TRIGGER fixture_market_failure BEFORE INSERT ON market_matches BEGIN SELECT RAISE(ABORT,'fixture'); END");
  assert.deepEqual((await marketRematchPass(env, tick())).crossed, ['failed']);
  assert.equal(one(env, 'SELECT attempts FROM market_rematch_queue WHERE applicant_id=?', a).attempts, 1);
  assert.equal(notices(env, a).length, 0);
  env.DB.raw.exec('DROP TRIGGER fixture_market_failure');
  assert.deepEqual((await marketRematchPass(env, tick())).crossed, ['crossed']);
  assert.equal(notices(env, a).length, 1);
});

test('a backlog of changes neither keeps crossing the same searches nor saves one that always fails', async () => {
  const env = world();
  const [x, y, z] = [await register(env), await register(env), await register(env)];
  env.DB.raw.exec(`CREATE TRIGGER fixture_x_failure BEFORE INSERT ON market_rematch_baselines WHEN NEW.applicant_id=${x}
    BEGIN SELECT RAISE(ABORT,'fixture'); END`);
  const crossedBy = [];
  const left = [];
  for (let i = 0; i < 3; i++) { // a new change every tick queues all three again
    reading(env, `P-${i}`);
    await marketRematchPass(env, tick());
    left.push(rows(env, 'SELECT applicant_id,attempts FROM market_rematch_queue ORDER BY applicant_id').map(r => [r.applicant_id, r.attempts]));
  }
  // x fails every tick and is dropped at its third failure, though every tick queued it again; y and z take turns.
  assert.deepEqual(left, [[[x, 1], [z, 0]], [[x, 2], [y, 0]], [[z, 0]]]);
  assert.equal(notices(env, y).length, 1);
  assert.equal(notices(env, z).length, 1);
});

test('a home whose adverts a person joins keeps what was proposed under its earlier key', async () => {
  const env = world();
  const a = await register(env);
  const left = reading(env, 'Q-1');
  await drain(env);
  resolve(env, notices(env, a)[0].id);
  const right = reading(env, 'Q-1', { source: 'agency-b', change: false }); // the same home on another site
  ok(await req(env, 'POST', '/admin/market/identity/decisions', { action: 'same_property', left_observation_id: left,
    right_observation_id: right, operation_id: crypto.randomUUID() }), 201);
  reading(env, 'Q-9', { amount: 900000 }); // an unrelated change crosses the search again
  await drain(env);
  const keys = held(env, a).map(m => m.home_key);
  assert.equal(keys.length, 1);
  assert.notEqual(keys[0], home('Q-1')); // the home now has its decided key
  assert.equal(notices(env, a).length, 1); // not proposed nor noticed again
  assert.deepEqual(proposals(env, a).find(p => p.home_key === keys[0]).reason, 'new');
  // A lower price under the new key is still a drop from what was proposed.
  reading(env, 'Q-1', { amount: 140000 });
  reading(env, 'Q-1', { amount: 140000, source: 'agency-b' });
  await drain(env);
  assert.equal(proposals(env, a).find(p => p.home_key === keys[0]).reason, 'lower_price');
  assert.equal(notices(env, a).length, 2);
});

test('a crossing reads the inventory once: the prices come from the search itself', async () => {
  const env = world();
  await register(env);
  reading(env, 'R-1');
  const seen = [], prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => { seen.push(sql); return prepare(sql); };
  assert.deepEqual((await marketRematchPass(env, tick())).crossed, ['crossed']);
  assert.equal(seen.filter(sql => /homes AS MATERIALIZED/.test(sql)).length, 1);
});

test('without the website rules in the clock it waits and consumes nothing', async () => {
  const env = world();
  await register(env);
  reading(env, 'H-1');
  delete env.EST15_UNAVAILABILITY_READY;
  assert.deepEqual(await marketRematchPass(env, tick()), { waiting: true });
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_change_outbox WHERE consumer_state='pending'"), 1);
});

test('the notice opens the market inventory and can be marked done', async () => {
  const env = world(), cookie = await adminCookie();
  const a = await register(env);
  reading(env, 'I-1');
  await drain(env);
  const [{ id: noticeId }] = notices(env, a);
  const listed = (await call(env, 'GET', '/admin/notifications?box=action', { cookie })).data.notifications.find(x => x.id === noticeId);
  assert.deepEqual([listed.target_exists, listed.link], [true, '#/automations']);
  const done = await call(env, 'PUT', `/admin/notification-tasks/${noticeId}`, { cookie,
    body: { operation_id: crypto.randomUUID(), revision: listed.revision, action: 'done' } });
  assert.equal(done.status, 200, JSON.stringify(done.data));
});

test('with BUS-04 on, the daily sweep leaves the recompute to it and counts the day once its changes are crossed', async () => {
  const env = world();
  env.BUS08_SWEEP_READY = '1';
  await register(env);
  reading(env, 'J-1');
  env.DB.raw.prepare("INSERT INTO market_daily_sweeps(run_id,jersey_day,compared_at,changes) VALUES (?, '2000-01-01', ?, 1)").run(id(100), AT);
  const ts = '2026-11-16T03:00:00.000Z';
  assert.equal((await marketSweepPass(env, ts)).recompute, 'rematch');
  assert.equal(one(env, 'SELECT recomputed_at FROM market_daily_sweeps WHERE run_id=?', id(100)).recomputed_at, null);
  await drain(env);
  assert.equal((await marketSweepPass(env, '2026-11-16T03:10:00.000Z')).recompute, 'rematch');
  assert.ok(one(env, 'SELECT recomputed_at FROM market_daily_sweeps WHERE run_id=?', id(100)).recomputed_at);
});

test('switched off, the clock and the website do exactly what they did', async t => {
  t.mock.method(console, 'log', () => {}); t.mock.method(console, 'error', () => {});
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(AT) });
  const record = async flag => {
    const env = world({ on: false });
    if (flag !== undefined) env.BUS04_REMATCH_READY = flag;
    reading(env, 'K-1');
    const seen = [], prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = sql => { seen.push(sql); return prepare(sql); };
    await worker.scheduled({ cron: '*/10 * * * *', scheduledTime: Date.parse(AT) }, env, { waitUntil() {} });
    assert.equal(await marketRematchPass(env, AT), null);
    return { seen, pending: n(env, "SELECT COUNT(*) AS n FROM market_change_outbox WHERE consumer_state='pending'") };
  };
  const off = await record('0'), absent = await record(undefined);
  assert.deepEqual(off.seen, absent.seen);
  assert.ok(!off.seen.some(sql => /market_/.test(sql)));
  assert.deepEqual([off.pending, absent.pending], [1, 1]);
});

const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const vars = text => Object.fromEntries([...text.split(/^\[(?!vars\])/m)[0].matchAll(/^(\w+) = "(.*)"$/gm)].map(m => [m[1], m[2]]));
function flagsRead(entry) {
  const seen = new Set(), flags = new Set(), walk = file => {
    if (seen.has(file)) return; seen.add(file);
    const text = read(file);
    for (const m of text.matchAll(/\b([A-Z0-9_]+_READY)\b/g)) flags.add(m[1]);
    for (const m of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) walk(new URL(m[1], new URL(`../../${file}`, import.meta.url)).pathname
      .slice(new URL('../../', import.meta.url).pathname.length));
  };
  walk(entry);
  return flags;
}
test('the switch matches in both wrangler files, and the clock mirrors what a crossing reads before it is on', () => {
  const jobs = vars(read('jobs/wrangler.toml')), pages = vars(read('wrangler.toml'));
  assert.equal(jobs.BUS04_REMATCH_READY, '1');
  assert.equal(pages.BUS04_REMATCH_READY, jobs.BUS04_REMATCH_READY);
  const needed = flagsRead('server/market-rematch.js');
  for (const flag of RECOMPUTE_FLAGS) assert.ok(needed.has(flag), flag);
  if (jobs.BUS04_REMATCH_READY === '1') for (const flag of needed) if (flag in pages) assert.equal(jobs[flag], pages[flag], flag);
});

test('D1 local: a change is consumed, its search crossed and noticed once in the real runtime', async () => {
  const require = createRequire(import.meta.url);
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare'), { unstable_splitSqlQuery } = require('wrangler');
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: '2025-10-01', host: '127.0.0.1', port: 0, d1Databases: { DB: 'bus04-rematch-fixture' } }));
  try {
    const DB = await mf.getD1Database('DB'), dir = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter(f => f.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), 'utf8')).map(sql => DB.prepare(sql)));
    // The same synthetic world, copied row by row from the node:sqlite fixture after a registration.
    const local = world();
    const a = await register(local);
    reading(local, 'L-1');
    for (const table of ['contacts', 'applicants', 'applicant_search_runs', 'market_directory_manifests', 'market_sources',
      'market_runs', 'market_pages', 'market_observations', 'market_change_outbox']) {
      const all = rows(local, `SELECT * FROM ${table}`);
      if (!all.length) continue;
      const cols = Object.keys(all[0]);
      await DB.batch(all.map(r => DB.prepare(`INSERT OR REPLACE INTO ${table}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
        .bind(...cols.map(c => r[c]))));
    }
    const env = { DB, BUS04_REMATCH_READY: '1', EST01_SEARCH_STATE_READY: '1', ...Object.fromEntries(RECOMPUTE_FLAGS.map(f => [f, '1'])) };
    for (let i = 0; i < 3; i++) await marketRematchPass(env, tick());
    const count = async (sql, ...b) => (await DB.prepare(sql).bind(...b).first()).n;
    assert.equal(await count("SELECT COUNT(*) AS n FROM market_change_outbox WHERE consumer_state='pending'"), 0);
    assert.equal(await count("SELECT COUNT(*) AS n FROM market_match_proposals WHERE applicant_id=? AND reason='new'", a), 1);
    assert.equal(await count("SELECT COUNT(*) AS n FROM notifications WHERE task_key LIKE 'bus04:market:%'"), 1);
    assert.equal(await count('SELECT COUNT(*) AS n FROM market_rematch_queue'), 0);
  } finally { await mf.dispose(); }
});
