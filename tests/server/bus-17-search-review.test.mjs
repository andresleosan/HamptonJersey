// BUS-17: an active search 21 Jersey days without a complete option gets one internal Inbox review with up to 20
// explained alternatives, again 7 days after each closed review; a complete option ends it; a rejected home whose price
// drops 5% gets a task. Nothing is sent and no criteria or match decision changes. Synthetic people and homes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makeEnv, seedListing, call, adminCookie, T0 } from './listing-client.mjs';
import worker from '../../server/jobs.js';
import { recomputeForApplicant } from '../../server/search-state.js';
import { ALTERNATIVES_LIMIT, buildAlternatives, materialDrop, plan, searchAvailability, searchReviewPass } from '../../server/search-review.js';

const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const one = (env, sql, ...a) => env.DB.raw.prepare(sql).get(...a);
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const later = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();
const DAY = 86400000, TICK = 600000;
// T0 is 11:00 in Jersey (BST) on 7 October; 21 calendar days later is 11:00 GMT on 28 October, across the clock change.
const DUE = '2026-10-28T11:00:00.000Z';
const FLAGS = { EST01_SEARCH_STATE_READY: '1', EST16_AVAILABILITY_READY: '1' };
const PRIORITIES = JSON.stringify({ version: 1, values: { budget: 'must', bedrooms: 'must' }, unknown: [] });

function world({ on = true, recorded = true } = {}) {
  const env = makeEnv();
  Object.assign(env, FLAGS, on && { BUS17_REVIEW_READY: '1' });
  const home = (id, rent, title) => seedListing(env, { id, title, operation: 'rent', availability: 'to_let', rent, rent_period: 'month',
    sale_price: null, bedrooms: 2, bathrooms: 1, housing_category: 'registered', matchable: 1, parish: 'St Helier', location: 'St Helier' });
  home('HE-R001', 2500, 'Over budget flat');
  home('HE-R002', 1800, 'Fitting flat');
  // The clock was switched on before this search was registered: its absence is evidenced from registration.
  run(env, "INSERT INTO search_review_progress(id,enabled_at) VALUES (1,'2026-10-01T00:00:00.000Z')");
  const c = run(env, `INSERT INTO contacts (name,email,phone,last_activity_at,created_at,updated_at)
    VALUES ('Ana Le Gros','bus17@example.test','+447700900317',?,?,?)`, T0, T0, T0);
  env.applicant = Number(run(env, `INSERT INTO applicants (contact_id,operation,stage,source,budget_max,bedrooms_min,pets,household_adults,
    household_children,household_total,created_at,updated_at,requirement_priorities) VALUES (?,'rent','searching','phone',2000,2,
    '[{"kind":"none"}]',2,0,2,?,?,?)`, Number(c.lastInsertRowid), T0, T0, PRIORITIES).lastInsertRowid);
  env.recorded = recorded;
  return env;
}
const search = async env => recomputeForApplicant(env.recorded ? env : { ...env, EST01_SEARCH_STATE_READY: '0' }, env.applicant, 'system');
const reviews = env => rows(env, 'SELECT id,episode,cycle,due_at,closed_at,outcome,alternatives FROM search_reviews ORDER BY id');
const tasks = env => rows(env, `SELECT n.id,n.title,n.task_reason,n.resolved_at,n.closed_by_source,n.task_key FROM notifications n
  WHERE n.task_key LIKE 'bus17:%' ORDER BY n.id`);
const cycle = env => { const c = one(env, 'SELECT state,episode,no_full_since,source,last_closed_at FROM search_review_cycles WHERE applicant_id=?',
  env.applicant); return c && { ...c }; };
const matchState = env => rows(env, 'SELECT listing_id,status,reject_reason FROM matches ORDER BY listing_id');
const criteria = env => one(env, 'SELECT budget_max,bedrooms_min,requirement_priorities,search_state,stage FROM applicants WHERE id=?', env.applicant);
const done = async (env, id) => {
  const { revision } = one(env, 'SELECT revision FROM notifications WHERE id=?', id);
  return ok(await req(env, 'PUT', `/admin/notification-tasks/${id}`, { operation_id: crypto.randomUUID(), revision, action: 'done' }));
};
const confirm = (env, listing, status = 'available', at = '2026-10-29T09:00:00.000Z') => req(env, 'POST', `/admin/listings/${listing}/availability`,
  { status, confirmed_at: at, source: 'owner', channel: 'phone', evidence_ref: 'Call log FIXTURE', scope: 'property' });

