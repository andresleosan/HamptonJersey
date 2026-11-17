// EST-14 (M08/M09): the rest of a match's journey — Interested, Viewing booked, Viewed, Offer, Agreed and the exits —
// read from the facts that prove each step, on the search and the property they are about:
// - what the client said: their answer on a private link (AGE-12), the answer after a viewing (VIS-04) or a person's
//   record of it (match_journey_steps, migration 0116, written here); the latest word wins, every one is kept;
// - a viewing only once a person linked it to this search (VIS-17's viewing_proposals.applicant_id, never by email);
//   booked only when every required person accepted the time it is at, viewed only once completed;
// - an offer and its sale (Sales) only on a search to buy; a tenancy entered from this property and search (ADM-06).
// It writes no match, criteria, availability or search state: a client's no leaves the home offered to everyone and a
// viewing, offer or agreement leaves the search active until a person resolves it (EST-09). Sends nothing.
// Switched off (EST14_JOURNEY_READY), or before 0116, nothing here is read and cards and routes answer as before.
import { json, fail, readJson, now } from "./http.js";
import { activeSql, isActive, REJECT_REASONS } from "./applicants.js";
import { vis17Ready } from "./viewing-coordination.js";

export const journeyReady = env => env?.EST14_JOURNEY_READY === "1";
const missing = e => /no such table/.test(e?.message ?? "");
export const ACTIONS = ["interested", "not_interested"];
const REASONS = REJECT_REASONS.map(([v]) => v);
const HISTORY = 50;

// The client's word in each source, as one value of the interest dimension.
const ANSWER = { interested: "interested", request_viewing: "wants_viewing", not_for_me: "not_interested", call_me: "call_me" };
const OUTCOME = { proceed: "interested", more_info: "more_info", not_interested: "not_interested" };
const INTERESTED = ["interested", "wants_viewing", "call_me", "more_info"];
const OPEN_OFFER = ["pending", "countered"];

