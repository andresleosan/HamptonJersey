-- MSG-02 (spec 2026-11-06): the website's chat, answered by a person in the panel. A chat is found by the SHA-256 of its
-- key, which only the visitor's browser holds (C5). waiting: the visitor wrote last; answered: the team did; handled:
-- someone marked it done (C7). Deleted 30 days after its last message (C11), its messages with it.
CREATE TABLE chats (
  id INTEGER PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','answered','handled')),
  listing_id TEXT REFERENCES listings(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  privacy_ack_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  waiting_since TEXT,
  visitor_seen_at TEXT,
  handled_at TEXT,
  handled_by TEXT,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
-- The panel's counter reads the waiting chats only; the daily pass and the key's 7 days read last_at.
CREATE INDEX chats_waiting ON chats(waiting_since) WHERE status = 'waiting';
CREATE INDEX chats_last ON chats(last_at);

CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('visitor','team')),
  sent_by TEXT, -- the admin's email for a team message; never sent to the website (C6)
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL
);
CREATE INDEX chat_messages_chat ON chat_messages(chat_id, id);
