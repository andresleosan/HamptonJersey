import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const load = () => import('../../server/search-measurement.js').catch(() => ({}));
const action = {event:'search_applied',version:1,op:'rent',region:'jersey',beds:'2',max:'rent_gbp_month_2500',zero_results:true};

test('D1: atomic search marginals respect the daily cap, rollback and bounded retention', async t => {
  const store = await load();
  assert.equal(typeof store.writeSearchAction, 'function');
  assert.equal(typeof store.pruneSearchMetrics, 'function');
  const {Miniflare,convertV4MiniflareOptions} = createRequire(import.meta.url)('miniflare');
  const mf = new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'ana04-local'}}));
  try {
    const DB=await mf.getD1Database('DB');
    const sql=readFileSync(new URL('../../docs/roadmap/work/ANA-04/proposed-search-metrics.sql',import.meta.url),'utf8');
    for (const s of sql.split(';').map(x=>x.trim()).filter(Boolean)) await DB.prepare(s).run();
    await DB.prepare('CREATE TABLE unrelated (n INTEGER)').run();
    await DB.prepare('INSERT INTO unrelated VALUES (1)').run();
    await DB.prepare("INSERT INTO search_metric_budget VALUES ('2026-07-02',4999,0)").run();
    const day='2026-07-02';
    const writes=await Promise.all(Array.from({length:25},()=>store.writeSearchAction({DB},action,new Date('2026-07-01T23:30:00Z'))));
    assert.equal(writes.filter(Boolean).length,1);
    assert.deepEqual(await DB.prepare('SELECT n,capped FROM search_metric_budget WHERE day=?').bind(day).first(),{n:5000,capped:1});
    const rows=await DB.prepare('SELECT version,dimension,value,n FROM search_metric_days WHERE day=? ORDER BY dimension').bind(day).all();
    assert.deepEqual(rows.results.map(r=>[r.dimension,r.value,r.n]),[
      ['beds','2',1],['max','rent_gbp_month_2500',1],['op','rent',1],['region','jersey',1],['total','all',1],['zero_results','true',1]]);
    for(let i=0;i<1000;i++) await store.writeSearchAction({DB},action,new Date('2026-07-01T23:30:00Z'));
    assert.equal((await DB.prepare('SELECT SUM(n) AS n FROM search_metric_days').first()).n,6);
    const budgetCosts=[];
    const metered={prepare:sql=>DB.prepare(sql),batch:async statements=>{const result=await DB.batch(statements);budgetCosts.push(result.map(x=>x.meta));return result;}};
    await store.writeSearchAction({DB:metered},action,new Date('2026-10-24T23:30:00Z'));
    await store.writeSearchAction({DB:metered},action,new Date('2026-10-25T01:30:00Z'));
    assert.equal((await DB.prepare("SELECT n FROM search_metric_budget WHERE day='2026-10-25'").first()).n,2);
    const firstWrites=budgetCosts[0].reduce((sum,m)=>sum+(m.rows_written ?? 0),0);
    const firstReads=budgetCosts[0].reduce((sum,m)=>sum+(m.rows_read ?? 0),0);
    assert.ok(budgetCosts[0].every(m=>Number.isInteger(m.rows_read)),'D1 reports each read count');
    assert.ok(firstReads<=6,'a full action reads at most six rows locally');
    assert.ok(firstWrites<=7,'a full action writes at most seven rows');
    await store.writeSearchAction({DB:metered},action,new Date('2026-07-01T23:30:00Z'));
    const cappedReads=budgetCosts[2].reduce((sum,m)=>sum+(m.rows_read ?? 0),0);
    assert.equal(budgetCosts[2].reduce((sum,m)=>sum+(m.rows_written ?? 0),0),0,'capped attempts write no rows');
    t.diagnostic(`Local D1 first action: rows_read=${firstReads}, rows_written=${firstWrites}; capped rows_read=${cappedReads}, rows_written=0.`);
    await DB.prepare("CREATE TRIGGER reject_metric BEFORE INSERT ON search_metric_days WHEN NEW.dimension='region' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
    await assert.rejects(store.writeSearchAction({DB},action,new Date('2026-07-03T12:00:00Z')));
    assert.equal((await DB.prepare("SELECT count(*) AS n FROM search_metric_budget WHERE day='2026-07-03'").first()).n,0);
    assert.equal((await DB.prepare("SELECT count(*) AS n FROM search_metric_days WHERE day='2026-07-03'").first()).n,0);
    await DB.prepare('DROP TRIGGER reject_metric').run();
    await DB.prepare("INSERT INTO search_metric_days VALUES ('2026-01-01',1,'total','all',1),('2026-04-04',1,'total','all',1)").run();
    await DB.prepare("INSERT INTO search_metric_budget VALUES ('2026-01-01',1,0),('2026-04-04',1,0)").run();
    await store.pruneSearchMetrics({DB},new Date('2026-07-03T12:00:00Z'));
    assert.equal((await DB.prepare("SELECT count(*) AS n FROM search_metric_days WHERE day='2026-01-01'").first()).n,0);
    assert.equal((await DB.prepare("SELECT count(*) AS n FROM search_metric_days WHERE day='2026-04-04'").first()).n,1);
    assert.equal((await DB.prepare('SELECT count(*) AS n FROM unrelated').first()).n,1);
    await store.pruneSearchMetrics({DB},new Date('2026-07-03T12:00:00Z'));
    await DB.prepare(`WITH RECURSIVE dates(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM dates WHERE i<179),
      dims(d,v) AS (VALUES ('total','all'),('zero_results','true'),('op','none'),('op','sale'),('op','rent'),('op','business'),
        ('region','none'),('region','jersey'),('region','uk'),('region','international'),('beds','none'),('beds','2'),('beds','3'),('beds','4'),
        ('max','none'),('max','sale_gbp_400000'),('max','sale_gbp_600000'),('max','sale_gbp_900000'),('max','sale_gbp_1500000'),
        ('max','rent_gbp_month_1500'),('max','rent_gbp_month_2500'),('max','rent_gbp_month_3500'),
        ('max','business_gbp_100000'),('max','business_gbp_250000'),('max','business_gbp_500000'))
      INSERT INTO search_metric_days SELECT date('2025-01-01','+'||i||' days'),1,d,v,1 FROM dates CROSS JOIN dims`).run();
    await DB.prepare(`WITH RECURSIVE dates(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM dates WHERE i<179)
      INSERT INTO search_metric_budget SELECT date('2025-01-01','+'||i||' days'),1,0 FROM dates`).run();
    let query,readMeta;
    const readDb={prepare:sql=>({bind:(...args)=>({all:async()=>{query=sql;const result=await DB.prepare(sql).bind(...args).all();readMeta=result.meta;return result;}})})};
    const trends=await store.readSearchTrends({DB:readDb},{days:90,from:'2025-04-01',to:'2025-06-29'});
    assert.equal(trends.available,true);assert.equal(trends.series.length,90);
    const plan=await DB.prepare('EXPLAIN QUERY PLAN '+query).bind('2025-04-01','2025-06-29').all();
    const details=plan.results.map(r=>r.detail).join(' ');
    assert.match(details,/PRIMARY KEY.*day>\?.*day<\?/i);
    assert.ok(readMeta.rows_read<=2500,`bounded indexed read: ${readMeta.rows_read}`);
    t.diagnostic(`Local D1 90-day scan: rows_read=${readMeta.rows_read}, rows_written=${readMeta.rows_written}; 4,500 stored aggregate rows total.`);
    t.diagnostic('Local D1: 25 concurrent attempts at 4,999, 1,000 after cap, transaction rollback and unrelated-table retention.');
  } finally { await mf.dispose(); }
});
