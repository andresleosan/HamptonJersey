-- ADM-13 schema PROPOSAL for local synthetic tests only. Not a migration.
-- Do not deploy or connect until capability, tenancy lifecycle, retention,
-- private-evidence and transactional ownership are reviewed and integrated.
CREATE TABLE rental_inspections (
  id TEXT PRIMARY KEY,
  rental_id INTEGER NOT NULL REFERENCES rentals(id),
  tenancy_id INTEGER REFERENCES tenancies(id),
  due_on TEXT NOT NULL CHECK(length(due_on)=10 AND due_on>='0001-01-01' AND strftime('%Y-%m-%d',due_on,'+0 days') IS due_on),
  last_completed_on TEXT CHECK(last_completed_on IS NULL OR (length(last_completed_on)=10 AND last_completed_on>='0001-01-01' AND strftime('%Y-%m-%d',last_completed_on,'+0 days') IS last_completed_on)),
  scheduled_on TEXT CHECK(scheduled_on IS NULL OR (length(scheduled_on)=10 AND scheduled_on>='0001-01-01' AND strftime('%Y-%m-%d',scheduled_on,'+0 days') IS scheduled_on)),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed')),
  template_version INTEGER NOT NULL CHECK(template_version>0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  completed_on TEXT CHECK(completed_on IS NULL OR (length(completed_on)=10 AND completed_on>='0001-01-01' AND strftime('%Y-%m-%d',completed_on,'+0 days') IS completed_on)),
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT NOT NULL, created_by TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
  CHECK((status='open' AND completed_on IS NULL AND completed_at IS NULL AND completed_by IS NULL) OR
        (status='completed' AND completed_on IS NOT NULL AND completed_at IS NOT NULL AND completed_by IS NOT NULL)),
  CHECK(status='open' OR last_completed_on IS NULL OR completed_on>last_completed_on)
) WITHOUT ROWID;
CREATE UNIQUE INDEX rental_inspections_one_open ON rental_inspections(rental_id) WHERE status='open';
CREATE INDEX rental_inspections_history ON rental_inspections(rental_id,completed_on DESC);
CREATE TRIGGER rental_inspection_insert_guard BEFORE INSERT ON rental_inspections
BEGIN
  SELECT CASE WHEN NEW.status<>'open' OR NEW.revision<>1 THEN RAISE(ABORT,'inspection must start open at revision one') END;
  SELECT CASE WHEN NEW.tenancy_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM tenancies WHERE id=NEW.tenancy_id AND rental_id=NEW.rental_id)
    THEN RAISE(ABORT,'inspection tenancy mismatch') END;
END;
CREATE TRIGGER rental_inspection_revision_guard BEFORE UPDATE ON rental_inspections
WHEN NEW.id<>OLD.id OR NEW.rental_id<>OLD.rental_id OR NEW.tenancy_id IS NOT OLD.tenancy_id OR
  NEW.due_on<>OLD.due_on OR NEW.last_completed_on IS NOT OLD.last_completed_on OR NEW.template_version<>OLD.template_version OR
  NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by OR NEW.revision<>OLD.revision+1 OR
  (OLD.status='completed' AND (NEW.status<>OLD.status OR NEW.scheduled_on IS NOT OLD.scheduled_on OR NEW.completed_on IS NOT OLD.completed_on OR
    NEW.completed_at IS NOT OLD.completed_at OR NEW.completed_by IS NOT OLD.completed_by))
BEGIN SELECT RAISE(ABORT,'inspection revision or identity mismatch'); END;

CREATE TABLE rental_inspection_items (
  inspection_id TEXT NOT NULL REFERENCES rental_inspections(id),
  id TEXT NOT NULL,
  room TEXT NOT NULL CHECK(length(room) BETWEEN 1 AND 120),
  check_name TEXT NOT NULL CHECK(length(check_name) BETWEEN 1 AND 160),
  result TEXT NOT NULL DEFAULT 'not_checked' CHECK(result IN ('not_checked','ok','issue')),
  note TEXT CHECK(note IS NULL OR length(note)<=500),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  PRIMARY KEY(inspection_id,id)
) WITHOUT ROWID;
CREATE TRIGGER rental_inspection_item_insert_guard BEFORE INSERT ON rental_inspection_items
WHEN NEW.result<>'not_checked' OR NEW.revision<>1 OR
  NOT EXISTS(SELECT 1 FROM rental_inspections WHERE id=NEW.inspection_id AND status='open')
BEGIN SELECT RAISE(ABORT,'inspection item not open or not unchecked'); END;
CREATE TRIGGER rental_inspection_item_update_guard BEFORE UPDATE ON rental_inspection_items
WHEN NEW.inspection_id<>OLD.inspection_id OR NEW.id<>OLD.id OR NEW.room<>OLD.room OR NEW.check_name<>OLD.check_name OR
  NEW.revision<>OLD.revision+1 OR
  NOT EXISTS(SELECT 1 FROM rental_inspections WHERE id=OLD.inspection_id AND status='open')
