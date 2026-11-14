// ADM-06 (migration 0056, flag ADM06_TENANCY_ORIGIN_READY): a tenancy that starts from a Let agreed listing and an
// applicant, both picked by staff (never matched by address or name), committed through New tenancy's own statements in
// one batch; the signed contract and the entry inventory's evidence are opaque external references a person reviewed.
// Nothing here receives, stores, fetches or opens a file, and nothing changes the listing, the applicant or the charges.
import { fail, now } from "./http.js";
import { tenancyPlan } from "./routes/rent.js";
import { ensureChanged, rentalEvent } from "./routes/rentals.js";

export const originReady = env => env?.ADM06_TENANCY_ORIGIN_READY === "1";
export const METERS = ["electricity", "gas", "water", "oil", "other"], UNITS = ["kWh", "m3", "ft3", "litres"];
const REF_MAX = 120, REFS_MAX = 20, ROOMS_MAX = 40, READINGS_MAX = 12;
const REF_ERR = `Enter a reference of up to ${REF_MAX} characters: where the document is kept, not the document`;
const SOURCE = "The listing or the applicant changed since the preview. Preview again before you confirm.";
const STALE = "Someone else saved this meanwhile. Reload to see it (your changes were not saved).";
const LISTING_OK = "SELECT 1 FROM listings WHERE id = ? AND operation = 'rent' AND availability = 'let_agreed' AND archived_at IS NULL";
const APPLICANT_OK = "SELECT 1 FROM applicants WHERE id = ? AND operation = 'rent' AND archived_at IS NULL";

const posInt = v => (Number.isSafeInteger(v) && v > 0 ? v : null);
const listingId = v => (typeof v === "string" && /^[A-Za-z0-9-]{1,40}$/.test(v) ? v : null);
const stamp = v => (typeof v === "string" && v.length <= 40 ? v : null);
const revision = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const need = (errors, key, value, message) => (value == null ? ((errors[key] = message), null) : value);
// Staff's reference to where a document is kept (a folder, a file name): trimmed text, never fetched or opened.
export const evidenceRef = v => {
  const t = typeof v === "string" ? v.trim() : "";
  return t && t.length <= REF_MAX && !/[\u0000-\u001f\u007f]/.test(t) ? t : null;
};
const optionalRef = (errors, key, v) => (v == null || v === "" ? null : evidenceRef(v) ?? ((errors[key] = REF_ERR), null));
const done = errors => (Object.keys(errors).length ? { errors } : null);

// The rows both steps read: 404 when one of the three picked is gone.
async function sources(env, { rental_id, listing_id, applicant_id }) {
  const q = (sql, v) => env.DB.prepare(sql).bind(v).first();
  const [rental, listing, applicant] = await Promise.all([
    q(`SELECT r.id, r.address, r.parish, r.service, r.archived_at, l.name AS landlord_name, EXISTS (SELECT 1 FROM tenancies t
      WHERE t.rental_id = r.id AND t.ended_on IS NULL) AS open FROM rentals r JOIN landlords l ON l.id = r.landlord_id WHERE r.id = ?`, rental_id),
    q(`SELECT id, title, location, operation, availability, archived_at, published, rent, rent_period, updated_at
      FROM listings WHERE id = ?`, listing_id),
    q(`SELECT a.id, a.operation, a.stage, a.archived_at, a.move_in_date, a.updated_at, c.name, c.email, c.phone
      FROM applicants a JOIN contacts c ON c.id = a.contact_id WHERE a.id = ?`, applicant_id),
  ]);
  if (!rental) fail(404, "Property not found");
  if (!listing) fail(404, "Listing not found");
  if (!applicant) fail(404, "Applicant not found");
  return { rental, listing, applicant };
}

// The Let agreed listings and the applicants to rent that staff choose from (newest first, 50 each).
export async function candidates(env) {
  const [listings, applicants] = await Promise.all([
    env.DB.prepare(`SELECT id, title, location FROM listings WHERE operation = 'rent' AND availability = 'let_agreed'
      AND archived_at IS NULL ORDER BY updated_at DESC, id LIMIT 50`).all(),
    env.DB.prepare(`SELECT a.id, a.stage, c.name FROM applicants a JOIN contacts c ON c.id = a.contact_id
      WHERE a.operation = 'rent' AND a.archived_at IS NULL AND a.stage NOT IN ('lost', 'completed')
      ORDER BY a.stage = 'agreed' DESC, a.updated_at DESC, a.id LIMIT 50`).all(),
  ]);
  return { listings: listings.results, applicants: applicants.results };
}

