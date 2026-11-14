-- ADM-16: additive only. Read and written by server/tenancy-exits.js, behind ADM16_TENANCY_EXIT_READY.

-- The exit inventory, one per tenancy, saved by revision (compare-and-set) like the entry inventory (0056).
-- entry_inventory_revision and entry_snapshot {rooms, meter_readings}: the entry inventory it was compared with, copied
-- by the server; both NULL when the tenancy had none (shown as missing, never filled in). rooms [{name, condition
-- as_entry|changed|not_checked, observations}], meter_readings [{meter, reading, unit, read_on}], evidence_refs as in 0056.
-- moved_out_on: the day the keys came back, once it happened; the planned move-out stays tenancies.ended_on.
CREATE TABLE tenancy_exit_inventories (
  tenancy_id INTEGER PRIMARY KEY REFERENCES tenancies(id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  entry_inventory_revision INTEGER CHECK (entry_inventory_revision IS NULL OR entry_inventory_revision >= 1),
  entry_snapshot TEXT CHECK (entry_snapshot IS NULL OR (json_valid(entry_snapshot) AND json_type(entry_snapshot) = 'object')),
  moved_out_on TEXT CHECK (moved_out_on IS NULL OR moved_out_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  rooms TEXT NOT NULL CHECK (json_valid(rooms) AND json_type(rooms) = 'array'),
  meter_readings TEXT NOT NULL CHECK (json_valid(meter_readings) AND json_type(meter_readings) = 'array'),
  evidence_refs TEXT NOT NULL CHECK (json_valid(evidence_refs) AND json_type(evidence_refs) = 'array'
    AND json_array_length(evidence_refs) <= 20),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  CHECK ((entry_inventory_revision IS NULL) = (entry_snapshot IS NULL))
);

-- Deductions proposed from the deposit, in whole pence, never more than the deposit (tenancies.deposit is whole pounds:
-- copied × 100 as deposit_pence). A proposal is not an agreement, a request or a return, and moves no money.
-- lines [{reason, amount_pence, evidence_ref}] (max 20). revision counts every write to the deposit's record: a new
-- proposal or an outcome.
CREATE TABLE tenancy_deposit_proposals (
  tenancy_id INTEGER PRIMARY KEY REFERENCES tenancy_exit_inventories(tenancy_id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  deposit_pence INTEGER NOT NULL CHECK (deposit_pence > 0),
  total_pence INTEGER NOT NULL CHECK (total_pence >= 0 AND total_pence <= deposit_pence),
  lines TEXT NOT NULL CHECK (json_valid(lines) AND json_type(lines) = 'array' AND json_array_length(lines) <= 20),
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);

-- What happened with mydeposits, recorded by hand from a reference a person checked: no API, no transfer here.
-- Append-only, so a dispute's evidence is never rewritten or removed. revision: the deposit record's revision it made.
CREATE TABLE tenancy_deposit_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancy_deposit_proposals(tenancy_id),
  revision INTEGER NOT NULL CHECK (revision >= 2),
  status TEXT NOT NULL CHECK (status IN ('requested','agreed','disputed','returned')),
  evidence_ref TEXT NOT NULL CHECK (length(evidence_ref) BETWEEN 1 AND 120),
  occurred_on TEXT NOT NULL CHECK (occurred_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL,
  UNIQUE (tenancy_id, revision)
);
CREATE UNIQUE INDEX tenancy_deposit_returned_once ON tenancy_deposit_outcomes(tenancy_id) WHERE status = 'returned';
CREATE TRIGGER tenancy_deposit_outcomes_kept BEFORE UPDATE ON tenancy_deposit_outcomes
BEGIN
  SELECT RAISE(ABORT, 'deposit outcomes are kept as recorded');
END;
CREATE TRIGGER tenancy_deposit_outcomes_not_removed BEFORE DELETE ON tenancy_deposit_outcomes
BEGIN
  SELECT RAISE(ABORT, 'deposit outcomes are kept as recorded');
END;
