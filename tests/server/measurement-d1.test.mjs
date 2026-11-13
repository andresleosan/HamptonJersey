import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { getWebVolumes } from '../../server/measurement.js';
import { handleApi } from '../../server/api.js';
import { jerseyToday } from '../../server/viewings.js';

test('local D1 reads the indexed 90-day range and returns separate totals', async t => {
  const require = createRequire(import.meta.url);
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default {fetch(){return new Response('fixture')}}", compatibilityDate: '2025-10-01',
    host: '127.0.0.1', port: 0, d1Databases: { DB: 'ana01-runtime' } }));
  try {
    const DB = await mf.getD1Database('DB');
    await DB.prepare(`CREATE TABLE daily_stats (day TEXT NOT NULL, listing_id TEXT NOT NULL,
      metric TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, listing_id, metric)) WITHOUT ROWID`).run();
    await DB.prepare(`WITH RECURSIVE days(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM days WHERE i<179),
      ids(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM ids WHERE n<250),
      metrics(metric) AS (VALUES ('view'), ('photos'), ('tour'))
      INSERT INTO daily_stats SELECT date('2026-01-01', '+' || i || ' days'), printf('L%04d', n), metric, 1
      FROM days CROSS JOIN ids CROSS JOIN metrics`).run();
    const calls = [];
    const measuredDb = { prepare(query) { return { bind(...args) { return { async all() {
      const started = performance.now();
      const result = await DB.prepare(query).bind(...args).all();
      calls.push({ query, meta: result.meta, elapsed_ms: performance.now() - started });
      return result;
    } }; } }; } };
    const result = await getWebVolumes({ DB: measuredDb }, { from: '2026-04-01', to: '2026-06-29' });
    assert.equal(calls.length, 1);
    const legacy = await DB.prepare("SELECT COALESCE(SUM(n),0) AS views FROM daily_stats WHERE metric='view' AND day BETWEEN ? AND ?")
      .bind('2026-04-01', '2026-06-29').all();
    assert.equal(legacy.results[0].views, result.sources.find(x => x.key === 'listing_open').count);
    assert.ok(calls[0].meta.rows_read <= legacy.meta.rows_read + 1,
      `combined aggregate read ${calls[0].meta.rows_read}; previous views aggregate read ${legacy.meta.rows_read}`);
    const plan = await DB.prepare('EXPLAIN QUERY PLAN ' + calls[0].query).bind('2026-04-01', '2026-06-29').all();
    assert.match(plan.results.map(r => r.detail).join(' '), /PRIMARY KEY.*day>\?.*day<\?/i);
    assert.ok(calls[0].meta.rows_read <= 70000, `bounded synthetic scan read ${calls[0].meta.rows_read} rows`);
    assert.equal(result.sources.find(x => x.key === 'listing_open').count, 22500);
    assert.equal(result.sources.find(x => x.key === 'gallery_open').count, 22500);
    t.diagnostic(`Synthetic 135,000 rows, 90 days/67,500 keys in range, one D1 query; local elapsed ${calls[0].elapsed_ms.toFixed(1)} ms; rows_read=${calls[0].meta.rows_read ?? 'unreported'}; rows_written=${calls[0].meta.rows_written ?? 'unreported'}.`);
    await DB.prepare('CREATE TABLE listings (id TEXT PRIMARY KEY, published INTEGER, archived_at TEXT)').run();
    await DB.prepare("INSERT INTO listings VALUES ('HE-R001', 1, NULL)").run();
    const today = jerseyToday();
    await DB.prepare('DELETE FROM daily_stats WHERE day = ?').bind(today).run();
    await DB.prepare("INSERT INTO daily_stats VALUES (?, 'HE-R001', 'view', 19990)").bind(today).run();
    const send = () => handleApi(new Request('https://hampton.test/api/stats', { method: 'POST',
      headers: { origin: 'https://hampton.test', 'content-type': 'application/json' },
      body: JSON.stringify({ listing_id: 'HE-R001', metric: 'view' }) }), { DB }, ['stats']);
    const responses = await Promise.all(Array.from({ length: 25 }, send));
    assert.ok(responses.every(r => r.status === 204));
    const daily = await DB.prepare('SELECT SUM(n) AS count FROM daily_stats WHERE day = ?').bind(today).first();
    assert.equal(daily.count, 20000, 'concurrent requests preserve the existing daily cap');
  } finally { await mf.dispose(); }
});
