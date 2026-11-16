import {parsePriorities} from "../../site/requirements.js";
import { json, fail, readJson, now, HttpError } from "../http.js";
import { validateApplicant, normalizePhone, OPTIONS, QUEUES, SEARCH_STATES, activeSql, isActive } from "../applicants.js";
import { logEvent, resolveNotices } from "../events.js";
import { futureTaskStatements } from "../notification-events.js";
import { afterSave, matchSnapshotMessage, MATCH_INCOMPLETE_MESSAGE, CANDIDATES_SQL, LISTING, LISTING_OPERATION } from "../match-store.js";
// EST-01: the same recomputes, with each search's last run recorded around them.
import { recomputeForApplicant, recomputeForApplicantWithStatus, firstSearch, searchRunsWithoutMatch, searchRunFor } from "../search-state.js";
import { widen } from "../widen.js";
import { openSearchReview } from "../search-review.js";
import { evaluate } from "../matching.js";
import { pageMatches, MATCH_COUNTS_SQL, matchCounts, countsReady, candidateCounts, waitingSearches } from "../match-pages.js";
import { NO_SALE, EXEMPT, expiringSql, KEPT_UNTIL, HAS_OPEN_SEARCH, RETENTION_REVIEW, HAS_OPEN_OFFER, privacyHolds,
  OPEN_PRIVACY_REQUEST } from "../retention.js";
import { jerseyToday } from "../viewings.js";
import { CONTACT_NEXT_VERSION } from "../contact-version.js";
import { purposeReady, readPreferences } from "../communication-preferences.js";
import { PENDING_MARKETING } from "./public.js";
import { BY_EMAIL, BY_PHONE, viewingArgs } from "./applicant-tabs.js";

const STAGES = OPTIONS.stages.map(([v]) => v);
const OPERATION_LABEL = { ...Object.fromEntries(OPTIONS.operation), transfer: "Business transfer" };
const JSON_FIELDS = ["requirement_priorities", "household_children_ages", "property_types", "outdoor", "pets", "parishes_wanted", "parishes_excluded", "viewing_availability"];
// What an applicant edit may change; source stays as it was registered.
export const SEARCH_FIELDS = ["requirement_priorities", "household_children_ages", "viewing_availability", "operation", "budget_min", "budget_max", "budget_stretch", "property_types", "bedrooms_min",
  "bedrooms_ideal", "bedrooms_max", "bathrooms_min", "parking_spaces", "outdoor", "furnished", "pets", "area_answer", "preferred_parish", "parishes_wanted", "parishes_excluded",
  "near", "move_in_date", "lease_term_months", "buyer_position", "mortgage_aip", "housing_status", "household_adults",
  "household_children", "household_children_status", "requirements", "search_category", "commercial_kind", "commercial_use", "area_min", "area_max", "area_unit",
  "commercial_purchase", "commercial_rent", "commercial_rent_period", "commercial_premium", "commercial_expenses", "preferred_language"];
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
// L1 (spec 2026-11-04): a real contact with the person also moves last_contact_at, which edits never do.
export const contacted = (env, contactId, ts) =>
  env.DB.prepare("UPDATE contacts SET last_activity_at = ?1, last_contact_at = ?1 WHERE id = ?2").bind(ts, contactId);

// Optimistic lock inside the batch: a stale version sets updated_at to NULL, the NOT NULL constraint fails and the
// whole batch (events included) rolls back, even when another save lands between our check and our write.
// Bind: the updated_at the client saw, then the new one.
export const LOCK = "updated_at = CASE WHEN updated_at = ? THEN ? END";
// Millisecond timestamps are also optimistic-lock versions: two saves must never reuse one.
const nextVersion = previous => new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
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
// EST-11 (L3): an active search, Paused included, with no real contact for more than 14 days. Bind: the cutoff.
export const QUIET = `${activeSql("a")} AND COALESCE(c.last_contact_at, c.created_at) < ?`;
export const quietCutoff = () => new Date(Date.now() - 14 * 864e5).toISOString();
const PARISHES = OPTIONS.parishes.map(([v]) => v), SOURCES = OPTIONS.sources.map(([v]) => v);

