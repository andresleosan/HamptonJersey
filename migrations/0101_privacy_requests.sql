-- PRE-12: the team's register of privacy requests received (access, rectification, erasure, objection, portability),
-- recorded by hand from an email, a call, a letter or a visit (server/privacy-requests.js). Read and written only with
-- PRE12_REQUESTS_READY=1. Nothing here deletes or sends anything: an erasure request only lists what a deletion would
-- remove and what a hold keeps.
-- Additive: two new tables and one index; no existing row or table changes.

-- id: a UUID the panel generates, so a repeated save returns the same request. received_on: the day it arrived, as the
-- team recorded it. due_on: the legal deadline the team enters; the app works none out. reference: where it came from
-- (for example the email's subject), not the request itself. contact_id: set by a person, never by matching an email;
-- a deleted contact leaves the request, unlinked. The identity check and the copy review say who, how and when; linking
-- another contact clears both. copy_hash: the SHA-256 of the copy as reviewed; a download needs the same data still.
-- revision: every write checks it.
CREATE TABLE privacy_requests (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  kind TEXT NOT NULL CHECK (kind IN ('access', 'rectification', 'erasure', 'objection', 'portability')),
  received_on TEXT NOT NULL CHECK (date(received_on) = received_on),
  received_via TEXT NOT NULL CHECK (received_via IN ('email', 'phone', 'letter', 'in_person')),
  due_on TEXT CHECK (due_on IS NULL OR (date(due_on) = due_on AND due_on >= received_on)),
  reference TEXT NOT NULL CHECK (length(trim(reference)) BETWEEN 1 AND 200),
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_to TEXT,
  identity_method TEXT CHECK (identity_method IS NULL OR identity_method IN ('photo_id', 'details_on_record', 'in_person', 'other')),
  identity_ref TEXT CHECK (identity_ref IS NULL OR length(identity_ref) <= 120),
  identity_verified_by TEXT,
  identity_verified_at TEXT,
  copy_hash TEXT CHECK (copy_hash IS NULL OR length(copy_hash) = 64),
  copy_reviewed_by TEXT,
  copy_reviewed_at TEXT,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
  result TEXT CHECK (result IS NULL OR result IN ('fulfilled', 'partially_fulfilled', 'refused', 'withdrawn')),
  result_note TEXT CHECK (result_note IS NULL OR length(result_note) <= 500),
  closed_by TEXT,
  closed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((state = 'closed') = (result IS NOT NULL AND closed_at IS NOT NULL)),
  CHECK ((identity_verified_at IS NULL) = (identity_method IS NULL))
);
CREATE INDEX privacy_requests_open ON privacy_requests (state, received_on);

-- What was done to each request, by whom and when, with ids and codes only: never the person's details. Append-only.
CREATE TABLE privacy_request_audit (
  id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES privacy_requests(id),
  revision INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'contact_linked', 'identity_verified', 'copy_reviewed', 'closed')),
  actor TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TRIGGER privacy_request_audit_append_only BEFORE UPDATE ON privacy_request_audit
BEGIN SELECT RAISE(ABORT, 'privacy request audit is append-only'); END;
