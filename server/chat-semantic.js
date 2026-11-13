// Disconnected MSG-02 proposal: no route imports this module. The companion
// schema has not been reconciled with or applied to any remote database.
// A caller must authenticate, authorize and bind its server-issued actor_ref;
// this module alone does not prove consent, session validity or delivery.
import { CHAT_DB_NOW, TEAM_MAX, chatKeyCurrent, messageText } from './chat.js';

export const CHAT_REPLY_RETRY_SECONDS = 86400; // Proposed only; no policy or activation is implied.
export const CHAT_REPLY_MAX_PER_CHAT = 64;
export const CHAT_REPLY_PURGE_BATCH = 64;
const clockSeconds = "CAST(strftime('%s','now') AS INTEGER)";
const primary = db => typeof db?.withSession === 'function' ? db.withSession('first-primary') : db;
const validId = id => Number.isSafeInteger(id) && id > 0;
const validRevision = n => Number.isSafeInteger(n) && n >= 0;
const validGeneration = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function contextOf(input, withOperation) {
  const keys = ['chat_id','generation','expected_revision','actor_ref',...(withOperation ? ['operation_id'] : [])];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !keys.includes(k)) ||
      !validId(input.chat_id) || !validGeneration(input.generation) || !validRevision(input.expected_revision) ||
      !validUuid(input.actor_ref) || (withOperation && !validUuid(input.operation_id)))
    throw new TypeError('Invalid chat operation');
  return input;
}
function mutationOf(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['text','sent_by'].includes(k))) throw new TypeError('Invalid chat reply');
  const text = messageText(input.text, TEAM_MAX), sentBy = input.sent_by;
  if (!text || typeof sentBy !== 'string' || sentBy !== sentBy.trim().toLowerCase() ||
      sentBy.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sentBy)) throw new TypeError('Invalid chat reply');
  return { text, sentBy };
}
function database(env) {
  const db = primary(env?.DB);
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') throw new TypeError('Database unavailable');
  return db;
}

export async function readChatVersion(env, chatId) {
  if (!validId(chatId)) throw new TypeError('Invalid chat');
  const db = database(env);
  const row = await db.prepare(`SELECT r.generation,r.revision FROM chat_semantic_revisions r
    JOIN chats c ON c.id=r.chat_id WHERE c.id=?`).bind(chatId).first();
  if (!row) return null;
  if (!validGeneration(row.generation) || !validRevision(row.revision)) throw new Error('Invalid chat version');
  return { generation: row.generation, revision: row.revision };
}

// An authorized server mints the ID; a retry never creates a new operation.
// The actor reference must be an opaque, server-generated session/capability
// identifier, not a visitor value or an email address.
export async function issueChatReply(env, input) {
  const c = contextOf(input, false), db = database(env), operation = crypto.randomUUID();
  const created = await db.prepare(`INSERT INTO chat_reply_operations
    (operation_id,chat_id,generation,expected_revision,actor_ref,actor_kind,state,issued_at,expires_at)
    SELECT ?,c.id,r.generation,r.revision,?,'human','issued',${clockSeconds},${clockSeconds}+${CHAT_REPLY_RETRY_SECONDS}
    FROM chats c JOIN chat_semantic_revisions r ON r.chat_id=c.id
    WHERE c.id=? AND r.generation=? AND r.revision=? AND NOT EXISTS
      (SELECT 1 FROM chat_reply_operations o WHERE o.chat_id=c.id LIMIT 1 OFFSET ${CHAT_REPLY_MAX_PER_CHAT - 1})
    RETURNING expires_at`).bind(operation,c.actor_ref,c.chat_id,c.generation,c.expected_revision).first();
  return created ? { outcome: 'issued', operation_id: operation, expires_at: created.expires_at }
    : { outcome: 'stale_or_capacity' };
}

// The original message remains the sole source for a retry comparison. Once
// edited/deleted, its receipt is terminal but deliberately unverifiable.
async function receipt(db, c) {
  return db.prepare(`SELECT o.state,m.text,m.sent_by FROM chat_reply_operations o
    LEFT JOIN chat_messages m ON m.id=o.message_id AND m.chat_id=o.chat_id
    WHERE o.operation_id=? AND o.chat_id=? AND o.generation=? AND o.expected_revision=?
      AND o.actor_ref=? AND o.actor_kind='human' AND o.expires_at>${clockSeconds}`)
    .bind(c.operation_id,c.chat_id,c.generation,c.expected_revision,c.actor_ref).first();
}

// Human replies only. Automatic replies stay closed until their separate pause,
// provider and historical key requirements can be checked in the same flow.
export async function commitChatReply(env, input, mutation) {
  const c = contextOf(input, true), {text,sentBy} = mutationOf(mutation), db = database(env);
  let result, failed = false;
  try {
    result = await db.batch([
      db.prepare(`INSERT INTO chat_messages(chat_id,role,sent_by,text,created_at)
        SELECT chat.id,'team',?,?,${CHAT_DB_NOW} FROM chats chat
        JOIN chat_semantic_revisions revision ON revision.chat_id=chat.id
        JOIN chat_reply_operations operation ON operation.chat_id=chat.id
        WHERE chat.id=? AND revision.generation=? AND revision.revision=?
          AND operation.operation_id=? AND operation.generation=revision.generation
          AND operation.expected_revision=revision.revision AND operation.actor_ref=?
          AND operation.actor_kind='human' AND operation.state='issued' AND operation.expires_at>${clockSeconds}`)
        .bind(sentBy,text,c.chat_id,c.generation,c.expected_revision,c.operation_id,c.actor_ref),
      db.prepare(`UPDATE chat_reply_operations SET state='committed',message_id=last_insert_rowid()
        WHERE operation_id=? AND state='issued' AND changes()=1`).bind(c.operation_id),
      db.prepare(`UPDATE chats SET key_hash=CASE WHEN ${chatKeyCurrent()} THEN key_hash ELSE 'expired:' || id END,
        status='answered',waiting_since=NULL,last_at=${CHAT_DB_NOW} WHERE id=? AND changes()=1`).bind(c.chat_id),
    ]);
  } catch { failed = true; }
  if ((result?.[0]?.meta?.changes ?? 0) > 0) return { outcome: 'committed' };
  let previous;
  try { previous = await receipt(db,c); } catch { return { outcome: 'unknown' }; }
  if (!previous) return { outcome: failed ? 'unknown' : 'unavailable' };
  if (previous.state === 'redacted') return { outcome: 'committed_unverifiable' };
  if (previous.state === 'committed') {
    if (previous.text == null || previous.sent_by == null) return { outcome: 'committed_unverifiable' };
    return { outcome: previous.text === text && previous.sent_by === sentBy ? 'replayed' : 'conflict' };
  }
  return { outcome: failed ? 'unknown' : 'stale' };
}

// One indexed, bounded batch. Missing or expired IDs cannot mint a replacement.
export async function purgeExpiredChatReplyOperations(env) {
  const db = database(env);
  await db.prepare(`DELETE FROM chat_reply_operations WHERE operation_id IN (
    SELECT operation_id FROM chat_reply_operations INDEXED BY chat_reply_operations_expiry
    WHERE expires_at<=${clockSeconds} ORDER BY expires_at,operation_id LIMIT ${CHAT_REPLY_PURGE_BATCH})`).run();
}
