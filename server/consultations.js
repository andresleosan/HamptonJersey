// AGE-03 (M06): the shared enquiry about a property (migration 0077). One open enquiry per property and operation
// that every approved match of it joins, and one per match to clarify a must-have the property does not answer. A
// person starts or joins it from a match that passes its gate (server/routes/matches.js, which mounts these routes
// and hands the gates in), chooses the recipient among the property's advertisers (AGE-04) and gets a text that
// names the property and no client. Nothing here sends anything: the enquiry waits as "to send manually" with an
// Inbox task, and becomes sent only when a person records having sent it (AGE-05 adds real channels).
// A match counts for an enquiry while it still passes its gate: a resolved search or an approval that no longer
// stands leaves without a write, and the enquiry stays open for the others.
// Off (AGE03_ENQUIRIES_READY) or before the migration, nothing is read and every card says Not sent.
import { json, fail, readJson, now } from "./http.js";
import { instant } from "./property-facts.js";
import { confirmationReader } from "./availability-confirmations.js";
import { taskStatements } from "./notification-tasks.js";
import { CHECK_LABEL } from "./candidate-state.js";

export const enquiriesReady = env => env?.AGE03_ENQUIRIES_READY === "1";
const missing = e => /no such table/.test(e?.message ?? "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VIA = ["phone", "email", "in_person", "message"];
const OPEN = "status NOT IN ('answered','cancelled')";
const LINKS = `consultation_matches cm JOIN consultations c ON c.id = cm.consultation_id JOIN matches m ON m.id = cm.match_id
  JOIN applicants a ON a.id = m.applicant_id`;
const TASK = { category: "task", title: "Send enquiry manually", reason: "An enquiry about this property is ready and has not been sent. "
  + "Open the property: its Enquiries section has the recipient and the text to copy. Record it as sent only after sending it yourself." };
const NOT_APPROVED = { general: "Only a match approved on the search and the property as they are now, of an active search and a property still "
  + "offered, can start or join an enquiry.", clarification: "Approve a clarification for this match first: only then can it be asked about." };
const UNAVAILABLE = "This property was confirmed as not available, so no enquiry about it goes out.";
const CHANGED = "This enquiry changed. Reload to review it.";

const OFFER = { sale: "for sale", rent: "to let", business: "as a business" };
// The proposed text, the same for the same facts. It names the property by its reference, title and public place (never
// its street address) and no client: occupants is the household size of the one case a person chose to state.
// asks: whether general availability is still to be asked (false while a confirmation in force says available).
// keys: for a clarification, the must-haves the property does not answer; nothing else is asked then.
export function enquiryText({ listing: l, asks = true, occupants = null, keys }) {
  const place = l.location || l.country, property = `${l.title}${place ? `, ${place}` : ""} (our reference ${l.id}), advertised ${OFFER[l.operation]}`;
  const ask = keys ? `Before going any further, could you please tell us what applies to this property on: ${keys.map(k => CHECK_LABEL[k] ?? k).join(", ")}?`
    : asks ? "Could you please confirm whether it is still available, and which days and times would suit a viewing?"
      : "We understand it is currently available. Could you please let us know which days and times would suit a viewing?";
  return ["Hello,", `Hampton Estates ${keys ? "is looking at" : "has interest in"} ${property}.`, ask,
    ...(occupants ? [`The enquiry is for a household of ${occupants} ${occupants === 1 ? "person" : "people"}.`] : []),
    "Thank you,\nHampton Estates"].join("\n\n");
}

// For match cards: match id => the enquiries it joined, newest first. undefined: switched off or not migrated.
export async function enquiryReader(env, ids) {
  if (!enquiriesReady(env)) return undefined;
  if (!ids.length) return () => [];
  try {
    const { results } = await env.DB.prepare(`SELECT cm.match_id, c.id, c.kind, c.status, c.sent_at, c.sent_via FROM consultation_matches cm
      JOIN consultations c ON c.id = cm.consultation_id WHERE cm.match_id IN (${ids.map(() => "?").join(", ")}) AND c.status <> 'cancelled'
      ORDER BY c.id DESC`).bind(...ids).all();
    return id => results.filter(r => r.match_id === id).map(({ match_id, ...c }) => c);
  } catch (e) {
    if (missing(e)) return undefined;
    throw e;
  }
}

// gates: { general, clarification } (SQL over matches m JOIN applicants a: what each kind may start from),
// asked (SQL: the clarification standing for m, as JSON) and card(env, matchId) (the match as its card shows it).
export default function consultationRoutes(gates) {
  const live = `(CASE c.kind WHEN 'general' THEN (${gates.general}) ELSE (${gates.clarification}) END)`;
  // The match with what it may start now and, for a home, the size of its own household.
  const matchOf = async (env, id) => await env.DB.prepare(`SELECT m.id, m.listing_id, l.title, l.location, l.country, l.operation,
    (${gates.general}) AS general, (${gates.clarification}) AS clarification, ${gates.asked} AS asked,
    CASE WHEN a.search_category <> 'commercial' THEN COALESCE(a.household_total, a.household_adults + a.household_children) END AS occupants
    FROM matches m JOIN applicants a ON a.id = m.applicant_id JOIN listings l ON l.id = m.listing_id WHERE m.id = ?`).bind(Number(id)).first()
    ?? fail(404, "Match not found");
  const household = m => (m.occupants >= 1 && m.occupants <= 40 ? m.occupants : null);
  const scopeOf = (m, kind) => (kind === "general" ? `general:${m.listing_id}:${m.operation}` : `clarification:${m.id}`);
  const openOf = (env, scope) => env.DB.prepare(`SELECT * FROM consultations WHERE scope_key = ? AND ${OPEN}`).bind(scope).first();
  const one = async (env, id) => await env.DB.prepare("SELECT * FROM consultations WHERE id = ?").bind(Number(id)).first() ?? fail(404, "Enquiry not found");
  const confirmed = async (env, listing_id, operation) => (await confirmationReader(env, [listing_id]))({ id: listing_id, operation });
  // The advertisers of a property in the directory (AGE-04) whose personal data is still there (AGE-14).
  const recipient = ({ id, name, kind, details }) => { const { contacts, channels } = JSON.parse(details); return { id, name, kind, contacts, channels }; };
  const recipients = async (env, listing) => (await env.DB.prepare(`SELECT a.* FROM advertisers a WHERE EXISTS
      (SELECT 1 FROM json_each(a.details, '$.listing_ids') j WHERE j.value = ?) OR EXISTS (SELECT 1 FROM json_each(a.details, '$.source_ids') j
      JOIN research_sources s ON s.source_id = j.value WHERE s.property_id = ?) ORDER BY a.name COLLATE NOCASE, a.id LIMIT 50`)
    .bind(listing, listing).all()).results.filter(a => !a.suppressed_at).map(recipient);

  // An enquiry as the panel shows it. matches: how many still count. blocked: why it must not go out now (asked
  // again when a sending is recorded). With a match: whether it counts and whether its household is the one stated.
  async function detail(env, c, matchId) {
    const [{ results }, advertiser, confirmation] = await Promise.all([
      env.DB.prepare(`SELECT cm.match_id FROM ${LINKS} WHERE cm.consultation_id = ? AND ${live}`).bind(c.id).all(),
      env.DB.prepare("SELECT * FROM advertisers WHERE id = ?").bind(c.advertiser_id).first(), confirmed(env, c.listing_id, c.operation)]);
    const ids = results.map(r => r.match_id), removed = !advertiser || !!advertiser.suppressed_at;
    const blocked = c.status !== "manual_pending" ? null
      : !ids.length ? "No approved match of an active search counts for this enquiry now, so it must not be sent."
      : c.occupants_match_id && !ids.includes(c.occupants_match_id) ? "The household stated in this enquiry is no longer part of it. Remove it before sending."
      : confirmation?.status === "unavailable" ? UNAVAILABLE
      : removed ? "The recipient's personal data was removed. Choose another recipient before sending." : null;
    const { id, kind, status, revision, listing_id, operation, body: text, occupants, prepared_by, prepared_at, sent_at, sent_via, sent_by, sent_evidence_ref } = c;
    return { id, kind, status, revision, listing_id, operation, text, asks_availability: !!c.asks_availability, occupants,
      recipient: removed ? { id: c.advertiser_id, removed: true } : recipient(advertiser), prepared_by, prepared_at, sent_at, sent_via, sent_by,
      sent_evidence_ref, matches: ids.length, blocked,
      ...(matchId == null ? {} : { joined: ids.includes(matchId), occupants_from_this_match: c.occupants_match_id === matchId }) };
  }

  // What a match's card needs to start, join or show its enquiry.
  async function context({ env, params: [id] }) {
    const m = await matchOf(env, id), can = m.general ? "general" : m.clarification ? "clarification" : null;
    const linked = await env.DB.prepare(`SELECT c.* FROM consultations c JOIN consultation_matches cm ON cm.consultation_id = c.id
      WHERE cm.match_id = ? AND c.${OPEN} AND (? IS NULL OR c.kind = ?) ORDER BY c.id DESC LIMIT 1`).bind(m.id, can, can).first();
    const c = linked ?? (can ? await openOf(env, scopeOf(m, can)) : null), availability = await confirmed(env, m.listing_id, m.operation);
    const text = occupants => enquiryText({ listing: { ...m, id: m.listing_id }, asks: availability?.status !== "available", occupants,
      keys: can === "clarification" ? JSON.parse(m.asked).keys : undefined });
    const occupants = can === "general" ? household(m) : null;
    return json({ enabled: true, can, consultation: c ? await detail(env, c, m.id) : null, advertisers: await recipients(env, m.listing_id),
      availability: availability ?? null, occupants, match: await gates.card(env, m.id),
      ...(can && !c ? { preview: { text: text(null), ...(occupants ? { text_with_occupants: text(occupants) } : {}) } } : {}) });
  }

  const forListing = async ({ env, params: [id] }) => json({ enabled: true, advertisers: await recipients(env, id),
    consultations: await Promise.all((await env.DB.prepare("SELECT * FROM consultations WHERE listing_id = ? ORDER BY id DESC LIMIT 20")
      .bind(id).all()).results.map(c => detail(env, c))) });

  // Starts the enquiry of this match's property and operation, or joins the one already open: never a second one.
  async function prepare({ request, env, admin, params: [id] }) {
    const body = await readJson(request), kind = body?.kind, include = body?.include_occupants === true;
    if (!UUID.test(body?.operation_id ?? "") || !["general", "clarification"].includes(kind)) fail(400, "Invalid format");
    const m = await matchOf(env, id), gate = gates[kind], scope = scopeOf(m, kind), ts = now();
    if (!m[kind]) fail(409, NOT_APPROVED[kind]);
    const availability = await confirmed(env, m.listing_id, m.operation);
    if (availability?.status === "unavailable") fail(409, UNAVAILABLE);
    const occupants = include ? household(m) : null, create = [];
    if (include && (kind !== "general" || !occupants)) fail(400, "This search has no household size to state in the enquiry.");
    if (!await openOf(env, scope)) {
      if (!(await recipients(env, m.listing_id)).some(a => a.id === body.advertiser_id)) fail(400, "Choose a recipient among the advertisers of this property.");
      const text = enquiryText({ listing: { ...m, id: m.listing_id }, asks: availability?.status !== "available", occupants,
        keys: kind === "clarification" ? JSON.parse(m.asked).keys : undefined });
      create.push(
        env.DB.prepare(`INSERT OR IGNORE INTO consultations (kind, listing_id, operation, scope_key, status, advertiser_id, body, asks_availability,
            occupants_match_id, occupants, prepared_by, prepared_at, operation_id)
          SELECT ?, m.listing_id, ?, ?, 'manual_pending', ?, ?, ?, ?, ?, ?, ?, ? FROM matches m JOIN applicants a ON a.id = m.applicant_id
          WHERE m.id = ? AND ${gate}`).bind(kind, m.operation, scope, body.advertiser_id, text, kind === "general" && availability?.status !== "available" ? 1 : 0,
          occupants && m.id, occupants, admin, ts, body.operation_id, m.id),
        // The event and the Inbox task exist only if this request created the enquiry; they carry ids, never its text.
        env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, ?, 'listing', ?, 'consultation.prepared',
          json_object('version', 1, 'consultation_id', last_insert_rowid(), 'kind', ?, 'operation', ?) WHERE changes() = 1`)
          .bind(ts, admin, m.listing_id, kind, m.operation),
        ...taskStatements(env, { ...TASK, taskKey: `consultation:${body.operation_id}`, eventId: null, target: { kind: "listing", id: m.listing_id },
          actor: admin }, { ifInserted: true }));
    }
    const results = await env.DB.batch([...create,
      env.DB.prepare(`INSERT OR IGNORE INTO consultation_matches (consultation_id, match_id, linked_by, linked_at)
        SELECT c.id, m.id, ?, ? FROM consultations c, matches m JOIN applicants a ON a.id = m.applicant_id
        WHERE c.scope_key = ? AND c.${OPEN} AND m.id = ? AND ${gate}`).bind(admin, ts, scope, m.id),
      env.DB.prepare(`SELECT c.* FROM ${LINKS} WHERE c.scope_key = ? AND c.${OPEN} AND cm.match_id = ? AND ${live}`).bind(scope, m.id)]);
    const c = results.at(-1).results[0], created = !!create.length && results[0].meta.changes === 1;
    if (!c) fail(409, NOT_APPROVED[kind]);
    return json({ created, consultation: await detail(env, c, m.id), match: await gates.card(env, m.id) }, created ? 201 : 200);
  }

  // Another recipient, or the one household stated (occupants_match_id: a match of the enquiry, null for none, absent
  // to keep it), while it has not been sent: a new version of the text.
  async function update({ request, env, admin, params: [id] }) {
    const body = await readJson(request), given = body?.occupants_match_id;
    if (!Number.isSafeInteger(body?.revision) || !Number.isSafeInteger(body.advertiser_id) || (given != null && !Number.isSafeInteger(given)))
      fail(400, "Invalid format");
    const c = await one(env, id), caseId = given === undefined ? c.occupants_match_id : given;
    if (c.status !== "manual_pending") fail(409, "This enquiry was already sent, so it can no longer be changed.");
    if (c.revision !== body.revision) fail(409, CHANGED);
    if (!(await recipients(env, c.listing_id)).some(a => a.id === body.advertiser_id)) fail(400, "Choose a recipient among the advertisers of this property.");
    let occupants = null, text = c.body, asks = c.asks_availability;
    if (c.kind === "general") {
      if (caseId !== null) {
        const chosen = await env.DB.prepare(`SELECT CASE WHEN a.search_category <> 'commercial' THEN COALESCE(a.household_total,
          a.household_adults + a.household_children) END AS occupants FROM ${LINKS} WHERE cm.consultation_id = ? AND cm.match_id = ? AND ${live}`)
          .bind(c.id, caseId).first();
        if (!chosen) fail(409, "That match is not an approved match of this enquiry.");
        occupants = household(chosen) ?? fail(400, "This search has no household size to state in the enquiry.");
      }
      const listing = await env.DB.prepare("SELECT id, title, location, country, operation FROM listings WHERE id = ?").bind(c.listing_id).first();
      asks = (await confirmed(env, c.listing_id, c.operation))?.status === "available" ? 0 : 1;
      text = enquiryText({ listing: { ...listing, operation: c.operation }, asks: !!asks, occupants });
    } else if (caseId !== null) fail(400, "A clarification states no household.");
    const { meta } = await env.DB.prepare(`UPDATE consultations SET advertiser_id = ?, body = ?, asks_availability = ?, occupants_match_id = ?,
      occupants = ?, prepared_by = ?, prepared_at = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND status = 'manual_pending'`)
      .bind(body.advertiser_id, text, asks, occupants && caseId, occupants, admin, now(), c.id, c.revision).run();
    if (!meta.changes) fail(409, CHANGED);
    return json({ consultation: await detail(env, await one(env, id)) });
  }

  // A person records having sent it themselves: when, how and where the proof is kept. The app sent nothing. Checked
  // again first: the version reviewed, a match that still counts, the household stated, the property, the recipient.
  async function manualSend({ request, env, admin, params: [id] }) {
    const body = await readJson(request), ts = now(), fields = {};
    if (!UUID.test(body?.operation_id ?? "") || !Number.isSafeInteger(body.revision)) fail(400, "Invalid format");
    try { if (instant(body.sent_at) > ts) fields.sent_at = "Choose a date and time that is not in the future"; }
    catch { fields.sent_at = "Enter the date and time it was sent"; }
    if (!VIA.includes(body.via)) fields.via = "Choose how it was sent";
    const evidence = typeof body.evidence_ref === "string" ? body.evidence_ref.trim() : "";
    if (!evidence || evidence.length > 300) fields.evidence_ref = "Say where the proof is kept, in 300 characters or fewer";
    if (Object.keys(fields).length) return json({ error: "Please check the highlighted fields.", fields }, 400);
    const c = await one(env, id), same = c => c.status === "sent" && c.sent_operation_id === body.operation_id;
    if (same(c)) return json({ consultation: await detail(env, c) }); // the same click again
    if (c.status !== "manual_pending") fail(409, "This enquiry was already recorded as sent. Reload to see it.");
    if (c.revision !== body.revision) fail(409, CHANGED);
    const { blocked } = await detail(env, c);
    if (blocked) fail(409, blocked);
    const counts = match => `EXISTS (SELECT 1 FROM ${LINKS} WHERE cm.consultation_id = consultations.id AND ${match} AND ${live})`;
    const [{ meta }] = await env.DB.batch([
      env.DB.prepare(`UPDATE consultations SET status = 'sent', sent_at = ?, sent_via = ?, sent_by = ?, sent_evidence_ref = ?, sent_operation_id = ?,
        sent_recorded_at = ? WHERE id = ? AND revision = ? AND status = 'manual_pending' AND ${counts("1")}
        AND (occupants_match_id IS NULL OR ${counts("cm.match_id = consultations.occupants_match_id")})`)
        .bind(body.sent_at, body.via, admin, evidence, body.operation_id, ts, c.id, c.revision),
      env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, ?, 'listing', ?, 'consultation.sent_manually',
        json_object('version', 1, 'consultation_id', ?, 'via', ?) WHERE changes() = 1`).bind(ts, admin, c.listing_id, c.id, body.via),
      ...taskStatements(env, { ...TASK, taskKey: `consultation:${c.operation_id}`, eventId: null, target: { kind: "listing", id: c.listing_id },
        actor: admin, resolved: true }, { ifInserted: true })]);
    const after = await one(env, id);
    if (!meta.changes && !same(after)) fail(409, CHANGED);
    return json({ consultation: await detail(env, after) });
  }

  // Off, or before migration 0077: reads answer { enabled: false } and writes 404, as if the routes were not there.
  const guarded = (handler, read) => async ctx => {
    const off = () => (read ? json({ enabled: false }) : fail(404, "Not found"));
    if (!enquiriesReady(ctx.env)) return off();
    try { return await handler(ctx); } catch (e) { if (missing(e)) return off(); throw e; }
  };
  return [
    ["GET", /^\/admin\/matches\/(\d+)\/consultation$/, guarded(context, true), true],
    ["POST", /^\/admin\/matches\/(\d+)\/consultation$/, guarded(prepare), true],
    ["GET", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/consultations$/, guarded(forListing, true), true],
    ["PUT", /^\/admin\/consultations\/(\d+)$/, guarded(update), true],
    ["POST", /^\/admin\/consultations\/(\d+)\/manual-send$/, guarded(manualSend), true],
  ];
}
