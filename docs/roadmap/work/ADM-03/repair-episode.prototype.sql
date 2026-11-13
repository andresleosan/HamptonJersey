-- DISCONNECTED PROTOTYPE: not a migration, not authorization, not used by the clock.
-- ?1 repair id, ?2 rental id. A result is only a structural candidate; it does not
-- close, create, reopen, project or authorize a task.
WITH requested AS (
  SELECT CASE WHEN typeof(?1) IN ('real','integer') AND ?1=CAST(?1 AS INTEGER)
      AND ?1 BETWEEN 1 AND 9007199254740991 THEN CAST(?1 AS INTEGER) END AS repair_id,
    CASE WHEN typeof(?2) IN ('real','integer') AND ?2=CAST(?2 AS INTEGER)
      AND ?2 BETWEEN 1 AND 9007199254740991 THEN CAST(?2 AS INTEGER) END AS rental_id
), keys AS (
  SELECT *, 'queue:repair:'||repair_id||':current' AS legacy,
    'queue:repair:'||repair_id||':rental:'||rental_id AS scoped FROM requested
), chosen AS (
  SELECT *,CASE WHEN NOT EXISTS (SELECT 1 FROM notifications n WHERE n.task_key=legacy)
    OR EXISTS (SELECT 1 FROM notifications n WHERE n.task_key=legacy AND n.target_deleted=0
      AND n.target_kind='rental' AND n.target_id=CAST(rental_id AS TEXT)
      AND json_extract(n.target_context,'$.repair_id')=repair_id)
    THEN legacy ELSE scoped END AS candidate FROM keys
)
SELECT candidate AS task_key,
  EXISTS(SELECT 1 FROM notification_observations o WHERE o.kind='repair' AND o.entity_id=CAST(repair_id AS TEXT)
    AND o.active=1 AND o.task_key<>candidate) AS other_active,
  (repair_id IS NULL OR rental_id IS NULL
    OR EXISTS(SELECT 1 FROM notifications n WHERE n.task_key=legacy AND NOT COALESCE(
      n.target_deleted=0 AND n.target_kind='rental' AND CAST(CAST(n.target_id AS INTEGER) AS TEXT)=n.target_id
      AND CAST(n.target_id AS INTEGER)>0 AND json_extract(n.target_context,'$.repair_id')=repair_id,0))
    OR EXISTS(SELECT 1 FROM notifications n WHERE n.task_key=candidate AND NOT COALESCE(
      n.target_deleted=0 AND n.target_kind='rental' AND n.target_id=CAST(rental_id AS TEXT)
      AND json_extract(n.target_context,'$.repair_id')=repair_id,0))
    OR EXISTS(SELECT 1 FROM notifications n WHERE n.task_key IN (legacy,candidate) AND NOT EXISTS (
      SELECT 1 FROM notification_observations o WHERE o.task_key=n.task_key AND o.kind='repair'
        AND o.entity_id=CAST(repair_id AS TEXT) AND o.target_kind='rental' AND o.target_id=n.target_id
        AND o.event_id=n.event_id AND o.cycle=CASE WHEN n.task_key=legacy THEN 'current' ELSE 'rental:'||n.target_id END
    ))) AS identity_conflict,
  EXISTS(SELECT 1 FROM notification_observations o WHERE o.task_key=candidate) AS previously_observed
FROM chosen
