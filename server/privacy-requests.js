import { json, fail, readJson, now, sha256 } from "./http.js";
import { NO_SALE, HAS_OPEN_OFFER, HAS_OPEN_SEARCH } from "./retention.js";
import { jerseyToday } from "./viewings.js";

// PRE-12: the team's register of privacy requests received by email, phone, letter or in person (migration 0101).
// A person records each one, links the contact, checks the identity and reviews the copy before handing it over.
// Nothing here deletes or sends anything: an erasure request lists what the existing Delete would remove and what the
// cleanup's own exceptions keep. Switched off (the default), nothing is mounted or read. The audit keeps ids and actions
// only; nothing personal goes to logs or events.
export const privacyRequestsReady = env => env?.PRE12_REQUESTS_READY === "1";

const KINDS = ["access", "rectification", "erasure", "objection", "portability"];
const VIAS = ["email", "phone", "letter", "in_person"];
const METHODS = ["photo_id", "details_on_record", "in_person", "other"];
const RESULTS = ["fulfilled", "partially_fulfilled", "refused", "withdrawn"];
const COPY_KINDS = ["access", "portability"];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STALE = "Someone else changed this request. Reload it before continuing.";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = v => typeof v === "string" && DATE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const text = (v, max) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= max;
const bad = fields => json({ error: Object.values(fields)[0], fields }, 400);

const load = (env, id) => env.DB.prepare(`SELECT r.*, c.name AS contact_name FROM privacy_requests r
  LEFT JOIN contacts c ON c.id = r.contact_id WHERE r.id = ?`).bind(id).first();
const output = r => ({ id: r.id, kind: r.kind, received_on: r.received_on, received_via: r.received_via, due_on: r.due_on,
  reference: r.reference, contact: r.contact_id == null ? null : { id: r.contact_id, name: r.contact_name },
  assigned_to: r.assigned_to, identity: r.identity_method ? { method: r.identity_method, reference: r.identity_ref,
    verified_by: r.identity_verified_by, verified_at: r.identity_verified_at } : null,
  copy_review: r.copy_hash ? { sha256: r.copy_hash, reviewed_by: r.copy_reviewed_by, reviewed_at: r.copy_reviewed_at } : null,
  state: r.state, result: r.result, result_note: r.result_note, closed_by: r.closed_by, closed_at: r.closed_at,
  revision: r.revision, created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at });
const current = async (env, id) => (await load(env, id)) ?? fail(404, "Request not found");
const isAdmin = async (env, email) => !!(await env.DB.prepare("SELECT 1 FROM admins WHERE email = ?").bind(email).first());

// One change: compare-and-set on the revision of an open request, and its audit row in the same batch.
async function change(env, id, body, actor, action, set) {
  if (!Number.isSafeInteger(body?.revision)) fail(400, "Reload the request first");
  const ts = now(), [sql, binds] = set(ts);
  const [u] = await env.DB.batch([
    env.DB.prepare(`UPDATE privacy_requests SET ${sql}, revision = revision + 1, updated_by = ?, updated_at = ?
      WHERE id = ? AND revision = ? AND state = 'open'`).bind(...binds, actor, ts, id, body.revision),
    env.DB.prepare(`INSERT INTO privacy_request_audit (request_id, revision, action, actor, at)
      SELECT id, revision, ?, ?, ? FROM privacy_requests WHERE id = ? AND changes() = 1`).bind(action, actor, ts, id),
  ]);
  if (!u.meta.changes) fail(409, (await current(env, id)).state === "closed" ? "This request is closed." : STALE);
  return json({ request: output(await load(env, id)) });
}

async function list({ env }) {
  const [{ results }, { results: team }] = await env.DB.batch([
    env.DB.prepare(`SELECT r.*, c.name AS contact_name FROM privacy_requests r LEFT JOIN contacts c ON c.id = r.contact_id
      ORDER BY r.state = 'closed', COALESCE(r.due_on, '9999-12-31'), r.received_on, r.created_at LIMIT 200`),
    env.DB.prepare("SELECT email, name FROM admins ORDER BY email"),
  ]);
  return json({ requests: results.map(output), team });
}

