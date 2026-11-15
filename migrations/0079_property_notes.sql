-- SPR-08: the team's internal notes about a property. Staff only, read and written by server/property-notes.js with
-- SPR08_SECTIONS_READY=1; the website, the events and the notifications never read this table.
-- Additive: one new table, two indexes and a trigger; no existing row changes.
-- A history: each note, each correction and each withdrawal is a new row and none is rewritten (the trigger). A row
-- with replaces is the next version of that row; body NULL: the note was withdrawn. The versions in force are the rows
-- that no other row replaces, and a row is replaced once at most (the unique index), so a stale correction adds nothing.
-- written_at: when the note was first written, carried by its later versions; created_at and created_by: this row's.
-- Rows go with their listing when it is deleted, like its availability confirmations (0072).
CREATE TABLE property_notes (
  id INTEGER PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  replaces INTEGER REFERENCES property_notes(id) ON DELETE CASCADE,
  body TEXT CHECK(body IS NULL OR length(body) BETWEEN 1 AND 4000),
  written_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  CHECK(body IS NOT NULL OR replaces IS NOT NULL)
);
CREATE INDEX property_notes_listing ON property_notes(listing_id, written_at);
CREATE UNIQUE INDEX property_notes_replaces ON property_notes(replaces) WHERE replaces IS NOT NULL;
CREATE TRIGGER property_notes_append_only BEFORE UPDATE ON property_notes
BEGIN SELECT RAISE(ABORT, 'property notes are append-only'); END;
