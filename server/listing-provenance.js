// BUS-07 / SPR-07: where each Hampton listing comes from, and its optional link to a home of the market inventory.
// Staff only. Off (BUS07_PROVENANCE_READY) every read and route is as before: the list has no new field and these
// routes answer 404.
// Provenance is derived from what already exists and is corrected in the Advertisers directory (AGE-04): a listing is
// co-listed when an advertiser of the directory advertises it, itself or through one of its research sources (the
// same rule as AGE-03's recipients), or when it came in the agency import of 8 Oct 2026 (its imported photos name the
// agency; HE-R028 to HE-R285, migration 0009). Otherwise it is Hampton's. Nothing here grants a permission: the photo
// permission recorded with the import is shown as it was recorded and covers those photos only (AGE-10 for new ones).
// The link (migration 0081, and BUS10_IDENTITY_READY) is a person's decision, undone by another row. It merges no home,
// changes no listing, match or observation and says nothing about availability: EST-16 remains the confirmation.
import { json, fail, readJson, now } from './http.js';
import { OPEN_ADVERT, homeOfObservation, readLinkedPublications, readMarketPublications } from './market-identity.js';
import { availabilityReady, confirmationReader } from './availability-confirmations.js';
import { listingAmount } from './listing-pricing.js';

export const provenanceReady = env => env?.BUS07_PROVENANCE_READY === '1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 864e5;
const missing = e => /no such table/.test(e?.message ?? '');
// The import range of migration 0009: three digits only, so HE-R1000 is not in it.
const imported = id => /^HE-R\d{3}$/.test(id) && +id.slice(4) >= 28 && +id.slice(4) <= 285;
const STANDING = `k.action='link' AND NOT EXISTS (SELECT 1 FROM listing_market_links u WHERE u.undoes=k.id)`;

// Linking needs the link table and BUS-10's identity; reading provenance needs neither.
async function linking(env) {
  if (!provenanceReady(env) || env.BUS10_IDENTITY_READY !== '1') return false;
  try { await env.DB.prepare('SELECT 1 FROM listing_market_links LIMIT 0').all(); return true; }
  catch (e) { if (missing(e)) return false; throw e; }
}

// ids: null for every listing. Advertisers of the directory and photos of the agency import, per listing.
function originStatements(env, ids) {
  const only = col => ids ? ` AND ${col} IN (${ids.map(() => '?').join(',')})` : '';
  return [
    env.DB.prepare(`SELECT listing_id,id,name,photo_permission FROM (
        SELECT j.value AS listing_id,a.id,a.name,json_extract(a.details,'$.photo_permission') AS photo_permission
          FROM advertisers a JOIN json_each(a.details,'$.listing_ids') j WHERE a.suppressed_at IS NULL
        UNION SELECT s.property_id,a.id,a.name,json_extract(a.details,'$.photo_permission') FROM advertisers a
          JOIN json_each(a.details,'$.source_ids') j JOIN research_sources s ON s.source_id=j.value WHERE a.suppressed_at IS NULL)
      WHERE 1${only('listing_id')} ORDER BY listing_id,name COLLATE NOCASE,id`).bind(...(ids ?? [])),
    env.DB.prepare(`SELECT listing_id,provider,rights_status,COUNT(*) AS photos FROM media
      WHERE origin='upload' AND created_by='import' AND provider IS NOT NULL${only('listing_id')}
      GROUP BY listing_id,provider,rights_status ORDER BY listing_id,provider`).bind(...(ids ?? [])),
  ];
}
const byListing = rows => rows.reduce((m, r) => m.set(r.listing_id, [...(m.get(r.listing_id) ?? []), r]), new Map());

// "Hampton", or "Co-listed" with who advertises it: the directory's advertisers when there are any (one whose personal
// data was removed, AGE-14, no longer counts, as for AGE-03's recipients), else the agency
// the import named (or none recorded). basis says which.
function provenanceOf(id, advertisers = [], photos = []) {
  const agencies = [...new Set(photos.map(p => p.provider))];
  if (advertisers.length) return { kind: 'co_listed', basis: 'directory', advertisers: advertisers.map(({ id, name }) => ({ id, name })),
    labels: advertisers.map(a => a.name) };
  if (agencies.length || imported(id)) return { kind: 'co_listed', basis: 'import', advertisers: [], labels: agencies };
  return { kind: 'hampton', basis: null, advertisers: [], labels: [] };
}

