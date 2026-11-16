import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie } from './helpers.mjs';
import { canSendForPurpose, setCommunicationPreference } from '../../server/communication-preferences.js';

// PRE-10: synthetic people only.
const form = { operation: 'rent', name: 'Synthetic person', email: 'pre10-purpose@example.test', phone: '+447700900654',
  budget_max: 2000, bedrooms_min: 1, privacy: true, turnstile: 'fixture' };
const T = '2026-11-16T09:00:00.000Z';
const on = () => ({ ...makeEnv(), PRE10_PURPOSE_READY: '1' });
function person(env, { email = form.email, phone = form.phone, optIn = T } = {}) {
  const db = env.DB.raw;
  const id = Number(db.prepare(`INSERT INTO contacts (name,email,phone,marketing_opt_in_at,last_activity_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)`).run(form.name, email, phone, optIn, T, T, T).lastInsertRowid);
  const a = Number(db.prepare(`INSERT INTO applicants (contact_id,operation,source,search_state,created_at,updated_at)
    VALUES (?,'rent','phone','active',?,?)`).run(id, T, T).lastInsertRowid);
  return { id, applicant: a };
}
const contact = (env, id) => env.DB.raw.prepare('SELECT * FROM contacts WHERE id=?').get(id);
const events = (env, id, type) => env.DB.raw.prepare(`SELECT actor,data FROM events WHERE entity_type='contact' AND entity_id=?
  AND type=? ORDER BY id`).all(String(id), type);
const grant = (env, id, purpose, channel, version = contact(env, id).updated_at) => setCommunicationPreference(env,
  { contact_id: id, purpose, channel, value: 'granted', source: 'web', notice_version: 'fixture-v1', expected_revision: version }, 'public');
const object = (env, id, body, cookie) => call(env, 'POST', `/admin/contacts/${id}/marketing-objection`,
  { cookie, body: { updated_at: contact(env, id).updated_at, purpose: 'all', channel: 'all', source: 'phone', ...body } });
async function withTurnstile(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: 'hampton.test' }));
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test('switched off: no route, no preferences in the record, the panel opt-in as today and nothing may be sent', async () => {
  const env = makeEnv(), { id, applicant } = person(env, { optIn: null }), cookie = await adminCookie();
  assert.equal((await object(env, id, {}, cookie)).status, 404);
  const detail = await call(env, 'GET', `/admin/applicants/${applicant}`, { cookie });
  assert.equal(detail.status, 200);
  assert.equal('marketing_preferences' in detail.data, false);
  const regrant = await call(env, 'PUT', `/admin/contacts/${id}`, { cookie, body: { updated_at: T, marketing: true } });
  assert.equal(regrant.status, 200);
  assert.ok(regrant.data.contact.marketing_opt_in_at);
  assert.deepEqual(await canSendForPurpose(env, { contact_id: id, purpose: 'news', channel: 'email' }),
    { allowed: false, reason: 'switch_off', revision: 0 });
});

test('the website news consent allows news by email only, never a valuation offer or another channel', async () => {
  const env = on(), { id, applicant } = person(env), cookie = await adminCookie();
  assert.equal((await canSendForPurpose(env, { contact_id: id, purpose: 'news', channel: 'email' })).allowed, true);
  for (const [purpose, channel] of [['valuation_offer', 'email'], ['property_alerts', 'email'], ['news', 'phone'], ['news', 'sms']])
    assert.deepEqual(await canSendForPurpose(env, { contact_id: id, purpose, channel }),
      { allowed: false, reason: 'no_consent', revision: 0 }, `${purpose} ${channel}`);
  assert.equal((await canSendForPurpose(env, { contact_id: 999, purpose: 'news', channel: 'email' })).reason, 'no_contact');
  assert.equal((await canSendForPurpose(env, { contact_id: id, purpose: 'promotions', channel: 'email' })).reason, 'unknown_scope');
  const { data } = await call(env, 'GET', `/admin/applicants/${applicant}`, { cookie });
  assert.equal(data.marketing_preferences.length, 9);
  assert.deepEqual(data.marketing_preferences.filter(p => p.state !== 'none'), [{ purpose: 'news', channel: 'email', state: 'granted' }]);
});

test('an objection by phone to one purpose and channel leaves the other channels and purposes as they were', async () => {
  const env = on(), { id } = person(env), cookie = await adminCookie();
  await grant(env, id, 'property_alerts', 'phone');
  await grant(env, id, 'property_alerts', 'sms');
  const r = await object(env, id, { purpose: 'property_alerts', channel: 'phone' }, cookie);
  assert.equal(r.status, 200);
  assert.deepEqual(await canSendForPurpose(env, { contact_id: id, purpose: 'property_alerts', channel: 'phone' }),
    { allowed: false, reason: 'objected', revision: 2 });
  assert.equal((await canSendForPurpose(env, { contact_id: id, purpose: 'property_alerts', channel: 'sms' })).allowed, true);
  assert.equal((await canSendForPurpose(env, { contact_id: id, purpose: 'news', channel: 'email' })).allowed, true);
  assert.ok(contact(env, id).marketing_opt_in_at, 'news by email untouched');
  assert.deepEqual(r.data.marketing_preferences.filter(p => p.state !== 'none').map(p => `${p.purpose}:${p.channel}:${p.state}`),
    ['news:email:granted', 'property_alerts:phone:objected', 'property_alerts:sms:granted']);
  const [event] = events(env, id, 'contact.marketing_preference').slice(-1);
  assert.equal(event.actor, 'admin@example.test');
  assert.deepEqual(JSON.parse(event.data), { value: 'objected', source: 'phone', pairs: [['property_alerts', 'phone']] });
  assert.equal(events(env, id, 'contact.consent_changed').length, 0);
});

