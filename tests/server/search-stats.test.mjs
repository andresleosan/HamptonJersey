import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie } from './helpers.mjs';
import { runRetention } from '../../server/retention.js';

const valid = {event:'search_applied',version:1,op:'rent',region:'jersey',beds:'2',max:'rent_gbp_month_2500',zero_results:true};

const ON = {ANA04_SEARCH_STATS_READY:'1'};
const metricRows = env => env.DB.raw.prepare(`SELECT (SELECT count(*) FROM search_metric_days)
  + (SELECT count(*) FROM search_metric_budget) AS n`).get().n;

test('switched off, search measurement stays unavailable and never touches its tables', async () => {
  const env = makeEnv();
  const r = await call(env, 'POST', '/search-stats', {body:valid});
  assert.equal(r.status, 503);
  assert.equal(metricRows(env), 0);
  // Without migration 0108 either.
  assert.equal((await call(makeEnv({skip:[108]}), 'POST', '/search-stats', {body:valid})).status, 503);
});

test('ANA-04 switch: /api/config is as before when off and adds only searchStats when on', async () => {
  const off = await call(makeEnv(), 'GET', '/config');
  assert.deepEqual(Object.keys(off.data).sort(), ['chat','turnstileSiteKey']);
  const on = await call({...makeEnv(), ...ON}, 'GET', '/config');
  assert.equal(on.data.searchStats, true);
  assert.deepEqual({...on.data, searchStats:undefined}, {...off.data, searchStats:undefined});
});

test('switched on, an accepted search action counts its marginals only and answers 204', async () => {
  const env = {...makeEnv(), ...ON};
  const r = await call(env, 'POST', '/search-stats', {body:valid});
  assert.equal(r.status, 204);
  const rows = env.DB.raw.prepare('SELECT version,dimension,value,n FROM search_metric_days ORDER BY dimension').all();
  assert.deepEqual(rows.map(x=>[x.dimension,x.value,x.n]), [['beds','2',1],['max','rent_gbp_month_2500',1],['op','rent',1],
    ['region','jersey',1],['total','all',1],['zero_results','true',1]]);
  assert.equal(env.DB.raw.prepare('SELECT n FROM search_metric_budget').get().n, 1);
  assert.equal((await call(env, 'POST', '/search-stats', {body:{...valid, url:'x'}})).status, 400);
  assert.equal((await call(env, 'POST', '/search-stats', {body:valid, origin:'https://elsewhere.test'})).status, 403);
  assert.equal(env.DB.raw.prepare("SELECT n FROM search_metric_days WHERE dimension='total'").get().n, 1);
  // A failed write is not reported to the visitor, and nothing of the request is logged.
  const broken = {...makeEnv({skip:[108]}), ...ON}, logged = [], original = console.error;
  console.error = (...a) => logged.push(a.map(String).join(' '));
  try { assert.equal((await call(broken, 'POST', '/search-stats', {body:valid})).status, 204); }
  finally { console.error = original; }
  assert.ok(!logged.join(' ').includes('rent_gbp_month_2500'));
});

test('switched on, trends read the recorded counters', async () => {
  const env = {...makeEnv(), ...ON}, cookie = await adminCookie();
  await call(env, 'POST', '/search-stats', {body:valid});
  const r = await call(env, 'GET', '/admin/insights/search-trends?days=7', {cookie});
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.data.available, true);
  assert.equal(r.data.coverage, 'unknown');
  assert.equal(r.data.series.length, 7);
  assert.equal(r.data.series.at(-1).actions, 1);
  assert.ok(r.data.totals.some(x => x.dimension === 'op' && x.label === 'Rent' && x.n === 1));
  assert.equal((await call(env, 'GET', '/admin/insights/search-trends?days=8', {cookie})).status, 400);
  assert.equal((await call(env, 'GET', '/admin/insights/search-trends')).status, 401);
});

test('retention prunes old search counters only when switched on, and nothing else', async () => {
  const seed = env => env.DB.raw.exec(`INSERT INTO search_metric_days VALUES ('2026-01-01',1,'total','all',1),
    ('2026-04-04',1,'total','all',1); INSERT INTO search_metric_budget VALUES ('2026-01-01',1,0),('2026-04-04',1,0);`);
  const off = makeEnv(); seed(off);
  await runRetention(off, '2026-07-03T12:00:00.000Z');
  assert.equal(metricRows(off), 4);
  const on = {...makeEnv(), ...ON}; seed(on);
  await runRetention(on, '2026-07-03T12:00:00.000Z');
  assert.deepEqual(on.DB.raw.prepare('SELECT day FROM search_metric_days').all().map(x=>x.day), ['2026-04-04']);
  assert.deepEqual(on.DB.raw.prepare('SELECT day FROM search_metric_budget').all().map(x=>x.day), ['2026-04-04']);
});

