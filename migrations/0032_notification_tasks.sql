-- NOT-11: keep the shared notices and their IDs, adding coordination metadata.
CREATE TABLE notifications_next (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK(category IN ('new_applicant','viewing','matched','task')),
  title TEXT NOT NULL,
  action_required INTEGER NOT NULL CHECK(action_required IN (0,1)),
  created_at TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT,
  task_key TEXT UNIQUE,
  source_version INTEGER NOT NULL DEFAULT 0 CHECK(source_version >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  assigned_to TEXT,
  due_at TEXT,
  task_reason TEXT CHECK(task_reason IS NULL OR length(task_reason) <= 500),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','urgent')),
  closed_by_source INTEGER NOT NULL DEFAULT 0 CHECK(closed_by_source IN (0,1)),
  task_actor TEXT, task_action TEXT
);
INSERT INTO notifications_next(id,event_id,category,title,action_required,created_at,resolved_at,resolved_by,
  task_key,source_version,closed_by_source)
SELECT id,event_id,category,title,action_required,created_at,resolved_at,resolved_by,
  'legacy:' || id,event_id,CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_next RENAME TO notifications;
CREATE INDEX notifications_open ON notifications(resolved_at,category,created_at);
CREATE INDEX notifications_created ON notifications(created_at);
CREATE INDEX notifications_event ON notifications(event_id);
CREATE INDEX notifications_owner_due ON notifications(assigned_to,due_at) WHERE resolved_at IS NULL;

-- No backfilled history: existing domain events remain the record of what really happened.
CREATE TABLE notification_task_history (
  task_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  PRIMARY KEY(task_id,revision)
);
CREATE TABLE notification_task_operations (
  actor TEXT NOT NULL, operation_id TEXT NOT NULL,
  task_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  payload_hash TEXT NOT NULL, result_revision INTEGER NOT NULL,
  PRIMARY KEY(actor,operation_id)
);
CREATE TABLE notification_reads (
  admin TEXT NOT NULL REFERENCES admins(email) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  read_revision INTEGER NOT NULL CHECK(read_revision >= 1),
  PRIMARY KEY(admin,notification_id)
);
CREATE TABLE notification_preferences (
  admin TEXT PRIMARY KEY REFERENCES admins(email) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  feed_categories TEXT NOT NULL CHECK(json_valid(feed_categories) AND json_type(feed_categories)='array')
);

-- The parent statement's changes()/last_insert_rowid() are restored after SQLite triggers.
-- The insert trigger also covers unchanged legacy producers without adding extra domain events.
CREATE TRIGGER notification_task_created AFTER INSERT ON notifications BEGIN
  UPDATE notifications SET task_key=COALESCE(NEW.task_key,'legacy:' || NEW.id),
    source_version=CASE WHEN NEW.source_version=0 THEN NEW.event_id ELSE NEW.source_version END,
    task_actor=NULL,task_action=NULL WHERE id=NEW.id;
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    VALUES(NEW.id,1,NEW.created_at,COALESCE(NEW.task_actor,(SELECT actor FROM events WHERE id=NEW.event_id),'system'),'created');
END;

CREATE TRIGGER notification_task_changed AFTER UPDATE OF event_id,category,title,action_required,
  resolved_at,resolved_by,assigned_to,due_at,task_reason,source_version,urgency,closed_by_source ON notifications
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
      OR OLD.urgency IS NOT NEW.urgency OR OLD.closed_by_source IS NOT NEW.closed_by_source);
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    SELECT NEW.id,revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      COALESCE(NEW.task_actor,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN NEW.resolved_by END,'system'),
      COALESCE(NEW.task_action,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN 'source_resolved' ELSE 'source_update' END)
    FROM notifications WHERE id=NEW.id AND revision>OLD.revision;
  UPDATE notifications SET task_actor=NULL,task_action=NULL WHERE id=NEW.id;
END;
