// Disposable local D1 (Miniflare); no remote database, production data or external requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, call, adminCookie, T0 } from './helpers.mjs';
import { person } from './age-14-fixtures.mjs';

const ROOT = new URL('../../', import.meta.url);
const require = createRequire(new URL('package.json', ROOT));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery: split } = require('wrangler');

test('D1 local: removal is atomic and the tombstone refuses any restoring write', async t => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, host: '127.0.0.1', port: 0, compatibilityDate: '2025-10-01',
    script: 'export default {fetch(){return new Response("fixture")}}', d1Databases: { DB: 'age14-suppression-synthetic' } }));
  try {
    const DB = await mf.getD1Database('DB'), dir = new URL('migrations/', ROOT);
    for (const file of readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
      const statements = split(readFileSync(new URL(file, dir), 'utf8'));
      if (statements.length) await DB.batch(statements.map(sql => DB.prepare(sql)));
    }
    await DB.prepare("INSERT INTO admins(email,added_at) VALUES('admin@example.test',?)").bind(T0).run();
    const env = { ...makeEnv(), DB, AGE14_SUPPRESSION_READY: '1' }, cookie = await adminCookie();
    const req = (method, path, body) => call(env, method, path, { cookie, body });
    const get = (sql, ...args) => DB.prepare(sql).bind(...args).first();
    const queue = id => DB.prepare(`INSERT INTO outbound(ref,dedupe_key,template,entity_id,version,recipient,recipient_hash,status,approved_at,created_at,updated_at)
      VALUES(?,?,'synthetic','1',1,'person.one@example.test','hash','queued',?,?,?)`).bind(`r${id}`, `k${id}`, T0, T0, T0).run();
    const create = async () => (await req('POST', '/admin/advertisers', person)).data.advertiser;
    const remove = async id => { const p = (await req('GET', `/admin/advertisers/${id}/suppression`)).data;
      return req('POST', `/admin/advertisers/${id}/suppression`, { version: p.version, preview_hash: p.preview_hash, reason: 'no_longer_needed' }); };

    await t.test('atomic_rollback: a failing later statement leaves record, audit and queue untouched', async () => {
      const a = await create(); await queue(1);
      await DB.prepare("CREATE TRIGGER fixture_outbound_abort BEFORE UPDATE ON outbound BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
      assert.equal((await remove(a.id)).status, 500);
      await DB.prepare('DROP TRIGGER fixture_outbound_abort').run();
      const row = await get('SELECT name, details, suppressed_at, version FROM advertisers WHERE id=?', a.id);
      assert.deepEqual([row.name, row.suppressed_at, row.version], [person.name, null, a.version]);
      assert.equal(JSON.parse(row.details).contacts.length, 1);
      assert.equal((await get('SELECT COUNT(*) n FROM advertiser_suppressions')).n, 0);
      assert.equal((await get("SELECT status FROM outbound WHERE ref='r1'")).status, 'queued');
      const ok = await remove(a.id);
      assert.equal(ok.status, 200); assert.equal(ok.data.cancelled_outbound, 1);
      assert.equal((await get("SELECT status FROM outbound WHERE ref='r1'")).status, 'cancelled');
    });

    await t.test('the trigger refuses any write that would restore a removed record', async () => {
      const a = await create(); assert.equal((await remove(a.id)).status, 200);
      const stored = await get('SELECT * FROM advertisers WHERE id=?', a.id);
      for (const sql of ["UPDATE advertisers SET name='Synthetic Private Person' WHERE id=?", "UPDATE advertisers SET details='{}' WHERE id=?",
        "UPDATE advertisers SET suppressed_at=NULL WHERE id=?", "UPDATE advertisers SET kind='agency' WHERE id=?"])
        await assert.rejects(DB.prepare(sql).bind(a.id).run(), /personal data was removed/);
      assert.deepEqual(await get('SELECT * FROM advertisers WHERE id=?', a.id), stored);
      assert.equal((await req('PUT', `/admin/advertisers/${a.id}`, { ...person, version: stored.version })).status, 409);
    });
  } finally { await mf.dispose(); }
});
