// BUS-09: automatic reader for Finders Keepers (finderskeepers.je). It reads the JSON feed the site's own search page loads
// (/property.json, unsold adverts only, 12 per page, one request per page) under the reviewed root. Facts only: operation,
// parish, rooms, parking spaces, price and link; no descriptions, no photos, no detail pages. Commercial, land and garage adverts are left out.
import { SourceReadError } from '../market-daily-sweep.js';
import { fetchAllowed } from './fetch.js';

const HOST_RE = /^(?:www\.)?finderskeepers\.je$/, MAX_PAGES = 30, NOT_HOME = /commercial|land|garage|parking|retail|office|warehouse|industrial/i;
const FEED = '/property.json?isUnSold=1&minPrice=1&maxPrice=99999999999';
const label = (list, one) => (Array.isArray(list) ? list[0] : one)?.title?.toString().trim() || null;

export function parseFindersKeepers(json) {
  const items = [];
  for (const x of Array.isArray(json?.data) ? json.data : []) {
    const op = /^for (let|sale)$/i.exec(String(x?.propertyType?.title ?? '').trim()), type = label(x.housingType),
      url = typeof x.url === 'string' && /^https:\/\/www\.finderskeepers\.je\/property\/[a-z0-9-]+\/?$/.test(x.url) ? x.url : null;
    if (!op || !url || !x.id || (type && NOT_HOME.test(type))) continue;
    const operation = op[1].toLowerCase() === 'let' ? 'rent' : 'sale', parish = label(x.parish), price = Number(x.price), beds = x.bedrooms == null ? NaN : Number(x.bedrooms), baths = x.bathrooms == null ? NaN : Number(x.bathrooms);
    const bedrooms = Number.isInteger(beds) && beds >= 0 && beds < 30 ? beds : null, bathrooms = Number.isInteger(baths) && baths >= 0 && baths < 30 ? baths : null;
    // ponytail: Finders Keepers quotes lets per calendar month (its pages say "pcm"); the feed drops the unit.
    const terms = price > 0 ? [{ kind: operation === 'rent' ? 'rent' : 'sale_price', amount_minor: Math.round(price * 100), currency: 'GBP',
      period: operation === 'rent' ? 'month' : 'sale', raw_text: `£${price.toLocaleString('en-GB')}` }] : [];
    // ponytail: spaces > 0 is parking; 0 may mean "not given", so it stays unknown rather than "no parking".
    const parking = Number(x.parking) > 0 ? true : null;
    items.push({ id: String(x.id), url, operation, parish, bedrooms, bathrooms, parking, financial_terms: terms,
      title: `${bedrooms == null ? '' : `${bedrooms} bedroom `}${(type ?? 'home').toLowerCase()}${parish ? `, ${parish}` : ''}` });
  }
  const p = json?.meta?.pagination;
  return { items, page: Number(p?.current_page), pages: Number(p?.total_pages) };
}

const record = i => ({ external_key: `finderskeepers:${i.id}`, raw: { listing_url: i.url, price_text: i.financial_terms[0]?.raw_text ?? null },
  observation: { country_code: 'JE', territory_evidence: `Finders Keepers listing in Jersey${i.parish ? `: ${i.parish}` : ''}`, operation: i.operation,
    title: i.title, parish: i.parish, bedrooms: i.bedrooms, bathrooms: i.bathrooms, ...(i.parking && { parking: true }),
    financial_terms: i.financial_terms } });

export function findersKeepersReader({ fetchImpl = fetch } = {}) {
  return { async readPage({ cursor, allowed_hosts, allowed_paths, signal }) {
    const host = allowed_hosts?.find(h => HOST_RE.test(h));
    if (!host || !allowed_paths?.length) throw new SourceReadError('access_denied');
    // ponytail: a channel reviewed on a sub-page is a subset of the root channel, which reads it all.
    if (!allowed_paths.includes('/')) return { records: [], exhausted: true, next_cursor: null };
    const pageNo = cursor == null ? 1 : /^\d{1,3}$/.test(cursor) ? Number(cursor) : NaN;
    if (!Number.isInteger(pageNo) || pageNo < 1) throw new SourceReadError('invalid_response');
    // The bare host redirects to an index.php path; the www host answers directly.
    const body = await fetchAllowed(fetchImpl, `https://www.${host.replace(/^www\./, '')}${FEED}${pageNo > 1 ? `&page=${pageNo}` : ''}`, { host, path: '/', signal });
    let json; try { json = JSON.parse(body); } catch { throw new SourceReadError('invalid_response'); }
    const { items, pages } = parseFindersKeepers(json);
    if (!Array.isArray(json?.data) || !Number.isInteger(pages) || pages < 1) throw new SourceReadError('invalid_response');
    if (pageNo === 1 && !items.length) throw new SourceReadError('invalid_response');
    const last = pageNo >= pages || pageNo >= MAX_PAGES;
    return { records: items.map(record), exhausted: last, next_cursor: last ? null : String(pageNo + 1) };
  } };
}
