-- EST-01 proposal only: not a migration and not an assertion about any remote schema.
CREATE TABLE applicant_search_progress (
  applicant_id INTEGER PRIMARY KEY REFERENCES applicants(id) ON DELETE CASCADE,
  attempt_seq INTEGER NOT NULL CHECK(attempt_seq BETWEEN 1 AND 9007199254740991),
  attempt_token TEXT NOT NULL UNIQUE CHECK(length(attempt_token)=36),
  last_attempt_at TEXT NOT NULL CHECK(strftime('%Y-%m-%dT%H:%M:%fZ',last_attempt_at,'+0 seconds') IS NOT NULL
    AND last_attempt_at=strftime('%Y-%m-%dT%H:%M:%fZ',last_attempt_at,'+0 seconds')),
  last_attempt_updated_at TEXT NOT NULL,
  last_attempt_inputs_revision INTEGER NOT NULL CHECK(last_attempt_inputs_revision>=0),
  attempt_state TEXT NOT NULL CHECK(attempt_state IN ('running','succeeded','failed')),
  attempt_finished_at TEXT,
  error_code TEXT,
  last_success_at TEXT,
  last_success_updated_at TEXT,
  last_success_inputs_revision INTEGER,
  last_success_seq INTEGER,
  last_success_checked_count INTEGER,
  CHECK ((attempt_state='running' AND attempt_finished_at IS NULL AND error_code IS NULL)
    OR (attempt_state='succeeded' AND attempt_finished_at IS NOT NULL AND error_code IS NULL)
    OR (attempt_state='failed' AND attempt_finished_at IS NOT NULL AND error_code IS NOT NULL AND error_code='check_failed')),
  CHECK (attempt_finished_at IS NULL OR (strftime('%Y-%m-%dT%H:%M:%fZ',attempt_finished_at,'+0 seconds') IS NOT NULL
    AND attempt_finished_at=strftime('%Y-%m-%dT%H:%M:%fZ',attempt_finished_at,'+0 seconds') AND attempt_finished_at>=last_attempt_at)),
  CHECK ((last_success_at IS NULL AND last_success_updated_at IS NULL AND last_success_inputs_revision IS NULL
      AND last_success_seq IS NULL AND last_success_checked_count IS NULL)
    OR (last_success_at IS NOT NULL AND last_success_updated_at IS NOT NULL AND last_success_inputs_revision IS NOT NULL
      AND last_success_inputs_revision>=0 AND last_success_seq IS NOT NULL AND last_success_seq BETWEEN 1 AND attempt_seq
      AND last_success_checked_count IS NOT NULL AND typeof(last_success_checked_count)='integer'
      AND last_success_checked_count>=0 AND strftime('%Y-%m-%dT%H:%M:%fZ',last_success_at,'+0 seconds') IS NOT NULL
      AND last_success_at=strftime('%Y-%m-%dT%H:%M:%fZ',last_success_at,'+0 seconds'))),
  CHECK (attempt_state<>'succeeded' OR (last_success_at IS NOT NULL AND last_success_seq IS NOT NULL
    AND last_success_at=attempt_finished_at AND last_success_seq=attempt_seq)),
  CHECK (attempt_state='succeeded' OR last_success_at IS NULL OR
    (last_success_seq<attempt_seq AND last_success_at<=last_attempt_at))
);

-- REPLACE must not delete the current generation, even when recursive_triggers is OFF.
CREATE TRIGGER search_progress_no_replace BEFORE INSERT ON applicant_search_progress
WHEN EXISTS(SELECT 1 FROM applicant_search_progress WHERE applicant_id=NEW.applicant_id OR attempt_token=NEW.attempt_token)
BEGIN SELECT RAISE(ABORT,'search progress already exists'); END;

