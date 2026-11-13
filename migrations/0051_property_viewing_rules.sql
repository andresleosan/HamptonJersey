-- Provisional VIS-10 foundation, dormant until a scoped authorization owner,
-- audited writer and the access-evidence producer are integrated. No routes or
-- existing reservation paths read these tables. No private text is stored here.
CREATE TABLE property_viewing_rule_ids (
  id TEXT NOT NULL PRIMARY KEY
) WITHOUT ROWID;
CREATE TRIGGER property_rule_ids_no_delete BEFORE DELETE ON property_viewing_rule_ids
BEGIN SELECT RAISE(ABORT,'Rule identity cannot be reused'); END;
CREATE TRIGGER property_rule_ids_no_update BEFORE UPDATE ON property_viewing_rule_ids
BEGIN SELECT RAISE(ABORT,'Rule identity cannot be reused'); END;
CREATE TABLE property_viewing_rules (
  id TEXT NOT NULL PRIMARY KEY CHECK(length(id)=36 AND id NOT GLOB '*[^0-9a-f-]*'
    AND substr(id,9,1)='-' AND substr(id,14,1)='-' AND substr(id,19,1)='-' AND substr(id,24,1)='-'),
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK(operation IN ('sale','rent','business')),
  revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991),
  state TEXT NOT NULL CHECK(state IN ('active','revoked')),
  notice_hours INTEGER NOT NULL CHECK(typeof(notice_hours)='integer' AND notice_hours BETWEEN 0 AND 168),
  UNIQUE(listing_id,operation)
);
CREATE TRIGGER property_rules_initial BEFORE INSERT ON property_viewing_rules
WHEN NEW.revision IS NOT 1 OR NEW.state IS NOT 'active'
 OR EXISTS(SELECT 1 FROM property_viewing_rule_ids WHERE id=NEW.id)
 OR EXISTS(SELECT 1 FROM property_viewing_rules WHERE listing_id=NEW.listing_id AND operation=NEW.operation)
 OR NOT EXISTS(SELECT 1 FROM listings WHERE id=NEW.listing_id AND operation=NEW.operation AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Invalid property viewing rule'); END;
CREATE TRIGGER property_rules_remember_id AFTER INSERT ON property_viewing_rules
BEGIN INSERT INTO property_viewing_rule_ids(id) VALUES(NEW.id); END;
CREATE TRIGGER property_rules_version BEFORE UPDATE ON property_viewing_rules
WHEN NEW.id IS NOT OLD.id OR NEW.listing_id IS NOT OLD.listing_id OR NEW.operation IS NOT OLD.operation
 OR NEW.revision IS NOT OLD.revision+1 OR (OLD.state='revoked' AND NEW.state IS NOT 'revoked')
BEGIN SELECT RAISE(ABORT,'Invalid property viewing rule revision'); END;

CREATE TABLE property_viewing_rule_negotiators (
  rule_id TEXT NOT NULL REFERENCES property_viewing_rules(id) ON DELETE CASCADE,
  negotiator_id INTEGER NOT NULL REFERENCES negotiators(id) ON DELETE CASCADE,
  PRIMARY KEY(rule_id,negotiator_id)
) WITHOUT ROWID;
CREATE TRIGGER property_rule_member_initial BEFORE INSERT ON property_viewing_rule_negotiators
WHEN NOT EXISTS(SELECT 1 FROM property_viewing_rules WHERE id=NEW.rule_id AND state='active')
 OR NOT EXISTS(SELECT 1 FROM negotiators WHERE id=NEW.negotiator_id AND active=1)
BEGIN SELECT RAISE(ABORT,'Invalid property viewing negotiator'); END;
CREATE TRIGGER property_rule_member_immutable BEFORE UPDATE ON property_viewing_rule_negotiators
BEGIN SELECT RAISE(ABORT,'Replace property viewing negotiator instead'); END;
CREATE TRIGGER property_rule_member_added AFTER INSERT ON property_viewing_rule_negotiators
BEGIN UPDATE property_viewing_rules SET revision=revision+1 WHERE id=NEW.rule_id; END;
CREATE TRIGGER property_rule_member_removed AFTER DELETE ON property_viewing_rule_negotiators
BEGIN UPDATE property_viewing_rules SET revision=revision+1 WHERE id=OLD.rule_id; END;
CREATE TRIGGER property_rule_negotiator_changed AFTER UPDATE OF active ON negotiators
WHEN NEW.active IS NOT OLD.active
BEGIN
  UPDATE property_viewing_rules SET revision=revision+1 WHERE state='active'
    AND id IN (SELECT rule_id FROM property_viewing_rule_negotiators WHERE negotiator_id=NEW.id);
END;
-- A listing operation change or archival invalidates, rather than transfers,
-- old rules. Returning to the old operation never silently re-enables them.
CREATE TRIGGER property_rule_listing_scope_changed AFTER UPDATE OF operation,archived_at ON listings
WHEN NEW.operation IS NOT OLD.operation OR NEW.archived_at IS NOT OLD.archived_at
BEGIN
  UPDATE property_viewing_rules SET state='revoked',revision=revision+1 WHERE listing_id=NEW.id AND state='active';
END;
