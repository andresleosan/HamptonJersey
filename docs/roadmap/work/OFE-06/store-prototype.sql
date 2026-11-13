-- DISCONNECTED EXPERIMENT, NOT A MIGRATION. For disposable D1 fixtures only.
-- Source identity provisioning, retention and schema readiness are unresolved.
CREATE TABLE ofe06_sale_sources (
  sale_id INTEGER PRIMARY KEY REFERENCES sales(id),
  generation TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  UNIQUE(sale_id,generation)
);
CREATE TRIGGER ofe06_source_no_replace BEFORE INSERT ON ofe06_sale_sources
WHEN EXISTS(SELECT 1 FROM ofe06_sale_sources WHERE sale_id=NEW.sale_id OR generation=NEW.generation)
BEGIN SELECT RAISE(ABORT,'source identity exists'); END;
CREATE TRIGGER ofe06_source_no_rewind BEFORE UPDATE ON ofe06_sale_sources
WHEN NEW.sale_id<>OLD.sale_id OR NEW.generation<>OLD.generation OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'source identity or revision changed'); END;
CREATE TRIGGER ofe06_source_no_delete BEFORE DELETE ON ofe06_sale_sources
BEGIN SELECT RAISE(ABORT,'source retention not decided'); END;
CREATE TRIGGER ofe06_sale_changed AFTER UPDATE ON sales BEGIN
  UPDATE ofe06_sale_sources SET revision=revision+1 WHERE sale_id=NEW.id;
END;
CREATE TRIGGER ofe06_milestone_inserted AFTER INSERT ON sale_milestones BEGIN
  UPDATE ofe06_sale_sources SET revision=revision+1 WHERE sale_id=NEW.sale_id;
END;
CREATE TRIGGER ofe06_milestone_changed AFTER UPDATE ON sale_milestones BEGIN
  UPDATE ofe06_sale_sources SET revision=revision+1 WHERE sale_id IN (OLD.sale_id,NEW.sale_id);
END;
CREATE TRIGGER ofe06_milestone_deleted AFTER DELETE ON sale_milestones BEGIN
  UPDATE ofe06_sale_sources SET revision=revision+1 WHERE sale_id=OLD.sale_id;
END;
CREATE TABLE ofe06_followups (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL,
  generation TEXT NOT NULL,
  week_start TEXT NOT NULL,
  scheduled_due_at TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK(source_revision BETWEEN 1 AND 9007199254740991),
  task_id INTEGER NOT NULL UNIQUE REFERENCES notifications(id),
  event_id INTEGER NOT NULL UNIQUE REFERENCES events(id),
  status TEXT NOT NULL CHECK(status IN ('open','source_closed')),
  UNIQUE(sale_id,week_start),
  FOREIGN KEY(sale_id,generation) REFERENCES ofe06_sale_sources(sale_id,generation)
);
-- WITHOUT ROWID preserves last_insert_rowid() of the immediately preceding event.
CREATE TABLE ofe06_pending (
  operation_id TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id)
) WITHOUT ROWID;
CREATE TABLE ofe06_batch_assertions (
  operation_id TEXT PRIMARY KEY,
  valid INTEGER NOT NULL CHECK(valid=1)
) WITHOUT ROWID;
