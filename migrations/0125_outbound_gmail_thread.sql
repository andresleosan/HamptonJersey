-- AUT-17 (docs/roadmap/work/AUT-17/plan-correo-hermes.md, fase D): an approved enquiry (AGE-05) that the mail carrier
-- sent from Hampton's Gmail keeps its Gmail thread, so the carrier also reads the agency's reply in that thread and the
-- app links it to the email (email_inbound.outbound_id), as a reply through Cloudflare is. Written only with
-- HERMES_MAIL_READY=1. Additive: one new column, no existing row changes.
ALTER TABLE outbound ADD COLUMN gmail_thread_id TEXT;
