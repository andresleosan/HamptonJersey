import { json, fail, readJson, now } from "../http.js";
import { validateApplicant, normalizePhone, OPTIONS } from "../applicants.js";
import { logEvent, resolveNotices } from "../events.js";

const STAGES = OPTIONS.stages.map(([v]) => v);
const OPERATION_LABEL = Object.fromEntries(OPTIONS.operation);
const JSON_FIELDS = ["property_types", "outdoor", "pets", "parishes_wanted", "parishes_excluded"];
// What an applicant edit may change; source stays as it was registered.
const SEARCH_FIELDS = ["operation", "budget_min", "budget_max", "budget_stretch", "property_types", "bedrooms_min",
  "bedrooms_ideal", "bathrooms_min", "parking_spaces", "outdoor", "furnished", "pets", "parishes_wanted", "parishes_excluded",
  "near", "move_in_date", "lease_term_months", "buyer_position", "mortgage_aip", "housing_status", "household_adults",
  "household_children", "requirements"];
const CONTACT_FIELDS = ["name", "email", "phone", "preferred_channel", "best_time"];
const STALE = {
  applicant: "Someone else saved changes to this applicant. Reload to see them (your changes were not saved).",
  contact: "Someone else saved changes to this contact. Reload to see them (your changes were not saved).",
};

const pick = (o, keys) => Object.fromEntries(keys.filter(k => Object.hasOwn(o, k)).map(k => [k, o[k]]));
const parsed = row => ({ ...row, ...Object.fromEntries(JSON_FIELDS.filter(k => k in row)
  .map(k => [k, row[k] == null ? null : JSON.parse(row[k])])) });
const withData = e => ({ ...e, data: e.data == null ? null : JSON.parse(e.data) });
const fieldErrors = errors => json({ error: "Please check the highlighted fields", fields: errors }, 400);
const asObject = body => (body && typeof body === "object" && !Array.isArray(body) ? body : fail(400, "Invalid format"));

async function loadApplicant(env, id) {
  const a = await env.DB.prepare("SELECT * FROM applicants WHERE id = ?").bind(Number(id)).first();
  return a ?? fail(404, "Applicant not found");
}
async function loadContact(env, id) {
  const c = await env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(Number(id)).first();
  return c ?? fail(404, "Contact not found");
}

// G2: the 12-month retention clock restarts with every write to the contact or its searches.
const touch = (env, contactId, ts) =>
  env.DB.prepare("UPDATE contacts SET last_activity_at = ? WHERE id = ?").bind(ts, contactId);

// Optimistic lock inside the batch: a stale version sets updated_at to NULL, the NOT NULL constraint fails and the
// whole batch (events included) rolls back, even when another save lands between our check and our write.
// Bind: the updated_at the client saw, then the new one.
const LOCK = "updated_at = CASE WHEN updated_at = ? THEN ? END";
// Whatever the error says, the row tells what happened: gone (404), saved by someone else (409), or neither (rethrow).
async function saveVersioned(env, stmts, entity, id, seen) {
  try { await env.DB.batch(stmts); } catch (e) {
    const row = await env.DB.prepare(`SELECT updated_at FROM ${entity}s WHERE id = ?`).bind(id).first();
    if (!row) fail(404, `${entity[0].toUpperCase()}${entity.slice(1)} not found`);
    if (row.updated_at !== seen) fail(409, STALE[entity]);
    throw e;
  }
}

// "Active search" (same rule as notifications.js): not archived, lost or completed; a paused one is still active.
const ACTIVE = "s.archived_at IS NULL AND s.stage NOT IN ('lost', 'completed')";

// before/after with only the changed fields; JSON lists as lists.
function diff(cur, next) {
  const keys = Object.keys(next).filter(k => next[k] !== cur[k]);
  return { keys, data: { before: parsed(pick(cur, keys)), after: parsed(pick(next, keys)) } };
}

const findContact = (env, { email, phone }, exceptId = 0) => env.DB.prepare(
  "SELECT id, name FROM contacts WHERE id <> ? AND (email = ? OR phone = ?) ORDER BY id LIMIT 1")
  .bind(exceptId, email, phone).first();

