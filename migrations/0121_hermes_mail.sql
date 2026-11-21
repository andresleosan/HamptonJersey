-- AUT-17 (plan docs/roadmap/work/AUT-17/plan-correo-hermes.md, fase A): the emails Hermes writes and delivers from
-- Hampton's Gmail. The app decides which email is due, to whom and in which mode; Hermes claims one through its door
-- (server/hermes-mail.js), writes it and gives back what happened. One row per reason (source_key): an enquiry version
-- waiting to be sent, or one viewing proposal for the agency and, when the search left no viewing days and times, for
-- the client. Read and written only with HERMES_MAIL_READY=1. Content 30 days, the row 90 (server/email-retention.js).
-- Additive: one new table and its indexes; no existing row or table changes.
CREATE TABLE mail_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- availability: an enquiry (AGE-03) to the advertiser. viewing_agency / viewing_client: a VIS-17 proposal.
  kind TEXT NOT NULL CHECK (kind IN ('availability', 'viewing_agency', 'viewing_client')),
  -- consultation:<id>:<revision> or proposal:<id>:agency|client. A second producer run finds it there.
  source_key TEXT NOT NULL UNIQUE,
  entity_id INTEGER NOT NULL,
  entity_version INTEGER NOT NULL DEFAULT 1,
  listing_id TEXT NOT NULL,
  recipient TEXT,
  recipient_hash TEXT NOT NULL,
  recipient_name TEXT,
  -- The minimal data Hermes writes from (JSON), nothing else about the person.
  facts TEXT CHECK (facts IS NULL OR json_valid(facts)),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'claimed', 'drafted', 'sent', 'failed', 'unknown', 'cancelled')),
  -- Set when claimed, from the switch of its type: draft (Gmail Drafts) or send.
  mode TEXT CHECK (mode IS NULL OR mode IN ('draft', 'send')),
  token_hash TEXT,
  claimed_at TEXT,
  -- The Jersey day a send was claimed on, counted in the daily limit with email_attempts.
  day TEXT,
  result_at TEXT,
  subject TEXT,
  body TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX mail_tasks_status ON mail_tasks (status, id);
CREATE INDEX mail_tasks_day ON mail_tasks (day) WHERE day IS NOT NULL;
CREATE INDEX mail_tasks_created ON mail_tasks (created_at);
