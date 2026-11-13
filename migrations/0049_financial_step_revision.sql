-- Every committed arrears-step transition invalidates previously read case
-- finance snapshots, even when a later change restores the same visible step.
-- This adds no capabilities, data, routes, or notification/financial writes.
CREATE TRIGGER finance_arrears_step_insert AFTER INSERT ON arrears_steps BEGIN
  UPDATE tenancies SET financial_revision=financial_revision+1 WHERE id=NEW.tenancy_id;
END;
CREATE TRIGGER finance_arrears_step_update AFTER UPDATE ON arrears_steps BEGIN
  UPDATE tenancies SET financial_revision=financial_revision+1 WHERE id IN (OLD.tenancy_id,NEW.tenancy_id);
END;
CREATE TRIGGER finance_arrears_step_delete AFTER DELETE ON arrears_steps BEGIN
  UPDATE tenancies SET financial_revision=financial_revision+1 WHERE id=OLD.tenancy_id;
END;

-- Existing memberships cannot prove which lifetime of an integer case ID
-- they were approved for. They remain stored but inactive in the guard until
-- an explicitly renewed membership and a new grant bind to this generation.
ALTER TABLE case_capability_memberships ADD COLUMN lifecycle_generation INTEGER NOT NULL DEFAULT 0
  CHECK(lifecycle_generation IN (0,1));
CREATE TRIGGER case_membership_generation_guard BEFORE UPDATE OF lifecycle_generation ON case_capability_memberships
WHEN NEW.lifecycle_generation<>OLD.lifecycle_generation AND NOT (
  OLD.lifecycle_generation=0 AND NEW.lifecycle_generation=1 AND OLD.status='revoked' AND NEW.status='active'
  AND NEW.approval_ref<>OLD.approval_ref)
BEGIN SELECT RAISE(ABORT,'case membership requires new approval'); END;
CREATE TRIGGER case_membership_case_insert_guard BEFORE INSERT ON case_capability_memberships
WHEN NEW.lifecycle_generation=1 AND NOT (
  (NEW.case_kind='tenancy' AND EXISTS(SELECT 1 FROM tenancies WHERE id=NEW.case_id)) OR
  (NEW.case_kind='rental' AND EXISTS(SELECT 1 FROM rentals WHERE id=NEW.case_id)) OR
  (NEW.case_kind='sale' AND EXISTS(SELECT 1 FROM sales WHERE id=NEW.case_id)))
BEGIN SELECT RAISE(ABORT,'case membership requires an existing supported case'); END;
CREATE TRIGGER case_membership_case_update_guard BEFORE UPDATE ON case_capability_memberships
WHEN NEW.lifecycle_generation=1 AND NEW.status='active' AND NOT (
  (NEW.case_kind='tenancy' AND EXISTS(SELECT 1 FROM tenancies WHERE id=NEW.case_id)) OR
  (NEW.case_kind='rental' AND EXISTS(SELECT 1 FROM rentals WHERE id=NEW.case_id)) OR
  (NEW.case_kind='sale' AND EXISTS(SELECT 1 FROM sales WHERE id=NEW.case_id)))
BEGIN SELECT RAISE(ABORT,'case membership requires an existing supported case'); END;

-- SQLite REPLACE can skip DELETE triggers with recursive_triggers disabled.
-- Reject all conflicts rather than silently replacing approved authority.
CREATE TRIGGER case_policy_insert_guard BEFORE INSERT ON case_purpose_policies
WHEN EXISTS(SELECT 1 FROM case_purpose_policies WHERE purpose=NEW.purpose)
BEGIN SELECT RAISE(ABORT,'case policy already exists'); END;
CREATE TRIGGER case_membership_insert_guard BEFORE INSERT ON case_capability_memberships
WHEN EXISTS(SELECT 1 FROM case_capability_memberships
  WHERE case_kind=NEW.case_kind AND case_id=NEW.case_id AND staff_email=NEW.staff_email)
BEGIN SELECT RAISE(ABORT,'case membership already exists'); END;
CREATE TRIGGER case_grant_insert_guard BEFORE INSERT ON case_capability_grants
WHEN EXISTS(SELECT 1 FROM case_capability_grants WHERE id=NEW.id OR
  (NEW.status='active' AND status='active' AND case_kind=NEW.case_kind AND case_id=NEW.case_id
    AND staff_email=NEW.staff_email AND capability=NEW.capability AND purpose=NEW.purpose))
BEGIN SELECT RAISE(ABORT,'case grant already exists'); END;
-- Unknown UNIQUE indexes could create new implicit REPLACE paths. Block
-- authority writes under schema drift until those constraints are reviewed.
CREATE TRIGGER case_policy_schema_insert_guard BEFORE INSERT ON case_purpose_policies
WHEN (SELECT COUNT(*) FROM pragma_index_list('case_purpose_policies') WHERE "unique"=1)<>1 OR
  (SELECT COUNT(*) FROM pragma_index_list('case_purpose_policies') WHERE "unique"=1 AND name='sqlite_autoindex_case_purpose_policies_1')<>1