// SAP-09: one listing's provenance, read whatever the switch (reading needs no table), for the server's own booking rules.
export async function listingProvenance(env, id) {
  const [advertisers, photos] = (await env.DB.batch(originStatements(env, [id]))).map(r => r.results);
  return provenanceOf(id, advertisers, photos);
}

// SPR-07: a change of price or availability, from the before and after the history keeps. A period change that keeps
// the monthly equivalent (£24,000 a year to £2,000 a month) is not one; a save that changed neither is not one.
// A business has two prices compared each on its own, never summed: its premium and its rent per month.
const PER_MONTH = { week: 52 / 12, year: 1 / 12 };
const pence = amount => amount == null ? null : Math.round(amount * 100);
const monthlyRent = l => l.rent == null ? null : l.rent * (PER_MONTH[l.rent_period] ?? 1);
const prices = l => JSON.stringify(l.operation === 'rent' ? [pence(monthlyRent(l))]
  : l.operation === 'business' ? [pence(l.premium), pence(monthlyRent(l))] : [pence(listingAmount(l))]);
export function materialChange(data, current) {
  const before = data?.before, after = data?.after;
  if (!before || !after) return true; // an older event without its values: it named a price or availability field
  if (Object.hasOwn(after, 'availability') && before.availability !== after.availability) return true;
  const was = { ...current, ...before }, is = { ...current, ...after };
  return prices(was) !== prices(is) || (was.currency ?? null) !== (is.currency ?? null);
}
const MATERIAL = ['availability', 'sale_price', 'rent', 'rent_period', 'premium', 'operation', 'currency'];

// The list's extra fields, read once for the whole page: source, the latest web sighting (research or a linked
// market home), the confirmation in force (EST-16) and the latest price or availability change of the last 7 days.
export async function listProvenance(env, rows) {
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const [advertisers, photos, research, changes] = (await env.DB.batch([...originStatements(env, null),
    env.DB.prepare(`SELECT property_id AS listing_id,MAX(substr(accessed_on,1,10)) AS seen FROM research_sources
      WHERE accessed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' GROUP BY property_id`),
    env.DB.prepare(`SELECT entity_id AS listing_id,at,data FROM events WHERE entity_type='listing' AND at>=? AND type<>'listing.created'
      AND EXISTS (SELECT 1 FROM json_each(data,'$.fields') f WHERE f.value IN (${MATERIAL.map(() => '?').join(',')}))
      ORDER BY at DESC`).bind(since, ...MATERIAL),
  ])).map(r => r.results);
  const ads = byListing(advertisers), pics = byListing(photos), seen = new Map(research.map(r => [r.listing_id, r.seen]));
  const linked = await linking(env) ? await readLinkedPublications(env, (await env.DB.prepare(`SELECT listing_id,property_id
    FROM listing_market_links k WHERE ${STANDING}`).all()).results.map(r => [r.listing_id, r.property_id])) : new Map();
  // ponytail: chunks of 90 ids for D1's 100 bound parameters, not one read per listing.
  const readers = availabilityReady(env) ? await Promise.all(Array.from({ length: Math.ceil(rows.length / 90) },
    (_, i) => confirmationReader(env, rows.slice(i * 90, i * 90 + 90).map(r => r.id)))) : null;
  const current = new Map(rows.map(r => [r.id, r]));
  const changed = new Map();
  for (const e of changes) if (!changed.has(e.listing_id) && current.has(e.listing_id)
    && materialChange(JSON.parse(e.data), current.get(e.listing_id))) changed.set(e.listing_id, e.at);
  return rows.map(r => {
    const web = [seen.get(r.id), ...(linked.get(r.id) ?? []).map(p => p.observed_at?.slice(0, 10))].filter(Boolean).sort().at(-1) ?? null;
    const found = readers?.reduce((hit, read) => hit ?? read(r), undefined);
    return { ...r, provenance: provenanceOf(r.id, ads.get(r.id), pics.get(r.id)), seen_at: web, material_change_at: changed.get(r.id) ?? null,
      ...(readers && { confirmed: found ? { status: found.status, confirmed_at: found.confirmed_at ?? null, source: found.source ?? null,
        ...(found.needs_review && { needs_review: true }) } : null }) };
  });
}