// Read only: what the commit would enter, why it may not, and the versions it must still find.
export async function prepareTenancyFromAgreement(env, b) {
  const errors = {};
  const pick = { rental_id: need(errors, "rental_id", posInt(b.rental_id), "Choose the managed property this tenancy is for"),
    listing_id: need(errors, "listing_id", listingId(b.listing_id), "Choose the Let agreed listing"),
    applicant_id: need(errors, "applicant_id", posInt(b.applicant_id), "Choose the applicant") };
  const signed_contract_ref = optionalRef(errors, "signed_contract_ref", b.signed_contract_ref);
  if (done(errors)) return done(errors);
  const { rental, listing, applicant } = await sources(env, pick);
  if ((b.expected_listing_at != null && b.expected_listing_at !== listing.updated_at)
    || (b.expected_applicant_at != null && b.expected_applicant_at !== applicant.updated_at)) fail(409, SOURCE);
  const reasons = [rental.archived_at && "This property is archived",
    rental.open && "This property already has a tenancy. End it first",
    (listing.operation !== "rent" || listing.archived_at || listing.availability !== "let_agreed") && "The listing is not Let agreed",
    (applicant.operation !== "rent" || applicant.archived_at) && "The applicant is not looking to rent"].filter(Boolean);
  // Only suggestions for the form: staff check and confirm each one.
  const draft = { tenant_name: applicant.name, tenant_email: applicant.email, tenant_phone: applicant.phone,
    rent: listing.rent_period === "month" && Number.isInteger(listing.rent) ? listing.rent : null,
    start_on: /^\d{4}-\d{2}-\d{2}$/.test(applicant.move_in_date ?? "") ? applicant.move_in_date : null };
  return { eligible: !reasons.length, reasons,
    preview: { rental: { id: rental.id, address: rental.address, parish: rental.parish, service: rental.service, landlord_name: rental.landlord_name },
      listing: { id: listing.id, title: listing.title, location: listing.location, availability: listing.availability,
        published: listing.published, rent: listing.rent, rent_period: listing.rent_period },
      applicant: { id: applicant.id, name: applicant.name, email: applicant.email, phone: applicant.phone, stage: applicant.stage },
      draft, signed_contract_ref },
    source_versions: { listing_id: listing.id, listing_updated_at: listing.updated_at, applicant_id: applicant.id,
      applicant_updated_at: applicant.updated_at } };
}

