-- VIS-08: the two stages of a viewing that were missing (architecture §4.5): Reminded and Feedback received. They are
-- dates beside the status, never statuses of their own: the status CHECK of 0010 stays as it is, and a reminder never
-- moves a viewing back. Read and written by server/viewing-cycle.js and server/routes/inbox.js with VIS08_CYCLE_READY=1.
-- Additive: five nullable columns, no existing row changes.
--
-- Reminded: when the client was last reminded of the viewing's current time, by whom and how. Today a person of the
-- team marks it (reminded_by: their email). AUT-17's automatic reminder writes the same three columns, with
-- reminded_by = 'automation' and reminded_channel = 'email'. A move to another time clears them.
ALTER TABLE viewing_requests ADD COLUMN reminded_at TEXT;
ALTER TABLE viewing_requests ADD COLUMN reminded_by TEXT;
ALTER TABLE viewing_requests ADD COLUMN reminded_channel TEXT
  CHECK (reminded_channel IS NULL OR reminded_channel IN ('phone','email','whatsapp','in_person'));
-- Feedback received: the client's answer is VIS-04's outcome and outcome_note (0010), not copied here. These say when
-- it was received and who recorded it (a team email; the applicant's own form, when it exists, writes 'applicant').
-- NULL with an outcome: recorded before this migration, its date unknown.
ALTER TABLE viewing_requests ADD COLUMN feedback_at TEXT;
ALTER TABLE viewing_requests ADD COLUMN feedback_by TEXT;