// facts: { operation, steps, answers, viewings, offers, tenancies } of one match (journeyReader's rows); at: now, ISO.
// Gives { revision, interest, interest_at, stage, history }: interest is no_answer when nothing was said (never "no"),
// stage the furthest step a fact in force proves, history every fact newest first (at most 50).
export function matchJourney({ operation, steps = [], answers = [], viewings = [], offers = [], tenancies = [] }, at = now()) {
  const words = [
    ...steps.map(s => ({ kind: "step", at: s.created_at, value: s.action, reason_code: s.reason_code, note: s.note, by: s.created_by,
      revision: s.revision, match_id: s.match_id })),
    ...answers.filter(a => a.sent_at && a.choice).map(a => ({ kind: "answer", at: a.answered_at, value: a.choice, note: a.reason,
      grant_id: a.grant_id })),
  ];
  const sentOnly = answers.filter(a => a.sent_at).map(a => ({ kind: "sent", at: a.sent_at, grant_id: a.grant_id }));
  // A viewing's moment: when VIS-04's answer was recorded, else when it was booked (every acceptance) or linked to this
  // search (VIS-17). Never updated_at: editing a viewing's notes is no fact of the journey.
  const seen = viewings.map(v => ({ kind: "viewing", at: v.feedback_at ?? v.booked_at ?? v.linked_at ?? v.created_at, id: v.id, status: v.status,
    date: v.date, time: v.time, booked: !!v.booked, outcome: v.outcome, note: v.outcome_note, answered_at: v.feedback_at }));
  const offered = operation === "buy" ? offers : [];
  const sales = offered.filter(o => o.sale_id).map(o => ({ kind: "sale", at: o.sale_closed_at ?? o.sale_at, id: o.sale_id, status: o.sale_status }));
  const history = [...words, ...sentOnly, ...seen,
    ...offered.map(o => ({ kind: "offer", at: o.updated_at, id: o.id, status: o.status, amount: o.amount, counter_amount: o.counter_amount })),
    ...sales, ...(operation === "rent" ? tenancies : []).map(t => ({ kind: "tenancy", at: t.created_at, id: t.tenancy_id, rental_id: t.rental_id }))]
    .sort((x, y) => (y.at ?? "").localeCompare(x.at ?? "") || KIND_ORDER[x.kind] - KIND_ORDER[y.kind]);

  // The client's latest word, from any source; a link sent after it, still in force and unanswered, waits for them.
  // VIS-04's answer counts only with the moment it was recorded (feedback_at); a completion without one says nothing.
  const said = [...words, ...seen.filter(v => v.status === "completed" && v.outcome && v.answered_at)
    .map(v => ({ at: v.answered_at, value: OUTCOME[v.outcome] }))]
    .map(w => ({ at: w.at, value: ANSWER[w.value] ?? w.value })).sort((x, y) => y.at.localeCompare(x.at))[0];
  const waiting = answers.some(a => a.sent_at && !a.choice && !a.revoked_at && (!a.expires_at || a.expires_at > at) && (!said || a.sent_at > said.at));
  const interest = waiting ? "waiting" : said?.value ?? "no_answer";
  // The step follows the last word given, not the wait: a new link sent afterwards takes no step back.
  const word = said?.value;
  // A client's no ends the journey unless a viewing step came after it: then the newer fact wins (a person linked or
  // booked a viewing for this search after the no, so the client changed their mind). The no stays as the client's word.
  const viewingSince = !!said && seen.some(v => ["requested", "confirmed", "completed"].includes(v.status) && v.at > said.at);

  const sale = sales.find(s => s.status === "in_progress") ?? sales.find(s => s.status === "completed");
  const agreed = (operation === "rent" && tenancies.length) || sale?.status === "in_progress"
    || offered.some(o => o.status === "accepted" && !o.sale_id);
  const stage = agreed ? "agreed" : sale ? "completed"
    : offered.some(o => OPEN_OFFER.includes(o.status)) ? "offer"
    : word === "not_interested" && !viewingSince ? "not_interested"
    : seen.some(v => v.status === "completed") ? "viewed"
    : seen.some(v => v.status === "confirmed" && v.booked) ? "viewing_booked"
    : seen.some(v => v.status === "requested" || v.status === "confirmed") ? "viewing_requested"
    : INTERESTED.includes(word) ? "interested" : "none";
  return { revision: Math.max(0, ...steps.map(s => s.revision)), interest, ...(said ? { interest_at: said.at } : {}), stage,
    history: history.slice(0, HISTORY) };
}
// Ties at the same moment: the later step of a journey first.
const KIND_ORDER = { tenancy: 0, sale: 1, offer: 2, viewing: 3, step: 4, answer: 5, sent: 6 };

