// VIS-08: the cycle of a viewing (architecture §4.5): Requested → Confirmed → Reminded → Completed → Feedback received.
// Reminded and Feedback received are dates beside the status (migration 0071), read here: the status itself keeps its
// five values. Off (VIS08_CYCLE_READY) or before the migration, the panel and its routes work as before.
export const cycleReady = env => env?.VIS08_CYCLE_READY === "1";

// How the client was reminded. AUT-17's automatic reminder is to write reminded_at, reminded_by = 'automation' and
// reminded_channel = 'email' on the same row (the columns' contract is in migration 0071).
export const REMINDER_CHANNELS = ["phone", "email", "whatsapp", "in_person"];

// Switched on and migrated. row: a viewing read with SELECT *, when one is at hand (no query then).
export async function cycleOn(env, row) {
  if (!cycleReady(env)) return false;
  if (row) return "reminded_at" in row;
  try { await env.DB.prepare("SELECT reminded_at FROM viewing_requests LIMIT 1").first(); return true; }
  catch (e) { if (/no such column/.test(e?.message ?? "")) return false; throw e; }
}

// The stage a viewing is at: its status, "reminded" (confirmed, and the client reminded of this time) or "feedback"
// (completed, with the client's answer: VIS-04's outcome). A reminder says nothing once the viewing is over.
export const stageOf = v => (v.status === "confirmed" && v.reminded_at ? "reminded"
  : v.status === "completed" && v.outcome ? "feedback" : v.status);

// A confirmed viewing still to end that starts in less than 24 hours and that nobody has reminded the client of.
// clock: jerseyNow(). ponytail: wall-clock arithmetic, an hour out across a clock change (twice a year).
export const reminderDue = (v, clock) => v.status === "confirmed" && !v.reminded_at
  && `${v.date} ${v.end_time ?? v.time}` >= `${clock.date} ${clock.time}`
  && Date.parse(`${v.date}T${v.time}:00Z`) - Date.parse(`${clock.date}T${clock.time}:00Z`) < 24 * 3600000;

// VIS-04: what the decision after a viewing asks of the team. Proceed and Need more information leave a follow-up task
// in the Inbox with the viewing's event (category task: Hermes relays only new applicants and viewing requests, so
// nothing is sent). Not interested leaves nothing, and no decision touches the search or a match (master plan). The
// name in the title (last, as in "Viewing request: …", so a narrow list still shows the decision) goes when the viewing
// is deleted, as a request's does. Off (VIS04_OUTCOME_READY): as before.
export const outcomeReady = env => env?.VIS04_OUTCOME_READY === "1";
const FOLLOW_UP = { proceed: "Wants to proceed", more_info: "Needs more information" };
export const followUp = (env, v, outcome) => (outcomeReady(env) && Object.hasOwn(FOLLOW_UP, outcome ?? "")
  ? { category: "task", title: `${FOLLOW_UP[outcome]}: ${v.name}`, action_required: true } : null);
