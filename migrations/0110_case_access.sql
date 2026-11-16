-- ADM-12 (ADM12_CASE_ACCESS_READY; plan tp03-adm-12, Tareas 1 and 3): the tenant's limited access to report a repair.
-- Additive: new tables and indexes only. No link, code or session is kept in clear: links and sessions as their SHA-256,
-- codes as an HMAC under the operator's key (CASE_CHALLENGE_HMAC_KEY). The tenant's email stays in tenancies; a grant
-- keeps only its hash (source_revision), so a new email ends the grant. Rows are never deleted by the app.

-- A link for one purpose on one case, dormant until a person records sending it, until the start of the Jersey day after
-- expires_on (chosen by the team, no default), revoked by a person. It works only while its purpose's policy (ADM-18,
-- migration 0046) is approved at the revision it was made under. closed: a check found its recipient email changed, its
-- tenancy ended or its property archived; it stays closed even if that is undone.
CREATE TABLE case_grants (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  case_kind TEXT NOT NULL CHECK (case_kind IN ('rental','tenancy','sale','rental_application')),
  case_id INTEGER NOT NULL CHECK (case_id > 0),
  purpose TEXT NOT NULL CHECK (purpose IN ('repair_report','rental_application','tenancy_reference','renewal_response')),
  policy_revision INTEGER NOT NULL CHECK (policy_revision > 0),
  party_ref TEXT NOT NULL CHECK (length(party_ref) BETWEEN 1 AND 60),
  recipient_ref TEXT NOT NULL CHECK (length(recipient_ref) BETWEEN 1 AND 60),
  source_revision TEXT NOT NULL CHECK (length(source_revision) = 64),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_on TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('dormant','active','revoked','closed')),
  created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  sent_at TEXT, sent_by TEXT,
  revoked_at TEXT, revoked_by TEXT,
  closed_at TEXT,
  closed_reason TEXT CHECK (closed_reason IS NULL OR closed_reason IN ('recipient_changed','tenancy_ended','property_archived')),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL AND closed_reason IS NOT NULL))
) WITHOUT ROWID;
CREATE INDEX case_grants_case ON case_grants(case_kind, case_id, created_at);

-- A 6-digit code asked for with the link: 10 minutes, 5 tries; a new one revokes the one before.
CREATE TABLE case_challenges (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  grant_id TEXT NOT NULL REFERENCES case_grants(id),
  digest TEXT NOT NULL CHECK (length(digest) = 64),
  key_id TEXT NOT NULL CHECK (length(key_id) = 16),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','verified','failed','revoked')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX case_challenges_grant ON case_challenges(grant_id, status);

-- One email per code, its quota (1 a minute and 10 a Jersey day per grant, 30 a day for all grants together) and its
-- outcome; never the code, body or address.
CREATE TABLE case_auth_attempts (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  challenge_id TEXT NOT NULL UNIQUE REFERENCES case_challenges(id),
  grant_id TEXT NOT NULL REFERENCES case_grants(id),
  recipient_version TEXT NOT NULL CHECK (length(recipient_version) = 64),
  status TEXT NOT NULL CHECK (status IN ('reserved','accepted','failed','unknown')),
  message_id TEXT CHECK (message_id IS NULL OR length(message_id) <= 512),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 60),
  day TEXT NOT NULL,
  at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX case_auth_attempts_grant ON case_auth_attempts(grant_id, day, at);
CREATE INDEX case_auth_attempts_day ON case_auth_attempts(day);

-- A 30-minute session after the right code, for the grant's purpose and recipient only.
CREATE TABLE case_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  grant_id TEXT NOT NULL REFERENCES case_grants(id),
  challenge_id TEXT NOT NULL UNIQUE REFERENCES case_challenges(id),
  purpose TEXT NOT NULL,
  source_revision TEXT NOT NULL CHECK (length(source_revision) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE INDEX case_sessions_grant ON case_sessions(grant_id);

-- The receipt of each repair the tenant reported: one per operation (a resend is the same report), 10 a Jersey day.
CREATE TABLE repair_report_receipts (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  grant_id TEXT NOT NULL REFERENCES case_grants(id),
  operation_id TEXT NOT NULL CHECK (length(operation_id) = 36),
  repair_id INTEGER NOT NULL REFERENCES repairs(id),
  day TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE (grant_id, operation_id)
) WITHOUT ROWID;
CREATE INDEX repair_report_receipts_day ON repair_report_receipts(grant_id, day);