// The matches m whose ids are the JSON list bound.
const IDS = "m.id IN (SELECT value FROM json_each(?))";
const READS = {
  steps: () => `SELECT m.id AS of, s.match_id, s.revision, s.action, s.reason_code, s.note, s.created_at, s.created_by FROM matches m
    JOIN match_journey_steps s ON s.applicant_id = m.applicant_id AND s.listing_id = m.listing_id WHERE ${IDS}`,
  answers: env => env?.AGE12_PRESENTATIONS_READY === "1" && `SELECT o.match_id AS of, o.grant_id, o.choice, o.reason, o.answered_at,
    g.sent_at, g.revoked_at, g.expires_at FROM presentation_options o JOIN presentation_grants g ON g.id = o.grant_id
    WHERE o.match_id IN (SELECT value FROM json_each(?))`,
  // The viewings of this property whose latest proposal naming a search names this one (VIS-17), linked when that
  // proposal was made; booked: every person asked accepted a proposal for the time the viewing is at now, and with the
  // negotiator it has now when the negotiator was asked (booked_at: when that acceptance confirmed it).
  viewings: env => vis17Ready(env) && `SELECT m.id AS of, v.id, v.status, v.date, v.time, v.outcome, v.outcome_note, v.feedback_at,
    v.created_at, p.created_at AS linked_at, b.closed_at AS booked_at, b.closed_at IS NOT NULL AS booked
    FROM matches m JOIN viewing_proposals p ON p.applicant_id = m.applicant_id JOIN viewing_requests v ON v.id = p.viewing_id
      AND v.listing_id = m.listing_id
    LEFT JOIN viewing_proposals b ON b.id = (SELECT MAX(c.id) FROM viewing_proposals c WHERE c.viewing_id = v.id AND c.state = 'confirmed'
      AND c.date = v.date AND c.time = v.time AND (c.negotiator_id IS v.negotiator_id
        OR NOT EXISTS (SELECT 1 FROM json_each(c.required) r WHERE r.value = 'staff')))
    WHERE ${IDS} AND p.revision = (SELECT MAX(q.revision) FROM viewing_proposals q WHERE q.viewing_id = p.viewing_id AND q.applicant_id IS NOT NULL)`,
  offers: () => `SELECT m.id AS of, o.id, o.status, o.amount, o.counter_amount, o.created_at, o.updated_at, s.id AS sale_id,
    s.status AS sale_status, s.created_at AS sale_at, s.closed_at AS sale_closed_at FROM matches m JOIN applicants a ON a.id = m.applicant_id
    JOIN offers o ON o.applicant_id = m.applicant_id AND o.listing_id = m.listing_id LEFT JOIN sales s ON s.offer_id = o.id
    WHERE ${IDS} AND a.operation = 'buy'`,
  tenancies: env => env?.ADM06_TENANCY_ORIGIN_READY === "1" && `SELECT m.id AS of, t.tenancy_id, t.rental_id, t.created_at FROM matches m
    JOIN applicants a ON a.id = m.applicant_id JOIN tenancy_origins t ON t.applicant_id = m.applicant_id AND t.listing_id = m.listing_id
    WHERE ${IDS} AND a.operation = 'rent'`,
};

// For match cards: match id => its journey. One batch for all of them. undefined: switched off or before 0116 (no
// query at all while off). A producer switched off adds no facts.
export async function journeyReader(env, ids) {
  if (!journeyReady(env)) return undefined;
  if (!ids.length) return () => undefined;
  const reads = Object.entries(READS).map(([k, sql]) => [k, sql(env)]).filter(([, sql]) => sql), list = JSON.stringify(ids);
  let results;
  try {
    results = await env.DB.batch([env.DB.prepare(`SELECT m.id, a.operation FROM matches m JOIN applicants a ON a.id = m.applicant_id WHERE ${IDS}`)
      .bind(list), ...reads.map(([, sql]) => env.DB.prepare(sql).bind(list))]);
  } catch (e) {
    if (missing(e)) return undefined;
    throw e;
  }
  const [operations, ...facts] = results.map(r => r.results), at = now();
  return id => {
    const m = operations.find(o => o.id === id);
    if (!m) return undefined;
    return matchJourney({ operation: m.operation,
      ...Object.fromEntries(reads.map(([k], i) => [k, facts[i].filter(f => f.of === id).map(({ of, ...f }) => f)])) }, at);
  };
}

