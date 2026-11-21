-- AUT-17 fase C: when Hermes's mail carrier asked, just before Gmail, whether the email may still go out
-- (server/hermes-mail.js mailCheck). One answer per claim: a second check, or a draft or send reported without one,
-- is refused, so a carrier restarted mid-send never sends twice. Additive: one new column, no existing row changes.
ALTER TABLE mail_tasks ADD COLUMN checked_at TEXT;
