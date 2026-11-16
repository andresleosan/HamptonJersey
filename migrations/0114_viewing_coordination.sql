-- VIS-17: a viewing coordinated with several people. The team proposes one time for an existing viewing and records,
-- one by one, each required person's answer (the client always; the advertiser or agency and the negotiator when the
-- team says so) with how and when they gave it. The viewing moves to that time and is confirmed only in the write that
-- finds every required answer accepted. Read and written by server/viewing-coordination.js with
-- VIS17_MULTIPART_READY=1 only; switched off, nothing reads these tables. Nothing is sent to anyone.
-- Additive: two new tables, their indexes and triggers; no existing row or table changes.

-- One row per proposal of a viewing, numbered 1, 2, 3… per viewing (revision). Only one is open at a time; a new one
-- supersedes it, and a decline, a confirmation, or the viewing's own reschedule, cancel or close ends it. A proposal
-- holds no time of its own: the viewing keeps holding its current one until the confirming write moves it.
-- applicant_id: the search this viewing is for, chosen by a person (never inferred from an email or phone).
CREATE TABLE viewing_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viewing_id INTEGER NOT NULL REFERENCES viewing_requests(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (typeof(revision) = 'integer' AND revision >= 1),
  applicant_id INTEGER REFERENCES applicants(id) ON DELETE SET NULL,
  negotiator_id INTEGER NOT NULL REFERENCES negotiators(id),
  date TEXT NOT NULL, time TEXT NOT NULL, end_time TEXT NOT NULL,
  -- The viewing as it was when proposed: the confirming write requires it unchanged, so a move or confirmation made
  -- meanwhile by any other path (or while the switch was off) never lets old answers move it.
  from_status TEXT NOT NULL, from_negotiator_id INTEGER, from_date TEXT NOT NULL, from_time TEXT NOT NULL,
  -- Who must accept: a JSON array of 'client', 'advertiser', 'staff', always with 'client'.
  required TEXT NOT NULL CHECK (json_valid(required) AND json_type(required) = 'array'),
  -- VIS-10: staff said access is agreed with the tenant for a time sooner than the house's notice.
  notice_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (notice_confirmed IN (0, 1)),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'confirmed', 'declined', 'superseded', 'cancelled')),
  created_at TEXT NOT NULL, created_by TEXT NOT NULL,
  closed_at TEXT, closed_by TEXT,
  CHECK (time < end_time),
  CHECK ((state = 'open') = (closed_at IS NULL)),
  UNIQUE (viewing_id, revision)
);
-- At most one open proposal per viewing.
CREATE UNIQUE INDEX viewing_proposals_open ON viewing_proposals (viewing_id) WHERE state = 'open';
CREATE INDEX viewing_proposals_applicant ON viewing_proposals (applicant_id) WHERE applicant_id IS NOT NULL;
-- A closed proposal stays closed, and what was proposed never changes (deleting its search still clears applicant_id).
CREATE TRIGGER viewing_proposals_closed BEFORE UPDATE ON viewing_proposals
WHEN (OLD.state <> 'open' AND (NEW.state IS NOT OLD.state OR NEW.closed_at IS NOT OLD.closed_at
    OR NEW.closed_by IS NOT OLD.closed_by))
  OR NEW.viewing_id IS NOT OLD.viewing_id OR NEW.revision IS NOT OLD.revision
  OR NEW.negotiator_id IS NOT OLD.negotiator_id OR NEW.date IS NOT OLD.date OR NEW.time IS NOT OLD.time
  OR NEW.end_time IS NOT OLD.end_time OR NEW.required IS NOT OLD.required OR NEW.from_status IS NOT OLD.from_status
  OR NEW.from_negotiator_id IS NOT OLD.from_negotiator_id OR NEW.from_date IS NOT OLD.from_date OR NEW.from_time IS NOT OLD.from_time
BEGIN SELECT RAISE(ABORT, 'Viewing proposal is closed or fixed'); END;

-- Each required person's answer to one proposal, once: accepted or declined, how (channel) and when they gave it
-- (answered_at), who answered when it was not the person themselves (answered_by, e.g. the agency's front desk) and the
-- team member who recorded it. A new proposal asks everyone again.
CREATE TABLE viewing_acceptances (
  proposal_id INTEGER NOT NULL REFERENCES viewing_proposals(id) ON DELETE CASCADE,
  participant TEXT NOT NULL CHECK (participant IN ('client', 'advertiser', 'staff')),
  response TEXT NOT NULL CHECK (response IN ('accepted', 'declined')),
  channel TEXT NOT NULL CHECK (channel IN ('phone', 'email', 'whatsapp', 'in_person', 'other')),
  answered_at TEXT NOT NULL,
  answered_by TEXT CHECK (answered_by IS NULL OR length(answered_by) BETWEEN 1 AND 120),
  recorded_at TEXT NOT NULL, recorded_by TEXT NOT NULL,
  PRIMARY KEY (proposal_id, participant)
);
-- Only on an open proposal, and only for someone it asks.
CREATE TRIGGER viewing_acceptances_open BEFORE INSERT ON viewing_acceptances
WHEN NOT EXISTS (SELECT 1 FROM viewing_proposals p, json_each(p.required) r
  WHERE p.id = NEW.proposal_id AND p.state = 'open' AND r.value = NEW.participant)
BEGIN SELECT RAISE(ABORT, 'Viewing proposal is not open for this person'); END;
CREATE TRIGGER viewing_acceptances_fixed BEFORE UPDATE ON viewing_acceptances
BEGIN SELECT RAISE(ABORT, 'Viewing answers cannot be changed'); END;