async function create({ request, env, admin }) {
  const b = await readJson(request);
  if (!b || typeof b !== "object" || Array.isArray(b)) fail(400, "Invalid format");
  const errors = {};
  if (typeof b.id !== "string" || !new RegExp(`^${UUID}$`).test(b.id)) errors.id = "Reload the page and try again";
  if (!KINDS.includes(b.kind)) errors.kind = "Choose the type of request";
  if (!isDate(b.received_on) || b.received_on > jerseyToday()) errors.received_on = "Enter the day it arrived, not a future date";
  if (!VIAS.includes(b.received_via)) errors.received_via = "Choose how it arrived";
  const due = b.due_on ?? null;
  if (due !== null && (!isDate(due) || (isDate(b.received_on) && due < b.received_on))) errors.due_on = "Enter a deadline on or after the day it arrived";
  if (!text(b.reference, 200)) errors.reference = "Say where it came from, in up to 200 characters";
  const assigned = b.assigned_to ?? null;
  if (assigned !== null && (typeof assigned !== "string" || !(await isAdmin(env, assigned)))) errors.assigned_to = "Choose someone on the team";
  if (Object.keys(errors).length) return bad(errors);
  const ts = now(), reference = b.reference.trim();
  const [ins] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO privacy_requests (id, kind, received_on, received_via, due_on, reference, assigned_to,
      created_by, created_at, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING`)
      .bind(b.id, b.kind, b.received_on, b.received_via, due, reference, assigned, admin, ts, admin, ts),
    env.DB.prepare(`INSERT INTO privacy_request_audit (request_id, revision, action, actor, at)
      SELECT ?, 1, 'created', ?, ? WHERE changes() = 1`).bind(b.id, admin, ts),
  ]);
  const r = await load(env, b.id);
  // A repeated save of the same request returns it; the same id with something else is refused.
  if (!ins.meta.changes && (r.created_by !== admin || r.kind !== b.kind || r.received_on !== b.received_on
    || r.received_via !== b.received_via || r.reference !== reference)) fail(409, "This request was already saved differently. Reload the page.");
  return json({ request: output(r) }, ins.meta.changes ? 201 : 200);
}

async function update({ request, env, admin, params: [id] }) {
  const b = await readJson(request), cur = await current(env, id), errors = {};
  const due = b?.due_on ?? null, assigned = b?.assigned_to ?? null;
  if (due !== null && (!isDate(due) || due < cur.received_on)) errors.due_on = "Enter a deadline on or after the day it arrived";
  if (!text(b?.reference, 200)) errors.reference = "Say where it came from, in up to 200 characters";
  if (assigned !== null && (typeof assigned !== "string" || !(await isAdmin(env, assigned)))) errors.assigned_to = "Choose someone on the team";
  if (Object.keys(errors).length) return bad(errors);
  return change(env, id, b, admin, "updated", () => ["assigned_to = ?, due_on = ?, reference = ?", [assigned, due, b.reference.trim()]]);
}

// A person chooses the contact; an email or a phone that matches never links one by itself. Another contact (or none)
// clears the identity check and the copy review, which were for the previous one.
async function link({ request, env, admin, params: [id] }) {
  const b = await readJson(request);
  const contact = b?.contact_id ?? null;
  if (contact !== null && !Number.isSafeInteger(contact)) return bad({ contact_id: "Choose a contact" });
  if (contact !== null && !(await env.DB.prepare("SELECT 1 FROM contacts WHERE id = ?").bind(contact).first())) fail(404, "Contact not found");
  try {
    return await change(env, id, b, admin, "contact_linked", () => [`contact_id = ?, identity_method = NULL, identity_ref = NULL,
      identity_verified_by = NULL, identity_verified_at = NULL, copy_hash = NULL, copy_reviewed_by = NULL, copy_reviewed_at = NULL`, [contact]]);
  } catch (e) { if (/FOREIGN KEY/i.test(String(e?.message))) fail(404, "Contact not found"); throw e; }
}

// Search posted, so a name, email or phone never goes in an address or a log line.
async function searchContacts({ request, env }) {
  const q = (await readJson(request))?.q;
  if (typeof q !== "string" || q.trim().length < 2 || q.length > 100) return bad({ q: "Type at least 2 characters" });
  const like = `%${q.trim().toLowerCase().replace(/[\\%_]/g, c => `\\${c}`)}%`;
  const { results } = await env.DB.prepare(`SELECT id, name, email, phone FROM contacts WHERE lower(name) LIKE ?1 ESCAPE '\\'
    OR lower(email) LIKE ?1 ESCAPE '\\' OR replace(phone, ' ', '') LIKE ?1 ESCAPE '\\' ORDER BY name, id LIMIT 10`).bind(like).all();
  return json({ contacts: results });
}

// The person's identity, checked by a team member: who (the signed-in admin, never the body), how and when.
async function verify({ request, env, admin, params: [id] }) {
  const b = await readJson(request), cur = await current(env, id);
  if (cur.contact_id == null) return bad({ contact: "Link the contact first" });
  const ref = b?.reference ?? null;
  if (!METHODS.includes(b?.method)) return bad({ method: "Choose how the identity was checked" });
  if (ref !== null && ref !== "" && !text(ref, 120)) return bad({ reference: "Use up to 120 characters" });
  return change(env, id, b, admin, "identity_verified", ts => [`identity_method = ?, identity_ref = ?, identity_verified_by = ?,
    identity_verified_at = ?`, [b.method, ref ? ref.trim() : null, admin, ts]]);
}

// The cleanup's own exceptions (server/retention.js), read for this contact: the same rule keeps the same people.
async function holds(env, contactId) {
  const h = await env.DB.prepare(`SELECT NOT (${NO_SALE}) AS sale, ${HAS_OPEN_OFFER} AS open_offer, ${HAS_OPEN_SEARCH} AS open_search
    FROM contacts c WHERE c.id = ?`).bind(contactId).first();
  return h ? ["sale", "open_offer", "open_search"].filter(k => h[k]).map(code => ({ code })) : [];
}

// What the existing Delete (an archived applicant's, §3.4) would remove for this contact, and what it leaves to a person.
// Viewing requests carry no contact id: those with the same non-empty email or phone are only possible matches (other
// people can share them), counted for a person to check one by one, never listed or deleted here. Rentals are not linked
// to contacts: they are named for a check by hand, never matched.
async function erasurePlan(env, contactId, kept) {
  const n = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM applicants WHERE contact_id = ?1) AS searches,
    (SELECT COUNT(*) FROM offers o JOIN applicants s ON s.id = o.applicant_id WHERE s.contact_id = ?1) AS offers,
    (SELECT COUNT(*) FROM matches m JOIN applicants s ON s.id = m.applicant_id WHERE s.contact_id = ?1) AS matches,
    (SELECT COUNT(*) FROM marketing_preferences WHERE contact_id = ?1) AS marketing_preferences,
    (SELECT COUNT(*) FROM viewing_requests v JOIN contacts c ON c.id = ?1
      WHERE (c.email <> '' AND v.email <> '' AND lower(v.email) = lower(c.email))
        OR (c.phone <> '' AND v.phone <> '' AND v.phone = c.phone)) AS viewing_requests`).bind(contactId).first();
  return { can_delete: kept.length === 0,
    remove: [{ item: "contact", count: 1 }, ...["searches", "offers", "matches", "marketing_preferences"].map(item => ({ item, count: n[item] }))],
    by_hand: [{ item: "viewing_requests", count: n.viewing_requests }, { item: "rentals", count: null }] };
}

