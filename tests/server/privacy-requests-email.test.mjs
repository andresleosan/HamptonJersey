import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeEnv, call, adminCookie } from './helpers.mjs';

// PRE-12: a privacy request recorded from a received email in the panel. Synthetic people only.
const on = () => ({ ...makeEnv(), PRE12_REQUESTS_READY: '1' });
const BASE = '/admin/privacy-requests';
// 23:30 UTC in July is 00:30 the next day in Jersey (BST): the request takes the Jersey day.
const AT = '2026-07-14T23:30:00.000Z';

const inbound = env => Number(env.DB.raw.prepare(`INSERT INTO email_inbound(dedupe_key,sender,header_from,recipient,subject,text,
  html_only,truncated,received_at) VALUES(?,'pre12-person@example.test','pre12-person@example.test','team@example.test',
  'Please send me my data','My name is Synthetic Person and I want a copy.',0,0,?)`).run(randomUUID(), AT).lastInsertRowid);
const fromEmail = (env, cookie, emailId, over = {}) => call(env, 'POST', BASE, { cookie, origin: over.origin,
  body: { id: over.id ?? randomUUID(), kind: 'access', email_id: emailId, ...over.body } });
const count = (env, table) => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('from an email: received by email on its Jersey day, with a reference naming the email and nothing of its content', async () => {
  const env = on(), cookie = await adminCookie(), emailId = inbound(env), id = randomUUID();
  // What the browser sends for these three is ignored: they come from the email itself.
  const r = await fromEmail(env, cookie, emailId, { id, body: { received_via: 'phone', received_on: '2026-11-01',
    reference: 'anything' } });
  assert.equal(r.status, 201, r.text);
  const req = r.data.request;
  assert.equal(req.received_via, 'email');
  assert.equal(req.received_on, '2026-07-15');
  assert.equal(req.reference, `Email HE-IN-${emailId}, received 2026-07-15`);
  for (const copied of ['Please send me my data', 'Synthetic Person', 'pre12-person@example.test'])
    assert.equal(req.reference.includes(copied), false, copied);
  // Recorded like any other request: no contact, no identity, open, and nothing sent or deleted.
  assert.equal(req.contact, null);
  assert.equal(req.identity, null);
  assert.equal(req.state, 'open');
  assert.equal(count(env, 'email_inbound'), 1);
  assert.equal(count(env, 'outbound'), 0);
  assert.deepEqual(env.DB.raw.prepare('SELECT action FROM privacy_request_audit WHERE request_id=?').all(id).map(a => a.action),
    ['created']);
  // A repeated save returns the same request.
  const again = await fromEmail(env, cookie, emailId, { id });
  assert.equal(again.status, 200, again.text);
  assert.equal(again.data.request.id, id);
});

test('from an email: an email that does not exist is 404, an invalid one is 400, and nothing is written', async () => {
  const env = on(), cookie = await adminCookie();
  assert.equal((await fromEmail(env, cookie, 999)).status, 404);
  for (const bad of [0, -1, 1.5, '1', true]) {
    const r = await fromEmail(env, cookie, bad);
    assert.equal(r.status, 400, `${bad}`);
    assert.ok(r.data.fields.email_id, `${bad}`);
  }
  assert.equal(count(env, 'privacy_requests'), 0);
  // Without an email the usual fields are still required.
  const plain = await call(env, 'POST', BASE, { cookie, body: { id: randomUUID(), kind: 'access' } });
  assert.equal(plain.status, 400);
});

test('from an email: signed-out is 401, another site is 403, a non-member is 401, switched off is 404', async () => {
  const env = on(), emailId = inbound(env);
  assert.equal((await fromEmail(env, undefined, emailId)).status, 401);
  assert.equal((await fromEmail(env, await adminCookie(), emailId, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await fromEmail(env, await adminCookie('outsider@example.test'), emailId)).status, 401);
  assert.equal(count(env, 'privacy_requests'), 0);
  const off = makeEnv(), offEmail = inbound(off);
  assert.equal((await fromEmail(off, await adminCookie(), offEmail)).status, 404);
});