// B13: the applicant's work queue, one label in this order: New properties found (found ones created after the first
// review), Waiting for review (found ones left), In process (shortlisted ones), No matches (everything else).
// EST-04: with enquiries read (waiting), In process is a home waiting for the agency, no longer the shortlist.
const queueSql = waiting => `CASE WHEN fresh THEN '${QUEUES[0]}' WHEN found > 0 THEN '${QUEUES[1]}' WHEN ${waiting ? "in_process" : "shortlisted > 0"} THEN '${QUEUES[2]}'
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
  const queue = p.get("queue") || null, workLabel = p.get("work_label") || null, budget = p.get("budget")?.trim() || null, parish = p.get("parish") || null;
  const source = p.get("source") || null, contact = p.get("contact") || null;
  const searchState = p.get("search_state") || null;
  if (searchState && !SEARCH_STATES.some(([s]) => s === searchState)) fail(400, "Invalid search state");
  if (operation && ![...OPTIONS.operation.map(([v]) => v), "transfer"].includes(operation)) fail(400, "Invalid operation");
  if (!["newest", "oldest"].includes(sort)) fail(400, "Invalid sort");
  if (stage && !STAGES.includes(stage)) fail(400, "Invalid stage");
  if (queue && !QUEUES.includes(queue)) fail(400, "Invalid queue");
  // SAP-02, EST-04: switched off, or with enquiries off, the list is read exactly as before.
  const counted = countsReady(env), waitingSql = counted ? waitingSearches(env) : null;
  const workPredicates = { new: "fresh", review: "found > 0", shortlisted: "shortlisted > 0", no_pending: "found = 0 AND shortlisted = 0",
    ...(waitingSql && { in_process: "in_process" }) };
  if (workLabel && !Object.hasOwn(workPredicates, workLabel)) fail(400, "Invalid work label");
  if (budget && !(/^\d+(\.\d+)?$/.test(budget) && Number(budget) > 0)) fail(400, "Invalid budget");
  if (parish && !PARISHES.includes(parish)) fail(400, "Invalid parish");
  if (source && !SOURCES.includes(source)) fail(400, "Invalid source");
  if (contact && contact !== "quiet") fail(400, "Invalid contact filter");
  const cutoff = quietCutoff();
  // E8: Expiring lists the searches of the contacts deleted within a month, archived ones too (they go with them).
  const today = jerseyToday(), expiring = p.get("expiring") === "1", retentionReview = p.get("retention_review") === "1";
  const where = [retentionReview ? RETENTION_REVIEW : expiring ? expiringSql(env) : p.get("archived") === "1" ? "a.archived_at IS NOT NULL" : "a.archived_at IS NULL"];
  const args = expiring || retentionReview ? [today] : [];
  if (searchState) { where.push("a.search_state = ?"); args.push(searchState); }
  if (operation) { where.push("COALESCE(a.search_operation, a.operation) = ?"); args.push(operation); }
  if (stage) { where.push("a.stage = ?"); args.push(stage); }
  if (assigned) { where.push("a.assigned_to = ?"); args.push(assigned); }
  // L5: the amount is within the budget, up to the stretch as in the matching; no budget fits any amount.
  if (budget) {
    where.push("a.search_category = 'residential' AND ? BETWEEN COALESCE(a.budget_min, 0) AND COALESCE(a.budget_stretch, a.budget_max, ?)");
    args.push(Number(budget), Number(budget));
  }
  // L6: an explicit anywhere answer or a saved wanted parish, never an exclusion or an unanswered area.
  if (parish) {
    where.push(`NOT EXISTS (SELECT 1 FROM json_each(COALESCE(a.parishes_excluded, '[]')) WHERE value = ?)
      AND (a.area_answer = 'any' OR ((a.area_answer = 'selected' OR a.area_answer IS NULL)
        AND EXISTS (SELECT 1 FROM json_each(a.parishes_wanted) WHERE value = ?)))`);
    args.push(parish, parish);
  }
  if (source) { where.push("a.source = ?"); args.push(source); }
  if (contact) { where.push(QUIET); args.push(cutoff); }
  if (q) {
    const like = s => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
    // A phone in any format ("07797 123 456") is found by its stored form; part of a number by its digits.
    const phone = normalizePhone(q) ?? q.replace(/[\s\-.()]/g, "");
    where.push("(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')");
    args.push(like(q), like(q), like(phone));
  }
  const dir = sort === "oldest" ? "ASC" : "DESC";
  const activeWork = "search_state = 'active' AND archived_at IS NULL AND search_category = 'residential'";
  // ponytail: no paging; the team has hundreds of applicants, not tens of thousands.
  // waiting: the searches with a home waiting for the agency (EST-04), read once inside this query; null = as before.
  const read = waiting => {
    const QUEUE = queueSql(waiting);
    const workFilters = [queue && `${QUEUE} = ?`, workLabel && workPredicates[workLabel]].filter(Boolean);
    const workWhere = workFilters.length ? `WHERE ${activeWork} AND ${workFilters.join(" AND ")}` : "";
    return env.DB.prepare(
    // Materialized: each listed applicant's counts are read once, not once per use in QUEUE.
    `WITH listed AS MATERIALIZED (SELECT a.id, COALESCE(a.search_operation, a.operation) AS operation, a.search_category, a.stage, a.search_state, a.lost_reason, a.created_at, a.archived_at, a.assigned_to,
       ad.name AS assigned_name, c.name, c.phone, c.email, ${MATCH_COUNTS},${waiting ? ` a.id IN (${waiting}) AS in_process,` : ""}
       CASE WHEN ${expiringSql(env)} THEN ${KEPT_UNTIL} END AS expires_on,
       CASE WHEN ${RETENTION_REVIEW} THEN 1 ELSE 0 END AS retention_review,
       COALESCE(c.last_contact_at, c.created_at) AS last_contact_at, CASE WHEN ${QUIET} THEN 1 ELSE 0 END AS gone_quiet
       FROM applicants a JOIN contacts c ON c.id = a.contact_id LEFT JOIN admins ad ON ad.email = a.assigned_to
       WHERE ${where.join(" AND ")})
     SELECT id, operation, search_category, stage, search_state, lost_reason, created_at, assigned_to, assigned_name, name, phone, email,
       CASE WHEN search_state = 'active' AND archived_at IS NULL AND search_category = 'residential' THEN ${QUEUE} END AS queue,
       found, shortlisted,${waiting ? " in_process," : ""} expires_on, retention_review, archived_at, last_contact_at, gone_quiet FROM listed ${workWhere} ORDER BY created_at ${dir}, id ${dir}`)
    .bind(today, today, cutoff, ...args, ...(queue ? [queue] : [])).all();
  };
  // AGE-12 or enquiries switched on before their migration: the list without AGE-12's part, then without both.
  let waiting = waitingSql, results;
  for (const next of [waitingSearches(env, false), null]) {
    try { ({ results } = await read(waiting)); break; } catch (e) {
      if (!waiting || !/no such table/.test(e?.message ?? "")) throw e;
      waiting = next === waiting ? null : next;
      if (!waiting && workLabel === "in_process") fail(400, "Invalid work label");
    }
  }
  if (!results) ({ results } = await read(waiting));
  // SAP-02: per search, the homes a person confirmed as available, those of them still proposable and those
  // confirmed not available, in one read for the whole list.
  const counts = counted ? await candidateCounts(env) : null;
  const counting = counts ? results.map(a => ({ ...a, ...counts(a.id) })) : results;
  // SAP-01: while a search has no match, what its last search did (EST-01); absent when switched off.
  const runs = await searchRunsWithoutMatch(env);
  const listed = runs ? counting.map(a => (runs.has(a.id) ? { ...a, search_run: runs.get(a.id) } : a)) : counting;
  // AUT-19: the searches with a proposal waiting to be confirmed; absent when switched off.
  const proposed = await searchesWithProposal(env);
  return json({ applicants: proposed?.size ? listed.map(a => (proposed.has(a.id) ? { ...a, criteria_proposal: true } : a)) : listed,
    ...(counted && { match_counts: true }), ...(waiting && { in_process: true }) });
}

// E9: the day the contact's 12 months end, or none when a sale keeps it (E3) or an open offer does, for as long as it
// stays open (its date may then be past). PRE-12 (with its switch): or an open privacy request does (privacy).
const retentionSql = env => `SELECT ${KEPT_UNTIL} AS kept_until, NOT ${NO_SALE} AS exempt, NOT ${EXEMPT} AS held,
  ${HAS_OPEN_SEARCH} AS search, ${HAS_OPEN_OFFER} AS offer, ${RETENTION_REVIEW} AS review${privacyHolds(env)
    ? `, ${OPEN_PRIVACY_REQUEST} AS privacy` : ""} FROM contacts c WHERE c.id = ?`;
const keptFor = r => ({ kept_until: r.held || r.privacy ? null : r.kept_until, exempt: !!r.exempt, offer: !!r.offer,
  search: !!r.search, review: !!r.review, ...(r.privacy !== undefined ? { privacy: !!r.privacy } : {}) });

async function detail({ env, params: [id] }) {
  const applicant = await loadApplicant(env, id);
  const contact = await loadContact(env, applicant.contact_id);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const [events, viewings, duplicates, totals, [retention], pairs] = (await env.DB.batch([
    q(`SELECT e.*, (SELECT title FROM listings WHERE id=json_extract(e.data,'$.listing_id')) AS listing_title FROM events e WHERE (entity_type = 'applicant' AND entity_id = ?) OR (entity_type = 'contact' AND entity_id = ?)
       ORDER BY at DESC, id DESC`, String(applicant.id), String(contact.id)),
    q(`SELECT v.*, COALESCE(l.title, v.listing_title_snapshot) AS listing_title
       FROM viewing_requests v LEFT JOIN listings l ON l.id = v.listing_id
       WHERE ${BY_EMAIL} OR ${BY_PHONE} ORDER BY v.created_at DESC, v.id DESC`, ...viewingArgs(contact)), // G4, as the Viewings tab (SAP-08)
    // active_search_id: the contact's active search with the submitted operation; null = "Create second search" applies.
    q(`SELECT n.id, n.title, n.created_at, e.id AS event_id, e.data,
         (SELECT s.id FROM applicants s WHERE s.contact_id = ? AND ${ACTIVE}
          AND COALESCE(s.search_operation, s.operation) IS COALESCE(json_extract(e.data, '$.search_operation'), json_extract(e.data, '$.operation'))
          AND s.search_category = COALESCE(json_extract(e.data, '$.search_category'), 'residential')
          ORDER BY s.created_at DESC, s.id DESC LIMIT 1) AS active_search_id
       FROM notifications n JOIN events e ON e.id = n.event_id
       WHERE n.resolved_at IS NULL AND e.entity_type = 'contact' AND e.entity_id = ? AND e.type = 'applicant.duplicate_submitted'
       ORDER BY n.created_at DESC, n.id DESC`, contact.id, String(contact.id)),
    q(MATCH_COUNTS_SQL,applicant.id),
    q(retentionSql(env), jerseyToday(), contact.id),
    q(`SELECT listing_id,status,requirements_rank FROM matches WHERE applicant_id=?`,applicant.id),
  ])).map(r => r.results);
  const search_run = await searchRunFor(env, applicant), criteria_proposal = await waitingProposal(env, applicant);
  const search_review = await openSearchReview(env, applicant.id); // BUS-17: undefined while switched off
  return json({ applicant: parsed(applicant), contact, events: events.map(withData), viewings, duplicates: duplicates.map(withData),
    matchCounts:matchCounts(totals), retention: keptFor(retention), widen: await widenFor(env, applicant, pairs),
    ...(search_run && { search_run }), ...(criteria_proposal !== undefined && { criteria_proposal }),
    ...(search_review !== undefined && { search_review }),
    ...(purposeReady(env) && { marketing_preferences: await readPreferences(env, contact.id),
      // The server's own answer to "can a website opt-in be confirmed now" (the same check as updateContact's).
      marketing_confirmable: await pendingOptIn(env, contact.id) }) });
}
const pendingOptIn = async (env, id) => (await env.DB.prepare(`SELECT ${PENDING_MARKETING} AS decision FROM contacts
  WHERE id = ?`).bind(id).first())?.decision === 1;

// Widen inspects lightweight global pairs, independently of the visible page.
async function widenFor(env,a,pairs) {
  if(!isActive(a)||a.search_category!=="residential")return null;
  if(!parsePriorities(a.requirement_priorities))return {confirmation_required:true};
  const {results}=await env.DB.prepare(`SELECT ${LISTING} FROM listings WHERE ${CANDIDATES_SQL} AND operation=?`)
    .bind(LISTING_OPERATION[a.operation]).all();
  const offered=new Map(results.map(l=>[l.id,l]));
  // Saved ranks can predate updated matching rules; don't count them as current facts.
  try {
    const currentPairs=[];
    let live=0;
    for(const m of pairs) {
      const listing=offered.get(m.listing_id);
      const current=listing&&['found','shortlisted'].includes(m.status)
        ? {...m,requirements_rank:evaluate(a,listing).requirements_rank} : m;
      if(listing&&['found','shortlisted'].includes(m.status)&&current.requirements_rank===0&&++live>=3)return null;
      currentPairs.push(current);
    }
    return widen(a,results,currentPairs);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return {unavailable:true};
    throw error;
  }
}
async function recalculateMatches({env,admin,params:[id]}) {
 const a=await loadApplicant(env,id);
 if(!isActive(a))fail(409,'Reopen the search to recalculate its matches.');
 const {created,completed,reason}=await recomputeForApplicantWithStatus(env,Number(id),admin);
 if(reason==='not_applicable')fail(409,'Reopen the search to recalculate its matches.');
 if(reason)fail(409,matchSnapshotMessage(reason));
 if(!completed)fail(409,MATCH_INCOMPLETE_MESSAGE);
 return json({created});
}
async function matchPage({request,env,params:[id]}) {
 const q=new URL(request.url).searchParams;
 // SAP-03: only narrows the group to its confirmed, available, confirmed not available or waiting matches.
 const keys=['status','after',...(countsReady(env)?['only']:[])];
 if([...q.keys()].some(k=>!keys.includes(k))||q.getAll('after').length>1||q.getAll('status').length!==1||q.getAll('only').length>1)
  fail(400,'Invalid match page options');
 return json(await pageMatches(env,Number(id),{status:q.get('status'),after:q.get('after'),only:q.get('only')}));
}

// The panel's New applicant and MSG-05's save from a chat share this: validation, the two 409 offers and the statements.
// Returns { response } when nothing may be written, or { contact, head, tail, conflict }: head inserts the new contact
// (if any) and then the search, last; tail is its event and the contact's clock; conflict(e) explains a failed batch.
export async function prepareCreate(env, raw, admin) {
  // PRE-10: switched on, consent comes only from the website with its notice version: the panel's new contact records
  // no marketing opt-in (its tick is hidden). Off, as before.
  const body = purposeReady(env) && raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw, marketing: false } : raw;
  let contact = null;
  if (body?.contact_id != null) {
    if (!Number.isInteger(Number(body.contact_id))) fail(400, "Invalid contact");
    contact = await loadContact(env, body.contact_id);
  }
  const ts = now();
  // "Add a new search for this contact": the stored contact stands in for the form's contact fields, unchanged.
  const r = validateApplicant(contact ? { ...body, name: contact.name, email: contact.email, phone: contact.phone } : body,
    { publicForm: false }, ts);
  if (r.errors) return { response: fieldErrors(r.errors) };
  const taken = c => json({ error: `${c.name} is already a contact`, contact_id: c.id }, 409);
  if (!contact) { const c = await findContact(env, r.value.contact); if (c) return { response: taken(c) }; }
  else {
    // One active search per operation: a second one would split the contact's history (§3.3 "Create second search").
    const effective = r.value.applicant.search_operation ?? r.value.applicant.operation;
    const s = await env.DB.prepare(`SELECT s.id FROM applicants s WHERE s.contact_id = ? AND COALESCE(s.search_operation, s.operation) = ? AND s.search_category = ? AND ${ACTIVE}
      ORDER BY s.created_at DESC, s.id DESC LIMIT 1`).bind(contact.id, effective, r.value.applicant.search_category).first();
    if (s) return { response: json({ error: `${contact.name} already has an active ${OPERATION_LABEL[effective]} search`,
      applicant_id: s.id }, 409) };
  }

  const stamps = { created_at: ts, updated_at: ts, updated_by: admin };
  const person = { ...r.value.contact, last_activity_at: ts, last_contact_at: ts, ...stamps }, a = { ...r.value.applicant, ...stamps };
  const cols = row => Object.keys(row).join(", "), marks = row => Object.keys(row).map(() => "?").join(", ");
  const name = contact?.name ?? person.name;
  const head = [
    ...(contact ? [] : [env.DB.prepare(`INSERT INTO contacts (${cols(person)}) VALUES (${marks(person)})`).bind(...Object.values(person))]),
    // A new contact is the row inserted just before, in the same batch.
    env.DB.prepare(`INSERT INTO applicants (contact_id, ${cols(a)}) VALUES (${contact ? "?" : "last_insert_rowid()"}, ${marks(a)})`)
      .bind(...(contact ? [contact.id] : []), ...Object.values(a)),
  ];
  const tail = [
    // Entered by the team: the Feed tells the others, nobody needs to act (§3.2).
    ...logEvent(env, { actor: admin, entity_type: "applicant", entity_id: null, type: "applicant.created",
    data: { operation: a.search_operation ?? a.operation, source: a.source } },
    { category: "new_applicant", title: `New applicant: ${name} · ${OPERATION_LABEL[a.search_operation ?? a.operation]}`, action_required: false }),
    ...(contact ? [contacted(env, contact.id, ts)] : []),
  ];
  const conflict = async e => {
    // Another admin added the same email or phone a moment ago.
    const c = /UNIQUE/i.test(String(e?.message)) && !contact && await findContact(env, r.value.contact);
    if (c) return taken(c);
    if (contact && /UNIQUE/i.test(String(e?.message))) fail(409, "This contact already has an active search for this operation. Reload to see it.");
    throw e;
  };
  return { contact, head, tail, conflict };
}

async function create({ request, env, admin }) {
  const p = await prepareCreate(env, await readJson(request), admin);
  if (p.response) return p.response;
  let results;
  try { results = await env.DB.batch([...p.head, ...p.tail]); } catch (e) { return p.conflict(e); }
  const newId = results[p.head.length - 1].meta.last_row_id;
  await afterSave(firstSearch, env, newId, admin);
  return json({ id: newId }, 201);
}

// What a body would change in a stored search, without writing anything: { errors }, or the columns to set (next, keys),
// the event's before/after (data), the body's fields that differ (changed) and the criteria among them.
async function changesFor(env, cur, body) {
  // Archived searches are read only (D9); also keeps an edit from racing a permanent delete, which needs Archived.
  if (cur.archived_at) fail(409, "Restore this search to edit it");
  if (Object.hasOwn(body, "search_category") && body.search_category !== cur.search_category)
    fail(409, "Create a separate search to change the search type.");
  const contact = await loadContact(env, cur.contact_id);

  // Fields left out of the body keep their stored value. A move-in date already saved may be in the past by now:
  // it is only checked when it changes. The stored contact and a panel source only complete the shared form check.
  const form = { ...parsed(pick(cur, SEARCH_FIELDS)), ...pick(body, SEARCH_FIELDS) };
  // GET returns the compatibility operation as well as the effective commercial operation.
  // A full round-trip of both fields preserves that effective operation; a partial operation
  // command remains explicit, including transfer -> rent, where the compatibility value is unchanged.
  if (cur.search_operation && (!Object.hasOwn(body, "operation")
    || (body.operation === cur.operation && body.search_operation === cur.search_operation)))
    form.operation = cur.search_operation;
  const keepDate = form.move_in_date === cur.move_in_date;
  const r = validateApplicant({ ...form,
    name: contact.name, email: contact.email, phone: contact.phone, source: "phone" }, { publicForm: false, savedMoveInDate: cur.move_in_date });
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
  if (Object.keys(errors).length) return { errors };

  const { source, ...search } = r.value.applicant;
  // Compare the submitted values with the stored answers, not the validator's inferred defaults.
  // A full-form PUT is therefore equivalent to a partial PUT for unchanged fields.
  const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  const stored = parsed(pick(cur, SEARCH_FIELDS));
  stored.operation = cur.search_operation ?? cur.operation;
  const changed = SEARCH_FIELDS.filter(k => Object.hasOwn(body, k) && !(k === "operation"
    ? form.operation === stored[k]
    : JSON_FIELDS.includes(k) ? equal(body[k] ?? null, stored[k] ?? null)
    : body[k] === stored[k] || search[k] === cur[k]));
  const next = { stage, lost_reason, assigned_to };
  for (const k of changed) next[k] = search[k];
  if (changed.includes("operation")) {
    next.operation = search.operation; next.search_operation = search.search_operation;
    // Operation changes explicitly clear fields which no longer apply.
    for (const k of ["furnished", "lease_term_months", "buyer_position", "mortgage_aip"])
      if (search[k] == null && cur[k] != null) next[k] = null;
  }
  if (changed.includes("household_adults") || changed.includes("household_children"))
    next.household_total = search.household_total;
  if (changed.includes("household_children") && !changed.includes("household_children_status"))
    next.household_children_status = search.household_children_status;
  if (changed.includes("household_children_ages")) next.household_ages_at = search.household_ages_at;
  // A household with pets cannot have a negotiable pets priority. Persist this dependency only
  // when pets or priorities actually change; unrelated edits must not backfill legacy priorities.
  if (changed.includes("pets") && !changed.includes("requirement_priorities") && search.requirement_priorities !== cur.requirement_priorities)
    next.requirement_priorities = search.requirement_priorities;
  // Buying cannot retain rental-only priorities. Do not copy unrelated validator inferences.
  if (changed.includes("operation") && search.operation === "buy" && !changed.includes("requirement_priorities") && cur.requirement_priorities) {
    const priorities = JSON.parse(cur.requirement_priorities);
    for (const key of ["furnished", "lease_term_months"]) { delete priorities.values[key]; priorities.unknown = priorities.unknown.filter(k => k !== key); }
    next.requirement_priorities = JSON.stringify(priorities);
  }
  const { keys, data } = diff(cur, next);
  const criteriaFields = keys.filter(k => (SEARCH_FIELDS.includes(k) || k === "household_total") && !["operation", "preferred_language", "viewing_availability"].includes(k));
  if ((cur.search_operation ?? cur.operation) !== (next.search_operation ?? next.operation ?? cur.search_operation ?? cur.operation)) criteriaFields.push("operation");
  return { next, keys, data, changed, criteriaFields, stage, assigned_to };
}

// Saves what changesFor worked out, on the version it was worked out from, then recalculates the matches once.
// proposalId (AUT-19): the proposal this confirms, closed with its Inbox task in the same batch.
async function commit(env, admin, cur, { next, keys, data, criteriaFields, stage, assigned_to }, proposalId) {
  const ts = nextVersion(cur.updated_at);
  if (criteriaFields.length) data.criteria_confirmation = { by: admin, at: ts, fields: criteriaFields };
  const leftNew = cur.stage === "new" && stage !== "new";
  try { await saveVersioned(env, [
    env.DB.prepare(`UPDATE applicants SET ${keys.map(k => `${k} = ?`).join(", ")}, updated_by = ?, ${LOCK} WHERE id = ?`)
      .bind(...keys.map(k => next[k]), admin, cur.updated_at, ts, cur.id),
    ...logEvent(env, { actor: admin, entity_type: "applicant", entity_id: String(cur.id),
      type: keys.includes("stage") ? "applicant.stage_changed" : "applicant.updated", data }),
    // A proposal decided since it was read has no status left to take: NOT NULL fails and the whole batch rolls back.
    ...(proposalId ? [...proposalTask(env, cur.id, "resolved"), env.DB.prepare(`UPDATE criteria_proposals SET
      status = CASE WHEN status = 'pending' THEN 'confirmed' END, decided_by = ?, decided_at = ? WHERE id = ?`).bind(admin, ts, proposalId)] : []),
    touch(env, cur.contact_id, ts),
    // Someone has picked it up: the new-applicant notice is done (§3.2).
    ...((keys.includes("assigned_to") && assigned_to) || leftNew
      ? [resolveNotices(env, { entity_type: "applicant", entity_id: String(cur.id), category: "new_applicant" }, admin)] : []),
  ], "applicant", cur.id, cur.updated_at); }
  catch (e) {
    if (/UNIQUE/i.test(String(e?.message))) fail(409, "This contact already has an active search for this operation.");
    throw e;
  }
  await afterSave(recomputeForApplicant, env, cur.id, admin);
  return json({ applicant: parsed(await loadApplicant(env, cur.id)) });
}

async function update({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request));
  if (typeof body.updated_at !== "string") fail(400, "Missing updated_at: reload the applicant");
  const cur = await loadApplicant(env, id);
  if (body.updated_at !== cur.updated_at) fail(409, stale("applicant"));
  const plan = await changesFor(env, cur, body);
  if (plan.errors) return fieldErrors(plan.errors);
  if (!plan.keys.length) return json({ applicant: parsed(cur) });
  if (plan.criteriaFields.length && body.criteria_confirmation?.confirmed !== true)
    return fieldErrors({ criteria_confirmation: "Confirm the applicant agreed to these changes" });
  return commit(env, admin, cur, plan);
}

// AUT-19: a change of criteria dictated after talking to the client waits as a proposal: the search and its matches stay
// as they are until an employee confirms it. Switched off, or without migration 0074, none of this is offered.
export const proposalsReady = env => env?.AUT19_CRITERIA_PROPOSALS_READY === "1";
const PROPOSABLE = SEARCH_FIELDS.filter(k => !["search_category", "preferred_language", "viewing_availability"].includes(k));
const CHANGED = "The search changed after this proposal was made. Edit the proposal or discard it.";
// Its Inbox task (NOT-01's producer contract), one per search: open while a proposal waits, closed when it is decided.
// Bound to the event written just before it in the same batch.
const proposalTask = (env, applicantId, phase) => futureTaskStatements(env, { work: "dictation", phase, episode: "criteria-proposal",
  eventId: null, target: { kind: "applicant", id: String(applicantId) }, title: "Confirm proposed criteria changes",
  reopen: phase === "pending" }, { ifInserted: true });
// The proposal no longer describes the search: its criteria version moved, or a value it showed as "before" did.
const outdated = (cur, p) => cur.match_inputs_revision !== p.base_revision
  || JSON.stringify(parsed(pick(cur, Object.keys(JSON.parse(p.previous))))) !== p.previous;

// The search's waiting proposal for the record (null: none), or the searches that have one for the list. undefined:
// switched off or not migrated.
async function waitingProposal(env, cur) {
  if (!proposalsReady(env)) return undefined;
  let p;
  try { p = await env.DB.prepare("SELECT * FROM criteria_proposals WHERE applicant_id = ? AND status = 'pending'").bind(cur.id).first(); }
  catch { return undefined; }
  return p && { id: p.id, source: p.source, note: p.note, proposed_by: p.proposed_by, proposed_at: p.proposed_at,
    stale: outdated(cur, p), changes: JSON.parse(p.changes), before: JSON.parse(p.previous), after: JSON.parse(p.proposed) };
}
const searchesWithProposal = env => (proposalsReady(env)
  ? env.DB.prepare("SELECT applicant_id FROM criteria_proposals WHERE status = 'pending'").all()
    .then(r => new Set(r.results.map(p => p.applicant_id)), () => undefined) : undefined);

// The one door for a proposal: the panel's employee, or later a draft Hermes interprets (actor and source say which).
// changes: only the criteria that change, as PUT takes them; note: where the change came from. A proposal already
// waiting is replaced. Its before/after comes from the stored search, never from the caller, and it is only stored
// while the search is still the version they were read from.
export async function proposeCriteria(env, id, { changes, note }, actor, source = "staff") {
  if (!proposalsReady(env)) fail(404, "Not found");
  const patch = asObject(changes);
  if (Object.keys(patch).some(k => !PROPOSABLE.includes(k))) fail(400, "Only search criteria can be proposed");
  if (note != null && typeof note !== "string") fail(400, "Invalid note");
  const origin = note?.trim() || null;
  if (origin?.length > 200) return fieldErrors({ note: "Use 200 characters or fewer" });
  const cur = await loadApplicant(env, id);
  const plan = await changesFor(env, cur, patch);
  if (plan.errors) return fieldErrors(plan.errors);
  if (!plan.criteriaFields.length) fail(400, "These values are already saved");
  const ts = now(), current = "FROM applicants WHERE id = ? AND updated_at = ?";
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE criteria_proposals SET status = 'discarded', decided_by = ?, decided_at = ?
      WHERE applicant_id = ? AND status = 'pending' AND EXISTS (SELECT 1 ${current})`).bind(actor, ts, cur.id, cur.id, cur.updated_at),
    env.DB.prepare(`INSERT INTO criteria_proposals (applicant_id, source, changes, previous, proposed, base_revision, note, proposed_by, proposed_at)
      SELECT id, ?, ?, ?, ?, match_inputs_revision, ?, ?, ? ${current}`).bind(source, JSON.stringify(pick(patch, plan.changed)),
      JSON.stringify(plan.data.before), JSON.stringify(plan.data.after), origin, actor, ts, cur.id, cur.updated_at),
    // The history names the fields; their values and the note stay in the proposal.
    ...logEvent(env, { actor, entity_type: "applicant", entity_id: String(cur.id), type: "applicant.criteria_proposed",
      data: { fields: plan.keys, source } }, null, { ifInserted: true }),
    ...proposalTask(env, cur.id, "pending"),
    touch(env, cur.contact_id, ts),
  ]);
  if (!results[1].meta.changes) fail(409, stale("applicant"));
  return json({ proposal: { id: results[1].meta.last_row_id } }, 201);
}
const propose = async ({ request, env, admin, params: [id] }) => proposeCriteria(env, id, asObject(await readJson(request)), admin);

