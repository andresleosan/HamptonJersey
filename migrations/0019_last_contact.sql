-- SAP-07 + EST-11 (spec 2026-11-04, L1): the last real contact with the person, apart from last_activity_at (which team
-- edits also move, for the 12 months). Set by a registration, a repeated website form, Log conversation, a viewing
-- request, booking, confirmation, move or completion, and a recorded offer. Gone quiet = an active search over 14 days.
ALTER TABLE contacts ADD COLUMN last_contact_at TEXT;
-- L2: the contacts already there start from the latest such moment in their history.
UPDATE contacts SET last_contact_at = (SELECT MAX(t) FROM (
  SELECT contacts.created_at AS t
  UNION ALL SELECT a.created_at FROM applicants a WHERE a.contact_id = contacts.id
  UNION ALL SELECT o.created_at FROM offers o JOIN applicants a ON a.id = o.applicant_id WHERE a.contact_id = contacts.id
  UNION ALL SELECT e.at FROM events e WHERE e.entity_type = 'contact' AND e.entity_id = CAST(contacts.id AS TEXT)
    AND e.type IN ('contact.conversation', 'applicant.duplicate_submitted')
  UNION ALL SELECT CASE WHEN v.status IN ('confirmed', 'completed') THEN COALESCE(v.updated_at, v.created_at) ELSE v.created_at END
    -- Viewing phones are stored as typed: compared by their last 10 digits, as interestSql does (server/viewings.js).
    FROM viewing_requests v WHERE lower(v.email) = contacts.email OR (contacts.phone IS NOT NULL AND v.phone IS NOT NULL
      AND substr(replace(replace(replace(replace(replace(v.phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', ''), -10)
        = substr(contacts.phone, -10))));
