// Replay saved Keys pages against the reader and the market custodian. All requests are answered in memory.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { entregar } from '../hermes/mercado.mjs';
import { parseKeys } from '../server/market-readers/keys.js';

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node scripts/rehearse-keys-market.mjs <rss.xml> <sitemap.html>');
  process.exit(2);
}

const [rss, sitemap] = await Promise.all(args.map(file => readFile(file, 'utf8')));
const listings = parseKeys(rss, sitemap);
if (!listings.length) {
  console.log(JSON.stringify({ baseline: 0, error: 'empty_baseline' }));
  process.exit(1);
}

const pages = new Map([
  ['https://www.keys.je/images/ADKP/rss.xml', rss],
  ['https://www.keys.je/sitemap.aspx', sitemap],
]);
const run_id = 'offline', source_ref = 'keys', channel_id = 'root';
const item = { source_ref, channel_id, hosts: ['keys.je'], paths: ['/'] };
const origin = 'https://app.invalid';
const estado = await mkdtemp(join(tmpdir(), 'keys-rehearsal-'));
try {
  const cfg = {
    origin, estado, key: 'offline', now: Date.now, busy: new Set(), log() {},
    lookupFn: async () => [{ address: '192.0.2.1', family: 4 }],
    fetchFn: async url => {
      if (url === origin + '/api/hermes/market/work') return Response.json({ run_id, items: [item] });
      if (pages.has(url)) return new Response(pages.get(url));
      throw new Error('Unexpected request in offline rehearsal');
    },
  };
  const adverts = listings.map(listing => ({
    listing_url: listing.url, operation: listing.operation, use: 'residential',
    price_text: listing.financial_terms[0].raw_text, parish: listing.parish,
    bedrooms: listing.bedrooms, title: listing.title,
  }));
  const result = await entregar(cfg, { run_id, source_ref, channel_id, pages: [...pages.keys()], adverts });
  console.log(JSON.stringify({ baseline: listings.length, ...result }));
  if (result.queued !== listings.length || result.fail) process.exitCode = 1;
} finally {
  await rm(estado, { recursive: true, force: true });
}
