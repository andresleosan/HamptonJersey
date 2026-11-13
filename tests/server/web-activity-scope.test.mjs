import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedListing, call, adminCookie } from './helpers.mjs';
import { handleApi } from '../../server/api.js';
import { describeWebMetric, getWebVolumes } from '../../server/measurement.js';

const get = async (env, query = '') => call(env, 'GET', `/admin/insights/activity${query}`,
  { cookie: await adminCookie('admin@example.test') });
const insert = (env, day, metric, n) => env.DB.raw.prepare('INSERT INTO daily_stats VALUES (?, ?, ?, ?)')
  .run(day, 'HE-R001', metric, n);
const source = (data, key) => data.sources.find(x => x.key === key);

test('activity aggregates listing and gallery actions separately over inclusive Jersey days', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-23T23:30:00Z') });
  const env = makeEnv(); seedListing(env);
  insert(env, '2026-10-17', 'view', 100);
  insert(env, '2026-10-18', 'view', 3);
  insert(env, '2026-10-23', 'view', 4);
  insert(env, '2026-10-24', 'view', 2);
  insert(env, '2026-10-18', 'photos', 0);
  insert(env, '2026-10-24', 'photos', 5);
  insert(env, '2026-10-24', 'tour', 9);
  insert(env, '2026-10-25', 'photos', 80);
  const r = await get(env, '?days=7');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(r.data.period, { days: 7, from: '2026-10-18', to: '2026-10-24' });
  assert.equal(source(r.data, 'listing_open').count, 9);
  assert.equal(source(r.data, 'gallery_open').count, 5);
  assert.equal(source(r.data, 'listing_open').unit, 'recorded_actions');
  assert.equal(source(r.data, 'gallery_open').unit, 'recorded_actions');
  assert.equal(source(r.data, 'listing_open').first_observed_day, '2026-10-18');
  assert.equal(source(r.data, 'gallery_open').first_observed_day, '2026-10-24');
  assert.equal(source(r.data, 'listing_open').coverage, 'unknown');
  assert.equal(r.data.coverage.measured_from, null);
  assert.ok(!JSON.stringify(r.data).includes('HE-R001'));
  assert.equal(JSON.stringify(r.data).includes(env.SESSION_SECRET), false);
  assert.ok(!r.data.sources.some(s => /tour/i.test(s.key)));
  assert.deepEqual((await get(env, '?days=30')).data.period, { days: 30, from: '2026-09-25', to: '2026-10-24' });
  assert.deepEqual((await get(env, '?days=90')).data.period, { days: 90, from: '2026-07-27', to: '2026-10-24' });
});

test('module validates real ranges of at most 90 inclusive days and describes separate units', async () => {
  const env = makeEnv();
  for (const range of [
    {from: '2026-01-01', to: '2026-04-01'}, // 91 days
    {from: '2026-02-30', to: '2026-03-01'},
    {from: '2026-03-02', to: '2026-03-01'},
  ]) await assert.rejects(() => getWebVolumes(env, range), e => e.status === 400);
  assert.equal((await getWebVolumes(env, {from: '2026-01-01', to: '2026-03-31'})).period.days, 90);
  assert.equal(describeWebMetric('view').unit, 'recorded_actions');
  assert.deepEqual(describeWebMetric('listing_open'), describeWebMetric('view'));
  assert.notEqual(describeWebMetric('view').definition, describeWebMetric('photos').definition);
  assert.equal(describeWebMetric('tour'), null);
  assert.equal(describeWebMetric('toString'), null);
});

test('empty stored counts have unknown coverage and unintegrated source remains null', async () => {
  const r = await get(makeEnv());
  assert.equal(r.status, 200);
  for (const key of ['listing_open', 'gallery_open']) {
    assert.equal(source(r.data, key).count, 0);
    assert.equal(source(r.data, key).first_observed_day, null);
    assert.equal(source(r.data, key).coverage, 'unknown');
  }
  assert.equal(source(r.data, 'filter_actions').count, null);
  assert.equal(source(r.data, 'filter_actions').coverage, 'not_configured');
  assert.equal(r.data.coverage.measured_from, null);
});

test('activity requires staff and rejects unsupported periods', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'GET', '/admin/insights/activity')).status, 401);
  for (const query of ['?days=91', '?days=0', '?days=30.0', '?days=']) assert.equal((await get(env, query)).status, 400);
  assert.equal((await get(env, '?days=90')).status, 200);
});

test('failed activity query returns an error rather than zero', async () => {
  const env = makeEnv();
  env.DB.raw.exec('DROP TABLE daily_stats');
  const old = console.error; console.error = () => {};
  try {
    const r = await get(env);
    assert.equal(r.status, 500);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(r.data.error);
    assert.equal(r.data.sources, undefined);
  } finally { console.error = old; }
});

test('stats rejects extra subject, URL, referrer and other keys', async () => {
  const env = makeEnv(); seedListing(env);
  for (const extra of [{ subject: 'anonymous' }, { url: 'https://example.test/' }, { referrer: 'example' }, { session: 'x' }, { extra: true }]) {
    const r = await call(env, 'POST', '/stats', { body: { listing_id: 'HE-R001', metric: 'view', ...extra } });
    assert.equal(r.status, 400);
  }
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM daily_stats').get().n, 0);
});

test('stats limits streamed body to 1024 bytes without trusting Content-Length', async () => {
  const env = makeEnv(); seedListing(env);
  const payload = JSON.stringify({ listing_id: 'HE-R001', metric: 'view' });
  const send = async (body, headers = {}) => handleApi(new Request('https://hampton.test/api/stats', {
    method: 'POST', headers: { origin: 'https://hampton.test', 'content-type': 'application/json', ...headers }, body,
  }), env, ['stats']);
  assert.equal((await send(payload.padEnd(1024))).status, 204);
  assert.equal((await send(payload.padEnd(1025), { 'content-length': '1' })).status, 413);
  assert.equal(env.DB.raw.prepare('SELECT SUM(n) AS n FROM daily_stats').get().n, 1);
});

test('Insights reuses its existing totals scan to return the same activity as the separate endpoint', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-25T12:00:00Z')});
  const env=makeEnv(); seedListing(env);
  insert(env,'2026-10-01','view',5);
  insert(env,'2026-10-02','photos',3);
  const cookie=await adminCookie();
  const report=await call(env,'GET','/admin/insights?days=30',{cookie});
  const activity=await call(env,'GET','/admin/insights/activity?days=30',{cookie});
  assert.equal(report.status,200);
  assert.equal(activity.status,200);
  assert.deepEqual(report.data.activity,activity.data);
  assert.equal(report.data.totals.views,5);
});
