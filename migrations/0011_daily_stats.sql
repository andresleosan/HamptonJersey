-- I1: website opens per listing, Jersey day and metric; counts only, nothing about the visitor.
CREATE TABLE daily_stats (
  day TEXT NOT NULL,                        -- YYYY-MM-DD, Jersey
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('view','photos','tour')),
  n INTEGER NOT NULL DEFAULT 0 CHECK (n >= 0),
  PRIMARY KEY (day, listing_id, metric)
) WITHOUT ROWID;
