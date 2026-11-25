-- AUT-23 (AUT23_RENTAL_STEP_EMAILS_READY): a rental email a person prepares from an existing draft and approves, one row per
-- tenancy, kind and source: the arrears reminders +1 and +5 and the formal letter +14 of ADM-09 (kind rent_arrears,
-- source_key '<charge_due_on>/<step>') and ADM-14's renewal question to the landlord or message to the tenant (kinds
-- renewal_landlord and renewal_tenant, source_key the term's end_on). kind is also the outbound template. Each change
-- is a new revision; only the approved one is queued. The facts columns are the source as it was read when the text
-- was written (tenancy, property and landlord updated_at, the amount owed in pence or the rent in force in pounds, the
-- latest renewal answer's event id, the day the step stops being due): any change and the approval no longer holds.
-- Sending never marks a step done or pays anything. Additive: one new table, no existing row changes.
CREATE TABLE IF NOT EXISTS rental_step_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('rent_arrears','renewal_landlord','renewal_tenant')),
  source_key TEXT NOT NULL,
  charge_due_on TEXT,
  step TEXT,
  valid_until TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 400),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  amount INTEGER NOT NULL,
  answer_mark INTEGER NOT NULL DEFAULT 0,
  tenancy_updated_at TEXT NOT NULL,
  rental_updated_at TEXT NOT NULL,
  landlord_updated_at TEXT,
  source_day TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','sent','needs_review')),
  approved_revision INTEGER,
  approved_by TEXT,
  approved_at TEXT,
  email_ref TEXT UNIQUE,
  sent_at TEXT,
  prepared_by TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  UNIQUE (tenancy_id, kind, source_key)
);
CREATE INDEX IF NOT EXISTS rental_step_emails_queued ON rental_step_emails(status) WHERE status = 'queued';
