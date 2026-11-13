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
), related_tasks AS (
  -- Intentionally conservative: malformed keys or contexts need reconciliation too.
  -- This context search is NOT indexed/bounded and must not enter the runtime.
  SELECT n.* FROM notifications n CROSS JOIN chosen c
  WHERE n.task_key=c.legacy OR n.task_key GLOB ('queue:repair:'||c.repair_id||':rental:*')
    OR CAST(json_extract(n.target_context,'$.repair_id') AS INTEGER)=c.repair_id
), assessed AS (
  SELECT c.*,
    EXISTS(SELECT 1 FROM notification_observations o WHERE o.kind='repair' AND o.entity_id=CAST(c.repair_id AS TEXT)
      AND o.active=1 AND o.task_key<>c.candidate) AS other_active,
    (EXISTS(SELECT 1 FROM related_tasks n WHERE n.task_key<>c.candidate)
      OR EXISTS(SELECT 1 FROM notification_observations o WHERE o.kind='repair'
        AND o.entity_id=CAST(c.repair_id AS TEXT) AND o.task_key<>c.candidate)) AS other_episode,
    (c.repair_id IS NULL OR c.rental_id IS NULL
      OR EXISTS(SELECT 1 FROM related_tasks n WHERE NOT COALESCE(
        n.target_deleted=0 AND n.target_kind='rental' AND CAST(CAST(n.target_id AS INTEGER) AS TEXT)=n.target_id
        AND CAST(n.target_id AS INTEGER) BETWEEN 1 AND 9007199254740991
        AND json_type(n.target_context,'$.repair_id')='integer' AND json_extract(n.target_context,'$.repair_id')=c.repair_id
        AND (n.task_key=c.legacy OR n.task_key='queue:repair:'||c.repair_id||':rental:'||n.target_id)
        AND EXISTS (SELECT 1 FROM notification_observations o WHERE o.task_key=n.task_key AND o.kind='repair'
          AND o.entity_id=CAST(c.repair_id AS TEXT) AND o.target_kind='rental' AND o.target_id=n.target_id
          AND o.event_id=n.event_id AND o.cycle=CASE WHEN n.task_key=c.legacy THEN 'current' ELSE 'rental:'||n.target_id END),0))
      OR EXISTS(SELECT 1 FROM notification_observations o WHERE o.kind='repair'
        AND o.entity_id=CAST(c.repair_id AS TEXT) AND NOT EXISTS(SELECT 1 FROM related_tasks n WHERE n.task_key=o.task_key))) AS identity_conflict,
    EXISTS(SELECT 1 FROM notification_observations o WHERE o.task_key=c.candidate) AS previously_observed
  FROM chosen c
)
-- Even a closed other episode requires separate verified reconciliation; none is implemented here.
SELECT CASE WHEN other_active=1 OR other_episode=1 OR identity_conflict=1 THEN NULL ELSE candidate END AS task_key,
  other_active,other_episode,identity_conflict,previously_observed
FROM assessed
