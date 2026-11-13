-- ADM-18: operator-managed case capabilities for structured data only.
-- No policy, membership or capability is seeded, and no document store is created.
CREATE TABLE case_purpose_policies (
  purpose TEXT PRIMARY KEY CHECK(purpose IN (
    'rental_application','tenancy_reference','repair_report','renewal_response',
    'arrears_management','landlord_statement','sale_review'
  )),
  revision INTEGER NOT NULL CHECK(revision>0),
  status TEXT NOT NULL CHECK(status IN ('draft','approved','revoked')),
  retention_ref TEXT CHECK(retention_ref IS NULL OR (length(retention_ref) BETWEEN 1 AND 120 AND retention_ref NOT GLOB '*[^A-Za-z0-9._:-]*')),
  privacy_ref TEXT CHECK(privacy_ref IS NULL OR (length(privacy_ref) BETWEEN 1 AND 120 AND privacy_ref NOT GLOB '*[^A-Za-z0-9._:-]*')),
  approval_ref TEXT CHECK(approval_ref IS NULL OR (length(approval_ref) BETWEEN 1 AND 120 AND approval_ref NOT GLOB '*[^A-Za-z0-9._:-]*')),
  approved_by TEXT CHECK(approved_by IS NULL OR length(approved_by) BETWEEN 1 AND 160),
  valid_from TEXT CHECK(valid_from IS NULL OR (length(valid_from)=24 AND strftime('%Y-%m-%dT%H:%M:%fZ',valid_from) IS valid_from)),
  expires_at TEXT CHECK(expires_at IS NULL OR (length(expires_at)=24 AND strftime('%Y-%m-%dT%H:%M:%fZ',expires_at) IS expires_at)),
  CHECK(expires_at IS NULL OR (valid_from IS NOT NULL AND expires_at>valid_from)),
  CHECK(status<>'approved' OR (retention_ref IS NOT NULL AND privacy_ref IS NOT NULL AND approval_ref IS NOT NULL AND approved_by IS NOT NULL AND valid_from IS NOT NULL))
) WITHOUT ROWID;
CREATE TRIGGER case_policy_version BEFORE UPDATE ON case_purpose_policies
WHEN NEW.purpose<>OLD.purpose OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'case policy version required'); END;
CREATE TRIGGER case_policy_new_approval BEFORE UPDATE ON case_purpose_policies
WHEN OLD.status='revoked' AND NEW.status='approved' AND NEW.approval_ref IS OLD.approval_ref
BEGIN SELECT RAISE(ABORT,'new case policy approval required'); END;

CREATE TABLE case_capability_memberships (
  case_kind TEXT NOT NULL CHECK(case_kind IN ('rental','tenancy','sale','rental_application')),
  case_id INTEGER NOT NULL CHECK(case_id>0),
  staff_email TEXT NOT NULL CHECK(length(staff_email) BETWEEN 3 AND 254 AND staff_email=lower(staff_email)),
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  version INTEGER NOT NULL CHECK(version>0),
  approval_ref TEXT NOT NULL CHECK(length(approval_ref) BETWEEN 1 AND 120 AND approval_ref NOT GLOB '*[^A-Za-z0-9._:-]*'),
  approved_by TEXT NOT NULL CHECK(length(approved_by) BETWEEN 1 AND 160),
  approved_at TEXT NOT NULL CHECK(length(approved_at)=24 AND strftime('%Y-%m-%dT%H:%M:%fZ',approved_at) IS approved_at),
  PRIMARY KEY(case_kind,case_id,staff_email)
) WITHOUT ROWID;
CREATE TRIGGER case_membership_version BEFORE UPDATE ON case_capability_memberships
WHEN NEW.case_kind<>OLD.case_kind OR NEW.case_id<>OLD.case_id OR NEW.staff_email<>OLD.staff_email OR NEW.version<>OLD.version+1
BEGIN SELECT RAISE(ABORT,'case membership version required'); END;
CREATE TRIGGER case_membership_new_approval BEFORE UPDATE ON case_capability_memberships
WHEN OLD.status='revoked' AND NEW.status='active' AND NEW.approval_ref=OLD.approval_ref
BEGIN SELECT RAISE(ABORT,'new case membership approval required'); END;

