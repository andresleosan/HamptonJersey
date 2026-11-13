-- BUS-10 foundation. BUS-06 observations and sources remain the capture authority.
-- This migration installs no route, data, source access, merge, or retention policy.
CREATE TABLE market_properties (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  status TEXT NOT NULL DEFAULT 'provisional' CHECK(status='provisional'),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
) WITHOUT ROWID;

-- A source-scoped publication is not proof of a physical unit. Scope is
-- derived from its anchor observation, rather than copying a source key.
CREATE TABLE market_listings (
  id TEXT PRIMARY KEY,
  anchor_observation_id TEXT NOT NULL REFERENCES market_observations(id),
  operation TEXT NOT NULL CHECK(operation IN ('sale','rent','business')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE(anchor_observation_id,operation)
) WITHOUT ROWID;
CREATE TRIGGER market_identity_publication_scope BEFORE INSERT ON market_listings
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM market_observations o WHERE o.id=NEW.anchor_observation_id
    AND o.deleted_tombstone=0 AND json_extract(o.normalized_json,'$.operation')=NEW.operation)
  THEN RAISE(ABORT, 'identity publication scope mismatch') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM market_observations incoming
    JOIN market_observations anchor ON anchor.source_ref=incoming.source_ref AND anchor.channel_id=incoming.channel_id
      AND anchor.external_key=incoming.external_key
    JOIN market_listings l ON l.anchor_observation_id=anchor.id AND l.operation=NEW.operation
    WHERE incoming.id=NEW.anchor_observation_id)
  THEN RAISE(ABORT, 'identity publication scope exists') END;
END;

-- Each observation initially has its own provisional physical identity. No
-- automatic cross-observation physical association is made by this table.
CREATE TABLE market_identity_observations (
  observation_id TEXT PRIMARY KEY REFERENCES market_observations(id),
  property_id TEXT NOT NULL UNIQUE REFERENCES market_properties(id),
  publication_id TEXT NOT NULL REFERENCES market_listings(id),
  linked_at TEXT NOT NULL,
  UNIQUE(observation_id,property_id,publication_id)
) WITHOUT ROWID;
CREATE TRIGGER market_identity_observation_scope BEFORE INSERT ON market_identity_observations
WHEN NOT EXISTS (
  SELECT 1 FROM market_observations o JOIN market_listings l ON l.id=NEW.publication_id
  JOIN market_observations anchor ON anchor.id=l.anchor_observation_id
    AND anchor.source_ref=o.source_ref AND anchor.channel_id=o.channel_id AND anchor.external_key=o.external_key
  WHERE o.id=NEW.observation_id AND o.deleted_tombstone=0
    AND l.operation=json_extract(o.normalized_json,'$.operation')
)
BEGIN SELECT RAISE(ABORT, 'identity observation scope mismatch'); END;

CREATE TABLE market_identity_receipts (
  operation_id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_added_at TEXT NOT NULL,
  property_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(observation_id,property_id,publication_id)
    REFERENCES market_identity_observations(observation_id,property_id,publication_id)
) WITHOUT ROWID;
CREATE TRIGGER market_identity_receipt_no_update BEFORE UPDATE ON market_identity_receipts
BEGIN SELECT RAISE(ABORT, 'identity receipt is immutable'); END;

-- Explicit human attestation is an event; it does not change observations,
-- source permissions, publication operations, matches or photo permissions.
CREATE TABLE market_identity_decisions (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK(action IN ('same_property','undo')),
  source_property_id TEXT NOT NULL REFERENCES market_properties(id),
  target_property_id TEXT NOT NULL REFERENCES market_properties(id),
  source_evidence_observation_id TEXT NOT NULL REFERENCES market_observations(id),
  target_evidence_observation_id TEXT NOT NULL REFERENCES market_observations(id),
  expected_source_version INTEGER NOT NULL CHECK(expected_source_version>0),
  expected_target_version INTEGER NOT NULL CHECK(expected_target_version>0),
  undo_of TEXT REFERENCES market_identity_decisions(id),
  actor TEXT NOT NULL,
  actor_added_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(source_property_id<>target_property_id),
  CHECK((action='same_property' AND undo_of IS NULL) OR (action='undo' AND undo_of IS NOT NULL))
) WITHOUT ROWID;
CREATE UNIQUE INDEX market_identity_one_undo ON market_identity_decisions(undo_of) WHERE undo_of IS NOT NULL;
CREATE TRIGGER market_identity_decision_no_update BEFORE UPDATE ON market_identity_decisions
BEGIN SELECT RAISE(ABORT, 'identity decision is immutable'); END;

CREATE TABLE market_identity_aliases (
  source_property_id TEXT PRIMARY KEY REFERENCES market_properties(id),
  target_property_id TEXT NOT NULL REFERENCES market_properties(id),
  decision_id TEXT NOT NULL UNIQUE REFERENCES market_identity_decisions(id),
  CHECK(source_property_id<>target_property_id)
) WITHOUT ROWID;
CREATE INDEX market_identity_alias_target ON market_identity_aliases(target_property_id);
CREATE TRIGGER market_identity_alias_insert_guard BEFORE INSERT ON market_identity_aliases
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM market_identity_decisions d WHERE d.id=NEW.decision_id
    AND d.action='same_property' AND d.source_property_id=NEW.source_property_id
    AND d.target_property_id=NEW.target_property_id)
  THEN RAISE(ABORT, 'identity alias decision mismatch') END;
  SELECT CASE WHEN EXISTS (
    WITH RECURSIVE parents(id) AS (
      SELECT NEW.target_property_id
      UNION SELECT a.target_property_id FROM market_identity_aliases a JOIN parents p ON a.source_property_id=p.id
    ) SELECT 1 FROM parents WHERE id=NEW.source_property_id
  ) THEN RAISE(ABORT, 'identity alias cycle') END;
END;
CREATE TRIGGER market_identity_alias_no_update BEFORE UPDATE ON market_identity_aliases
BEGIN SELECT RAISE(ABORT, 'identity alias must be changed by decision'); END;
CREATE TRIGGER market_identity_alias_delete_guard BEFORE DELETE ON market_identity_aliases
WHEN NOT EXISTS (SELECT 1 FROM market_identity_decisions d WHERE d.action='undo' AND d.undo_of=OLD.decision_id
  AND d.source_property_id=OLD.source_property_id AND d.target_property_id=OLD.target_property_id)
BEGIN SELECT RAISE(ABORT, 'identity alias undo required'); END;
CREATE TRIGGER market_identity_listing_no_update BEFORE UPDATE ON market_listings
BEGIN SELECT RAISE(ABORT, 'identity publication provenance is immutable'); END;
CREATE TRIGGER market_identity_observation_no_update BEFORE UPDATE ON market_identity_observations
BEGIN SELECT RAISE(ABORT, 'identity observation link is immutable'); END;
