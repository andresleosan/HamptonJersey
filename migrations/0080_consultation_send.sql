-- AGE-05 (M06): sending the shared enquiry by a usable channel. Additive: five columns on consultations (0077), all
-- empty for the rows already there; no existing row changes and nothing is sent by this file. Read and written by
-- server/consultations.js with AGE05_SEND_READY=1; without it, or before this file, enquiries work as AGE-03 left them.
-- The contact chosen among the advertiser's, as a digest of its name and email: never the address, which stays in the
-- directory (AGE-04), so removing it there (AGE-14) leaves no copy here and the enquiry waits for another contact.
ALTER TABLE consultations ADD COLUMN contact_key TEXT;
-- A person's approval to send exactly one version (recipient, contact and text). Any later change is another version.
ALTER TABLE consultations ADD COLUMN approved_revision INTEGER;
ALTER TABLE consultations ADD COLUMN approved_by TEXT;
ALTER TABLE consultations ADD COLUMN approved_at TEXT;
-- The email queued for it in the app's email pipeline (outbound.ref, written HE-OUT-<ref> in its subject): at most
-- one per version. The address and the copy sent live there, under that pipeline's own retention.
ALTER TABLE consultations ADD COLUMN email_ref TEXT;
