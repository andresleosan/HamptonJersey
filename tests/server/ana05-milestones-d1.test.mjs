// ANA-05: the cost of one search-measurement request on local D1 (Miniflare reports rows_read), on a large synthetic
// base where most rows sit outside the period. The schema is the migrations' own tables and indexes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeDb } from './helpers.mjs';
import { getSearchMilestones } from '../../server/measurement-funnel.js';

const TABLES = ['admins', 'contacts', 'listings', 'applicants', 'events', 'offers', 'sales'];

test('one milestones request reads a bounded number of rows on a large synthetic base', async t => {
  const schema = makeDb().raw.prepare(`SELECT type, sql FROM sqlite_master WHERE tbl_name IN (${TABLES.map(() => '?').join(',')})
    AND sql IS NOT NULL AND type IN ('table','index') ORDER BY type DESC, rowid`).all(...TABLES);
  const { Miniflare, convertV4MiniflareOptions } = createRequire(import.meta.url)('miniflare');
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default {fetch(){return new Response('fixture')}}",
    compatibilityDate: '2025-10-01', host: '127.0.0.1', port: 0, d1Databases: { DB: 'ana05-cost' } }));
  try {
    const DB = await mf.getD1Database('DB');
    // Foreign keys to tables outside this read are dropped from the copy; columns, checks and indexes stay.
    for (const { sql } of schema) await DB.prepare(sql.replace(/REFERENCES \w+\s*\(\w+\)(\s+ON DELETE (SET NULL|CASCADE))?/g, '')).run();
    const T = '2026-01-01T12:00:00.000Z';
    await DB.prepare(`INSERT INTO listings (id,use,title,operation,availability,country,location,sale_price,currency,published,specs,
      created_at,updated_at) VALUES ('HE-R001','residential','Synthetic','sale','for_sale','Jersey','St Helier',500000,'GBP',1,'[]',?,?)`)
      .bind(T, T).run();
    const seq = n => `WITH RECURSIVE s(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM s WHERE n<${n})`;
    await DB.prepare(`${seq(54000)} INSERT INTO contacts (id,name,email,last_activity_at,created_at,updated_at)
      SELECT n,'SYNTHETIC','s'||n||'@example.test',?,?,? FROM s`).bind(T, T, T).run();
    // 4,000 searches inside the 88-day period, 50,000 older ones; one search per contact.
    await DB.prepare(`${seq(54000)} INSERT INTO applicants (id,contact_id,operation,source,stage,search_state,resolved_at,resolved_by,
      resolution_reason,created_at,updated_at)
      SELECT n,n,CASE n%2 WHEN 0 THEN 'buy' ELSE 'rent' END,'phone','searching',
        CASE WHEN n%10=0 THEN 'resolved' ELSE 'active' END, CASE WHEN n%10=0 THEN ? END, CASE WHEN n%10=0 THEN 'synthetic' END,
        CASE WHEN n%10=0 THEN 'Synthetic' END,
        CASE WHEN n<=4000 THEN strftime('%Y-%m-%dT%H:%M:%fZ','2026-08-01T12:00:00Z','+'||(n%85)||' days')
          ELSE strftime('%Y-%m-%dT%H:%M:%fZ','2025-01-01T12:00:00Z','+'||(n%300)||' days') END, ? FROM s`).bind('2026-10-27T12:00:00.000Z', T).run();
    // Five stage events per search in the period (20,000) and four per older search (200,000).
    await DB.prepare(`${seq(220000)} INSERT INTO events (at,actor,entity_type,entity_id,type,data)
      SELECT CASE WHEN n<=20000 THEN '2026-10-27T10:00:00.000Z' ELSE '2025-06-01T10:00:00.000Z' END,'synthetic','applicant',
        CAST(CASE WHEN n<=20000 THEN (n-1)%4000+1 ELSE 4001+(n-1)%50000 END AS TEXT),'applicant.stage_changed',
        '{"after":{"stage":"viewing"}}' FROM s`).run();
    // Offers and completed sales for buying searches: 2,000 and 500 in the period, 25,000 and 5,000 older.
    await DB.prepare(`${seq(27000)} INSERT INTO offers (id,listing_id,applicant_id,amount,status,created_at,updated_at)
      SELECT n,'HE-R001',CASE WHEN n<=2000 THEN n*2 ELSE 4000+((n-2000)*2)%50000+2 END,500000,
        CASE WHEN n<=500 OR (n>2000 AND n<=7000) THEN 'accepted' ELSE 'pending' END,
        CASE WHEN n<=2000 THEN '2026-10-27T11:00:00.000Z' ELSE '2025-06-01T11:00:00.000Z' END,? FROM s`).bind(T).run();
    await DB.prepare(`INSERT INTO sales (listing_id,applicant_id,offer_id,price,status,closed_at,created_at,updated_at)
      SELECT listing_id,applicant_id,id,amount,'completed',created_at,created_at,created_at FROM offers WHERE status='accepted'`).run();

    const calls = [];
    const measured = { prepare: sql => ({ bind: (...args) => ({ async first() {
      const started = performance.now(), r = await DB.prepare(sql).bind(...args).all();
      calls.push({ meta: r.meta, ms: performance.now() - started });
      return r.results[0] ?? null;
    } }) }) };
    const d = await getSearchMilestones({ DB: measured, SEARCH_MILESTONES_READY: '1' }, { from: '2026-08-01', to: '2026-10-28' });
    assert.equal(calls.length, 1, 'one aggregate query per request');
    assert.equal(d.cohort.count, 4000);
    assert.equal(d.observed_stages.find(s => s.stage === 'viewing').count, 4000);
    assert.equal(d.verified_business.offer.count, 2000);
    assert.equal(d.verified_business.agreed.count, 500);
    assert.equal(d.verified_business.completed.count, 500);
    assert.equal(d.verified_business.search_closed.count, 400);
    const { rows_read, rows_written } = calls[0].meta;
    assert.ok(Number.isInteger(rows_read), 'D1 reports the rows read');
    assert.equal(rows_written, 0);
    // In-period rows: 4,000 searches + 20,000 events + 2,000 offers + 500 sales = 26,500 of 330,000+ in the base. D1 also
    // counts each pass over an intermediate table: at most four reads per in-period row, never the rest of the base.
    // Before ANA-05 the stage figures alone read 304,003 rows on this same base (one pass per figure).
    assert.ok(rows_read <= 4 * 26500, `one request read ${rows_read} rows`);
    t.diagnostic(`Synthetic base: 54,000 searches, 220,000 events, 27,000 offers, 5,500 sales; 88-day period with 4,000 searches. ` +
      `One D1 query: rows_read=${rows_read}, rows_written=${rows_written}, local ${calls[0].ms.toFixed(1)} ms.`);
  } finally { await mf.dispose(); }
});
