-- MSG-05: a person creates an applicant from a website chat. One row per save, written in the same batch as the contact,
-- the search and the chat's link: its key (sent by the panel) makes a double click or a retry return the same applicant,
-- never a second one. The chat id has no reference on purpose: the chat is deleted after its 30 days (0022) and the saved
-- applicant stays. Only ids and the admin's email; no personal details. The key only serves retries: the daily retention
-- pass deletes a row 30 days after it was written, like the chats. Additive only.
CREATE TABLE chat_applicant_saves (
  operation_key TEXT PRIMARY KEY CHECK (length(operation_key) BETWEEN 16 AND 64),
  chat_id INTEGER NOT NULL,
  -- A search or contact deleted later leaves NULL: a retry then says it was deleted instead of creating it again.
  applicant_id INTEGER REFERENCES applicants(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX chat_applicant_saves_applicant ON chat_applicant_saves(applicant_id) WHERE applicant_id IS NOT NULL;
CREATE INDEX chat_applicant_saves_contact ON chat_applicant_saves(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX chat_applicant_saves_created ON chat_applicant_saves(created_at);
