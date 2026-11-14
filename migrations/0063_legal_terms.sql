-- ADM-17: the rentals' legal periods and Hampton's JFSC/GST registrations as versioned settings, read by
-- server/legal-terms.js only when ADM17_LEGAL_TERMS_READY is '1'. No row is seeded: without one the periods are
-- the code's (LEGAL in server/rentals.js), shown as estimated, and the registrations are unknown. Nothing here
-- validates a period or confirms a registration. Additive: new tables and triggers only.
CREATE TABLE legal_settings (
  key TEXT PRIMARY KEY CHECK (key IN ('terms', 'registration')),
  value TEXT NOT NULL CHECK (json_valid(value)),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Append-only history: one row per revision, written by the triggers below.
CREATE TABLE legal_setting_versions (
  key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  value TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  PRIMARY KEY (key, revision)
);

-- A setting starts at revision 1, advances by one and is never removed, so an old revision can never come back.
CREATE TRIGGER legal_settings_first_revision BEFORE INSERT ON legal_settings
WHEN NEW.revision IS NOT 1
BEGIN SELECT RAISE(ABORT, 'a legal setting starts at revision 1'); END;
CREATE TRIGGER legal_settings_update_guard BEFORE UPDATE ON legal_settings
WHEN NEW.key IS NOT OLD.key OR NEW.revision IS NOT OLD.revision + 1
BEGIN SELECT RAISE(ABORT, 'legal setting revision must advance by one'); END;
CREATE TRIGGER legal_settings_no_delete BEFORE DELETE ON legal_settings
BEGIN SELECT RAISE(ABORT, 'legal settings cannot be deleted'); END;
CREATE TRIGGER legal_settings_insert_log AFTER INSERT ON legal_settings
BEGIN
  INSERT INTO legal_setting_versions (key, revision, value, changed_at, changed_by)
  VALUES (NEW.key, NEW.revision, NEW.value, NEW.updated_at, NEW.updated_by);
END;
CREATE TRIGGER legal_settings_update_log AFTER UPDATE ON legal_settings
BEGIN
  INSERT INTO legal_setting_versions (key, revision, value, changed_at, changed_by)
  VALUES (NEW.key, NEW.revision, NEW.value, NEW.updated_at, NEW.updated_by);
END;
CREATE TRIGGER legal_setting_versions_no_update BEFORE UPDATE ON legal_setting_versions
BEGIN SELECT RAISE(ABORT, 'legal setting history is append-only'); END;
CREATE TRIGGER legal_setting_versions_no_delete BEFORE DELETE ON legal_setting_versions
BEGIN SELECT RAISE(ABORT, 'legal setting history is append-only'); END;
