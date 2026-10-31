-- AUT-13: the work the app leaves for Hampton's Hermes (spec 2026-10-31, H8). For now one kind, a listing's texts. A job
-- is queued, then working (taken by Hermes), then draft (waiting for a person in the panel), and ends used or discarded;
-- failed after 3 attempts. Hermes never writes the listing: a person uses the draft and saves (H10).
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('listing_text')),
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','working','draft','used','discarded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  result TEXT CHECK (result IS NULL OR json_valid(result)),
  requested_by TEXT NOT NULL, -- an admin email or 'hermes'
  created_at TEXT NOT NULL, claimed_at TEXT, drafted_at TEXT, decided_at TEXT, decided_by TEXT
);
-- One open job per listing and kind; asking again while one is open answers with that one.
CREATE UNIQUE INDEX jobs_open ON jobs(listing_id, kind) WHERE status IN ('queued','working','draft');
-- Hermes's poll reads only the jobs still to do, oldest first.
CREATE INDEX jobs_todo ON jobs(created_at) WHERE status IN ('queued','working');