async function detail({ env, params: [id] }) {
  const r = await current(env, id);
  const kept = r.contact_id == null ? [] : await holds(env, r.contact_id);
  const [{ results: audit }] = await env.DB.batch([env.DB.prepare(`SELECT revision, action, actor, at FROM privacy_request_audit
    WHERE request_id = ? ORDER BY id`).bind(id)]);
  return json({ request: output(r), holds: kept, audit,
    erasure: r.kind === "erasure" && r.contact_id != null ? await erasurePlan(env, r.contact_id, kept) : null });
}

// The copy for an access or portability request: explicit fields of the records linked to the contact by id, read in one
// batch, never SELECT *. Staff notes, message bodies, records shared with other people and anything matched only by an
// email or a phone (viewing requests) stay out and are named as such, for a person to review separately.
const CONTACT = ["name", "email", "phone", "preferred_channel", "best_time", "privacy_ack_at", "marketing_opt_in_at",
  "consent_source", "created_at", "last_activity_at"];
const SEARCH = ["id", "operation", "search_state", "created_at", "resolved_at", "budget_min", "budget_max", "budget_stretch",
  "property_types", "bedrooms_min", "bedrooms_max", "bedrooms_ideal", "bathrooms_min", "parking_spaces", "outdoor", "furnished",
  "pets", "parishes_wanted", "parishes_excluded", "preferred_parish", "near", "move_in_date", "lease_term_months", "buyer_position",
  "mortgage_aip", "housing_status", "household_adults", "household_children", "household_children_status", "requirements",
  "preferred_language", "viewing_availability", "area_min", "area_max", "area_unit"];
