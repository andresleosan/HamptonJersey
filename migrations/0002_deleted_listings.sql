-- Tombstones: a listing deleted for good in the panel must never come back through a re-run of the import.
CREATE TABLE deleted_listings (
  id TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL,
  deleted_by TEXT
);
