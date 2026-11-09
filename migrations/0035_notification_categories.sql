-- NOT-08: preserve shared task identity, history, receipts and preferences.

-- D1 applies this rebuild transactionally; keep FK enforcement enabled.

PRAGMA defer_foreign_keys=ON;

CREATE TABLE not08_integrity_guard(n INTEGER NOT NULL CHECK(n=0));

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM pragma_foreign_key_check;

CREATE TABLE not08_notifications_backup AS SELECT * FROM notifications;

CREATE TABLE not08_notification_task_history_backup AS SELECT * FROM notification_task_history;

CREATE TABLE not08_notification_task_operations_backup AS SELECT * FROM notification_task_operations;

CREATE TABLE not08_notification_reads_backup AS SELECT * FROM notification_reads;

CREATE TABLE not08_notification_observations_backup AS SELECT * FROM notification_observations;

DROP TRIGGER "notification_applicant_deleted";

DROP TRIGGER "notification_check_deleted";

DROP TRIGGER "notification_contact_deleted";

DROP TRIGGER "notification_event_feed";

DROP TRIGGER "notification_listing_deleted";

DROP TRIGGER "notification_milestone_deleted";

DROP TRIGGER "notification_offer_deleted";

DROP TRIGGER "notification_payment_deleted";

DROP TRIGGER "notification_rental_deleted";

DROP TRIGGER "notification_repair_deleted";

DROP TRIGGER "notification_sale_deleted";

DROP TRIGGER "notification_task_changed";

DROP TRIGGER "notification_task_created";

DROP TRIGGER "notification_tenancy_deleted";

DROP TRIGGER "notification_viewing_deleted";

DROP VIEW notification_event_projection;

DROP TABLE notifications;

CREATE TABLE "notifications" (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK(category IN ('new_applicant','viewing','matched','task','agency_reply','message','compliance')),
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
, target_kind TEXT CHECK(target_kind IS NULL OR target_kind IN ('applicant','contact','viewing','listing','offer','sale','rental','payment','collection')), target_id TEXT, target_context TEXT CHECK(target_context IS NULL OR (json_valid(target_context) AND json_type(target_context)='object')), target_deleted INTEGER NOT NULL DEFAULT 0 CHECK(target_deleted IN (0,1)));

INSERT INTO notifications SELECT * FROM not08_notifications_backup;

INSERT INTO notification_task_history SELECT * FROM not08_notification_task_history_backup;

INSERT INTO notification_task_operations SELECT * FROM not08_notification_task_operations_backup;

INSERT INTO notification_reads SELECT * FROM not08_notification_reads_backup;

INSERT INTO notification_observations SELECT * FROM not08_notification_observations_backup;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM notifications EXCEPT SELECT * FROM not08_notifications_backup);

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM not08_notifications_backup EXCEPT SELECT * FROM notifications);

DROP TABLE not08_notifications_backup;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM notification_task_history EXCEPT SELECT * FROM not08_notification_task_history_backup);

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM not08_notification_task_history_backup EXCEPT SELECT * FROM notification_task_history);

DROP TABLE not08_notification_task_history_backup;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM notification_task_operations EXCEPT SELECT * FROM not08_notification_task_operations_backup);

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM not08_notification_task_operations_backup EXCEPT SELECT * FROM notification_task_operations);

DROP TABLE not08_notification_task_operations_backup;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM notification_reads EXCEPT SELECT * FROM not08_notification_reads_backup);

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM not08_notification_reads_backup EXCEPT SELECT * FROM notification_reads);

DROP TABLE not08_notification_reads_backup;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM notification_observations EXCEPT SELECT * FROM not08_notification_observations_backup);

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM (SELECT * FROM not08_notification_observations_backup EXCEPT SELECT * FROM notification_observations);

DROP TABLE not08_notification_observations_backup;

CREATE INDEX notifications_created ON notifications(created_at);

CREATE INDEX notifications_event ON notifications(event_id);

CREATE INDEX notifications_open ON notifications(resolved_at,category,created_at);

CREATE INDEX notifications_owner_due ON notifications(assigned_to,due_at) WHERE resolved_at IS NULL;

