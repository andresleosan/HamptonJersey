-- EST-01: when each applicant's full search of Hampton's saved listings last ran, written and read only with
-- EST01_SEARCH_STATE_READY=1. Additive: one new table, no existing row is touched and nothing is backfilled, so a
-- search with no row here reads "not recorded". A row with no attempt is a registered search whose first search
-- has not started. Times only: no error text, no contact data. Deleted with its search.
CREATE TABLE applicant_search_runs (
  applicant_id INTEGER PRIMARY KEY REFERENCES applicants(id) ON DELETE CASCADE,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT
);
