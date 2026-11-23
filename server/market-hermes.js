// BUS-09: Hermes's adverts as the daily sweep's reader records (contract "Advert" and "Mapping in the door"). Pure: an
// advert off its channel's hosts or paths, or without what a record needs, is left out (null). Facts only: never a
// description, photo, name, phone or email, whatever Hermes sends.
import { OPTIONS } from './applicants.js';

const PARISH = new Map(OPTIONS.parishes.map(([p]) => [p.toLowerCase(), p]));
const bare = host => host.toLowerCase().replace(/^www\./, '');
const count = v => Number.isInteger(v) && v >= 0 && v < 30 ? v : null;

// The listing's identity: https, host lowercase without www., no query or fragment, no trailing slash.
export function normaliseUrl(value) {
  let u; try { u = new URL(value); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  return `https://${bare(u.hostname)}${u.pathname.replace(/\/+$/, '')}`;
}

const onChannel = (url, hosts, paths) => {
  const u = new URL(url);
  return hosts.some(h => bare(h) === bare(u.hostname)) &&
    paths.some(p => p === '/' || u.pathname === p || u.pathname.startsWith(p.endsWith('/') ? p : `${p}/`));
};

// "£1,950 pcm" and the like, as BUS-09 financial terms. A period makes it rent; a sale without one is the price.
export function parsePrice(text, operation) {
  const m = typeof text === 'string' && /£\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(text);
  if (!m) return []; // POA, "Price on application", nothing readable
  const t = text.toLowerCase(), amount = Number(m[1].replace(/,/g, '')) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  const period = /\b(?:pcm|pm|per (?:calendar )?month)\b|\d(?:pcm|pm)\b/.test(t) ? 'month' : /\b(?:pw|per week)\b|\dpw\b/.test(t) ? 'week'
    : /\b(?:pa|per (?:annum|year))\b|\dpa\b/.test(t) ? 'year' : null;
  if (!Number.isSafeInteger(amount) || amount <= 0) return [];
  // ponytail: a let quoted without a period keeps its amount with period "unknown" (no monthly figure), not a guess.
  const kind = period || operation === 'rent' ? 'rent' : 'sale_price';
  return [{ kind, amount_minor: amount, currency: 'GBP', period: period ?? (kind === 'rent' ? 'unknown' : 'sale'), raw_text: text }];
}

// { url (normalised), raw, observation } or null.
export function advertRecord(a, hosts, paths) {
  if (!a || typeof a !== 'object' || Array.isArray(a) || typeof a.listing_url !== 'string' || a.listing_url.length > 2048) return null;
  const url = normaliseUrl(a.listing_url);
  if (!url || !onChannel(a.listing_url, hosts, paths) || !['rent', 'sale'].includes(a.operation) ||
      !['residential', 'commercial'].includes(a.use)) return null;
  const price = typeof a.price_text === 'string' && a.price_text.length <= 200 ? a.price_text : null;
  const parish = typeof a.parish === 'string' ? PARISH.get(a.parish.trim().toLowerCase()) ?? null : null;
  const title = typeof a.title === 'string' && a.title.trim() ? a.title.trim().slice(0, 120) : null;
  return { url, raw: { listing_url: a.listing_url, price_text: price },
    observation: { country_code: 'JE', territory_evidence: `Advert on ${bare(new URL(url).hostname)}${parish ? `: ${parish}` : ''}`,
      operation: a.operation, title, parish, bedrooms: count(a.bedrooms), bathrooms: count(a.bathrooms),
      ...(a.parking === true && { parking: true }), use: a.use,
      ...(typeof a.area_sqft === 'number' && Number.isFinite(a.area_sqft) && a.area_sqft > 0 && { area_sqft: a.area_sqft }),
      financial_terms: parsePrice(price, a.operation) } };
}