CREATE INDEX notifications_source_cursor ON notifications(source_version,id);

CREATE INDEX notifications_target ON notifications(target_kind,target_id);

CREATE VIEW notification_event_projection AS
SELECT e.id,e.at,e.actor,
  CASE WHEN e.entity_type='applicant' AND e.type LIKE 'offer.%' THEN 'offer'
    WHEN e.entity_type='applicant' AND e.type LIKE 'sale.%' THEN 'sale' ELSE e.entity_type END AS target_kind,
  CASE WHEN e.entity_type='applicant' AND e.type LIKE 'offer.%' THEN CAST(json_extract(e.data,'$.offer_id') AS TEXT)
    WHEN e.entity_type='applicant' AND e.type LIKE 'sale.%' THEN CAST(json_extract(e.data,'$.sale_id') AS TEXT) ELSE e.entity_id END AS target_id,
  CASE WHEN e.entity_type='applicant' AND e.type='sale.milestone' THEN json_object('milestone',json_extract(e.data,'$.key'))
    WHEN e.entity_type='rental' THEN json_patch('{}',json_object(
    'tenancy_id',json_extract(e.data,'$.tenancy_id'),'repair_id',json_extract(e.data,'$.repair_id'),
    'compliance_kind',json_extract(e.data,'$.compliance_kind'))) END AS target_context,
  CASE WHEN e.type='compliance.updated' AND e.entity_type='rental' THEN 'compliance' WHEN e.entity_type='viewing' THEN 'viewing' ELSE 'task' END AS category,
  CASE e.type
    WHEN 'viewing.booked' THEN 'Viewing booked' WHEN 'viewing.confirmed' THEN 'Viewing confirmed'
    WHEN 'viewing.rescheduled' THEN 'Viewing rescheduled' WHEN 'viewing.cancelled' THEN 'Viewing cancelled'
    WHEN 'viewing.completed' THEN 'Viewing completed' WHEN 'viewing.no_show' THEN 'Viewing missed'
    WHEN 'offer.recorded' THEN 'Offer recorded' WHEN 'offer.updated' THEN 'Offer updated'
    WHEN 'offer.countered' THEN 'Offer countered' WHEN 'offer.rejected' THEN 'Offer rejected'
    WHEN 'offer.withdrawn' THEN 'Offer withdrawn' WHEN 'offer.accepted' THEN 'Offer accepted'
    WHEN 'sale.updated' THEN 'Sale updated' WHEN 'sale.milestone' THEN 'Sale milestone updated'
    WHEN 'sale.completed' THEN 'Sale completed' WHEN 'sale.fallen_through' THEN 'Sale fell through'
    WHEN 'listing.review_requested' THEN 'Property ready for review' WHEN 'listing.review_returned' THEN 'Property returned to draft' WHEN 'listing.created' THEN 'Property created' WHEN 'listing.updated' THEN 'Property updated'
    WHEN 'listing.published' THEN 'Property published' WHEN 'listing.unpublished' THEN 'Property unpublished'
    WHEN 'listing.archived' THEN 'Property archived' WHEN 'listing.restored' THEN 'Property restored'
    WHEN 'listing.confirmed' THEN 'Property confirmed' WHEN 'listing.availability_changed' THEN 'Property availability changed'
    WHEN 'listing.featured_changed' THEN 'Featured property changed' WHEN 'listing.cover_changed' THEN 'Property cover changed'
    WHEN 'listing.recalculated' THEN 'Property recalculated' WHEN 'listing.deleted' THEN 'Property deleted'
    WHEN 'payment.recorded' THEN 'Payment recorded' WHEN 'payment.updated' THEN 'Payment updated'
    WHEN 'payments.imported' THEN 'Payments imported' WHEN 'rental.created' THEN 'Rental created'
    WHEN 'rental.updated' THEN 'Rental updated' WHEN 'rental.archived' THEN 'Rental archived'
    WHEN 'rental.restored' THEN 'Rental restored' WHEN 'tenancy.created' THEN 'Tenancy created'
    WHEN 'tenancy.updated' THEN 'Tenancy updated' WHEN 'tenancy.renewed' THEN 'Tenancy renewed'
    WHEN 'tenancy.ended' THEN 'Tenancy ended' WHEN 'tenancy.end_cancelled' THEN 'Tenancy end cancelled'
    WHEN 'rent.changed' THEN 'Rent changed' WHEN 'notice.recorded' THEN 'Notice recorded'
    WHEN 'arrears.step_done' THEN 'Arrears step completed' WHEN 'charge.edited' THEN 'Charge edited'
    WHEN 'compliance.updated' THEN 'Compliance updated' WHEN 'repair.created' THEN 'Repair reported'
    WHEN 'repair.updated' THEN 'Repair updated' END AS title,
  e.type='listing.deleted' AS target_deleted
