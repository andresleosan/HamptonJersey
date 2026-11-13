import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { makeEnv } from './helpers.mjs';

const schema = new URL('../../docs/roadmap/work/MSG-02/semantic-cas.proposed.sql', import.meta.url);
async function core() {
  try { return await import('../../server/chat-semantic.js'); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('/server/chat-semantic.js'))
      assert.fail('The disconnected semantic chat contract has not been implemented');
    throw error;
  }
}
function prepare() {
  assert.ok(existsSync(schema), 'The disconnected semantic schema proposal has not been prepared');
  const env = makeEnv();
  env.DB.raw.exec(readFileSync(schema, 'utf8'));
  const timestamp = new Date().toISOString();
  const id = env.DB.raw.prepare(`INSERT INTO chats(key_hash,name,email,privacy_ack_at,created_at,last_at,waiting_since)
    VALUES(?,?,?,?,?,?,?)`).run(crypto.randomUUID(), 'Synthetic visitor', 'visitor@example.test', timestamp, timestamp, timestamp, timestamp).lastInsertRowid;
  return { env, id: Number(id) };
}

test('message edits and deletes advance the same durable chat revision without scanning message history', async () => {
  const { readChatVersion } = await core();
  const { env, id } = prepare(), db = env.DB.raw;
  const initial = await readChatVersion(env, id);
  assert.equal(initial.revision, 0);
  const message = Number(db.prepare("INSERT INTO chat_messages(chat_id,role,text,created_at) VALUES(?,'visitor',?,?)")
    .run(id, 'Synthetic message', new Date().toISOString()).lastInsertRowid);
  assert.equal((await readChatVersion(env, id)).revision, 1);
  db.prepare('UPDATE chat_messages SET text=? WHERE id=?').run('Synthetic correction', message);
  assert.equal((await readChatVersion(env, id)).revision, 2);
  db.prepare('DELETE FROM chat_messages WHERE id=?').run(message);
  const after = await readChatVersion(env, id);
  assert.equal(after.revision, 3);
  assert.equal(after.generation, initial.generation);
});

test('only semantic changes advance the revision, not presence or no-op writes', async () => {
  const { readChatVersion } = await core();
  const { env, id } = prepare(), db = env.DB.raw;
  db.prepare('UPDATE chats SET visitor_seen_at=? WHERE id=?').run(new Date().toISOString(), id);
  assert.equal((await readChatVersion(env, id)).revision, 0);
  const message = Number(db.prepare("INSERT INTO chat_messages(chat_id,role,text,created_at) VALUES(?,'visitor',?,?)")
    .run(id, 'Synthetic message', new Date().toISOString()).lastInsertRowid);
  db.prepare('UPDATE chat_messages SET text=text WHERE id=?').run(message);
  assert.equal((await readChatVersion(env, id)).revision, 1);
  db.prepare("UPDATE chats SET status='handled' WHERE id=?").run(id);
  assert.equal((await readChatVersion(env, id)).revision, 2);
  db.prepare("UPDATE chats SET status='handled' WHERE id=?").run(id);
  assert.equal((await readChatVersion(env, id)).revision, 2);
  db.prepare('UPDATE chats SET email=? WHERE id=?').run('new-visitor@example.test', id);
  assert.equal((await readChatVersion(env, id)).revision, 3);
});