BEGIN SELECT RAISE(ABORT,'case authority schema unavailable'); END;
CREATE TRIGGER case_policy_schema_update_guard BEFORE UPDATE ON case_purpose_policies
WHEN (SELECT COUNT(*) FROM pragma_index_list('case_purpose_policies') WHERE "unique"=1)<>1 OR
  (SELECT COUNT(*) FROM pragma_index_list('case_purpose_policies') WHERE "unique"=1 AND name='sqlite_autoindex_case_purpose_policies_1')<>1
BEGIN SELECT RAISE(ABORT,'case authority schema unavailable'); END;
CREATE TRIGGER case_membership_schema_insert_guard BEFORE INSERT ON case_capability_memberships
WHEN (SELECT COUNT(*) FROM pragma_index_list('case_capability_memberships') WHERE "unique"=1)<>1 OR
  (SELECT COUNT(*) FROM pragma_index_list('case_capability_memberships') WHERE "unique"=1 AND name='sqlite_autoindex_case_capability_memberships_1')<>1
BEGIN SELECT RAISE(ABORT,'case authority schema unavailable'); END;
CREATE TRIGGER case_membership_schema_update_guard BEFORE UPDATE ON case_capability_memberships
WHEN (SELECT COUNT(*) FROM pragma_index_list('case_capability_memberships') WHERE "unique"=1)<>1 OR
  (SELECT COUNT(*) FROM pragma_index_list('case_capability_memberships') WHERE "unique"=1 AND name='sqlite_autoindex_case_capability_memberships_1')<>1
BEGIN SELECT RAISE(ABORT,'case authority schema unavailable'); END;
CREATE TRIGGER case_grant_schema_insert_guard BEFORE INSERT ON case_capability_grants
WHEN (SELECT COUNT(*) FROM pragma_index_list('case_capability_grants') WHERE "unique"=1)<>2 OR
  (SELECT COUNT(*) FROM pragma_index_list('case_capability_grants') WHERE "unique"=1 AND name IN ('case_one_active_capability','sqlite_autoindex_case_capability_grants_1'))<>2
BEGIN SELECT RAISE(ABORT,'case authority schema unavailable'); END;
CREATE TRIGGER case_grant_schema_update_guard BEFORE UPDATE ON case_capability_grants
WHEN (SELECT COUNT(*) FROM pragma_index_list('case_capability_grants') WHERE "unique"=1)<>2 OR
  (SELECT COUNT(*) FROM pragma_index_list('case_capability_grants') WHERE "unique"=1 AND name IN ('case_one_active_capability','sqlite_autoindex_case_capability_grants_1'))<>2
BEGIN SELECT RAISE(ABORT,'case authority schema unavailable'); END;
-- A deleted authority row could be recreated with its earlier version and
-- make an in-flight snapshot valid again. Retention/erasure needs a separate
-- reviewed tombstone design before these rows can ever be removed.
CREATE TRIGGER case_policy_delete_guard BEFORE DELETE ON case_purpose_policies
BEGIN SELECT RAISE(ABORT,'case policy must be revoked'); END;
CREATE TRIGGER case_membership_delete_guard BEFORE DELETE ON case_capability_memberships
BEGIN SELECT RAISE(ABORT,'case membership must be revoked'); END;
CREATE TRIGGER case_grant_delete_guard BEFORE DELETE ON case_capability_grants
BEGIN SELECT RAISE(ABORT,'case grant must be revoked'); END;

-- A case deletion invalidates all its current authority in the same statement.
-- If deletion fails, the database rolls these revocations back with it.
CREATE TRIGGER case_tenancy_delete_guard BEFORE DELETE ON tenancies BEGIN
  UPDATE case_capability_grants SET status='revoked',version=version+1
    WHERE case_kind='tenancy' AND case_id=OLD.id AND status='active';
  UPDATE case_capability_memberships SET status='revoked',version=version+1
    WHERE case_kind='tenancy' AND case_id=OLD.id AND status='active';
END;
CREATE TRIGGER case_rental_delete_guard BEFORE DELETE ON rentals BEGIN
  UPDATE case_capability_grants SET status='revoked',version=version+1
    WHERE case_kind='rental' AND case_id=OLD.id AND status='active';
  UPDATE case_capability_memberships SET status='revoked',version=version+1
    WHERE case_kind='rental' AND case_id=OLD.id AND status='active';
END;
CREATE TRIGGER case_sale_delete_guard BEFORE DELETE ON sales BEGIN
  UPDATE case_capability_grants SET status='revoked',version=version+1
    WHERE case_kind='sale' AND case_id=OLD.id AND status='active';
  UPDATE case_capability_memberships SET status='revoked',version=version+1
    WHERE case_kind='sale' AND case_id=OLD.id AND status='active';
