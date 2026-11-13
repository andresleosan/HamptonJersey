-- BUS-10 proposal for isolated synthetic tests only. This file is not a
-- migration and must not be applied to a deployed database. Retention/EST-19,
-- durable ADM-18 authorization and consumer integration remain unresolved.
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
  signal TEXT NOT NULL CHECK(signal IN ('shared_address','shared_reference','manual_review')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  CHECK(left_property_id<right_property_id),
  CHECK(left_evidence_observation_id<>right_evidence_observation_id),
  UNIQUE(left_property_id,right_property_id)
) WITHOUT ROWID;
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
CREATE TRIGGER market_identity_candidate_receipt_no_update BEFORE UPDATE ON market_identity_candidate_receipts
BEGIN SELECT RAISE(ABORT, 'identity candidate receipt is immutable'); END;
