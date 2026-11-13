import { validSearchAction } from "../measurement-dimensions.js";
import { CONTACT_NEXT_VERSION } from "../contact-version.js";
import { json, fail, HttpError, readJson, now } from "../http.js";
import { toPublic } from "../listing.js";
import { buildPublicAddressReview, addressAppearsInPublicContent, addressDetailsFromListing } from "../public-address.js";
import { validateViewing, jerseyNow, jerseyToday, isFree, realDate, plusDays, SLOT_MINUTES, PUBLIC_DAYS, MAX_DAYS,
  interestSql, interestDates } from "../viewings.js";
import { loadAvailability, bookStatement, PUBLIC_BOOKING_BLOCKED_SQL } from "../viewing-store.js";
import { verifyTurnstile } from "../turnstile.js";
import { logEvent } from "../events.js";
import { validateApplicant, OPTIONS } from "../applicants.js";
import { afterSave, recomputeForApplicant } from "../match-store.js";
import { touchByViewing } from "../retention.js";
import { chatOn } from "../chat.js";
import { confirmedViewingSql, confirmedViewingWindow } from "../public-viewing-summary.js";
import { contentFromStored } from '../listing-content.js';

export const groupBy = (rows, key) => rows.reduce((a, r) => ((a[r[key]] ||= []).push(r), a), {});

const LIVE = "l.published = 1 AND l.archived_at IS NULL";

// Review the exact snapshot read by the caller. Shared with staff Insights so that a listing
// hidden by address privacy cannot reappear there. Callers must not serialize its private row.
export async function reviewPublicListing(env, l, publicMedia) {
  const contentEnabled = env.PUB08_CONTENT_READY === '1';
  let visible = { ...l, public_address_snapshot: null,
    ...(contentEnabled ? {_pub08_content:contentFromStored(l.pub08_tags,l.pub08_video_url)} : {}) };
  let authorized = false;
  if (l.public_address_snapshot && l.public_address_snapshot_hash) {
    const review = await buildPublicAddressReview(visible, addressDetailsFromListing(l), publicMedia, l.drive_folder_name,
      env.SITE_URL || 'https://hampton.test');
    if (review.address === l.public_address_snapshot && review.public_snapshot_hash === l.public_address_snapshot_hash) {
      visible = { ...visible, public_address_snapshot: l.public_address_snapshot };
      authorized = true;
    }
  }
  const privateShape = toPublic(visible, publicMedia);
  if (!authorized && addressAppearsInPublicContent(l, addressDetailsFromListing(l), privateShape)) return null;
  return { row: l, pub: privateShape };
}

// The live listings, all or the one with that id, each as its row (with its active interest, C10) and its public
// shape: one D1 round trip (S2).
export async function readLive(env, id, { viewingClock } = {}) {
  const window = viewingClock ? confirmedViewingWindow(viewingClock) : null;
  const one = id ? " AND l.id = ?" : "", args = id ? [id] : [], interest = interestDates();
  const contentEnabled=env.PUB08_CONTENT_READY === '1';
  const queries = () => [
    env.DB.prepare(`SELECT l.*, d.building_name_or_number,d.postcode,d.public_address_snapshot,d.public_address_snapshot_hash,
      ${contentEnabled ? 'c.tags AS pub08_tags,c.video_url AS pub08_video_url,' : ''}
      (SELECT folder_name FROM drive_imports di WHERE di.folder_id=l.drive_folder_id ORDER BY di.id DESC LIMIT 1) AS drive_folder_name,
      (${interestSql("l.id")}) AS active_interest${window ? `, (${confirmedViewingSql("l.id")}) AS confirmed_viewings` : ""}
      FROM listings l LEFT JOIN listing_details d ON d.listing_id=l.id
      ${contentEnabled ? 'LEFT JOIN listing_content c ON c.listing_id=l.id' : ''} WHERE ${LIVE}${one} ORDER BY l.id`)
      .bind(...interest, ...(window?.binds ?? []), ...args),
    env.DB.prepare(`SELECT m.* FROM media m JOIN listings l ON l.id = m.listing_id
     WHERE ${LIVE} AND m.public = 1${one} ORDER BY m.position, m.id`).bind(...args),
  ];
  const [{ results: listings }, { results: media }] = await env.DB.batch(queries());
  const by = groupBy(media, "listing_id");
  const reviewed = await Promise.all(listings.map(l => reviewPublicListing(env, l, by[l.id] || [])));
  if (window) {
    // Address review hashes asynchronously. Fail closed if any public input or count changed while it ran.
    const [currentListings, currentMedia] = await env.DB.batch(queries());
    const currentClock = jerseyNow();
    if (JSON.stringify(currentListings.results) !== JSON.stringify(listings) ||
        JSON.stringify(currentMedia.results) !== JSON.stringify(media) ||
        currentClock.date !== viewingClock.date || currentClock.time !== viewingClock.time)
      fail(503, "Availability changed. Please try again.");
  }
  return reviewed.filter(Boolean);
}
const listPublic = async ({ env }) => {
  const listings = (await readLive(env)).map(x => x.pub);
  // Visibility can change independently of a visitor's next request. Instruct
  // caches not to retain new catalogue responses while ANA-10 / PUB-16 are prepared.
  return json(listings, 200, { "cache-control": "no-store" });
};

