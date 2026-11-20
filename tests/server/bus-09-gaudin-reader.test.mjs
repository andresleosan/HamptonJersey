// BUS-09: the Gaudin & Co reader. The HTML below is synthetic (it only mimics the card structure), never a copy of the site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gaudinReader, parseGaudinIndex } from '../../server/market-readers/gaudin.js';
import { normalizeObservation } from '../../server/market-extraction.js';
import { SourceReadError } from '../../server/market-daily-sweep.js';

const card = (slug, id, title, parish, price, beds, baths, status = '') => `<div class="featured-single property-card-single position-relative">
  <span class="status-tag"> ${status ? `<span>${status}</span>` : ''} </span>
  <a href="https://www.gaudin.je/property/${slug}/${id}"><img src="x.jpg"></a>
  <a href="https://www.gaudin.je/property/${slug}/${id}" class="d-block"><div class="fix-line">${title}</div><p>${parish}</p></a>
  <h2><span class="property-prices text-uppercase" data-conversion='{"GBP":"x"}'>${price}</span></h2>
  <img alt="Beds" title="Beds"><span style="padding-left: 2px;">${beds}</span><img alt="Baths" title="Baths"><span>${baths}</span></div>`;
const page = (cards, next) => `<html><body><div class="scroll-pagination--container">${cards.join('')}</div>${next ? `<a href="?page=${next}">Next</a>` : ''}</body></html>`;
const RENT = card('2-bed-apartment-to-rent-in-st-helier', 1860, 'Century Building', 'St. Helier', '£1,460 <abbr title="Monthly">pcm</abbr>', 2, 1);
const SALE = card('5-bed-detached-house-for-sale-in-st-brelade', 1595, 'The Hacienda', 'St. Brelade', '£8,999,990', 5, 7);
const SHOP = card('retail-unit-to-rent-in-st-helier', 77, 'Shop', 'St. Helier', '£900 <abbr>pcm</abbr>', 0, 0);

test('parse: operation from the link, price in pence, rooms; non-homes and unreadable cards are left out', () => {
  const r = parseGaudinIndex(page([RENT, SALE, SHOP, '<div class="property-card-single">broken</div>'], 2));
  assert.deepEqual(r.items.map(i => [i.id, i.operation, i.parish, i.bedrooms, i.bathrooms]),
    [['1860', 'rent', 'St. Helier', 2, 1], ['1595', 'sale', 'St. Brelade', 5, 7]]);
  assert.deepEqual(r.items[0].financial_terms, [{ kind: 'rent', amount_minor: 146000, currency: 'GBP', period: 'month', raw_text: '£1,460 pcm' }]);
  assert.deepEqual(r.items[1].financial_terms, [{ kind: 'sale_price', amount_minor: 899999000, currency: 'GBP', period: 'sale', raw_text: '£8,999,990' }]);
  assert.equal(r.hasNext, true);
});

const reader = (htmls, calls = []) => gaudinReader({ fetchImpl: async (url, init) => {
  calls.push([String(url), init?.redirect]); const h = htmls.shift();
  return h instanceof Response ? h : new Response(h, { status: 200 });
} });
const ctx = (over = {}) => ({ source_ref: 'src-gaudin-co', channel_id: 'c', cursor: null, allowed_hosts: ['gaudin.je'],
  allowed_paths: ['/residential-for-rent'], signal: new AbortController().signal, ...over });

test('readPage: first page asks only the reviewed path, returns max 10 records that the sweep accepts, and continues', async () => {
  const calls = [], twelve = Array.from({ length: 12 }, (_, i) => card('2-bed-to-rent-in-trinity', 100 + i, `Home ${i}`, 'Trinity', '£1,000 <abbr>pcm</abbr>', 2, 1));
  const r = reader([page(twelve, 2), page(twelve, 2)], calls);
  const a = await r.readPage(ctx());
  assert.equal(calls[0][0], 'https://gaudin.je/residential-for-rent');
  assert.equal(a.records.length, 10); assert.equal(a.exhausted, false); assert.equal(a.next_cursor, '1:10');
  for (const x of a.records) { assert.equal(x.raw.listing_url.startsWith('https://www.gaudin.je/property/'), true);
    normalizeObservation({ ...x.observation, observed_at: new Date().toISOString() }); assert.equal(x.raw.description, undefined); }
  const b = await r.readPage(ctx({ cursor: a.next_cursor }));
  assert.equal(b.records.length, 2); assert.equal(b.next_cursor, '2:0');
});

test('readPage: last page is exhausted; page 2 uses ?page=2', async () => {
  const calls = [], r = reader([page([RENT])], calls);
  const out = await r.readPage(ctx({ cursor: '2:0' }));
  assert.equal(calls[0][0], 'https://gaudin.je/residential-for-rent?page=2');
  assert.deepEqual([out.exhausted, out.next_cursor, out.records.length], [true, null, 1]);
});

test('errors: 429 is rate_limited, 403 access_denied, 5xx and odd html unavailable/invalid, outside-host redirect refused', async () => {
  const code = async res => (await reader([res]).readPage(ctx()).catch(e => e)).code;
  assert.equal(await code(new Response('', { status: 429, headers: { 'retry-after': '90' } })), 'rate_limited');
  assert.equal(await code(new Response('', { status: 403 })), 'access_denied');
  assert.equal(await code(new Response('', { status: 503 })), 'unavailable');
  assert.equal(await code(new Response('<html>nothing here</html>', { status: 200 })), 'invalid_response');
  assert.equal(await code(new Response('', { status: 302, headers: { location: 'https://evil.example/x' } })), 'access_denied');
  const ok = await reader([new Response('', { status: 301, headers: { location: 'https://www.gaudin.je/residential-for-rent' } }), page([RENT])]).readPage(ctx());
  assert.equal(ok.records.length, 1);
  assert.equal((await reader([page([RENT])]).readPage(ctx({ allowed_paths: [] })).catch(e => e)).code, 'access_denied');
  assert.ok((await reader([]).readPage(ctx({ cursor: 'x' })).catch(e => e)) instanceof SourceReadError);
});

test('let agreed, under offer and sold adverts are left out; amount pairs with its own period', () => {
  const taken = ['Let Agreed', 'Under Offer', 'Sold STC'].map((st, i) => card('2-bed-to-rent-in-trinity', 500 + i, 'T', 'Trinity', '£1,000 pcm', 2, 1, st));
  const weekly = card('1-bed-to-rent-in-st-helier', 600, 'W', 'St. Helier', '£350 pw (£1,517 pcm)', 1, 1);
  const r = parseGaudinIndex(page([...taken, weekly, RENT]));
  assert.deepEqual(r.items.map(i => i.id), ['600', '1860']);
  assert.deepEqual([r.items[0].financial_terms[0].amount_minor, r.items[0].financial_terms[0].period], [35000, 'week']);
});

test('a page with no cards ends the channel even if it links onwards, and page 40 is never asked', async () => {
  const empty = await reader([page([], 3)]).readPage(ctx({ cursor: '2:0' }));
  assert.deepEqual([empty.exhausted, empty.next_cursor], [true, null]);
  const capped = await reader([page([RENT], 31)]).readPage(ctx({ cursor: '30:0' }));
  assert.deepEqual([capped.exhausted, capped.next_cursor], [true, null]);
});
