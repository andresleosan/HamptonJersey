// BUS-09: automatic reader for Keys Properties (keys.je). Two requests a pass, both under the reviewed root: the HTML
// sitemap (/sitemap.aspx) lists the adverts that are live today, and the site's RSS feed gives each one's title
// ("3 Bedroom Apartment, St Helier £2,336.00") and link. The feed keeps adverts already gone, so only those on the
// sitemap are kept. Facts only: rooms, parish, price and link; no descriptions, no photos, no detail pages.
import { SourceReadError } from '../market-daily-sweep.js';
import { fetchAllowed } from './fetch.js';

const PER_PAGE = 10, HOST_RE = /^(?:www\.)?keys\.je$/;
const TITLE = /^(\d{1,2}) Bedroom ([^,]{1,60}), ([^£]{1,60}?) £([\d,]+(?:\.\d{1,2})?)$/;
const unxml = s => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&pound;/g, '£').trim();

export function parseKeys(rssXml, sitemapHtml) {
  const live = new Set([...sitemapHtml.matchAll(/pi-adkp(\d+)\.htm/gi)].map(m => m[1])), items = [];
  for (const [, body] of rssXml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = /<title>([\s\S]*?)<\/title>/.exec(body), link = /<link>\s*(https:\/\/www\.keys\.je\/Property-For-(Rent|Sale)-[^<\s]*?-pi-ADKP(\d+)\.htm)\s*<\/link>/i.exec(body);
    const t = title && TITLE.exec(unxml(title[1]));
    if (!link || !t || !live.has(link[3])) continue; // gone, or not a home with bedrooms (a garage, a plot)
    const operation = link[2].toLowerCase() === 'rent' ? 'rent' : 'sale', raw = `£${t[4]}`;
    items.push({ id: link[3], url: link[1], operation, title: `${t[1]} bedroom ${t[2].toLowerCase()}, ${t[3]}`, parish: t[3].trim(),
      bedrooms: Number(t[1]), financial_terms: [{ kind: operation === 'rent' ? 'rent' : 'sale_price',
        amount_minor: Math.round(parseFloat(t[4].replace(/,/g, '')) * 100), currency: 'GBP',
        // ponytail: Keys quotes rents per calendar month (its pages say "pcm"); the feed drops the unit.
        period: operation === 'rent' ? 'month' : 'sale', raw_text: raw }] });
  }
  return items;
}

const record = i => ({ external_key: `keys:${i.id}`, raw: { listing_url: i.url, price_text: i.financial_terms[0].raw_text },
  observation: { country_code: 'JE', territory_evidence: `Keys Properties listing in Jersey: ${i.parish}`, operation: i.operation,
    title: i.title, parish: i.parish, bedrooms: i.bedrooms, financial_terms: i.financial_terms } });

export function keysReader({ fetchImpl = fetch } = {}) {
  return { async readPage({ cursor, allowed_hosts, allowed_paths, signal }) {
    const host = allowed_hosts?.find(h => HOST_RE.test(h));
    if (!host || !allowed_paths?.length) throw new SourceReadError('access_denied');
    // ponytail: a channel reviewed on one sub-page (St Helier rents) is a subset of the root channel, which reads it all.
    if (!allowed_paths.includes('/')) return { records: [], exhausted: true, next_cursor: null };
    const offset = cursor == null ? 0 : /^\d{1,3}$/.test(cursor) ? Number(cursor) : NaN;
    if (!Number.isInteger(offset)) throw new SourceReadError('invalid_response');
    const sitemap = await fetchAllowed(fetchImpl, `https://${host}/sitemap.aspx`, { host, path: '/', signal });
    const feed = await fetchAllowed(fetchImpl, `https://${host}/images/ADKP/rss.xml`, { host, path: '/', signal });
    const items = parseKeys(feed, sitemap);
    if (!items.length) throw new SourceReadError('invalid_response');
    const more = offset + PER_PAGE < items.length;
    return { records: items.slice(offset, offset + PER_PAGE).map(record), exhausted: !more, next_cursor: more ? String(offset + PER_PAGE) : null };
  } };
}
