-- AUT-17 fase D (docs/roadmap/work/AUT-17/plan-correo-hermes.md): replies in the Gmail threads of what Hermes sent come
-- back to the app through the mail carrier (server/hermes-mail.js mailReplies) and are kept with the app's other inbound
-- email, same 30/90-day retention. mail_task_id: the email of Hermes's they answer; reply_kind: a person (human), an
-- automatic acknowledgement or out-of-office (auto), or a delivery failure (bounce). Written only with HERMES_MAIL_READY=1.
-- Additive: two new columns, no existing row changes.
ALTER TABLE email_inbound ADD COLUMN mail_task_id INTEGER REFERENCES mail_tasks(id) ON DELETE SET NULL;
ALTER TABLE email_inbound ADD COLUMN reply_kind TEXT CHECK (reply_kind IS NULL OR reply_kind IN ('human', 'auto', 'bounce'));
