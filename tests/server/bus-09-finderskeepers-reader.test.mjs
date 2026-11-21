// BUS-09: the Finders Keepers reader. Synthetic JSON feed (it only mimics the structure), never a copy of the site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { findersKeepersReader, parseFindersKeepers } from '../../server/market-readers/finderskeepers.js';
import { MARKET_READERS } from '../../server/market-readers/index.js';
import { normalizeObservation } from '../../server/market-extraction.js';

const adv = (id, over = {}) => ({ id: String(id), title: 'Marketing title never kept', url: `https://www.finderskeepers.je/property/example-${id}`,
  description: '<p>Long text never kept</p>', bedrooms: 2, bathrooms: 1, price: 1950, propertyType: { title: 'For Let' },
  housingType: [{ title: 'Apartment' }], parish: [{ title: 'St Helier' }], images: [{ tiny: 'https://x.example/a.jpg' }], ...over });
const feed = (data, page = 1, pages = 1) => JSON.stringify({ data, meta: { pagination: { current_page: page, total_pages: pages } } });

test('parse: operation, parish, rooms, type and price; commercial and unreadable adverts left out', () => {
  const { items } = parseFindersKeepers(JSON.parse(feed([adv(1), adv(2, { propertyType: { title: 'For Sale' }, price: 665000, parish: [], bedrooms: 3 }),
    adv(3, { housingType: [{ title: 'Commercial' }] }), adv(4, { propertyType: { title: 'Wanted' } }), adv(5, { url: 'https://evil.example/x' }),
    adv(6, { price: null, bedrooms: null })])));
  assert.deepEqual(items.map(i => [i.id, i.operation, i.parish, i.bedrooms, i.financial_terms[0]?.amount_minor ?? null, i.financial_terms[0]?.period ?? null]),
    [['1', 'rent', 'St Helier', 2, 195000, 'month'], ['2', 'sale', null, 3, 66500000, 'sale'], ['6', 'rent', 'St Helier', null, null, null]]);
  assert.equal(items[0].title, '2 bedroom apartment, St Helier');
});

const reader = (bodies, calls = []) => findersKeepersReader({ fetchImpl: async url => { calls.push(String(url)); return new Response(bodies.shift(), { status: 200 }); } });
const ctx = over => ({ source_ref: 'src-finders-keepers', channel_id: 'c', cursor: null, allowed_hosts: ['finderskeepers.je'], allowed_paths: ['/'],
  signal: new AbortController().signal, ...over });

test('readPage: one request per feed page on the reviewed host, records the sweep accepts, no descriptions', async () => {
  const calls = [], r = reader([feed([adv(1), adv(2)], 1, 2), feed([adv(3)], 2, 2)], calls);
  const a = await r.readPage(ctx());
  assert.deepEqual([a.records.length, a.exhausted, a.next_cursor], [2, false, '2']);
  for (const x of a.records) { normalizeObservation({ ...x.observation, observed_at: new Date().toISOString() });
    assert.equal(x.raw.description, undefined); assert.match(x.raw.listing_url, /^https:\/\/www\.finderskeepers\.je\/property\//); }
  const b = await r.readPage(ctx({ cursor: a.next_cursor }));
  assert.deepEqual([b.records.length, b.exhausted, b.next_cursor], [1, true, null]);
  assert.deepEqual(calls, ['https://www.finderskeepers.je/property.json?isUnSold=1&minPrice=1&maxPrice=99999999999',
    'https://www.finderskeepers.je/property.json?isUnSold=1&minPrice=1&maxPrice=99999999999&page=2']);
});

test('a channel reviewed on a sub-page is a subset of the whole site: read as complete and empty, asking nothing', async () => {
  const calls = [], out = await reader([], calls).readPage(ctx({ allowed_paths: ['/lettings'] }));
  assert.deepEqual([calls.length, out.records.length, out.exhausted], [0, 0, true]);
});

test('a broken or empty first page is an invalid response; a wrong host is access denied; the reader is registered', async () => {
  assert.equal((await reader(['<html>no</html>']).readPage(ctx()).catch(e => e)).code, 'invalid_response');
  assert.equal((await reader([feed([])]).readPage(ctx()).catch(e => e)).code, 'invalid_response');
  assert.equal((await reader([]).readPage(ctx({ cursor: 'x' })).catch(e => e)).code, 'invalid_response');
  assert.equal((await reader([]).readPage(ctx({ allowed_hosts: ['evil.example'] })).catch(e => e)).code, 'access_denied');
  assert.equal(typeof MARKET_READERS['src-finders-keepers'].readPage, 'function');
});

test('parking: spaces on the advert say yes; none given or 0 stays unknown', async () => {
  const r = reader([feed([adv(1, { parking: '2' }), adv(2, { parking: '0' }), adv(3)])]);
  const { records } = await r.readPage(ctx());
  assert.deepEqual(records.map(x => x.observation.parking), [true, undefined, undefined]);
  for (const x of records) normalizeObservation({ ...x.observation, observed_at: '2026-11-21T00:00:00.000Z' });
});
