// EST-19: the trash of properties confirmed not available, and the purge of their photos six calendar months later.
// The trash is not a table: a property is in it while the confirmation in force for its operation says not available
// (EST-15/EST-16, migrations 0072/0076), from that confirmation's date, with its reason and scope. Restoring it is a
// new confirmation that it is available, with its evidence, recorded by a person (EST-16's form).
// The purge deletes only what D10 and the master plan allow: photos and their thumbnails, never documents, floor plans,
// history or files still in use. Of those, only the external reference copies (origin 'external'), never Hampton's own
// media (EST-19 spec §5), and not the cover, a private document (PUB-11), a file another row shares, a file a capture
// keeps (SPR-03) or a photo reviewed for clients (AGE-10); nothing of a property still published or with a sale, an open
// offer, a tenancy or a rental closure in progress. The panel shows what it would delete and when; a person starts it
// (EST19_PURGE_READY), at most PURGE_BATCH photos per click, storage first, then the rows and one event per property
// with the ids of what went (no personal data). A failure leaves the rows, so the next click finishes it once.
// Nothing here touches the listing, its confirmations, captures, enquiries, viewings or any person.
import { json, fail, now } from "./http.js";
import { unavailabilityReady, standsUnavailable } from "./property-facts.js";
import { PRIVATE_DOCS } from "./listing-documents.js";
import { noUnresolvedRentalClosureSql } from "./rental-closure.js";
import { jerseyToday } from "./viewings.js";

export const trashReady = env => env?.EST19_TRASH_READY === "1" && unavailabilityReady(env);
export const purgeReady = env => trashReady(env) && env?.EST19_PURGE_READY === "1";
// 20 photos and their thumbnails: 40 files in one storage call per click (the free plan allows 50 subrequests).
export const PURGE_BATCH = 20;

function canonicalInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

// Same gap/fold resolution as BUS-17, with a six-calendar-month wall target. One formatter for every call.
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Jersey', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function deadline(start) {
  const wall = ms => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    const y = Number(p.year), m = Number(p.month), d = Number(p.day);
    if (y < 100 || y > 9998 || !m || !d) return null;
    return Date.UTC(y, m - 1, d, Number(p.hour), Number(p.minute), Number(p.second), ((ms % 1000) + 1000) % 1000);
  };
  const local = wall(start);
  if (local === null) return null;
  const date = new Date(local), month = date.getUTCMonth() + 6;
  const year = date.getUTCFullYear() + Math.floor(month / 12), normalized = month % 12;
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, normalized + 1, 0)).getUTCDate());
  const target = Date.UTC(year, normalized, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
  // Jersey is on GMT or BST (+1 h), so the wall target falls at target - 1 h or target: the first one in the autumn
  // fold. In the spring gap neither matches, and the first valid instant is the change of offset between the two.
  // (Two or three clock reads per property, not a 96-hour scan: a page of 50 must fit the Worker's 10 ms of CPU.)
  const matches = [target - 3600000, target].filter(ms => wall(ms) === target);
  if (matches.length) return matches[0];
  const offsetAt = ms => { const value = wall(ms); return value === null ? null : value - ms; };
  let lo = target - 3600000, hi = target;
  const before = offsetAt(lo), after = offsetAt(hi);
  if (before === null || after === null || before === after) return null;
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2), offset = offsetAt(mid);
    if (offset === before) lo = mid;
    else if (offset === after) hi = mid;
    else return null;
  }
  const prior = wall(hi - 1), next = wall(hi);
  return prior !== null && next !== null && prior < target && next > target ? hi : null;
}

// The instant six calendar months (Jersey wall time, capped at the month's end) after enteredAt, or null when it
// cannot be worked out: then nothing is due.
export function purgeDueAt(enteredAt) {
  const entered = canonicalInstant(enteredAt);
  if (entered === null) return null;
  try { const due = deadline(entered); return due === null ? null : new Date(due).toISOString(); } catch { return null; }
}

