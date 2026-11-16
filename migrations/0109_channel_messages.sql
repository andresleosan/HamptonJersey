-- MSG-01 / PRE-08: messages sent to Hampton's Facebook page (Messenger) and the replies a person sends from Messages.
-- One conversation per page and person (their page-scoped id); 'instagram' is accepted for later, nothing writes it yet.
-- No raw payload is kept and attachments are not downloaded. Deleted 30 days after the last message, like the
-- website's chats (server/retention.js). Additive only.
CREATE TABLE channel_conversations (
  id INTEGER PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('messenger', 'instagram')),
  account_id TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  contact_version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'answered', 'handled')),
  waiting_since TEXT,
  last_inbound_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  handled_at TEXT,
  handled_by TEXT,
  UNIQUE (channel, account_id, external_user_id)
);
CREATE INDEX channel_conversations_status ON channel_conversations (status, last_at);
CREATE INDEX channel_conversations_last ON channel_conversations (last_at);
CREATE INDEX channel_conversations_contact ON channel_conversations (contact_id) WHERE contact_id IS NOT NULL;

-- direction 'in': from the person (status NULL, external_id = Meta's message id, the replay guard).
-- direction 'out': a person's reply: sending, then sent (with Meta's id), failed or unknown (no answer from Meta).
CREATE TABLE channel_messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES channel_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  text TEXT NOT NULL,
  external_id TEXT UNIQUE,
  status TEXT CHECK (status IN ('sending', 'sent', 'failed', 'unknown')),
  sent_by TEXT,
  sent_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX channel_messages_conversation ON channel_messages (conversation_id, id);
