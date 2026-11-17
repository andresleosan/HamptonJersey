// AGE-09 (M06): the evidence of what was presented to each agency, per enquiry (server/consultations.js). It reads what
// AGE-03, AGE-05, AGE-06 and AGE-08 already write (the enquiry, the matches it served, its events, its emails and its
// call task) and writes nothing: no migration, no event, no send. For staff only, by enquiry id, a page of matches at a
// time; not a global history. AGE09_EVIDENCE_READY with AGE-03 (migration 0077): off, or before it, there is no route.
// A general check names the property and no client, so it presents nobody. A client's own case (the household size one
// search stated, or the must-haves of its clarification) counts as shared only once a person recorded sending the text
// or the provider took its email: approved, queued, taken back or unconfirmed shares nothing. Only what the text carried
// is listed, never the client's name or contact, the recipient's address or any commission: the evidence records what
// went out and when, and certifies no commercial right. AGE-05's emails are read if its columns are there (0080).
import { json, fail } from "./http.js";

export const evidenceReady = env => env?.AGE09_EVIDENCE_READY === "1" && env?.AGE03_ENQUIRIES_READY === "1";
const missing = e => /no such (table|column)/.test(e?.message ?? "");
const SENDING = ["prepared", "sent_manually", "send_approved", "email_queued", "sent_by_email", "email_unknown", "email_confirmed", "email_not_sent"];
// Of a match m: the events of its search about its property, and the approval each kind of enquiry joins under.
const OF_MATCH = "e.entity_type = 'applicant' AND e.entity_id = CAST(m.applicant_id AS TEXT) AND json_extract(e.data, '$.listing_id') = m.listing_id";
const APPROVAL = { general: "e.type = 'match.reviewed' AND json_extract(e.data, '$.to') = 'shortlisted'",
  clarification: "e.type = 'match.clarification' AND json_extract(e.data, '$.approved')" };

