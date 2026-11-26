// AUT-25: whether a welcome email to a new applicant (outbound row in scope) may be claimed now, in SQL. server/email.js
// asks it in the claim itself and again just before the transport. A leaf: server/email.js imports it, so it imports
// nothing of email.js's (server/applicant-welcome.js queues and settles them).
// The search is still active, still New and nobody has taken it, its criteria are those the text was written from
// (match_inputs_revision + 1 as outbound.version, which is never 0), the address is still its contact's, and it was queued less than a day ago.
// "0" (none is claimed) while switched off.
export const welcomeReady = env => env?.AUT25_APPLICANT_WELCOME_READY === "1";
export const WELCOME = "applicant_welcome";
export const WELCOME_HOURS = 24;

// t: ms, for the tests.
export function welcomeClaimSql(env, t = Date.now()) {
  if (!welcomeReady(env)) return "0";
  return `EXISTS (SELECT 1 FROM applicants a JOIN contacts c ON c.id = a.contact_id WHERE a.id = CAST(outbound.entity_id AS INTEGER)
    AND a.archived_at IS NULL AND a.search_state = 'active' AND a.stage = 'new' AND a.assigned_to IS NULL
    AND a.match_inputs_revision + 1 = outbound.version AND lower(trim(c.email)) = outbound.recipient
    AND outbound.created_at > '${new Date(t - WELCOME_HOURS * 3600e3).toISOString()}')`;
}