test('alternatives: closest first, at most 20, unknown to confirm and never a criterion to relax', () => {
  const check = (key, result, extra = {}) => ({ key, result, evidence: `${key} evidence`, ...extra });
  const own = [
    { listing_id: 'HE-R003', title: 'Two unmet', score: 90, available_ref: null,
      checks: JSON.stringify([check('budget', 'fails', { priority: 'must' }), check('area', 'fails', { priority: 'must' })]) },
    { listing_id: 'HE-R001', title: 'Pets to confirm', score: 10, available_ref: 7,
      checks: JSON.stringify([check('budget', 'meets', { priority: 'must' }), check('pets', 'unknown', { priority: 'must' })]) },
    { listing_id: 'HE-R002', title: 'Parking preferred', score: 50, available_ref: 8,
      checks: JSON.stringify([check('parking', 'fails', { priority: 'preferred' })]) },
  ];
  const market = [{ home_key: JSON.stringify(['agency-a', 'site', 'A-1', 'rent']), score: 99,
    checks: JSON.stringify([check('budget', 'fails', { priority: 'must' })]) }];
  const items = buildAlternatives(own, market);
  assert.deepEqual(items.map(i => i.id), ['HE-R001', 'HE-R002', market[0].home_key, 'HE-R003']);
  assert.deepEqual(items[0].verify, [{ label: 'Pets', detail: 'pets evidence' }]);
  assert.deepEqual(items[0].unmet, []);
  assert.deepEqual(items[1].unmet, [{ label: 'Parking', must: false, detail: 'parking evidence' }]);
  assert.equal(items[2].title, 'agency-a · A-1');
  assert.deepEqual(items[2].verify, [{ label: 'Availability', detail: 'Not confirmed by a person' }]);
  assert.deepEqual(items[3].unmet.map(u => u.detail), ['budget evidence', 'area evidence']); // each gap in its own unit
  const many = Array.from({ length: 30 }, (_, i) => ({ listing_id: `HE-R${100 + i}`, checks: '[]', score: 0, available_ref: null }));
  assert.equal(buildAlternatives(many, []).length, ALTERNATIVES_LIMIT);
  assert.deepEqual(buildAlternatives([], []), []); // fewer than 20 is honest: none invented
});

test('a material drop is 5% in the same terms: a sale price, or rents over a year', () => {
  assert.equal(materialDrop([1900, 'GBP', 'month'], [2000, 'GBP', 'month']), true);
  assert.equal(materialDrop([1950, 'GBP', 'month'], [2000, 'GBP', 'month']), false);
  assert.equal(materialDrop([22800, 'GBP', 'year'], [2000, 'GBP', 'month']), true); // £1,900 a month
  assert.equal(materialDrop([1900, 'EUR', 'month'], [2000, 'GBP', 'month']), false);
  assert.equal(materialDrop([1900, 'GBP', 'week'], [2000, 'GBP', 'week']), false);
  assert.equal(materialDrop([570000, 'GBP', null], [600000, 'GBP', null]), true);
  assert.equal(materialDrop([1900, 'GBP', 'month'], [600000, 'GBP', null]), false);
  assert.equal(materialDrop(null, [2000, 'GBP', 'month']), false);
});