// One listing's provenance, its recorded photo permissions, its link and its linked home's adverts.
async function answer(env, id, status = 200) {
  const [[listing], advertisers, photos] = (await env.DB.batch([
    env.DB.prepare('SELECT id,operation,parish,bedrooms FROM listings WHERE id=?').bind(id), ...originStatements(env, [id])])).map(r => r.results);
  if (!listing) fail(404, 'Listing not found');
  const can = await linking(env);
  let history = [], link = null, publications = [];
  if (can) {
    history = (await env.DB.prepare(`SELECT id,action,property_id,undoes,actor,created_at FROM listing_market_links
      WHERE listing_id=? ORDER BY created_at DESC,id DESC LIMIT 20`).bind(id).all()).results;
    link = await env.DB.prepare(`SELECT id,property_id,actor AS linked_by,created_at AS linked_at FROM listing_market_links k
      WHERE k.listing_id=? AND ${STANDING}`).bind(id).first();
    if (link) publications = (await readLinkedPublications(env, [[id, link.property_id]])).get(id) ?? [];
  }
  // operation: SAP-09's New viewing checks it fits the search it books for.
  return json({ provenance: provenanceOf(id, advertisers, photos), operation: listing.operation,
    authorizations: [...photos.map(p => ({ by: p.provider, permission: p.rights_status, photos: p.photos, basis: 'import' })),
      ...advertisers.filter(a => a.photo_permission).map(a => ({ by: a.name, permission: a.photo_permission, basis: 'directory' }))],
    linking: can, link, history, publications }, status, { 'cache-control': 'private, no-store' });
}

const on = env => { if (!provenanceReady(env)) fail(404, 'Not found'); };
const canLink = async env => { if (!(await linking(env))) fail(404, 'Not found'); };

// The adverts of the market inventory a person may link this listing to: its operation, its parish and bedrooms first.
async function candidates({ env, params: [id] }) {
  on(env); await canLink(env);
  const listing = await env.DB.prepare('SELECT operation,parish,bedrooms FROM listings WHERE id=?').bind(id).first();
  if (!listing) fail(404, 'Listing not found');
  if (!['sale', 'rent', 'business'].includes(listing.operation)) return json({ publications: [] });
  const plain = t => (t ?? '').toLowerCase().replace(/\bsaint\b/g, 'st').replace(/[^a-z0-9]+/g, ' ').trim();
  const near = p => (plain(p.parish) === plain(listing.parish) && plain(p.parish) ? 2 : 0) + (p.bedrooms === listing.bedrooms ? 1 : 0);
  // ponytail: the 50 nearest of the latest 2000 adverts; a search box if the inventory ever outgrows that.
  const publications = await readMarketPublications(env, listing.operation);
  return json({ publications: publications.map(p => ({ p, n: near(p) })).sort((a, b) => b.n - a.n).slice(0, 50).map(x => x.p) },
    200, { 'cache-control': 'private, no-store' });
}

// A retried click gets what it already did; the same operation for anything else is refused.
async function replayed(env, operation, actor, id, check) {
  const row = await env.DB.prepare('SELECT * FROM listing_market_links WHERE operation_id=?').bind(operation).first();
  if (!row) return false;
  if (row.actor !== actor || row.listing_id !== id || !check(row)) fail(409, 'That request was already used for something else. Reload and try again.');
  return true;
}
const unique = e => /UNIQUE constraint failed: listing_market_links/i.test(String(e?.message));

