import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeEnv, call, adminCookie } from './helpers.mjs';
import { canSendForPurpose } from '../../server/communication-preferences.js';
import { dispatchEmail } from '../../server/email.js';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { unstable_splitSqlQuery } = require('wrangler');
const migrations = new URL('../../migrations/', import.meta.url);

// PRE-10 on local D1 (miniflare), all migrations through 0096, synthetic data: the rule's SQL, the compare-and-set
// between two objections, the pre-send check and the erasure cascade.
test('D1: per-purpose objection, compare-and-set, pre-send check and erasure', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: "export default { fetch() { return new Response('fixture') } }",
    compatibilityDate: '2025-10-01', host: '127.0.0.1', port: 0, d1Databases: { DB: 'pre10-purpose-synthetic' } }));
  try {
    const DB = await mf.getD1Database('DB');
    for (const file of readdirSync(migrations).filter(n => n.endsWith('.sql')).sort()) {
      const statements = unstable_splitSqlQuery(readFileSync(new URL(file, migrations), 'utf8')).map(sql => DB.prepare(sql));
      if (statements.length) await DB.batch(statements);
    }
    const ts = new Date().toISOString(), cookie = await adminCookie();
    await DB.prepare('INSERT INTO admins(email,added_at) VALUES (?,?)').bind('admin@example.test', ts).run();
    await DB.prepare(`INSERT INTO contacts(name,email,phone,marketing_opt_in_at,last_activity_at,created_at,updated_at)
      VALUES('Synthetic person','pre10-d1-purpose@example.test','+447700900888',?,?,?,?)`).bind(ts, ts, ts, ts).run();
    await DB.prepare(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES('email',?,?,'admin@example.test')`)
      .bind(JSON.stringify({ enabled: true, summary: false, recipients: [], revision: 1 }), ts).run();
    const sent = [];
    const env = { ...makeEnv(), DB, PRE10_PURPOSE_READY: '1', EMAIL_SERVICE_READY: 'true',
      EMAIL: { async send(m) { sent.push(m.to); return { messageId: `fixture-${sent.length}` }; } } };
    assert.equal((await canSendForPurpose(env, { contact_id: 1, purpose: 'news', channel: 'email' })).allowed, true);
    assert.equal((await canSendForPurpose(env, { contact_id: 1, purpose: 'valuation_offer', channel: 'email' })).reason, 'no_consent');

    const body = { updated_at: ts, purpose: 'all', channel: 'all', source: 'phone' };
    const results = await Promise.all([1, 2].map(() => call(env, 'POST', '/admin/contacts/1/marketing-objection', { cookie, body })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM marketing_preferences').first()).n, 9);
    assert.equal((await DB.prepare("SELECT COUNT(*) n FROM events WHERE type='contact.marketing_preference'").first()).n, 1);
    assert.equal((await DB.prepare('SELECT marketing_opt_in_at m FROM contacts WHERE id=1').first()).m, null);
    assert.equal((await canSendForPurpose(env, { contact_id: 1, purpose: 'news', channel: 'email' })).reason, 'objected');

    await DB.prepare(`INSERT INTO outbound(ref,dedupe_key,template,entity_id,version,recipient,recipient_hash,subject,text,status,
      approved_by,approved_at,created_at,updated_at) VALUES('r1','k1','marketing.news','1',1,'pre10-d1-purpose@example.test','h',
      'Subject','Text','queued','admin@example.test',?,?,?)`).bind(ts, ts, ts).run();
    await dispatchEmail(env, () => ts);
    assert.deepEqual(sent, []);

    await DB.batch([DB.prepare('DELETE FROM applicants WHERE contact_id=1'), DB.prepare('DELETE FROM contacts WHERE id=1')]);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM marketing_preferences').first()).n, 0);
  } finally { await mf.dispose(); }
});
