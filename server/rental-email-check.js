// AUT-24: whether one of the managed rentals' emails (outbound row in scope, templates RENTAL_EMAILS) may be claimed now,
// in SQL. server/email.js asks it in the claim itself and again just before the transport. A leaf: server/email.js
// imports it, so it imports nothing of email.js's (server/rental-emails.js prepares, queues and settles them).
// It asks: queued with the approval of this very revision by a member of the team, within a day; the recipient still
// that party's address (the tenancy's tenant_email; the landlord's email, landlord not archived); the property not
// archived; for the tenant, the tenancy not ended (a planned move-out passing changes no updated_at); and the source exactly as it was when the text was written (sourceSql, the same SQL the panel and the save
// read), so a change to the tenancy, the document, the rent change or what is owed after that and it does not leave.
export const rentalEmailsReady = env => env?.AUT24_TENANT_DOCS_READY === "1";
// Migration 0128 is there. Before it no statement names rental_emails.
export const rentalEmailTable = env => env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'rental_emails'")
  .first().then(Boolean, () => false);
// kind (rental_emails.kind) → outbound.template.
export const TEMPLATE = { licence_copy: "tenant_licence_copy", eicr_copy: "tenant_eicr_copy", deposit_info: "tenant_deposit_info",
  rent_notice: "tenant_rent_notice", landlord_arrears: "landlord_arrears_notice" };
export const RENTAL_EMAILS = Object.values(TEMPLATE);
export const TENANT_DOCS = ["licence_copy", "eicr_copy", "deposit_info"];
export const RENTAL_QUEUE_LIMIT = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')";

// The source of an email as one value, over t (tenancies), r (rentals) and l (landlords): the tenancy and the property as
// they are (any edit is a new updated_at), and per kind what the text is written from. kind and key: SQL expressions.
const item = kind => `(SELECT json_array(c.done_on, c.expires_on, c.updated_at) FROM compliance_items c
  WHERE c.rental_id = t.rental_id AND c.kind = '${kind}')`;
export const sourceSql = (kind, key) => `json_array(t.updated_at, r.updated_at, CASE ${kind}
  WHEN 'licence_copy' THEN json_array(${item("licence")}, ${item("licence_copy")})
  WHEN 'eicr_copy' THEN json_array(${item("eicr")}, ${item("eicr_copy")})
  WHEN 'deposit_info' THEN ${item("deposit_info")}
  WHEN 'rent_notice' THEN (SELECT json_array(rc.id, rc.rent, rc.effective_on, rc.created_at) FROM rent_changes rc
    WHERE rc.tenancy_id = t.id AND rc.id = CAST(${key} AS INTEGER))
  WHEN 'landlord_arrears' THEN json_array(${key}, t.financial_revision, l.id, l.updated_at, date('now'), -- review 26-nov: the
    -- amount owed grows as rent falls due with no new row (charges exist ahead), so a text is good for its own day only
    (SELECT 1 FROM arrears_steps x WHERE x.tenancy_id = t.id AND x.charge_due_on = ${key} AND x.step = 'landlord')) END)`;
export const JOINS = "JOIN rentals r ON r.id = t.rental_id JOIN landlords l ON l.id = r.landlord_id";
// The party's address, as emailAddress keeps it.
export const RECIPIENT = kind => `CASE ${kind} WHEN 'landlord_arrears' THEN lower(trim(l.email)) ELSE lower(trim(t.tenant_email)) END`;

export const RENTAL_CLAIMABLE = `EXISTS (SELECT 1 FROM rental_emails e JOIN tenancies t ON t.id = e.tenancy_id ${JOINS}
  WHERE e.email_ref = outbound.ref AND e.status = 'queued' AND e.revision = outbound.version AND e.approved_revision = e.revision
    AND outbound.created_at > ${RENTAL_QUEUE_LIMIT} AND r.archived_at IS NULL
    AND (e.kind <> 'landlord_arrears' OR l.archived_at IS NULL)
    AND (e.kind = 'landlord_arrears' OR t.ended_on IS NULL OR t.ended_on > date('now'))
    AND outbound.recipient = ${RECIPIENT("e.kind")}
    AND EXISTS (SELECT 1 FROM admins WHERE email = e.approved_by)
    AND e.source_version = ${sourceSql("e.kind", "e.source_key")})`;
// "0" (none is claimed) while switched off, before migration 0128, or if the schema cannot be read.
export const rentalEmailClaimSql = async env => (rentalEmailsReady(env) && await rentalEmailTable(env) ? RENTAL_CLAIMABLE : "0");
