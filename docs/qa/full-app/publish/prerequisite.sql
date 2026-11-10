-- Proposed one-row QA prerequisite only. Not authorized for remote execution yet.
-- Destination: hampton-app-qa / 53bc4af9-7250-44fe-8f90-6e415fda1034.
-- No schema changes, overwrites or deletion; safe only after exact destination preflight.
SELECT json(CASE WHEN EXISTS(
  SELECT 1 FROM qa_app_guard WHERE id=1 AND marker='hampton-app-qa-v1'
    AND database_id='53bc4af9-7250-44fe-8f90-6e415fda1034' AND fixture_version=1
) THEN '{}' ELSE 'Not the expected full-app QA fixture' END);
INSERT INTO notification_cursor(key,revision,after_key,observed_at)
SELECT 'queues',0,'','' WHERE EXISTS(
  SELECT 1 FROM qa_app_guard WHERE id=1 AND marker='hampton-app-qa-v1'
    AND database_id='53bc4af9-7250-44fe-8f90-6e415fda1034' AND fixture_version=1
) ON CONFLICT(key) DO NOTHING;
