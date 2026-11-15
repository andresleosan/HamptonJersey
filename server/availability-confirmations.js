// EST-16: what a person of the team was told about a property's availability (migration 0072), kept apart from what
// the listing says (listings.availability, its published status) and always with where it comes from. Staff only: the
// panel's routes below and the match cards. A history: each confirmation is added, the one in force is the latest by
// its own date (server/property-facts.js) and none expires. Recording one changes no listing, match, enquiry or
// viewing (EST-15 propagates a confirmed unavailability) and writes no event: its text stays in its row.
// Off (EST16_AVAILABILITY_READY) or before the migration, nothing is read and every card says Not confirmed.
import { json, fail, readJson, now } from "./http.js";
import { instant, resolveCommercialFacts } from "./property-facts.js";

export const availabilityReady = env => env?.EST16_AVAILABILITY_READY === "1";
const STATUSES = ["available", "unavailable", "unknown"], SOURCES = ["owner", "agency", "other"];
const CHANNELS = ["phone", "email", "in_person", "message"], SCOPES = ["property", "operation"];
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
      recorded_by FROM availability_confirmations WHERE listing_id IN (${ids.map(() => "?").join(", ")})
      ORDER BY confirmed_at, id`).bind(...ids).all()).results;
  } catch (e) {
    if (missing(e)) return undefined;
    throw e;
  }
}

// A confirmation with its provenance (operation null: about the whole property), without the evidence text: that
// stays with the listing's own history.
const view = ({ status, confirmed_at, source, channel, operation, recorded_by }) =>
  ({ status, confirmed_at, source, channel, operation, recorded_by });

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
async function answer(env, id, status = 200) {
  const listing = await env.DB.prepare("SELECT id, operation, availability, archived_at FROM listings WHERE id = ?").bind(id).first();
  if (!listing) fail(404, "Listing not found");
  const rows = await confirmations(env, [id]);
  if (!rows) return json({ enabled: false });
  const { id: _, ...published } = listing;
  return json({ enabled: true, published, current: inForce(listing, rows), history: rows.reverse().slice(0, 50)
    .map(r => ({ id: r.id, ...view(r), evidence_ref: r.evidence_ref, recorded_at: r.recorded_at })) }, status);
}

function validate(body, ts) {
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
  return Object.keys(errors).length ? { errors } : { value: { ...src, evidence_ref } };
}

const show = ({ env, params: [id] }) => availabilityReady(env) ? answer(env, id) : json({ enabled: false });

// Adds one confirmation. The same one sent again by the same person (a retried click) is not added twice.
async function record({ request, env, admin, params: [id] }) {
  if (!availabilityReady(env)) fail(404, "Not found");
  const ts = now(), r = validate(await readJson(request), ts);
  if (r.errors) return json({ error: "Please check the highlighted fields.", fields: r.errors }, 400);
  const v = r.value, operation = v.scope === "operation" ? 1 : 0, same = [v.status, v.confirmed_at, v.source, v.channel, v.evidence_ref, admin];
  let meta;
  try {
    // The operation is the listing's own at this moment, read in the same statement.
    ({ meta } = await env.DB.prepare(`INSERT INTO availability_confirmations (listing_id, operation, status, confirmed_at, source,
        channel, evidence_ref, recorded_by, recorded_at)
      SELECT l.id, CASE WHEN ? THEN l.operation END, ?, ?, ?, ?, ?, ?, ? FROM listings l WHERE l.id = ?
        AND NOT EXISTS (SELECT 1 FROM availability_confirmations c WHERE c.listing_id = l.id
          AND c.operation IS CASE WHEN ? THEN l.operation END AND c.status = ? AND c.confirmed_at = ? AND c.source = ?
          AND c.channel = ? AND c.evidence_ref = ? AND c.recorded_by = ?)`).bind(operation, ...same, ts, id, operation, ...same).run());
  } catch (e) {
    if (missing(e)) fail(404, "Not found");
    throw e;
  }
  return answer(env, id, meta.changes ? 201 : 200);
}

export default [
  ["GET", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/availability$/, show, true],
  ["POST", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/availability$/, record, true],
];