test('the canonical predicate over stored matches: full, absent only with a recorded full search, else unknown', () => {
  const s = { id: 7, match_inputs_revision: 3, recorded: 7, last_attempt_at: T0, last_success_at: later(T0, 1000), last_failure_at: null };
  const m = (o = {}) => ({ listing_id: 'HE-R002', version: 1, requirements_rank: 0, status: 'found', available_ref: 4, client_choice: null, ...o });
  assert.equal(searchAvailability(s, [m()], '1', DUE), 'full');
  assert.equal(searchAvailability(s, [m({ status: 'shortlisted', client_choice: 'interested' })], '1', DUE), 'full');
  for (const change of [{ status: 'rejected' }, { client_choice: 'not_for_me' }, { available_ref: null }, { requirements_rank: 1 }])
    assert.equal(searchAvailability(s, [m(change)], '1', DUE), 'absent', JSON.stringify(change));
  assert.equal(searchAvailability(s, [], '1', DUE), 'absent');
  assert.equal(searchAvailability(s, [m(), m({ requirements_rank: 2 })], '1', DUE), 'unknown'); // the same home twice: untrusted
  for (const run of [{ recorded: null }, { last_success_at: null }, { last_failure_at: later(T0, 2000) }])
    assert.equal(searchAvailability({ ...s, ...run }, [m({ available_ref: null })], '1', DUE), 'unknown', JSON.stringify(run));
});

test('the plan: evidenced start, one review per due date, 7 days after the close, a new episode after a full option', () => {
  const base = { id: 1, live: 1, created_at: T0, state: null, episode: null, reviews: 0 };
  const enabled = '2026-10-01T00:00:00.000Z';
  assert.deepEqual(plan(base, undefined, 'absent', later(DUE, -1), enabled).cycle,
    { state: 'absent', episode: 1, no_full_since: T0, source: 'activation', last_closed_at: null });
  assert.equal(plan(base, undefined, 'absent', later(DUE, -1), enabled).open, null);
  assert.deepEqual(plan(base, undefined, 'absent', DUE, enabled).open, { cycle: 1, due_at: DUE });
  // Registered before the clock: no history is assumed, the absence starts now.
  const legacy = plan(base, undefined, 'absent', DUE, '2026-10-20T00:00:00.000Z');
  assert.deepEqual([legacy.cycle.source, legacy.cycle.no_full_since, legacy.open], ['legacy_baseline', DUE, null]);
  // Unknown neither starts nor advances; a stopped search the clock never saw is left alone.
  assert.equal(plan(base, undefined, 'unknown', DUE, enabled), null);
  assert.equal(plan({ ...base, live: 0 }, undefined, 'absent', DUE, enabled), null);
  const absent = { ...base, state: 'absent', episode: 1, no_full_since: T0, source: 'activation', last_closed_at: null, reviews: 1 };
  assert.equal(plan(absent, { id: 9 }, 'absent', later(DUE, DAY), enabled), null); // open: updated nowhere, never doubled
  const closedAt = '2026-10-30T15:00:00.000Z', closing = plan(absent, { id: 9, resolved_at: closedAt, resolved_by: 'a@example.test' },
    'absent', later(closedAt, TICK), enabled);
  assert.deepEqual([closing.close.outcome, closing.cycle.last_closed_at, closing.open], ['reviewed', closedAt, null]);
  const after = { ...absent, last_closed_at: closedAt };
  assert.equal(plan(after, undefined, 'absent', later(closedAt, 7 * DAY - 1), enabled), null);
  assert.deepEqual(plan(after, undefined, 'absent', later(closedAt, 7 * DAY), enabled).open, { cycle: 2, due_at: later(closedAt, 7 * DAY) });
  const full = plan(after, { id: 10 }, 'full', DUE, enabled);
  assert.deepEqual([full.cycle.state, full.close.outcome, full.close.source], ['held', 'full_option_found', true]);
  // The last full option goes: a new episode from now, its earlier reviews not counted.
  const lost = plan({ ...after, state: 'held', no_full_since: null, source: null, last_closed_at: null }, undefined, 'absent', DUE, enabled);
  assert.deepEqual(lost.cycle, { state: 'absent', episode: 2, no_full_since: DUE, source: 'last_full_lost', last_closed_at: null });
  assert.equal(plan({ ...after, live: 0 }, { id: 11 }, 'unknown', DUE, enabled).close.outcome, 'search_inactive');
});

