// EST-16: what a person of the team was told about a property's availability (migration 0072), kept apart from what
// the listing says (listings.availability, its published status) and always with where it comes from. Staff only: the
// panel's routes below and the match cards. A history: each confirmation is added, the one in force is the latest by
// its own date (server/property-facts.js) and none expires. Recording one changes no listing, enquiry or viewing, and
// its evidence text stays in its row.
// Off (EST16_AVAILABILITY_READY) or before the migration, nothing is read and every card says Not confirmed.
// EST-15 (EST15_UNAVAILABILITY_READY, migration 0076): a confirmation that says not available also says why, and
// while it is in force the property is not proposed for the operation it covers (server/match-store.js: its Found
// matches go, the shortlisted stay) and each upcoming viewing of it gets one Inbox task for the team. Nothing is
// cancelled, archived or sent to a client. Off, recording changes no match and writes no event, as before.
import { json, fail, readJson, now } from "./http.js";
import { instant, resolveCommercialFacts, unavailabilityReady, standsUnavailable } from "./property-facts.js";
import { afterSave, recomputeForListing } from "./match-store.js";
import { jerseyNow } from "./viewings.js";
import { settleCaptures } from "./property-captures.js";

export const availabilityReady = env => env?.EST16_AVAILABILITY_READY === "1";
const STATUSES = ["available", "unavailable", "unknown"], SOURCES = ["owner", "agency", "other"];
const CHANNELS = ["phone", "email", "in_person", "message"], SCOPES = ["property", "operation"];
export const REASONS = ["sold", "let", "under_offer", "withdrawn", "other"]; // EST-15: the CHECK of migration 0076
// Every stored confirmation counts: a date in the future is refused when recording, and nothing expires.
const EVER = "9999-12-31T23:59:59.999Z";
const missing = e => /no such table/.test(e?.message ?? "");

// Every confirmation of these listings, by its own date. undefined: switched off or not migrated.
// ponytail: reads the whole history of the listings asked for (a page of cards has 25 at most); read only each one's
// latest dates if a listing ever collects hundreds.
async function confirmations(env, ids) {
  if (!availabilityReady(env)) return undefined;
  if (!ids.length) return [];
  try {
    return (await env.DB.prepare(`SELECT id, listing_id, operation, status, confirmed_at, source, channel, evidence_ref, recorded_at,
      recorded_by${unavailabilityReady(env) ? ", reason" : ""} FROM availability_confirmations WHERE listing_id IN (${ids.map(() => "?").join(", ")})
      ORDER BY confirmed_at, id`).bind(...ids).all()).results;
  } catch (e) {
    if (missing(e)) return undefined;
    throw e;
  }
}

// A confirmation with its provenance (operation null: about the whole property), without the evidence text: that
// stays with the listing's own history. reason: read with EST-15 only.
const view = ({ status, confirmed_at, source, channel, operation, recorded_by, reason }) =>
  ({ status, confirmed_at, source, channel, operation, recorded_by, ...(reason !== undefined && { reason }) });

// The confirmation in force for a listing ({ id, operation }) among rows: the latest by its own date of those about
// the whole property or about the operation the listing offers now. null: none, or the latest says unknown.
// { status: "unknown", needs_review }: the latest disagree at the same moment, so neither stands until a person
// records a new one.
function inForce(listing, rows) {
  const about = rows.filter(r => r.listing_id === listing.id && (r.operation === null || r.operation === listing.operation));
  if (!about.length) return null;
  const scope = { property_id: listing.id, operation: listing.operation };
  const { availability, needs_review } = resolveCommercialFacts(about.map(r => ({ id: String(r.id), scope, dimension: "availability",
    status: r.status, source_kind: "human", observed_at: r.confirmed_at, received_at: r.recorded_at })), { scope, as_of: EVER });
  if (needs_review) return { status: "unknown", needs_review: true };
  const latest = about.findLast(r => r.confirmed_at === availability.confirmed_at);
  return latest ? view(latest) : null;
}