test('existing chats remain closed until a separately authorized bounded backfill', async () => {
  const { readChatVersion } = await core();
  const env = makeEnv(), db = env.DB.raw, timestamp = new Date().toISOString();
  const id = Number(db.prepare(`INSERT INTO chats(key_hash,name,email,privacy_ack_at,created_at,last_at)
    VALUES(?,?,?,?,?,?)`).run(crypto.randomUUID(), 'Synthetic visitor', 'visitor@example.test', timestamp, timestamp, timestamp).lastInsertRowid);
  db.exec(readFileSync(schema, 'utf8'));
  assert.equal(await readChatVersion(env, id), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_semantic_revisions').get().n, 0);
});

test('a server-issued operation commits once and keeps the original receipt without copying the reply', async () => {
  const { readChatVersion, issueChatReply, commitChatReply } = await core();
  assert.equal(typeof issueChatReply, 'function');
  assert.equal(typeof commitChatReply, 'function');
  const { env, id } = prepare(), db = env.DB.raw;
  const version = await readChatVersion(env, id), actor_ref = crypto.randomUUID();
  const context = { chat_id: id, generation: version.generation, expected_revision: version.revision, actor_ref };
  const issued = await issueChatReply(env, context);
  assert.equal(issued.outcome, 'issued');
  const operation = { ...context, operation_id: issued.operation_id };
  const reply = { text: 'Synthetic response', sent_by: 'staff@example.test' };
  assert.equal((await commitChatReply(env, operation, reply)).outcome, 'committed');
  assert.equal((await commitChatReply(env, operation, reply)).outcome, 'replayed');
  assert.equal((await commitChatReply(env, operation, { ...reply, text: 'Different response' })).outcome, 'conflict');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').get(id).n, 1);
  const saved = db.prepare('SELECT * FROM chat_reply_operations WHERE operation_id=?').get(issued.operation_id);
  assert.equal(saved.expires_at - saved.issued_at, 86400);
  assert.equal(JSON.stringify(saved).includes(reply.text), false);
  assert.equal(JSON.stringify(saved).includes(reply.sent_by), false);
});

test('editing or deleting a committed message retains evidence without allowing the operation to send again', async () => {
  const { readChatVersion, issueChatReply, commitChatReply } = await core();
  assert.equal(typeof issueChatReply, 'function');
  for (const action of ['edit', 'delete']) {
    const { env, id } = prepare(), db = env.DB.raw, version = await readChatVersion(env, id);
    const context = { chat_id: id, generation: version.generation, expected_revision: version.revision, actor_ref: crypto.randomUUID() };
    const issued = await issueChatReply(env, context), operation = { ...context, operation_id: issued.operation_id };
    const reply = { text: 'Synthetic response', sent_by: 'staff@example.test' };
    assert.equal((await commitChatReply(env, operation, reply)).outcome, 'committed');
    const message = db.prepare('SELECT message_id FROM chat_reply_operations WHERE operation_id=?').get(issued.operation_id).message_id;
    if (action === 'edit') db.prepare('UPDATE chat_messages SET text=? WHERE id=?').run('Changed response', message);
    else db.prepare('DELETE FROM chat_messages WHERE id=?').run(message);
    const receipt = db.prepare('SELECT state,message_id FROM chat_reply_operations WHERE operation_id=?').get(issued.operation_id);
    assert.equal(receipt.state, 'redacted');
    assert.equal(receipt.message_id, null);
    assert.equal((await commitChatReply(env, operation, reply)).outcome, 'committed_unverifiable');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').get(id).n, action === 'edit' ? 1 : 0);
  }
});

test('deleting and recreating a chat does not reuse the version or a prior issued operation', async () => {
  const { readChatVersion, issueChatReply, commitChatReply } = await core();
  assert.equal(typeof issueChatReply, 'function');
  const { env, id } = prepare(), db = env.DB.raw, version = await readChatVersion(env, id);
  const context = { chat_id: id, generation: version.generation, expected_revision: version.revision, actor_ref: crypto.randomUUID() };
  const issued = await issueChatReply(env, context), operation = { ...context, operation_id: issued.operation_id };
  db.prepare('DELETE FROM chats WHERE id=?').run(id);
  const stored = db.prepare('SELECT * FROM chat_reply_operations WHERE operation_id=?').get(issued.operation_id);
  assert.equal(stored.state, 'cancelled');
  for (const field of ['chat_id','generation','expected_revision','actor_ref','actor_kind','message_id']) assert.equal(stored[field], null);
  const timestamp = new Date().toISOString();
  db.prepare(`INSERT INTO chats(id,key_hash,name,email,privacy_ack_at,created_at,last_at,waiting_since)
    VALUES(?,?,?,?,?,?,?,?)`).run(id, crypto.randomUUID(), 'Synthetic visitor', 'visitor@example.test', timestamp, timestamp, timestamp, timestamp);
  assert.notEqual((await readChatVersion(env, id)).generation, version.generation);
  assert.equal((await commitChatReply(env, operation, { text: 'Synthetic response', sent_by: 'staff@example.test' })).outcome, 'unavailable');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').get(id).n, 0);
});

test('issuing more than the bounded per-chat capacity fails closed', async () => {
  const { readChatVersion, issueChatReply } = await core();
  assert.equal(typeof issueChatReply, 'function');
  const { env, id } = prepare(), version = await readChatVersion(env, id);
  const context = { chat_id: id, generation: version.generation, expected_revision: version.revision, actor_ref: crypto.randomUUID() };
  for (let i=0; i<64; i++) assert.equal((await issueChatReply(env, context)).outcome, 'issued');
  assert.equal((await issueChatReply(env, context)).outcome, 'stale_or_capacity');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM chat_reply_operations WHERE chat_id=?').get(id).n, 64);
});

test('a receipt cannot be rebound to another chat, actor, or message', async () => {
  const { readChatVersion, issueChatReply } = await core();
  const { env, id } = prepare(), db = env.DB.raw, version = await readChatVersion(env, id);
  const context = { chat_id:id, generation:version.generation, expected_revision:version.revision, actor_ref:crypto.randomUUID() };
  const issued = await issueChatReply(env, context), timestamp = new Date().toISOString();
  const other = Number(db.prepare(`INSERT INTO chats(key_hash,name,email,privacy_ack_at,created_at,last_at)
    VALUES(?,?,?,?,?,?)`).run(crypto.randomUUID(), 'Other fixture', 'other@example.test', timestamp, timestamp, timestamp).lastInsertRowid);
  const otherVersion = await readChatVersion(env, other);
  const otherMessage = Number(db.prepare("INSERT INTO chat_messages(chat_id,role,text,created_at) VALUES(?,'team',?,?)")
    .run(other, 'Other synthetic response', timestamp).lastInsertRowid);
  assert.throws(() => db.prepare('UPDATE chat_reply_operations SET chat_id=?,generation=? WHERE operation_id=?')
    .run(other, otherVersion.generation, issued.operation_id));
  assert.throws(() => db.prepare('UPDATE chat_reply_operations SET actor_ref=? WHERE operation_id=?')
    .run(crypto.randomUUID(), issued.operation_id));
  assert.throws(() => db.prepare("UPDATE chat_reply_operations SET state='committed',message_id=? WHERE operation_id=?")
    .run(otherMessage, issued.operation_id));
  assert.equal(db.prepare('SELECT state FROM chat_reply_operations WHERE operation_id=?').get(issued.operation_id).state, 'issued');
});

test('a different actor reference cannot consume an issued operation', async () => {
  const { readChatVersion, issueChatReply, commitChatReply } = await core();
  const { env, id } = prepare(), version = await readChatVersion(env, id);
  const context = { chat_id:id, generation:version.generation, expected_revision:version.revision, actor_ref:crypto.randomUUID() };
  const issued = await issueChatReply(env, context);
  const wrong = { ...context, operation_id:issued.operation_id, actor_ref:crypto.randomUUID() };
  assert.equal((await commitChatReply(env, wrong, {text:'Synthetic response',sent_by:'staff@example.test'})).outcome, 'unavailable');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').get(id).n, 0);
});

test('an unexpired receipt cannot be deleted before its retry horizon', async () => {
  const { readChatVersion, issueChatReply } = await core();
  const { env, id } = prepare(), version = await readChatVersion(env, id);
  const issued = await issueChatReply(env, {chat_id:id,generation:version.generation,
    expected_revision:version.revision,actor_ref:crypto.randomUUID()});
  assert.throws(() => env.DB.raw.prepare('DELETE FROM chat_reply_operations WHERE operation_id=?').run(issued.operation_id));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM chat_reply_operations WHERE operation_id=?').get(issued.operation_id).n,1);
});

test('a reserved operation cannot be replaced to rejuvenate or reset its receipt', async () => {
  const { readChatVersion, issueChatReply } = await core();
  const { env, id } = prepare(), version = await readChatVersion(env, id);
  const issued = await issueChatReply(env, {chat_id:id,generation:version.generation,
    expected_revision:version.revision,actor_ref:crypto.randomUUID()});
  assert.throws(() => env.DB.raw.prepare(`INSERT OR REPLACE INTO chat_reply_operations
    SELECT * FROM chat_reply_operations WHERE operation_id=?`).run(issued.operation_id));
  assert.equal(env.DB.raw.prepare('SELECT state FROM chat_reply_operations WHERE operation_id=?').get(issued.operation_id).state,'issued');
});

test('expired operation IDs cannot send or become new operations after bounded cleanup', async () => {
  const { readChatVersion, issueChatReply, commitChatReply, purgeExpiredChatReplyOperations } = await core();
  assert.equal(typeof purgeExpiredChatReplyOperations, 'function');
  const { env, id } = prepare(), db = env.DB.raw, version = await readChatVersion(env, id);
  const context = { chat_id: id, generation: version.generation, expected_revision: version.revision, actor_ref: crypto.randomUUID() };
  const operation_id = crypto.randomUUID();
  db.prepare(`INSERT INTO chat_reply_operations(operation_id,chat_id,generation,expected_revision,actor_ref,actor_kind,state,issued_at,expires_at)
    VALUES(?,?,?,?,?,'human','issued',CAST(strftime('%s','now') AS INTEGER)-86400,CAST(strftime('%s','now') AS INTEGER))`)
    .run(operation_id, id, context.generation, context.expected_revision, context.actor_ref);
  const op = { ...context, operation_id }, reply = { text: 'Synthetic response', sent_by: 'staff@example.test' };
  assert.equal((await commitChatReply(env, op, reply)).outcome, 'unavailable');
  await purgeExpiredChatReplyOperations(env);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_reply_operations WHERE operation_id=?').get(operation_id).n, 0);
  assert.equal((await commitChatReply(env, op, reply)).outcome, 'unavailable');
  await assert.rejects(issueChatReply(env, op), TypeError);
  await assert.rejects(issueChatReply(env, { ...context, issued_at: Math.floor(Date.now()/1000) }), TypeError);
  await assert.rejects(commitChatReply(env, { ...op, expires_at: Math.floor(Date.now()/1000)+86400 }, reply), TypeError);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').get(id).n, 0);
});

test('expiry cleanup is indexed and deletes at most 64 records per invocation', async () => {
  const { purgeExpiredChatReplyOperations } = await core();
  assert.equal(typeof purgeExpiredChatReplyOperations, 'function');
  const { env } = prepare(), db = env.DB.raw;
  const insert = db.prepare(`INSERT INTO chat_reply_operations(operation_id,state,issued_at,expires_at)
    VALUES(?,'redacted',CAST(strftime('%s','now') AS INTEGER)-86400,CAST(strftime('%s','now') AS INTEGER))`);
  for (let i=0;i<70;i++) insert.run(crypto.randomUUID());
  const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT operation_id FROM chat_reply_operations
    WHERE expires_at<=? ORDER BY expires_at,operation_id LIMIT 64`).all(Math.floor(Date.now()/1000));
  assert.match(plan.map(row=>row.detail).join(' '), /USING COVERING INDEX chat_reply_operations_expiry/);
  await purgeExpiredChatReplyOperations(env);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_reply_operations').get().n, 6);
  await purgeExpiredChatReplyOperations(env);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chat_reply_operations').get().n, 0);
});
