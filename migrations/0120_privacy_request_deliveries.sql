-- PRE-12: a team member records that the reviewed copy of an access or portability request was handed over outside the
-- app (by hand, by post or from the team's own email), what shows it and the result (server/privacy-requests.js). Read
-- and written only with PRE12_REQUESTS_READY=1. Nothing here sends anything, and a record never closes the request.
-- Sending the copy from the app (approved_email) waits for AUT-17; until then only manual_handoff is written.
-- Additive: one new table, its index and an append-only trigger; no existing row or table changes.

-- revision: the request's revision this record moved it to (every write checks it). copy_hash: the SHA-256 of the
-- reviewed copy that was handed over, so a later change of the data is not taken as handed over. evidence_ref: where
-- the team keeps what shows it (for example a postal receipt number), never the copy or the person's details; it stays
-- in this table, never in the audit, events or logs. result: accepted (the person has it), unknown (sent, receipt not
-- confirmed: not taken as received) or failed. No destination is stored: the copy left the app by hand, so the app
-- never knew the address. Ids and codes otherwise. Append-only: a later result is a new row.
CREATE TABLE privacy_request_deliveries (
  id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES privacy_requests(id),
  revision INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('approved_email', 'manual_handoff')),
  copy_hash TEXT NOT NULL CHECK (length(copy_hash) = 64),
  evidence_ref TEXT NOT NULL CHECK (length(trim(evidence_ref)) BETWEEN 1 AND 200),
  result TEXT NOT NULL CHECK (result IN ('accepted', 'unknown', 'failed')),
  actor TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX privacy_request_deliveries_request ON privacy_request_deliveries (request_id, id);
CREATE TRIGGER privacy_request_deliveries_append_only BEFORE UPDATE ON privacy_request_deliveries
BEGIN SELECT RAISE(ABORT, 'privacy request deliveries are append-only'); END;
