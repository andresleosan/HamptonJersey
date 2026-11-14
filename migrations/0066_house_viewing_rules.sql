-- VIS-10: what each house asks of a viewing: hours of notice while it is tenanted (listings.occupancy, 0061), who
-- shows it and where its keys are. Staff only, read and written by server/house-rules.js with
-- VIS10_HOUSE_RULES_READY=1; the website never reads these tables. Additive: two new tables, no existing row changes.
-- One row per listing, deleted with it. The change log keeps who, when and the names of the fields, never their text.
-- Independent of 0051 (a dormant draft scoped by operation, with no keys, note or author), which nothing reads.
CREATE TABLE listing_viewing_rules (
  listing_id TEXT NOT NULL PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  notice_hours INTEGER NOT NULL DEFAULT 0 CHECK(typeof(notice_hours)='integer' AND notice_hours BETWEEN 0 AND 168),
  shown_by TEXT CHECK(shown_by IS NULL OR shown_by IN ('negotiator','owner','tenant')),
  negotiator_id INTEGER REFERENCES negotiators(id),
  keys TEXT CHECK(keys IS NULL OR length(keys) <= 200),
  access_note TEXT CHECK(access_note IS NULL OR length(access_note) <= 2000),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK((shown_by IS 'negotiator') = (negotiator_id IS NOT NULL))
);
CREATE TABLE listing_viewing_rule_changes (
  id INTEGER PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  fields TEXT NOT NULL CHECK(json_valid(fields))
);
CREATE INDEX listing_viewing_rule_changes_listing ON listing_viewing_rule_changes(listing_id);
