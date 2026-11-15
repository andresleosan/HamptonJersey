-- BUS-07: a person's link between a Hampton listing and a home of the market inventory (BUS-10), and its undo.
-- Staff only, read and written by server/listing-provenance.js with BUS07_PROVENANCE_READY=1 and BUS10_IDENTITY_READY=1.
-- Additive: one new table, its indexes and a trigger; no existing row changes.
-- A link says only "this listing is that market home": it merges no home, changes no observation, listing, match or
-- photo permission, and says nothing about availability (EST-16 stays the only confirmation).
-- A history: a link and its undo are rows added, never rewritten. A link stands while no unlink row undoes it.
-- property_id is the home of the advert the person chose (its root is read through BUS-10's aliases at read time);
-- evidence_observation_id is that advert's reading, kept as a reference only so a later purge (EST-19) is not blocked.
-- Rows go with their listing when a draft is deleted, like its availability confirmations (0072).
CREATE TABLE listing_market_links (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK(action IN ('link','unlink')),
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES market_properties(id),
  evidence_observation_id TEXT,
  undoes TEXT REFERENCES listing_market_links(id),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK((action='link' AND undoes IS NULL AND evidence_observation_id IS NOT NULL) OR (action='unlink' AND undoes IS NOT NULL))
) WITHOUT ROWID;
CREATE UNIQUE INDEX listing_market_links_one_undo ON listing_market_links(undoes) WHERE undoes IS NOT NULL;
CREATE INDEX listing_market_links_listing ON listing_market_links(listing_id, created_at);
CREATE TRIGGER listing_market_links_no_update BEFORE UPDATE ON listing_market_links
BEGIN SELECT RAISE(ABORT, 'listing market link is immutable'); END;
