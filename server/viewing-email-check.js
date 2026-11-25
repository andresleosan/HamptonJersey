// AUT-21: whether one of its two viewing emails (outbound row in scope) may be claimed now, in SQL. server/email.js asks
// it in the claim itself and again just before the transport. A leaf: server/email.js imports it, so it imports nothing
// of email.js's (server/viewing-emails.js queues and settles them).
// viewing_feedback: the viewing is still completed with no answer recorded, at the time queued, to the address it was
//   booked with, and its end is less than 7 days ago.
// viewing_cancelled_closed: the viewing is still cancelled by this pass (its event at the time queued), to the address it
//   was booked with, queued less than a day ago, before the viewing's start (review 25-nov: after it, a person tells the
//   client), and its property is still let (window withdrawn) or sold.
// "0" (none is claimed) while switched off, before migration 0087 (rental_closure_windows) or if the schema cannot be read.
import { local, SLOT } from "./viewing-reminders.js";

export const viewingEmailsReady = env => env?.AUT21_VIEWING_EMAILS_READY === "1";
export const FEEDBACK = "viewing_feedback", CLOSED_NOTICE = "viewing_cancelled_closed";
export const VIEWING_EMAILS = [FEEDBACK, CLOSED_NOTICE];
export const END = "v.date || ' ' || COALESCE(v.end_time, v.time)";
export const NOTICE_HOURS = 24;
const D = 86400e3;

export const closureTable = env => env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'rental_closure_windows'")
  .first().then(Boolean, () => false);

// t: ms, for the tests.
export async function viewingEmailClaimSql(env, t = Date.now()) {
  if (!viewingEmailsReady(env) || !(await closureTable(env))) return "0";
  return `EXISTS (SELECT 1 FROM viewing_requests v WHERE v.id = CAST(outbound.entity_id AS INTEGER) AND ${SLOT} = outbound.version
    AND lower(trim(v.email)) = outbound.recipient AND CASE outbound.template
      WHEN '${FEEDBACK}' THEN v.status = 'completed' AND v.outcome IS NULL AND ${END} > '${local(t - 7 * D)}'
      ELSE v.status = 'cancelled' AND outbound.created_at > '${new Date(t - NOTICE_HOURS * 3600e3).toISOString()}'
        AND v.date || ' ' || v.time > '${local(t)}'
        AND EXISTS (SELECT 1 FROM events e WHERE e.entity_type = 'viewing' AND e.entity_id = outbound.entity_id
          AND e.type = 'viewing.cancelled' AND e.actor = 'automation' AND e.at = outbound.created_at)
        AND (EXISTS (SELECT 1 FROM rental_closure_windows w WHERE w.listing_id = v.listing_id AND w.state = 'withdrawn')
          OR EXISTS (SELECT 1 FROM sales s JOIN listings l ON l.id = s.listing_id WHERE s.listing_id = v.listing_id
            AND s.status = 'completed' AND l.availability = 'sold')) END)`;
}
