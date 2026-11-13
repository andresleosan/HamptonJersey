-- ADM-09: immutable accounting adjustments; never manufacture received payments.
-- No capabilities, routes, actors or grants are created by this migration.
ALTER TABLE tenancies ADD COLUMN financial_revision INTEGER NOT NULL DEFAULT 1
  CHECK(typeof(financial_revision)='integer' AND financial_revision > 0);
CREATE TRIGGER finance_revision_monotonic BEFORE UPDATE OF financial_revision ON tenancies
WHEN NEW.financial_revision<>OLD.financial_revision+1
BEGIN SELECT RAISE(ABORT,'financial revision must advance by one'); END;

CREATE TABLE charge_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id INTEGER NOT NULL REFERENCES charges(id),
  amount_pence INTEGER NOT NULL CHECK(typeof(amount_pence)='integer' AND amount_pence > 0 AND amount_pence <= 100000000),
  kind TEXT NOT NULL CHECK(kind IN ('writeoff','reversal')),
  original_adjustment_id INTEGER REFERENCES charge_adjustments(id),
  effective_on TEXT NOT NULL CHECK(length(effective_on)=10 AND date(effective_on,'+0 days') IS effective_on),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
  evidence_ref TEXT CHECK(evidence_ref IS NULL OR length(evidence_ref) <= 120),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  CHECK((kind='writeoff' AND original_adjustment_id IS NULL) OR
        (kind='reversal' AND original_adjustment_id IS NOT NULL))
);
CREATE INDEX charge_adjustments_charge_date ON charge_adjustments(charge_id,effective_on);
CREATE UNIQUE INDEX charge_adjustments_one_reversal ON charge_adjustments(original_adjustment_id)
  WHERE kind='reversal';

-- Reconciliation is chronological per tenancy; backdated entries could bypass
-- a later writeoff and manufacture a negative adjusted charge.
CREATE TRIGGER charge_adjustment_chronology_guard BEFORE INSERT ON charge_adjustments
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM charge_adjustments a JOIN charges old_charge ON old_charge.id=a.charge_id
    JOIN charges new_charge ON new_charge.id=NEW.charge_id
    WHERE old_charge.tenancy_id=new_charge.tenancy_id AND a.effective_on>NEW.effective_on
  ) THEN RAISE(ABORT,'backdated adjustment requires review') END;
END;

-- A writeoff can only cover this charge's unpaid FIFO remainder as of its effective date.
CREATE TRIGGER charge_adjustment_writeoff_guard BEFORE INSERT ON charge_adjustments
WHEN NEW.kind='writeoff'
BEGIN
  SELECT CASE WHEN NEW.amount_pence > COALESCE((
    WITH totals AS (
      SELECT charge_id,SUM(CASE kind WHEN 'writeoff' THEN amount_pence ELSE -amount_pence END) AS adjusted
      FROM charge_adjustments WHERE effective_on<=NEW.effective_on GROUP BY charge_id
    ), target AS (
      SELECT c.id,c.tenancy_id,c.due_on,c.amount-COALESCE(a.adjusted,0) AS effective
      FROM charges c LEFT JOIN totals a ON a.charge_id=c.id
      WHERE c.id=NEW.charge_id AND c.due_on<=NEW.effective_on
    ), prior AS (
      SELECT COALESCE(SUM(c.amount-COALESCE(a.adjusted,0)),0) AS effective
      FROM charges c JOIN target t ON t.tenancy_id=c.tenancy_id
      LEFT JOIN totals a ON a.charge_id=c.id
      WHERE c.due_on<=NEW.effective_on AND (c.due_on<t.due_on OR (c.due_on=t.due_on AND c.id<t.id))
    ), paid AS (
      SELECT COALESCE(SUM(p.amount),0) AS amount FROM payments p JOIN target t ON t.tenancy_id=p.tenancy_id
      WHERE p.kind='rent' AND p.received_on<=NEW.effective_on
    )
    SELECT max(0,t.effective-max(0,paid.amount-prior.effective)) FROM target t CROSS JOIN prior CROSS JOIN paid
  ),0) THEN RAISE(ABORT,'adjustment exceeds unpaid charge') END;
END;