END;

-- Also invalidate lingering authority on insertion. This covers reusing an ID
-- after a future, unreviewed UNIQUE conflict silently replaced an old row.
CREATE TRIGGER case_tenancy_insert_revoke AFTER INSERT ON tenancies BEGIN
  UPDATE case_capability_grants SET status='revoked',version=version+1
    WHERE case_kind='tenancy' AND case_id=NEW.id AND status='active';
  UPDATE case_capability_memberships SET status='revoked',version=version+1
    WHERE case_kind='tenancy' AND case_id=NEW.id AND status='active';
END;
CREATE TRIGGER case_rental_insert_revoke AFTER INSERT ON rentals BEGIN
  UPDATE case_capability_grants SET status='revoked',version=version+1
    WHERE case_kind='rental' AND case_id=NEW.id AND status='active';
  UPDATE case_capability_memberships SET status='revoked',version=version+1
    WHERE case_kind='rental' AND case_id=NEW.id AND status='active';
END;
CREATE TRIGGER case_sale_insert_revoke AFTER INSERT ON sales BEGIN
  UPDATE case_capability_grants SET status='revoked',version=version+1
    WHERE case_kind='sale' AND case_id=NEW.id AND status='active';
  UPDATE case_capability_memberships SET status='revoked',version=version+1
    WHERE case_kind='sale' AND case_id=NEW.id AND status='active';
END;

-- Check every UPDATE: SQLite lets rowid, _rowid_ and oid alias an integer PK.
CREATE TRIGGER case_tenancy_id_guard BEFORE UPDATE ON tenancies WHEN NEW.id<>OLD.id
BEGIN SELECT RAISE(ABORT,'case identity is immutable'); END;
CREATE TRIGGER case_rental_id_guard BEFORE UPDATE ON rentals WHEN NEW.id<>OLD.id
BEGIN SELECT RAISE(ABORT,'case identity is immutable'); END;
CREATE TRIGGER case_sale_id_guard BEFORE UPDATE ON sales WHEN NEW.id<>OLD.id
BEGIN SELECT RAISE(ABORT,'case identity is immutable'); END;

-- UPDATE OR REPLACE can also delete a different case without DELETE triggers.
CREATE TRIGGER case_tenancy_update_guard BEFORE UPDATE OF payment_ref,rental_id,ended_on ON tenancies WHEN EXISTS(
  SELECT 1 FROM tenancies t WHERE t.id<>OLD.id AND
    ((NEW.payment_ref IS NOT NULL AND t.payment_ref=NEW.payment_ref) OR
     (NEW.ended_on IS NULL AND t.ended_on IS NULL AND t.rental_id=NEW.rental_id)))
BEGIN SELECT RAISE(ABORT,'UNIQUE constraint failed: tenancy conflict requires explicit update'); END;
CREATE TRIGGER case_sale_update_guard BEFORE UPDATE OF offer_id,status,listing_id,applicant_id ON sales WHEN EXISTS(
  SELECT 1 FROM sales s WHERE s.id<>OLD.id AND (s.offer_id=NEW.offer_id OR
    (NEW.status='in_progress' AND s.status='in_progress' AND (s.listing_id=NEW.listing_id OR s.applicant_id=NEW.applicant_id))))
BEGIN SELECT RAISE(ABORT,'UNIQUE constraint failed: sale conflict requires explicit update'); END;

-- Cover every existing UNIQUE constraint that can cause an implicit REPLACE.
CREATE TRIGGER case_tenancy_insert_guard BEFORE INSERT ON tenancies WHEN EXISTS(
  SELECT 1 FROM tenancies t WHERE t.id=NEW.id OR (NEW.payment_ref IS NOT NULL AND t.payment_ref=NEW.payment_ref)
    OR (NEW.ended_on IS NULL AND t.ended_on IS NULL AND t.rental_id=NEW.rental_id))
BEGIN SELECT RAISE(ABORT,'UNIQUE constraint failed: tenancy conflict requires explicit update'); END;
CREATE TRIGGER case_rental_insert_guard BEFORE INSERT ON rentals WHEN EXISTS(SELECT 1 FROM rentals WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'UNIQUE constraint failed: rental conflict requires explicit update'); END;
CREATE TRIGGER case_sale_insert_guard BEFORE INSERT ON sales WHEN EXISTS(
  SELECT 1 FROM sales s WHERE s.id=NEW.id OR s.offer_id=NEW.offer_id OR
    (NEW.status='in_progress' AND s.status='in_progress' AND (s.listing_id=NEW.listing_id OR s.applicant_id=NEW.applicant_id)))
BEGIN SELECT RAISE(ABORT,'UNIQUE constraint failed: sale conflict requires explicit update'); END;
