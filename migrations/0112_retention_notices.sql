-- PRE-12 (Q05): the email notice sent before the retention pass deletes a contact for 12 months without activity
-- (server/retention-notices.js). One row per contact and activity episode (contacts.last_activity_at when the notice
-- was prepared): its email in the outbound queue (by ref), the date it gives and what became of it. With an email on
-- file, the pass deletes the contact only once that notice was accepted a month earlier and its date has come; a
-- failed, uncertain, unsent or answered notice keeps the contact and opens one Inbox task. Read and written only with
-- PRE12_RETENTION_NOTICE_READY=1. Ids, dates and states only: the address and the text stay in outbound, under its own
-- 30/90-day clean-up. A row goes with its contact.
-- Additive: one new table and one index; no existing row or table changes.
CREATE TABLE retention_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  activity_at TEXT NOT NULL,
  outbound_ref TEXT,
  delete_after TEXT NOT NULL CHECK (delete_after GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  state TEXT NOT NULL CHECK (state IN ('queued', 'accepted', 'failed', 'unknown', 'not_sent', 'replied')),
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (state NOT IN ('accepted', 'replied') OR sent_at IS NOT NULL),
  UNIQUE (contact_id, activity_at)
);
CREATE INDEX retention_notices_state ON retention_notices (state, outbound_ref);
