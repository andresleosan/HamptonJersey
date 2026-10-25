import { json, fail, readJson, now } from "../http.js";
import { validateApplicant, normalizePhone, OPTIONS, QUEUES, activeSql } from "../applicants.js";
import { logEvent, resolveNotices } from "../events.js";
import { afterSave, recomputeForApplicant } from "../match-store.js";
import { MATCHES_SQL, matchCard } from "./matches.js";
import { EXEMPT, EXPIRING, KEPT_UNTIL } from "../retention.js";

const STAGES = OPTIONS.stages.map(([v]) => v);
const OPERATION_LABEL = Object.fromEntries(OPTIONS.operation);
const JSON_FIELDS = ["property_types", "outdoor", "pets", "parishes_wanted", "parishes_excluded"];
// What an applicant edit may change; source stays as it was registered.
const SEARCH_FIELDS = ["operation", "budget_min", "budget_max", "budget_stretch", "property_types", "bedrooms_min",
  "bedrooms_ideal", "bathrooms_min", "parking_spaces", "outdoor", "furnished", "pets", "parishes_wanted", "parishes_excluded",
  "near", "move_in_date", "lease_term_months", "buyer_position", "mortgage_aip", "housing_status", "household_adults",
  "household_children", "requirements"];
const CONTACT_FIELDS = ["name", "email", "phone", "preferred_channel", "best_time"];
const stale = entity => `Someone else saved changes to this ${entity}. Reload to see them (your changes were not saved).`;

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
export const touch = (env, contactId, ts) =>
  env.DB.prepare("UPDATE contacts SET last_activity_at = ? WHERE id = ?").bind(ts, contactId);

// Optimistic lock inside the batch: a stale version sets updated_at to NULL, the NOT NULL constraint fails and the
// whole batch (events included) rolls back, even when another save lands between our check and our write.
// Bind: the updated_at the client saw, then the new one.
export const LOCK = "updated_at = CASE WHEN updated_at = ? THEN ? END";
// Whatever the error says, the row tells what happened: gone (404), saved by someone else (409), or neither (rethrow).
// stmts[0] is the UPDATE. A row deleted (§3.4) after our read matches nothing and fails nothing: the last statement then
// wipes the data of the events this batch wrote, as the delete did for the earlier ones.
async function saveVersioned(env, stmts, entity, id, seen) {
  const missing = `${entity[0].toUpperCase()}${entity.slice(1)} not found`;
  let results;
  try {
    results = await env.DB.batch([...stmts, env.DB.prepare(`UPDATE events SET data = NULL WHERE entity_type = ? AND entity_id = ?
      AND NOT EXISTS (SELECT 1 FROM ${entity}s WHERE id = ?)`).bind(entity, String(id), id)]);
  } catch (e) {
    const row = await env.DB.prepare(`SELECT updated_at FROM ${entity}s WHERE id = ?`).bind(id).first();
    if (!row) fail(404, missing);
    if (row.updated_at !== seen) fail(409, stale(entity));
    throw e;
  }
  if (!results[0].meta.changes) fail(404, missing);
}

const ACTIVE = activeSql("s");

// B13: the applicant's work queue, one label in this order: New properties found (found ones created after the first
// review), Waiting for review (found ones left), In process (shortlisted ones), No matches (everything else).
const QUEUE = `CASE WHEN fresh THEN '${QUEUES[0]}' WHEN found > 0 THEN '${QUEUES[1]}' WHEN shortlisted > 0 THEN '${QUEUES[2]}'
  ELSE '${QUEUES[3]}' END`;