async function link({ request, env, admin, params: [id] }) {
  on(env); await canLink(env);
  const body = await readJson(request);
  if (!UUID.test(body?.observation_id ?? '') || !UUID.test(body?.operation_id ?? '')) fail(400, 'Choose an advert and try again');
  const same = row => row.action === 'link' && row.evidence_observation_id === body.observation_id;
  if (await replayed(env, body.operation_id, admin, id, same)) return answer(env, id);
  // The advert's source is open now and it offers the listing's operation: asked before anything is opened, and again
  // in the link's own write, since an advert that already has a home is not read again by homeOfObservation.
  const listing = await env.DB.prepare('SELECT operation FROM listings WHERE id=?').bind(id).first();
  if (!listing) fail(404, 'Listing not found');
  const closed = 'This advert cannot be linked: its source is not open now, or it is not for this listing\'s operation. Reload and choose another.';
  if (!(await env.DB.prepare(`SELECT ${OPEN_ADVERT} AS open`).bind(body.observation_id, listing.operation).first()).open) fail(409, closed);
  const { property_id } = await homeOfObservation(env, body.observation_id, admin);
  let done;
  try {
    done = await env.DB.prepare(`INSERT INTO listing_market_links(id,operation_id,action,listing_id,property_id,evidence_observation_id,actor,created_at)
      SELECT ?,?,'link',l.id,?,?,?,? FROM listings l WHERE l.id=? AND l.operation=? AND EXISTS (SELECT 1 FROM admins WHERE email=?)
        AND ${OPEN_ADVERT} AND NOT EXISTS (SELECT 1 FROM listing_market_links k WHERE k.listing_id=l.id AND ${STANDING})`)
      .bind(crypto.randomUUID(), body.operation_id, property_id, body.observation_id, admin, now(), id, listing.operation, admin,
        body.observation_id, listing.operation).run();
  } catch (e) {
    if (unique(e) && await replayed(env, body.operation_id, admin, id, same)) return answer(env, id);
    throw e;
  }
  if (!done.meta.changes) {
    if (!(await env.DB.prepare('SELECT 1 FROM listings WHERE id=?').bind(id).first())) fail(404, 'Listing not found');
    if (await env.DB.prepare(`SELECT 1 FROM listing_market_links k WHERE k.listing_id=? AND ${STANDING}`).bind(id).first())
      fail(409, 'This listing is already linked to a market home. Reload to see it.');
    fail(409, closed);
  }
  return answer(env, id, 201);
}

async function unlink({ request, env, admin, params: [id] }) {
  on(env); await canLink(env);
  const body = await readJson(request);
  if (!UUID.test(body?.link_id ?? '') || !UUID.test(body?.operation_id ?? '')) fail(400, 'Reload and try again');
  const same = row => row.action === 'unlink' && row.undoes === body.link_id;
  if (await replayed(env, body.operation_id, admin, id, same)) return answer(env, id);
  let done;
  try {
    done = await env.DB.prepare(`INSERT INTO listing_market_links(id,operation_id,action,listing_id,property_id,undoes,actor,created_at)
      SELECT ?,?,'unlink',k.listing_id,k.property_id,k.id,?,? FROM listing_market_links k
      WHERE k.id=? AND k.listing_id=? AND ${STANDING} AND EXISTS (SELECT 1 FROM admins WHERE email=?)`)
      .bind(crypto.randomUUID(), body.operation_id, admin, now(), body.link_id, id, admin).run();
  } catch (e) {
    if (unique(e) && await replayed(env, body.operation_id, admin, id, same)) return answer(env, id);
    if (unique(e)) fail(409, 'This link was already undone. Reload to see it.');
    throw e;
  }
  if (!done.meta.changes) fail(409, 'This link was already undone. Reload to see it.');
  return answer(env, id);
}

const LID = '(HE-[A-Z]\\d{3,})';
export default [
  ['GET', new RegExp(`^/admin/listings/${LID}/provenance$`), ({ env, params: [id] }) => { on(env); return answer(env, id); }, true],
  ['GET', new RegExp(`^/admin/listings/${LID}/market-candidates$`), candidates, true],
  ['POST', new RegExp(`^/admin/listings/${LID}/market-link$`), link, true],
  ['POST', new RegExp(`^/admin/listings/${LID}/market-link/undo$`), unlink, true],
];