FROM events e
WHERE (e.entity_type='viewing' AND e.type IN ('viewing.booked','viewing.confirmed','viewing.rescheduled','viewing.cancelled','viewing.completed','viewing.no_show'))
 OR (e.entity_type='applicant' AND (e.type IN ('offer.recorded','offer.updated','offer.countered','offer.rejected','offer.withdrawn','offer.accepted')
   AND EXISTS(SELECT 1 FROM offers WHERE id=json_extract(e.data,'$.offer_id') AND applicant_id=e.entity_id)
   OR e.type IN ('sale.updated','sale.milestone','sale.completed','sale.fallen_through')
   AND EXISTS(SELECT 1 FROM sales WHERE id=json_extract(e.data,'$.sale_id') AND applicant_id=e.entity_id)
   AND (e.type<>'sale.milestone' OR (json_extract(e.data,'$.key') IN ('lawyers','due_diligence','questionnaire','searches','mortgage','contract','funds','passing','settled')
     AND EXISTS(SELECT 1 FROM sale_milestones WHERE sale_id=json_extract(e.data,'$.sale_id') AND key=json_extract(e.data,'$.key'))))))
 OR (e.entity_type='listing' AND e.type IN ('listing.review_requested','listing.review_returned','listing.created','listing.updated','listing.published','listing.unpublished','listing.archived','listing.restored','listing.confirmed','listing.availability_changed','listing.featured_changed','listing.cover_changed','listing.recalculated','listing.deleted'))
 OR (e.rental_event_id IS NOT NULL AND e.entity_type IN ('rental','payment','collection'));

CREATE TRIGGER notification_applicant_deleted AFTER DELETE ON applicants BEGIN
  UPDATE notifications SET title='Deleted applicant',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='applicant' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type='applicant' AND entity_id=CAST(OLD.id AS TEXT));
END;

CREATE TRIGGER notification_check_deleted AFTER DELETE ON compliance_items BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.compliance_kind')=OLD.kind);
  UPDATE notifications SET title='Deleted check',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.compliance_kind')=OLD.kind;
END;

CREATE TRIGGER notification_contact_deleted AFTER DELETE ON contacts BEGIN
  UPDATE notifications SET title='Deleted applicant',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='contact' AND target_id=CAST(OLD.id AS TEXT)) OR event_id IN(SELECT id FROM events WHERE entity_type='contact' AND entity_id=CAST(OLD.id AS TEXT));
END;

CREATE TRIGGER notification_event_feed AFTER INSERT ON events BEGIN
  INSERT INTO notifications(task_key,event_id,source_version,category,title,action_required,created_at,
    target_kind,target_id,target_context,target_deleted)
    SELECT 'event:'||id,id,id,category,title,0,at,target_kind,target_id,target_context,target_deleted
    FROM notification_event_projection WHERE id=NEW.id;
END;

CREATE TRIGGER notification_listing_deleted AFTER DELETE ON listings BEGIN
  DELETE FROM notification_observations WHERE target_kind='listing' AND target_id=OLD.id;
  UPDATE notifications SET title='Deleted property',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='listing' AND target_id=OLD.id) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type='listing' AND entity_id=OLD.id));
END;

