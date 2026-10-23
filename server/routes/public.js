import { json, fail, readJson, now } from "../http.js";
import { toPublic } from "../listing.js";
import { validateViewing, jerseyNow, jerseyToday, isFree, realDate, plusDays, SLOT_MINUTES, PUBLIC_DAYS, MAX_DAYS } from "../viewings.js";
import { loadAvailability, bookStatement } from "../viewing-store.js";
import { verifyTurnstile } from "../turnstile.js";
import { logEvent } from "../events.js";
import { validateApplicant, OPTIONS } from "../applicants.js";
import { afterSave, recomputeForApplicant } from "../match-store.js";

export const groupBy = (rows, key) => rows.reduce((a, r) => ((a[r[key]] ||= []).push(r), a), {});

async function listPublic({ env }) {
  const { results: listings } = await env.DB.prepare(
    "SELECT * FROM listings WHERE published = 1 AND archived_at IS NULL ORDER BY id").all();
  const { results: media } = await env.DB.prepare(
    `SELECT m.* FROM media m JOIN listings l ON l.id = m.listing_id
     WHERE l.published = 1 AND l.archived_at IS NULL AND m.public = 1 ORDER BY m.position, m.id`).all();
  const by = groupBy(media, "listing_id");
  return json(listings.map(l => toPublic(l, by[l.id] || [])), 200, { "cache-control": "public, max-age=60" });
}

const config = ({ env }) => json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY }, 200, { "cache-control": "public, max-age=300" });

// ?from=YYYY-MM-DD&days=N of an availability request, shared with the panel's (which starts from today).
export function availabilityRange(q, defaultFrom) {
  const from = q.get("from") ?? defaultFrom, days = q.get("days") ?? String(PUBLIC_DAYS);
  if (!realDate(from) || !/^\d+$/.test(days) || +days < 1 || +days > MAX_DAYS)
    fail(400, `Choose a date (YYYY-MM-DD) and 1 to ${MAX_DAYS} days`);
  return { from, days: +days };
}