// Per listed applicant, through the (status, applicant_id) index: rejected history is never read.
const count = status => `(SELECT COUNT(*) FROM matches m WHERE m.status = '${status}' AND m.applicant_id = a.id)`;
const MATCH_COUNTS = `${count("found")} AS found, ${count("shortlisted")} AS shortlisted,
  EXISTS (SELECT 1 FROM matches m WHERE m.status = 'found' AND m.applicant_id = a.id AND m.created_at > a.first_reviewed_at) AS fresh`;

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
  const queue = p.get("queue") || null;
  if (operation && !OPTIONS.operation.some(([v]) => v === operation)) fail(400, "Invalid operation");
  if (!["newest", "oldest"].includes(sort)) fail(400, "Invalid sort");
  if (stage && !STAGES.includes(stage)) fail(400, "Invalid stage");
  if (queue && !QUEUES.includes(queue)) fail(400, "Invalid queue");
  // E8: Expiring lists the searches of the contacts deleted within a month, archived ones too (they go with them).
  const ts = now(), expiring = p.get("expiring") === "1";
  const where = [expiring ? EXPIRING : p.get("archived") === "1" ? "a.archived_at IS NOT NULL" : "a.archived_at IS NULL"];
  const args = expiring ? [ts, ts] : [];
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
    // Materialized: each listed applicant's counts are read once, not once per use in QUEUE.
    `WITH listed AS MATERIALIZED (SELECT a.id, a.operation, a.stage, a.lost_reason, a.created_at, a.assigned_to,
       ad.name AS assigned_name, c.name, c.phone, c.email, ${MATCH_COUNTS},
       CASE WHEN ${EXPIRING} THEN ${KEPT_UNTIL} END AS expires_on
       FROM applicants a JOIN contacts c ON c.id = a.contact_id LEFT JOIN admins ad ON ad.email = a.assigned_to
       WHERE ${where.join(" AND ")})
     SELECT id, operation, stage, lost_reason, created_at, assigned_to, assigned_name, name, phone, email, ${QUEUE} AS queue,
       found, shortlisted, expires_on FROM listed ${queue ? `WHERE ${QUEUE} = ?` : ""} ORDER BY created_at ${dir}, id ${dir}`)
    .bind(ts, ts, ...args, ...(queue ? [queue] : [])).all();
  return json({ applicants: results });
}

// E9: the day the contact's 12 months end, or none when a sale keeps it (E3).
const RETENTION_SQL = `SELECT ${KEPT_UNTIL} AS kept_until, NOT ${EXEMPT} AS exempt FROM contacts c WHERE c.id = ?`;
const keptFor = r => ({ kept_until: r.exempt ? null : r.kept_until, exempt: !!r.exempt });

