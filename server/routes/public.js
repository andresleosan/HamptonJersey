import { json, fail, readJson, now } from "../http.js";
import { toPublic } from "../listing.js";
import { validateViewing, jerseyToday } from "../viewings.js";
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

async function createViewing({ request, env }) {
  const body = await readJson(request);
  // Cheap checks first: the single-use Turnstile token is only spent on an otherwise valid request.
  const r = validateViewing(body, jerseyToday());
  if (r.errors) return json({ error: "Please check the highlighted fields.", fields: r.errors }, 400);
  const v = r.value;
  const listing = v.listing_id && await env.DB.prepare(
    "SELECT title FROM listings WHERE id = ? AND published = 1 AND archived_at IS NULL").bind(v.listing_id).first();
  if (v.listing_id && !listing) fail(400, "That property is no longer available. Choose another or send a general enquiry.");
  if (!(await verifyTurnstile(body.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"), new URL(request.url).hostname)))
    fail(400, "The anti-spam check expired or failed. Please try again.");
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO viewing_requests (listing_id, listing_ref, listing_title_snapshot, agent, kind, date, time,
        name, email, phone, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.listing_id, v.listing_id, listing ? listing.title : null, v.agent, v.kind, v.date, v.time, v.name, v.email, v.phone, now()),
    // Personal data stays in the request row; the event only says what was asked for.
    ...logEvent(env, { actor: "public", entity_type: "viewing", entity_id: null, type: "viewing.requested",
      data: { listing_id: v.listing_id, date: v.date, time: v.time, kind: v.kind } },
    { category: "viewing", title: `Viewing request: ${v.name}`, action_required: true }),
  ]);
  return json({ ok: true }, 201);
}

const options = () => json(OPTIONS, 200, { "cache-control": "public, max-age=86400" });

const OPERATION_LABEL = Object.fromEntries(OPTIONS.operation);
const JSON_FIELDS = ["property_types", "outdoor", "pets", "parishes_wanted", "parishes_excluded"];

// The wizard's registration (§3.3). New email and phone: contact + search. Either on file: the existing contact and
// its searches stay as they are; the submission goes into an event for the team, apart from the consent exception.
// Both answer the same 201 {ok:true}, each with one lookup and one batch, so nothing tells whether someone is on file.
async function createApplicant({ request, env }) {
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
      // Only a new search is matched (afterSave never throws): a duplicate leaves the contact's searches as they are.
      await afterSave(recomputeForApplicant, env, results[1].meta.last_row_id, "public");
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
  ["POST", /^\/viewings$/, createViewing],
  ["GET", /^\/applicants\/options$/, options],
  ["POST", /^\/applicants$/, createApplicant],
];
