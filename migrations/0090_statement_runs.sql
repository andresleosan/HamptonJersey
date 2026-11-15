-- ADM-10: each landlord's monthly statement, closed as a frozen revision (the statement as the panel showed it, in pence),
-- then marked sent and paid to the landlord by hand. A later correction to a payment, charge or repair never rewrites a
-- closed revision: the team closes the next one. Additive: one new table, its triggers, no change to existing rows.
-- Read and written only with ADM10_STATEMENTS_READY.
CREATE TABLE statement_runs (
  id INTEGER PRIMARY KEY,
  landlord_id INTEGER NOT NULL REFERENCES landlords(id),
  month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot) AND length(snapshot) <= 131072),
  source_digest TEXT NOT NULL CHECK (length(source_digest) = 64),
  net_pence INTEGER NOT NULL,
  closed_at TEXT NOT NULL, closed_by TEXT NOT NULL,
  sent_on TEXT, sent_by TEXT,
  paid_on TEXT, paid_by TEXT,
  UNIQUE (landlord_id, month, revision)
);

-- A closed revision stays as it was; sent and paid are written once.
CREATE TRIGGER statement_runs_closed BEFORE UPDATE ON statement_runs
WHEN NEW.landlord_id IS NOT OLD.landlord_id OR NEW.month IS NOT OLD.month OR NEW.revision IS NOT OLD.revision
  OR NEW.snapshot IS NOT OLD.snapshot OR NEW.source_digest IS NOT OLD.source_digest OR NEW.net_pence IS NOT OLD.net_pence
  OR NEW.closed_at IS NOT OLD.closed_at OR NEW.closed_by IS NOT OLD.closed_by
  OR (OLD.sent_on IS NOT NULL AND (NEW.sent_on IS NOT OLD.sent_on OR NEW.sent_by IS NOT OLD.sent_by))
  OR (OLD.paid_on IS NOT NULL AND (NEW.paid_on IS NOT OLD.paid_on OR NEW.paid_by IS NOT OLD.paid_by))
BEGIN SELECT RAISE(ABORT, 'statement_run_closed'); END;

CREATE TRIGGER statement_runs_kept BEFORE DELETE ON statement_runs
BEGIN SELECT RAISE(ABORT, 'statement_run_closed'); END;