async function loadProposal(env, applicantId, id) {
  if (!proposalsReady(env)) fail(404, "Not found");
  const p = await env.DB.prepare("SELECT * FROM criteria_proposals WHERE id = ? AND applicant_id = ?").bind(Number(id), applicantId).first();
  if (!p) fail(404, "Proposal not found");
  if (p.status !== "pending") fail(409, `This proposal was already ${p.status}. Reload to see it.`);
  return p;
}

// Applies exactly what was shown, on the version the employee is looking at; whoever is signed in confirms.
async function confirmProposal({ request, env, admin, params: [id, proposalId] }) {
  const body = asObject(await readJson(request));
  if (typeof body.updated_at !== "string") fail(400, "Missing updated_at: reload the applicant");
  const cur = await loadApplicant(env, id), p = await loadProposal(env, cur.id, proposalId);
  if (body.updated_at !== cur.updated_at) fail(409, stale("applicant"));
  if (outdated(cur, p)) fail(409, CHANGED);
  const plan = await changesFor(env, cur, JSON.parse(p.changes));
  if (plan.errors) return fieldErrors(plan.errors);
  if (JSON.stringify(plan.data.before) !== p.previous) fail(409, CHANGED);
  plan.data.proposal = { id: p.id, source: p.source, proposed_by: p.proposed_by, proposed_at: p.proposed_at };
  try { return await commit(env, admin, cur, plan, p.id); }
  catch (e) {
    // Discarded or replaced between our read and our write: nothing was saved.
    if (!(e instanceof HttpError)) await loadProposal(env, cur.id, p.id);
    throw e;
  }
}

