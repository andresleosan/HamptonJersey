-- AGE-04: staff-managed directory. No automatic personal-data deletion.
CREATE TABLE advertisers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('agency','entity','individual')),
  details TEXT NOT NULL CHECK(json_valid(details)),
  activity_on TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  erased INTEGER NOT NULL DEFAULT 0 CHECK(erased IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
CREATE TABLE advertiser_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advertiser_id INTEGER NOT NULL REFERENCES advertisers(id),
  action TEXT NOT NULL CHECK(action IN ('retained','erased','activity')),
  reason TEXT,
  on_date TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX advertiser_name ON advertisers(name COLLATE NOCASE, id);
CREATE INDEX advertiser_reviews_advertiser ON advertiser_reviews(advertiser_id, id);
