-- BUS-10: a person's decision that two market homes are different, and its reopening.
-- 0050 records only "same home" and its undo; without this a refused pair would be proposed forever.
-- Append-only: a decision stands while no later row reopens it. Nothing here changes an observation.
CREATE TABLE market_identity_separations (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL CHECK(action IN ('different_properties','reopen')),
  left_property_id TEXT NOT NULL REFERENCES market_properties(id),
  right_property_id TEXT NOT NULL REFERENCES market_properties(id),
  reopens TEXT REFERENCES market_identity_separations(id),
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(left_property_id<right_property_id),
  CHECK((action='different_properties' AND reopens IS NULL) OR (action='reopen' AND reopens IS NOT NULL))
) WITHOUT ROWID;
CREATE UNIQUE INDEX market_identity_one_reopen ON market_identity_separations(reopens) WHERE reopens IS NOT NULL;
CREATE TRIGGER market_identity_separation_no_update BEFORE UPDATE ON market_identity_separations
BEGIN SELECT RAISE(ABORT, 'identity separation is immutable'); END;
