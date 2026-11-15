-- AGE-12: a private link to the homes presented to one client, and the client's answer on each. Additive.
-- A grant is one link: only the SHA-256 of its random token is kept. It is dormant until a person records having sent
-- it, and valid until a person revokes it (expires_at NULL, Luis, scope of 9-nov); a revocation blocks every later read.
CREATE TABLE presentation_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at TEXT,
  created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  sent_at TEXT, sent_by TEXT,
  revoked_at TEXT, revoked_by TEXT
);
CREATE INDEX presentation_grants_applicant ON presentation_grants(applicant_id);
-- The homes of one link, each an approved match of that client, with the client's one answer (NULL until given).
CREATE TABLE presentation_options (
  grant_id INTEGER NOT NULL REFERENCES presentation_grants(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  choice TEXT CHECK (choice IS NULL OR choice IN ('interested', 'request_viewing', 'not_for_me', 'call_me')),
  reason TEXT CHECK (reason IS NULL OR (choice IS NOT NULL AND length(reason) BETWEEN 1 AND 500)),
  answered_at TEXT CHECK ((choice IS NULL) = (answered_at IS NULL)),
  PRIMARY KEY (grant_id, match_id)
);
CREATE INDEX presentation_options_match ON presentation_options(match_id);
