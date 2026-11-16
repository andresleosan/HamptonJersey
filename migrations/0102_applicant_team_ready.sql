-- AUT-18: a person marks a search Ready for the team once its proposals are reviewed (server/applicant-ready.js).
-- One row per marked search: when and by whom (a team member's email), and the search's match_inputs_revision then, so
-- a criteria change leaves the mark out of date (not counted) until someone marks it again. Done or a stage change
-- deletes the row; so does deleting the search. Read and written only with AUT18_TEAM_READY=1.
-- Additive: one new table; no existing row, table, index or trigger changes.
CREATE TABLE applicant_team_ready (
  applicant_id INTEGER PRIMARY KEY REFERENCES applicants(id) ON DELETE CASCADE,
  marked_at TEXT NOT NULL,
  marked_by TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0)
);
