-- EST-09: search activity is independent of commercial stage. No historical success is inferred.
ALTER TABLE applicants ADD COLUMN search_state TEXT NOT NULL DEFAULT 'active'
  CHECK (search_state IN ('active', 'resolved', 'needs_review'));
ALTER TABLE applicants ADD COLUMN resolved_at TEXT;
ALTER TABLE applicants ADD COLUMN resolved_by TEXT;
ALTER TABLE applicants ADD COLUMN resolution_reason TEXT CHECK (
  (search_state = 'resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL
    AND length(trim(resolved_by)) > 0 AND resolution_reason IS NOT NULL AND length(trim(resolution_reason)) BETWEEN 1 AND 200)
  OR (search_state <> 'resolved' AND resolved_at IS NULL AND resolved_by IS NULL AND resolution_reason IS NULL));

UPDATE applicants SET search_state = 'needs_review' WHERE archived_at IS NOT NULL OR stage IN ('lost', 'completed');
-- Existing duplicates are all preserved for a person to decide which search to activate.
UPDATE applicants SET search_state = 'needs_review' WHERE search_state = 'active' AND (contact_id, operation) IN (
  SELECT contact_id, operation FROM applicants WHERE search_state = 'active' GROUP BY contact_id, operation HAVING COUNT(*) > 1);
CREATE UNIQUE INDEX applicants_active_operation ON applicants(contact_id, operation)
  WHERE search_state = 'active' AND archived_at IS NULL;
DROP INDEX applicants_queue;
CREATE INDEX applicants_queue ON applicants(created_at) WHERE archived_at IS NULL AND search_state = 'active';

-- Legacy closed searches wait for review, rather than leaving work notices that imply they are active.
UPDATE notifications SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), resolved_by = 'system'
  WHERE resolved_at IS NULL AND category IN ('new_applicant', 'matched') AND event_id IN (
    SELECT e.id FROM events e JOIN applicants a ON e.entity_type = 'applicant' AND e.entity_id = CAST(a.id AS TEXT)
    WHERE a.search_state = 'needs_review');
