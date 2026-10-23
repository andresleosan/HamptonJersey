-- Parish of a listing (the 12 of OPTIONS.parishes in server/applicants.js; NULL = unknown), set by the app or the team.
ALTER TABLE listings ADD COLUMN parish TEXT CHECK (parish IS NULL OR parish IN ('Grouville','St Brelade','St Clement',
  'St Helier','St John','St Lawrence','St Martin','St Mary','St Ouen','St Peter','St Saviour','Trinity'));
-- Whether the listing is offered to applicants (B9).
ALTER TABLE listings ADD COLUMN matchable INTEGER NOT NULL DEFAULT 0 CHECK (matchable IN (0,1));
-- Features read from the listing's text when it is saved (B10); NULL = not said. Outdoor is a JSON list of garden|terrace|balcony.
ALTER TABLE listings ADD COLUMN feat_pets TEXT CHECK (feat_pets IS NULL OR feat_pets IN ('yes','no'));
ALTER TABLE listings ADD COLUMN feat_parking INTEGER CHECK (feat_parking IS NULL OR feat_parking >= 0);
ALTER TABLE listings ADD COLUMN feat_furnished TEXT CHECK (feat_furnished IS NULL OR feat_furnished IN ('yes','no'));
ALTER TABLE listings ADD COLUMN feat_outdoor TEXT;
ALTER TABLE listings ADD COLUMN feat_type TEXT CHECK (feat_type IS NULL OR feat_type IN ('flat','house','cottage','studio'));
-- JSON {pets, parking, furnished, outdoor, type} → the phrase (≤120 chars) each feature was read from.
ALTER TABLE listings ADD COLUMN feat_evidence TEXT;
-- When the features were last read; NULL = still pending.
ALTER TABLE listings ADD COLUMN features_at TEXT;

-- Offered from the start: published listings and the agency import of 2026-10-08 (HE-R028 to HE-R285, B9).
UPDATE listings SET matchable = 1 WHERE published = 1 OR id BETWEEN 'HE-R028' AND 'HE-R285';

-- When the team first reviewed one of this applicant's matches (B13); kept on Undo.
ALTER TABLE applicants ADD COLUMN first_reviewed_at TEXT;
-- The review queue walks the active searches (F0: not archived, lost or completed), oldest first.
CREATE INDEX applicants_queue ON applicants(created_at) WHERE archived_at IS NULL AND stage NOT IN ('lost', 'completed');

-- A listing proposed to an applicant; checks is the JSON list of requirements with their evidence. A reason only when rejected.
CREATE TABLE matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  checks TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('found','shortlisted','rejected')),
  reject_reason TEXT CHECK (reject_reason IS NULL OR (status = 'rejected'
    AND reject_reason IN ('price','area','size','condition','other'))),
  reviewed_by TEXT, reviewed_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (applicant_id, listing_id)
);
-- The review queue and the per-applicant counts read by status; a listing's save finds its matches by listing.
CREATE INDEX matches_status ON matches(status, applicant_id);
CREATE INDEX matches_listing ON matches(listing_id);

-- notifications gains the 'matched' category; SQLite cannot change a CHECK, so the table is rebuilt with the same ids and rows.
-- No table references notifications, so dropping it is safe with foreign keys on.
CREATE TABLE notifications_new (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL CHECK (category IN ('new_applicant','viewing','matched')),
  title TEXT NOT NULL,
  action_required INTEGER NOT NULL CHECK (action_required IN (0,1)),
  created_at TEXT NOT NULL,
  resolved_at TEXT, resolved_by TEXT
);
INSERT INTO notifications_new (id, event_id, category, title, action_required, created_at, resolved_at, resolved_by)
  SELECT id, event_id, category, title, action_required, created_at, resolved_at, resolved_by FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
-- The same three indexes as 0008 (dropped with the old table).
CREATE INDEX notifications_open ON notifications(resolved_at, category, created_at);
CREATE INDEX notifications_created ON notifications(created_at);
CREATE INDEX notifications_event ON notifications(event_id);