BEGIN SELECT RAISE(ABORT,'inspection item revision mismatch'); END;
CREATE TRIGGER rental_inspection_item_delete_guard BEFORE DELETE ON rental_inspection_items
WHEN EXISTS(SELECT 1 FROM rental_inspections WHERE id=OLD.inspection_id AND status='completed')
BEGIN SELECT RAISE(ABORT,'completed inspection item cannot be deleted'); END;

-- Internal readings are ordinary private structured case data, not external files.
CREATE TABLE rental_inspection_meter_readings (
  inspection_id TEXT NOT NULL REFERENCES rental_inspections(id),
  ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 19),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 60),
  unit TEXT NOT NULL CHECK(length(unit) BETWEEN 1 AND 20),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  PRIMARY KEY(inspection_id,ordinal)
) WITHOUT ROWID;
CREATE TRIGGER rental_inspection_meter_insert_guard BEFORE INSERT ON rental_inspection_meter_readings
WHEN NEW.revision<>1 OR NOT EXISTS(SELECT 1 FROM rental_inspections WHERE id=NEW.inspection_id AND status='open')
BEGIN SELECT RAISE(ABORT,'inspection reading not open'); END;
CREATE TRIGGER rental_inspection_meter_update_guard BEFORE UPDATE ON rental_inspection_meter_readings
WHEN NEW.inspection_id<>OLD.inspection_id OR NEW.ordinal<>OLD.ordinal OR NEW.revision<>OLD.revision+1 OR
  NOT EXISTS(SELECT 1 FROM rental_inspections WHERE id=OLD.inspection_id AND status='open')
BEGIN SELECT RAISE(ABORT,'inspection reading revision mismatch'); END;
CREATE TRIGGER rental_inspection_meter_delete_guard BEFORE DELETE ON rental_inspection_meter_readings
WHEN EXISTS(SELECT 1 FROM rental_inspections WHERE id=OLD.inspection_id AND status='completed')
BEGIN SELECT RAISE(ABORT,'completed inspection reading cannot be deleted'); END;

