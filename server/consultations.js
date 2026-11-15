// AGE-03 (M06): the shared enquiry about a property (migration 0077). One open enquiry per property and operation
// that every approved match of it joins, and one per match to clarify a must-have the property does not answer. A
// person starts or joins it from a match that passes its gate (server/routes/matches.js, which mounts these routes
// and hands the gates in), chooses the recipient among the property's advertisers (AGE-04) and gets a text that
// names the property and no client. AGE-03 sends nothing: the enquiry waits as "to send manually" with an Inbox task,
// and becomes sent only when a person records having sent it.
// AGE-05 (migration 0080, AGE05_SEND_READY): a person also chooses the advertiser's contact, kept by reference, and
// may approve sending exactly that version by email. It is then queued once in the app's email pipeline (AUT-17,
// server/email.js), checked again before it leaves (settle, run by the clock) and marked sent only when the provider
// accepted it. While that pipeline is off nothing is queued and the enquiry stays to send manually.
// A match counts for an enquiry while it still passes its gate: a resolved search or an approval that no longer
// stands leaves without a write, and the enquiry stays open for the others.
// Off (AGE03_ENQUIRIES_READY) or before the migration, nothing is read and every card says Not sent.
import { json, fail, readJson, now, sha256 } from "./http.js";
import { instant, unavailabilityReady, notConfirmedUnavailable } from "./property-facts.js";
import { serviceReady, readEmailSettings, emailAddress } from "./email.js";
import { confirmationReader } from "./availability-confirmations.js";
import { taskStatements } from "./notification-tasks.js";
import { CHECK_LABEL } from "./candidate-state.js";

export const enquiriesReady = env => env?.AGE03_ENQUIRIES_READY === "1";
// AGE-05 needs EST-15 too: a property confirmed as not available must take what is pending out before anything is sent.
export const sendReady = env => env?.AGE05_SEND_READY === "1" && enquiriesReady(env) && unavailabilityReady(env);
// On only with migration 0080 as well; before it every answer and every write is as AGE-03 left them.
const migrated = env => env.DB.prepare("SELECT contact_key FROM consultations LIMIT 0").all().then(() => true, () => false);
const sending = async env => sendReady(env) && migrated(env);
// An approval to send lasts this long in the queue: an email that has not left by then goes back to a person.
const QUEUE_LIMIT = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')";
const missing = e => /no such table/.test(e?.message ?? "");
// The clock checks an enquiry email with EST-15's facts, as the panel that queued it had them (sendReady).
const EST15_ON = { EST15_UNAVAILABILITY_READY: "1", EST16_AVAILABILITY_READY: "1" };
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
const CHECK_TASK = { category: "task", title: "Check enquiry email", reason: "The email service did not confirm whether an enquiry about this "
  + "property went out. Open the property: its Enquiries section says what to check. It is never sent again automatically." };
// While its email is queued: the task stays open until the email is sent, and says what to do if it does not leave.
const QUEUED_TASK = { category: "task", title: "Enquiry email queued", reason: "An enquiry about this property was approved and queued by email. "
  + "This closes when the email is sent. If it has not left, open the property: its Enquiries section says why, and it can be returned to "
  + "manual sending." };