// chat: whether the website offers new chats (MSG-02, C3); with the cache, a change shows within 5 minutes.
const config = async ({ request, env }) => json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY, chat: await chatOn(env, request) }, 200,
  { "cache-control": "public, max-age=300" });

// ?from=YYYY-MM-DD&days=N of an availability request, shared with the panel's (which starts from today).
export function availabilityRange(q, defaultFrom) {
  const from = q.get("from") ?? defaultFrom, days = q.get("days") ?? String(PUBLIC_DAYS);
  if (!realDate(from) || !/^\d+$/.test(days) || +days < 1 || +days > MAX_DAYS)
    fail(400, `Choose a date (YYYY-MM-DD) and 1 to ${MAX_DAYS} days`);
  return { from, days: +days };
}

// C12: the website's slots, from tomorrow, Monday to Saturday. Only "booked" says a viewing exists, never whose.
async function availability({ request, env }) {
  const clock = jerseyNow(), q = new URL(request.url).searchParams, listingId = q.get("listing_id");
  if (listingId != null && !/^HE-[A-Z]\d{3,}$/.test(listingId)) fail(400, "Unknown property");
  if (listingId && !(await readLive(env, listingId)).length) fail(404, "Unknown property");
  const a = await loadAvailability(env, { ...availabilityRange(q, plusDays(clock.date, 1)),
    now: clock, fromTomorrow: true, listingId });
  // Count and visibility are read in one D1 batch, so they describe the same snapshot.
  const visible = listingId ? (await readLive(env, listingId, {viewingClock: jerseyNow()}))[0] : null;
  if (listingId && !visible) fail(404, "Unknown property");
  const count = visible?.row.confirmed_viewings;
  return json({ ...(listingId ? { confirmed_viewings_this_week: count >= 2 ? count : null } : {}), slot_minutes: SLOT_MINUTES, negotiators: a.negotiators.map(({ id, name, role }) => ({ id, name, role })),
    days: a.days, ...(listingId == null ? {} : { property_viewings_enabled: a.property_viewings_enabled }) }, 200, { "cache-control": "no-store" });
}

const taken = () => json({ error: "That time was just booked. Please choose another." }, 409);
const fields = f => json({ error: "Please check the highlighted fields.", fields: f }, 400);