test('public measurement rejects oversized, unrecognised and identifying fields', async () => {
  const env = makeEnv();
  for (const body of [null, [], {...valid, extra:'irrelevant'}, {...valid, op:['rent']}, {...valid, beds:'7'},
    {...valid, max:'sale_gbp_400000'}, {...valid, zero_results:0}, {...valid, version:2}, {...valid, url:'x'},
    {...valid, event:'other'}, {...valid, region:'x'.repeat(1024)}]) {
    const r = await call(env, 'POST', '/search-stats', {body});
    assert.ok([400,413].includes(r.status), `unexpected status ${r.status}`);
  }
  assert.equal((await call(env,'POST','/search-stats',{body:valid,origin:'https://elsewhere.test'})).status,403);
});

test('switched off, trends require staff, validate periods and report an unavailable source', async () => {
  const env = makeEnv();
  assert.equal((await call(env,'GET','/admin/insights/search-trends')).status,401);
  const cookie = await adminCookie();
  assert.equal((await call(env,'GET','/admin/insights/search-trends?days=8',{cookie})).status,400);
  const r = await call(env,'GET','/admin/insights/search-trends?days=7',{cookie});
  assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.data.available,false);
  assert.equal(r.data.coverage,'unknown');
});

test('trends distinguish missing days, unknown versions, truncation and source failure', async () => {
  const store = await import('../../server/search-measurement.js');
  assert.equal(typeof store.readSearchTrends,'function');
  const env=makeEnv(), period={days:3,from:'2026-07-01',to:'2026-07-03'};
  assert.equal((await store.readSearchTrends(makeEnv({skip:[108]}),period)).available,false);
  env.DB.raw.exec(`INSERT INTO search_metric_days VALUES
    ('2026-07-02',1,'total','all',7),('2026-07-02',1,'zero_results','true',2),
    ('2026-07-02',1,'op','rent',7),('2026-07-02',2,'op','unrecognised',3);
    INSERT INTO search_metric_budget VALUES ('2026-07-02',5000,1);`);
  const r=await store.readSearchTrends(env,period);
  assert.equal(r.available,true);
  assert.equal(r.coverage,'unknown');
  assert.deepEqual(r.series,[{day:'2026-07-01',actions:null,zero_results:null,capped:false},
    {day:'2026-07-02',actions:7,zero_results:2,capped:true},
    {day:'2026-07-03',actions:null,zero_results:null,capped:false}]);
  assert.deepEqual(r.totals.find(x=>x.version===1 && x.dimension==='op').series,[{day:'2026-07-02',n:7}]);
  assert.ok(r.totals.some(x=>x.version===2 && x.label==='Unknown (version 2)' && x.n===3));
  assert.ok(!JSON.stringify(r).includes('unrecognised'));
  assert.equal(r.capped,true);
});


test('invalid periods or inconsistent counts are unavailable rather than fabricated zeroes', async () => {
  const {readSearchTrends}=await import('../../server/search-measurement.js');
  const env=makeEnv();
  assert.equal((await readSearchTrends(env,{days:7,from:'invalid',to:'also-invalid'})).available,false);
  env.DB.raw.exec("INSERT INTO search_metric_days VALUES ('2026-07-02',1,'zero_results','true',2)");
  const result=await readSearchTrends(env,{days:3,from:'2026-07-01',to:'2026-07-03'});
  assert.equal(result.available,false);
});

test('both wrangler files carry the ANA-04 switch, off and equal', async () => {
  const {readFileSync} = await import('node:fs');
  const flag = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').match(/^ANA04_SEARCH_STATS_READY = "(\d)"$/m)?.[1];
  assert.equal(flag('wrangler.toml'), '0');
  // Equal whatever the value: the clock and the panel both run the 90-day prune, so it is switched on in both at once.
  assert.equal(flag('jobs/wrangler.toml'), flag('wrangler.toml'));
});

test('switched on before migration 0108, the retention pass still runs to the end', async () => {
  const {runRetention} = await import('../../server/retention.js');
  const {makeDb} = await import('./helpers.mjs');
  const env = {DB: makeDb({skip: [108]}), ANA04_SEARCH_STATS_READY: '1'};
  await assert.doesNotReject(runRetention(env, '2026-11-16T00:05:00.000Z'));
});
