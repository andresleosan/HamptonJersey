// ADM-10: whether the email that takes a closed statement to its landlord (outbound template 'owner_statement') may be
// claimed now, in SQL from its outbound row. server/email.js asks it in the claim itself and again just before the
// transport. A leaf: server/email.js imports it, so it imports nothing of email.js's (server/statement-emails.js
// prepares, queues and settles them). It asks: queued with the approval of a member of the team, within a day; that
// revision still the latest closed one of its month and not yet marked sent; the landlord not archived and the
// recipient still their email. A closed revision never changes (migration 0090), so its number is its figures.
export const statementEmailReady = env => env?.ADM10_STATEMENT_EMAIL_READY === "1" && env?.ADM10_STATEMENTS_READY === "1";
export const STATEMENT_TEMPLATE = "owner_statement";
export const STATEMENT_QUEUE_LIMIT = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')";
export const STATEMENT_CLAIMABLE = `EXISTS (SELECT 1 FROM statement_runs s JOIN landlords l ON l.id = s.landlord_id
  WHERE s.id = CAST(outbound.entity_id AS INTEGER) AND s.revision = outbound.version AND s.sent_on IS NULL
    AND s.revision = (SELECT MAX(x.revision) FROM statement_runs x WHERE x.landlord_id = s.landlord_id AND x.month = s.month)
    AND l.archived_at IS NULL AND outbound.recipient = lower(trim(l.email)) AND outbound.created_at > ${STATEMENT_QUEUE_LIMIT}
    AND EXISTS (SELECT 1 FROM admins WHERE email = outbound.approved_by))`;
// "0" (none is claimed) while switched off.
export const statementEmailClaimSql = env => (statementEmailReady(env) ? STATEMENT_CLAIMABLE : "0");
