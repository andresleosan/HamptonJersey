-- VIS-14: an open viewing, when several people want the same house: one time of one negotiator at one property, with a
-- number of places. Read and written by server/viewing-groups.js with VIS14_BLOCK_READY=1 only; switched off, nothing
-- reads these tables. Additive: two new tables, no existing row changes.
--
-- Each place is an existing viewing request moved to the group's time. A place counts while its viewing is active
-- (requested = pending, confirmed = confirmed) and still at the group's negotiator, date and time: a cancelled or moved
-- viewing frees its place by itself. Back-to-back times need no table (they are ordinary viewings).
CREATE TABLE viewing_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  negotiator_id INTEGER NOT NULL REFERENCES negotiators(id),
  date TEXT NOT NULL, time TEXT NOT NULL, end_time TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (typeof(capacity) = 'integer' AND capacity BETWEEN 1 AND 50),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
  created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  cancelled_at TEXT, cancelled_by TEXT,
  -- VIS-09: the group's time is ONE appointment of the negotiator (daily maximum, margins). Like
  -- viewing_policy_snapshots, the parish and margins it was created with; NULL when the rules were off (defaults apply).
  parish TEXT,
  buffer_minutes INTEGER CHECK (buffer_minutes IS NULL OR (typeof(buffer_minutes) = 'integer' AND buffer_minutes BETWEEN 0 AND 120)),
  parish_extra_minutes INTEGER CHECK (parish_extra_minutes IS NULL
    OR (typeof(parish_extra_minutes) = 'integer' AND parish_extra_minutes BETWEEN 0 AND 120)),
  policy_revision INTEGER CHECK (policy_revision IS NULL OR (typeof(policy_revision) = 'integer' AND policy_revision >= 0)),
  CHECK (time < end_time),
  CHECK ((policy_revision IS NULL) = (buffer_minutes IS NULL) AND (policy_revision IS NULL) = (parish_extra_minutes IS NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
-- The panel's calendar reads a negotiator's groups by date.
CREATE INDEX viewing_groups_day ON viewing_groups(negotiator_id, date);

-- One place per viewing (a viewing is in one group at most); deleting the viewing or the group removes it.
CREATE TABLE viewing_group_places (
  viewing_id INTEGER PRIMARY KEY REFERENCES viewing_requests(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES viewing_groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, created_by TEXT NOT NULL
);
CREATE INDEX viewing_group_places_group ON viewing_group_places(group_id);

-- Never more places than the capacity, whatever writes them: the route checks it in its INSERT, these refuse the rest.
CREATE TRIGGER viewing_group_places_capacity BEFORE INSERT ON viewing_group_places
WHEN (SELECT COUNT(*) FROM viewing_group_places p JOIN viewing_requests m ON m.id = p.viewing_id
    JOIN viewing_groups g ON g.id = p.group_id
  WHERE p.group_id = NEW.group_id AND m.status IN ('requested', 'confirmed') AND m.negotiator_id = g.negotiator_id
    AND m.date = g.date AND m.time = g.time) >= (SELECT capacity FROM viewing_groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'Open viewing is full'); END;
CREATE TRIGGER viewing_group_places_move BEFORE UPDATE OF group_id ON viewing_group_places
WHEN NEW.group_id IS NOT OLD.group_id AND (SELECT COUNT(*) FROM viewing_group_places p
    JOIN viewing_requests m ON m.id = p.viewing_id JOIN viewing_groups g ON g.id = p.group_id
  WHERE p.group_id = NEW.group_id AND m.status IN ('requested', 'confirmed') AND m.negotiator_id = g.negotiator_id
    AND m.date = g.date AND m.time = g.time) >= (SELECT capacity FROM viewing_groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'Open viewing is full'); END;