test('day 21: one explained review and one Inbox task, closed by Done; 7 days on the next; a confirmed home ends it', async () => {
  const env = world();
  await search(env);
  const before = { matches: matchState(env), criteria: criteria(env) };
  assert.deepEqual((await searchReviewPass(env, later(DUE, -TICK))).opened, 0);
  assert.deepEqual(cycle(env), { state: 'absent', episode: 1, no_full_since: T0, source: 'activation', last_closed_at: null });
  const opened = await searchReviewPass(env, DUE);
  assert.equal(opened.opened, 1);
  const [review] = reviews(env);
  assert.deepEqual([review.cycle, review.due_at], [1, DUE]);
  const items = JSON.parse(review.alternatives);
  assert.deepEqual(items.map(i => i.id), ['HE-R002', 'HE-R001']);
  assert.deepEqual(items[0].verify, [{ label: 'Availability', detail: 'Not confirmed by a person' }]);
  assert.deepEqual(items[1].unmet, [{ label: 'Budget', must: true, detail: '£2,500 a month, over £2,000' }]);
  let [task] = tasks(env);
  assert.equal(task.title, '21-day search review for Ana Le Gros');
  assert.match(task.task_reason, /^No home has met every must-have with availability confirmed by a person for 21 days\. 2 alternatives/);
  assert.match(task.task_reason, /Nothing was sent and the criteria did not change\.$/);
  // The next ticks neither duplicate it nor reopen anything.
  await searchReviewPass(env, later(DUE, TICK));
  await searchReviewPass(env, later(DUE, DAY));
  assert.equal(reviews(env).length, 1);
  assert.equal(tasks(env).length, 1);
  // The Inbox shows it as a task with a link to Matches, and it can be closed.
  const inbox = ok(await req(env, 'GET', '/admin/notifications?box=action')).notifications.find(n => n.id === task.id);
  assert.deepEqual([inbox.link, inbox.target_exists], [`#/applicants/${env.applicant}/matches`, true]);
  const detail = ok(await req(env, 'GET', `/admin/applicants/${env.applicant}`));
  assert.deepEqual(detail.search_review.alternatives.map(i => i.id), ['HE-R002', 'HE-R001']);
  await done(env, task.id);
  const closedAt = one(env, 'SELECT resolved_at FROM notifications WHERE id=?', task.id).resolved_at;
  await searchReviewPass(env, later(DUE, 2 * DAY));
  assert.deepEqual([reviews(env)[0].outcome, reviews(env)[0].closed_at, cycle(env).last_closed_at], ['reviewed', closedAt, closedAt]);
  assert.equal(ok(await req(env, 'GET', `/admin/applicants/${env.applicant}`)).search_review, null);
  // 7 days after the close: the next review, once.
  const next = new Date(Math.ceil((Date.parse(closedAt) + 7 * DAY) / TICK) * TICK).toISOString();
  await searchReviewPass(env, later(next, -TICK));
  assert.equal(reviews(env).length, 1);
  await searchReviewPass(env, next);
  await searchReviewPass(env, later(next, TICK));
  assert.deepEqual(reviews(env).map(r => [r.episode, r.cycle, r.closed_at === null]), [[1, 1, false], [1, 2, true]]);
  task = tasks(env).at(-1);
  assert.equal(task.title, 'Search review (7 days on) for Ana Le Gros');
  // A person confirms the fitting home is available: the open review closes by its source and the absence ends.
  ok(await confirm(env, 'HE-R002'), 201);
  await searchReviewPass(env, later(next, DAY));
  assert.equal(reviews(env).at(-1).outcome, 'full_option_found');
  assert.deepEqual([tasks(env).at(-1).closed_by_source, tasks(env).at(-1).resolved_at !== null], [1, true]);
  assert.equal(cycle(env).state, 'held');
  await searchReviewPass(env, later(next, 30 * DAY));
  assert.equal(reviews(env).length, 2);
  // Nothing about the search, its matches or the client changed, and nothing was sent.
  assert.deepEqual({ matches: matchState(env), criteria: criteria(env) }, before);
  assert.equal(one(env, 'SELECT COUNT(*) AS n FROM outbound').n, 0);
});

test('without a recorded full search, absence is never certified and nothing opens', async () => {
  const env = world({ recorded: false });
  await search(env);
  await searchReviewPass(env, later(DUE, 30 * DAY));
  assert.equal(cycle(env), undefined);
  assert.deepEqual(reviews(env), []);
});

