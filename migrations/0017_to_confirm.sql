-- ADM-04: when the listing was last confirmed as still on the market: published, a new availability or price, a Sales
-- move, or Still available after a call to its owner. On the website and still on the market, it is To confirm 3 months
-- later, 1 for a rental (server/listing.js TO_CONFIRM). Until now, the last edit is the best date known.
ALTER TABLE listings ADD COLUMN confirmed_at TEXT;
UPDATE listings SET confirmed_at = updated_at;
-- The panel's counts poll (every 30 s) reads only the listings on the website, from this index alone.
CREATE INDEX listings_live ON listings(availability, operation, confirmed_at) WHERE published = 1 AND archived_at IS NULL;
