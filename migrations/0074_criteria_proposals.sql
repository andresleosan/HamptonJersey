-- AUT-19: a change to a search's criteria dictated after talking to the client, kept apart from the search until an
-- employee confirms it. Written and read only with AUT19_CRITERIA_PROPOSALS_READY=1. Additive: one new table and one
-- index; no existing row is touched. changes is the patch to apply (only the fields named); previous and proposed are
-- the before and after shown for confirmation, taken from the stored search when it was proposed; base_revision is the
-- search's match_inputs_revision at that moment: once it moves, the proposal can only be redone. note is where the
-- change came from, in the employee's words. One proposal waits per search. Deleted with its search.
CREATE TABLE criteria_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'discarded')),
  source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'hermes')),
  changes TEXT NOT NULL CHECK (json_valid(changes) AND json_type(changes) = 'object'),
  previous TEXT NOT NULL CHECK (json_valid(previous) AND json_type(previous) = 'object'),
  proposed TEXT NOT NULL CHECK (json_valid(proposed) AND json_type(proposed) = 'object'),
  base_revision INTEGER NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  proposed_by TEXT NOT NULL,
  proposed_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT
);
CREATE UNIQUE INDEX criteria_proposals_pending ON criteria_proposals (applicant_id) WHERE status = 'pending';