test('a rejected home with confirmed availability does not hold the clock', async () => {
  const env = world();
  await search(env);
  ok(await confirm(env, 'HE-R002', 'available', '2026-10-08T09:00:00.000Z'), 201);
  await searchReviewPass(env, later(DUE, -DAY));
  assert.equal(cycle(env).state, 'held');
  const match = one(env, "SELECT id FROM matches WHERE listing_id='HE-R002'").id;
  ok(await req(env, 'PUT', `/admin/matches/${match}`, { status: 'rejected', from: 'found', reject_reason: 'condition' }));
  await search(env);
  const at = later(DUE, DAY);
  await searchReviewPass(env, at);
  assert.deepEqual([cycle(env).state, cycle(env).episode, cycle(env).source, cycle(env).no_full_since], ['absent', 2, 'last_full_lost', at]);
  assert.deepEqual(reviews(env), []); // 21 days from now, not from registration
});

test('two ticks at once open one review', async () => {
  const env = world();
  await search(env);
  await searchReviewPass(env, later(DUE, -TICK));
  const outs = await Promise.all([searchReviewPass(env, DUE), searchReviewPass(env, DUE)]);
  assert.equal(outs.reduce((n, o) => n + o.opened, 0), 1);
  assert.equal(reviews(env).length, 1);
  assert.equal(tasks(env).length, 1);
});

test('a search that stops closes its open review by its source', async () => {
  const env = world();
  await search(env);
  await searchReviewPass(env, later(DUE, -TICK));
  await searchReviewPass(env, DUE);
  run(env, `UPDATE applicants SET search_state='resolved',resolved_at=?,resolved_by='admin@example.test',
    resolution_reason='Found a home' WHERE id=?`, later(DUE, 1), env.applicant);
  await searchReviewPass(env, later(DUE, TICK));
  assert.equal(reviews(env)[0].outcome, 'search_inactive');
  assert.equal(tasks(env)[0].closed_by_source, 1);
  assert.equal(cycle(env).state, 'inactive');
});

test('a rejected home 5% cheaper gets one task; it stays rejected', async () => {
  const env = world();
  await search(env);
  const match = one(env, "SELECT id FROM matches WHERE listing_id='HE-R001'").id;
  ok(await req(env, 'PUT', `/admin/matches/${match}`, { status: 'rejected', from: 'found', reject_reason: 'price' }));
  await searchReviewPass(env, later(T0, DAY));
  assert.deepEqual(JSON.parse(one(env, 'SELECT price FROM search_rejected_prices WHERE match_id=?', match).price), [2500, 'GBP', 'month']);
  run(env, "UPDATE listings SET rent=2400 WHERE id='HE-R001'"); // 4%: not material
  await searchReviewPass(env, later(T0, 2 * DAY));
  assert.deepEqual(tasks(env), []);
  run(env, "UPDATE listings SET rent=2350 WHERE id='HE-R001'"); // 6% below the price first seen
  await searchReviewPass(env, later(T0, 3 * DAY));
  await searchReviewPass(env, later(T0, 4 * DAY));
  const [task] = tasks(env);
  assert.equal(task.title, 'Price dropped on a rejected home for Ana Le Gros');
  assert.equal(task.task_reason, 'Over budget flat (HE-R001) was rejected at £2,500 a month; it is now £2,350 a month. ' +
    'If it is worth another look, move it back to Found in Matches. Nothing was changed or sent.');
  assert.equal(tasks(env).length, 1);
  assert.equal(one(env, 'SELECT status FROM matches WHERE id=?', match).status, 'rejected');
  const inbox = ok(await req(env, 'GET', '/admin/notifications?box=action')).notifications.find(n => n.id === task.id);
  assert.equal(inbox.link, `#/applicants/${env.applicant}/matches`);
  await done(env, task.id);
  run(env, "UPDATE listings SET rent=2500 WHERE id='HE-R001'"); // back up, then down to the noticed price: nothing new
  await searchReviewPass(env, later(T0, 5 * DAY));
  run(env, "UPDATE listings SET rent=2350 WHERE id='HE-R001'");
  await searchReviewPass(env, later(T0, 6 * DAY));
  assert.equal(tasks(env).length, 1);
});

