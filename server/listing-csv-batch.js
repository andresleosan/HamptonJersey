import { fail, json, readJson } from './http.js';
import { checkCategory } from './listing-category.js';
import { checkPrice, ENUMS, validateListing } from './listing.js';

const clean = value => typeof value === 'string' ? value.trim() : '';
const textKey = value => clean(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const parishKeys = new Set(ENUMS.parish.map(textKey));
const ACTIVE = new Set(['available', 'available now', 'available off plan', 'for sale', 'to let', 'for rent', 'lease']);
const CLOSED = new Set(['publicacion cerrada', 'marcado no disponible', 'posible coincidencia']);

function urlKey(value) {
  if (!value || value.length > 1500 || /\s/.test(value)) return '';
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || !url.hostname.includes('.')) return '';
    const params = [...url.searchParams.keys()];
    for (const key of params) if (/^(?:utm_|gclid$|fbclid$|msclkid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/+$/, '') + url.search;
  } catch { return ''; }
}

function addressKey(value, parish) {
  const town = textKey(parish);
  let key = textKey(clean(value).replace(/^Scraping \d{1,2} [A-Za-z]+ \d{4}\s*[·:–-]\s*/i, ''))
    .replace(/\b(?:apartment|apt|flat|unit|house|plot|suite)(?: no)? (?=\d)/g, '');
  if (town && key.endsWith(` ${town}`)) key = key.slice(0, -town.length - 1);
  if (key.length < 4 || !/\p{L}/u.test(key) || parishKeys.has(key) || key === 'jersey') return '';
  return key;
}

function qualifiedAddress(value) {
  // A building name may stand alone, but a bare street or parish cannot identify a whole property.
  return value && (/\d/.test(value) || !/\b(?:road|street|lane|avenue|rue|route|chemin|clos|ruette|way|drive|hill|parade|place|terrace|estate)\b/.test(value));
}

function add(map, key, row) {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(row);
}

async function readExisting(env) {
  const queries = [
    `SELECT l.id,l.title,l.location,l.road_name,l.parish,l.description,d.building_name_or_number
       FROM listings l LEFT JOIN listing_details d ON d.listing_id=l.id`,
    'SELECT property_id AS id,url FROM research_sources WHERE url IS NOT NULL',
    'SELECT kind,identity,listing_id AS id FROM listing_csv_import_keys',
    `SELECT link.listing_id AS id, COALESCE(json_extract(observation.normalized_json,'$.url'),
       json_extract(observation.raw_json,'$.listing_url')) AS url
       FROM listing_market_links link JOIN market_observations observation ON observation.id=link.evidence_observation_id
       WHERE link.action='link' AND NOT EXISTS(SELECT 1 FROM listing_market_links undo WHERE undo.undoes=link.id)`,
  ];
  const [properties, sources, claims, market] = (await env.DB.batch(queries.map(sql => env.DB.prepare(sql)))).map(r => r.results);
  const listings = new Map(properties.map(row => [row.id, row]));
  const urls = new Map(), addresses = new Map(), titles = new Map();
  for (const row of properties) {
    add(titles, addressKey(row.title, row.parish), row.id);
    const exactAddresses = [row.location, row.building_name_or_number];
    if (row.building_name_or_number && row.road_name) exactAddresses.push(`${row.building_name_or_number} ${row.road_name}`);
    for (const value of exactAddresses) {
      const address = addressKey(value, row.parish);
      if (qualifiedAddress(address)) add(addresses, `${textKey(row.parish)}|${address}`, row.id);
    }
    for (const match of (row.description ?? '').matchAll(/^(?:Original listing|Source)[: \t]+(https?:\/\/\S+)[ \t]*$/gmi))
      add(urls, urlKey(match[1]), row.id);
  }
  for (const row of [...sources, ...market]) if (listings.has(row.id)) add(urls, urlKey(row.url), row.id);
  for (const claim of claims) add(claim.kind === 'url' ? urls : addresses, claim.identity, claim.id);
  return { listings, urls, addresses, titles };
}

