-- Who shows the houses (C1): apart from admins. hours is JSON mon…sun, each null (day off) or ["HH:MM","HH:MM"] (C2).
CREATE TABLE negotiators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 80),
  role TEXT CHECK (role IS NULL OR length(role) <= 80),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  hours TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
);
-- The two people of site/data/team.json, Monday to Friday 10:00–17:30 and Saturday 10:00–13:00; the same JSON as DEFAULT_HOURS.
INSERT INTO negotiators (name, role, hours, created_at, updated_at, updated_by)
  SELECT name, role,
    '{"mon":["10:00","17:30"],"tue":["10:00","17:30"],"wed":["10:00","17:30"],"thu":["10:00","17:30"],"fri":["10:00","17:30"],"sat":["10:00","13:00"],"sun":null}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'setup'
  FROM (SELECT 'Gilberto Franco' AS name, 'Managing Director' AS role UNION ALL SELECT 'Joshua Franco', 'Negotiator');

-- A date that differs from the week (C3): block (all day without hours, or from–to) or open (a span replacing that day's hours).
CREATE TABLE negotiator_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  negotiator_id INTEGER NOT NULL REFERENCES negotiators(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('block','open')),
  start_time TEXT, end_time TEXT,
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  created_at TEXT NOT NULL, created_by TEXT,
  CHECK ((start_time IS NULL) = (end_time IS NULL)),
  CHECK (start_time IS NULL OR start_time < end_time),
  CHECK (kind = 'block' OR start_time IS NOT NULL)
);
-- The slot calculation reads one negotiator's exceptions by date range.
CREATE INDEX negotiator_exceptions_day ON negotiator_exceptions(negotiator_id, date);

-- viewing_requests gets the C7 states, a negotiator, an end time and an outcome, and email becomes optional (C14).
-- SQLite cannot change a CHECK, so the table is rebuilt with the same ids and rows; no table references it.
CREATE TABLE viewing_requests_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  agent TEXT, kind TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  name TEXT NOT NULL, email TEXT, phone TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','completed','no_show','cancelled')),
  created_at TEXT NOT NULL, updated_at TEXT, updated_by TEXT,
  listing_ref TEXT, listing_title_snapshot TEXT, notes TEXT,
  negotiator_id INTEGER REFERENCES negotiators(id) ON DELETE SET NULL,
  end_time TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('proceed','more_info','not_interested')),
  outcome_note TEXT CHECK (outcome_note IS NULL OR length(outcome_note) <= 500),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (outcome IS NULL OR status = 'completed')
);
-- C8: new → requested, contacted → confirmed, closed → completed if its date has passed, else cancelled
-- (the UTC date of the migration day is enough for closed rows). The text agent links to the negotiator of that name.
INSERT INTO viewing_requests_new (id, listing_id, agent, kind, date, time, name, email, phone, status, created_at,
    updated_at, updated_by, listing_ref, listing_title_snapshot, notes, negotiator_id, end_time)
  SELECT id, listing_id, agent, kind, date, time, name, email, phone,
    CASE status WHEN 'new' THEN 'requested' WHEN 'contacted' THEN 'confirmed'
      WHEN 'closed' THEN CASE WHEN date < date('now') THEN 'completed' ELSE 'cancelled' END END,
    created_at, updated_at, updated_by, listing_ref, listing_title_snapshot, notes,
    (SELECT id FROM negotiators WHERE name = agent), substr(time(time, '+30 minutes'), 1, 5)
  FROM viewing_requests;
-- Ids of deleted requests stay retired (their events still name them): the new table takes over the old counter.
DELETE FROM sqlite_sequence WHERE name = 'viewing_requests_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'viewing_requests_new', seq FROM sqlite_sequence WHERE name = 'viewing_requests';
DROP TABLE viewing_requests;
ALTER TABLE viewing_requests_new RENAME TO viewing_requests;
-- The 0001 index (dropped with the old table) and one for the slot calculation: a negotiator's viewings by date.
CREATE INDEX viewing_status ON viewing_requests(status, created_at);
CREATE INDEX viewing_negotiator_day ON viewing_requests(negotiator_id, date);
