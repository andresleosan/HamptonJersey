-- AGE-11: the extra human review of a private presentation (AGE-12's link, 0086) before a person sends it. Additive:
-- one new table (its UNIQUE is its index) and a trigger; no existing row changes. Read and written by server/private-presentations.js
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
