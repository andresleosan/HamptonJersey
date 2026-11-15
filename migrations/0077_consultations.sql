-- AGE-03 (M06): the shared enquiry about a property. One open enquiry per property and operation ('general': is it
-- available, when can it be viewed) that every approved match of that property joins, and one per match for a
-- clarification of a must-have the property does not answer. Staff only, read and written by server/consultations.js
-- with AGE03_ENQUIRIES_READY=1; the website never reads these tables and nothing here sends a message.
-- Additive: two new tables and their indexes; no existing row changes.
-- The text (body) names the property and never a client: no name, contact, budget or document. occupants is the
-- household size of the one case a person chose to state (occupants_match_id), never a sum. The recipient is the
-- advertiser's id only: its name and contacts stay in the directory (AGE-04), so removing them (AGE-14) leaves no copy.
-- status keeps every value of the M06 design, so the tasks that send (AGE-05) and record answers (AGE-06) need no
-- rebuild; AGE-03 writes manual_pending and, when a person records having sent it, sent.
CREATE TABLE consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('general','clarification')),
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK(operation IN ('sale','rent','business')),
  -- general:<listing>:<operation> or clarification:<match>: what the one open enquiry is about.
  scope_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','approved','queued','sent','awaiting_response','answered','manual_pending',
    'needs_review','cancelled')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  advertiser_id INTEGER NOT NULL REFERENCES advertisers(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  asks_availability INTEGER NOT NULL CHECK(asks_availability IN (0,1)),
  occupants_match_id INTEGER,
  occupants INTEGER CHECK(occupants IS NULL OR occupants BETWEEN 1 AND 40),
  prepared_by TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  -- The request that created it: a retry creates nothing, and its Inbox task is consultation:<operation_id>.
  operation_id TEXT NOT NULL UNIQUE,
  sent_at TEXT,
  sent_via TEXT,
  sent_by TEXT,
  sent_evidence_ref TEXT CHECK(sent_evidence_ref IS NULL OR length(sent_evidence_ref) BETWEEN 1 AND 300),
  sent_operation_id TEXT,
  sent_recorded_at TEXT,
  CHECK((occupants IS NULL) = (occupants_match_id IS NULL)),
  -- Never sent while it waits: sent_at exists only once a sending is recorded.
  CHECK(sent_at IS NULL OR status NOT IN ('draft','approved','queued','manual_pending'))
);
CREATE UNIQUE INDEX consultations_open ON consultations(scope_key) WHERE status NOT IN ('answered','cancelled');
CREATE INDEX consultations_listing ON consultations(listing_id, id);
-- The matches an enquiry serves, each joined by a person. A match counts while it still passes the gate it joined
-- through (server/routes/matches.js: APPROVED, CLARIFICATION_APPROVED), so a search that is resolved or an approval
-- that no longer stands leaves the enquiry without a write and without closing it for the others.
CREATE TABLE consultation_matches (
  consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  linked_by TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (consultation_id, match_id)
);
CREATE INDEX consultation_matches_match ON consultation_matches(match_id);