// Each property in the trash, with what holds its files (held: NULL when nothing does). ? = the Jersey date.
const TRASH = `trash AS (SELECT l.id, l.title, l.operation, l.availability, l.archived_at, l.cover_media_id, MAX(c.confirmed_at) AS entered_at, c.reason,
    CASE WHEN c.operation IS NULL THEN 'property' ELSE 'operation' END AS scope,
    CASE WHEN l.published = 1 THEN 'published'
      WHEN EXISTS (SELECT 1 FROM sales s WHERE s.listing_id = l.id AND s.status = 'in_progress') THEN 'sale'
      WHEN EXISTS (SELECT 1 FROM offers o WHERE o.listing_id = l.id AND o.status IN ('pending', 'countered')) THEN 'offer'
      WHEN EXISTS (SELECT 1 FROM tenancy_origins o JOIN tenancies y ON y.id = o.tenancy_id WHERE o.listing_id = l.id
        AND (y.ended_on IS NULL OR y.ended_on >= ?)) THEN 'tenancy'
      WHEN NOT ${noUnresolvedRentalClosureSql("l")} THEN 'closure' END AS held
  FROM listings l JOIN availability_confirmations c ON c.listing_id = l.id AND (c.operation IS NULL OR c.operation = l.operation)
    AND ${standsUnavailable("c", "l.operation")} GROUP BY l.id),
  shared AS (SELECT k FROM (SELECT r2_key AS k FROM media UNION ALL SELECT thumb_key FROM media)
    WHERE k IS NOT NULL AND k <> '' GROUP BY k HAVING COUNT(*) > 1),
  captured AS (SELECT blob_key AS k FROM property_capture_assets WHERE blob_key IS NOT NULL)`;
const N = PRIVATE_DOCS.length;
// A media row m of trash t that the purge may delete once t is due.
const PURGEABLE = `(t.held IS NULL AND m.kind = 'photo' AND m.origin = 'external' AND COALESCE(m.r2_key, '') <> ''
  AND m.id IS NOT t.cover_media_id
  AND substr(m.r2_key, 1, ${N}) <> '${PRIVATE_DOCS}' AND COALESCE(substr(m.thumb_key, 1, ${N}), '') <> '${PRIVATE_DOCS}'
  AND m.r2_key NOT IN (SELECT k FROM shared) AND COALESCE(m.thumb_key, '') NOT IN (SELECT k FROM shared)
  AND m.r2_key NOT IN (SELECT k FROM captured) AND COALESCE(m.thumb_key, '') NOT IN (SELECT k FROM captured)
  AND NOT EXISTS (SELECT 1 FROM image_permissions p WHERE p.media_id = m.id))`;

// The oldest 50 in the trash, each with when its photos are due and how many would go; reading deletes nothing.
async function view(env) {
  const ts = now(), { results } = await env.DB.prepare(`WITH ${TRASH}
    SELECT t.id, t.title, t.operation, t.availability, t.archived_at, t.entered_at, t.reason, t.scope, t.held,
      (SELECT COUNT(*) FROM media m WHERE m.listing_id = t.id AND ${PURGEABLE}) AS photos,
      (SELECT COUNT(*) FROM media m WHERE m.listing_id = t.id) AS files
    FROM trash t ORDER BY t.entered_at, t.id LIMIT 50`).bind(jerseyToday()).all();
  const listings = results.map(({ files, ...t }) => {
    const due_at = purgeDueAt(t.entered_at);
    return { ...t, kept: files - t.photos, due_at, due: Boolean(due_at && due_at <= ts) };
  });
  return { enabled: true, purge: purgeReady(env), listings,
    due_photos: listings.reduce((n, t) => n + (t.due ? t.photos : 0), 0) };
}

async function list({ env }) {
  return json(trashReady(env) ? await view(env) : { enabled: false });
}

// One click: the oldest due photos, at most PURGE_BATCH, read again here (never from the request).
async function purge({ env, admin }) {
  if (!purgeReady(env)) fail(404, "Not found");
  const ts = now(), { results } = await env.DB.prepare(`WITH ${TRASH}
    SELECT m.id, m.listing_id, m.r2_key, m.thumb_key, t.entered_at FROM trash t JOIN media m ON m.listing_id = t.id
    WHERE ${PURGEABLE} ORDER BY t.entered_at, t.id, m.position, m.id LIMIT ${PURGE_BATCH}`).bind(jerseyToday()).all();
  const dueAt = new Map(), isDue = at => {
    if (!dueAt.has(at)) dueAt.set(at, purgeDueAt(at));
    return Boolean(dueAt.get(at) && dueAt.get(at) <= ts);
  };
  const gone = results.filter(m => isDue(m.entered_at));
  if (gone.length) {
    await env.MEDIA.delete(gone.flatMap(m => [m.r2_key, m.thumb_key]).filter(Boolean));
    const byListing = new Map();
    for (const m of gone) byListing.set(m.listing_id, [...(byListing.get(m.listing_id) ?? []), m]);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM media WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(gone.map(m => m.id))),
      ...[...byListing].map(([id, ms]) => env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
        VALUES (?, ?, 'listing', ?, 'listing.photos_purged', json_object('version', 1, 'fields', json('[]'),
          'media_ids', json(?), 'entered_at', ?))`).bind(ts, admin, id, JSON.stringify(ms.map(m => m.id)), ms[0].entered_at)),
    ]);
  }
  return json({ ...await view(env), deleted: gone.length });
}

export default [
  ["GET", /^\/admin\/trash$/, list, true],
  ["POST", /^\/admin\/trash\/purge$/, purge, true],
];
