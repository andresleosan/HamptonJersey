-- OFE-06: the weekly internal review of each sale in progress, and the steps the team took outside the app.
-- Additive only. Code reads these tables only with OFE06_WEEKLY_REVIEW_READY=1; the schedule lives in
-- app_settings 'sale_followup_schedule' and is off until the team sets a day and time. Nothing here is sent anywhere.
-- Rows follow their sale (ON DELETE CASCADE), like sale_milestones.
CREATE TABLE sale_followups (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL CHECK (length(week_key) = 10), -- the Jersey Monday of the week, YYYY-MM-DD
  task_key TEXT NOT NULL UNIQUE,                         -- the shared Inbox task (notifications.task_key)
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','cancelled')),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  created_at TEXT NOT NULL,
  reviewed_at TEXT, reviewed_by TEXT,
  closed_at TEXT,
  CHECK ((status = 'reviewed') = (reviewed_at IS NOT NULL)),
  UNIQUE (sale_id, week_key)
);
CREATE INDEX sale_followups_open ON sale_followups(status, sale_id) WHERE status = 'open';

-- A minimal reference to a step taken outside the app (a call, an email to a lawyer): who, when and an opaque
-- reference. It never marks a milestone done and holds no documents or legal content.
CREATE TABLE sale_external_contacts (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  party TEXT NOT NULL CHECK (party IN ('buyer_lawyer','seller_lawyer','buyer','seller','lender','other')),
  occurred_on TEXT NOT NULL CHECK (length(occurred_on) = 10),
  reference TEXT NOT NULL CHECK (length(reference) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL, created_by TEXT NOT NULL
);
CREATE INDEX sale_external_contacts_sale ON sale_external_contacts(sale_id, occurred_on);