test('switched on without the website flags it waits and touches nothing', async () => {
  const env = world();
  await search(env);
  delete env.EST16_AVAILABILITY_READY;
  assert.deepEqual(await searchReviewPass(env, DUE), { waiting: true });
  assert.equal(one(env, 'SELECT COUNT(*) AS n FROM search_review_cycles').n, 0);
});

test('switched off, the clock, the Inbox and the website do exactly what they did', async () => {
  const record = async value => {
    const env = world({ on: false });
    await search(env);
    if (value !== undefined) env.BUS17_REVIEW_READY = value;
    const seen = [], prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = sql => { seen.push(sql); return prepare(sql); };
    await worker.scheduled({ cron: '*/10 * * * *', scheduledTime: Date.parse(DUE) }, env, { waitUntil() {} });
    const detail = ok(await req(env, 'GET', `/admin/applicants/${env.applicant}`));
    assert.equal(await searchReviewPass(env, DUE), null);
    return { seen, detail: 'search_review' in detail };
  };
  const off = await record('0'), absent = await record(undefined);
  assert.deepEqual(off.seen, absent.seen);
  assert.ok(!off.seen.some(sql => /search_review|search_rejected/.test(sql)));
  assert.deepEqual([off.detail, absent.detail], [false, false]);
});

const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
const vars = text => Object.fromEntries([...text.split(/^\[(?!vars\])/m)[0].matchAll(/^(\w+) = "(.*)"$/gm)].map(m => [m[1], m[2]]));
test('the switch is off and equal in both wrangler files; switched on, the clock carries the flags it reads', () => {
  const jobs = vars(read('jobs/wrangler.toml')), pages = vars(read('wrangler.toml'));
  assert.equal(jobs.BUS17_REVIEW_READY, '0');
  assert.equal(pages.BUS17_REVIEW_READY, jobs.BUS17_REVIEW_READY);
  if (jobs.BUS17_REVIEW_READY === '1') for (const flag of Object.keys(FLAGS)) assert.equal(jobs[flag], pages[flag], flag);
});

test('D1 local: the day-21 review and its task open once in the real runtime', async () => {
  const require = createRequire(import.meta.url);
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare'), { unstable_splitSqlQuery } = require('wrangler');
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: '2025-10-01', host: '127.0.0.1', port: 0, d1Databases: { DB: 'bus17-review-fixture' } }));
  try {
    const DB = await mf.getD1Database('DB'), dir = new URL('../../migrations/', import.meta.url);
    for (const name of readdirSync(dir).filter(f => f.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name, dir), 'utf8')).map(sql => DB.prepare(sql)));
    const local = world();
    await search(local);
    for (const table of ['contacts', 'listings', 'listing_match_inputs', 'applicants', 'matches', 'applicant_search_runs', 'search_review_progress']) {
      const all = rows(local, `SELECT * FROM ${table}`);
      if (!all.length) continue;
      const cols = Object.keys(all[0]);
      await DB.batch(all.map(r => DB.prepare(`INSERT OR REPLACE INTO ${table}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
        .bind(...cols.map(c => r[c]))));
    }
    const env = { DB, BUS17_REVIEW_READY: '1', ...FLAGS };
    await searchReviewPass(env, later(DUE, -TICK));
    await Promise.all([searchReviewPass(env, DUE), searchReviewPass(env, DUE)]);
    await searchReviewPass(env, later(DUE, TICK));
    const count = async sql => (await DB.prepare(sql).first()).n;
    assert.equal(await count('SELECT COUNT(*) AS n FROM search_reviews WHERE closed_at IS NULL AND cycle=1'), 1);
    assert.equal(await count("SELECT COUNT(*) AS n FROM notifications WHERE task_key LIKE 'bus17:review:%' AND resolved_at IS NULL"), 1);
    assert.equal(await count("SELECT COUNT(*) AS n FROM matches WHERE status='found'"), 2);
  } finally { await mf.dispose(); }
});