async function createViewing({ request, env }) {
  const body = await readJson(request);
  const clock = jerseyNow();
  // Cheap checks first: the single-use Turnstile token is only spent on an otherwise valid request.
  const r = validateViewing(body, { today: clock.date });
  if (r.errors) return fields(r.errors);
  const v = r.value;
  const listing = v.listing_id && await env.DB.prepare(
    `SELECT 1 FROM listings WHERE id = ? AND published = 1 AND archived_at IS NULL AND availability NOT IN (${PUBLIC_BOOKING_BLOCKED_SQL})`).bind(v.listing_id).first();
  const propertyGone = () => fields({ listing_id: "That property is no longer available. Choose another or send a general enquiry." });
  if (v.listing_id && !listing) return propertyGone();
  // The slot must be one the website offers (§4.6): an active negotiator, on the grid, inside their hours, not booked.
  let a;
  try {
    a = await loadAvailability(env, { from: v.date, days: 1, now: clock, fromTomorrow: true, negotiatorId: v.negotiator_id, listingId: v.listing_id });
  } catch (error) {
    if (v.listing_id && error instanceof HttpError && error.status === 404) return propertyGone();
    throw error;
  }
  if (a.property_viewings_enabled === false) return fields({ listing_id: "Viewings are disabled for this property." });
  if (!a.negotiators.length) return fields({ negotiator_id: "Choose who will show you round" });
  const slots = a.days[0].slots[v.negotiator_id];
  if (!isFree(slots, v.time))
    return slots.some(s => s.time === v.time) ? taken() : fields({ time: "That time is not available. Please choose another." });
  if (!(await verifyTurnstile(body.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"), new URL(request.url).hostname)))
    fail(400, "The anti-spam check expired or failed. Please try again.");
  // C6: the insert re-checks the slot itself; if another booking took it since the check, nothing at all is written.
  const [booked] = await env.DB.batch([
    bookStatement(env, v, { status: "requested", publicOnly: true }),
    // Personal data stays in the request row; the event only says what was asked for.
    ...logEvent(env, { actor: "public", entity_type: "viewing", entity_id: null, type: "viewing.requested",
      data: { listing_id: v.listing_id, date: v.date, time: v.time, kind: v.kind } },
    { category: "viewing", title: `Viewing request: ${v.name}`, action_required: true }, { ifInserted: true }),
    touchByViewing(env, v, now()),
  ]);
  return booked.meta.changes ? json({ ok: true }, 201) : taken();
}

const options = () => json(OPTIONS, 200, { "cache-control": "public, max-age=86400" });

// The producer and writer remain closed until privacy, schema and cost are verified.
async function searchStats({request}) {
  const body = await readJson(request, 1024);
  if (!validSearchAction(body)) fail(400, "Invalid search measurement");
  return json({error: "Search measurement is not available"}, 503, {"cache-control": "no-store"});
}

export const STAT_METRICS = ["view", "photos", "tour"];

// I2: one open of a listing, its gallery or its tour. Only published listings count; 204 either way.
// ponytail: at most 20k writes a Jersey day (20% of D1 Free's 100k); a WAF rate limit replaces it once the domain is on
// Cloudflare (I4).
async function countStat({ request, env }) {
  const b = await readJson(request, 1024);
  if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).length !== 2 ||
      !Object.hasOwn(b, "listing_id") || !Object.hasOwn(b, "metric") ||
      !STAT_METRICS.includes(b.metric) || !(typeof b.listing_id === "string" && /^HE-[A-Z]\d{3,}$/.test(b.listing_id)))
    fail(400, "Unknown property or metric");
  const day = jerseyToday();
  await env.DB.prepare(`INSERT INTO daily_stats (day, listing_id, metric, n) SELECT ?, id, ?, 1 FROM listings
    WHERE id = ? AND published = 1 AND archived_at IS NULL
      AND (SELECT COALESCE(SUM(n), 0) FROM daily_stats WHERE day = ?) < 20000 ON CONFLICT DO UPDATE SET n = n + 1`)
    .bind(day, b.metric, b.listing_id, day).run();
  return new Response(null, { status: 204 });
}

const OPERATION_LABEL = { ...Object.fromEntries(OPTIONS.operation), transfer: "Business transfer" };
const JSON_FIELDS = ["requirement_priorities", "household_children_ages", "property_types", "outdoor", "pets", "parishes_wanted", "parishes_excluded", "viewing_availability"];

// The wizard's registration (§3.3). New email and phone: contact + search. Either on file: the existing contact and
// its searches stay as they are; the submission goes into an event for the team, apart from the consent exception.
// Both answer the same 201 {ok:true}, each with one lookup and one batch, so nothing tells whether someone is on file.
async function createApplicant({ request, env, waitUntil }) {
  const body = await readJson(request);
  const ts = now();
  // As in createViewing: the single-use Turnstile token is only spent on an otherwise valid request.
  let inputs = [body];
  if (body?.searches !== undefined) {
    const searches = body.searches;
    const allowed = new Set(["operation", "budget_min", "budget_max", "budget_stretch"]);
    if (!Array.isArray(searches) || searches.length !== 2 || searches.some(s => !s || typeof s !== "object" || Array.isArray(s)
      || Object.keys(s).some(k => !allowed.has(k))) || new Set(searches.map(s => s.operation)).size !== 2
      || !searches.every(s => ["rent", "buy"].includes(s.operation))) fail(400, "Choose rent and buy with separate budgets");
    inputs = searches.map(s => ({ ...body, ...s }));
  }
  const validated = inputs.map(input => validateApplicant(input, { publicForm: true }, ts));
  const invalidIndex = validated.findIndex(r => r.errors);
  if (invalidIndex !== -1) {
    const fields = { ...validated[invalidIndex].errors };
    if (inputs.length > 1 && fields.budget_max) {
      fields[`budget_max_${inputs[invalidIndex].operation}`] = fields.budget_max;
      delete fields.budget_max;
    }
    return json({ error: "Please check the highlighted fields.", fields }, 400);
  }
  if (!(await verifyTurnstile(body.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"), new URL(request.url).hostname)))
    fail(400, "The anti-spam check expired or failed. Please try again.");
  const { contact } = validated[0].value;
  const applicants = validated.map(r => r.value.applicant);
  const found = () => env.DB.prepare(
    "SELECT id, name, marketing_opt_in_at FROM contacts WHERE email = ? OR phone = ? ORDER BY id")
    .bind(contact.email, contact.phone).all().then(x => x.results);
  let matches = await found();
  if (!matches.length) {
    try {
      const results = await env.DB.batch(newApplicants(env, contact, applicants, ts));
      // Only a new search is matched; a duplicate leaves the contact's searches as they are. The matching runs after
      // the answer is sent, so a new registration takes as long as a duplicate (afterSave never rejects).
      for (let i = 0; i < applicants.length; i++) waitUntil(afterSave(recomputeForApplicant, env, results[1 + 3 * i].meta.last_row_id, "public"));
      return json({ ok: true }, 201);
    } catch (e) {
      // The same person sent the form twice at once: the other request created the contact.
      if (!/UNIQUE/i.test(String(e?.message))) throw e;
      matches = await found();
      if (!matches.length) throw e;
    }
  }
  try {
    await env.DB.batch(applicants.flatMap((applicant, i) => duplicate(env, matches, contact, applicant, ts, i === 0)));
  } catch (error) {
    // An identity can change after the duplicate lookup. No stale contact is
    // changed or sent another person's data; a generic retry lets the next
    // request perform the lookup again without revealing the match.
    const current = await found();
    if (!current.some(row => row.id === matches[0].id)) fail(503, "Please try again.");
    throw error;
  }
  return json({ ok: true }, 201);
}

function newApplicants(env, contact, applicants, ts) {
  const stamps = { created_at: ts, updated_at: ts, updated_by: "public" };
  const person = { ...contact, last_activity_at: ts, last_contact_at: ts, ...stamps };
  const cols = row => Object.keys(row).join(", "), marks = row => Object.keys(row).map(() => "?").join(", ");
  return [
    env.DB.prepare(`INSERT INTO contacts (${cols(person)}) VALUES (${marks(person)})`).bind(...Object.values(person)),
    ...applicants.flatMap(applicant => {
      const a = { ...applicant, ...stamps };
      return [env.DB.prepare(`INSERT INTO applicants (contact_id, ${cols(a)}) VALUES ((SELECT id FROM contacts WHERE email = ?), ${marks(a)})`)
        .bind(contact.email, ...Object.values(a)),
      ...logEvent(env, { actor: "public", entity_type: "applicant", entity_id: null, type: "applicant.created",
        data: { operation: a.search_operation ?? a.operation, source: a.source } },
      { category: "new_applicant", title: `New applicant: ${contact.name} · ${OPERATION_LABEL[a.search_operation ?? a.operation]}`, action_required: true })];
    }),
  ];
}

// At most 65 indexed records (64 decidable plus one overflow sentinel) are
// considered. An overflowing or unreadable history is fenced conservatively.
const PRIOR_CONSENT_DATE = `json_extract(payload, '$.before.marketing_opt_in_at')`;
const SAFE_PRIOR_DATE = `date(substr(${PRIOR_CONSENT_DATE},1,10),'+0 days') = substr(${PRIOR_CONSENT_DATE},1,10)
  AND julianday(${PRIOR_CONSENT_DATE}) IS NOT NULL
  AND (length(${PRIOR_CONSENT_DATE}) = 10 OR substr(${PRIOR_CONSENT_DATE},12,2) BETWEEN '00' AND '23')`;
const PENDING_MARKETING = `COALESCE((
  WITH history AS MATERIALIZED (
    SELECT id,type,CASE WHEN type IN ('applicant.duplicate_submitted','contact.consent_changed') AND typeof(data) = 'text'
      THEN CASE WHEN length(CAST(substr(data,1,32769) AS BLOB)) <= 32768
        THEN CASE WHEN json_valid(data) THEN data END END END AS payload
    FROM events INDEXED BY events_entity WHERE entity_type = 'contact' AND entity_id = CAST(contacts.id AS TEXT)
    ORDER BY at DESC,id DESC LIMIT 65
  ), classified AS MATERIALIZED (
    SELECT id,CASE
      WHEN type = 'applicant.duplicate_submitted' THEN CASE
        WHEN payload IS NULL THEN 3
        WHEN json_type(payload,'$.marketing') = 'true' THEN 1
        WHEN json_type(payload,'$.marketing') = 'false' THEN 0 ELSE 3 END
      WHEN type = 'contact.consent_changed' THEN CASE
        WHEN payload IS NULL THEN 3
        WHEN json_type(payload,'$.after.marketing_opt_in_at') = 'null' THEN CASE
          WHEN json_type(payload,'$.before.marketing_opt_in_at') = 'text' AND ${SAFE_PRIOR_DATE} THEN 2
          WHEN json_type(payload,'$.before.marketing_opt_in_at') = 'null' AND
            (json_type(payload,'$.objection_to_pending') = 'true' OR
             json_type(payload,'$.objection_with_incomplete_history') = 'true') THEN 2 ELSE 3 END
        ELSE 3 END
      ELSE 0 END AS kind FROM history
  )
  SELECT CASE WHEN COUNT(*) > 64 THEN 2
    WHEN MAX(CASE WHEN kind = 3 THEN id ELSE 0 END) > MAX(CASE WHEN kind = 2 THEN id ELSE 0 END) THEN 2
    WHEN MAX(CASE WHEN kind = 1 THEN id ELSE 0 END) > MAX(CASE WHEN kind = 2 THEN id ELSE 0 END) THEN 1
    ELSE 0 END FROM classified), 0)`;

// matches: the contacts with that email or phone, oldest first (two when each points to a different one).
function duplicate(env, [c, other], contact, applicant, ts, touchContact = true) {
  const { source, ...search } = applicant, marketing = contact.marketing_opt_in_at != null;
  // Flat, with the form's field names and lists as lists: what the panel's duplicate strip compares and copies.
  const sent = Object.fromEntries(Object.entries({ operation: search.operation, name: contact.name, email: contact.email,
    phone: contact.phone, preferred_channel: contact.preferred_channel, best_time: contact.best_time, ...search,
    privacy: true, marketing, other_contact_id: other?.id })
    .filter(([k, v]) => v != null && !(k === "search_category" && v === "residential"))
    .map(([k, v]) => [k, JSON_FIELDS.includes(k) ? JSON.parse(v) : v]));
  const ref = { actor: "public", entity_type: "contact", entity_id: String(c.id) };
  // Abort the entire batch if the old match now belongs to someone else. A
  // deleted contact still follows the existing event-redaction path below.
  const identityGuard = touchContact ? [env.DB.prepare(`INSERT INTO contacts(name) SELECT NULL WHERE EXISTS (
    SELECT 1 FROM contacts WHERE id = ? AND NOT (email IS ? OR phone IS ?))`)
    .bind(c.id, contact.email, contact.phone)] : [];
  // §3.3: an objection applies at once; the choice to withdraw and its event
  // use the current row inside the batch, not the earlier duplicate lookup.
  const objection = touchContact && !marketing ? [
    env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
      SELECT ?, 'public', 'contact', CAST(id AS TEXT), 'contact.consent_changed',
        CASE WHEN marketing_opt_in_at IS NOT NULL THEN
          json_object('before',json_object('marketing_opt_in_at',marketing_opt_in_at),
            'after',json_object('marketing_opt_in_at',NULL))
        WHEN decision = 1 THEN json_object('before',json_object('marketing_opt_in_at',NULL),
          'after',json_object('marketing_opt_in_at',NULL),'objection_to_pending',json('true'))
        ELSE json_object('before',json_object('marketing_opt_in_at',NULL),
          'after',json_object('marketing_opt_in_at',NULL),'objection_with_incomplete_history',json('true')) END
      FROM (WITH snapshot AS MATERIALIZED (
        SELECT id,marketing_opt_in_at,CASE WHEN marketing_opt_in_at IS NOT NULL THEN 1 ELSE ${PENDING_MARKETING} END AS decision
        FROM contacts WHERE id = ?) SELECT * FROM snapshot) WHERE decision > 0`).bind(ts, c.id),
    env.DB.prepare(`UPDATE contacts SET updated_at = CASE WHEN changes() = 1
        THEN ${CONTACT_NEXT_VERSION} ELSE updated_at END,
      updated_by = CASE WHEN changes() = 1 THEN 'public' ELSE updated_by END,
      marketing_opt_in_at = NULL, last_activity_at = ?, last_contact_at = ? WHERE id = ?`)
      .bind(ts, ts, ts, ts, c.id),
  ] : touchContact ? [env.DB.prepare("UPDATE contacts SET last_activity_at = ?, last_contact_at = ? WHERE id = ?")
    .bind(ts, ts, c.id)] : [];
  return [
    ...identityGuard,
    ...objection,
    ...logEvent(env, { ...ref, type: "applicant.duplicate_submitted", data: sent },
      { category: "new_applicant", title: `${c.name} registered again${other ? " · email and phone match two contacts" : ""}`,
        action_required: true }),
    // Deleted from the panel (§3.4) since the lookup: these events keep no personal data either, as the delete did.
    env.DB.prepare(`UPDATE notifications SET title = 'Deleted applicant', task_reason = NULL,
       resolved_at = COALESCE(resolved_at, ?), resolved_by = CASE WHEN resolved_at IS NULL THEN 'system' ELSE resolved_by END
       WHERE event_id IN (SELECT id FROM events WHERE entity_type = 'contact' AND entity_id = ?)
       AND NOT EXISTS (SELECT 1 FROM contacts WHERE id = ?)`).bind(ts, ref.entity_id, c.id),
    env.DB.prepare(`UPDATE events SET data = NULL WHERE entity_type = 'contact' AND entity_id = ?
      AND NOT EXISTS (SELECT 1 FROM contacts WHERE id = ?)`).bind(ref.entity_id, c.id),
  ];
}

export default [
  ["GET", /^\/listings$/, listPublic],
  ["GET", /^\/config$/, config],
  ["GET", /^\/availability$/, availability],
  ["POST", /^\/viewings$/, createViewing],
  ["GET", /^\/applicants\/options$/, options],
  ["POST", /^\/applicants$/, createApplicant],
  ["POST", /^\/stats$/, countStat],
  ["POST", /^\/search-stats$/, searchStats],
];
