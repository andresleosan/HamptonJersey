-- ADM-13: additive only. Read and written by server/rental-inspections.js, behind ADM13_INSPECTIONS_READY.

-- A running tenancy's internal inspections, each recorded once: operation_id answers a repeat with the same one. seq: the
-- tenancy's nth inspection, the revision a new one is recorded against (two at once: one wins, by the UNIQUE too).
-- revision counts the writes to this inspection: 1 when recorded, +1 for each repair it found that a person decided on.
-- rooms [{name, condition ok|attention|not_checked, observations, repair: null or {status pending|created|not_needed,
-- repair_id, decided_at, decided_by}}]; evidence_refs [{evidence_ref, reviewed_at, reviewed_by, revision}] as in 0056:
-- references to photos a person checked outside the app, never a file. No report or message to the landlord comes from it.
CREATE TABLE rental_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id),
  seq INTEGER NOT NULL CHECK (seq >= 1),
  operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 8 AND 80),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  inspected_on TEXT NOT NULL CHECK (inspected_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  rooms TEXT NOT NULL CHECK (json_valid(rooms) AND json_type(rooms) = 'array' AND json_array_length(rooms) BETWEEN 1 AND 40),
  evidence_refs TEXT NOT NULL CHECK (json_valid(evidence_refs) AND json_type(evidence_refs) = 'array'
    AND json_array_length(evidence_refs) <= 20),
  recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL,
  updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  UNIQUE (tenancy_id, seq)
);
-- The last inspection of a tenancy (the next one falls due six months after it) reads only this index.
CREATE INDEX rental_inspections_latest ON rental_inspections(tenancy_id, inspected_on);
-- Kept as recorded: what was seen, when and by whom never changes; only a found repair's decision is written later.
CREATE TRIGGER rental_inspections_kept BEFORE UPDATE OF tenancy_id, seq, operation_id, inspected_on, evidence_refs, recorded_at,
  recorded_by ON rental_inspections
BEGIN
  SELECT RAISE(ABORT, 'inspections are kept as recorded');
END;
CREATE TRIGGER rental_inspections_not_removed BEFORE DELETE ON rental_inspections
BEGIN
  SELECT RAISE(ABORT, 'inspections are kept as recorded');
END;