-- Opaque external references only; the app does not fetch, upload or host them.
CREATE TABLE rental_inspection_evidence (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  evidence_ref TEXT NOT NULL CHECK(length(evidence_ref) BETWEEN 1 AND 120 AND
    substr(evidence_ref,1,1) GLOB '[A-Za-z0-9]' AND evidence_ref NOT GLOB '*[^A-Za-z0-9._:-]*' AND lower(evidence_ref) NOT LIKE 'http:%' AND
    lower(evidence_ref) NOT LIKE 'https:%' AND lower(evidence_ref) NOT LIKE 'file:%' AND
    lower(evidence_ref) NOT LIKE 'data:%' AND lower(evidence_ref) NOT LIKE 'javascript:%' AND lower(evidence_ref) NOT LIKE 'r2:%'),
  status TEXT NOT NULL DEFAULT 'reviewed' CHECK(status IN ('reviewed','revoked')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  reviewed_at TEXT NOT NULL, reviewed_by TEXT NOT NULL, revoked_at TEXT, revoked_by TEXT,
  UNIQUE(inspection_id,item_id,evidence_ref),
  FOREIGN KEY(inspection_id,item_id) REFERENCES rental_inspection_items(inspection_id,id),
  CHECK((status='reviewed' AND revision=1 AND revoked_at IS NULL AND revoked_by IS NULL) OR
    (status='revoked' AND revision>=2 AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
) WITHOUT ROWID;
CREATE INDEX rental_inspection_evidence_lookup ON rental_inspection_evidence(inspection_id,evidence_ref,status);
CREATE TRIGGER rental_inspection_evidence_insert_guard BEFORE INSERT ON rental_inspection_evidence
WHEN NEW.status<>'reviewed' OR NOT EXISTS(SELECT 1 FROM rental_inspections WHERE id=NEW.inspection_id AND status='open') OR
  EXISTS(SELECT 1 FROM rental_inspection_evidence e WHERE e.inspection_id=NEW.inspection_id
    AND e.evidence_ref=NEW.evidence_ref AND e.status='revoked')
BEGIN SELECT RAISE(ABORT,'inspection evidence requires review'); END;
CREATE TRIGGER rental_inspection_evidence_update_guard BEFORE UPDATE ON rental_inspection_evidence
WHEN NEW.id<>OLD.id OR NEW.inspection_id<>OLD.inspection_id OR NEW.item_id<>OLD.item_id OR NEW.evidence_ref<>OLD.evidence_ref OR
  NEW.reviewed_at<>OLD.reviewed_at OR NEW.reviewed_by<>OLD.reviewed_by OR OLD.status<>'reviewed' OR
  NEW.status<>'revoked' OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'inspection evidence revision mismatch'); END;
-- Deletion is intentionally blocked in this proposal until a reviewed retention
-- and purge policy exists; this is not a production retention implementation.
CREATE TRIGGER rental_inspection_evidence_delete_guard BEFORE DELETE ON rental_inspection_evidence
BEGIN SELECT RAISE(ABORT,'inspection evidence retention requires review'); END;
CREATE TRIGGER rental_inspection_evidence_revoke_same_ref AFTER UPDATE OF status ON rental_inspection_evidence
WHEN OLD.status='reviewed' AND NEW.status='revoked'
BEGIN
  UPDATE rental_inspection_evidence SET status='revoked',revision=revision+1,revoked_at=NEW.revoked_at,revoked_by=NEW.revoked_by
    WHERE inspection_id=NEW.inspection_id AND evidence_ref=NEW.evidence_ref AND status='reviewed' AND id<>NEW.id;
END;
CREATE TRIGGER rental_inspection_completion_guard BEFORE UPDATE OF status ON rental_inspections
WHEN OLD.status='open' AND NEW.status='completed' AND
  (NOT EXISTS(SELECT 1 FROM rental_inspection_items WHERE inspection_id=OLD.id) OR
   EXISTS(SELECT 1 FROM rental_inspection_items WHERE inspection_id=OLD.id AND result='not_checked') OR
   EXISTS(SELECT 1 FROM rental_inspection_evidence WHERE inspection_id=OLD.id AND status='revoked'))
BEGIN SELECT RAISE(ABORT,'inspection checklist requires review'); END;

-- Synthetic ownership and retention safeguards only. They preserve case identity
-- while any inspection exists, including when foreign keys or recursive delete
-- triggers are disabled. They intentionally do not implement an approved purge.
CREATE TRIGGER inspection_linked_tenancy_update_guard BEFORE UPDATE ON tenancies
WHEN (NEW.id<>OLD.id OR NEW.rental_id<>OLD.rental_id) AND
  EXISTS(SELECT 1 FROM rental_inspections WHERE tenancy_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'inspection tenancy identity is retained'); END;
CREATE TRIGGER inspection_linked_tenancy_delete_guard BEFORE DELETE ON tenancies
WHEN EXISTS(SELECT 1 FROM rental_inspections WHERE tenancy_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'inspection tenancy identity is retained'); END;
CREATE TRIGGER inspection_linked_tenancy_insert_guard BEFORE INSERT ON tenancies
WHEN EXISTS(SELECT 1 FROM rental_inspections WHERE tenancy_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'inspection tenancy identity is retained'); END;
CREATE TRIGGER inspection_linked_rental_update_guard BEFORE UPDATE ON rentals
WHEN NEW.id<>OLD.id AND EXISTS(SELECT 1 FROM rental_inspections WHERE rental_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'inspection rental identity is retained'); END;
CREATE TRIGGER inspection_linked_rental_delete_guard BEFORE DELETE ON rentals
WHEN EXISTS(SELECT 1 FROM rental_inspections WHERE rental_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'inspection rental identity is retained'); END;
CREATE TRIGGER inspection_linked_rental_insert_guard BEFORE INSERT ON rentals
WHEN EXISTS(SELECT 1 FROM rental_inspections WHERE rental_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'inspection rental identity is retained'); END;
CREATE TRIGGER inspection_retention_delete_guard BEFORE DELETE ON rental_inspections
BEGIN SELECT RAISE(ABORT,'inspection retention requires review'); END;
-- REPLACE may bypass DELETE triggers; guard both primary and open-rental keys.
CREATE TRIGGER inspection_retention_insert_guard BEFORE INSERT ON rental_inspections
WHEN EXISTS(SELECT 1 FROM rental_inspections WHERE id=NEW.id OR
  (NEW.status='open' AND status='open' AND rental_id=NEW.rental_id))
BEGIN SELECT RAISE(ABORT,'UNIQUE inspection conflict requires explicit retention review'); END;

-- SQLite REPLACE can delete a conflicting evidence row without running its
-- DELETE trigger. Preserve reviewed and revoked history for both unique keys.
CREATE TRIGGER inspection_evidence_conflict_guard BEFORE INSERT ON rental_inspection_evidence
WHEN EXISTS(SELECT 1 FROM rental_inspection_evidence e WHERE e.id=NEW.id OR
  (e.inspection_id=NEW.inspection_id AND e.item_id=NEW.item_id AND e.evidence_ref=NEW.evidence_ref))
BEGIN SELECT RAISE(ABORT,'inspection evidence conflict requires retention review'); END;