const OFFER = ["id", "applicant_id", "listing_id", "amount", "conditions", "status", "counter_amount", "created_at"];
const PREFERENCE = ["purpose", "channel", "value", "source", "updated_at"];
const NOT_INCLUDED = [
  "Emails and website chats are reviewed separately by our team.",
  "Internal notes, and records that also hold other people's details (such as sale files), are reviewed separately.",
  "Ages of children in the household are reviewed separately before they are shared.",
  "Rental records are kept apart from this register and reviewed separately.",
  "Viewing requests are matched to you only by email or phone, so our team checks each one before sharing it.",
];
const cols = (fields, alias) => fields.map(f => `${alias}.${f}`).join(", ");

async function buildCopy(env, r) {
  if (!COPY_KINDS.includes(r.kind)) fail(400, "Only access and portability requests have a copy");
  if (r.contact_id == null || !r.identity_method) fail(400, "Link the contact and check the identity first");
  const [{ results: [contact] }, { results: searches }, { results: offers }, { results: prefs }] =
    await env.DB.batch([
      env.DB.prepare(`SELECT ${cols(CONTACT, "c")} FROM contacts c WHERE c.id = ?`).bind(r.contact_id),
      env.DB.prepare(`SELECT ${cols(SEARCH, "s")} FROM applicants s WHERE s.contact_id = ? ORDER BY s.id`).bind(r.contact_id),
      env.DB.prepare(`SELECT ${cols(OFFER, "o")} FROM offers o JOIN applicants s ON s.id = o.applicant_id WHERE s.contact_id = ?
        ORDER BY o.id`).bind(r.contact_id),
      env.DB.prepare(`SELECT ${cols(PREFERENCE, "p")} FROM marketing_preferences p WHERE p.contact_id = ?
        ORDER BY p.purpose, p.channel`).bind(r.contact_id),
    ]);
  if (!contact) fail(404, "Contact not found");
  const copy = { schema_version: 1, controller: "Hampton Estates LTD", request_id: r.id, contact, searches, offers,
    marketing_preferences: prefs, not_included: NOT_INCLUDED };
  const document = JSON.stringify(copy, null, 2);
  return { copy, document, sha256: await sha256(document) };
}

async function copyPreview({ env, params: [id] }) {
  const { copy, sha256: hash } = await buildCopy(env, await current(env, id));
  return json({ copy, sha256: hash });
}

