-- PUB-21 (spec 2026-11-05): Properties Queue. A Google Drive folder sent from the panel with a note: queued, working
-- (Hermes reads its documents), ready (Hermes's proposal), review (a person created the draft), and ends published,
-- discarded or failed. Not in jobs: there a job belongs to a listing that already exists.
CREATE TABLE drive_imports (
  id INTEGER PRIMARY KEY,
  folder_id TEXT NOT NULL,
  folder_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','working','ready','review','published','discarded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  documents TEXT CHECK (documents IS NULL OR json_valid(documents)), -- what Hermes may download, set when it claims
  result TEXT CHECK (result IS NULL OR json_valid(result)),          -- the proposal and the photos chosen
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL, claimed_at TEXT, ready_at TEXT, decided_at TEXT, decided_by TEXT
);
-- Hermes's poll reads only the imports still to do, oldest first.
CREATE INDEX drive_imports_todo ON drive_imports(created_at) WHERE status IN ('queued','working');
-- D9: the folder a listing came from, so the same folder sent again is flagged.
ALTER TABLE listings ADD COLUMN drive_folder_id TEXT;
CREATE INDEX listings_drive_folder ON listings(drive_folder_id) WHERE drive_folder_id IS NOT NULL;