// For match cards: listing ({ id, operation }) => the confirmation in force for it, read once for all the ids.
export async function confirmationReader(env, ids) {
  const rows = await confirmations(env, [...new Set(ids)]);
  return listing => (rows && inForce(listing, rows)) || undefined;
}

// The three dimensions of one listing: what it says (published), what was confirmed and is in force (current), and
// every confirmation with its provenance and evidence, newest first.
async function answer(env, id, status = 200, extra = {}) {
  const listing = await env.DB.prepare("SELECT id, operation, availability, archived_at FROM listings WHERE id = ?").bind(id).first();
  if (!listing) fail(404, "Listing not found");
  const rows = await confirmations(env, [id]);
  if (!rows) return json({ enabled: false });
  const { id: _, ...published } = listing;
  return json({ enabled: true, published, current: inForce(listing, rows), history: rows.reverse().slice(0, 50)
    .map(r => ({ id: r.id, ...view(r), evidence_ref: r.evidence_ref, recorded_at: r.recorded_at })),
    ...(unavailabilityReady(env) && { propagates: true }), ...extra }, status);
}

function validate(body, ts, withReason) {
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {}, errors = {};
  const pick = (k, allowed, message) => { if (!allowed.includes(src[k])) errors[k] = message; };
  pick("status", STATUSES, "Choose what was confirmed");
  try {
    if (instant(src.confirmed_at) > ts) errors.confirmed_at = "Choose a date and time that is not in the future";
  } catch { errors.confirmed_at = "Enter the date and time it was confirmed"; }
  pick("source", SOURCES, "Choose who confirmed it");
  pick("channel", CHANNELS, "Choose how it was confirmed");
  const evidence_ref = typeof src.evidence_ref === "string" ? src.evidence_ref.trim() : "";
  if (!evidence_ref || evidence_ref.length > 300) errors.evidence_ref = "Say where the evidence is, in 300 characters or fewer";
  pick("scope", SCOPES, "Choose what it covers");
  if (withReason && src.status === "unavailable") pick("reason", REASONS, "Choose why it is not available");
  return Object.keys(errors).length ? { errors }
    : { value: { ...src, evidence_ref, reason: src.status === "unavailable" ? src.reason : null } };
}

const show = ({ env, params: [id] }) => availabilityReady(env) ? answer(env, id) : json({ enabled: false });

// EST-15: a task in the Inbox for each viewing of the listing still to come (requested or confirmed), written with
// the confirmation just added (the statement before these) when that one says not available and stands. The team
// decides what to do with the viewing: nothing is cancelled and, being tasks, nothing is relayed or sent. One open
// task per viewing: the same click again or a newer confirmation adds no second one. The event names the listing
// and the confirmation, never its evidence; the client's name in the title goes when the viewing is deleted.
const FLAGGED = "viewing.property_unavailable";
function viewingTasks(env, id, admin, ts) {
  const clock = jerseyNow();
  return [
    env.DB.prepare(`WITH fresh AS MATERIALIZED (SELECT c.id, c.listing_id FROM availability_confirmations c
        JOIN listings l ON l.id = c.listing_id WHERE c.id = last_insert_rowid() AND changes() = 1 AND ${standsUnavailable("c", "l.operation")})
      INSERT INTO events (at, actor, entity_type, entity_id, type, data)
      SELECT ?, ?, 'viewing', CAST(v.id AS TEXT), '${FLAGGED}', json_object('listing_id', v.listing_id, 'confirmation_id', f.id)
      FROM fresh f JOIN viewing_requests v ON v.listing_id = f.listing_id
      WHERE v.status IN ('requested', 'confirmed') AND v.date || ' ' || COALESCE(v.end_time, v.time) >= ?
        AND NOT EXISTS (SELECT 1 FROM events e JOIN notifications n ON n.event_id = e.id WHERE e.entity_type = 'viewing'
          AND e.entity_id = CAST(v.id AS TEXT) AND e.type = '${FLAGGED}' AND n.resolved_at IS NULL)`)
      .bind(ts, admin, `${clock.date} ${clock.time}`),
    env.DB.prepare(`INSERT INTO notifications (event_id, category, title, action_required, created_at)
      SELECT e.id, 'task', 'Property confirmed not available: ' || v.name, 1, e.at FROM viewing_requests v
      JOIN events e ON e.entity_type = 'viewing' AND e.entity_id = CAST(v.id AS TEXT) AND e.type = '${FLAGGED}'
      WHERE v.listing_id = ? AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.event_id = e.id)`).bind(id),
    env.DB.prepare("SELECT changes() AS notified"), // the tasks just added: D1's own count can include trigger writes
  ];
}

