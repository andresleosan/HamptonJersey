-- ANA-10: opens of a window poster's QR, per listing and Jersey day. A count only: nothing about the visitor (no IP,
-- agent, cookie or identifier). server/poster-qr.js counts at most 200 a listing a day and 5,000 a day in all.
-- Additive: a new table, read only while ANA10_QR_OPENS_READY is on.
CREATE TABLE listing_qr_opens (
  day TEXT NOT NULL,                        -- YYYY-MM-DD, Jersey
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  n INTEGER NOT NULL CHECK (n BETWEEN 1 AND 200),
  PRIMARY KEY (day, listing_id)
) WITHOUT ROWID;