// C12: the website's slots, from tomorrow, Monday to Saturday. Only "booked" says a viewing exists, never whose.
async function availability({ request, env }) {
  const clock = jerseyNow();
  const a = await loadAvailability(env, { ...availabilityRange(new URL(request.url).searchParams, plusDays(clock.date, 1)),
    now: clock, fromTomorrow: true });
  return json({ slot_minutes: SLOT_MINUTES, negotiators: a.negotiators.map(({ id, name, role }) => ({ id, name, role })),
    days: a.days }, 200, { "cache-control": "no-store" });
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
    "SELECT 1 FROM listings WHERE id = ? AND published = 1 AND archived_at IS NULL").bind(v.listing_id).first();
  if (v.listing_id && !listing) fail(400, "That property is no longer available. Choose another or send a general enquiry.");
  // The slot must be one the website offers (§4.6): an active negotiator, on the grid, inside their hours, not booked.
  const a = await loadAvailability(env, { from: v.date, days: 1, now: clock, fromTomorrow: true, negotiatorId: v.negotiator_id });
  if (!a.negotiators.length) return fields({ negotiator_id: "Choose who will show you round" });
  const slots = a.days[0].slots[v.negotiator_id];
  if (!isFree(slots, v.time))
    return slots.some(s => s.time === v.time) ? taken() : fields({ time: "That time is not available. Please choose another." });
  if (!(await verifyTurnstile(body.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"), new URL(request.url).hostname)))
    fail(400, "The anti-spam check expired or failed. Please try again.");
  // C6: the insert re-checks the slot itself; if another booking took it since the check, nothing at all is written.
  const [booked] = await env.DB.batch([
    bookStatement(env, v, { status: "requested" }),
    // Personal data stays in the request row; the event only says what was asked for.
    ...logEvent(env, { actor: "public", entity_type: "viewing", entity_id: null, type: "viewing.requested",
      data: { listing_id: v.listing_id, date: v.date, time: v.time, kind: v.kind } },
    { category: "viewing", title: `Viewing request: ${v.name}`, action_required: true }, { ifInserted: true }),
  ]);
  return booked.meta.changes ? json({ ok: true }, 201) : taken();
}

const options = () => json(OPTIONS, 200, { "cache-control": "public, max-age=86400" });

export const STAT_METRICS = ["view", "photos", "tour"];

// I2: one open of a listing, its gallery or its tour. Only published listings count; 204 either way.
// ponytail: at most 20k writes a Jersey day (20% of D1 Free's 100k); a WAF rate limit replaces it once the domain is on
// Cloudflare (I4).
async function countStat({ request, env }) {
  const b = await readJson(request);
  if (!STAT_METRICS.includes(b?.metric) || !(typeof b?.listing_id === "string" && /^HE-[A-Z]\d{3,}$/.test(b.listing_id))) fail(400, "Unknown property or metric");
  const day = jerseyToday();
  await env.DB.prepare(`INSERT INTO daily_stats (day, listing_id, metric, n) SELECT ?, id, ?, 1 FROM listings
    WHERE id = ? AND published = 1 AND archived_at IS NULL
      AND (SELECT COALESCE(SUM(n), 0) FROM daily_stats WHERE day = ?) < 20000 ON CONFLICT DO UPDATE SET n = n + 1`)
    .bind(day, b.metric, b.listing_id, day).run();
  return new Response(null, { status: 204 });
}

const OPERATION_LABEL = Object.fromEntries(OPTIONS.operation);
const JSON_FIELDS = ["property_types", "outdoor", "pets", "parishes_wanted", "parishes_excluded"];

// The wizard's registration (§3.3). New email and phone: contact + search. Either on file: the existing contact and
// its searches stay as they are; the submission goes into an event for the team, apart from the consent exception.
// Both answer the same 201 {ok:true}, each with one lookup and one batch, so nothing tells whether someone is on file.
async function createApplicant({ request, env, waitUntil }) {
  const body = await readJson(request);
  const ts = now();
  // As in createViewing: the single-use Turnstile token is only spent on an otherwise valid request.
  const r = validateApplicant(body, { publicForm: true }, ts);
  if (r.errors) return json({ error: "Please check the highlighted fields.", fields: r.errors }, 400);
  if (!(await verifyTurnstile(body.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"), new URL(request.url).hostname)))
    fail(400, "The anti-spam check expired or failed. Please try again.");
  const { contact, applicant } = r.value;
  const found = () => env.DB.prepare(
    "SELECT id, name, marketing_opt_in_at FROM contacts WHERE email = ? OR phone = ? ORDER BY id")
    .bind(contact.email, contact.phone).all().then(x => x.results);
  let matches = await found();
  if (!matches.length) {
    try {
      const results = await env.DB.batch(newApplicant(env, contact, applicant, ts));
      // Only a new search is matched; a duplicate leaves the contact's searches as they are. The matching runs after
      // the answer is sent, so a new registration takes as long as a duplicate (afterSave never rejects).
      waitUntil(afterSave(recomputeForApplicant, env, results[1].meta.last_row_id, "public"));
      return json({ ok: true }, 201);
    } catch (e) {
      // The same person sent the form twice at once: the other request created the contact.
      if (!/UNIQUE/i.test(String(e?.message))) throw e;
      matches = await found();
      if (!matches.length) throw e;
    }
  }
  await env.DB.batch(duplicate(env, matches, contact, applicant, ts));
  return json({ ok: true }, 201);
}

function newApplicant(env, contact, applicant, ts) {
  const stamps = { created_at: ts, updated_at: ts, updated_by: "public" };
  const person = { ...contact, last_activity_at: ts, ...stamps }, a = { ...applicant, ...stamps };
  const cols = row => Object.keys(row).join(", "), marks = row => Object.keys(row).map(() => "?").join(", ");
  return [
    env.DB.prepare(`INSERT INTO contacts (${cols(person)}) VALUES (${marks(person)})`).bind(...Object.values(person)),
    // The contact is the row inserted just before, and the applicant the one just before the event.
    env.DB.prepare(`INSERT INTO applicants (contact_id, ${cols(a)}) VALUES (last_insert_rowid(), ${marks(a)})`).bind(...Object.values(a)),
    ...logEvent(env, { actor: "public", entity_type: "applicant", entity_id: null, type: "applicant.created",
      data: { operation: a.operation, source: a.source } },
    { category: "new_applicant", title: `New applicant: ${contact.name} · ${OPERATION_LABEL[a.operation]}`, action_required: true }),
  ];
}

// matches: the contacts with that email or phone, oldest first (two when each points to a different one).
function duplicate(env, [c, other], contact, applicant, ts) {
  const { source, ...search } = applicant, marketing = contact.marketing_opt_in_at != null;
  // Flat, with the form's field names and lists as lists: what the panel's duplicate strip compares and copies.
  const sent = Object.fromEntries(Object.entries({ operation: search.operation, name: contact.name, email: contact.email,
    phone: contact.phone, preferred_channel: contact.preferred_channel, best_time: contact.best_time, ...search,
    privacy: true, marketing, other_contact_id: other?.id })
    .filter(([, v]) => v != null).map(([k, v]) => [k, JSON_FIELDS.includes(k) ? JSON.parse(v) : v]));
  const ref = { actor: "public", entity_type: "contact", entity_id: String(c.id) };
  // §3.3 consent exception: an objection to marketing applies at once (a forged one only stops marketing). Nothing
  // else unverified reaches the contact: a new opt-in or a privacy acknowledgement stays in the event, for the team.
  const withdrawn = !marketing && c.marketing_opt_in_at != null;
  return [
    // A withdrawal is a change to the contact (a stale panel save then gets its 409); the retention clock always restarts.
    env.DB.prepare(`UPDATE contacts SET ${withdrawn ? "marketing_opt_in_at = NULL, updated_at = ?, updated_by = 'public', " : ""}
      last_activity_at = ? WHERE id = ?`).bind(...(withdrawn ? [ts] : []), ts, c.id),
    ...(withdrawn ? logEvent(env, { ...ref, type: "contact.consent_changed",
      data: { before: { marketing_opt_in_at: c.marketing_opt_in_at }, after: { marketing_opt_in_at: null } } }) : []),
    ...logEvent(env, { ...ref, type: "applicant.duplicate_submitted", data: sent },
      { category: "new_applicant", title: `${c.name} registered again${other ? " · email and phone match two contacts" : ""}`,
        action_required: true }),
    // Deleted from the panel (§3.4) since the lookup: these events keep no personal data either, as the delete did.
    env.DB.prepare(`UPDATE notifications SET title = 'Deleted applicant' WHERE event_id IN (SELECT id FROM events
      WHERE entity_type = 'contact' AND entity_id = ?) AND NOT EXISTS (SELECT 1 FROM contacts WHERE id = ?)`).bind(ref.entity_id, c.id),
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
];
