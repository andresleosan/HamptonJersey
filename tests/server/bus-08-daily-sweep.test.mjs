// BUS-08: the daily market sweep, on synthetic sources read by a fixture reader. No real source, network or person.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeEnv, call, adminCookie } from './helpers.mjs';
import { createInventoryRun } from '../../server/market-inventory-store.js';
import worker from '../../server/jobs.js';
import { CHANNELS_PER_TICK, MAX_FAILURES, RECOMPUTE_FLAGS, SourceReadError, dailyRunDue, jerseyDayEnd, marketSweepPass }
  from '../../server/market-daily-sweep.js';

// Ticks from two days ahead, 03:00 UTC (after 01:00 in Jersey in any season): leases and pacing compare with D1's clock.
const DAY0 = Date.parse(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) + 'T03:00:00.000Z');
const at = (day, minutes = 0) => new Date(DAY0 + day * 86400000 + minutes * 60000).toISOString();
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const one = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
const n = (env, sql, ...a) => one(env, sql, ...a).n;

function world({ sources = ['agency-a', 'agency-b'], revision = 'rev-1' } = {}) {
  const env = makeEnv();
  Object.assign(env, { BUS08_SWEEP_READY: '1', MARKET_INVENTORY_READY: '1' });
  manifest(env, revision, '2000-01-01T00:00:00.000Z');
  for (const source of sources) env.DB.raw.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,
    source_class,access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at,allowed_hosts,allowed_paths)
    VALUES (?,'site',?,'external','general','allowed','http',1,'fixture-evidence','fixture-retention',?,?,?,'["/properties"]')`)
    .run(source, revision, '2000-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z', JSON.stringify([`${source}.example.test`]));
  // A channel still pending review is never read and never counted as read.
  env.DB.raw.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class)
    VALUES ('agency-pending','site',?,'external','unclassified')`).run(revision);
  return env;
}
const manifest = (env, revision, acceptedAt) => env.DB.raw.prepare(
  "INSERT INTO market_directory_manifests VALUES (?,?,?,'fixture','accepted')").run(revision, 'a'.repeat(64), acceptedAt);
// D1's own clock paces channels (60 s) and leases; between the test's ticks they are released as time would. A
// channel told to wait keeps a wait (now past), so a test never hides one that is left without it.
const rest = env => env.DB.raw.exec(`UPDATE market_source_activity SET last_acquired_at=NULL;
  UPDATE market_source_runs SET next_due='2000-01-01T00:00:00.000Z' WHERE next_due IS NOT NULL;`);

const advert = (key, amount = 150000) => ({ key, amount });
const many = (prefix, count) => Array.from({ length: count }, (_, i) => advert(`${prefix}-${i + 1}`));
// A reader of fixture adverts, ten a page. fail(source) may throw what a source would.
function fixtures(listings, fail = () => null) {
  const reader = { calls: [], async readPage({ source_ref, cursor, signal }) {
    assert.ok(signal instanceof AbortSignal);
    reader.calls.push([source_ref, cursor]);
    const error = fail(source_ref);
    if (error) throw error;
    const all = listings[source_ref], start = Number(cursor ?? 0), end = start + 10;
    return { exhausted: end >= all.length, next_cursor: end >= all.length ? null : String(end),
      records: all.slice(start, end).map(({ key, amount }) => ({ external_key: key,
        raw: { listing_url: `https://${source_ref}.example.test/properties/${key}` },
        observation: { country_code: 'JE', territory_evidence: 'Address on the listing: Jersey', operation: 'rent',
          title: `Synthetic flat ${key}`, parish: 'St Helier', bedrooms: 2, bathrooms: 1,
          financial_terms: [{ kind: 'rent', amount_minor: amount, currency: 'GBP', period: 'month' }] } })) };
  } };
  return { reader, readers: Object.fromEntries(Object.keys(listings).map(source => [source, reader])) };
}
// One Jersey day: ticks ten minutes apart until the day is compared.
async function sweepDay(env, day, readers, ticks = 12) {
  const outs = [];
  for (let i = 0; i < ticks; i++) {
    rest(env);
    const out = await marketSweepPass(env, at(day, i * 10), { readers });
    outs.push(out);
    if (out.compared) break;
  }
  return outs;
}
const latestPrice = (env, source, key) => JSON.parse(one(env, `SELECT o.normalized_json FROM market_latest_observations l
  JOIN market_observations o ON o.id=l.observation_id WHERE l.source_ref=? AND l.external_key=?`, source, key).normalized_json)
  .financial_terms[0].amount_minor;