CREATE TRIGGER charge_adjustment_reversal_guard BEFORE INSERT ON charge_adjustments
WHEN NEW.kind='reversal'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM charge_adjustments original WHERE original.id=NEW.original_adjustment_id
      AND original.kind='writeoff' AND original.charge_id=NEW.charge_id
      AND NEW.amount_pence<=original.amount_pence AND NEW.effective_on>=original.effective_on
  ) THEN RAISE(ABORT,'invalid adjustment reversal') END;
END;
-- SQLite REPLACE can delete a conflicting row without firing DELETE triggers
-- when recursive_triggers is off. Reject every unique collision before it can
-- replace immutable history, including an existing reversal for a writeoff.
CREATE TRIGGER charge_adjustment_immutable_insert BEFORE INSERT ON charge_adjustments
WHEN EXISTS (
  SELECT 1 FROM charge_adjustments a WHERE a.id=NEW.id OR a.operation_id=NEW.operation_id
    OR (NEW.kind='reversal' AND a.kind='reversal' AND a.original_adjustment_id=NEW.original_adjustment_id)
)
BEGIN SELECT RAISE(ABORT,'adjustment is immutable'); END;
CREATE TRIGGER charge_adjustment_immutable_update BEFORE UPDATE ON charge_adjustments
BEGIN SELECT RAISE(ABORT,'adjustment is immutable'); END;
CREATE TRIGGER charge_adjustment_immutable_delete BEFORE DELETE ON charge_adjustments
BEGIN SELECT RAISE(ABORT,'adjustment is immutable'); END;

-- A later reversal does not erase an earlier adjustment: lowering the charge
-- below its historical peak would invalidate that accounting entry.
CREATE TRIGGER finance_charge_adjustment_guard BEFORE UPDATE OF amount,tenancy_id,due_on ON charges
WHEN EXISTS(SELECT 1 FROM charge_adjustments WHERE charge_id=OLD.id)
BEGIN
  SELECT CASE WHEN NEW.tenancy_id<>OLD.tenancy_id OR
    NEW.amount<(SELECT COALESCE(MAX(running),0) FROM (
      SELECT SUM(CASE kind WHEN 'writeoff' THEN amount_pence ELSE -amount_pence END)
        OVER (ORDER BY effective_on,id ROWS UNBOUNDED PRECEDING) AS running
      FROM charge_adjustments WHERE charge_id=OLD.id)) OR
    NEW.due_on>(SELECT MIN(effective_on) FROM charge_adjustments WHERE charge_id=OLD.id)
    THEN RAISE(ABORT,'charge change conflicts with adjustments') END;
END;

CREATE TRIGGER finance_charge_insert AFTER INSERT ON charges BEGIN
  UPDATE tenancies SET financial_revision=financial_revision+1 WHERE id=NEW.tenancy_id;
END;
CREATE TRIGGER finance_charge_update AFTER UPDATE ON charges BEGIN
  UPDATE tenancies SET financial_revision=financial_revision+1 WHERE id IN (OLD.tenancy_id,NEW.tenancy_id);
END;
CREATE TRIGGER finance_charge_delete AFTER DELETE ON charges BEGIN
  UPDATE tenancies SET financial_revision=financial_revision+1 WHERE id=OLD.tenancy_id;
END;
CREATE TRIGGER finance_payment_insert AFTER INSERT ON payments BEGIN
  UPDATE tenancies SET financial_revision=financial_revision+1 WHERE id=NEW.tenancy_id;
END;
CREATE TRIGGER finance_payment_update AFTER UPDATE ON payments BEGIN
  UPDATE tenancies SET financial_revision=financial_revision+1 WHERE id IN (OLD.tenancy_id,NEW.tenancy_id);
END;
CREATE TRIGGER finance_payment_delete AFTER DELETE ON payments BEGIN
  UPDATE tenancies SET financial_revision=financial_revision+1 WHERE id=OLD.tenancy_id;
END;
CREATE TRIGGER finance_adjustment_insert AFTER INSERT ON charge_adjustments BEGIN
  UPDATE tenancies SET financial_revision=financial_revision+1 WHERE id=(SELECT tenancy_id FROM charges WHERE id=NEW.charge_id);
END;
