-- EST-14: what the client said about one home of one search, as a person on the team records it (by phone, in person…):
-- interested, or not interested with a reason. Read and written by server/match-journey.js with EST14_JOURNEY_READY=1
-- only; switched off, nothing reads this table. Additive: one new table (its UNIQUE constraint gives it the only index it
-- needs, no CREATE INDEX) and a trigger; no existing row or table changes.
--
-- A step belongs to the search and the property (applicant_id, listing_id), so it outlives a match that a recompute
-- removes and finds again; match_id is the card it was recorded on. revision numbers the steps of that pair 1, 2, 3…
-- and guards two people recording at once. Nothing here changes the search's criteria, the employee's decision on the
-- match or the property's availability. listing_id is a plain id, like tenancy_origins: a listing rebuild must neither
-- be blocked by nor rewrite this history. The search's deletion (retention) removes its steps.
CREATE TABLE match_journey_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  match_id INTEGER NOT NULL,
  revision INTEGER NOT NULL CHECK (typeof(revision) = 'integer' AND revision >= 1),
  action TEXT NOT NULL CHECK (action IN ('interested', 'not_interested')),
  -- Why the client is not interested, the same codes as a rejected match (server/applicants.js REJECT_REASONS).
  reason_code TEXT CHECK (reason_code IS NULL OR reason_code IN ('price', 'area', 'size', 'condition', 'other')),
  -- Private to the panel, never in an event: required with 'other'.
  note TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 300),
  -- The search's match_inputs_revision when it was recorded.
  search_version INTEGER NOT NULL,
  created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  CHECK ((action = 'not_interested') = (reason_code IS NOT NULL)),
  CHECK (reason_code IS NOT 'other' OR note IS NOT NULL),
  UNIQUE (applicant_id, listing_id, revision)
);
-- A step is a record of what was said: it is never changed afterwards.
CREATE TRIGGER match_journey_steps_fixed BEFORE UPDATE ON match_journey_steps
BEGIN SELECT RAISE(ABORT, 'Match journey steps cannot be changed'); END;
