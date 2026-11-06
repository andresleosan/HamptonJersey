-- AUT-17: no settings row is seeded: sending and the daily team summary start off.
CREATE TABLE outbound (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  dedupe_key TEXT NOT NULL UNIQUE,
  template TEXT NOT NULL CHECK (length(template) BETWEEN 1 AND 80),
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  recipient TEXT,
  recipient_hash TEXT NOT NULL,
  subject TEXT CHECK (subject IS NULL OR length(subject) <= 500),
  text TEXT CHECK (text IS NULL OR length(text) <= 50000),
  status TEXT NOT NULL CHECK (status IN ('draft','queued','sending','accepted','failed','unknown','cancelled')),
  approved_by TEXT,
  approved_at TEXT,
  config_revision INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  claim_token TEXT,
  claimed_at TEXT,
  next_attempt_at TEXT,
  message_id TEXT,
  error_code TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status NOT IN ('queued','sending','accepted') OR approved_at IS NOT NULL)
);
CREATE INDEX outbound_queue ON outbound(next_attempt_at, id) WHERE status = 'queued';
CREATE INDEX outbound_created ON outbound(created_at);
CREATE INDEX outbound_recipient ON outbound(recipient) WHERE recipient IS NOT NULL;
CREATE INDEX outbound_message ON outbound(message_id) WHERE message_id IS NOT NULL;

-- The attempt is the quota reservation, even if a request later times out. Retained for 90 days.
CREATE TABLE email_attempts (
  token TEXT PRIMARY KEY,
  outbound_id INTEGER,
  day TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX email_attempts_day ON email_attempts(day);
CREATE INDEX email_attempts_at ON email_attempts(at);
-- Addresses are hashed, not shown or recoverable from this list. Kept until explicitly removed.
CREATE TABLE email_suppressions (
  address_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('team','provider'))
);
-- Manual deletion retains this non-content tombstone so a delivery replay cannot recreate the message.
CREATE TABLE email_inbound_keys (key TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE INDEX email_inbound_keys_at ON email_inbound_keys(created_at);
CREATE TABLE email_inbound (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key TEXT NOT NULL UNIQUE,
  sender TEXT,
  header_from TEXT,
  recipient TEXT,
  subject TEXT,
  text TEXT CHECK (text IS NULL OR length(text) <= 50000),
  html_only INTEGER NOT NULL CHECK (html_only IN (0,1)),
  truncated INTEGER NOT NULL CHECK (truncated IN (0,1)),
  attachments INTEGER NOT NULL DEFAULT 0,
  message_id TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  outbound_id INTEGER REFERENCES outbound(id) ON DELETE SET NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX email_inbound_received ON email_inbound(received_at);
CREATE INDEX email_inbound_sender ON email_inbound(sender) WHERE sender IS NOT NULL;
CREATE INDEX email_inbound_header_from ON email_inbound(header_from) WHERE header_from IS NOT NULL;

-- One path for erasure by the panel and by the retention pass. A late provider result cannot restore content/status.
CREATE TRIGGER contact_email_erasure BEFORE DELETE ON contacts WHEN OLD.email IS NOT NULL BEGIN
  UPDATE outbound SET recipient = NULL, subject = NULL, text = NULL,
    status = CASE WHEN status = 'sending' THEN 'unknown' WHEN status IN ('draft','queued') THEN 'cancelled' ELSE status END,
    error_code = CASE WHEN status = 'sending' THEN 'CONTACT_ERASED_IN_FLIGHT' ELSE error_code END,
    claim_token = NULL WHERE recipient = OLD.email;
  DELETE FROM email_inbound WHERE sender = OLD.email OR header_from = OLD.email;
END;
