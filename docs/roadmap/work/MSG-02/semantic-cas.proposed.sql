-- PROPOSAL ONLY. Not a numbered migration, not applied remotely or activated.
-- New chats begin at revision 0. Existing chats remain closed: their bounded
-- backfill and mixed-version rollout require a separate reviewed procedure.
CREATE TABLE chat_semantic_revisions (
  chat_id INTEGER PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  generation TEXT NOT NULL UNIQUE CHECK(length(generation)=32 AND generation NOT GLOB '*[^0-9a-f]*'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision BETWEEN 0 AND 9007199254740991)
);
-- statement-breakpoint
CREATE TRIGGER chat_semantic_identity_guard BEFORE UPDATE OF chat_id,generation ON chat_semantic_revisions
WHEN NEW.chat_id IS NOT OLD.chat_id OR NEW.generation IS NOT OLD.generation
BEGIN SELECT RAISE(ABORT,'chat identity is immutable'); END;
-- statement-breakpoint
CREATE TRIGGER chat_semantic_revision_guard BEFORE UPDATE OF revision ON chat_semantic_revisions
WHEN NEW.revision IS NOT OLD.revision+1
BEGIN SELECT RAISE(ABORT,'invalid chat revision'); END;
-- statement-breakpoint
CREATE TRIGGER chat_semantic_delete_guard BEFORE DELETE ON chat_semantic_revisions
WHEN EXISTS(SELECT 1 FROM chats WHERE id=OLD.chat_id)
BEGIN SELECT RAISE(ABORT,'chat revision cannot be removed'); END;
-- statement-breakpoint
-- An operation is minted server-side, not accepted as a fresh ID from a caller.
-- It expires exactly 24h after issue. No message text, digest, or staff email is stored here.
CREATE TABLE chat_reply_operations (
  operation_id TEXT PRIMARY KEY NOT NULL,
  chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
  generation TEXT,
  expected_revision INTEGER CHECK(expected_revision IS NULL OR expected_revision>=0),
  actor_ref TEXT,
  actor_kind TEXT CHECK(actor_kind IS NULL OR actor_kind='human'),
  state TEXT NOT NULL CHECK(state IN ('issued','committed','redacted','cancelled')),
  message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
  issued_at INTEGER NOT NULL CHECK(typeof(issued_at)='integer' AND issued_at>=0),
  expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer' AND expires_at=issued_at+86400),
  CHECK (
    (state='issued' AND chat_id IS NOT NULL AND generation IS NOT NULL AND expected_revision IS NOT NULL
      AND actor_ref IS NOT NULL AND actor_kind='human' AND message_id IS NULL)
    OR (state='committed' AND chat_id IS NOT NULL AND generation IS NOT NULL AND expected_revision IS NOT NULL
      AND actor_ref IS NOT NULL AND actor_kind='human' AND message_id IS NOT NULL)
    OR (state='redacted' AND message_id IS NULL AND
      ((chat_id IS NOT NULL AND generation IS NOT NULL AND expected_revision IS NOT NULL AND actor_ref IS NOT NULL AND actor_kind='human')
       OR (chat_id IS NULL AND generation IS NULL AND expected_revision IS NULL AND actor_ref IS NULL AND actor_kind IS NULL)))
    OR (state='cancelled' AND message_id IS NULL AND chat_id IS NULL AND generation IS NULL
      AND expected_revision IS NULL AND actor_ref IS NULL AND actor_kind IS NULL)
  )
);
-- statement-breakpoint
CREATE INDEX chat_reply_operations_chat ON chat_reply_operations(chat_id);
-- statement-breakpoint
CREATE UNIQUE INDEX chat_reply_operations_message ON chat_reply_operations(message_id) WHERE message_id IS NOT NULL;
-- statement-breakpoint
CREATE INDEX chat_reply_operations_expiry ON chat_reply_operations(expires_at,operation_id);
-- statement-breakpoint
-- Do not let a replace bypass the retained receipt, even with recursive triggers off.
CREATE TRIGGER chat_reply_operation_no_reissue BEFORE INSERT ON chat_reply_operations
WHEN EXISTS(SELECT 1 FROM chat_reply_operations WHERE operation_id=NEW.operation_id)
BEGIN SELECT RAISE(ABORT,'chat operation already exists'); END;
-- statement-breakpoint
CREATE TRIGGER chat_reply_operation_no_early_delete BEFORE DELETE ON chat_reply_operations
WHEN OLD.expires_at>CAST(strftime('%s','now') AS INTEGER)
BEGIN SELECT RAISE(ABORT,'chat operation still retained'); END;
-- statement-breakpoint
CREATE TRIGGER chat_reply_operation_capacity BEFORE INSERT ON chat_reply_operations
WHEN NEW.chat_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM chat_reply_operations WHERE chat_id=NEW.chat_id LIMIT 1 OFFSET 63)
BEGIN SELECT RAISE(ABORT,'chat operation capacity'); END;
-- statement-breakpoint
CREATE TRIGGER chat_reply_operation_identity BEFORE UPDATE OF operation_id,issued_at,expires_at ON chat_reply_operations
WHEN NEW.operation_id IS NOT OLD.operation_id OR NEW.issued_at IS NOT OLD.issued_at OR NEW.expires_at IS NOT OLD.expires_at
BEGIN SELECT RAISE(ABORT,'chat operation identity is immutable'); END;
-- statement-breakpoint
CREATE TRIGGER chat_reply_operation_binding BEFORE UPDATE OF chat_id,generation,expected_revision,actor_ref,actor_kind ON chat_reply_operations
WHEN (NEW.chat_id IS NOT OLD.chat_id OR NEW.generation IS NOT OLD.generation OR NEW.expected_revision IS NOT OLD.expected_revision
 OR NEW.actor_ref IS NOT OLD.actor_ref OR NEW.actor_kind IS NOT OLD.actor_kind)
 AND NOT (NEW.state IN ('redacted','cancelled') AND NEW.chat_id IS NULL AND NEW.generation IS NULL
   AND NEW.expected_revision IS NULL AND NEW.actor_ref IS NULL AND NEW.actor_kind IS NULL)
