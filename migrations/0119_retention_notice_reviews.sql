-- PRE-12 (Q05): a team member's review of a retention notice the pass keeps a contact for (failed, uncertain or not
-- sent; server/retention-notices.js). One row per contact and activity episode (contacts.last_activity_at when it was
-- recorded): manual_notice_documented, with the day the person was told by other means and what shows it, lets the
-- pass delete the contact a month after that day once the episode's date has come and every other exception and hold
-- still allows it; keep_for_review keeps it. New activity starts a new episode, which this row no longer covers.
-- answered_at: when an email from the person since the manual notice was first seen, recorded before the email clean-up
-- blanks its sender; from then on it keeps the contact. A link to a running tenancy withdraws the row. Written only with
-- PRE12_RETENTION_NOTICE_READY=1 (answered_at by every retention pass). A row goes with its contact.
-- Additive: one new table; no existing row or table changes.
CREATE TABLE retention_notice_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  activity_at TEXT NOT NULL,
  resolution_code TEXT NOT NULL CHECK (resolution_code IN ('manual_notice_documented', 'keep_for_review')),
  evidence TEXT NOT NULL CHECK (length(trim(evidence)) BETWEEN 1 AND 1000),
  notice_given_on TEXT CHECK (notice_given_on IS NULL OR date(notice_given_on) = notice_given_on),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  answered_at TEXT,
  CHECK ((resolution_code = 'manual_notice_documented') = (notice_given_on IS NOT NULL)),
  UNIQUE (contact_id, activity_at)
);