// One batch: the listing and applicant still as previewed, New tenancy's statements, the origin and, when given, the
// signed contract's reference. operation_id answers a repeat with the same tenancy (replayed), never a second one.
export async function commitTenancyOrigin(env, b, actor) {
  const errors = {}, sv = b.source_versions && typeof b.source_versions === "object" ? b.source_versions : {};
  const rental_id = need(errors, "rental_id", posInt(b.rental_id), "Choose the managed property this tenancy is for");
  const listing_id = listingId(sv.listing_id), applicant_id = posInt(sv.applicant_id);
  const at = [stamp(sv.listing_updated_at), stamp(sv.applicant_updated_at)];
  if (!listing_id || !applicant_id || at.includes(null)) errors.source_versions = "Preview the tenancy before you confirm it";
  const operation_id = need(errors, "operation_id", typeof b.operation_id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(b.operation_id)
    ? b.operation_id : null, "Preview the tenancy again before you confirm it");
  const ref = optionalRef(errors, "signed_contract_ref", b.signed_contract_ref);
  if (done(errors)) return done(errors);
  const replay = async () => {
    const o = await env.DB.prepare("SELECT * FROM tenancy_origins WHERE operation_id = ?").bind(operation_id).first();
    if (!o) return null;
    if (o.rental_id !== rental_id || o.listing_id !== listing_id || o.applicant_id !== applicant_id)
      fail(409, "This confirmation was already used for another tenancy. Preview again");
    return { tenancy_id: o.tenancy_id, replayed: true };
  };
  const earlier = await replay();
  if (earlier) return earlier;
  const draft = b.tenancy_draft && typeof b.tenancy_draft === "object" && !Array.isArray(b.tenancy_draft) ? b.tenancy_draft : {};
  const p = await tenancyPlan(env, actor, rental_id, draft);
  if (p.errors) return { errors: p.errors };
  const binds = [listing_id, at[0], applicant_id, at[1]], ts = now(), NEW = "(SELECT MAX(id) FROM tenancies)";
  const fresh = `EXISTS (${LISTING_OK} AND updated_at = ?) AND EXISTS (${APPLICANT_OK} AND updated_at = ?)`;
  const stmts = [
    env.DB.prepare(`INSERT INTO landlords (name) SELECT NULL WHERE NOT (${fresh})`).bind(...binds), // fails the batch (NOT NULL)
    ...p.stmts,
    env.DB.prepare(`INSERT INTO tenancy_origins (tenancy_id, operation_id, rental_id, listing_id, applicant_id, listing_updated_at,
      applicant_updated_at, created_at, created_by) VALUES (${NEW}, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(operation_id, rental_id, listing_id, applicant_id, at[0], at[1], ts, actor),
    rentalEvent(env, { rental_id, actor, type: "tenancy.origin_linked", data: { listing_id, applicant_id } }, { tenancy_id: "tenancies" }),
    ...(ref ? [env.DB.prepare(`INSERT INTO tenancy_signed_contracts (tenancy_id, evidence_ref, reviewed_at, reviewed_by, revision)
      VALUES (${NEW}, ?, ?, ?, 1)`).bind(ref, ts, actor),
    rentalEvent(env, { rental_id, actor, type: "tenancy.signed_contract_recorded", data: { revision: 1 } }, { tenancy_id: "tenancies" })] : []),
  ];
  try {
    const res = await env.DB.batch(stmts);
    return { tenancy_id: res[1].meta.last_row_id, replayed: false };
  } catch (e) {
    const again = await replay(); // the same confirmation landed first
    if (again) return again;
    if (!(await env.DB.prepare(`SELECT ${fresh} AS ok`).bind(...binds).first()).ok) fail(409, SOURCE);
    await p.recheck();
    throw e;
  }
}

const tenancyRow = async (env, id) =>
  (await env.DB.prepare("SELECT id, rental_id FROM tenancies WHERE id = ?").bind(id).first()) ?? fail(404, "Tenancy not found");
const parse = row => row && { ...row, rooms: JSON.parse(row.rooms), meter_readings: JSON.parse(row.meter_readings),
  evidence_refs: JSON.parse(row.evidence_refs) };

export async function readRecords(env, tenancy_id) {
  const t = await tenancyRow(env, tenancy_id), q = sql => env.DB.prepare(sql).bind(t.id).first();
  const [origin, signed_contract, inventory] = await Promise.all([
    q(`SELECT o.tenancy_id, o.listing_id, o.applicant_id, o.created_at, o.created_by, l.title AS listing_title, c.name AS applicant_name
      FROM tenancy_origins o LEFT JOIN listings l ON l.id = o.listing_id LEFT JOIN applicants a ON a.id = o.applicant_id
      LEFT JOIN contacts c ON c.id = a.contact_id WHERE o.tenancy_id = ?`),
    q("SELECT evidence_ref, reviewed_at, reviewed_by, revision FROM tenancy_signed_contracts WHERE tenancy_id = ?"),
    q("SELECT * FROM tenancy_entry_inventories WHERE tenancy_id = ?"),
  ]);
  return { origin, signed_contract, entry_inventory: parse(inventory) };
}

// A compare-and-set write: `write` must change one row (expected revision 0 inserts), or the batch fails and the
// stored revision says why (409 when it moved on).
async function casWrite(env, table, t, expected, write, actor, type, data) {
  try {
    await env.DB.batch([write, ensureChanged(env), rentalEvent(env, { rental_id: t.rental_id, tenancy_id: t.id, actor, type, data })]);
  } catch (e) {
    const row = await env.DB.prepare(`SELECT revision FROM ${table} WHERE tenancy_id = ?`).bind(t.id).first();
    if ((row?.revision ?? 0) !== expected) fail(409, STALE);
    throw e;
  }
}

// The signed contract as an ExternalEvidence: reviewed_at and reviewed_by are the server's, whatever the body says.
export async function saveSignedContract(env, { tenancy_id, expectedRevision, evidence_ref }, actor) {
  const errors = {}, ref = evidenceRef(evidence_ref), rev = revision(expectedRevision);
  if (!ref) errors.evidence_ref = evidence_ref == null || evidence_ref === ""
    ? "Enter the reference to the signed contract. A date alone does not record it" : REF_ERR;
  if (rev == null) errors.expectedRevision = "Reload the page";
  if (done(errors)) return done(errors);
  const t = await tenancyRow(env, tenancy_id), ts = now(), next = rev + 1;
  const write = rev === 0
    ? env.DB.prepare(`INSERT INTO tenancy_signed_contracts (tenancy_id, evidence_ref, reviewed_at, reviewed_by, revision)
      VALUES (?, ?, ?, ?, 1) ON CONFLICT DO NOTHING`).bind(t.id, ref, ts, actor)
    : env.DB.prepare(`UPDATE tenancy_signed_contracts SET evidence_ref = ?, reviewed_at = ?, reviewed_by = ?, revision = ?
      WHERE tenancy_id = ? AND revision = ?`).bind(ref, ts, actor, next, t.id, rev);
  await casWrite(env, "tenancy_signed_contracts", t, rev, write, actor, "tenancy.signed_contract_recorded", { revision: next });
  return { signed_contract: { evidence_ref: ref, reviewed_at: ts, reviewed_by: actor, revision: next } };
}

const text = v => (v == null ? "" : typeof v === "string" ? v.trim() : null);
export function validateInventory(b) {
  const e = {};
  const list = (k, max, min, message) => {
    const a = b[k] ?? [];
    if (Array.isArray(a) && a.length >= min && a.length <= max) return a;
    e[k] = message;
    return [];
  };
  const rooms = list("rooms", ROOMS_MAX, 1, `Add at least one room (up to ${ROOMS_MAX})`).map((r, i) => {
    const name = text(r?.name), observations = text(r?.observations);
    if (!name || name.length > 80) e[`rooms.${i}.name`] = "Enter the room's name (up to 80 characters)";
    if (observations == null || observations.length > 2000) e[`rooms.${i}.observations`] = "Use up to 2,000 characters";
    return { name, observations };
  });
  const meter_readings = list("meter_readings", READINGS_MAX, 0, `Up to ${READINGS_MAX} readings`).map((m, i) => {
    const reading = typeof m?.reading === "number" ? String(m.reading) : text(m?.reading);
    if (!METERS.includes(m?.meter)) e[`meter_readings.${i}.meter`] = "Choose the meter";
    if (!/^\d{1,9}(\.\d{1,3})?$/.test(reading ?? "")) e[`meter_readings.${i}.reading`] = "Enter the reading as shown, like 12345.6";
    if (!UNITS.includes(m?.unit)) e[`meter_readings.${i}.unit`] = "Choose the unit: kWh, m³, ft³ or litres";
    return { meter: m?.meter, reading, unit: m?.unit };
  });
  const evidence_refs = list("evidence_refs", REFS_MAX, 0, `Up to ${REFS_MAX} references`)
    .map((r, i) => evidenceRef(r) ?? ((e[`evidence_refs.${i}`] = REF_ERR), null));
  if (!e.evidence_refs && new Set(evidence_refs).size !== evidence_refs.length) e.evidence_refs = "Enter each reference once";
  return { e, value: { rooms, meter_readings, evidence_refs } };
}

// The entry inventory's next revision (expectedRevision: the one the form read, 0 for none). A reference already
// reviewed keeps its review; a new one is reviewed now by the actor.
export async function saveEntryInventory(env, { tenancy_id, expectedRevision, ...body }, actor) {
  const { e, value } = validateInventory(body), rev = revision(expectedRevision);
  if (rev == null) e.expectedRevision = "Reload the page";
  if (done(e)) return done(e);
  const t = await tenancyRow(env, tenancy_id);
  const prev = await env.DB.prepare("SELECT revision, evidence_refs FROM tenancy_entry_inventories WHERE tenancy_id = ?").bind(t.id).first();
  if ((prev?.revision ?? 0) !== rev) fail(409, STALE);
  const ts = now(), next = rev + 1, kept = new Map(JSON.parse(prev?.evidence_refs ?? "[]").map(r => [r.evidence_ref, r]));
  const refs = value.evidence_refs.map(r => kept.get(r) ?? { evidence_ref: r, reviewed_at: ts, reviewed_by: actor, revision: next });
  const cols = [JSON.stringify(value.rooms), JSON.stringify(value.meter_readings), JSON.stringify(refs), ts, actor];
  const write = rev === 0
    ? env.DB.prepare(`INSERT INTO tenancy_entry_inventories (tenancy_id, revision, rooms, meter_readings, evidence_refs, updated_at,
      updated_by) VALUES (?, 1, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).bind(t.id, ...cols)
    : env.DB.prepare(`UPDATE tenancy_entry_inventories SET revision = ?, rooms = ?, meter_readings = ?, evidence_refs = ?,
      updated_at = ?, updated_by = ? WHERE tenancy_id = ? AND revision = ?`).bind(next, ...cols, t.id, rev);
  // The history counts what changed; the references themselves stay out of it.
  await casWrite(env, "tenancy_entry_inventories", t, rev, write, actor, "tenancy.entry_inventory_saved", { revision: next,
    rooms: value.rooms.length, meter_readings: value.meter_readings.length, evidence_refs: refs.length });
  return { inventory_id: t.id, revision: next, entry_inventory: { tenancy_id: t.id, revision: next, rooms: value.rooms,
    meter_readings: value.meter_readings, evidence_refs: refs, updated_at: ts, updated_by: actor } };
}