async function list({ request, env }) {
  const p = new URL(request.url).searchParams;
  const operation = p.get("operation") || null, sort = p.get("sort") || "newest", stage = p.get("stage") || null;
  const assigned = p.get("assigned")?.trim().toLowerCase() || null, q = p.get("q")?.trim() || null;
  if (operation && !OPTIONS.operation.some(([v]) => v === operation)) fail(400, "Invalid operation");
  if (!["newest", "oldest"].includes(sort)) fail(400, "Invalid sort");
  if (stage && !STAGES.includes(stage)) fail(400, "Invalid stage");
  const where = [p.get("archived") === "1" ? "a.archived_at IS NOT NULL" : "a.archived_at IS NULL"], args = [];
  if (operation) { where.push("a.operation = ?"); args.push(operation); }
  if (stage) { where.push("a.stage = ?"); args.push(stage); }
  if (assigned) { where.push("a.assigned_to = ?"); args.push(assigned); }
  if (q) {
    const like = s => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
    // A phone in any format ("07797 123 456") is found by its stored form; part of a number by its digits.
    const phone = normalizePhone(q) ?? q.replace(/[\s\-.()]/g, "");
    where.push("(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')");
    args.push(like(q), like(q), like(phone));
  }
  const dir = sort === "oldest" ? "ASC" : "DESC";
  // ponytail: no paging; the team has hundreds of applicants, not tens of thousands.
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.operation, a.stage, a.lost_reason, a.created_at, a.assigned_to, ad.name AS assigned_name, c.name, c.phone, c.email
     FROM applicants a JOIN contacts c ON c.id = a.contact_id LEFT JOIN admins ad ON ad.email = a.assigned_to
     WHERE ${where.join(" AND ")} ORDER BY a.created_at ${dir}, a.id ${dir}`).bind(...args).all();
  return json({ applicants: results });
}

async function detail({ env, params: [id] }) {
  const applicant = await loadApplicant(env, id);
  const contact = await loadContact(env, applicant.contact_id);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  // ponytail: a viewing matches when its phone, without spaces, dashes or brackets, ends in the contact's last
  // 9 digits. Catches "07797 123 456" for +447797123456; a foreign number sharing those 9 digits would match too,
  // and dots are not stripped. F3 links viewings to contacts for real (G4).
  const last9 = contact.phone ? contact.phone.slice(1).slice(-9) : null;
  const [events, viewings, duplicates] = (await env.DB.batch([
    q(`SELECT * FROM events WHERE (entity_type = 'applicant' AND entity_id = ?) OR (entity_type = 'contact' AND entity_id = ?)
       ORDER BY at DESC, id DESC`, String(applicant.id), String(contact.id)),
    q(`SELECT v.*, COALESCE(l.title, v.listing_title_snapshot) AS listing_title
       FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id
       WHERE lower(v.email) = ? OR (? IS NOT NULL AND replace(replace(replace(replace(v.phone, ' ', ''), '-', ''), '(', ''), ')', '') LIKE '%' || ?)
       ORDER BY v.created_at DESC, v.id DESC`, contact.email, last9, last9),
    // active_search_id: the contact's active search with the submitted operation; null = "Create second search" applies.
    q(`SELECT n.id, n.title, n.created_at, e.id AS event_id, e.data,
         (SELECT s.id FROM applicants s WHERE s.contact_id = ? AND ${ACTIVE} AND s.operation IS json_extract(e.data, '$.operation')
          ORDER BY s.created_at DESC, s.id DESC LIMIT 1) AS active_search_id
       FROM notifications n JOIN events e ON e.id = n.event_id
       WHERE n.resolved_at IS NULL AND e.entity_type = 'contact' AND e.entity_id = ? AND e.type = 'applicant.duplicate_submitted'
       ORDER BY n.created_at DESC, n.id DESC`, contact.id, String(contact.id)),
  ])).map(r => r.results);
  return json({ applicant: parsed(applicant), contact, events: events.map(withData), viewings, duplicates: duplicates.map(withData) });
}

async function create({ request, env, admin }) {
  const body = await readJson(request);
  let contact = null;
  if (body?.contact_id != null) {
    if (!Number.isInteger(Number(body.contact_id))) fail(400, "Invalid contact");
    contact = await loadContact(env, body.contact_id);
  }
  const ts = now();
  // "Add a new search for this contact": the stored contact stands in for the form's contact fields, unchanged.
  const r = validateApplicant(contact ? { ...body, name: contact.name, email: contact.email, phone: contact.phone } : body,
    { publicForm: false }, ts);
  if (r.errors) return fieldErrors(r.errors);
  const taken = c => json({ error: `${c.name} is already a contact`, contact_id: c.id }, 409);
  if (!contact) { const c = await findContact(env, r.value.contact); if (c) return taken(c); }
  else {
    // One active search per operation: a second one would split the contact's history (§3.3 "Create second search").
    const s = await env.DB.prepare(`SELECT s.id FROM applicants s WHERE s.contact_id = ? AND s.operation = ? AND ${ACTIVE}
      ORDER BY s.created_at DESC, s.id DESC LIMIT 1`).bind(contact.id, r.value.applicant.operation).first();
    if (s) return json({ error: `${contact.name} already has an active ${OPERATION_LABEL[r.value.applicant.operation]} search.`,
      applicant_id: s.id }, 409);
  }

  const stamps = { created_at: ts, updated_at: ts, updated_by: admin };
  const person = { ...r.value.contact, last_activity_at: ts, ...stamps }, a = { ...r.value.applicant, ...stamps };
  const cols = row => Object.keys(row).join(", "), marks = row => Object.keys(row).map(() => "?").join(", ");
  const name = contact?.name ?? person.name;
  const stmts = [
    ...(contact ? [] : [env.DB.prepare(`INSERT INTO contacts (${cols(person)}) VALUES (${marks(person)})`).bind(...Object.values(person))]),
    // A new contact is the row inserted just before, in the same batch.
    env.DB.prepare(`INSERT INTO applicants (contact_id, ${cols(a)}) VALUES (${contact ? "?" : "last_insert_rowid()"}, ${marks(a)})`)
      .bind(...(contact ? [contact.id] : []), ...Object.values(a)),
    // Entered by the team: the Feed tells the others, nobody needs to act (§3.2).
    ...logEvent(env, { actor: admin, entity_type: "applicant", entity_id: null, type: "applicant.created",
      data: { operation: a.operation, source: a.source } },
    { category: "new_applicant", title: `New applicant: ${name} · ${OPERATION_LABEL[a.operation]}`, action_required: false }),
    ...(contact ? [touch(env, contact.id, ts)] : []),
  ];
  let results;
  try { results = await env.DB.batch(stmts); } catch (e) {
    // Another admin added the same email or phone a moment ago.
    const c = /UNIQUE/i.test(String(e?.message)) && !contact && await findContact(env, r.value.contact);
    if (c) return taken(c);
    throw e;
  }
  return json({ id: results[contact ? 0 : 1].meta.last_row_id }, 201);
}

async function update({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request));
  if (typeof body.updated_at !== "string") fail(400, "Missing updated_at: reload the applicant");
  const cur = await loadApplicant(env, id);
  if (body.updated_at !== cur.updated_at) fail(409, STALE.applicant);
  const contact = await loadContact(env, cur.contact_id);

  // Fields left out of the body keep their stored value. A move-in date already saved may be in the past by now:
  // it is only checked when it changes. The stored contact and a panel source only complete the shared form check.
  const form = { ...parsed(pick(cur, SEARCH_FIELDS)), ...pick(body, SEARCH_FIELDS) };
  const keepDate = form.move_in_date === cur.move_in_date;
  const r = validateApplicant({ ...form, move_in_date: keepDate ? null : form.move_in_date,
    name: contact.name, email: contact.email, phone: contact.phone, source: "phone" }, { publicForm: false });
  const errors = { ...r.errors };

  const stage = Object.hasOwn(body, "stage") ? body.stage : cur.stage;
  if (!STAGES.includes(stage)) errors.stage = "Choose one of the stages";
  let lost_reason = null;
  if (stage === "lost") {
    const v = Object.hasOwn(body, "lost_reason") ? body.lost_reason : cur.lost_reason;
    lost_reason = typeof v === "string" ? v.trim() : "";
    if (!lost_reason) errors.lost_reason = "Say why the search was lost";
    else if (lost_reason.length > 200) errors.lost_reason = "Use 200 characters or fewer";
  }
  let assigned_to = cur.assigned_to;
  if (Object.hasOwn(body, "assigned_to")) {
    const v = body.assigned_to;
    assigned_to = v == null || v === "" ? null : typeof v === "string" ? v.trim().toLowerCase() : "";
    // Checked only when it changes: someone whose access was removed can stay on an old search.
    if (assigned_to !== null && assigned_to !== cur.assigned_to
      && !(await env.DB.prepare("SELECT 1 FROM admins WHERE email = ?").bind(assigned_to).first()))
      errors.assigned_to = "Choose someone with access to the panel";
  }
  if (Object.keys(errors).length) return fieldErrors(errors);

  const { source, ...search } = r.value.applicant;
  const next = { ...search, move_in_date: keepDate ? cur.move_in_date : search.move_in_date, stage, lost_reason, assigned_to };
  const { keys, data } = diff(cur, next);
  if (!keys.length) return json({ applicant: parsed(cur) });

  const ts = now();
  const leftNew = cur.stage === "new" && stage !== "new";
  await saveVersioned(env, [
    env.DB.prepare(`UPDATE applicants SET ${keys.map(k => `${k} = ?`).join(", ")}, updated_by = ?, ${LOCK} WHERE id = ?`)
      .bind(...keys.map(k => next[k]), admin, body.updated_at, ts, cur.id),
    ...logEvent(env, { actor: admin, entity_type: "applicant", entity_id: String(cur.id),
      type: keys.includes("stage") ? "applicant.stage_changed" : "applicant.updated", data }),
    touch(env, cur.contact_id, ts),
    // Someone has picked it up: the new-applicant notice is done (§3.2).
    ...((keys.includes("assigned_to") && assigned_to) || leftNew
      ? [resolveNotices(env, { entity_type: "applicant", entity_id: String(cur.id), category: "new_applicant" }, admin)] : []),
  ], "applicant", cur.id, body.updated_at);
  return json({ applicant: parsed(await loadApplicant(env, cur.id)) });
}

// "Add a new search for this contact" (#/applicants/new?contact=<id>) shows the contact it starts from.
const contactDetail = async ({ env, params: [id] }) => json({ contact: await loadContact(env, id) });

async function updateContact({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request));
  if (typeof body.updated_at !== "string") fail(400, "Missing updated_at: reload the applicant");
  const cur = await loadContact(env, id);
  if (body.updated_at !== cur.updated_at) fail(409, STALE.contact);
  // Same shared check as the form; operation and source are only there to complete it.
  const r = validateApplicant({ ...pick(cur, CONTACT_FIELDS), ...pick(body, CONTACT_FIELDS), operation: "rent", source: "phone" },
    { publicForm: false });
  if (r.errors) return fieldErrors(r.errors);
  const next = pick(r.value.contact, CONTACT_FIELDS);
  const { keys, data } = diff(cur, next);
  if (!keys.length) return json({ contact: cur });

  const taken = c => json({ error: "Another contact already uses this email or phone number", contact_id: c.id }, 409);
  const other = await findContact(env, next, cur.id);
  if (other) return taken(other);
  const ts = now();
  try {
    await saveVersioned(env, [
      env.DB.prepare(`UPDATE contacts SET ${keys.map(k => `${k} = ?`).join(", ")}, last_activity_at = ?, updated_by = ?, ${LOCK} WHERE id = ?`)
        .bind(...keys.map(k => next[k]), ts, admin, body.updated_at, ts, cur.id),
      ...logEvent(env, { actor: admin, entity_type: "contact", entity_id: String(cur.id), type: "contact.updated", data }),
    ], "contact", cur.id, body.updated_at);
  } catch (e) {
    const c = /UNIQUE/i.test(String(e?.message)) && await findContact(env, next, cur.id);
    if (c) return taken(c);
    throw e;
  }
  return json({ contact: await loadContact(env, cur.id) });
}

async function setArchived({ env, admin, params: [id, action] }) {
  const cur = await loadApplicant(env, id);
  if (action === "archive" && cur.archived_at) fail(400, "The applicant is already archived");
  if (action === "restore" && !cur.archived_at) fail(400, "The applicant isn't archived");
  const ts = now(), ref = { entity_type: "applicant", entity_id: String(cur.id) };
  await env.DB.batch([
    env.DB.prepare("UPDATE applicants SET archived_at = ?, updated_at = ?, updated_by = ? WHERE id = ?")
      .bind(action === "archive" ? ts : null, ts, admin, cur.id),
    ...logEvent(env, { actor: admin, ...ref, type: action === "archive" ? "applicant.archived" : "applicant.restored" }),
    touch(env, cur.contact_id, ts),
    ...(action === "archive" ? [resolveNotices(env, ref, admin)] : []),
  ]);
  return json({ applicant: parsed(await loadApplicant(env, cur.id)) });
}

// §3.4: from Archived only, typing the contact's name. The history keeps each event's type, date and actor, without data.
async function remove({ request, env, admin, params: [id] }) {
  const cur = await loadApplicant(env, id);
  const contact = await loadContact(env, cur.contact_id);
  if (!cur.archived_at) fail(400, "Only archived applicants can be deleted");
  if ((await readJson(request))?.confirm !== contact.name) fail(400, `Type ${contact.name} to confirm deletion`);
  const others = await env.DB.prepare("SELECT COUNT(*) AS n FROM applicants WHERE contact_id = ? AND id <> ?")
    .bind(contact.id, cur.id).first();
  const ts = now();
  const refs = [{ entity_type: "applicant", entity_id: String(cur.id) },
    ...(others.n ? [] : [{ entity_type: "contact", entity_id: String(contact.id) }])];
  const ofRefs = refs.map(() => "(entity_type = ? AND entity_id = ?)").join(" OR ");
  const refArgs = refs.flatMap(r => [r.entity_type, r.entity_id]);
  await env.DB.batch([
    ...refs.map(ref => resolveNotices(env, ref, admin)),
    env.DB.prepare(`UPDATE notifications SET title = 'Deleted applicant' WHERE event_id IN (SELECT id FROM events WHERE ${ofRefs})`)
      .bind(...refArgs),
    // NULL, never '': the Inbox runs json_extract on it.
    env.DB.prepare(`UPDATE events SET data = NULL WHERE ${ofRefs}`).bind(...refArgs),
    env.DB.prepare("DELETE FROM applicants WHERE id = ?").bind(cur.id),
    ...(others.n ? [touch(env, contact.id, ts)] : [env.DB.prepare("DELETE FROM contacts WHERE id = ?").bind(contact.id)]),
    ...refs.flatMap(ref => logEvent(env, { actor: admin, ...ref, type: `${ref.entity_type}.deleted` })),
  ]);
  return json({ ok: true });
}

export default [
  ["GET", /^\/admin\/applicants$/, list, true],
  ["POST", /^\/admin\/applicants$/, create, true],
  ["GET", /^\/admin\/applicants\/(\d+)$/, detail, true],
  ["PUT", /^\/admin\/applicants\/(\d+)$/, update, true],
  ["DELETE", /^\/admin\/applicants\/(\d+)$/, remove, true],
  ["POST", /^\/admin\/applicants\/(\d+)\/(archive|restore)$/, setArchived, true],
  ["GET", /^\/admin\/contacts\/(\d+)$/, contactDetail, true],
  ["PUT", /^\/admin\/contacts\/(\d+)$/, updateContact, true],
];
