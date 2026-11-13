-- BUS-10 proposal for isolated synthetic tests only. This file is not a
-- migration and must not be applied to a deployed database. Retention/EST-19,
-- durable session and membership authorization and consumer integration remain unresolved.
-- A pending candidate is not a decision and never changes an alias or match.
CREATE TABLE market_identity_candidates (
  id TEXT PRIMARY KEY,
  left_property_id TEXT NOT NULL REFERENCES market_properties(id),
  right_property_id TEXT NOT NULL REFERENCES market_properties(id),
  left_evidence_observation_id TEXT NOT NULL REFERENCES market_observations(id),
  right_evidence_observation_id TEXT NOT NULL REFERENCES market_observations(id),
  expected_left_version INTEGER NOT NULL CHECK(expected_left_version>0),
  expected_right_version INTEGER NOT NULL CHECK(expected_right_version>0),
  expected_left_evidence_revision INTEGER NOT NULL CHECK(expected_left_evidence_revision>0),
  expected_right_evidence_revision INTEGER NOT NULL CHECK(expected_right_evidence_revision>0),
  supersedes_candidate_id TEXT REFERENCES market_identity_candidates(id),
  signal TEXT NOT NULL CHECK(signal IN ('shared_address','shared_reference','manual_review')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  CHECK(left_property_id<right_property_id),
  CHECK(left_evidence_observation_id<>right_evidence_observation_id),
  UNIQUE(supersedes_candidate_id)
) WITHOUT ROWID;
CREATE UNIQUE INDEX market_identity_candidate_first_pair ON market_identity_candidates(left_property_id,right_property_id)
  WHERE supersedes_candidate_id IS NULL;
-- REPLACE can bypass DELETE triggers when recursive_triggers is off. Guard
-- every key that could select an existing row before conflict resolution.
CREATE TRIGGER market_identity_candidate_no_replace BEFORE INSERT ON market_identity_candidates
WHEN EXISTS (SELECT 1 FROM market_identity_candidates c WHERE c.id=NEW.id)
  OR (NEW.supersedes_candidate_id IS NULL AND EXISTS (
    SELECT 1 FROM market_identity_candidates c WHERE c.supersedes_candidate_id IS NULL
      AND c.left_property_id=NEW.left_property_id AND c.right_property_id=NEW.right_property_id))
  OR (NEW.supersedes_candidate_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM market_identity_candidates c WHERE c.supersedes_candidate_id=NEW.supersedes_candidate_id))
BEGIN SELECT RAISE(ABORT, 'identity candidate key already exists'); END;
-- A successor must refer to the same canonical pair. The unique predecessor
-- and immutable, non-deletable history prevent forks in this proposal.
CREATE TRIGGER market_identity_candidate_same_pair BEFORE INSERT ON market_identity_candidates
WHEN NEW.supersedes_candidate_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM market_identity_candidates c WHERE c.id=NEW.supersedes_candidate_id
    AND c.left_property_id=NEW.left_property_id AND c.right_property_id=NEW.right_property_id
)
BEGIN SELECT RAISE(ABORT, 'identity candidate predecessor mismatch'); END;
CREATE TRIGGER market_identity_candidate_no_update BEFORE UPDATE ON market_identity_candidates
BEGIN SELECT RAISE(ABORT, 'identity candidate is immutable'); END;

-- Receipts make retries idempotent without creating a second authority for
-- same/different-property decisions. No free-text evidence is persisted.
CREATE TABLE market_identity_candidate_receipts (
  operation_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES market_identity_candidates(id),
  actor TEXT NOT NULL,
  actor_added_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID;
CREATE TRIGGER market_identity_candidate_receipt_no_replace BEFORE INSERT ON market_identity_candidate_receipts
WHEN EXISTS (SELECT 1 FROM market_identity_candidate_receipts r WHERE r.operation_id=NEW.operation_id)
BEGIN SELECT RAISE(ABORT, 'identity candidate receipt key already exists'); END;
CREATE TRIGGER market_identity_candidate_receipt_no_update BEFORE UPDATE ON market_identity_candidate_receipts
BEGIN SELECT RAISE(ABORT, 'identity candidate receipt is immutable'); END;

-- Synthetic proposal deliberately blocks deletion until EST-19 defines an
-- atomic retention/tombstone contract. This is not a deployable policy.
CREATE TRIGGER market_identity_candidate_no_delete BEFORE DELETE ON market_identity_candidates
BEGIN SELECT RAISE(ABORT, 'identity candidate retention unresolved'); END;
CREATE TRIGGER market_identity_candidate_receipt_no_delete BEFORE DELETE ON market_identity_candidate_receipts
BEGIN SELECT RAISE(ABORT, 'identity candidate retention unresolved'); END;
