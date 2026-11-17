// VIS-17: a viewing coordinated with several people (migration 0114). The team proposes one time for an existing
// viewing, saying who must accept (the client always; the advertiser or agency, and the negotiator when attending), and
// records each answer by hand with how and when it was given. The viewing moves to that time and is confirmed only by
// the write that finds every required answer accepted; until then it keeps its current time and status. Nothing is
// sent, no search is closed or changed, and no commission agreement is asked for. Switched off (VIS17_MULTIPART_READY),
// or before the migration, nothing here is read and the Viewings screen and its routes work as before.

export const vis17Ready = env => env?.VIS17_MULTIPART_READY === "1";

// Switched on and migrated. Off: no query at all.
export async function coordinationOn(env) {
  if (!vis17Ready(env)) return false;
  return !!(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'viewing_proposals'").first());
}

export const PARTICIPANTS = ["client", "advertiser", "staff"];
export const RESPONSES = ["accepted", "declined"];
export const EVIDENCE_CHANNELS = ["phone", "email", "whatsapp", "in_person", "other"];

// Who must accept, in a fixed order: the client always, each person once. null when invalid.
export function validRequired(list) {
  if (!Array.isArray(list) || !list.includes("client") || new Set(list).size !== list.length
    || list.some(p => !PARTICIPANTS.includes(p))) return null;
  return PARTICIPANTS.filter(p => list.includes(p));
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

// One person's answer to a proposal, as staff record it. required: the proposal's list; now: ms; since: the proposal's
// created_at (an answer cannot predate the time it answers; compared to the minute, as the panel enters minutes).
export function validateResponse(b, { required, now, since }) {
  const src = b && typeof b === "object" && !Array.isArray(b) ? b : {}, errors = {}, value = {};
  value.participant = required.includes(src.participant) ? src.participant : (errors.participant = "Choose whose answer this is", null);
  value.response = RESPONSES.includes(src.response) ? src.response : (errors.response = "Choose accepted or declined", null);
  value.channel = EVIDENCE_CHANNELS.includes(src.channel) ? src.channel : (errors.channel = "Choose how they answered", null);
  const at = typeof src.answered_at === "string" && ISO.test(src.answered_at) ? Date.parse(src.answered_at) : NaN;
  if (!Number.isFinite(at) || at > now + 60000 || at < Math.floor(Date.parse(since) / 60000) * 60000)
    errors.answered_at = "Enter when they answered, not in the future and not before the time was proposed";
  else value.answered_at = new Date(at).toISOString();
  const by = src.answered_by == null ? "" : typeof src.answered_by === "string" ? src.answered_by.trim() : null;
  if (by === null || by.length > 120) errors.answered_by = "Use 120 characters or fewer";
  else value.answered_by = by || null;
  return Object.keys(errors).length ? { errors } : { value };
}

// Where a viewing's coordination stands, from its latest proposal and that proposal's answers (VIS-08's coordination
// states): none, proposed (nobody answered yet), awaiting_confirmations, blocked (all accepted, but the time could not
// be booked any more), confirmed, declined, withdrawn (superseded or ended by the viewing's own reschedule or cancel).
// missing: who still has to accept an open proposal.
export function coordinationState(proposal, acceptances) {
  if (!proposal) return { state: "none", missing: [] };
  const accepted = new Set(acceptances.filter(a => a.response === "accepted").map(a => a.participant));
  const missing = JSON.parse(proposal.required).filter(p => !accepted.has(p));
  if (proposal.state !== "open") return { state: { confirmed: "confirmed", declined: "declined" }[proposal.state] ?? "withdrawn", missing: [] };
  return { state: !missing.length ? "blocked" : acceptances.length ? "awaiting_confirmations" : "proposed", missing };
}

// Whether a time falls inside the client's preferred viewing times (REG-17, applicants.viewing_availability: Sunday = 0,
// Jersey wall clock). Unknown times are never read as free.
export function clientFit(windows, { date, time, end_time }) {
  if (!Array.isArray(windows) || !windows.length) return "unknown";
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return windows.some(w => w.day === day && w.start <= time && w.end >= end_time) ? "fits" : "outside";
}

// Viewing `v` is still as it was when proposal `p` was made (aliases in scope; SQL and JS forms).
export const unchangedSql = (v, p) => `${v}.status = ${p}.from_status AND ${v}.negotiator_id IS ${p}.from_negotiator_id
  AND ${v}.date = ${p}.from_date AND ${v}.time = ${p}.from_time`;
export const unchanged = (v, p) => v.status === p.from_status && v.negotiator_id === p.from_negotiator_id
  && v.date === p.from_date && v.time === p.from_time;

// Proposal `p` (alias in scope) has an accepted answer from everyone it asks.
export const allAcceptedSql = p => `NOT EXISTS (SELECT 1 FROM json_each(${p}.required) r WHERE NOT EXISTS (
  SELECT 1 FROM viewing_acceptances a WHERE a.proposal_id = ${p}.id AND a.participant = r.value AND a.response = 'accepted'))`;

// SAP-09: viewing `v` (an alias, or ? bound to its id) was agreed through a proposal that asked the advertiser too, so the
// agency's acceptance is recorded: the only way a home another agency advertises is confirmed.
export const agreedWithAdvertiserSql = v => `EXISTS (SELECT 1 FROM viewing_proposals cp, json_each(cp.required) cr
  WHERE cp.viewing_id = ${v} AND cp.state = 'confirmed' AND cr.value = 'advertiser')`;
export const AGENCY_REQUIRED = "Another agency advertises this property: the advertiser or agency must accept too";

// The open searches of the person who asked for viewing `v`, by the Viewings tab's cross (SAP-08): the contact's email,
// or a phone ending in the contact's last 9 digits. A person picks one; it is never chosen for them. one: also bind ?3.
export const searchesSql = one => `SELECT a.id, a.operation, a.search_state, a.viewing_availability FROM applicants a
  JOIN contacts c ON c.id = a.contact_id WHERE a.archived_at IS NULL AND a.search_state IN ('active', 'needs_review')
    AND ((?1 IS NOT NULL AND c.email = ?1) OR (?2 IS NOT NULL AND c.phone IS NOT NULL AND ?2 LIKE '%' || substr(c.phone, -9)))${
  one ? " AND a.id = ?3" : ""} ORDER BY a.id DESC LIMIT 20`;
export const searchArgs = v => [v.email?.trim().toLowerCase() || null, v.phone?.replace(/[\s\-().]/g, "") || null];

// A search for renting does not fit a property for sale, nor the other way round.
const WANTS = { sale: "buy", rent: "rent" };
export const operationFits = (listingOperation, applicantOperation) =>
  !Object.hasOwn(WANTS, listingOperation ?? "") || WANTS[listingOperation] === applicantOperation;

// The viewing's own reschedule, cancel, completion or no-show (server/routes/inbox.js) ends its open proposal, only if
// that write happened (its updated_at and updated_by are this request's). Last in the action's batch.
export const closeOpenProposal = (env, { id, state, ts, admin }) => env.DB.prepare(`UPDATE viewing_proposals
  SET state = ?, closed_at = ?, closed_by = ? WHERE viewing_id = ? AND state = 'open'
    AND EXISTS (SELECT 1 FROM viewing_requests WHERE id = ? AND updated_at = ? AND updated_by = ?)`)
  .bind(state, ts, admin, id, id, ts, admin);
