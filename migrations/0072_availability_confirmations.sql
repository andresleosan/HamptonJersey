-- EST-16: what a person of the team was told about a property's availability, kept apart from what the listing
-- says (listings.availability, the published status) and with where it comes from: when it was said, by whom, through
-- which channel, a short reference to the evidence and what it covers. Staff only, read and written by
-- server/availability-confirmations.js with EST16_AVAILABILITY_READY=1; the website never reads this table.
-- Additive: one new table, an index and a trigger; no existing row changes.
-- A history: each confirmation is a new row and none is rewritten (the trigger). The one in force is the latest by
-- confirmed_at; nothing expires. operation NULL: the whole property; otherwise only that operation of it.
-- Rows go with their listing when a draft is deleted, like its house rules (0066).
CREATE TABLE availability_confirmations (
  id INTEGER PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  operation TEXT CHECK(operation IS NULL OR operation IN ('sale','rent','business')),
  status TEXT NOT NULL CHECK(status IN ('available','unavailable','unknown')),
  confirmed_at TEXT NOT NULL CHECK(confirmed_at <= recorded_at),
  source TEXT NOT NULL CHECK(source IN ('owner','agency','other')),
  channel TEXT NOT NULL CHECK(channel IN ('phone','email','in_person','message')),
  evidence_ref TEXT NOT NULL CHECK(length(evidence_ref) BETWEEN 1 AND 300),
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL
);
CREATE INDEX availability_confirmations_listing ON availability_confirmations(listing_id, confirmed_at);
CREATE TRIGGER availability_confirmations_append_only BEFORE UPDATE ON availability_confirmations
BEGIN SELECT RAISE(ABORT, 'availability confirmations are append-only'); END;