test('an objection to all marketing clears the news opt-in once, logs no personal data and sends nothing', async () => {
  const env = on(), { id } = person(env), cookie = await adminCookie();
  const r = await object(env, id, { source: 'email', evidence_ref: 'inbox:42' }, cookie);
  assert.equal(r.status, 200);
  assert.equal(r.data.marketing_preferences.every(p => p.state === 'objected'), true);
  const after = contact(env, id);
  assert.equal(after.marketing_opt_in_at, null);
  assert.ok(after.updated_at > T);
  const consent = events(env, id, 'contact.consent_changed');
  assert.deepEqual(consent.map(e => JSON.parse(e.data)), [{ before: { marketing_opt_in_at: T }, after: { marketing_opt_in_at: null } }]);
  const ledger = events(env, id, 'contact.marketing_preference');
  assert.equal(ledger.length, 1);
  assert.equal(JSON.parse(ledger[0].data).pairs.length, 9);
  for (const e of [...consent, ...ledger]) for (const v of [form.email, form.phone, form.name, 'inbox:42']) assert.ok(!e.data.includes(v));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM outbound').get().n, 0, 'no confirmation email is written');
  // The same objection again changes nothing and writes no event.
  const again = await object(env, id, { source: 'letter' }, cookie);
  assert.equal(again.status, 200);
  assert.equal(contact(env, id).updated_at, after.updated_at);
  assert.equal(events(env, id, 'contact.marketing_preference').length, 1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM marketing_preferences WHERE source='letter'").get().n, 0);
});

test('two objections on the same version: one applies, the other is 409 and nothing of it is written', async () => {
  const env = on(), { id } = person(env), cookie = await adminCookie();
  const body = { updated_at: T, purpose: 'news', channel: 'all', source: 'phone' };
  const results = await Promise.all([1, 2].map(() => call(env, 'POST', `/admin/contacts/${id}/marketing-objection`, { cookie, body })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(events(env, id, 'contact.marketing_preference').length, 1);
  assert.equal(env.DB.raw.prepare('SELECT MAX(revision) r FROM marketing_preferences').get().r, 1);
  const stale = await call(env, 'POST', `/admin/contacts/${id}/marketing-objection`,
    { cookie, body: { ...body, purpose: 'valuation_offer' } });
  assert.equal(stale.status, 409);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM marketing_preferences WHERE purpose='valuation_offer'").get().n, 0);
});

test('bad input, a consent from the panel and an unknown contact are refused', async () => {
  const env = on(), { id } = person(env), other = person(env, { email: 'other@example.test', phone: '+447700900655' });
  const cookie = await adminCookie();
  for (const body of [{ purpose: 'promotions' }, { channel: 'whatsapp' }, { source: 'web' }, { source: 'notes' },
    { evidence_ref: 'Call with Synthetic person' }, { updated_at: undefined }])
    assert.equal((await object(env, id, body, cookie)).status, 400, JSON.stringify(body));
  assert.equal((await object(env, id, {}, null)).status, 401);
  assert.equal((await call(env, 'POST', '/admin/contacts/999/marketing-objection',
    { cookie, body: { updated_at: T, purpose: 'all', channel: 'all', source: 'phone' } })).status, 404);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM marketing_preferences').get().n, 0);
  assert.equal(contact(env, other.id).marketing_opt_in_at, T);
  await assert.rejects(setCommunicationPreference(env, { contact_id: id, purpose: 'news', channel: 'phone', value: 'granted',
    source: 'phone', notice_version: 'fixture-v1', expected_revision: T }, 'admin@example.test'), { status: 400 });
  await assert.rejects(setCommunicationPreference(env, { contact_id: id, purpose: 'all', channel: 'email', value: 'granted',
    source: 'web', notice_version: 'fixture-v1', expected_revision: T }, 'public'), { status: 400 });
});

test('an old objection is not re-enabled by an import or the panel, only by a later website opt-in', async () => {
  const env = on(), { id } = person(env), cookie = await adminCookie();
  await grant(env, id, 'valuation_offer', 'email');
  assert.equal((await object(env, id, {}, cookie)).status, 200);
  // An import or any write that is not the website form cannot store a consent.
  assert.throws(() => env.DB.raw.prepare(`UPDATE marketing_preferences SET value='granted', source='phone', notice_version='x'
    WHERE contact_id=?`).run(id), /CHECK/);
  assert.throws(() => env.DB.raw.prepare(`UPDATE marketing_preferences SET value='granted' WHERE contact_id=?`).run(id), /CHECK/);
  // The panel cannot record an opt-in with no website request waiting.
  const version = contact(env, id).updated_at;
  const panel = await call(env, 'PUT', `/admin/contacts/${id}`, { cookie, body: { updated_at: version, marketing: true } });
  assert.equal(panel.status, 409);
  assert.equal(contact(env, id).marketing_opt_in_at, null);
  // A website registration after the objection, confirmed by the team, allows news by email again (and only that).
  await withTurnstile(() => call(env, 'POST', '/applicants', { body: { ...form, marketing: true } }));
  await new Promise(r => setTimeout(r, 2));
  const confirmed = await call(env, 'PUT', `/admin/contacts/${id}`, { cookie, body: { updated_at: contact(env, id).updated_at, marketing: true } });
  assert.equal(confirmed.status, 200);
  assert.equal((await canSendForPurpose(env, { contact_id: id, purpose: 'news', channel: 'email' })).allowed, true);
  assert.equal((await canSendForPurpose(env, { contact_id: id, purpose: 'valuation_offer', channel: 'email' })).allowed, false);
  // A new objection then clears it again, though its row already said objected.
  await new Promise(r => setTimeout(r, 2));
  assert.equal((await object(env, id, { purpose: 'news', channel: 'email' }, cookie)).status, 200);
  assert.equal(contact(env, id).marketing_opt_in_at, null);
  assert.equal((await canSendForPurpose(env, { contact_id: id, purpose: 'news', channel: 'email' })).reason, 'objected');
});

test('a website consent for another purpose is granted once, per channel, and its notice version is kept', async () => {
  const env = on(), { id } = person(env, { optIn: null });
  const first = await grant(env, id, 'property_alerts', 'email');
  assert.deepEqual(first.changed, [['property_alerts', 'email']]);
  const again = await grant(env, id, 'property_alerts', 'email');
  assert.deepEqual(again.changed, []);
  const row = env.DB.raw.prepare('SELECT value,source,notice_version,revision FROM marketing_preferences WHERE contact_id=?').get(id);
  assert.deepEqual({ ...row }, { value: 'granted', source: 'web', notice_version: 'fixture-v1', revision: 1 });
  assert.equal(contact(env, id).marketing_opt_in_at, null, 'property alerts are not news');
  await grant(env, id, 'news', 'email');
  assert.ok(contact(env, id).marketing_opt_in_at);
  assert.equal(contact(env, id).consent_source, 'web');
  assert.equal((await canSendForPurpose(env, { contact_id: id, purpose: 'news', channel: 'email' })).allowed, true);
});

test('an objection cancels the queued promotional emails of those purposes and nothing else', async () => {
  const env = on(), { id } = person(env), cookie = await adminCookie();
  const queue = (template, entity) => env.DB.raw.prepare(`INSERT INTO outbound (ref,dedupe_key,template,entity_id,version,recipient,
    recipient_hash,subject,text,status,approved_by,approved_at,created_at,updated_at)
    VALUES (?,?,?,?,1,?,'h','Subject','Text','queued','admin@example.test',?,?,?)`)
    .run(`${template}${entity}`, `${template}${entity}`, template, String(entity), form.email, T, T, T);
  queue('marketing.news', id); queue('marketing.valuation_offer', id); queue('team_summary', id); queue('marketing.news', id + 1);
  assert.equal((await object(env, id, { purpose: 'news', channel: 'email' }, cookie)).status, 200);
  assert.deepEqual(env.DB.raw.prepare('SELECT template,entity_id,status FROM outbound ORDER BY id').all().map(r => `${r.template}:${r.entity_id}:${r.status}`),
    [`marketing.news:${id}:cancelled`, `marketing.valuation_offer:${id}:queued`, `team_summary:${id}:queued`, `marketing.news:${id + 1}:queued`]);
  assert.equal((await object(env, id, { purpose: 'all', channel: 'phone' }, cookie)).status, 200);
  assert.equal(env.DB.raw.prepare("SELECT status FROM outbound WHERE template='marketing.valuation_offer'").get().status, 'queued',
    'an objection by phone does not touch email');
});

test('erasing the contact erases its preferences', async () => {
  const env = on(), { id, applicant } = person(env), cookie = await adminCookie();
  assert.equal((await object(env, id, {}, cookie)).status, 200);
  env.DB.raw.prepare('UPDATE applicants SET archived_at=? WHERE id=?').run(T, applicant);
  const r = await call(env, 'DELETE', `/admin/applicants/${applicant}`, { cookie, body: { confirm: form.name } });
  assert.equal(r.status, 200, r.text);
  assert.equal(contact(env, id), undefined);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM marketing_preferences').get().n, 0);
});
