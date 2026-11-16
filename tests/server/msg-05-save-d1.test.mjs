import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, call, adminCookie } from './helpers.mjs';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery } = require('wrangler');
const migrations = new URL('../../migrations/', import.meta.url);

// MSG-05 on local D1 (miniflare), all migrations through 0098, synthetic data: the save's batch on the real engine
// (guard, last_insert_rowid between statements, rollback), the same key twice, two tabs, and the contact's erasure.
test('D1: Save from a chat is one batch, idempotent by key, guarded by the chat version', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('fixture') } }",
    compatibilityDate: '2025-10-01', host: '127.0.0.1', port: 0, d1Databases: { DB: 'msg05-save-synthetic' } }));
  try {
    const DB = await mf.getD1Database('DB');
    for (const file of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) {
      const statements = unstable_splitSqlQuery(readFileSync(new URL(file, migrations), 'utf8')).map(sql => DB.prepare(sql));
      if (statements.length) await DB.batch(statements);
    }
    const ts = new Date().toISOString(), cookie = await adminCookie();
    await DB.prepare('INSERT INTO admins(email,added_at) VALUES (?,?)').bind('admin@example.test', ts).run();
    const addChat = async email => (await DB.prepare(`INSERT INTO chats(key_hash,name,email,privacy_ack_at,created_at,last_at)
      VALUES(?,?,?,?,?,?)`).bind(`hash-${email}`, 'Synthetic Visitor', email, ts, ts, ts).run()).meta.last_row_id;
    const count = async sql => (await DB.prepare(`SELECT COUNT(*) n FROM ${sql}`).first()).n;
    const env = { ...makeEnv(), DB, MSG03_CONTACT_LINK_READY: '1', MSG05_CREATE_READY: '1' };
    const body = (key, extra = {}) => ({ name: 'Synthetic Visitor', email: 'd1-visitor@example.test', source: 'email', operation: 'rent',
      budget_max: 2500, area_answer: 'any', version: 0, operation_key: key, ...extra });
    const save = (id, b) => call(env, 'POST', `/admin/chats/${id}/applicant`, { cookie, body: b });

    const chat = await addChat('d1-visitor@example.test');
    const key = 'd1-fixture-key-0001';
    const both = await Promise.all([save(chat, body(key)), save(chat, body(key))]);
    assert.deepEqual(both.map(r => r.status).sort(), [200, 201]);
    const id = both[0].data.id;
    assert.equal(both[1].data.id, id);
    const a = await DB.prepare('SELECT contact_id FROM applicants WHERE id = ?').bind(id).first();
    assert.deepEqual(await DB.prepare('SELECT applicant_id, contact_id FROM chat_applicant_saves').first(), { applicant_id: id, contact_id: a.contact_id });
    assert.deepEqual(await DB.prepare('SELECT contact_id, contact_version FROM chats WHERE id = ?').bind(chat).first(),
      { contact_id: a.contact_id, contact_version: 1 });
    assert.equal(await count(`events WHERE type = 'applicant.created' AND entity_id = '${id}'`), 1);
    assert.equal(await count(`events WHERE type = 'contact.chat_linked' AND entity_id = '${a.contact_id}'`), 1);

    // A stale tab with another key: 409, nothing written.
    assert.equal((await save(chat, body('d1-fixture-key-0002', { email: 'd1-other@example.test' }))).status, 409);
    assert.equal(await count('contacts'), 1);

    // A chat deleted between the read and the batch: the guard rolls back the contact and the search.
    const gone = await addChat('d1-gone@example.test'), batch = DB.batch.bind(DB);
    env.DB = { prepare: s => DB.prepare(s), batch: async stmts => {
      await DB.prepare('DELETE FROM chats WHERE id = ?').bind(gone).run();
      return batch(stmts);
    } };
    assert.equal((await save(gone, body('d1-fixture-key-0003', { email: 'd1-gone@example.test' }))).status, 404);
    env.DB = DB;
    assert.equal(await count('contacts'), 1);
    assert.equal(await count('applicants'), 1);
    assert.equal(await count('chat_applicant_saves'), 1);

    // The contact erased: the save's row keeps no reference, the retry says so and creates nothing.
    await DB.batch([DB.prepare('DELETE FROM applicants WHERE contact_id = ?').bind(a.contact_id),
      DB.prepare('DELETE FROM contacts WHERE id = ?').bind(a.contact_id)]);
    assert.deepEqual(await DB.prepare('SELECT applicant_id, contact_id FROM chat_applicant_saves').first(), { applicant_id: null, contact_id: null });
    assert.equal((await save(chat, body(key))).status, 409);
    assert.equal(await count('applicants'), 0);
  } finally { await mf.dispose(); }
});
