import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { keyHash } from '../../server/chat.js';
import visitorRoutes from '../../server/routes/chat.js';
import staffRoutes from '../../server/routes/chats.js';

const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery } = require('wrangler');
const key = n => String(n).padStart(43, 'A');
async function database() {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: "export default {fetch(){return new Response('local')}}", compatibilityDate: '2025-10-01',
    host: '127.0.0.1', port: 0, d1Databases: { DB: 'msg02-key-expiry' } }));
  const DB = await mf.getD1Database('DB');
  await DB.batch([
    DB.prepare('CREATE TABLE listings(id TEXT PRIMARY KEY,title TEXT,published INTEGER,archived_at TEXT)'),
    DB.prepare('CREATE TABLE admins(email TEXT PRIMARY KEY,name TEXT)'),
  ]);
  const schema = readFileSync(new URL('../../migrations/0022_chats.sql', import.meta.url), 'utf8');
  await DB.batch(unstable_splitSqlQuery(schema).map(sql => DB.prepare(sql)));
  return { DB, dispose: () => mf.dispose() };
}
async function seed(DB, days, n = 1) {
  const at = new Date(Date.now() - days * 864e5).toISOString(), digest = await keyHash(key(n));
  const inserted = await DB.prepare(`INSERT INTO chats(key_hash,name,email,privacy_ack_at,created_at,last_at,waiting_since)
    VALUES(?,?,?,?,?,?,?)`).bind(digest, 'Visitor', 'visitor@example.test', at, at, at, at).run();
  const id = inserted.meta.last_row_id;
  await DB.prepare("INSERT INTO chat_messages(chat_id,role,text,created_at) VALUES(?,'visitor','Question',?)").bind(id, at).run();
  return id;
}
async function invoke(routes, method, path, env, { body, bearer, admin, id } = {}) {
  const entry = routes.find(([verb, pattern]) => verb === method && pattern.test(path));
  assert.ok(entry);
  const pending = [];
  const headers = { ...(body ? { 'content-type': 'application/json' } : {}),
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) };
  const response = await entry[2]({ env, admin, params: id ? [String(id)] : [],
    request: new Request(`https://fixture.invalid${path}`, { method, headers,
      ...(body ? { body: JSON.stringify(body) } : {}) }), waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  return response;
}
const reply = (DB, id) => invoke(staffRoutes, 'POST', `/admin/chats/${id}/reply`, { DB },
  { id, admin: 'staff@example.test', body: { text: 'Human reply' } });
const read = (DB, n = 1) => invoke(visitorRoutes, 'GET', '/chat', { DB }, { bearer: key(n) });

test('a late human reply invalidates the old key while retaining the chat and messages', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 8), digest = await keyHash(key(1));
    assert.equal((await reply(db.DB, id)).status, 201);
    const row = await db.DB.prepare('SELECT key_hash FROM chats WHERE id=?').bind(id).first();
    assert.ok(row.key_hash !== digest, 'the expired key must be invalidated atomically');
    assert.ok(!/^[0-9a-f]{64}$/.test(row.key_hash), 'the marker must be impossible as a SHA-256 digest');
    await assert.rejects(read(db.DB), error => error.status === 401);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 2);
  } finally { await db.dispose(); }
});

function interruptBefore(DB, kind, action) {
  let fired = false;
  const before = async () => { if (!fired) { fired = true; await action(); } };
  const wrap = (statement, sql) => ({
    inner: statement,
    bind: (...args) => wrap(statement.bind(...args), sql),
    first: (...args) => statement.first(...args),
    all: async (...args) => { if (kind === 'read') await before(); return statement.all(...args); },
    run: async (...args) => { if ((kind === 'delete' && /^\s*DELETE FROM chats/i.test(sql)) ||
      (kind === 'seen' && /^\s*UPDATE chats SET visitor_seen_at/i.test(sql))) await before(); return statement.run(...args); },
  });
  return {
    prepare: sql => wrap(DB.prepare(sql), sql),
    batch: async statements => {
      if (kind === 'read' || kind === 'say') await before();
      return DB.batch(statements.map(statement => statement.inner ?? statement));
    },
  };
}
async function expireAndReply(DB, id) {
  const expired = new Date(Date.now() - 8 * 864e5).toISOString();
  await DB.prepare('UPDATE chats SET last_at=? WHERE id=?').bind(expired, id).run();
  assert.equal((await reply(DB, id)).status, 201);
}

test('a held read cannot reveal a chat after its key is invalidated', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6), delayed = interruptBefore(db.DB, 'read', () => expireAndReply(db.DB, id));
    await assert.rejects(read(delayed), error => error.status === 401);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 2);
  } finally { await db.dispose(); }
});

