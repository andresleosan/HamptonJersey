// AGE-14 preview: what a removal would change and which copies stay elsewhere. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie, T0 } from './helpers.mjs';
import { person, ready, request, made, outbound } from './age-14-fixtures.mjs';

const preview = async (env, id) => request(env, 'GET', `/admin/advertisers/${id}/suppression`);
test('flag off: no preview route, and the directory says removal is unavailable', async () => {
  const env = makeEnv(), a = await made(env);
  assert.equal((await preview(env, a.id)).status, 404);
  assert.equal((await request(env, 'GET', '/admin/advertisers')).data.suppression, false);
  assert.equal((await request(ready(), 'GET', '/admin/advertisers')).data.suppression, true);
});

test('preview is staff-only, read-only and lists individual name, contact name, email and phone by path', async () => {
  const env = ready(), a = await made(env);
  assert.equal((await call(env, 'GET', `/admin/advertisers/${a.id}/suppression`)).status, 401);
  assert.equal((await preview(env, 'x')).status, 404);
  assert.equal((await preview(env, 999)).status, 404);
  const before = env.DB.raw.prepare('SELECT * FROM advertisers').all();
  const p = (await preview(env, a.id)).data;
  // individual_name_in_scope, contact_phone_in_scope
  assert.deepEqual(p.affected_fields, ['name', 'contacts.0.name', 'contacts.0.email', 'contacts.0.phones.0']);
  assert.deepEqual(p.kept_fields, ['kind', 'channels', 'source_ids', 'listing_ids', 'commission', 'photo_permission', 'reviews']);
  assert.equal(p.version, a.version); assert.match(p.preview_hash, /^[0-9a-f]{64}$/);
  assert.equal(p.complete, true); assert.deepEqual(p.blockers, []);
  // preview_does_not_delete and never echoes the values it would remove
  assert.deepEqual(env.DB.raw.prepare('SELECT * FROM advertisers').all(), before);
  for (const secret of ['Synthetic Private Person', 'Synthetic Contact', 'person.one', '900111']) assert.ok(!JSON.stringify(p).toLowerCase().includes(secret.toLowerCase()), secret);
  const agency = await made(env, { ...person, kind: 'agency', name: 'Synthetic Agency' });
  assert.equal((await preview(env, agency.id)).data.affected_fields[0], 'contacts.0.name');
});

test('email copies are detected and reported without being deleted', async () => {
  const env = ready(), a = await made(env);
  outbound(env, 'person.one@example.test', 'queued'); outbound(env, 'person.one@example.test', 'accepted');
  env.DB.raw.prepare(`INSERT INTO email_inbound(dedupe_key,sender,header_from,recipient,subject,text,html_only,truncated,received_at)
    VALUES('k1','other@example.test','"Person" <PERSON.ONE@example.test>','team@example.test','Hi','Body',0,0,?)`).run(T0);
  const p = (await preview(env, a.id)).data;
  const by = Object.fromEntries(p.related_materializations.map(m => [m.source, m]));
  assert.deepEqual(by.outbound_pending, { source: 'outbound_pending', count: 1, handling: 'cancelled_on_removal' });
  assert.deepEqual(by.outbound_sent, { source: 'outbound_sent', count: 1, handling: 'kept_by_email_retention' });
  assert.deepEqual(by.email_inbound, { source: 'email_inbound', count: 1, handling: 'kept_by_email_retention' });
  assert.equal(p.complete, false);
  assert.deepEqual(p.blockers.map(b => b.source).sort(), ['email_inbound', 'outbound_sent']);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM email_inbound').get().n, 1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM outbound WHERE status='queued'").get().n, 1);
});

test('market and research copies are detected; a missing table is absent, a failed check is unknown', async () => {
  const env = ready();
  env.DB.raw.prepare("INSERT INTO research_sources(source_id, property_id, agent_or_site) VALUES ('src-1','prop-1',' synthetic contact ')").run();
  const a = await made(env, { ...person, source_ids: ['src-1'] });
  env.DB.raw.exec('PRAGMA foreign_keys = OFF');
  env.DB.raw.prepare(`INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,normalized_sha256,source_at,origin_sha256)
    VALUES('o1','p1','s','c','k',?,'{}',?,?,?)`).run(JSON.stringify({ agent: { phone: '07700 900111' } }), 'a'.repeat(64), T0, 'b'.repeat(64));
  env.DB.raw.exec('PRAGMA foreign_keys = ON');
  let p = (await preview(env, a.id)).data;
  const by = Object.fromEntries(p.related_materializations.map(m => [m.source, m]));
  // market_contact_copy_detected
  assert.deepEqual(by.market_observations, { source: 'market_observations', count: 1, handling: 'kept_with_source' });
  assert.deepEqual(by.research_sources, { source: 'research_sources', count: 1, handling: 'kept_with_source' });
  assert.equal(p.complete, false);

  const absent = ready(), b = await made(absent);
  absent.DB.raw.exec('PRAGMA foreign_keys = OFF; DROP TABLE market_observations; PRAGMA foreign_keys = ON');
  p = (await preview(absent, b.id)).data;
  assert.equal(p.related_materializations.find(m => m.source === 'market_observations').handling, 'not_installed');
  assert.equal(p.complete, true);

  // unknown_copy_blocks_complete_claim
  const broken = ready(), c = await made(broken), prepare = broken.DB.prepare;
  broken.DB.prepare = sql => /FROM email_inbound/.test(sql) ? { bind: () => ({ first: async () => { throw new Error('D1_ERROR: synthetic timeout'); } }) } : prepare(sql);
  p = (await preview(broken, c.id)).data;
  assert.deepEqual(p.related_materializations.find(m => m.source === 'email_inbound'), { source: 'email_inbound', count: null, handling: 'could_not_check' });
  assert.equal(p.complete, false);
  assert.deepEqual(p.blockers, [{ source: 'email_inbound', reason: 'could_not_check' }]);
});