// { consultation, shared, general_checks, presentations, approvals, attempts, emails, responses, latest_response, calls,
// matches, matches_total, next_cursor }, or null when there is no such enquiry. cursor: the last match id of the page before.
export async function getConsultationEvidence(env, id, { cursor = 0, limit = 50 } = {}) {
  const c = await env.DB.prepare("SELECT * FROM consultations WHERE id = ?").bind(id).first();
  if (!c) return null;
  // Sent: a person recorded sending it, or the provider took its email. Nothing before that was shared with anyone. A
  // match served that sending if it had joined by the time the sending was recorded (by hand, or the provider's answer).
  const sent = c.sent_at != null, recorded = sent ? c.sent_recorded_at ?? c.sent_at : "";
  const [{ results: events }, recipient, { results: page }, total, { results: emails }, task] = await Promise.all([
    env.DB.prepare(`SELECT at, actor, type, data FROM events WHERE entity_type = 'listing' AND entity_id = ? AND type LIKE 'consultation.%'
      AND json_extract(data, '$.consultation_id') = ? ORDER BY id LIMIT 200`).bind(c.listing_id, c.id).all(),
    env.DB.prepare("SELECT id, name, kind, suppressed_at FROM advertisers WHERE id = ?").bind(c.advertiser_id).first(),
    env.DB.prepare(`SELECT cm.match_id, cm.linked_by, cm.linked_at, m.applicant_id${"response_outcome" in c ? ", cm.response_note" : ""},
        (SELECT json_object('by', e.actor, 'at', e.at) FROM events e WHERE ${OF_MATCH} AND ${APPROVAL[c.kind]} AND e.at <= cm.linked_at
          ORDER BY e.at DESC, e.id DESC LIMIT 1) AS approval
      FROM consultation_matches cm LEFT JOIN matches m ON m.id = cm.match_id
      WHERE cm.consultation_id = ? AND cm.match_id > ? ORDER BY cm.match_id LIMIT ?`).bind(c.id, cursor, limit + 1).all(),
    env.DB.prepare(`SELECT COUNT(*) AS n, SUM(linked_at <= ?) AS before_sending FROM consultation_matches WHERE consultation_id = ?`)
      .bind(recorded, c.id).first(),
    // AGE-05's emails for this enquiry, one per version at most. The text only of one the provider took.
    "email_ref" in c ? env.DB.prepare(`SELECT ref, version, status, approved_by, approved_at, created_at, updated_at,
      CASE WHEN status = 'accepted' THEN text END AS text FROM outbound WHERE template = 'enquiry' AND entity_id = ? ORDER BY id`)
      .bind(String(c.id)).all() : { results: [] },
    env.DB.prepare(`SELECT created_at, due_at, resolved_at, resolved_by, task_action FROM notifications WHERE task_key = ?`)
      .bind(`consultation:${c.operation_id}:call`).first()]);
  const more = page.length > limit, matches = page.slice(0, limit).map(({ approval, response_note, ...m }) => ({ ...m,
    approval: approval ? JSON.parse(approval) : null, before_sending: sent && m.linked_at <= recorded,
    ...(response_note ? { response_note } : {}) }));
  const of = type => events.filter(e => e.type === `consultation.${type}`);
  const data = e => JSON.parse(e.data ?? "{}");

  const accepted = emails.find(m => m.status === "accepted");
  const shared = sent ? { text: accepted?.text ?? c.body, property: c.listing_id, household_size: c.occupants ?? null, client_identity: false } : null;
  const when = { sent_at: c.sent_at, via: c.sent_via };
  const subject = c.kind === "general" ? c.occupants_match_id : Number(c.scope_key.split(":")[1]);
  const applicant = subject && (await env.DB.prepare("SELECT applicant_id FROM matches WHERE id = ?").bind(subject).first())?.applicant_id;
  const presentations = !sent || !subject ? [] : [{ match_id: subject, applicant_id: applicant ?? null,
    shared: [c.kind === "general" ? "household_size" : "must_haves"], ...(c.kind === "general" ? { household_size: c.occupants } : {}),
    identifies_client: false, ...when }];
  const general_checks = sent && c.kind === "general" ? [{ asked: c.asks_availability ? ["availability", "viewing_times"] : ["viewing_times"],
    identifies_client: false, ...when, by: c.sent_by, matches_at_sending: total.before_sending ?? 0 }] : [];

  const attempts = events.filter(e => SENDING.includes(e.type.slice(13))).map(e => {
    const d = data(e);
    return { type: e.type.slice(13), at: e.at, by: e.actor, ...(d.consultation_revision ? { revision: d.consultation_revision } : {}),
      ...(d.via ? { via: d.via } : {}), ...(d.email_ref ? { email_ref: d.email_ref } : {}), ...(d.reason ? { reason: d.reason } : {}),
      ...(e.type === "consultation.sent_manually" ? { sent_at: c.sent_at, evidence_ref: c.sent_evidence_ref } : {}) };
  });
  const approvals = of("send_approved").map(e => ({ type: "send", revision: data(e).consultation_revision, by: e.actor, at: e.at }));
  const responses = [...of("response_recorded"), ...of("cancelled")].map(e => {
    const d = data(e);
    return { type: e.type.slice(13), at: e.at, by: e.actor, ...(d.outcome ? { outcome: d.outcome, via: d.via } : {}), ...(d.scope ? { scope: d.scope } : {}) };
  });
  const latest_response = c.response_outcome ? { outcome: c.response_outcome, at: c.response_at, via: c.response_via, from: c.response_from,
    scope: c.response_scope, evidence_ref: c.response_evidence_ref, by: c.response_by, recorded_at: c.response_recorded_at } : null;
  const calls = { events: [...of("call_due"), ...of("call_closed")].map(e => ({ type: e.type.slice(13), at: e.at })), task: task ?? null };

  return { consultation: { id: c.id, kind: c.kind, status: c.status, revision: c.revision, listing_id: c.listing_id, operation: c.operation,
    prepared_by: c.prepared_by, prepared_at: c.prepared_at,
    recipient: !recipient || recipient.suppressed_at ? { id: c.advertiser_id, removed: true } : { id: recipient.id, name: recipient.name, kind: recipient.kind } },
  shared, general_checks, presentations, approvals, attempts, emails: emails.map(({ text, ...m }) => (text == null ? m : { ...m, text })),
  responses, latest_response, calls,
  matches, matches_total: total.n, next_cursor: more ? matches.at(-1).match_id : null };
}

const whole = (v, min, max, fallback) => (v == null ? fallback : /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max ? Number(v) : null);
async function read({ request, env, params: [id] }) {
  if (!evidenceReady(env)) fail(404, "Not found");
  const q = new URL(request.url).searchParams, cursor = whole(q.get("cursor"), 0, Number.MAX_SAFE_INTEGER, 0), limit = whole(q.get("limit"), 1, 50, 50);
  if (cursor == null || limit == null) fail(400, "Invalid format");
  let e;
  try { e = await getConsultationEvidence(env, Number(id), { cursor, limit }); }
  catch (err) { if (missing(err)) fail(404, "Not found"); throw err; }
  return e ? json(e) : fail(404, "Enquiry not found");
}
export default [["GET", /^\/admin\/consultations\/(\d+)\/evidence$/, read, true]];