const NOT_WAITING = "This enquiry is no longer waiting to be sent. Reload to see it.";
const NO_EMAIL = "Choose a contact with an email address first. By phone or in person, send it yourself and record it.";
const BY_HAND = "send it yourself and record it below.";
// A contact is referred to by a digest of its name and email, never by a copy: one that is renamed, given another
// address or removed no longer answers to it, and the enquiry waits for a person to choose again.
const contactKey = c => sha256(JSON.stringify([c.name, c.email].map(v => String(v ?? "").trim().toLowerCase())));
// Each contact that can be reached (an email or a phone) with its reference; the others are shown but cannot be chosen.
const keyed = contacts => Promise.all(contacts.map(async c => (emailAddress(c.email) || c.phones?.length ? { ...c, key: await contactKey(c) } : c)));
// Why the app cannot send an email now, in words for the panel; null when it can. queued: said of an email that waits
// in the queue, which a person can take back. The sender is the clock's (server/email.js emailPass writes email_worker
// on each tick), which has its own switch: one that is off, or has not run for half an hour, sends nothing.
async function emailStop(env, queued = false) {
  const then = queued ? "it waits, or return it to manual sending and send it yourself." : BY_HAND;
  if (!serviceReady(env)) return `Email from the app is not switched on yet, so nothing is sent from here: ${then}`;
  if (!(await readEmailSettings(env)).enabled) return `Email sending is switched off in Email settings, so nothing is sent from here: ${then}`;
  if (await env.DB.prepare("SELECT 1 FROM app_settings WHERE key = 'outbound' AND json_extract(value, '$.paused') = 1").first())
    return queued ? `Sending is paused (Pause all outbound), so nothing leaves: it goes when sending resumes, or return it to manual sending and send it yourself.`
      : `Sending is paused (Pause all outbound), so nothing is queued: resume sending, or ${then}`;
  const sender = JSON.parse((await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'email_worker'").first())?.value ?? "{}");
  if (!sender.ready || !(Date.parse(sender.at) > Date.now() - 30 * 60e3))
    return `The app's email sender is not running, so nothing is sent from here: ${then}`;
  return null;
}

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
// Gives { routes, settle }: settle is the clock's part of sending by email (server/consultation-email.js).
export function enquiries(gates) {
  const live = `(CASE c.kind WHEN 'general' THEN (${gates.general}) ELSE (${gates.clarification}) END)`;
  // The match with what it may start now and, for a home, the size of its own household.
  const matchOf = async (env, id) => await env.DB.prepare(`SELECT m.id, m.listing_id, l.title, l.location, l.country, l.operation,
    (${gates.general}) AS general, (${gates.clarification}) AS clarification, ${gates.asked} AS asked,
    CASE WHEN a.search_category <> 'commercial' THEN COALESCE(a.household_total, a.household_adults + a.household_children) END AS occupants
    FROM matches m JOIN applicants a ON a.id = m.applicant_id JOIN listings l ON l.id = m.listing_id WHERE m.id = ?`).bind(Number(id)).first()
    ?? fail(404, "Match not found");
  const household = m => (m?.occupants >= 1 && m.occupants <= 40 ? m.occupants : null);
  const scopeOf = (m, kind) => (kind === "general" ? `general:${m.listing_id}:${m.operation}` : `clarification:${m.id}`);
  const openOf = (env, scope) => env.DB.prepare(`SELECT * FROM consultations WHERE scope_key = ? AND ${OPEN}`).bind(scope).first();
  const one = async (env, id) => await env.DB.prepare("SELECT * FROM consultations WHERE id = ?").bind(Number(id)).first() ?? fail(404, "Enquiry not found");
  const confirmed = async (env, listing_id, operation) => (await confirmationReader(env, [listing_id]))({ id: listing_id, operation });
  // The advertisers of a property in the directory (AGE-04) whose personal data is still there (AGE-14).
  // OF_PROPERTY: advertisers a advertises that property, itself or through one of its sources. Bind: the property, twice.
  const ofProperty = (a, listing) => `(EXISTS (SELECT 1 FROM json_each(${a}.details, '$.listing_ids') j WHERE j.value = ${listing}) OR EXISTS
    (SELECT 1 FROM json_each(${a}.details, '$.source_ids') j JOIN research_sources s ON s.source_id = j.value WHERE s.property_id = ${listing}))`;
  const OF_PROPERTY = ofProperty("a", "?");
  // keys (AGE-05): each contact that can be reached carries the reference it is chosen by.
  const recipient = async ({ id, name, kind, details }, keys) => { const { contacts, channels } = JSON.parse(details);
    return { id, name, kind, contacts: keys ? await keyed(contacts) : contacts, channels }; };
  const recipients = async (env, listing, keys) => Promise.all((await env.DB.prepare(`SELECT a.* FROM advertisers a WHERE ${OF_PROPERTY}
    ORDER BY a.name COLLATE NOCASE, a.id LIMIT 50`).bind(listing, listing).all()).results.filter(a => !a.suppressed_at).map(a => recipient(a, keys)));
  // The recipient among them and, with a contact named (AGE-05), that contact's reference: it must be one of its own.
  const chosen = (list, { advertiser_id, contact_key: key }, keys) => {
    const to = list.find(a => a.id === advertiser_id) ?? fail(400, "Choose a recipient among the advertisers of this property.");
    if (keys && key != null && !to.contacts.some(p => p.key && p.key === key)) fail(400, "Choose a contact of that recipient with an email or a phone.");
    return keys ? key ?? null : undefined;
  };
  // Matches of this enquiry (the consultations row an UPDATE is on) that still count, or the one named.
  const counts = match => `EXISTS (SELECT 1 FROM ${LINKS} WHERE cm.consultation_id = consultations.id AND ${match} AND ${live})`;
  // AGE-05: whether the email of an enquiry may be claimed now, in SQL from its outbound row. server/email.js asks it in
  // the same statement that claims the email and again just before the provider call, so nothing can change between
  // this check and the claim. It asks what blocked asks: queued with the approval of this very version by a member of
  // the team, a match that counts, the household stated, no confirmed unavailability, the recipient still there and
  // still advertising the property, and the address still one of its contacts'. What SQL cannot work out (whether the
  // text is out of date, whether the contact's reference still answers) holds as long as nothing it is made from changed
  // after the email was queued, when it was checked: else the email is not claimed and settle gives it back.
  const claimable = `EXISTS (SELECT 1 FROM consultations JOIN listings l ON l.id = consultations.listing_id
      JOIN advertisers ad ON ad.id = consultations.advertiser_id
    WHERE consultations.email_ref = outbound.ref AND consultations.status = 'queued' AND consultations.revision = outbound.version AND outbound.created_at > ${QUEUE_LIMIT}
      AND consultations.approved_revision = consultations.revision AND EXISTS (SELECT 1 FROM admins WHERE email = consultations.approved_by)
      AND ${counts("1")} AND (consultations.occupants_match_id IS NULL OR ${counts("cm.match_id = consultations.occupants_match_id")})
      ${notConfirmedUnavailable(EST15_ON, "consultations.listing_id", "consultations.operation")}
      AND ad.suppressed_at IS NULL AND ${ofProperty("ad", "consultations.listing_id")}
      AND EXISTS (SELECT 1 FROM json_each(ad.details, '$.contacts') j WHERE lower(trim(json_extract(j.value, '$.email'))) = outbound.recipient)
      AND ad.updated_at <= outbound.created_at AND l.updated_at <= outbound.created_at
      AND NOT EXISTS (SELECT 1 FROM availability_confirmations ac WHERE ac.listing_id = consultations.listing_id AND ac.recorded_at > outbound.created_at)
      AND NOT EXISTS (SELECT 1 FROM matches om JOIN applicants oa ON oa.id = om.applicant_id WHERE om.id = consultations.occupants_match_id
        AND oa.updated_at > outbound.created_at)
      AND NOT EXISTS (SELECT 1 FROM consultation_matches qm JOIN matches qx ON qx.id = qm.match_id JOIN events e ON e.entity_type = 'applicant'
        AND e.entity_id = CAST(qx.applicant_id AS TEXT) AND json_extract(e.data, '$.listing_id') = qx.listing_id
        WHERE qm.consultation_id = consultations.id AND consultations.kind = 'clarification' AND e.type = 'match.clarification'
          AND e.at > outbound.created_at))`;
  // The household of a match that still counts for this enquiry, as it is now. undefined: the match does not count.
  const caseOf = (env, c, matchId) => env.DB.prepare(`SELECT CASE WHEN a.search_category <> 'commercial' THEN COALESCE(a.household_total,
    a.household_adults + a.household_children) END AS occupants FROM ${LINKS} WHERE cm.consultation_id = ? AND cm.match_id = ? AND ${live}`)
    .bind(c.id, matchId).first();
  // The text this enquiry would be given now: from the property, the availability confirmed and, by kind, the household
  // stated (occupants) or the must-haves of the clarification standing for its match. null: no clarification stands.
  async function proposed(env, c, occupants, confirmation) {
    const listing = { ...await env.DB.prepare("SELECT id, title, location, country FROM listings WHERE id = ?").bind(c.listing_id).first(), operation: c.operation };
    if (c.kind === "general") {
      const asks = confirmation?.status !== "available";
      return { text: enquiryText({ listing, asks, occupants }), asks: asks ? 1 : 0 };
    }
    const m = await env.DB.prepare(`SELECT ${gates.asked} AS asked FROM matches m JOIN applicants a ON a.id = m.applicant_id WHERE m.id = ?`)
      .bind(Number(c.scope_key.split(":")[1])).first();
    return m?.asked ? { text: enquiryText({ listing, keys: JSON.parse(m.asked).keys }), asks: 0 } : null;
  }

  // An enquiry as the panel shows it. matches: how many still count. blocked: why it must not go out now (asked
  // again when a sending is recorded, approved or queued, and while its email waits in the queue). With a match:
  // whether it counts and whether its household is the one stated. AGE-05 adds the contact chosen, as the directory
  // has it now, the approval that covers this version and the reference of its email.
  async function detail(env, c, matchId) {
    // What was queued or left unconfirmed while sending was on is still shown, to be closed, once it is off.
    const pending = c.status === "manual_pending" || c.status === "queued", send = "contact_key" in c
      && (sendReady(env) || c.status === "queued" || c.status === "needs_review");
    const [{ results }, advertiser, confirmation] = await Promise.all([
      env.DB.prepare(`SELECT cm.match_id FROM ${LINKS} WHERE cm.consultation_id = ? AND ${live}`).bind(c.id).all(),
      env.DB.prepare(`SELECT a.*, ${OF_PROPERTY} AS of_property FROM advertisers a WHERE a.id = ?`).bind(c.listing_id, c.listing_id, c.advertiser_id).first(),
      confirmed(env, c.listing_id, c.operation)]);
    const ids = results.map(r => r.match_id), removed = !advertiser || !!advertiser.suppressed_at, unlinked = pending && !removed && !advertiser.of_property;
    const to = removed ? { id: c.advertiser_id, removed: true } : { ...await recipient(advertiser, send), ...(unlinked ? { unlinked: true } : {}) };
    const contact = send && c.contact_key ? to.contacts?.find(p => p.key === c.contact_key) ?? { missing: true } : null;
    // What the text would say now, with the household of its case as it is today: a text written from other facts waits.
    const stated = pending && c.occupants_match_id && ids.includes(c.occupants_match_id);
    const current = pending && await proposed(env, c, stated ? household(await caseOf(env, c, c.occupants_match_id)) : null, confirmation);
    const blocked = !pending ? null
      : !ids.length ? "No approved match of an active search counts for this enquiry now, so it must not be sent."
      : c.occupants_match_id && !stated ? "The household stated in this enquiry is no longer part of it. Save changes to take it out before sending."
      : confirmation?.status === "unavailable" ? UNAVAILABLE
      : removed ? "The recipient's personal data was removed. Choose another recipient before sending."
      : unlinked ? "The recipient is no longer an advertiser of this property in the directory. Choose another recipient before sending."
      : contact?.missing ? "The contact chosen is no longer in the directory as it was when it was chosen. Choose a contact again before sending."
      : current && current.text !== c.body ? (c.kind === "general"
        ? "The household stated, the property's details or its confirmed availability changed since this text was written. Save changes to update it before sending."
        : "The must-haves to clarify, or the property's details, changed since this text was written. Save changes to update it before sending.") : null;
    const { id, kind, status, revision, listing_id, operation, body: text, occupants, prepared_by, prepared_at, sent_at, sent_via, sent_by, sent_evidence_ref } = c;
    return { id, kind, status, revision, listing_id, operation, text, asks_availability: !!c.asks_availability, occupants,
      recipient: to, prepared_by, prepared_at, sent_at, sent_via, sent_by, sent_evidence_ref, matches: ids.length, blocked,
      ...(send ? { contact, approval: c.approved_revision === revision ? { by: c.approved_by, at: c.approved_at } : null, email_ref: c.email_ref,
        ...(c.status === "queued" ? { held: sendReady(env) ? await emailStop(env, true) : "Sending enquiries by email was switched off here. It "
          + "stops only once it is off for the clock too: then it returns to manual sending. Return it to manual now to be sure." } : {}) } : {}),
      ...(matchId == null ? {} : { joined: ids.includes(matchId), occupants_from_this_match: c.occupants_match_id === matchId }) };
  }

  // What a match's card needs to start, join or show its enquiry.
  async function context({ env, params: [id] }) {
    const m = await matchOf(env, id), can = m.general ? "general" : m.clarification ? "clarification" : null, send = await sending(env);
    const linked = await env.DB.prepare(`SELECT c.* FROM consultations c JOIN consultation_matches cm ON cm.consultation_id = c.id
      WHERE cm.match_id = ? AND c.${OPEN} AND (? IS NULL OR c.kind = ?) ORDER BY c.id DESC LIMIT 1`).bind(m.id, can, can).first();
    const c = linked ?? (can ? await openOf(env, scopeOf(m, can)) : null), availability = await confirmed(env, m.listing_id, m.operation);
    const text = occupants => enquiryText({ listing: { ...m, id: m.listing_id }, asks: availability?.status !== "available", occupants,
      keys: can === "clarification" ? JSON.parse(m.asked).keys : undefined });
    const occupants = can === "general" ? household(m) : null;
    return json({ enabled: true, can, consultation: c ? await detail(env, c, m.id) : null, advertisers: await recipients(env, m.listing_id, send),
      availability: availability ?? null, occupants, match: await gates.card(env, m.id), ...(send ? { send: { email_stop: await emailStop(env) } } : {}),
      ...(can && !c ? { preview: { text: text(null), ...(occupants ? { text_with_occupants: text(occupants) } : {}) } } : {}) });
  }

  const forListing = async ({ env, params: [id] }) => {
    const send = await sending(env);
    return json({ enabled: true, advertisers: await recipients(env, id, send), ...(send ? { send: { email_stop: await emailStop(env) } } : {}),
      consultations: await Promise.all((await env.DB.prepare("SELECT * FROM consultations WHERE listing_id = ? ORDER BY id DESC LIMIT 20")
        .bind(id).all()).results.map(c => detail(env, c))) });
  };

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
      if (await env.DB.prepare("SELECT 1 FROM consultations WHERE operation_id = ?").bind(body.operation_id).first())
        fail(409, "That operation ID was already used for another enquiry.");
      const send = await sending(env), contact = chosen(await recipients(env, m.listing_id, send), body, send);
      const text = enquiryText({ listing: { ...m, id: m.listing_id }, asks: availability?.status !== "available", occupants,
        keys: kind === "clarification" ? JSON.parse(m.asked).keys : undefined });
      create.push(
        env.DB.prepare(`INSERT OR IGNORE INTO consultations (kind, listing_id, operation, scope_key, status, advertiser_id, body, asks_availability,
            occupants_match_id, occupants, prepared_by, prepared_at, operation_id${contact ? ", contact_key" : ""})
          SELECT ?, m.listing_id, ?, ?, 'manual_pending', ?, ?, ?, ?, ?, ?, ?, ?${contact ? ", ?" : ""} FROM matches m JOIN applicants a ON a.id = m.applicant_id
          WHERE m.id = ? AND ${gate}`).bind(kind, m.operation, scope, body.advertiser_id, text, kind === "general" && availability?.status !== "available" ? 1 : 0,
          occupants && m.id, occupants, admin, ts, body.operation_id, ...(contact ? [contact] : []), m.id),
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
  // to keep it while its match still counts and says its size), while it has not been sent: a new version, whose text
  // is written again from the facts of today (the household as it is now, the must-haves of the clarification standing).
  // AGE-05: also the contact chosen (contact_key, or none). An approval to send covers one version, so never this new one.
  async function update({ request, env, admin, params: [id] }) {
    const body = await readJson(request), given = body?.occupants_match_id;
    if (!Number.isSafeInteger(body?.revision) || !Number.isSafeInteger(body.advertiser_id) || (given != null && !Number.isSafeInteger(given)))
      fail(400, "Invalid format");
    const c = await one(env, id), caseId = given === undefined ? c.occupants_match_id : given;
    if (c.status !== "manual_pending") fail(409, "This enquiry was already sent, so it can no longer be changed.");
    if (c.revision !== body.revision) fail(409, CHANGED);
    const send = sendReady(env) && "contact_key" in c, contact = chosen(await recipients(env, c.listing_id, send), body, send);
    if (c.kind !== "general" && given != null) fail(400, "A clarification states no household.");
    let occupants = null;
    if (caseId != null) {
      const chosen = await caseOf(env, c, caseId);
      occupants = household(chosen);
      // A case named in this request must count and say its size; one only kept from before is dropped if it no longer does.
      if (given != null && !chosen) fail(409, "That match is not an approved match of this enquiry.");
      if (given != null && !occupants) fail(400, "This search has no household size to state in the enquiry.");
    }
    const { text, asks } = await proposed(env, c, occupants, await confirmed(env, c.listing_id, c.operation)) ?? { text: c.body, asks: c.asks_availability };
    const { meta } = await env.DB.prepare(`UPDATE consultations SET advertiser_id = ?, body = ?, asks_availability = ?, occupants_match_id = ?,
      occupants = ?, prepared_by = ?, prepared_at = ?, revision = revision + 1${send ? ", contact_key = ?" : ""}
      WHERE id = ? AND revision = ? AND status = 'manual_pending'`)
      .bind(body.advertiser_id, text, asks, occupants && caseId, occupants, admin, now(), ...(send ? [contact] : []), c.id, c.revision).run();
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
    // To the minute, as the panel gives it: a text is not sent before it was prepared.
    if (body.sent_at.slice(0, 16) < c.prepared_at.slice(0, 16))
      return json({ error: "Please check the highlighted fields.", fields: { sent_at: "Choose a date and time after this text was prepared" } }, 400);
    const { blocked } = await detail(env, c);
    if (blocked) fail(409, blocked);
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

  // AGE-05. One step of an enquiry's email, written once whoever asks: the enquiry as it was read moves on (set), an
  // event names it and its email by their ids only (data), and its Inbox task follows (task, over the manual one).
  const step = (env, c, actor, type, set, args = [], { data, task, when = "" } = {}) => [
    env.DB.prepare(`UPDATE consultations SET ${set} WHERE id = ? AND revision = ? AND status = ?${when}`).bind(...args, c.id, c.revision, c.status),
    env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, ?, 'listing', ?, ?, ? WHERE changes() = 1`)
      .bind(now(), actor, c.listing_id, `consultation.${type}`, JSON.stringify({ version: 1, consultation_id: c.id, consultation_revision: c.revision, ...data })),
    ...(task ? taskStatements(env, { ...TASK, ...task, taskKey: `consultation:${c.operation_id}`, eventId: null,
      target: { kind: "listing", id: c.listing_id }, actor }, { ifInserted: true }) : [])];
  // Back to a person, unsent: a new version that nobody approved, with no email of its own, and its Inbox task open again.
  const back = (env, c, actor, reason, when, extra) => step(env, c, actor, "email_not_sent",
    "status = 'manual_pending', revision = revision + 1, email_ref = NULL, sent_by = NULL", [],
    { data: { email_ref: c.email_ref, reason, ...extra }, task: { reopen: true }, when });
  // Its email, still queued and not yet claimed by the sender, is cancelled with it in the same batch.
  const unqueue = (env, c, actor, reason, extra) => [
    env.DB.prepare("UPDATE outbound SET status = 'cancelled', updated_at = ? WHERE ref = ? AND status = 'queued'").bind(now(), c.email_ref),
    ...back(env, c, actor, reason, " AND changes() = 1", extra)];
  // Sent by email at the time the provider took it (at), which is when the wait for an answer starts.
  const emailed = (env, c, actor, type, at, task) => step(env, c, actor, type, "status = 'sent', sent_at = ?, sent_via = 'email', sent_recorded_at = ?",
    [at, now()], { data: { email_ref: c.email_ref }, task });

  // A person approves sending exactly this version by email: this recipient, this contact's address and this text. A
  // second approval of the same version is the first one; any change after it is another version, approved by nobody.
  async function approve({ request, env, admin, params: [id] }) {
    const body = await readJson(request);
    if (!Number.isSafeInteger(body?.revision)) fail(400, "Invalid format");
    const c = await one(env, id);
    if (c.status !== "manual_pending") fail(409, NOT_WAITING);
    if (c.revision !== body.revision) fail(409, CHANGED);
    const d = await detail(env, c);
    if (d.blocked) fail(409, d.blocked);
    if (!emailAddress(d.contact?.email)) fail(409, NO_EMAIL);
    await env.DB.batch(step(env, c, admin, "send_approved", "approved_revision = revision, approved_by = ?, approved_at = ?", [admin, now()],
      { when: " AND approved_revision IS NOT revision" }));
    const after = await one(env, id);
    if (after.approved_revision !== c.revision) fail(409, CHANGED);
    return json({ consultation: await detail(env, after) });
  }

  // Queues the approved version in the app's email pipeline, once: two people and a retry find it already queued. Checked
  // again first: the approval, what blocks the enquiry, the contact's address and whether the app may send email now.
  // The pipeline asks the pause, the suppressions and the daily limit again before the provider is called.
  async function sendEmail({ request, env, admin, params: [id] }) {
    const body = await readJson(request);
    if (!Number.isSafeInteger(body?.revision)) fail(400, "Invalid format");
    const c = await one(env, id);
    if (c.revision !== body.revision) fail(409, CHANGED);
    if (c.email_ref && c.status !== "manual_pending") return json({ consultation: await detail(env, c) }); // the same send again
    if (c.status !== "manual_pending") fail(409, NOT_WAITING);
    if (c.approved_revision !== c.revision) fail(409, "Approve sending this version first: nothing goes out without it.");
    const d = await detail(env, c), to = emailAddress(d.contact?.email), stop = d.blocked ?? (to ? await emailStop(env) : NO_EMAIL);
    if (stop) fail(409, stop);
    const hash = await sha256(to), ts = now(), ref = crypto.randomUUID().replaceAll("-", "");
    if (await env.DB.prepare("SELECT 1 FROM email_suppressions WHERE address_hash = ?").bind(hash).first())
      fail(409, `This address is on the email suppression list, so the app does not write to it: choose another contact, or ${BY_HAND}`);
    const l = await env.DB.prepare("SELECT title, location, country FROM listings WHERE id = ?").bind(c.listing_id).first(), place = l.location || l.country;
    await env.DB.batch([
      // One email per version at most (dedupe_key), and only for the enquiry as it was just read: approved, with a match that counts.
      env.DB.prepare(`INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash, subject, text, status,
          approved_by, approved_at, created_at, updated_at)
        SELECT ?, ?, 'enquiry', ?, revision, ?, ?, ?, body, 'queued', approved_by, approved_at, ?, ? FROM consultations
        WHERE id = ? AND revision = ? AND status = 'manual_pending' AND approved_revision = revision AND contact_key = ? AND ${counts("1")}
          AND (occupants_match_id IS NULL OR ${counts("cm.match_id = consultations.occupants_match_id")})
        ON CONFLICT (dedupe_key) DO NOTHING`).bind(ref, await sha256(`enquiry\0${c.id}\0${c.revision}`), String(c.id), to, hash,
        `Enquiry about ${l.title}${place ? `, ${place}` : ""} (our reference ${c.listing_id})`.slice(0, 400), ts, ts, c.id, c.revision, c.contact_key),
      ...step(env, c, admin, "email_queued", "status = 'queued', email_ref = ?, sent_by = ?", [ref, admin],
        { data: { email_ref: ref }, task: QUEUED_TASK, when: " AND changes() = 1" })]);
    const after = await one(env, id);
    if (after.status === "manual_pending") fail(409, CHANGED);
    return json({ consultation: await detail(env, after) });
  }

  // The email service did not say whether the email went out, and the app never sends it again by itself: a person
  // checks and says which. Sent: at the time it was attempted. Not sent: back to a person, as a new version.
  async function outcome({ request, env, admin, params: [id] }) {
    const body = await readJson(request);
    if (!Number.isSafeInteger(body?.revision) || typeof body.sent !== "boolean") fail(400, "Invalid format");
    const c = await one(env, id);
    if (c.status !== "needs_review") fail(409, "This enquiry is not waiting for its email to be checked. Reload to see it.");
    if (c.revision !== body.revision) fail(409, CHANGED);
    const tried = await env.DB.prepare("SELECT claimed_at FROM outbound WHERE ref = ?").bind(c.email_ref).first();
    await env.DB.batch(body.sent ? emailed(env, c, admin, "email_confirmed", tried?.claimed_at ?? now(), { ...CHECK_TASK, resolved: true })
      : back(env, c, admin, "checked"));
    const after = await one(env, id);
    if (after.status === "needs_review") fail(409, CHANGED);
    return json({ consultation: await detail(env, after) });
  }

  // A person takes back an email that has not left (sending paused, switched off, or anything else): if the sender has
  // not claimed it yet, it is cancelled and the enquiry returns to manual sending as a new version that nobody approved.
  // operation_id: the same click again finds it done.
  async function giveBack({ request, env, admin, params: [id] }) {
    const body = await readJson(request);
    if (!UUID.test(body?.operation_id ?? "") || !Number.isSafeInteger(body.revision)) fail(400, "Invalid format");
    const c = await one(env, id);
    if (await env.DB.prepare(`SELECT 1 FROM events WHERE type = 'consultation.email_not_sent' AND entity_type = 'listing' AND entity_id = ?
      AND json_extract(data, '$.consultation_id') = ? AND json_extract(data, '$.operation_id') = ?`).bind(c.listing_id, c.id, body.operation_id).first())
      return json({ consultation: await detail(env, c) });
    if (c.status !== "queued") fail(409, "This enquiry has no email waiting to leave. Reload to see it.");
    if (c.revision !== body.revision) fail(409, CHANGED);
    await env.DB.batch(unqueue(env, c, admin, "returned", { operation_id: body.operation_id }));
    const after = await one(env, id);
    if (after.status === "queued") fail(409, "This email is already being sent, or its result has just come in. Reload in a few minutes to see it.");
    return json({ consultation: await detail(env, after) });
  }

  // The clock's part, after each email dispatch (server/consultation-email.js), for every enquiry whose email waits or
  // was tried. Still queued but switched off (AGE05_SEND_READY in the clock's vars), queued for more than a day, no longer
  // claimable, or blocked: taken out of the queue unsent. Accepted by the provider:
  // sent, at that time. Uncertain: it waits for a person and is never sent again. Rejected, cancelled or gone: back to
  // a person. An email being sent right now is left for the next pass. Safety does not rest on this pass: the claim
  // asks claimable itself. ponytail: 50 a pass, the rest on the next tick.
  async function settle(env) {
    const on = env.AGE05_SEND_READY === "1";
    const { results } = await env.DB.prepare(`SELECT c.*, outbound.status AS email_status, outbound.updated_at AS email_at,
      outbound.error_code AS email_error, outbound.created_at <= ${QUEUE_LIMIT} AS expired, ${claimable} AS claimable
      FROM consultations c LEFT JOIN outbound ON outbound.ref = c.email_ref WHERE c.status = 'queued' ORDER BY outbound.id LIMIT 50`).all();
    for (const { email_status: status, email_at, email_error, expired, claimable: may, ...c } of results) {
      if (status === "sending") continue;
      if (status !== "queued") await env.DB.batch(status === "accepted" ? emailed(env, c, "system", "sent_by_email", email_at, { ...QUEUED_TASK, resolved: true })
        : status === "unknown" ? step(env, c, "system", "email_unknown", "status = 'needs_review'", [], { data: { email_ref: c.email_ref }, task: { ...CHECK_TASK, reopen: true } })
        : back(env, c, "system", email_error ?? status ?? "missing"));
      else if (!on) await env.DB.batch(unqueue(env, c, "system", "switched_off"));
      else if (expired) await env.DB.batch(unqueue(env, c, "system", "expired"));
      else if (!may || (await detail(env, c)).blocked) await env.DB.batch(unqueue(env, c, "system", "blocked"));
    }
  }

  // Off, or before migration 0077: reads answer { enabled: false } and writes 404, as if the routes were not there.
  const guarded = (handler, read) => async ctx => {
    const off = () => (read ? json({ enabled: false }) : fail(404, "Not found"));
    if (!enquiriesReady(ctx.env)) return off();
    try { return await handler(ctx); } catch (e) { if (missing(e)) return off(); throw e; }
  };
  // AGE-05's own routes are not there until its switch, EST-15 and migration 0080 are. Those that only close what was
  // queued or left unconfirmed (closing) stay after it is switched off: nothing new can be sent through them.
  const sends = (handler, closing) => guarded(async ctx => (await (closing ? migrated(ctx.env) : sending(ctx.env)) ? handler(ctx) : fail(404, "Not found")));
  return { settle, claimable, routes: [
    ["GET", /^\/admin\/matches\/(\d+)\/consultation$/, guarded(context, true), true],
    ["POST", /^\/admin\/matches\/(\d+)\/consultation$/, guarded(prepare), true],
    ["GET", /^\/admin\/listings\/(HE-[A-Z]\d{3,})\/consultations$/, guarded(forListing, true), true],
    ["PUT", /^\/admin\/consultations\/(\d+)$/, guarded(update), true],
    ["POST", /^\/admin\/consultations\/(\d+)\/manual-send$/, guarded(manualSend), true],
    ["POST", /^\/admin\/consultations\/(\d+)\/approve-sending$/, sends(approve), true],
    ["POST", /^\/admin\/consultations\/(\d+)\/send-email$/, sends(sendEmail), true],
    ["POST", /^\/admin\/consultations\/(\d+)\/email-outcome$/, sends(outcome, true), true],
    ["POST", /^\/admin\/consultations\/(\d+)\/return-to-manual$/, sends(giveBack, true), true],
  ] };
}
export default gates => enquiries(gates).routes;
