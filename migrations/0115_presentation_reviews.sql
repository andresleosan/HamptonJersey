-- AGE-11: the extra human review of a private presentation (AGE-12's link, 0086) before a person sends it. Additive:
-- three new tables (their UNIQUE or key is their index) and a trigger each; no existing row changes. Read and written by server/private-presentations.js
-- with AGE11_REVIEW_READY=1.
-- One row per approval, never rewritten: the snapshot a person saw and approved (the homes in order, each with its
-- approved match, its availability confirmation in force and its date, the conditions shown (operation and price or
-- rent) and the suitable photos of AGE-10, as checked in storage), and its SHA-256. The latest version is in force.
-- The link can only be recorded as sent while the snapshot rebuilt then has the same hash as the latest approval; once
-- sent, the client's page shows that snapshot only. Rows go with their link (and its client) when deleted.
CREATE TABLE presentation_reviews (
  id INTEGER PRIMARY KEY,
  grant_id INTEGER NOT NULL REFERENCES presentation_grants(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot) AND json_type(snapshot) = 'object'),
  snapshot_hash TEXT NOT NULL CHECK (length(snapshot_hash) = 64),
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  UNIQUE (grant_id, version)
);
CREATE TRIGGER presentation_reviews_append_only BEFORE UPDATE ON presentation_reviews
BEGIN SELECT RAISE(ABORT, 'presentation reviews are append-only'); END;
-- The approval a link was recorded as sent under, written in the same batch as AGE-12's sent_at: the client's page shows
-- that snapshot only. A link sent without one (before the review, or with it switched off) keeps AGE-12's view.
CREATE TABLE presentation_sends (
  grant_id INTEGER PRIMARY KEY REFERENCES presentation_grants(id) ON DELETE CASCADE,
  review_id INTEGER NOT NULL REFERENCES presentation_reviews(id) ON DELETE CASCADE
);
CREATE TRIGGER presentation_sends_append_only BEFORE UPDATE ON presentation_sends
BEGIN SELECT RAISE(ABORT, 'presentation sends are append-only'); END;
-- AGE-11 for ANA-06: a person records that the client confirmed receiving a home of a link recorded as sent, with the
-- real time they received it (never in the future, never before the link was sent or after the conversation that says
-- so) and, as evidence, only the id of a conversation logged with that client's contact (contact.conversation event):
-- no message, email or phone here. A history, never rewritten: each correction or revocation is a new revision with
-- its reason; the latest revision of a link's home is in force, so one receipt stands per link and home. Rows go with
-- the link's home (and its client) when deleted. Recording one sends nothing and changes no search or match.
CREATE TABLE presentation_receipts (
  id INTEGER PRIMARY KEY,
  grant_id INTEGER NOT NULL,
  match_id INTEGER NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  status TEXT NOT NULL CHECK (status IN ('verified', 'revoked')),
  received_at TEXT,
  evidence_event_id INTEGER,
  reason TEXT CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 300),
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (grant_id, match_id, revision),
  FOREIGN KEY (grant_id, match_id) REFERENCES presentation_options(grant_id, match_id) ON DELETE CASCADE,
  CHECK ((status = 'verified') = (received_at IS NOT NULL AND evidence_event_id IS NOT NULL)),
  CHECK (revision = 1 OR reason IS NOT NULL)
);
CREATE TRIGGER presentation_receipts_append_only BEFORE UPDATE ON presentation_receipts
BEGIN SELECT RAISE(ABORT, 'presentation receipts are append-only'); END;
