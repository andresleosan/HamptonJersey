-- MSG-01: Hermes's draft of a reply to a Facebook conversation (docs/roadmap/work/MSG-01/plan-borrador-hermes.md).
-- A person asks, Hermes writes through its own door, a person uses or discards it and sends it with the usual route.
-- last_message_id: the newest message when it was asked; a later message from the person makes the draft void.
-- Deleted with its conversation. Additive only: one table and one index.
CREATE TABLE channel_reply_drafts (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES channel_conversations(id) ON DELETE CASCADE,
  last_message_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'working', 'draft', 'used', 'discarded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  text TEXT,
  requested_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  claimed_at TEXT,
  drafted_at TEXT,
  decided_at TEXT,
  decided_by TEXT
);
-- One open draft per conversation.
CREATE UNIQUE INDEX channel_reply_drafts_open ON channel_reply_drafts (conversation_id) WHERE status IN ('queued', 'working', 'draft');
