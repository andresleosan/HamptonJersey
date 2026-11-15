-- AGE-06 (M06): what the advertiser answered to a shared enquiry (0077) that was sent, as a person of the team records
-- it. Additive: nine columns on consultations and one on consultation_matches, all empty for the rows already there; no
-- existing row changes. Read and written by server/consultations.js with AGE06_RESPONSES_READY=1; without it, or
-- before this file, enquiries work as AGE-03 and AGE-05 left them.
-- The latest answer recorded: what it said, when, how, who answered and where the proof is kept (a reference, never
-- the message). Each answer also writes an event with ids and its outcome only. Available or not available writes a
-- confirmation of EST-16 (availability_confirmations) in the same batch, which EST-15 propagates; nothing here writes
-- a match. answered: a clarification answered, which confirms no availability.
ALTER TABLE consultations ADD COLUMN response_outcome TEXT
  CHECK(response_outcome IS NULL OR response_outcome IN ('available','unavailable','answered','more_info','no_answer'));
ALTER TABLE consultations ADD COLUMN response_at TEXT;
ALTER TABLE consultations ADD COLUMN response_via TEXT CHECK(response_via IS NULL OR response_via IN ('phone','email','in_person','message'));
ALTER TABLE consultations ADD COLUMN response_from TEXT CHECK(response_from IS NULL OR length(response_from) BETWEEN 1 AND 120);
ALTER TABLE consultations ADD COLUMN response_scope TEXT CHECK(response_scope IS NULL OR response_scope IN ('property','operation'));
ALTER TABLE consultations ADD COLUMN response_evidence_ref TEXT
  CHECK(response_evidence_ref IS NULL OR length(response_evidence_ref) BETWEEN 1 AND 300);
ALTER TABLE consultations ADD COLUMN response_by TEXT;
ALTER TABLE consultations ADD COLUMN response_recorded_at TEXT;
-- The request that recorded it: the same click again records nothing twice.
ALTER TABLE consultations ADD COLUMN response_operation_id TEXT;
-- What the advertiser said about one household's own case (for example, pets accepted for this family): kept on that
-- match's link to the enquiry only, so it is never read as true for the property or for any other household.
ALTER TABLE consultation_matches ADD COLUMN response_note TEXT CHECK(response_note IS NULL OR length(response_note) BETWEEN 1 AND 300);