test('a held visitor send cannot write after its key is invalidated', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6), delayed = interruptBefore(db.DB, 'say', () => expireAndReply(db.DB, id));
    await assert.rejects(invoke(visitorRoutes, 'POST', '/chat/messages', { DB: delayed },
      { bearer: key(1), body: { text: 'Late visitor message' } }), error => error.status === 401);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 2);
  } finally { await db.dispose(); }
});

test('a held visitor delete cannot delete a chat after its key is invalidated', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6), delayed = interruptBefore(db.DB, 'delete', () => expireAndReply(db.DB, id));
    await assert.rejects(invoke(visitorRoutes, 'DELETE', '/chat', { DB: delayed }, { bearer: key(1) }),
      error => error.status === 401);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chats WHERE id=?').bind(id).first()).n, 1);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 2);
  } finally { await db.dispose(); }
});

test('a human reply on day six extends the existing key without losing messages', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6), digest = await keyHash(key(1));
    assert.equal((await reply(db.DB, id)).status, 201);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chats WHERE id=? AND key_hash=?').bind(id, digest).first()).n, 1);
    const response = await read(db.DB);
    assert.equal(response.status, 200);
    const conversation = await response.json();
    assert.equal(conversation.messages.length, 2);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 2);
  } finally { await db.dispose(); }
});

test('expired markers are unique per chat and remain invalid after another human reply', async () => {
  const db = await database();
  try {
    const first = await seed(db.DB, 8, 1), second = await seed(db.DB, 8, 2);
    const replies = await Promise.all([reply(db.DB, first), reply(db.DB, second)]);
    assert.ok(replies.every(response => response.status === 201));
    assert.equal((await db.DB.prepare("SELECT COUNT(*) AS n FROM chats WHERE key_hash = 'expired:' || id").first()).n, 2);
    assert.equal((await db.DB.prepare('SELECT COUNT(DISTINCT key_hash) AS n FROM chats').first()).n, 2);
    assert.equal((await reply(db.DB, first)).status, 201);
    assert.equal((await db.DB.prepare("SELECT COUNT(*) AS n FROM chats WHERE id=? AND key_hash = 'expired:' || id").bind(first).first()).n, 1);
    await assert.rejects(read(db.DB, 1), error => error.status === 401);
    await assert.rejects(read(db.DB, 2), error => error.status === 401);
  } finally { await db.dispose(); }
});

test('crossing seven days after authentication rejects held read, send and delete', async () => {
  const db = await database();
  try {
    const ids = await Promise.all([1, 2, 3].map(n => seed(db.DB, 6, n)));
    const near = new Date(Date.now() - 7 * 864e5 + 5000).toISOString();
    await db.DB.batch(ids.map(id => db.DB.prepare('UPDATE chats SET last_at=? WHERE id=?').bind(near, id)));
    let intercepted = 0;
    const delay = async () => { intercepted++; await new Promise(resolve => setTimeout(resolve, 5500)); };
    const operations = [
      read(interruptBefore(db.DB, 'read', delay), 1),
      invoke(visitorRoutes, 'POST', '/chat/messages', { DB: interruptBefore(db.DB, 'say', delay) },
        { bearer: key(2), body: { text: 'At boundary' } }),
      invoke(visitorRoutes, 'DELETE', '/chat', { DB: interruptBefore(db.DB, 'delete', delay) }, { bearer: key(3) }),
    ];
    const results = await Promise.allSettled(operations);
    assert.equal(intercepted, 3);
    assert.ok(results.every(result => result.status === 'rejected' && result.reason.status === 401));
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chats').first()).n, 3);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages').first()).n, 3);
  } finally { await db.dispose(); }
});

test('valid human and visitor messages serialize without invalidating the key', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6), digest = await keyHash(key(1));
    const results = await Promise.all([
      reply(db.DB, id),
      invoke(visitorRoutes, 'POST', '/chat/messages', { DB: db.DB }, { bearer: key(1), body: { text: 'Visitor message' } }),
    ]);
    assert.ok(results.every(response => response.status === 201));
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chats WHERE id=? AND key_hash=?').bind(id, digest).first()).n, 1);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 3);
  } finally { await db.dispose(); }
});

test('a marker collision rolls back the entire human reply batch', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 8), digest = await keyHash(key(1)), at = new Date().toISOString();
    await db.DB.prepare(`INSERT INTO chats(key_hash,name,email,privacy_ack_at,created_at,last_at,waiting_since)
      VALUES(?,?,?,?,?,?,?)`).bind(`expired:${id}`, 'Other', 'other@example.test', at, at, at, at).run();
    await assert.rejects(reply(db.DB, id));
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chats WHERE id=? AND key_hash=? AND status=\'waiting\'').bind(id, digest).first()).n, 1);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 1);
  } finally { await db.dispose(); }
});

