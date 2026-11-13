-- Provisional VIS-09 foundation. No route uses these tables until explicitly integrated.
-- Configuration belongs to an existing negotiator and is never inferred from historical bookings.
CREATE TABLE viewing_policy_settings (
  negotiator_id INTEGER PRIMARY KEY REFERENCES negotiators(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL CHECK(typeof(duration_minutes)='integer' AND duration_minutes BETWEEN 10 AND 180 AND duration_minutes % 5 = 0),
  buffer_minutes INTEGER NOT NULL CHECK(typeof(buffer_minutes)='integer' AND buffer_minutes BETWEEN 0 AND 120),
  parish_extra_minutes INTEGER NOT NULL CHECK(typeof(parish_extra_minutes)='integer' AND parish_extra_minutes BETWEEN 0 AND 120),
  max_daily INTEGER NOT NULL CHECK(typeof(max_daily)='integer' AND max_daily BETWEEN 1 AND 40),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision >= 1),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- A stale default (revision 0) or old explicit revision must never become current
-- again after a DELETE, REPLACE or reassignment. Settings are edited in place.
CREATE TRIGGER viewing_policy_insert_once BEFORE INSERT ON viewing_policy_settings
WHEN EXISTS(SELECT 1 FROM viewing_policy_settings WHERE negotiator_id=NEW.negotiator_id)
BEGIN SELECT RAISE(ABORT,'Viewing policy already exists'); END;
CREATE TRIGGER viewing_policy_update_revision BEFORE UPDATE ON viewing_policy_settings
WHEN NEW.negotiator_id <> OLD.negotiator_id OR NEW.revision <> OLD.revision + 1
BEGIN SELECT RAISE(ABORT,'Viewing policy revision must advance'); END;
CREATE TRIGGER viewing_policy_no_delete BEFORE DELETE ON viewing_policy_settings
BEGIN SELECT RAISE(ABORT,'Viewing policy cannot be removed'); END;

-- New writes can record the policy and parish actually used. Existing bookings
-- have no invented sidecar; readers must treat those parishes as unknown.
CREATE TABLE viewing_policy_snapshots (
  viewing_id INTEGER PRIMARY KEY REFERENCES viewing_requests(id) ON DELETE CASCADE,
  parish TEXT,
  buffer_minutes INTEGER NOT NULL CHECK(typeof(buffer_minutes)='integer' AND buffer_minutes BETWEEN 0 AND 120),
  parish_extra_minutes INTEGER NOT NULL CHECK(typeof(parish_extra_minutes)='integer' AND parish_extra_minutes BETWEEN 0 AND 120),
  policy_revision INTEGER NOT NULL CHECK(typeof(policy_revision)='integer' AND policy_revision >= 0)
);
