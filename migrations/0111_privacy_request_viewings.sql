-- PRE-12: viewing requests carry no contact id, so one matched to a privacy request's contact only by email or phone
-- enters that person's copy only when a team member confirms, one by one, that it is theirs
-- (server/privacy-requests.js). Read and written only with PRE12_VIEWING_REVIEW_READY=1.
-- Additive: one new table, its index and an append-only trigger; no existing row or table changes.

-- Each decision a person takes on one viewing request for one request and the contact linked at the time: confirmed (1)
-- or taken back (0), by whom and when. The latest row per viewing is the one that counts. Ids and codes only: never the
-- person's details. viewing_id and contact_id carry no foreign key, so deleting a viewing or a contact the usual ways
-- is never blocked; the copy reads only viewings that still exist and still match. Append-only.
CREATE TABLE privacy_request_viewings (
  id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES privacy_requests(id),
  contact_id INTEGER NOT NULL,
  viewing_id INTEGER NOT NULL,
  confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1)),
  actor TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX privacy_request_viewings_latest ON privacy_request_viewings (request_id, contact_id, viewing_id, id);
CREATE TRIGGER privacy_request_viewings_append_only BEFORE UPDATE ON privacy_request_viewings
BEGIN SELECT RAISE(ABORT, 'privacy request viewing decisions are append-only'); END;
