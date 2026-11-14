-- AGE-14: staff removal of an advertiser's personal data. Additive only; nothing is removed here.
-- The removal itself is a staff action at runtime (server/advertiser-privacy.js), never automatic.
ALTER TABLE advertisers ADD COLUMN suppressed_at TEXT;
-- Who removed it, when and a fixed reason. Never a copy of the removed data.
CREATE TABLE advertiser_suppressions (
  advertiser_id INTEGER PRIMARY KEY REFERENCES advertisers(id),
  reason TEXT NOT NULL CHECK(reason IN ('no_longer_needed','person_request')),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- Permanent tombstone: no later write, however stale, can restore the name, type or details.
CREATE TRIGGER advertiser_suppression_permanent BEFORE UPDATE ON advertisers
WHEN OLD.suppressed_at IS NOT NULL AND (NEW.suppressed_at IS NOT OLD.suppressed_at OR NEW.name IS NOT OLD.name
  OR NEW.kind IS NOT OLD.kind OR NEW.details IS NOT OLD.details)
BEGIN
  SELECT RAISE(ABORT, 'advertiser personal data was removed');
END;