async function discardProposal({ env, admin, params: [id, proposalId] }) {
  const cur = await loadApplicant(env, id), p = await loadProposal(env, cur.id, proposalId), ts = now();
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE criteria_proposals SET status = 'discarded', decided_by = ?, decided_at = ? WHERE id = ? AND status = 'pending'")
      .bind(admin, ts, p.id),
    ...logEvent(env, { actor: admin, entity_type: "applicant", entity_id: String(cur.id), type: "applicant.criteria_proposal_discarded",
      data: { fields: Object.keys(JSON.parse(p.proposed)) } }, null, { ifInserted: true }),
    ...proposalTask(env, cur.id, "resolved"),
    touch(env, cur.contact_id, ts),
  ]);
  if (!results[0].meta.changes) await loadProposal(env, cur.id, p.id);
  return json({ ok: true });
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
const contactDetail = async ({ env, params: [id] }) => {
  const contact = await loadContact(env, id);
  return json({ contact, ...(purposeReady(env) && { marketing_preferences: await readPreferences(env, contact.id) }) });
};

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
  // PRE-10: switched on, the panel never records an opt-in of its own: it confirms only one the website sent after the
  // last withdrawal (decision 1). A withdrawal meanwhile changes the contact's version, so the save below gets 409.
  if (consent && marketing && purposeReady(env) && !await pendingOptIn(env, cur.id))
    fail(409, "There is no marketing opt-in from the website waiting to be confirmed. Reload the contact.");
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
      env.DB.prepare(`UPDATE contacts SET ${sets.map(k => `${k} = ?`).join(", ")}, last_activity_at = ?, updated_by = ?,
        updated_at = CASE WHEN updated_at = ? THEN ${CONTACT_NEXT_VERSION} END WHERE id = ?`)
        .bind(...sets.map(k => values[k]), ts, admin, body.updated_at, ts, ts, cur.id),
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
  const r = await env.DB.batch([contacted(env, Number(id), ts),
    ...logEvent(env, { actor: admin, entity_type: "contact", entity_id: String(Number(id)), type: "contact.conversation" }, null,
      { ifInserted: true }),
    env.DB.prepare(retentionSql(env)).bind(jerseyToday(), Number(id))]);
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
  if (archive && cur.search_state !== "resolved") fail(409, "Resolve this search before archiving it.");
  const ts = nextVersion(cur.updated_at), ref = { entity_type: "applicant", entity_id: String(cur.id) };
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE applicants SET archived_at = ?, updated_at = CASE WHEN updated_at = ?
        ${archive ? `AND search_state = 'resolved' AND NOT ${BUSY}` : ""} THEN ? END,
        updated_by = ? WHERE id = ?`).bind(archive ? ts : null, cur.updated_at, ...(archive ? [cur.id, cur.id] : []), ts, admin, cur.id),
      ...logEvent(env, { actor: admin, ...ref, type: archive ? "applicant.archived" : "applicant.restored" }),
      touch(env, cur.contact_id, ts),
      ...(archive ? [resolveNotices(env, ref, admin)] : []),
    ]);
  } catch (e) {
    const current = await loadApplicant(env, id);
    if (current.updated_at !== cur.updated_at || current.search_state !== cur.search_state) fail(409, stale("applicant"));
    if (archive) await busy();
    throw e;
  }
  await afterSave(recomputeForApplicant, env, cur.id, admin);
  return json({ applicant: parsed(await loadApplicant(env, cur.id)) });
}

// EST-09: the employee decides explicitly; the router supplies identity, never the request body.
async function setSearch({ request, env, admin, params: [id] }) {
  const body = asObject(await readJson(request));
  if (!["active", "resolved"].includes(body.state)) fail(400, "Choose Active or Resolved");
  if (typeof body.updated_at !== "string") fail(400, "Missing updated_at: reload the applicant");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 200) return fieldErrors({ reason: "Enter a reason from 1 to 200 characters" });
  const cur = await loadApplicant(env, id);
  if (body.updated_at !== cur.updated_at) fail(409, stale("applicant"));
  if (cur.search_state === body.state) fail(409, "The search is already in this state. Reload to see it.");
  if (body.state === "active" && cur.archived_at) fail(409, "Restore this search before reopening it.");
  const resolved = body.state === "resolved";
  const ts = nextVersion(cur.updated_at);
  const ref = { entity_type: "applicant", entity_id: String(cur.id) };
  try {
    await saveVersioned(env, [
      env.DB.prepare(`UPDATE applicants SET search_state = ?, resolved_at = ?, resolved_by = ?, resolution_reason = ?,
        updated_by = ?, ${LOCK} WHERE id = ?`).bind(body.state, resolved ? ts : null, resolved ? admin : null,
        resolved ? reason : null, admin, body.updated_at, ts, cur.id),
      ...logEvent(env, { actor: admin, ...ref, type: resolved ? "applicant.search_resolved" : "applicant.search_reopened",
        data: { before: { search_state: cur.search_state }, after: { search_state: body.state }, reason } }),
      touch(env, cur.contact_id, ts),
      ...(resolved ? ["new_applicant", "matched"].map(category => resolveNotices(env, { ...ref, category }, admin)) : []),
    ], "applicant", cur.id, body.updated_at);
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message))) fail(409, "This contact already has an active search for this operation.");
    throw e;
  }
  if (!resolved) await afterSave(recomputeForApplicant, env, cur.id, admin, true);
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
  // PRE-12 (with its switch): deleting the contact waits while it has an open privacy request other than an erasure one;
  // deleting one search among several, while an access or portability request is open (its data is still to hand over).
  // The guard below aborts the batch if one was recorded meanwhile (its NULL request_id fails the audit's NOT NULL).
  const privacy = privacyHolds(env);
  const heldBy = `SELECT 1 FROM privacy_requests WHERE contact_id = ? AND state = 'open'
    AND kind ${others.n ? "IN ('access', 'portability')" : "<> 'erasure'"}`;
  const held = "This contact has an open privacy request that this deletion would affect. Close it first.";
  if (privacy && await env.DB.prepare(heldBy).bind(contact.id).first()) fail(409, held);
  const ts = now();
  const refs = [{ entity_type: "applicant", entity_id: String(cur.id) },
    ...(others.n ? [] : [{ entity_type: "contact", entity_id: String(contact.id) }])];
  const ofRefs = refs.map(() => "(entity_type = ? AND entity_id = ?)").join(" OR ");
  const refArgs = refs.flatMap(r => [r.entity_type, r.entity_id]);
  await env.DB.batch([
    ...(privacy ? [env.DB.prepare(`INSERT INTO privacy_request_audit (request_id, revision, action, actor, at)
      SELECT NULL, 0, 'closed', ?, ? WHERE EXISTS (${heldBy})`)
      .bind(admin, ts, contact.id)] : []),
    ...refs.map(ref => resolveNotices(env, ref, admin)),
    env.DB.prepare(`UPDATE notifications SET title = 'Deleted applicant', task_reason = NULL WHERE event_id IN (SELECT id FROM events WHERE ${ofRefs})`)
      .bind(...refArgs),
    // NULL, never '': the Inbox runs json_extract on it.
    env.DB.prepare(`UPDATE events SET data = NULL WHERE ${ofRefs}`).bind(...refArgs),
    env.DB.prepare("DELETE FROM applicants WHERE id = ?").bind(cur.id),
    ...(others.n ? [touch(env, contact.id, ts)] : [env.DB.prepare("DELETE FROM contacts WHERE id = ?").bind(contact.id)]),
    ...refs.flatMap(ref => logEvent(env, { actor: admin, ...ref, type: `${ref.entity_type}.deleted` })),
  ]).catch(e => { if (privacy && /NOT NULL constraint failed: privacy_request_audit/.test(String(e?.message))) fail(409, held); throw e; });
  return json({ ok: true });
}

export default [
  ["POST", /^\/admin\/applicants\/(\d+)\/matches\/recalculate$/, recalculateMatches, true],
  ["GET", /^\/admin\/applicants\/(\d+)\/matches$/, matchPage, true],
  ["GET", /^\/admin\/applicants$/, list, true],
  ["POST", /^\/admin\/applicants$/, create, true],
  ["GET", /^\/admin\/applicants\/(\d+)$/, detail, true],
  ["GET", /^\/admin\/applicants\/(\d+)\/offers$/, offers, true],
  ["PUT", /^\/admin\/applicants\/(\d+)$/, update, true],
  ["POST", /^\/admin\/applicants\/(\d+)\/search$/, setSearch, true],
  ["POST", /^\/admin\/applicants\/(\d+)\/criteria-proposals$/, propose, true],
  ["POST", /^\/admin\/applicants\/(\d+)\/criteria-proposals\/(\d+)\/confirm$/, confirmProposal, true],
  ["POST", /^\/admin\/applicants\/(\d+)\/criteria-proposals\/(\d+)\/discard$/, discardProposal, true],
  ["DELETE", /^\/admin\/applicants\/(\d+)$/, remove, true],
  ["POST", /^\/admin\/applicants\/(\d+)\/(archive|restore)$/, setArchived, true],
  ["GET", /^\/admin\/contacts\/(\d+)$/, contactDetail, true],
  ["PUT", /^\/admin\/contacts\/(\d+)$/, updateContact, true],
  ["POST", /^\/admin\/contacts\/(\d+)\/conversation$/, logConversation, true],
];
