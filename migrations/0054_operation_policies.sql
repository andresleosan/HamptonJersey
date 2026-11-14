-- AUT-10: Draft / Approve / Auto per automation operation, read by server/operation-modes.js only when
-- AUT10_MODES_READY is '1'. A mode is not an authorization: matches, dictated criteria and search
-- resolution stay human decisions in every mode. Additive: new tables, fixed rows and triggers only.
CREATE TABLE operation_policies (
  automation_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  mode TEXT NOT NULL CHECK (mode IN ('Draft', 'Approve', 'Auto')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (automation_id, operation)
);

-- Append-only history: one row per revision, written by the trigger below.
CREATE TABLE operation_policy_versions (
  automation_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  revision INTEGER NOT NULL,
  definition_version INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('Draft', 'Approve', 'Auto')),
  changed_at TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  PRIMARY KEY (automation_id, operation, revision)
);

-- Who may change modes. Seeds no one: a grant is added by hand (see docs/roadmap/work/AUT-10).
-- The check also requires the email to still be in admins.
CREATE TABLE operation_policy_managers (
  staff_email TEXT PRIMARY KEY,
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL
);

-- The three reviewed operations of AUT-09, all starting in Draft.
INSERT INTO operation_policies (automation_id, operation, definition_version, mode, revision, updated_at, updated_by) VALUES
  ('listing_text', 'prepare_draft', 1, 'Draft', 1, '2026-11-14T00:00:00.000Z', 'migration'),
  ('market_ambiguity_v1', 'propose_interpretation', 1, 'Draft', 1, '2026-11-14T00:00:00.000Z', 'migration'),
  ('hampton_intent_v1', 'propose_intent', 1, 'Draft', 1, '2026-11-14T00:00:00.000Z', 'migration');
INSERT INTO operation_policy_versions (automation_id, operation, revision, definition_version, mode, changed_at, changed_by)
  SELECT automation_id, operation, revision, definition_version, mode, updated_at, updated_by FROM operation_policies;

-- A row can be neither removed nor recreated, so an old revision can never come back (no ABA).
-- A new operation needs its own reviewed migration.
CREATE TRIGGER operation_policies_no_insert BEFORE INSERT ON operation_policies
BEGIN SELECT RAISE(ABORT, 'operation policies are fixed by migration'); END;
CREATE TRIGGER operation_policies_no_delete BEFORE DELETE ON operation_policies
BEGIN SELECT RAISE(ABORT, 'operation policies cannot be deleted'); END;
CREATE TRIGGER operation_policies_update_guard BEFORE UPDATE ON operation_policies
WHEN NEW.automation_id IS NOT OLD.automation_id OR NEW.operation IS NOT OLD.operation
  OR NEW.definition_version IS NOT OLD.definition_version OR NEW.revision IS NOT OLD.revision + 1
BEGIN SELECT RAISE(ABORT, 'operation policy revision must advance by one'); END;
CREATE TRIGGER operation_policies_version_log AFTER UPDATE ON operation_policies
BEGIN
  INSERT INTO operation_policy_versions (automation_id, operation, revision, definition_version, mode, changed_at, changed_by)
  VALUES (NEW.automation_id, NEW.operation, NEW.revision, NEW.definition_version, NEW.mode, NEW.updated_at, NEW.updated_by);
END;
CREATE TRIGGER operation_policy_versions_no_update BEFORE UPDATE ON operation_policy_versions
BEGIN SELECT RAISE(ABORT, 'operation policy history is append-only'); END;
CREATE TRIGGER operation_policy_versions_no_delete BEFORE DELETE ON operation_policy_versions
BEGIN SELECT RAISE(ABORT, 'operation policy history is append-only'); END;

-- Removing someone from admins, or changing their email, revokes the grant; re-adding them does not restore it.
CREATE TRIGGER operation_policy_revoke_removed_admin AFTER DELETE ON admins
BEGIN DELETE FROM operation_policy_managers WHERE staff_email = OLD.email; END;
CREATE TRIGGER operation_policy_revoke_changed_admin AFTER UPDATE OF email ON admins
BEGIN DELETE FROM operation_policy_managers WHERE staff_email = OLD.email; END;