const outbox = env => n(env, 'SELECT COUNT(*) AS n FROM market_change_outbox');
const task = (env, run) => one(env, 'SELECT * FROM notifications WHERE task_key=?', `bus08:sweep:${run}`);
const runOf = (env, day) => one(env, "SELECT * FROM market_runs WHERE kind='daily' AND jersey_day=?", day);

test('01:00 Jersey time, once per local day, through both clock changes', () => {
  // Spring 2026-03-29: 01:00 GMT does not exist; the first instant after it (01:00 UTC, 02:00 BST) is due.
  assert.deepEqual(dailyRunDue('2026-03-29T00:59:00.000Z'), { due: false, jersey_day: '2026-03-29' });
  assert.deepEqual(dailyRunDue('2026-03-29T01:00:00.000Z'), { due: true, jersey_day: '2026-03-29' });
  // Autumn 2026-10-25: 01:00 happens twice (00:00 and 01:00 UTC); the same day, so one run (one per jersey_day).
  assert.deepEqual(dailyRunDue('2026-10-25T00:00:00.000Z'), { due: true, jersey_day: '2026-10-25' });
  assert.deepEqual(dailyRunDue('2026-10-25T01:00:00.000Z'), { due: true, jersey_day: '2026-10-25' });
  // Summer 01:00 local is 00:00 UTC; winter, 01:00 UTC. A late tick (processing time) still belongs to its own day.
  assert.equal(dailyRunDue('2026-07-01T00:00:00.000Z').due, true);
  assert.equal(dailyRunDue('2026-06-30T23:59:00.000Z').due, false);
  assert.equal(dailyRunDue('2026-12-01T00:59:00.000Z').due, false);
  assert.deepEqual(dailyRunDue('2026-12-01T23:50:00.000Z'), { due: true, jersey_day: '2026-12-01' });
  // The day ends at the next Jersey midnight: 23:00 UTC in summer, 00:00 UTC in winter and on both change days.
  assert.equal(jerseyDayEnd('2026-07-01'), '2026-07-01T23:00:00.000Z');
  assert.equal(jerseyDayEnd('2026-12-01'), '2026-12-02T00:00:00.000Z');
  assert.equal(jerseyDayEnd('2026-03-29'), '2026-03-29T23:00:00.000Z');
  assert.equal(jerseyDayEnd('2026-10-25'), '2026-10-26T00:00:00.000Z');
});