CREATE TRIGGER notification_milestone_deleted AFTER DELETE ON sale_milestones BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='sale' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,'$.milestone')=OLD.key);
  UPDATE notifications SET title='Deleted milestone',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='sale' AND target_id=CAST(OLD.sale_id AS TEXT) AND json_extract(target_context,'$.milestone')=OLD.key;
END;

CREATE TRIGGER notification_offer_deleted AFTER DELETE ON offers BEGIN
  DELETE FROM notification_observations WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted offer',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='offer' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_payment_deleted AFTER DELETE ON payments BEGIN
  DELETE FROM notification_observations WHERE target_kind='payment' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted payment',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='payment' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_rental_deleted AFTER DELETE ON rentals BEGIN
  DELETE FROM notification_observations WHERE target_kind='rental' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted rental',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_repair_deleted AFTER DELETE ON repairs BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.repair_id')=OLD.id);
  UPDATE notifications SET title='Deleted repair',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.repair_id')=OLD.id;
END;

CREATE TRIGGER notification_sale_deleted AFTER DELETE ON sales BEGIN
  DELETE FROM notification_observations WHERE target_kind='sale' AND target_id=CAST(OLD.id AS TEXT);
  UPDATE notifications SET title='Deleted sale',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='sale' AND target_id=CAST(OLD.id AS TEXT);
END;

CREATE TRIGGER notification_task_changed AFTER UPDATE OF event_id,category,title,action_required,
  resolved_at,resolved_by,assigned_to,due_at,task_reason,source_version,urgency,closed_by_source,
  target_kind,target_id,target_context,target_deleted ON notifications
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
      OR OLD.target_context IS NOT NEW.target_context OR OLD.target_deleted IS NOT NEW.target_deleted);
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    SELECT NEW.id,revision,strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      COALESCE(NEW.task_actor,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN NEW.resolved_by END,'system'),
      COALESCE(NEW.task_action,CASE WHEN OLD.resolved_at IS NULL AND NEW.resolved_at IS NOT NULL THEN 'source_resolved' ELSE 'source_update' END)
    FROM notifications WHERE id=NEW.id AND revision>OLD.revision;
  UPDATE notifications SET task_actor=NULL,task_action=NULL WHERE id=NEW.id;
END;

CREATE TRIGGER notification_task_created AFTER INSERT ON notifications BEGIN
  UPDATE notifications SET task_key=COALESCE(NEW.task_key,'legacy:' || NEW.id),
    source_version=CASE WHEN NEW.source_version=0 THEN NEW.event_id ELSE NEW.source_version END,
    task_actor=NULL,task_action=NULL WHERE id=NEW.id;
  INSERT INTO notification_task_history(task_id,revision,at,actor,action)
    VALUES(NEW.id,1,NEW.created_at,COALESCE(NEW.task_actor,(SELECT actor FROM events WHERE id=NEW.event_id),'system'),'created');
END;

CREATE TRIGGER notification_tenancy_deleted AFTER DELETE ON tenancies BEGIN
  DELETE FROM notification_observations WHERE task_key IN(SELECT task_key FROM notifications
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.tenancy_id')=OLD.id);
  UPDATE notifications SET title='Deleted tenancy',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE target_kind='rental' AND target_id=CAST(OLD.rental_id AS TEXT) AND json_extract(target_context,'$.tenancy_id')=OLD.id;
END;

CREATE TRIGGER notification_viewing_deleted AFTER DELETE ON viewing_requests BEGIN
  UPDATE notifications SET title='Deleted viewing request',task_reason=NULL,target_context=NULL,target_kind=NULL,target_id=NULL,target_deleted=1,
    resolved_at=COALESCE(resolved_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1
    WHERE (target_kind='viewing' AND target_id=CAST(OLD.id AS TEXT)) OR (target_kind IS NULL AND event_id IN(SELECT id FROM events WHERE entity_type='viewing' AND entity_id=CAST(OLD.id AS TEXT)));
END;

INSERT INTO not08_integrity_guard SELECT COUNT(*) FROM pragma_foreign_key_check;

DROP TABLE not08_integrity_guard;

PRAGMA defer_foreign_keys=OFF;