-- Existing progress may only begin a new generation, or finish its currently running generation.
CREATE TRIGGER search_progress_transition BEFORE UPDATE ON applicant_search_progress
WHEN NEW.applicant_id IS NOT OLD.applicant_id OR NOT (
  (NEW.attempt_seq=OLD.attempt_seq+1 AND NEW.attempt_token IS NOT OLD.attempt_token
    AND NEW.attempt_state='running' AND NEW.last_attempt_at>=OLD.last_attempt_at
    AND NEW.last_success_at IS OLD.last_success_at AND NEW.last_success_updated_at IS OLD.last_success_updated_at
    AND NEW.last_success_inputs_revision IS OLD.last_success_inputs_revision AND NEW.last_success_seq IS OLD.last_success_seq
    AND NEW.last_success_checked_count IS OLD.last_success_checked_count)
  OR
  (NEW.attempt_seq=OLD.attempt_seq AND NEW.attempt_token IS OLD.attempt_token AND OLD.attempt_state='running'
    AND NEW.last_attempt_at IS OLD.last_attempt_at AND NEW.last_attempt_updated_at IS OLD.last_attempt_updated_at
    AND NEW.last_attempt_inputs_revision IS OLD.last_attempt_inputs_revision
    AND ((NEW.attempt_state='failed' AND NEW.last_success_at IS OLD.last_success_at
        AND NEW.last_success_updated_at IS OLD.last_success_updated_at
        AND NEW.last_success_inputs_revision IS OLD.last_success_inputs_revision
        AND NEW.last_success_seq IS OLD.last_success_seq AND NEW.last_success_checked_count IS OLD.last_success_checked_count)
      OR (NEW.attempt_state='succeeded' AND NEW.last_success_at IS NEW.attempt_finished_at
        AND NEW.last_success_updated_at IS OLD.last_attempt_updated_at
        AND NEW.last_success_inputs_revision IS OLD.last_attempt_inputs_revision AND NEW.last_success_seq=OLD.attempt_seq)))
)
BEGIN SELECT RAISE(ABORT,'search progress transition invalid'); END;

-- Durable, non-reusable identities. These tables contain identifiers only and are
-- deliberately not cascaded: deleting their contents would reopen ABA races.
CREATE TABLE est01_applicant_ids (applicant_id INTEGER PRIMARY KEY);
INSERT INTO est01_applicant_ids SELECT id FROM applicants;
CREATE TRIGGER est01_applicant_ids_no_insert BEFORE INSERT ON est01_applicant_ids
WHEN EXISTS(SELECT 1 FROM est01_applicant_ids WHERE applicant_id=NEW.applicant_id)
BEGIN SELECT RAISE(ABORT,'applicant identity already used'); END;
CREATE TRIGGER est01_applicant_ids_no_update BEFORE UPDATE ON est01_applicant_ids
BEGIN SELECT RAISE(ABORT,'applicant identity immutable'); END;
CREATE TRIGGER est01_applicant_ids_no_delete BEFORE DELETE ON est01_applicant_ids
BEGIN SELECT RAISE(ABORT,'applicant identity immutable'); END;
-- AFTER INSERT sees the actual automatically allocated ID. An abort also rolls
-- back an INSERT OR REPLACE, including any implicit delete and cascades.
CREATE TRIGGER est01_applicant_record_identity AFTER INSERT ON applicants
BEGIN INSERT INTO est01_applicant_ids(applicant_id) VALUES(NEW.id); END;
CREATE TRIGGER est01_applicant_id_immutable BEFORE UPDATE ON applicants
WHEN NEW.id IS NOT OLD.id
BEGIN SELECT RAISE(ABORT,'applicant identity immutable'); END;

CREATE TABLE est01_attempt_tokens (attempt_token TEXT PRIMARY KEY NOT NULL);
CREATE TRIGGER est01_attempt_tokens_no_insert BEFORE INSERT ON est01_attempt_tokens
WHEN EXISTS(SELECT 1 FROM est01_attempt_tokens WHERE attempt_token=NEW.attempt_token)
BEGIN SELECT RAISE(ABORT,'attempt identity already used'); END;
CREATE TRIGGER est01_attempt_tokens_no_update BEFORE UPDATE ON est01_attempt_tokens
BEGIN SELECT RAISE(ABORT,'attempt identity immutable'); END;
CREATE TRIGGER est01_attempt_tokens_no_delete BEFORE DELETE ON est01_attempt_tokens
BEGIN SELECT RAISE(ABORT,'attempt identity immutable'); END;
CREATE TRIGGER est01_attempt_record_insert AFTER INSERT ON applicant_search_progress
BEGIN INSERT INTO est01_attempt_tokens(attempt_token) VALUES(NEW.attempt_token); END;
CREATE TRIGGER est01_attempt_record_update AFTER UPDATE OF attempt_token ON applicant_search_progress
WHEN NEW.attempt_token IS NOT OLD.attempt_token
BEGIN INSERT INTO est01_attempt_tokens(attempt_token) VALUES(NEW.attempt_token); END;
