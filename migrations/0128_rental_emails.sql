-- AUT-24 (AUT24_TENANT_DOCS_READY): the managed rentals' emails a person prepares and approves, one row per tenancy and
-- kind: to the lead tenant (the tenancy's own tenant_email) the licence copy, the EICR copy and the deposit's prescribed
-- information (ADM-11) and the rent change notice (ADM-15); to the landlord the arrears notice of step +10 (ADM-03).
-- source_key: what the email is about (rent_notice: the rent_changes id; landlord_arrears: the oldest unpaid charge's due
-- date; the tenant's documents: ''). source_version: that source as read when the text was written (server/
-- rental-email-check.js, sourceSql): any change to it after that means the approval no longer holds. Each change is a new
-- revision; a team member approves one revision, and only that one is queued in outbound. Additive: one new table.
CREATE TABLE IF NOT EXISTS rental_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('licence_copy','eicr_copy','deposit_info','rent_notice','landlord_arrears')),
  source_key TEXT NOT NULL,
  source_version TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','sent','needs_review')),
  approved_revision INTEGER,
  approved_by TEXT,
  approved_at TEXT,
  email_ref TEXT UNIQUE,
  sent_at TEXT,
  prepared_by TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  UNIQUE (tenancy_id, kind)
);
CREATE INDEX IF NOT EXISTS rental_emails_queued ON rental_emails(status) WHERE status = 'queued';