// The reviewer confirms the copy they read (its hash); if the data changed meanwhile, they read it again.
async function reviewCopy({ request, env, admin, params: [id] }) {
  const b = await readJson(request), { sha256: hash } = await buildCopy(env, await current(env, id));
  if (b?.sha256 !== hash) fail(409, "The data changed since you opened the copy. Review it again.");
  return change(env, id, b, admin, "copy_reviewed", ts => ["copy_hash = ?, copy_reviewed_by = ?, copy_reviewed_at = ?", [hash, admin, ts]]);
}

const csvText = v => (/^(?:[\u0000-\u001f\u007f-\u009f]|\s*[=+\-@])/.test(v) ? `'${v}` : v);
const csvCell = v => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
function toCsv(copy) {
  const rows = [["section", "record", "field", "value"]];
  const add = (section, record, obj) => { for (const [k, v] of Object.entries(obj)) rows.push([section, String(record), k, v == null ? "" : String(v)]); };
  add("contact", 1, copy.contact);
  for (const s of ["searches", "offers", "marketing_preferences"]) copy[s].forEach((x, i) => add(s, i + 1, x));
  copy.not_included.forEach((t, i) => rows.push(["not_included", String(i + 1), "note", t]));
  return rows.map(r => r.map((v, i) => csvCell(i === 3 ? csvText(v) : v)).join(",")).join("\r\n") + "\r\n";
}

// Only the copy a person reviewed, unchanged since: anything else is 409 and needs a new review.
async function download({ request, env, params: [id] }) {
  const r = await current(env, id), format = new URL(request.url).searchParams.get("format");
  if (!["json", "csv"].includes(format)) fail(400, "Choose JSON or CSV");
  if (!r.copy_hash) fail(409, "Review the copy before downloading it.");
  const built = await buildCopy(env, r);
  if (built.sha256 !== r.copy_hash) fail(409, "The data changed after the review. Review the copy again.");
  return new Response(format === "json" ? built.document : toCsv(built.copy), { headers: {
    "content-type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="hampton-data-copy-${r.id}.${format}"`, "cache-control": "no-store" } });
}

// The result is the team's record. Closing an erasure request deletes nothing; an access or portability request is
// fulfilled only with a reviewed copy.
async function close({ request, env, admin, params: [id] }) {
  const b = await readJson(request), cur = await current(env, id), note = b?.note ?? null;
  if (!RESULTS.includes(b?.result)) return bad({ result: "Choose the result" });
  if (note !== null && note !== "" && !text(note, 500)) return bad({ note: "Use up to 500 characters" });
  if (COPY_KINDS.includes(cur.kind) && ["fulfilled", "partially_fulfilled"].includes(b.result) && !cur.copy_hash)
    return bad({ result: "Review the copy before recording it as sent" });
  return change(env, id, b, admin, "closed", ts => ["state = 'closed', result = ?, result_note = ?, closed_by = ?, closed_at = ?",
    [b.result, note ? note.trim() : null, admin, ts]]);
}

// The panel's counter: open requests (Settings shows the page while the switch is on).
export const openPrivacyCount = async env =>
  (await env.DB.prepare("SELECT COUNT(*) AS n FROM privacy_requests WHERE state = 'open'").first()).n;

const ONE = `^/admin/privacy-requests/(${UUID})`;
export default [
  ["GET", /^\/admin\/privacy-requests$/, list, true],
  ["POST", /^\/admin\/privacy-requests$/, create, true],
  ["POST", /^\/admin\/privacy-requests\/contact-search$/, searchContacts, true],
  ["GET", new RegExp(`${ONE}$`), detail, true],
  ["PUT", new RegExp(`${ONE}$`), update, true],
  ["POST", new RegExp(`${ONE}/contact$`), link, true],
  ["POST", new RegExp(`${ONE}/identity$`), verify, true],
  ["GET", new RegExp(`${ONE}/copy$`), copyPreview, true],
  ["POST", new RegExp(`${ONE}/copy-review$`), reviewCopy, true],
  ["GET", new RegExp(`${ONE}/copy/download$`), download, true],
  ["POST", new RegExp(`${ONE}/close$`), close, true],
];
