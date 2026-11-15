// BUS-01 / BUS-03: D1 rows read by one search's market query and by a page of the inventory screen, on a local D1
// (wrangler --local, no network): 2,000 adverts with 1 reading each, and the same adverts with 10 readings each
// (20,000 readings). Not a test: node tests/server/bus-01-d1-rows.mjs <empty scratch directory>.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { normalizeObservation } from '../../server/market-extraction.js';
import { readMarketCandidates, readMarketHomesPage } from '../../server/market-identity.js';

const out = process.argv[2];
if (!out) throw new Error('Give an empty scratch directory');
const wrangler = join(dirname(createRequire(import.meta.url).resolve('wrangler')), '..', 'bin', 'wrangler.js');
const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };
const d1 = (dir, args) => execFileSync(process.execPath, [wrangler, 'd1', ...args, '--local', '--persist-to', dir], { env, encoding: 'utf8', maxBuffer: 1 << 28 });
const q = s => `'${String(s).replaceAll("'", "''")}'`;
const AT = Date.parse('2026-11-14T10:00:00.000Z'), id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// The SQL a search and a page send, with their values written in (wrangler takes no parameters).
const recorded = [];
const fake = { BUS10_IDENTITY_READY: '1', DB: { prepare: sql => ({ sql, bind(...a) { recorded.push({ sql, a }); return this; } }),
  batch: async stmts => stmts.map((_, i) => ({ results: i ? [{ n: 1 }] : [] })) } };
const inline = ({ sql }, replace) => replace.reduce((s, [pattern, value]) => s.replace(pattern, value), sql);
await readMarketCandidates(fake, { operation: 'rent', legacy: false, limit: 51, fit: { top: 2000, bedrooms_min: 2, bedrooms_max: null,
  bathrooms_min: null, parking_spaces: null, wanted: ['St Helier'], excluded: [], area: true, pets: false, must: ['budget', 'bedrooms', 'area'] } });
const search = inline(recorded[0], [[/json_each\(\?\)/, `json_each('["St Helier"]')`], [/json_each\(\?\)/, `json_each('[]')`],
  [/h\.operation=\?/, `h.operation='rent'`], [/LIMIT \?$/, 'LIMIT 51']]);
recorded.length = 0;
await readMarketHomesPage(fake, null, 25);
const page = inline(recorded[0], [[/\? IS NULL OR COALESCE\(observed_at,''\)<\? OR \(COALESCE\(observed_at,''\)=\?\s+AND \(home>\? OR \(home=\? AND operation>\?\)\)\)/, 'NULL IS NULL'],
  [/LIMIT \?$/, 'LIMIT 26']]);

for (const readings of [1, 10]) {
  const dir = join(out, `d1-${readings}`); mkdirSync(dir, { recursive: true });
  d1(dir, ['migrations', 'apply', 'hampton']);
  const rows = [`INSERT INTO market_directory_manifests VALUES ('rev','${'a'.repeat(64)}','2000-01-01T00:00:00.000Z','review','accepted');`,
    ...['agency-a', 'agency-b'].map(s => `INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class,
      access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at) VALUES ('${s}','site','rev','external',
      'general','allowed','manual',1,'e','r','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z');`),
    `INSERT INTO market_runs(id,kind,manifest_revision,manifest_sha256,operation_id,created_at,created_by)
      VALUES('${id(1)}','initial','rev','${'a'.repeat(64)}','${id(2)}','2026-11-14T10:00:00.000Z','x');`];
  const parishes = ['St Helier', 'Grouville', 'St Brelade', 'Trinity', 'St Clement'];
  let n = 0;
  for (let r = 0; r < readings; r++) for (let i = 0; i < 2000; i++) {
    const operation = i % 5 ? 'rent' : 'sale', source = i % 2 ? 'agency-a' : 'agency-b', seen = new Date(AT - (readings - r) * 3600000).toISOString();
    const amount = (100000 + ((i + r) % 30) * 10000) * (operation === 'sale' ? 300 : 1);
    const norm = normalizeObservation({ country_code: 'JE', territory_evidence: 'Jersey', operation, observed_at: seen, title: `Home ${i}`,
      parish: parishes[i % 5], bedrooms: 1 + (i % 4), bathrooms: 1, financial_terms: [operation === 'sale'
        ? { kind: 'sale_price', amount_minor: amount, currency: 'GBP', period: 'sale' } : { kind: 'rent', amount_minor: amount, currency: 'GBP', period: 'month' }] });
    n++;
    rows.push(`INSERT INTO market_pages(id,run_id,source_ref,channel_id,page_key,content_sha256,exhausted,observed_at,committed_at,committed_by,
      lease_token,lease_generation,policy_version) VALUES('${id(100000 + n)}','${id(1)}','${source}','site','p${n}','${'b'.repeat(64)}',0,'${seen}','${seen}','x','x',1,1);`,
      `INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,normalized_sha256,source_at,origin_sha256)
      VALUES('${id(300000 + n)}','${id(100000 + n)}','${source}','site','K-${i}',${q(JSON.stringify({ listing_url: `https://${source}.example.test/k-${i}` }))},
      ${q(JSON.stringify(norm))},'${'c'.repeat(64)}','${seen}','${'d'.repeat(64)}');`);
  }
  const file = join(dir, 'data.sql'); writeFileSync(file, rows.join('\n'));
  d1(dir, ['execute', 'hampton', '--file', file]);
  for (const [label, sql] of [['search', search], ['inventory page', page]]) {
    const [result] = JSON.parse(d1(dir, ['execute', 'hampton', '--json', '--command', sql]));
    console.log(`${2000 * readings} readings, ${label}: rows read ${result.meta.rows_read}, D1 duration ${result.meta.duration} ms, rows returned ${result.results.length}`);
  }
}