async function detail({ env, params: [id] }) {
  const applicant = await loadApplicant(env, id);
  const contact = await loadContact(env, applicant.contact_id);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  // ponytail: a viewing matches when its phone, without spaces, dashes or brackets, ends in the contact's last
  // 9 digits. Catches "07797 123 456" for +447797123456; a foreign number sharing those 9 digits would match too,
  // and dots are not stripped. F3 links viewings to contacts for real (G4).
  const last9 = contact.phone ? contact.phone.slice(1).slice(-9) : null;
  const [events, viewings, duplicates, matches, [retention]] = (await env.DB.batch([
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
    // The Matches tab: Found, Shortlisted, Rejected, each best first.
    q(`${MATCHES_SQL} WHERE m.applicant_id = ?
       ORDER BY CASE m.status WHEN 'found' THEN 0 WHEN 'shortlisted' THEN 1 ELSE 2 END, m.score DESC, m.id`, applicant.id),
    q(RETENTION_SQL, contact.id),
  ])).map(r => r.results);
  return json({ applicant: parsed(applicant), contact, events: events.map(withData), viewings, duplicates: duplicates.map(withData),
    matches: matches.map(matchCard), retention: keptFor(retention) });
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
    if (s) return json({ error: `${contact.name} already has an active ${OPERATION_LABEL[r.value.applicant.operation]} search`,
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
  const newId = results[contact ? 0 : 1].meta.last_row_id;
  await afterSave(recomputeForApplicant, env, newId, admin);
  return json({ id: newId }, 201);
}

async function update({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request));
  if (typeof body.updated_at !== "string") fail(400, "Missing updated_at: reload the applicant");
  const cur = await loadApplicant(env, id);
  if (body.updated_at !== cur.updated_at) fail(409, stale("applicant"));
  // Archived searches are read only (D9); also keeps an edit from racing a permanent delete, which needs Archived.
  if (cur.archived_at) fail(409, "Restore this search to edit it");
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
  await afterSave(recomputeForApplicant, env, cur.id, admin);
  return json({ applicant: parsed(await loadApplicant(env, cur.id)) });
}

// The applicant's Offers tab (F3-C): their offers and sales, newest first.
async function offers({ env, params: [id] }) {
  const q = sql => env.DB.prepare(sql).bind(Number(id));
  const [[a], list, sales] = (await env.DB.batch([
    q("SELECT id FROM applicants WHERE id = ?"),
    q(`SELECT o.*, l.title AS listing_title FROM offers o JOIN listings l ON l.id = o.listing_id WHERE o.applicant_id = ?
       ORDER BY o.created_at DESC, o.id DESC`),
    q(`SELECT s.id, s.listing_id, l.title AS listing_title, s.offer_id, s.price, s.status, s.target_date, s.fell_through_reason,
       s.closed_at, s.created_at FROM sales s JOIN listings l ON l.id = s.listing_id WHERE s.applicant_id = ?
       ORDER BY s.created_at DESC, s.id DESC`),
  ])).map(r => r.results);
  if (!a) fail(404, "Applicant not found");
  return json({ offers: list, sales });
}

// "Add a new search for this contact" (#/applicants/new?contact=<id>) shows the contact it starts from.
const contactDetail = async ({ env, params: [id] }) => json({ contact: await loadContact(env, id) });

async function updateContact({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request));
  if (typeof body.updated_at !== "string") fail(400, "Missing updated_at: reload the contact");
  const cur = await loadContact(env, id);
  if (body.updated_at !== cur.updated_at) fail(409, stale("contact"));
  // Same shared check as the form; operation and source are only there to complete it.
  const r = validateApplicant({ ...pick(cur, CONTACT_FIELDS), ...pick(body, CONTACT_FIELDS), operation: "rent", source: "phone" },
    { publicForm: false });
  if (r.errors) return fieldErrors(r.errors);
  const next = pick(r.value.contact, CONTACT_FIELDS);
  const { keys, data } = diff(cur, next);
  // §3.3: the team confirms a marketing opt-in sent again from the website (true), or records a withdrawal (false).
  // An opt-in already on file keeps its first date.
  const ts = now();
  if (Object.hasOwn(body, "marketing") && typeof body.marketing !== "boolean") fail(400, "Send marketing as true or false");
  const marketing = !Object.hasOwn(body, "marketing") ? cur.marketing_opt_in_at : body.marketing ? cur.marketing_opt_in_at ?? ts : null;
  const consent = marketing !== cur.marketing_opt_in_at;
  if (!keys.length && !consent) return json({ contact: cur });
  // The panel only confirms an opt-in the website sent again, so a consent with no source came from the web.
  const consent_source = marketing && cur.consent_source == null ? "web" : cur.consent_source;

  const taken = c => json({ error: "Another contact already uses this email or phone number", contact_id: c.id }, 409);
  const other = keys.length && await findContact(env, next, cur.id);
  if (other) return taken(other);
  const sets = [...keys, ...(consent ? ["marketing_opt_in_at"] : []), ...(consent_source !== cur.consent_source ? ["consent_source"] : [])];
  const values = { ...next, marketing_opt_in_at: marketing, consent_source };
  const ref = { actor: admin, entity_type: "contact", entity_id: String(cur.id) };
  try {
    await saveVersioned(env, [
      env.DB.prepare(`UPDATE contacts SET ${sets.map(k => `${k} = ?`).join(", ")}, last_activity_at = ?, updated_by = ?, ${LOCK} WHERE id = ?`)
        .bind(...sets.map(k => values[k]), ts, admin, body.updated_at, ts, cur.id),
      ...(keys.length ? logEvent(env, { ...ref, type: "contact.updated", data }) : []),
      ...(consent ? logEvent(env, { ...ref, type: "contact.consent_changed",
        data: { before: { marketing_opt_in_at: cur.marketing_opt_in_at }, after: { marketing_opt_in_at: marketing } } }) : []),
    ], "contact", cur.id, body.updated_at);
  } catch (e) {
    const c = /UNIQUE/i.test(String(e?.message)) && await findContact(env, next, cur.id);
    if (c) return taken(c);
    throw e;
  }
  return json({ contact: await loadContact(env, cur.id) });
}