async function journeyOn(env) {
  if (!journeyReady(env)) return false;
  return !!(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'match_journey_steps'").first());
}

// A person's record of what the client said about this home: { action, reason_code?, note? } plus the property the card
// is about (listing_id) and the journey revision it was read at (expected_revision). null with the message when invalid.
export function validateStep(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { error: "Invalid format" };
  if (!ACTIONS.includes(b.action)) return { error: "Choose interested or not interested" };
  if (typeof b.listing_id !== "string" || !b.listing_id || b.listing_id.length > 160) return { error: "Invalid property" };
  if (!Number.isSafeInteger(b.expected_revision) || b.expected_revision < 0) return { error: "Invalid revision. Reload to see it." };
  const no = b.action === "not_interested";
  if (no ? !REASONS.includes(b.reason_code) : b.reason_code != null) return { error: no ? "Choose why the client is not interested" : "Invalid format" };
  const note = b.note == null ? "" : typeof b.note === "string" ? b.note.trim() : null;
  if (note === null || note.length > 300) return { error: "Use 300 characters or fewer" };
  if (b.reason_code === "other" && !note) return { error: "Say why in a few words" };
  return { value: { action: b.action, reason_code: no ? b.reason_code : null, note: note || null, listing_id: b.listing_id,
    expected_revision: b.expected_revision } };
}

const STALE = "Someone recorded what the client said meanwhile. Reload to see it.";
const REVISION = "(SELECT COALESCE(MAX(revision), 0) FROM match_journey_steps s WHERE s.applicant_id = m.applicant_id AND s.listing_id = m.listing_id)";

// POST /admin/matches/:id/journey. The step and its event in one batch, only while the match is still about that
// property, its search active and no one recorded meanwhile. The note stays in the step, never in the event.
async function record({ request, env, admin, params: [id] }) {
  if (!(await journeyOn(env))) fail(404, "Not found");
  const { value: v, error } = validateStep(await readJson(request));
  if (error) fail(400, error);
  const m = await env.DB.prepare(`SELECT m.id, m.applicant_id, m.listing_id, a.archived_at, a.search_state, a.match_inputs_revision,
    ${REVISION} AS revision FROM matches m JOIN applicants a ON a.id = m.applicant_id WHERE m.id = ?`).bind(Number(id)).first();
  if (!m) fail(404, "Match not found");
  if (m.listing_id !== v.listing_id) fail(409, "This match is about another property. Reload to see it.");
  if (m.archived_at) fail(409, "Restore this search to record what the client said.");
  if (!isActive(m)) fail(409, "Reopen this search to record what the client said.");
  if (m.revision !== v.expected_revision) fail(409, STALE);
  const ts = now(), revision = m.revision + 1;
  let inserted;
  try {
    [inserted] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO match_journey_steps (applicant_id, listing_id, match_id, revision, action, reason_code, note,
        search_version, created_at, created_by)
        SELECT m.applicant_id, m.listing_id, m.id, ?, ?, ?, ?, a.match_inputs_revision, ?, ? FROM matches m JOIN applicants a ON a.id = m.applicant_id
        WHERE m.id = ? AND m.listing_id = ? AND ${activeSql("a")} AND ${REVISION} = ?`)
        .bind(revision, v.action, v.reason_code, v.note, ts, admin, m.id, v.listing_id, v.expected_revision),
      env.DB.prepare(`INSERT INTO events (at, actor, entity_type, entity_id, type, data)
        SELECT ?, ?, 'applicant', CAST(s.applicant_id AS TEXT), 'match.interest_changed', json_object('listing_id', s.listing_id,
          'match_id', s.match_id, 'action', s.action, 'reason_code', s.reason_code, 'revision', s.revision, 'search_version', s.search_version)
        FROM match_journey_steps s WHERE changes() = 1 AND s.applicant_id = ? AND s.listing_id = ? AND s.revision = ?`)
        .bind(ts, admin, m.applicant_id, m.listing_id, revision),
    ]);
  } catch (e) {
    if (/UNIQUE/.test(e?.message ?? "")) fail(409, STALE);
    throw e;
  }
  if (!inserted.meta.changes) fail(409, STALE);
  // Recorded: a read that cannot be made now (a producer switched on before its migration) answers null, never 500.
  return json({ journey: (await journeyReader(env, [m.id]))?.(m.id) ?? null });
}

export const journeyRoutes = [["POST", /^\/admin\/matches\/(\d+)\/journey$/, record, true]];
