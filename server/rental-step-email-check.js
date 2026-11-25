// AUT-23: whether a rental email (outbound templates rent_arrears, renewal_landlord, renewal_tenant) may be claimed now,
// in SQL from its outbound row. server/email.js asks it in the claim itself and again just before the transport. A leaf:
// server/email.js imports it, so it imports nothing of email.js's (server/rental-step-emails.js prepares, queues and settles).
// It asks: queued with the approval of this very revision by a member of the team, less than a day ago; the tenancy and
// its property exactly as they were when the text was written; the recipient still that party's email; and the source
// unchanged: for arrears, the tenancy still running and fully managed, the step not marked done and still the one due
// (before valid_until), the amount owed today the same; for renewal, the fixed term still in its renewal window with no
// notice, the same end date, no answer recorded since and the same rent in force (and, to the landlord, the landlord
// unchanged). Built per call with literal dates and no bind parameters (the claim's own are positional).
import { LEGAL } from "./rentals.js";
import { jerseyToday, plusDays } from "./viewings.js";

export const rentalStepEmailsReady = env => env?.AUT23_RENTAL_EMAILS_READY === "1";
export const ARREARS_EMAIL = "rent_arrears", RENEWAL_LANDLORD = "renewal_landlord", RENEWAL_TENANT = "renewal_tenant";
export const RENTAL_STEP_EMAILS = [ARREARS_EMAIL, RENEWAL_LANDLORD, RENEWAL_TENANT];
// Migration 0127 is there. Before it no statement names rental_step_emails.
export const rentalStepEmailTable = env => env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'rental_step_emails'")
  .first().then(Boolean, () => false);
export const RENTAL_STEP_QUEUE_LIMIT = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')";

// today: Jersey date (YYYY-MM-DD, from jerseyToday: digits and dashes only). net: ADM-09's write-offs count (its switch),
// as the panel's balance does; without it no arrears email is claimed (its draft only exists with that switch).
export function rentalStepClaimable(today, net) {
  const owed = `(SELECT COALESCE(SUM(c.amount - COALESCE((SELECT SUM(CASE x.kind WHEN 'writeoff' THEN x.amount_pence ELSE -x.amount_pence END)
      FROM charge_adjustments x WHERE x.charge_id = c.id AND x.effective_on <= '${today}'), 0)), 0) FROM charges c
      WHERE c.tenancy_id = t.id AND c.due_on <= '${today}')
    - (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.tenancy_id = t.id AND p.kind = 'rent')`;
  const arrears = !net ? "0" : `r.service = 'full' AND (t.ended_on IS NULL OR t.ended_on > '${today}')
      AND lower(trim(t.tenant_email)) = outbound.recipient AND (re.valid_until IS NULL OR re.valid_until > '${today}')
      AND NOT EXISTS (SELECT 1 FROM arrears_steps x WHERE x.tenancy_id = t.id AND x.charge_due_on = re.charge_due_on AND x.step = re.step)
      AND ${owed} = re.amount`;
  const rent = `COALESCE((SELECT c.rent FROM rent_changes c WHERE c.tenancy_id = t.id AND c.effective_on <= max('${today}', t.start_on)
    ORDER BY c.effective_on DESC LIMIT 1), t.rent)`;
  const renewal = `t.kind = 'fixed' AND t.ended_on IS NULL AND t.notice_given_on IS NULL AND t.end_on = re.source_key
      AND t.end_on <= '${plusDays(today, LEGAL.renewalDays)}' AND ${rent} = re.amount
      AND COALESCE((SELECT MAX(e.id) FROM rental_events e WHERE e.rental_id = t.rental_id AND e.tenancy_id = t.id
        AND e.type = 'renewal.answered'), 0) = re.answer_mark`;
  return `EXISTS (SELECT 1 FROM rental_step_emails re JOIN tenancies t ON t.id = re.tenancy_id JOIN rentals r ON r.id = t.rental_id
  WHERE re.email_ref = outbound.ref AND re.kind = outbound.template AND re.status = 'queued' AND re.revision = outbound.version
    AND re.approved_revision = re.revision AND outbound.created_at > ${RENTAL_STEP_QUEUE_LIMIT}
    AND t.updated_at = re.tenancy_updated_at AND r.updated_at = re.rental_updated_at AND r.archived_at IS NULL
    AND EXISTS (SELECT 1 FROM admins WHERE email = re.approved_by)
    AND CASE re.kind WHEN '${ARREARS_EMAIL}' THEN ${arrears}
      WHEN '${RENEWAL_LANDLORD}' THEN ${renewal} AND EXISTS (SELECT 1 FROM landlords l WHERE l.id = r.landlord_id
        AND l.archived_at IS NULL AND l.updated_at = re.landlord_updated_at AND lower(trim(l.email)) = outbound.recipient)
      ELSE ${renewal} AND lower(trim(t.tenant_email)) = outbound.recipient END)`;
}
// "0" (none is claimed) while switched off, before migration 0127, or if the schema cannot be read.
export const rentalStepClaimSql = async (env, today = jerseyToday()) =>
  (rentalStepEmailsReady(env) && await rentalStepEmailTable(env) ? rentalStepClaimable(today, env?.ADM09_ARREARS_READY === "1") : "0");

// The tenancy page's part (server/routes/rent.js detail, only with the switch and 0127): each email of the tenancy, by
// kind and source, with its status, so the arrears step and the renewal show what happened to theirs.
export async function rentalStepEmailRows(env, tenancyId) {
  if (!rentalStepEmailsReady(env) || !(await rentalStepEmailTable(env))) return null;
  const { results } = await env.DB.prepare(`SELECT kind, source_key, charge_due_on, step, status, revision, approved_revision = revision AS approved,
    sent_at FROM rental_step_emails WHERE tenancy_id = ? ORDER BY id`).bind(Number(tenancyId)).all();
  return results.map(r => ({ ...r, approved: !!r.approved }));
}
