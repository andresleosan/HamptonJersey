-- REG-15: «Save this search» for website visitors (docs/roadmap/work/REG-15/plan.md). Read and written only with
-- REG15_ALERTS_READY (and PRE10_PURPOSE_READY). A pending search keeps the email until it is confirmed (7 days at most);
-- once confirmed, the email lives only on the contact, and the row goes with the contact (retention, erasure).
-- unsubscribe_token is kept as is because the clock writes it into every alert; confirm_hash is a SHA-256 only.
CREATE TABLE saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL CHECK (status IN ('pending','active')),
  email TEXT CHECK (email IS NULL OR (email = lower(email) AND length(email) BETWEEN 3 AND 254)),
  email_hash TEXT NOT NULL CHECK (length(email_hash) = 64),
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  criteria TEXT NOT NULL CHECK (json_valid(criteria) AND length(criteria) <= 2000),
  notice_version TEXT NOT NULL CHECK (length(notice_version) BETWEEN 1 AND 40),
  confirm_hash TEXT UNIQUE CHECK (confirm_hash IS NULL OR length(confirm_hash) = 64),
  unsubscribe_token TEXT NOT NULL UNIQUE CHECK (length(unsubscribe_token) = 64),
  alerted_through TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  CHECK ((status = 'pending' AND email IS NOT NULL AND confirm_hash IS NOT NULL AND contact_id IS NULL)
    OR (status = 'active' AND email IS NULL AND confirm_hash IS NULL AND contact_id IS NOT NULL
      AND confirmed_at IS NOT NULL AND alerted_through IS NOT NULL))
);
CREATE INDEX saved_searches_created ON saved_searches(created_at);
CREATE INDEX saved_searches_email ON saved_searches(email_hash);
CREATE INDEX saved_searches_contact ON saved_searches(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX saved_searches_due ON saved_searches(alerted_through, id) WHERE status = 'active';