// The statements that add one confirmation v (as validate gives it) of listing id and, with EST-15, its viewing tasks.
// The same one sent again by the same person (a retried click) is not added twice. guard: SQL, with its arguments,
// that must also hold for it to be added (AGE-06: the answer it comes from was recorded in the same batch).
export function confirmationStatements(env, id, v, admin, ts, guard = { sql: "", args: [] }) {
  const on = unavailabilityReady(env), operation = v.scope === "operation" ? 1 : 0;
  const same = [v.status, v.confirmed_at, v.source, v.channel, v.evidence_ref, admin, ...(on ? [v.reason] : [])];
  // The operation is the listing's own at this moment, read in the same statement.
  return [env.DB.prepare(`INSERT INTO availability_confirmations (listing_id, operation, status, confirmed_at, source,
      channel, evidence_ref, recorded_by${on ? ", reason" : ""}, recorded_at)
    SELECT l.id, CASE WHEN ? THEN l.operation END, ?, ?, ?, ?, ?, ?,${on ? " ?," : ""} ? FROM listings l WHERE l.id = ?
      AND NOT EXISTS (SELECT 1 FROM availability_confirmations c WHERE c.listing_id = l.id
        AND c.operation IS CASE WHEN ? THEN l.operation END AND c.status = ? AND c.confirmed_at = ? AND c.source = ?
        AND c.channel = ? AND c.evidence_ref = ? AND c.recorded_by = ?${on ? " AND c.reason IS ?" : ""})${guard.sql}`)
    .bind(operation, ...same, ts, id, operation, ...same, ...guard.args), ...(on ? viewingTasks(env, id, admin, ts) : [])];
}
// EST-15: the listing's matches follow what is in force now, on a repeated click too (it repairs a failed recompute).
// SPR-03: first, the latest confirmation recorded, if it says available, captures the property once (here and through
// an enquiry's answer, AGE-06, which calls this too). If that fails, the capture stays queued and its "Check files
// again" finishes it; nothing of the confirmation is undone.
export async function propagate(env, id, admin) {
  await settleCaptures(env, { listingId: id, admin }).catch(e => console.error("SPR-03 capture", e?.message));
  return unavailabilityReady(env) && afterSave(recomputeForListing, env, id, admin);
}

// Adds one confirmation.
async function record({ request, env, admin, params: [id] }) {
  if (!availabilityReady(env)) fail(404, "Not found");
  const on = unavailabilityReady(env), ts = now(), r = validate(await readJson(request), ts, on);
  if (r.errors) return json({ error: "Please check the highlighted fields.", fields: r.errors }, 400);
  let done;
  try {
    done = await env.DB.batch(confirmationStatements(env, id, r.value, admin, ts));
  } catch (e) {
    if (missing(e)) fail(404, "Not found");
    throw e;
  }
  await propagate(env, id, admin);
  return answer(env, id, done[0].meta.changes ? 201 : 200, on ? { notified: done[3].results[0].notified } : {});
}

export default [
  ["GET", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/availability$/, show, true],
  ["POST", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/availability$/, record, true],
];