test('a delayed human reply cannot recreate a deleted chat', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 8);
    await db.DB.prepare('DELETE FROM chats WHERE id=?').bind(id).run();
    await assert.rejects(reply(db.DB, id), error => error.status === 404);
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 0);
  } finally { await db.dispose(); }
});

test('the human expiry decision uses database time after a batch is prepared', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6);
    const near = new Date(Date.now() - 7 * 864e5 + 5000).toISOString();
    await db.DB.prepare('UPDATE chats SET last_at=? WHERE id=?').bind(near, id).run();
    let intercepted = false;
    const delayed = interruptBefore(db.DB, 'say', async () => {
      intercepted = true;
      await new Promise(resolve => setTimeout(resolve, 5500));
    });
    const response = await invoke(staffRoutes, 'POST', `/admin/chats/${id}/reply`, { DB: delayed },
      { id, admin: 'staff@example.test', body: { text: 'Human reply' } });
    assert.equal(intercepted, true);
    assert.equal(response.status, 201);
    assert.equal((await db.DB.prepare("SELECT COUNT(*) AS n FROM chats WHERE id=? AND key_hash = 'expired:' || id").bind(id).first()).n, 1);
    await assert.rejects(read(db.DB), error => error.status === 401);
  } finally { await db.dispose(); }
});

test('a chat deleted after authentication is not read, written or deleted again', async () => {
  const db = await database();
  try {
    for (const [n, kind] of [[1, 'read'], [2, 'say'], [3, 'delete']]) {
      const id = await seed(db.DB, 6, n);
      const delayed = interruptBefore(db.DB, kind, () => db.DB.prepare('DELETE FROM chats WHERE id=?').bind(id).run());
      const action = kind === 'read' ? read(delayed, n) : kind === 'say'
        ? invoke(visitorRoutes, 'POST', '/chat/messages', { DB: delayed }, { bearer: key(n), body: { text: 'Message' } })
        : invoke(visitorRoutes, 'DELETE', '/chat', { DB: delayed }, { bearer: key(n) });
      await assert.rejects(action, error => error.status === 401);
      assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 0);
    }
  } finally { await db.dispose(); }
});

test('visitor conversation never exposes the key or a staff identity', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6), digest = await keyHash(key(1));
    assert.equal((await reply(db.DB, id)).status, 201);
    const response = await read(db.DB), serialized = await response.text();
    assert.equal(response.status, 200);
    assert.ok(!serialized.includes(key(1)));
    assert.ok(!serialized.includes(digest));
    assert.ok(!serialized.includes('staff@example.test'));
  } finally { await db.dispose(); }
});

test('a presence update held across revocation does not mark the visitor online', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6), delayed = interruptBefore(db.DB, 'seen', () => expireAndReply(db.DB, id));
    assert.equal((await read(delayed)).status, 200);
    const row = await db.DB.prepare('SELECT visitor_seen_at FROM chats WHERE id=?').bind(id).first();
    assert.equal(row.visitor_seen_at, null);
    await assert.rejects(read(db.DB), error => error.status === 401);
  } finally { await db.dispose(); }
});

function afterVisitorWrite(DB, action, { failResponseRead = false } = {}) {
  let fired = false;
  const wrap = (statement, sql) => ({
    inner: statement,
    bind: (...args) => wrap(statement.bind(...args), sql),
    first: (...args) => statement.first(...args),
    all: async (...args) => {
      if (failResponseRead && fired && /FROM chats c LEFT JOIN listings/i.test(sql)) throw new Error('synthetic read failure');
      return statement.all(...args);
    },
    run: (...args) => statement.run(...args),
  });
  return {
    prepare: sql => wrap(DB.prepare(sql), sql),
    batch: async statements => {
      const result = await DB.batch(statements.map(statement => statement.inner ?? statement));
      if (!fired) { fired = true; await action(); }
      return result;
    },
  };
}

test('a committed visitor message is acknowledged without leaking a conversation revoked before the response', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6);
    const delayed = afterVisitorWrite(db.DB, async () => {
      await db.DB.prepare("UPDATE chats SET key_hash='expired:'||id WHERE id=?").bind(id).run();
      assert.equal((await reply(db.DB, id)).status, 201);
    });
    const response = await invoke(visitorRoutes, 'POST', '/chat/messages', { DB: delayed },
      { bearer: key(1), body: { text: 'Accepted visitor message' } });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.deepEqual(payload, { accepted: true, chat_state: 'ended' });
    assert.ok(!JSON.stringify(payload).includes('Human reply'));
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 3);
  } finally { await db.dispose(); }
});