BEGIN SELECT RAISE(ABORT,'chat operation binding is immutable'); END;
-- statement-breakpoint
CREATE TRIGGER chat_reply_operation_terminal BEFORE UPDATE OF state ON chat_reply_operations
WHEN NEW.state IS NOT OLD.state AND NOT (
  (OLD.state='issued' AND NEW.state IN ('committed','cancelled')) OR
  (OLD.state='committed' AND NEW.state='redacted'))
BEGIN SELECT RAISE(ABORT,'chat operation is terminal'); END;
-- statement-breakpoint
CREATE TRIGGER chat_reply_operation_message BEFORE UPDATE OF state,message_id ON chat_reply_operations
WHEN NEW.state='committed' AND (OLD.state<>'issued' OR OLD.message_id IS NOT NULL OR NOT EXISTS(
  SELECT 1 FROM chat_messages m WHERE m.id=NEW.message_id AND m.chat_id=OLD.chat_id AND m.role='team'))
BEGIN SELECT RAISE(ABORT,'chat operation message mismatch'); END;
-- statement-breakpoint
CREATE TRIGGER chat_semantic_create AFTER INSERT ON chats BEGIN
  INSERT INTO chat_semantic_revisions(chat_id,generation) VALUES(NEW.id,lower(hex(randomblob(16))));
END;
-- statement-breakpoint
CREATE TRIGGER chat_semantic_chat_change AFTER UPDATE OF status,listing_id,name,email,phone,privacy_ack_at,handled_at,handled_by,key_hash ON chats
WHEN OLD.status IS NOT NEW.status OR OLD.listing_id IS NOT NEW.listing_id OR OLD.name IS NOT NEW.name
 OR OLD.email IS NOT NEW.email OR OLD.phone IS NOT NEW.phone OR OLD.privacy_ack_at IS NOT NEW.privacy_ack_at
 OR OLD.handled_at IS NOT NEW.handled_at OR OLD.handled_by IS NOT NEW.handled_by OR OLD.key_hash IS NOT NEW.key_hash
BEGIN UPDATE chat_semantic_revisions SET revision=revision+1 WHERE chat_id=NEW.id; END;
-- statement-breakpoint
CREATE TRIGGER chat_semantic_message_insert AFTER INSERT ON chat_messages BEGIN
  UPDATE chat_semantic_revisions SET revision=revision+1 WHERE chat_id=NEW.chat_id;
END;
-- statement-breakpoint
CREATE TRIGGER chat_semantic_message_update AFTER UPDATE OF id,chat_id,role,sent_by,text,created_at ON chat_messages
WHEN OLD.id IS NOT NEW.id OR OLD.chat_id IS NOT NEW.chat_id OR OLD.role IS NOT NEW.role
 OR OLD.sent_by IS NOT NEW.sent_by OR OLD.text IS NOT NEW.text OR OLD.created_at IS NOT NEW.created_at
BEGIN UPDATE chat_semantic_revisions SET revision=revision+1 WHERE chat_id IN (OLD.chat_id,NEW.chat_id); END;
-- statement-breakpoint
CREATE TRIGGER chat_semantic_message_delete AFTER DELETE ON chat_messages BEGIN
  UPDATE chat_semantic_revisions SET revision=revision+1 WHERE chat_id=OLD.chat_id;
END;
-- statement-breakpoint
-- Retain only the fact that an operation was consumed when its source changes.
CREATE TRIGGER chat_reply_message_edit BEFORE UPDATE OF id,chat_id,role,sent_by,text,created_at ON chat_messages
WHEN OLD.id IS NOT NEW.id OR OLD.chat_id IS NOT NEW.chat_id OR OLD.role IS NOT NEW.role
 OR OLD.sent_by IS NOT NEW.sent_by OR OLD.text IS NOT NEW.text OR OLD.created_at IS NOT NEW.created_at
BEGIN UPDATE chat_reply_operations SET state='redacted',message_id=NULL WHERE message_id=OLD.id AND state='committed'; END;
-- statement-breakpoint
CREATE TRIGGER chat_reply_message_delete BEFORE DELETE ON chat_messages BEGIN
  UPDATE chat_reply_operations SET state='redacted',message_id=NULL WHERE message_id=OLD.id AND state='committed';
END;
-- statement-breakpoint
-- After deletion, keep only random operation ID, terminal state and expiry.
CREATE TRIGGER chat_reply_chat_delete BEFORE DELETE ON chats BEGIN
  UPDATE chat_reply_operations SET state=CASE WHEN state='issued' THEN 'cancelled' ELSE 'redacted' END,
    chat_id=NULL,generation=NULL,expected_revision=NULL,actor_ref=NULL,actor_kind=NULL,message_id=NULL
    WHERE chat_id=OLD.id;
END;
