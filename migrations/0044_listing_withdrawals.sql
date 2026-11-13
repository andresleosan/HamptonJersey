-- PUB-09: private editorial withdrawal history; no backfill of unknown legacy reasons.
CREATE TABLE listing_withdrawals (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK(source_revision>0),
  event_id INTEGER NOT NULL REFERENCES events(id),
  reason_code TEXT CHECK(reason_code IS NULL OR reason_code IN ('owner_request','let_elsewhere','sold_elsewhere','data_correction','other')),
  private_note TEXT CHECK(private_note IS NULL OR length(private_note)<=1000),
  actor TEXT NOT NULL,
  current_revision INTEGER NOT NULL DEFAULT 1 CHECK(current_revision>0),
  CHECK(reason_code<>'other' OR length(trim(COALESCE(private_note,'')))>0)
) WITHOUT ROWID;
CREATE INDEX listing_withdrawals_history ON listing_withdrawals(listing_id,occurred_at DESC,id DESC);
CREATE TRIGGER listing_withdrawal_original_immutable BEFORE UPDATE OF
  listing_id,occurred_at,source_revision,event_id,reason_code,private_note,actor ON listing_withdrawals
BEGIN SELECT RAISE(ABORT,'withdrawal original is immutable'); END;

CREATE TABLE listing_withdrawal_revisions (
  id TEXT PRIMARY KEY,
  withdrawal_id TEXT NOT NULL REFERENCES listing_withdrawals(id),
  revision INTEGER NOT NULL CHECK(revision>1),
  previous_revision INTEGER NOT NULL CHECK(previous_revision=revision-1),
  reason_code TEXT NOT NULL CHECK(reason_code IN ('owner_request','let_elsewhere','sold_elsewhere','data_correction','other')),
  private_note TEXT CHECK(private_note IS NULL OR length(private_note)<=1000),
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE(withdrawal_id,revision),
  CHECK(reason_code<>'other' OR length(trim(COALESCE(private_note,'')))>0)
) WITHOUT ROWID;
CREATE INDEX listing_withdrawal_revisions_history ON listing_withdrawal_revisions(withdrawal_id,revision);
CREATE TRIGGER listing_withdrawal_revision_immutable BEFORE UPDATE ON listing_withdrawal_revisions
BEGIN SELECT RAISE(ABORT,'withdrawal revision is immutable'); END;

CREATE TABLE listing_withdrawal_receipts (
  actor TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  action TEXT NOT NULL CHECK(action IN ('withdraw','correct')),
  withdrawal_id TEXT NOT NULL REFERENCES listing_withdrawals(id),
  revision INTEGER NOT NULL CHECK(revision>0),
  event_id INTEGER NOT NULL REFERENCES events(id),
  PRIMARY KEY(actor,operation_id)
) WITHOUT ROWID;
CREATE TABLE listing_withdrawal_guard (id TEXT PRIMARY KEY, allowed INTEGER NOT NULL CHECK(allowed=1)) WITHOUT ROWID;