function prepare(row, index) {
  const url = clean(row?.url), title = clean(row?.title), parish = clean(row?.parish), location = clean(row?.location);
  const identity = addressKey(row?.identity, parish), place = addressKey(location, parish), name = addressKey(title, parish);
  const keys = [...new Set([identity, place].filter(qualifiedAddress))].map(address => `${textKey(parish)}|${address}`);
  const source = clean(row?.source), status = textKey(row?.availability), priceQualifier = clean(row?.price_qualifier);
  const operation = clean(row?.operation), price = row?.price ?? null;
  const body = { title, parish, location, country: 'Jersey', use: clean(row?.use) || 'residential', operation,
    availability: operation === 'rent' ? 'to_let' : 'for_sale', currency: 'GBP', matchable: 0, viewings_enabled: 0,
    bedrooms: row?.bedrooms ?? null, bathrooms: row?.bathrooms ?? null,
    ...(operation === 'rent' ? { rent: price, rent_period: clean(row?.rent_period) || null } : { sale_price: price }),
    price_text: priceQualifier && price !== null ? `${priceQualifier} £${Number(price).toLocaleString('en-GB')}` : priceQualifier || null,
    description: [`Internal market reference. Advertised by ${source}. Source availability: ${clean(row?.availability)}.`,
      priceQualifier, `Original listing ${url}`].filter(Boolean).join('\n') };
  const validated = validateListing(body);
  const identifier = urlKey(url);
  const issues = !identifier ? 'Invalid source URL' : CLOSED.has(textKey(row?.csv_state)) ? 'Source closed or possible match' :
    row?.verified !== true ? 'Public address and availability require verification' :
    !qualifiedAddress(identity) || !qualifiedAddress(place) || !source || source.length > 120 ? 'Exact property address or source required' :
    !ACTIVE.has(status) ? 'Active source availability required' : !['sale','rent'].includes(operation) ? 'Check the operation' :
    operation === 'rent' && body.use === 'commercial' ? 'Listings does not support commercial rentals' :
    Object.keys(validated.errors ?? { ...checkCategory(validated.value), ...checkPrice(validated.value) }).length ? 'Check the price, rooms, address or category' : '';
  return { index, identifier, keys, name, parish, body, issues, code: clean(row?.hampton_code), group: textKey(row?.group) };
}

function classify(row, existing, duplicates) {
  const response = (status, reason, listingId) => ({ index: row.index, status, reason, ...(listingId ? { listingId } : {}) });
  const hits = new Set(existing.urls.get(row.identifier));
  for (const key of row.keys) for (const id of existing.addresses.get(key) ?? []) hits.add(id);
  const exactNames = row.keys.map(key => key.split('|')[1]);
  for (const name of exactNames) {
    for (const id of existing.titles.get(name) ?? []) {
      const candidateParish = existing.listings.get(id)?.parish;
      if (!candidateParish || !row.parish || textKey(candidateParish) === textKey(row.parish)) hits.add(id);
    }
  }
  if (hits.size > 1) return response('review', 'URL or address matches multiple listings');
  const [match] = hits;
  if (row.code && match !== row.code) return response('review', 'CSV listing code does not match the source evidence');
  if (match) return existing.listings.has(match) ? response('existing', 'Source URL or exact property already in Listings', match) :
    response('review', 'This import already had a listing that is now deleted');
  if (existing.titles.has(row.name)) return response('review', 'Matching title needs an exact address or source URL');
  if (row.issues) return response('review', row.issues);
  if ([row.identifier, ...row.keys, row.group && `group:${row.group}`].some(key => (duplicates.get(key)?.size ?? 0) > 1))
    return response('review', 'Repeated URL, address or property group in this file');
  return response('ready', 'Verified property not found in Listings');
}

export async function listingCsvBatch({ request, env, admin }, createListing) {
  const { mode, rows } = await readJson(request, 1024 * 1024) ?? {};
  if (!['preview','apply'].includes(mode) || !Array.isArray(rows) || !rows.length || rows.length > (mode === 'apply' ? 10 : 650))
    fail(400, 'Provide up to 650 rows for preview or 10 rows for import');
  const prepared = rows.map(prepare);
  const duplicates = new Map();
  for (const row of prepared) {
    for (const key of [row.identifier, ...row.keys, row.group && `group:${row.group}`]) add(duplicates, key, row.index);
  }
  let existing = await readExisting(env);
  const results = [];
  for (const row of prepared) {
    const result = classify(row, existing, duplicates);
    if (mode === 'preview' || result.status !== 'ready') { results.push(result); continue; }
    try {
      const receipt = await createListing(env, admin, row.body, { csvImport: { url: row.identifier, addresses: row.keys } });
      if (!receipt.ok) {
        results.push({ ...result, status: 'review', reason: 'The listing validator rejected this row' });
        continue;
      }
      const { id } = await receipt.json();
      existing.listings.set(id, row.body);
      add(existing.urls, row.identifier, id);
      for (const key of row.keys) add(existing.addresses, key, id);
      add(existing.titles, row.name, id);
      results.push({ ...result, status: 'created', reason: 'Draft created', listingId: id });
    } catch (error) {
      if (!/UNIQUE constraint failed: listing_csv_import_keys\./i.test(String(error?.message))) throw error;
      existing = await readExisting(env);
      results.push(classify(row, existing, duplicates));
    }
  }
  return json({ results });
}
