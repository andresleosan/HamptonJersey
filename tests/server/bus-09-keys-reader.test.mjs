// BUS-09: the Keys Properties reader. Synthetic RSS and sitemap (they only mimic the structure), never copies of the site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keysReader, parseKeys } from '../../server/market-readers/keys.js';
import { normalizeObservation } from '../../server/market-extraction.js';

const item = (title, slug, id) => `<item><title>${title}</title><link>https://www.keys.je/Property-For-${slug}-pi-ADKP${id}.htm</link><description>Long text never kept</description></item>`;
const rss = items => `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;
const sitemap = ids => `<html><body>${ids.map(i => `<a href="property-for-rent-x-pi-adkp${i}.htm">x</a>`).join('')}</body></html>`;

test('parse: only adverts still on the live sitemap; rooms, type, parish and price from the title', () => {
  const items = parseKeys(rss([item('3 Bedroom Apartment, St Helier £2,336.00', 'Rent-Roseville-Street-St-Helier', 2659),
    item('1 Bedroom Flat, St Saviour £1,250.00', 'Rent-Rue-Des-Pres-St-Saviour', 805), item('Garage, St Helier £150.00', 'Rent-Garage', 11),
    item('4 Bedroom House, St Mary £1,250,000.00', 'Sale-La-Rue-St-Mary', 77)]), sitemap([2659, 77, 11]));
  assert.deepEqual(items.map(i => [i.id, i.operation, i.parish, i.bedrooms, i.financial_terms[0].amount_minor, i.financial_terms[0].period]),
    [['2659', 'rent', 'St Helier', 3, 233600, 'month'], ['77', 'sale', 'St Mary', 4, 125000000, 'sale']]);
});

const reader = (bodies, calls = []) => keysReader({ fetchImpl: async url => { calls.push(String(url)); return new Response(bodies.shift(), { status: 200 }); } });
const ctx = over => ({ source_ref: 'src-keys-properties', channel_id: 'c', cursor: null, allowed_hosts: ['keys.je'], allowed_paths: ['/'],
  signal: new AbortController().signal, ...over });

test('readPage: sitemap then RSS on the reviewed host, 10 per page, records the sweep accepts, no descriptions', async () => {
  const ids = Array.from({ length: 12 }, (_, i) => 1000 + i), feed = rss(ids.map(i => item('2 Bedroom Apartment, St Helier £1,980.00', 'Rent-X', i)));
  const calls = [], r = reader([sitemap(ids), feed, sitemap(ids), feed], calls);
  const a = await r.readPage(ctx());
  assert.deepEqual(calls, ['https://keys.je/sitemap.aspx', 'https://keys.je/images/ADKP/rss.xml']);
  assert.deepEqual([a.records.length, a.exhausted, a.next_cursor], [10, false, '10']);
  for (const x of a.records) { normalizeObservation({ ...x.observation, observed_at: new Date().toISOString() });
    assert.equal(x.raw.description, undefined); assert.match(x.raw.listing_url, /^https:\/\/www\.keys\.je\//); }
  const b = await r.readPage(ctx({ cursor: a.next_cursor }));
  assert.deepEqual([b.records.length, b.exhausted, b.next_cursor], [2, true, null]);
});

test('a channel reviewed on a sub-page is a subset of the whole site: read as complete and empty, asking nothing', async () => {
  const calls = [], out = await reader([], calls).readPage(ctx({ allowed_hosts: ['www.keys.je'], allowed_paths: ['/properties-to-rent-st-helier.htm'] }));
  assert.deepEqual([calls.length, out.records.length, out.exhausted], [0, 0, true]);
});

test('a feed or sitemap without adverts is an invalid response, not an empty market', async () => {
  assert.equal((await reader([sitemap([]), rss([])]).readPage(ctx()).catch(e => e)).code, 'invalid_response');
  assert.equal((await reader([]).readPage(ctx({ allowed_hosts: ['evil.example'] })).catch(e => e)).code, 'access_denied');
});

test('offline Keys rehearsal compares the live RSS subset with the custodian and returns only counts', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'keys-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const paths = [join(dir, 'rss.xml'), join(dir, 'sitemap.html')];
  await writeFile(paths[0], rss([item('2 Bedroom Flat, St Helier £1,980.00', 'Rent-X', 10),
    item('4 Bedroom House, St Mary £625,000.00', 'Sale-Y', 20)]));
  await writeFile(paths[1], sitemap([10]));
  const run = () => spawnSync(process.execPath, ['scripts/rehearse-keys-market.mjs', ...paths], { encoding: 'utf8' });
  const live = run();
  assert.equal(live.status, 0, live.stderr);
  assert.deepEqual(JSON.parse(live.stdout), { baseline: 1, queued: 1, rejected: 0, reasons: {} });
  await writeFile(paths[1], sitemap([]));
  const empty = run();
  assert.equal(empty.status, 1);
  assert.deepEqual(JSON.parse(empty.stdout), { baseline: 0, error: 'empty_baseline' });
});
