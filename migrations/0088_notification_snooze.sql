-- NOT-09 (NOT0809_INBOX_READY): Snooze an Inbox task. Additive: two optional columns and the task trigger replaced by
-- its version that also counts every accepted snooze as a task change (revision and history), even at the same time.
-- No row is rewritten.
-- A snooze holds while the task stays at the revision it set (snoozed_revision) and until snoozed_until: new context
-- from its source, Done or Reopen bump the revision and end it; an unchanged clock tick writes nothing and keeps it.
ALTER TABLE notifications ADD COLUMN snoozed_until TEXT;
ALTER TABLE notifications ADD COLUMN snoozed_revision INTEGER;

DROP TRIGGER notification_task_changed;
CREATE TRIGGER notification_task_changed AFTER UPDATE OF event_id,category,title,action_required,
  resolved_at,resolved_by,assigned_to,due_at,task_reason,source_version,urgency,closed_by_source,
  target_kind,target_id,target_context,target_deleted,snoozed_until,snoozed_revision ON notifications
WHEN OLD.task_key IS NOT NULL BEGIN
  UPDATE notifications SET revision=OLD.revision+1,
    closed_by_source=CASE WHEN NEW.resolved_at IS NULL THEN 0
      WHEN OLD.resolved_at IS NULL THEN CASE WHEN NEW.task_action='done' THEN 0 ELSE 1 END
      ELSE NEW.closed_by_source END
    WHERE id=NEW.id AND (OLD.event_id IS NOT NEW.event_id OR OLD.category IS NOT NEW.category
      OR OLD.title IS NOT NEW.title OR OLD.action_required IS NOT NEW.action_required
      OR OLD.resolved_at IS NOT NEW.resolved_at OR OLD.resolved_by IS NOT NEW.resolved_by
      OR OLD.assigned_to IS NOT NEW.assigned_to OR OLD.due_at IS NOT NEW.due_at
      OR OLD.task_reason IS NOT NEW.task_reason OR OLD.source_version IS NOT NEW.source_version
      OR OLD.urgency IS NOT NEW.urgency OR OLD.closed_by_source IS NOT NEW.closed_by_source
      OR OLD.target_kind IS NOT NEW.target_kind OR OLD.target_id IS NOT NEW.target_id
      OR OLD.target_context IS NOT NEW.target_context OR OLD.target_deleted IS NOT NEW.target_deleted
      OR OLD.snoozed_until IS NOT NEW.snoozed_until OR OLD.snoozed_revision IS NOT NEW.snoozed_revision);
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    SELECT NEW.id,revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      COALESCE(NEW.task_actor,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN NEW.resolved_by END,'system'),
      COALESCE(NEW.task_action,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN 'source_resolved' ELSE 'source_update' END)
    FROM notifications WHERE id=NEW.id AND revision>OLD.revision;
  UPDATE notifications SET task_actor=NULL,task_action=NULL WHERE id=NEW.id;
END;