test('one run per Jersey day on the manifest of its first tick; missed days are not made up', async () => {
  const env = world(), { readers } = fixtures({ 'agency-a': many('A', 2), 'agency-b': many('B', 2) });
  await marketSweepPass(env, at(0), { readers });
  manifest(env, 'rev-2', '2001-01-01T00:00:00.000Z');
  env.DB.raw.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class)
    VALUES ('agency-new','site','rev-2','external','unclassified')`).run();
  rest(env); await marketSweepPass(env, at(0, 10), { readers });
  rest(env); await marketSweepPass(env, at(0, 20), { readers });
  const day0 = at(0).slice(0, 10);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_runs WHERE kind='daily'"), 1);
  assert.equal(runOf(env, day0).manifest_revision, 'rev-1');
  // Three days later: one run for that day only; the old one is closed, not resumed.
  await marketSweepPass(env, at(3), { readers });
  assert.deepEqual(rows(env, "SELECT jersey_day,status,manifest_revision FROM market_runs WHERE kind='daily' ORDER BY jersey_day"),
    [{ jersey_day: day0, status: 'partial', manifest_revision: 'rev-1' }, { jersey_day: at(3).slice(0, 10), status: 'open', manifest_revision: 'rev-2' }]);
});

test('day by day: new adverts, an unchanged day emits nothing, a price drop is one change, a missing advert is a review', async () => {
  const env = world(), listings = { 'agency-a': many('A', 12), 'agency-b': many('B', 3) };
  const { readers, reader } = fixtures(listings);
  const day1 = await sweepDay(env, 0, readers);
  assert.equal(day1.at(-1).compared, true);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_observations'), 15);
  assert.equal(outbox(env), 15, 'every new advert is a change for BUS-04');
  const run1 = runOf(env, at(0).slice(0, 10)).id;
  assert.deepEqual(rows(env, `SELECT source_ref,outcome,records FROM market_sweep_attempts WHERE run_id=? ORDER BY source_ref,attempted_at`, run1),
    [{ source_ref: 'agency-a', outcome: 'page', records: 10 }, { source_ref: 'agency-a', outcome: 'complete', records: 2 },
     { source_ref: 'agency-b', outcome: 'complete', records: 3 }]);
  assert.equal(task(env, run1), undefined, 'a clean first day needs no review');
  assert.ok(!reader.calls.some(([source]) => source === 'agency-pending'));
  // Day 2: the same adverts read again emit no change.
  await sweepDay(env, 1, readers);
  assert.equal(outbox(env), 15);
  assert.equal(one(env, 'SELECT changes FROM market_daily_sweeps WHERE run_id=?', runOf(env, at(1).slice(0, 10)).id).changes, 0);
  // Day 3: A-3 drops its rent, B-2 is gone from its site.
  listings['agency-a'][2].amount = 140000;
  listings['agency-b'].splice(1, 1);
  await sweepDay(env, 2, readers);
  const run3 = runOf(env, at(2).slice(0, 10)).id;
  assert.equal(outbox(env), 16);
  assert.equal(latestPrice(env, 'agency-a', 'A-3'), 140000);
  assert.deepEqual(rows(env, 'SELECT source_ref,external_key FROM market_sweep_missing WHERE run_id=?', run3),
    [{ source_ref: 'agency-b', external_key: 'B-2' }]);
  // Never an unavailability: the advert stays in the inventory, nothing is confirmed, one task for a person.
  assert.equal(one(env, "SELECT gone FROM market_latest_observations WHERE external_key='B-2'").gone, 0);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM availability_confirmations'), 0);
  const t = task(env, run3);
  assert.equal(t.title, 'Daily market sweep needs review');
  assert.equal(t.task_reason, `${at(2).slice(0, 10)}: 1 adverts not found, 0 sources not read in full. Nothing was marked unavailable.`);
  assert.equal(t.category, 'task');
  // The next day it is compared with day 3's full pass: B-2 is not reported again.
  await sweepDay(env, 3, readers);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_sweep_missing'), 1);
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM notifications WHERE task_key LIKE 'bus08:%'"), 1);
});

test('a source down keeps its adverts and shows the failure; retries stop after three', async () => {
  const env = world(), listings = { 'agency-a': many('A', 3), 'agency-b': many('B', 3) };
  let down = false;
  const { readers } = fixtures(listings, source => down && source === 'agency-b' ? new SourceReadError('unavailable') : null);
  await sweepDay(env, 0, readers);
  down = true; listings['agency-b'] = [];
  const outs = await sweepDay(env, 1, readers);
  const run = runOf(env, at(1).slice(0, 10)).id;
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_sweep_attempts WHERE run_id=? AND outcome='unavailable'", run), MAX_FAILURES);
  assert.equal(one(env, "SELECT status FROM market_source_runs WHERE run_id=? AND source_ref='agency-b'", run).status, 'blocked');
  assert.equal(outs.at(-1).compared, true);
  // Its adverts stay as they were read; nothing is missing for a channel without a full pass today.
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_latest_observations WHERE source_ref='agency-b' AND gone=0"), 3);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_sweep_missing'), 0);
  assert.match(task(env, run).task_reason, /0 adverts not found, 1 sources not read in full/);
  // The panel shows it: the run's coverage and the sweep's last attempt, last correct reading and last full sweep.
  const cookie = await adminCookie();
  const coverage = (await call(env, 'GET', `/admin/market/runs/${run}/coverage`, { cookie })).data;
  assert.equal(coverage.sources.find(s => s.source_ref === 'agency-b').status, 'blocked');
  const sweep = await call(env, 'GET', '/admin/market/daily-sweep', { cookie });
  assert.equal(sweep.status, 200);
  const b = sweep.data.channels.find(c => c.source_ref === 'agency-b');
  assert.equal(b.last_outcome, 'unavailable');
  assert.ok(b.last_correct_at.startsWith(at(0).slice(0, 10)) && b.last_full_sweep_at === b.last_correct_at);
  assert.equal(sweep.data.days[0].jersey_day, at(1).slice(0, 10));
  assert.equal((await call(env, 'GET', '/admin/market/daily-sweep')).status, 401);
});

test('refused access is not retried that day; a rate limit waits as asked; a broken first page is not an empty market', async () => {
  const env = world({ sources: ['agency-a', 'agency-b', 'agency-c'] });
  const listings = { 'agency-a': many('A', 2), 'agency-b': many('B', 2), 'agency-c': many('C', 2) };
  await sweepDay(env, 0, fixtures(listings).readers);
  const errors = { 'agency-a': new SourceReadError('access_denied'), 'agency-b': new SourceReadError('rate_limited', 900) };
  const { readers } = fixtures({ ...listings, 'agency-c': [] }, source => errors[source] ?? null);
  rest(env);
  await marketSweepPass(env, at(1), { readers });
  const run = runOf(env, at(1).slice(0, 10)).id;
  const state = Object.fromEntries(rows(env, 'SELECT source_ref,status,next_due FROM market_source_runs WHERE run_id=?', run)
    .map(r => [r.source_ref, r]));
  assert.equal(state['agency-a'].status, 'blocked');
  assert.equal(state['agency-b'].status, 'pending');
  assert.equal(state['agency-b'].next_due, new Date(Date.parse(at(1)) + 900000).toISOString());
  assert.equal(state['agency-c'].status, 'failed', 'an empty first page of a channel with adverts is a broken read');
  assert.deepEqual(rows(env, 'SELECT source_ref,outcome FROM market_sweep_attempts WHERE run_id=? ORDER BY source_ref', run),
    [{ source_ref: 'agency-a', outcome: 'access_denied' }, { source_ref: 'agency-b', outcome: 'rate_limited' },
     { source_ref: 'agency-c', outcome: 'invalid_response' }]);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_sweep_missing'), 0);
});

test('reading resumes from the saved cursor, never repeats a page, and a channel with no reader is not read', async () => {
  const env = world(), listings = { 'agency-a': many('A', 25) };
  const { reader } = fixtures({ ...listings, 'agency-b': [] });
  const readers = { 'agency-a': reader }; // agency-b: no automatic reader built
  rest(env); await marketSweepPass(env, at(0), { readers });
  // A tick that dies after saving a page: the next one goes on from the page after it.
  rest(env); const second = await marketSweepPass(env, at(0, 10), { readers });
  rest(env); await marketSweepPass(env, at(0, 20), { readers });
  assert.deepEqual(reader.calls.map(([, cursor]) => cursor), [null, '10', '20']);
  assert.equal(second.read.length, 1);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_observations'), 25);
  const run = runOf(env, at(0).slice(0, 10)).id;
  assert.deepEqual(rows(env, "SELECT source_ref,status FROM market_source_runs WHERE run_id=? ORDER BY source_ref", run),
    [{ source_ref: 'agency-a', status: 'complete' }, { source_ref: 'agency-b', status: 'blocked' }, { source_ref: 'agency-pending', status: 'pending' }]);
  assert.equal(one(env, "SELECT outcome FROM market_sweep_attempts WHERE source_ref='agency-b'").outcome, 'no_reader');
  assert.match(task(env, run).task_reason, /1 sources not read in full/);
  // With no reader at all (today's production), nothing is read and the day says so.
  const bare = world();
  rest(bare); await marketSweepPass(bare, at(0));
  assert.equal(n(bare, 'SELECT COUNT(*) AS n FROM market_observations'), 0);
  assert.equal(n(bare, "SELECT COUNT(*) AS n FROM market_sweep_attempts WHERE outcome='no_reader'"), 2);
});

test('a pause or a source review during a read keeps the late page out', async () => {
  const env = world({ sources: ['agency-a'] });
  const { readers, reader } = fixtures({ 'agency-a': many('A', 3) });
  const review = reader.readPage;
  reader.readPage = async input => { const page = await review(input);
    env.DB.raw.exec("UPDATE market_sources SET policy_version=policy_version+1 WHERE source_ref='agency-a'"); return page; };
  rest(env);
  assert.deepEqual((await marketSweepPass(env, at(0), { readers })).read, ['failed']);
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_observations'), 0);
  // The refused page is an attempt, counted like a failed read, with a wait before the next one.
  assert.equal(one(env, 'SELECT outcome FROM market_sweep_attempts').outcome, 'unavailable');
  assert.deepEqual({ ...one(env, "SELECT status,next_due FROM market_source_runs WHERE source_ref='agency-a'") },
    { status: 'failed', next_due: new Date(Date.parse(at(0)) + 1200000).toISOString() });
  reader.readPage = review;
  const run = runOf(env, at(0).slice(0, 10));
  env.DB.raw.prepare("UPDATE market_runs SET status='paused',version=version+1 WHERE id=?").run(run.id);
  env.DB.raw.exec('UPDATE market_source_runs SET lease_token=NULL,lease_until=NULL'); rest(env);
  assert.deepEqual((await marketSweepPass(env, at(0, 10), { readers })).read, []);
  assert.equal(reader.calls.length, 1);
});

test('a channel BUS-06 would refuse is not read again and again, and still counts as not read in full', async () => {
  const env = world({ sources: ['agency-a', 'agency-b', 'agency-d'] });
  env.DB.raw.exec(`UPDATE market_sources SET review_due_at='2001-01-01T00:00:00.000Z',policy_version=policy_version+1
    WHERE source_ref='agency-b'`); // its review expired
  const { readers, reader } = fixtures({ 'agency-a': many('A', 2), 'agency-b': many('B', 2), 'agency-d': many('D', 2) });
  const outs = [];
  for (let i = 0; i < 4 && !outs.at(-1)?.compared; i++) { rest(env); outs.push(await marketSweepPass(env, at(0, i * 10), { readers })); }
  assert.equal(outs.at(-1).compared, true, JSON.stringify(outs.map(o => o.read)));
  assert.ok(!reader.calls.some(([source]) => source === 'agency-b'));
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_sweep_attempts WHERE source_ref='agency-b'"), 0);
  const run = runOf(env, at(0).slice(0, 10)).id;
  assert.match(task(env, run).task_reason, /1 sources not read in full/);
});

test("a claim refused for the channel's pace only waits; a failure waits the channel's interval too", async () => {
  const env = world({ sources: ['agency-a'] });
  env.DB.raw.exec("UPDATE market_sources SET min_interval_s=3600,policy_version=policy_version+1");
  let down = false;
  const { readers } = fixtures({ 'agency-a': many('A', 30) }, () => down ? new SourceReadError('unavailable') : null);
  rest(env);
  assert.deepEqual((await marketSweepPass(env, at(0), { readers })).read, ['page']);
  const due = () => one(env, "SELECT next_due FROM market_source_runs WHERE source_ref='agency-a'").next_due;
  assert.equal(due(), new Date(Date.parse(at(0)) + 3600000).toISOString());
  // Twice due by its row but read less than an hour ago (D1's clock): no attempt, no failure, a wait until it can be.
  for (const m of [10, 20]) {
    env.DB.raw.exec("UPDATE market_source_runs SET next_due='2000-01-01T00:00:00.000Z'");
    assert.deepEqual((await marketSweepPass(env, at(0, m), { readers })).read, ['waiting']);
    assert.ok(Date.parse(due()) > Date.now() + 3500000);
  }
  // Then a real failure: counted once, and the retry waits the hour, not twenty minutes.
  down = true; rest(env);
  assert.deepEqual((await marketSweepPass(env, at(0, 30), { readers })).read, ['failed']);
  assert.deepEqual(rows(env, 'SELECT outcome FROM market_sweep_attempts ORDER BY attempted_at').map(r => r.outcome), ['page', 'unavailable']);
  assert.equal(one(env, "SELECT status FROM market_source_runs WHERE source_ref='agency-a'").status, 'failed');
  assert.equal(due(), new Date(Date.parse(at(0, 30)) + 3600000).toISOString());
});

test('the review task opens the market inventory and can be marked done', async () => {
  const env = world({ sources: ['agency-a'] }), cookie = await adminCookie();
  rest(env); await marketSweepPass(env, at(0)); // no reader: one source not read in full
  const id = task(env, runOf(env, at(0).slice(0, 10)).id).id;
  const listed = (await call(env, 'GET', '/admin/notifications?box=action', { cookie })).data.notifications.find(t => t.id === id);
  assert.deepEqual([listed.target_exists, listed.link], [true, '#/automations']);
  const done = await call(env, 'PUT', `/admin/notification-tasks/${id}`, { cookie,
    body: { operation_id: crypto.randomUUID(), revision: listed.revision, action: 'done' } });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.ok(one(env, 'SELECT resolved_at FROM notifications WHERE id=?', id).resolved_at);
});

test("yesterday's open run is compared and closed when today's was opened by hand", async () => {
  const env = world({ sources: ['agency-a'] }), { readers } = fixtures({ 'agency-a': many('A', 2) });
  rest(env); await marketSweepPass(env, at(0), { readers }); // day 0: read, left open
  await createInventoryRun(env, { kind: 'daily', manifest_revision: 'rev-1', operation_id: crypto.randomUUID() },
    'admin@example.test', () => new Date(at(1)));
  rest(env); await marketSweepPass(env, at(1, 10), { readers });
  assert.equal(runOf(env, at(0).slice(0, 10)).status, 'partial'); // agency-pending was never read
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM market_daily_sweeps WHERE jersey_day=?', at(0).slice(0, 10)), 1);
  assert.equal(runOf(env, at(1).slice(0, 10)).status, 'open');
});

test('a channel with no reader left running with an expired lease is blocked once', async () => {
  const env = world({ sources: ['agency-a'] }), { readers } = fixtures({ 'agency-a': many('A', 12) });
  rest(env); await marketSweepPass(env, at(0), { readers }); // opens the day and reads the first page
  rest(env); // a later tick took the lease and died
  env.DB.raw.exec(`UPDATE market_source_runs SET status='running',lease_token='lost-tick',lease_until='2000-01-01T00:00:00.000Z'
    WHERE source_ref='agency-a'`);
  for (let i = 1; i < 4; i++) { rest(env); await marketSweepPass(env, at(0, i * 10), { readers: {} }); }
  assert.equal(n(env, "SELECT COUNT(*) AS n FROM market_sweep_attempts WHERE outcome='no_reader'"), 1);
  assert.equal(one(env, "SELECT status FROM market_source_runs WHERE source_ref='agency-a'").status, 'blocked');
  assert.equal(one(env, "SELECT lease_token FROM market_source_activity WHERE source_ref='agency-a'").lease_token, null);
});

test('one advert a source sends badly is left out, not the whole page', async () => {
  const env = world({ sources: ['agency-a'] }), { readers, reader } = fixtures({ 'agency-a': many('A', 5) });
  const read = reader.readPage;
  reader.readPage = async input => { const page = await read(input);
    page.records[1].observation.country_code = 'FR'; page.records[2] = { ...page.records[2], raw: 'not an object' };
    page.records[3].raw.notes = 'x'.repeat(131072); return page; }; // one that alone would pass BUS-06's page size
  rest(env); await marketSweepPass(env, at(0), { readers });
  assert.deepEqual(rows(env, 'SELECT external_key FROM market_observations ORDER BY external_key'), [{ external_key: 'A-1' }, { external_key: 'A-5' }]);
  assert.deepEqual({ ...one(env, 'SELECT outcome,records,skipped FROM market_sweep_attempts') }, { outcome: 'complete', records: 2, skipped: 3 });
});

test('an advert with a nested value BUS-06 cannot store is left out, not the whole page', async () => {
  const env = world({ sources: ['agency-a'] }), { readers, reader } = fixtures({ 'agency-a': many('A', 4) });
  const read = reader.readPage;
  reader.readPage = async input => { const page = await read(input);
    page.records[1].raw.meta = { score: NaN }; page.records[2].raw.meta = { seen: new Date() };
    page.records[3].raw.meta = [{ note: undefined }]; return page; };
  rest(env); await marketSweepPass(env, at(0), { readers });
  assert.deepEqual(rows(env, 'SELECT external_key FROM market_observations'), [{ external_key: 'A-1' }]);
  assert.deepEqual({ ...one(env, 'SELECT outcome,records,skipped FROM market_sweep_attempts') }, { outcome: 'complete', records: 1, skipped: 3 });
});

test("a channel told to wait past the end of the Jersey day does not hold back that day's comparison", async () => {
  const env = world(), { readers } = fixtures({ 'agency-a': many('A', 2), 'agency-b': many('B', 25) });
  env.DB.raw.exec("UPDATE market_sources SET min_interval_s=3600,policy_version=policy_version+1 WHERE source_ref='agency-b'");
  rest(env);
  assert.equal((await marketSweepPass(env, at(0), { readers })).compared, false, 'a wait within the day is still waited for');
  env.DB.raw.exec("UPDATE market_source_runs SET next_due=? WHERE source_ref='agency-b'".replace('?', `'${at(1)}'`));
  const out = await marketSweepPass(env, at(0, 10), { readers });
  assert.deepEqual([out.read, out.compared], [[], true]);
  assert.match(task(env, runOf(env, at(0).slice(0, 10)).id).task_reason, /0 adverts not found, 1 sources not read in full/);
});

// Each D1 call counts once: a query, or a batch (one transaction) whatever it holds.
test('a tick stays bounded: at most three channels and a fixed number of D1 calls', async () => {
  const sources = ['s-1', 's-2', 's-3', 's-4', 's-5'];
  const env = world({ sources }), { readers } = fixtures(Object.fromEntries(sources.map(s => [s, many(s, 10)])));
  let calls = 0, inBatch = false;
  const prepare = env.DB.prepare.bind(env.DB), batch = env.DB.batch.bind(env.DB);
  const counted = stmt => ({ ...stmt, bind: (...a) => counted(stmt.bind(...a)),
    ...Object.fromEntries(['all', 'first', 'run'].map(k => [k, () => { if (!inBatch) calls++; return stmt[k](); }])) });
  env.DB.prepare = sql => counted(prepare(sql));
  env.DB.batch = async stmts => { calls++; inBatch = true; try { return await batch(stmts); } finally { inBatch = false; } };
  rest(env);
  const out = await marketSweepPass(env, at(0), { readers });
  assert.equal(out.read.length, CHANNELS_PER_TICK);
  assert.ok(calls <= 30, `${calls} D1 calls`); // 26 measured on 16-nov-2026
});

test('after a day with changes the active searches are recomputed with the website rules, a few per tick', async () => {
  const env = world({ sources: ['agency-a'] }), listings = { 'agency-a': [advert('A-1', 230000)] };
  Object.assign(env, { EST01_SEARCH_STATE_READY: '1' });
  for (const flag of RECOMPUTE_FLAGS) env[flag] = '1';
  const { readers } = fixtures(listings);
  const cookie = await adminCookie();
  const register = async i => (await call(env, 'POST', '/admin/applicants', { cookie, body: { name: 'Jane Le Brocq',
    email: `jane${i}@example.je`, phone: `07797 10000${i}`, source: 'phone', operation: 'rent', budget_max: 2000, bedrooms_min: 2 } })).data.id;
  const ids = [await register(1), await register(2), await register(3)];
  const results = env => ids.map(id => one(env, 'SELECT result FROM market_matches WHERE applicant_id=?', id)?.result ?? null);
  const day = async d => {
    const out = [(await sweepDay(env, d, readers)).at(-1).recompute];
    for (let i = 0; i < 2; i++) out.push((await marketSweepPass(env, at(d, 300 + i * 10), { readers })).recompute);
    return out;
  };
  assert.deepEqual(await day(0), ['partial', 'done', null]);
  const before = results(env);
  assert.ok(before.every(r => r === null || r === 'alternative'), JSON.stringify(before));
  // The rent drops under the budget: the next day's recompute brings the home into every search.
  listings['agency-a'][0].amount = 190000;
  assert.deepEqual(await day(1), ['partial', 'done', null]);
  const after = results(env);
  assert.ok(after.every(r => ['meets', 'pending'].includes(r)), JSON.stringify(after));
  assert.equal(n(env, 'SELECT COUNT(*) AS n FROM availability_confirmations'), 0);
  // Without the website's availability rules in the clock, the recompute waits rather than match differently.
  delete env.EST15_UNAVAILABILITY_READY;
  listings['agency-a'][0].amount = 180000;
  assert.deepEqual(await day(2), ['waiting', 'waiting', 'waiting']);
});

test('switched off, the clock and the website do exactly what they did', async t => {
  t.mock.method(console, 'log', () => {}); t.mock.method(console, 'error', () => {});
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-16T09:00:00.000Z') });
  const record = async flag => {
    const env = world();
    if (flag === undefined) delete env.BUS08_SWEEP_READY; else env.BUS08_SWEEP_READY = flag;
    const seen = [], prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = sql => { seen.push(sql); return prepare(sql); };
    await worker.scheduled({ cron: '*/10 * * * *', scheduledTime: Date.parse('2026-11-16T09:00:00.000Z') }, env, { waitUntil() {} });
    const route = await call(env, 'GET', '/admin/market/daily-sweep', { cookie: await adminCookie() });
    return { seen, runs: n(env, 'SELECT COUNT(*) AS n FROM market_runs'), route: route.status };
  };
  const off = await record('0'), absent = await record(undefined);
  assert.deepEqual(off.seen, absent.seen);
  assert.ok(!off.seen.some(sql => /market_/.test(sql)));
  assert.deepEqual([off.runs, off.route, absent.route], [0, 404, 404]);
  const on = await record('1');
  assert.equal(on.runs, 1);
  assert.equal(on.route, 200);
});

// The switch is the same in both files, "0" today. Before it is "1" in the clock, every flag a recompute reads must
// carry the website's value there too (EST-15: or the clock would propose again a home confirmed not available).
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
test('the switch matches in both wrangler files, and the clock mirrors what a recompute reads before it is on', () => {
  const jobs = vars(read('jobs/wrangler.toml')), pages = vars(read('wrangler.toml'));
  assert.equal(jobs.BUS08_SWEEP_READY, '1');
  assert.equal(pages.BUS08_SWEEP_READY, jobs.BUS08_SWEEP_READY);
  const needed = flagsRead('server/search-state.js');
  for (const flag of RECOMPUTE_FLAGS) assert.ok(needed.has(flag), flag);
  if (jobs.BUS08_SWEEP_READY === '1') for (const flag of needed) if (flag in pages) assert.equal(jobs[flag], pages[flag], flag);
});

test('D1 local: two days of the sweep, the comparison and the review task run in the real runtime', async () => {
  const require = createRequire(import.meta.url);
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare'), { unstable_splitSqlQuery } = require('wrangler');
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: '2025-10-01', host: '127.0.0.1', port: 0, d1Databases: { DB: 'bus08-sweep-fixture' } }));
  try {
    const DB = await mf.getD1Database('DB'), dir = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter(f => f.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), 'utf8')).map(sql => DB.prepare(sql)));
    await DB.batch([DB.prepare("INSERT INTO market_directory_manifests VALUES ('rev-1',?,'2000-01-01T00:00:00.000Z','fixture','accepted')")
      .bind('a'.repeat(64)), DB.prepare(`INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class,
      access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at,allowed_hosts,allowed_paths)
      VALUES ('agency-a','site','rev-1','external','general','allowed','http',1,'e','r','2000-01-01T00:00:00.000Z',
      '2999-01-01T00:00:00.000Z','["agency-a.example.test"]','["/properties"]')`)]);
    const env = { DB, BUS08_SWEEP_READY: '1' }, listings = { 'agency-a': many('A', 12) }, { readers } = fixtures(listings);
    const free = () => DB.batch([DB.prepare('UPDATE market_source_activity SET last_acquired_at=NULL'),
      DB.prepare('UPDATE market_source_runs SET next_due=NULL')]);
    for (const day of [0, 1]) {
      if (day === 1) { listings['agency-a'].splice(0, 1); listings['agency-a'][0].amount = 120000; }
      for (let i = 0; i < 4; i++) { await free(); if ((await marketSweepPass(env, at(day, i * 10), { readers })).compared) break; }
    }
    const count = async sql => (await DB.prepare(sql).first()).n;
    assert.equal(await count('SELECT COUNT(*) AS n FROM market_sweep_missing'), 1);
    assert.equal(await count('SELECT COUNT(*) AS n FROM market_change_outbox'), 13);
    assert.equal(await count("SELECT COUNT(*) AS n FROM notifications WHERE task_key LIKE 'bus08:sweep:%'"), 1);
    assert.equal(await count('SELECT COUNT(*) AS n FROM market_daily_sweeps'), 2);
  } finally { await mf.dispose(); }
});
