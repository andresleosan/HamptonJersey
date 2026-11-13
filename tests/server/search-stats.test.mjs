import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie } from './helpers.mjs';

const valid = {event:'search_applied',version:1,op:'rent',region:'jersey',beds:'2',max:'rent_gbp_month_2500',zero_results:true};

test('search measurement stays unavailable and never touches its absent schema', async () => {
  const env = makeEnv();
  const r = await call(env, 'POST', '/search-stats', {body:valid});
  assert.equal(r.status, 503);
  assert.equal(env.DB.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'search_metric_%'").get().n, 0);
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

test('trends require staff, validate periods and report an unavailable source', async () => {
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
  assert.equal((await store.readSearchTrends(env,period)).available,false);
  const {readFileSync}=await import('node:fs');
  env.DB.raw.exec(readFileSync(new URL('../../docs/roadmap/work/ANA-04/proposed-search-metrics.sql',import.meta.url),'utf8'));
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
  const {readFileSync}=await import('node:fs');
  const env=makeEnv();
  assert.equal((await readSearchTrends(env,{days:7,from:'invalid',to:'also-invalid'})).available,false);
  env.DB.raw.exec(readFileSync(new URL('../../docs/roadmap/work/ANA-04/proposed-search-metrics.sql',import.meta.url),'utf8'));
  env.DB.raw.exec("INSERT INTO search_metric_days VALUES ('2026-07-02',1,'zero_results','true',2)");
  const result=await readSearchTrends(env,{days:3,from:'2026-07-01',to:'2026-07-03'});
  assert.equal(result.available,false);
});