// E9: Log conversation restarts the contact's 12 months. The event is written only when the contact is there (ifInserted
// reads the touch's changes()), so an unknown contact changes nothing.
async function logConversation({ env, admin, params: [id] }) {
  const ts = now();
  const r = await env.DB.batch([touch(env, Number(id), ts),
    ...logEvent(env, { actor: admin, entity_type: "contact", entity_id: String(Number(id)), type: "contact.conversation" }, null,
      { ifInserted: true }),
    env.DB.prepare(RETENTION_SQL).bind(Number(id))]);
  if (!r[0].meta.changes) fail(404, "Contact not found");
  return json({ ok: true, kept_until: keptFor(r[2].results[0]).kept_until });
}

async function setArchived({ env, admin, params: [id, action] }) {
  const cur = await loadApplicant(env, id);
  if (action === "archive" && cur.archived_at) fail(400, "The applicant is already archived");
  if (action === "restore" && !cur.archived_at) fail(400, "The applicant isn't archived");
  // V16: an open offer or a sale in progress keeps the buyer out of the archive: checked first for a quick answer, and
  // again in the archive's own UPDATE (R9), where a busy buyer gets a NULL updated_at: NOT NULL fails the whole batch,
  // so neither the event nor the closed notices land.
  const archive = action === "archive";
  const BUSY = `(EXISTS (SELECT 1 FROM offers WHERE applicant_id = ? AND status IN ('pending', 'countered'))
    OR EXISTS (SELECT 1 FROM sales WHERE applicant_id = ? AND status = 'in_progress'))`;
  const busy = async () => (await env.DB.prepare(`SELECT ${BUSY} AS busy`).bind(cur.id, cur.id).first()).busy
    && fail(409, "Close its offers and sale first");
  if (archive) await busy();
  const ts = now(), ref = { entity_type: "applicant", entity_id: String(cur.id) };
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE applicants SET archived_at = ?, updated_at = ${archive ? `CASE WHEN NOT ${BUSY} THEN ? END` : "?"},
        updated_by = ? WHERE id = ?`).bind(archive ? ts : null, ...(archive ? [cur.id, cur.id] : []), ts, admin, cur.id),
      ...logEvent(env, { actor: admin, ...ref, type: archive ? "applicant.archived" : "applicant.restored" }),
      touch(env, cur.contact_id, ts),
      ...(archive ? [resolveNotices(env, ref, admin)] : []),
    ]);
  } catch (e) {
    if (archive) await busy();
    throw e;
  }
  await afterSave(recomputeForApplicant, env, cur.id, admin);
  return json({ applicant: parsed(await loadApplicant(env, cur.id)) });
}

// §3.4: from Archived only, typing the contact's name. The history keeps each event's type, date and actor, without data.
async function remove({ request, env, admin, params: [id] }) {
  const cur = await loadApplicant(env, id);
  const contact = await loadContact(env, cur.contact_id);
  if (!cur.archived_at) fail(400, "Only archived applicants can be deleted");
  // V14, V16: a buyer with a sale, in any state, is kept (the sales foreign key is the last barrier); their offers go with them.
  if (await env.DB.prepare("SELECT 1 FROM sales WHERE applicant_id = ? LIMIT 1").bind(cur.id).first())
    fail(409, "Kept for 5 years: it has a sale");
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
  ["GET", /^\/admin\/applicants\/(\d+)\/offers$/, offers, true],
  ["PUT", /^\/admin\/applicants\/(\d+)$/, update, true],
  ["DELETE", /^\/admin\/applicants\/(\d+)$/, remove, true],
  ["POST", /^\/admin\/applicants\/(\d+)\/(archive|restore)$/, setArchived, true],
  ["GET", /^\/admin\/contacts\/(\d+)$/, contactDetail, true],
  ["PUT", /^\/admin\/contacts\/(\d+)$/, updateContact, true],
  ["POST", /^\/admin\/contacts\/(\d+)\/conversation$/, logConversation, true],
];
