// BUS-09: automatic reader for Gaudin & Co (gaudin.je). It reads only the index path BUS-19 reviewed for the channel
// (?page=N), one request per page, from the cards alone: link, parish, price, bedrooms and bathrooms. No photos, no
// descriptions, no detail pages. Commercial and unreadable cards are left out. Facts only; the advert's link goes in raw.
import { SourceReadError } from '../market-daily-sweep.js';
import { fetchAllowed } from './fetch.js';

const PER_PAGE = 10, MAX_PAGES = 30, TAKEN = /let agreed|under offer|\bsold\b|\bsstc\b|^\s*let\s*$/i, HOST_RE = /^(?:www\.)?gaudin\.je$/;
const NOT_HOME = /(retail|office|warehouse|industrial|shop|restaurant|commercial|land|garage|parking|unit)/;
const text = s => s.replace(/<[^>]*>/g, ' ').replace(/&pound;/g, '£').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const count = (card, alt) => { const m = new RegExp(`alt="${alt}"[^>]*>\\s*<span[^>]*>\\s*(\\d{1,2})\\s*<`).exec(card); return m ? Number(m[1]) : null; };

export function parseGaudinIndex(html, pageNo = 1) {
  const items = [];
  for (const card of html.split('property-card-single').slice(1)) {
    const link = /https:\/\/www\.gaudin\.je\/property\/([a-z0-9-]+)\/(\d+)/.exec(card);
    if (!link || NOT_HOME.test(link[1])) continue;
    // Taken homes (let agreed, under offer, sold) are not offered: the sweep's "not found" review covers them.
    const status = /class="status-tag"[^>]*>\s*(?:<span[^>]*>([^<]{0,60})<\/span>)?/.exec(card);
    if (status?.[1] && TAKEN.test(status[1])) continue;
    const operation = link[1].includes('-to-rent-') || link[1].includes('-to-rent') ? 'rent' : link[1].includes('-for-sale') ? 'sale' : null;
    const title = /class="fix-line"[^>]*>([\s\S]*?)<\/div>/.exec(card), parish = /<\/div>\s*<p>([\s\S]*?)<\/p>/.exec(card);
    const priceHtml = /class="property-prices[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(card);
    if (!operation || !title || !parish || !priceHtml) continue;
    // The first amount and the period written right after it: "£350 pw (£1,517 pcm)" is £350 a week.
    const raw = text(priceHtml[1]), first = /£\s*([\d,]+(?:\.\d+)?)\s*(pcm|pw)?/i.exec(raw), amount = first;
    const period = first?.[2] ? (first[2].toLowerCase() === 'pcm' ? 'month' : 'week') : operation === 'sale' ? 'sale' : null;
    const terms = amount && period ? [{ kind: operation === 'rent' ? 'rent' : 'sale_price',
      amount_minor: Math.round(parseFloat(amount[1].replace(/,/g, '')) * 100), currency: 'GBP', period, raw_text: raw }] : [];
    items.push({ id: link[2], url: link[0], operation, title: text(title[1]), parish: /^jersey$/i.test(text(parish[1])) ? null : text(parish[1]),
      bedrooms: count(card, 'Beds'), bathrooms: count(card, 'Baths'), financial_terms: terms });
  }
  return { items, hasNext: new RegExp(`[?&]page=${pageNo + 1}(?!\\d)`).test(html) };
}

const record = item => ({ external_key: `gaudin:${item.id}`, raw: { listing_url: item.url, price_text: item.financial_terms[0]?.raw_text ?? null },
  observation: { country_code: 'JE', territory_evidence: `Gaudin & Co listing in Jersey${item.parish ? `: ${item.parish}` : ''}`, operation: item.operation,
    title: item.title, parish: item.parish, bedrooms: item.bedrooms, bathrooms: item.bathrooms, financial_terms: item.financial_terms } });

export function gaudinReader({ fetchImpl = fetch } = {}) {
  return { async readPage({ cursor, allowed_hosts, allowed_paths, signal }) {
    const host = allowed_hosts?.find(h => HOST_RE.test(h)), path = allowed_paths?.find(p => p.startsWith('/'));
    if (!host || !path) throw new SourceReadError('access_denied');
    const m = cursor == null ? ['', '1', '0'] : /^(\d{1,3}):(\d{1,3})$/.exec(cursor);
    if (!m) throw new SourceReadError('invalid_response');
    const pageNo = Number(m[1] || 1), offset = Number(m[2] || 0);
    const html = await fetchAllowed(fetchImpl, `https://${host}${path}${pageNo > 1 ? `?page=${pageNo}` : ''}`, { host, path, signal });
    if (!html.includes('scroll-pagination--container')) throw new SourceReadError('invalid_response');
    const { items, hasNext } = parseGaudinIndex(html, pageNo);
    const slice = items.slice(offset, offset + PER_PAGE), more = offset + PER_PAGE < items.length;
    const last = !more && (!hasNext || items.length === 0 || pageNo >= MAX_PAGES);
    return { records: slice.map(record), exhausted: last, next_cursor: last ? null : more ? `${pageNo}:${offset + PER_PAGE}` : `${pageNo + 1}:0` };
  } };
}
