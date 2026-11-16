-- MSG-03: a person links a website chat to an existing contact, or unlinks it; never automatic. contact_version is the
-- link's compare-and-set token: every link or unlink adds one, so a panel showing an older link gets 409, not an overwrite.
-- A deleted contact leaves the chat unlinked; the chat keeps its own 30 days (0022). Additive only.
ALTER TABLE chats ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE chats ADD COLUMN contact_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS chats_contact ON chats(contact_id) WHERE contact_id IS NOT NULL;