test('a response-read failure after commit acknowledges the write without inviting a duplicate', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6), delayed = afterVisitorWrite(db.DB, async () => {}, { failResponseRead: true });
    const response = await invoke(visitorRoutes, 'POST', '/chat/messages', { DB: delayed },
      { bearer: key(1), body: { text: 'Accepted visitor message' } });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { accepted: true, chat_state: 'unknown' });
    assert.equal((await db.DB.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE chat_id=?').bind(id).first()).n, 2);
  } finally { await db.dispose(); }
});

const offsetTimestamp = (time, offsetMinutes) => {
  const shifted = new Date(time + offsetMinutes * 60000).toISOString().replace('Z', '');
  const sign = offsetMinutes < 0 ? '-' : '+', absolute = Math.abs(offsetMinutes);
  return `${shifted}456${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
};

test('unparseable or impossible last activity fails closed and a human reply invalidates the key', async () => {
  const db = await database();
  try {
    const values = ['not-a-date', '9999-13-01T12:00:00.000Z', '9999-02-30T12:00:00.000Z', '9999-01-01T24:30:00Z', '9999-01-01T24:00:00.001Z'];
    for (const [index, value] of values.entries()) {
      const n = index + 10, id = await seed(db.DB, 6, n);
      await db.DB.prepare('UPDATE chats SET last_at=? WHERE id=?').bind(value, id).run();
      await assert.rejects(read(db.DB, n), error => error.status === 401);
      await assert.rejects(invoke(visitorRoutes, 'POST', '/chat/messages', { DB: db.DB },
        { bearer: key(n), body: { text: 'Message' } }), error => error.status === 401);
      await assert.rejects(invoke(visitorRoutes, 'DELETE', '/chat', { DB: db.DB }, { bearer: key(n) }),
        error => error.status === 401);
      assert.equal((await reply(db.DB, id)).status, 201);
      assert.equal((await db.DB.prepare("SELECT COUNT(*) AS n FROM chats WHERE id=? AND key_hash = 'expired:' || id").bind(id).first()).n, 1);
      await assert.rejects(read(db.DB, n), error => error.status === 401);
    }
  } finally { await db.dispose(); }
});

test('expiry compares instants for valid historical timezone offsets and fractional seconds', async () => {
  const db = await database();
  try {
    const live = await seed(db.DB, 6, 21), expired = await seed(db.DB, 6, 22);
    const now = Date.now();
    const liveAt = offsetTimestamp(now - 7 * 864e5 + 3 * 3600e3, -12 * 60);
    const expiredAt = offsetTimestamp(now - 7 * 864e5 - 3 * 3600e3, 14 * 60);
    await db.DB.batch([
      db.DB.prepare('UPDATE chats SET last_at=? WHERE id=?').bind(liveAt, live),
      db.DB.prepare('UPDATE chats SET last_at=? WHERE id=?').bind(expiredAt, expired),
    ]);
    assert.equal((await read(db.DB, 21)).status, 200);
    assert.equal((await invoke(visitorRoutes, 'POST', '/chat/messages', { DB: db.DB },
      { bearer: key(21), body: { text: 'Message' } })).status, 201);
    await assert.rejects(read(db.DB, 22), error => error.status === 401);
    await assert.rejects(invoke(visitorRoutes, 'DELETE', '/chat', { DB: db.DB }, { bearer: key(22) }),
      error => error.status === 401);
    assert.equal((await reply(db.DB, live)).status, 201);
    assert.equal((await reply(db.DB, expired)).status, 201);
    assert.equal((await db.DB.prepare("SELECT COUNT(*) AS n FROM chats WHERE id=? AND key_hash = 'expired:' || id").bind(live).first()).n, 0);
    assert.equal((await db.DB.prepare("SELECT COUNT(*) AS n FROM chats WHERE id=? AND key_hash = 'expired:' || id").bind(expired).first()).n, 1);
  } finally { await db.dispose(); }
});


test('a valid historical midnight at 24:00 with an offset remains interpretable', async () => {
  const db = await database();
  try {
    const id = await seed(db.DB, 6, 23);
    const day = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    await db.DB.prepare('UPDATE chats SET last_at=? WHERE id=?').bind(`${day}T24:00:00.000+00:00`, id).run();
    assert.equal((await read(db.DB, 23)).status, 200);
  } finally { await db.dispose(); }
});