CREATE TABLE case_capability_grants (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 120 AND id NOT GLOB '*[^A-Za-z0-9._:-]*'),
  case_kind TEXT NOT NULL,
  case_id INTEGER NOT NULL,
  staff_email TEXT NOT NULL,
  capability TEXT NOT NULL CHECK(capability IN ('case_data_read','case_data_write','sensitive_finance')),
  purpose TEXT NOT NULL REFERENCES case_purpose_policies(purpose),
  status TEXT NOT NULL CHECK(status IN ('active','revoked')),
  version INTEGER NOT NULL CHECK(version>0),
  membership_version INTEGER NOT NULL CHECK(membership_version>0),
  policy_revision INTEGER NOT NULL CHECK(policy_revision>0),
  approval_ref TEXT NOT NULL CHECK(length(approval_ref) BETWEEN 1 AND 120 AND approval_ref NOT GLOB '*[^A-Za-z0-9._:-]*'),
  approved_by TEXT NOT NULL CHECK(length(approved_by) BETWEEN 1 AND 160),
  valid_from TEXT NOT NULL CHECK(length(valid_from)=24 AND strftime('%Y-%m-%dT%H:%M:%fZ',valid_from) IS valid_from),
  expires_at TEXT CHECK(expires_at IS NULL OR (length(expires_at)=24 AND strftime('%Y-%m-%dT%H:%M:%fZ',expires_at) IS expires_at AND expires_at>valid_from)),
  FOREIGN KEY(case_kind,case_id,staff_email) REFERENCES case_capability_memberships(case_kind,case_id,staff_email)
) WITHOUT ROWID;
CREATE UNIQUE INDEX case_one_active_capability ON case_capability_grants(case_kind,case_id,staff_email,capability,purpose) WHERE status='active';
CREATE TRIGGER case_capability_version BEFORE UPDATE ON case_capability_grants
WHEN NEW.id<>OLD.id OR NEW.case_kind<>OLD.case_kind OR NEW.case_id<>OLD.case_id OR NEW.staff_email<>OLD.staff_email
 OR NEW.capability<>OLD.capability OR NEW.purpose<>OLD.purpose OR NEW.version<>OLD.version+1
 OR NEW.membership_version<>OLD.membership_version OR NEW.policy_revision<>OLD.policy_revision
 OR NEW.approval_ref<>OLD.approval_ref OR NEW.approved_by<>OLD.approved_by OR NEW.valid_from<>OLD.valid_from
 OR (OLD.expires_at IS NOT NULL AND (NEW.expires_at IS NULL OR NEW.expires_at>OLD.expires_at))
BEGIN SELECT RAISE(ABORT,'case capability version required'); END;
CREATE TRIGGER case_capability_revocation_final BEFORE UPDATE ON case_capability_grants
WHEN OLD.status='revoked' AND NEW.status='active'
BEGIN SELECT RAISE(ABORT,'revoked case capability cannot be restored'); END;

-- Invalidate old authority transactionally on identity removal, replacement,
-- or email change. INSERT also covers SQLite REPLACE when recursive delete
-- triggers are disabled. Creating an admin never supplies case authorization.
CREATE TRIGGER case_revoke_removed_admin AFTER DELETE ON admins
BEGIN
  UPDATE case_capability_grants SET status='revoked',version=version+1
    WHERE staff_email=OLD.email AND status='active';
  UPDATE case_capability_memberships SET status='revoked',version=version+1
    WHERE staff_email=OLD.email AND status='active';
END;
CREATE TRIGGER case_revoke_inserted_admin AFTER INSERT ON admins
BEGIN
  UPDATE case_capability_grants SET status='revoked',version=version+1
    WHERE staff_email=NEW.email AND status='active';
  UPDATE case_capability_memberships SET status='revoked',version=version+1
    WHERE staff_email=NEW.email AND status='active';
END;
CREATE TRIGGER case_revoke_changed_admin_email AFTER UPDATE OF email ON admins
WHEN NEW.email<>OLD.email
BEGIN
  UPDATE case_capability_grants SET status='revoked',version=version+1
    WHERE staff_email IN (OLD.email,NEW.email) AND status='active';
  UPDATE case_capability_memberships SET status='revoked',version=version+1
    WHERE staff_email IN (OLD.email,NEW.email) AND status='active';
END;

-- The owner includes assertion and cleanup in the same D1 batch as its write.
CREATE TABLE case_capability_batch_assertions (
  id TEXT PRIMARY KEY,
  permitted INTEGER NOT NULL CHECK(permitted=1)
) WITHOUT ROWID;
