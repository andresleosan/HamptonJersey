import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeEnv, call, adminCookie } from './helpers.mjs';

// PRE-12 (spec 2026-11-08, «POST sufijo /delivery»): a team member records that the reviewed copy was handed over outside
// the app (manual_handoff). Nothing is sent and the request stays open. Synthetic people only.
const T = '2026-11-10T09:00:00.000Z';
const BASE = '/admin/privacy-requests';
const EVIDENCE = 'Posted recorded delivery, receipt RD-SYNTH-0001';
const on = (schema = {}) => ({ ...makeEnv(schema), PRE12_REQUESTS_READY: '1' });

let n = 0;
function person(env) {
  const db = env.DB.raw, k = String(++n).padStart(2, '0');
  const id = Number(db.prepare(`INSERT INTO contacts (name,email,phone,last_activity_at,created_at,updated_at)
    VALUES ('Synthetic Person',?,?,?,?,?)`).run(`pre12-handover-${k}@example.test`, `+4477009001${k}`, T, T, T).lastInsertRowid);
  const applicant = Number(db.prepare(`INSERT INTO applicants (contact_id,operation,source,search_state,requirements,created_at,updated_at)
    VALUES (?,'buy','phone','active','Near a school',?,?)`).run(id, T, T).lastInsertRowid);
  return { id, applicant };
}
// An access request with its contact linked, the identity checked and, unless reviewed is false, the copy reviewed.
async function ready(env, cookie, { kind = 'access', reviewed = true } = {}) {
  const p = person(env);
  const made = await call(env, 'POST', BASE, { cookie, body: { id: randomUUID(), kind, received_on: '2026-11-12',
    received_via: 'email', reference: 'Email to the office' } });
  const id = made.data.request.id;
  let r = await call(env, 'POST', `${BASE}/${id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  r = await call(env, 'POST', `${BASE}/${id}/identity`, { cookie, body: { revision: r.data.request.revision, method: 'photo_id' } });
  assert.equal(r.status, 200, r.text);
  if (reviewed) {
    const { sha256 } = (await call(env, 'GET', `${BASE}/${id}/copy`, { cookie })).data;
    r = await call(env, 'POST', `${BASE}/${id}/copy-review`, { cookie, body: { revision: r.data.request.revision, sha256 } });
    assert.equal(r.status, 200, r.text);
  }
  return { p, request: r.data.request };
}
const deliver = (env, cookie, request, over = {}) => call(env, 'POST', `${BASE}/${request.id}/delivery`, { cookie,
  body: { revision: request.revision, method: 'manual_handoff', result: 'accepted', evidence_ref: EVIDENCE, ...over } });
const rows = env => env.DB.raw.prepare('SELECT * FROM privacy_request_deliveries ORDER BY id').all();

test('a handover is recorded with its evidence and result; nothing is sent and the request stays open', async () => {
  const env = on(), cookie = await adminCookie(), { request } = await ready(env, cookie);
  const r = await deliver(env, cookie, request, { evidence_ref: `  ${EVIDENCE}  `, result: 'unknown',
    actor: 'someone@else.test' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.request.state, 'open', 'a handover never closes the request');
  assert.equal(r.data.request.result, null);
  assert.equal(r.data.request.revision, request.revision + 1);
  const [d] = rows(env);
  assert.deepEqual({ ...d, id: undefined, at: undefined }, { id: undefined, request_id: request.id, revision: request.revision + 1,
    method: 'manual_handoff', copy_hash: request.copy_review.sha256, evidence_ref: EVIDENCE, result: 'unknown',
    actor: 'admin@example.test', at: undefined });
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM outbound').get().n, 0, 'nothing queued to send');
  // The request page lists it, with the copy it was for.
  const detail = await call(env, 'GET', `${BASE}/${request.id}`, { cookie });
  assert.deepEqual(detail.data.deliveries.map(x => [x.method, x.result, x.evidence_ref, x.actor, x.copy_hash]),
    [['manual_handoff', 'unknown', EVIDENCE, 'admin@example.test', request.copy_review.sha256]]);
  // A second record (for example once the person confirms receipt) is added, never replacing the first.
  const again = await deliver(env, cookie, r.data.request, { result: 'accepted', evidence_ref: 'Person confirmed by phone' });
  assert.equal(again.status, 200, again.text);
  assert.deepEqual(rows(env).map(x => x.result), ['unknown', 'accepted']);
  assert.equal(again.data.request.state, 'open');
  assert.throws(() => env.DB.raw.prepare("UPDATE privacy_request_deliveries SET result='accepted'").run(), /append-only/);
});

test('missing or invalid fields are refused with the field, and nothing is written', async () => {
  const env = on(), cookie = await adminCookie(), { request } = await ready(env, cookie);
  for (const [over, field] of [[{ evidence_ref: undefined }, 'evidence_ref'], [{ evidence_ref: '   ' }, 'evidence_ref'],
    [{ evidence_ref: 'x'.repeat(201) }, 'evidence_ref'], [{ result: 'delivered' }, 'result'], [{ result: undefined }, 'result'],
    [{ method: 'approved_email' }, 'method'], [{ method: undefined }, 'method']]) {
    const r = await deliver(env, cookie, request, over);
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.ok(r.data.fields?.[field], `${field}: ${r.text}`);
  }
  assert.equal((await deliver(env, cookie, request, { revision: undefined })).status, 400);
  assert.equal(rows(env).length, 0);
});

test('a stale revision is refused with 409 and writes nothing', async () => {
  const env = on(), cookie = await adminCookie(), { request } = await ready(env, cookie);
  const r = await deliver(env, cookie, request, { revision: request.revision - 1 });
  assert.equal(r.status, 409);
  assert.match(r.data.error, /Someone else changed this request/);
  assert.equal(rows(env).length, 0);
  assert.equal(env.DB.raw.prepare('SELECT revision FROM privacy_requests WHERE id=?').get(request.id).revision, request.revision);
});

test('refused without a reviewed copy, with a copy whose data changed, for a kind with no copy, and once closed', async () => {
  const env = on(), cookie = await adminCookie();
  const unreviewed = (await ready(env, cookie, { reviewed: false })).request;
  const none = await deliver(env, cookie, unreviewed);
  assert.equal(none.status, 409, none.text);
  assert.match(none.data.error, /Review the copy/);

  const { p, request } = await ready(env, cookie);
  env.DB.raw.prepare("UPDATE applicants SET requirements='Near the sea' WHERE id=?").run(p.applicant);
  const stale = await deliver(env, cookie, request);
  assert.equal(stale.status, 409, stale.text);
  assert.match(stale.data.error, /data changed after the review/);

  const erasure = (await ready(env, cookie, { kind: 'erasure', reviewed: false })).request;
  assert.equal((await deliver(env, cookie, erasure)).status, 400);

  const fresh = (await ready(env, cookie)).request;
  const closed = await call(env, 'POST', `${BASE}/${fresh.id}/close`, { cookie, body: { revision: fresh.revision, result: 'withdrawn' } });
  assert.equal(closed.status, 200, closed.text);
  const late = await deliver(env, cookie, closed.data.request);
  assert.equal(late.status, 409);
  assert.match(late.data.error, /closed/);
  assert.equal(rows(env).length, 0);
});

test('a review cleared meanwhile refuses the record in the same write', async () => {
  const env = on(), cookie = await adminCookie(), { request } = await ready(env, cookie);
  // A viewing decision clears the review without moving the revision (server/privacy-requests.js decideViewing).
  env.DB.raw.prepare('UPDATE privacy_requests SET copy_hash=NULL, copy_reviewed_by=NULL, copy_reviewed_at=NULL WHERE id=?').run(request.id);
  const r = await deliver(env, cookie, request);
  assert.equal(r.status, 409);
  assert.equal(rows(env).length, 0);
});

test('the evidence stays out of the audit, the events and the logs; the audit keeps ids and actions', async () => {
  const env = on(), cookie = await adminCookie(), { request } = await ready(env, cookie);
  const logged = [], keep = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(keep)) console[k] = (...a) => { logged.push(a.map(String).join(' ')); };
  let r;
  try { r = await deliver(env, cookie, request); } finally { Object.assign(console, keep); }
  assert.equal(r.status, 200, r.text);
  const audit = env.DB.raw.prepare('SELECT * FROM privacy_request_audit WHERE request_id=? ORDER BY id').all(request.id);
  const events = env.DB.raw.prepare('SELECT * FROM events').all();
  for (const where of [JSON.stringify(audit), JSON.stringify(events), logged.join('\n')])
    for (const secret of ['RD-SYNTH', 'Posted recorded', 'pre12-handover', 'Synthetic']) assert.equal(where.includes(secret), false, secret);
  const detail = await call(env, 'GET', `${BASE}/${request.id}`, { cookie });
  assert.equal(JSON.stringify(detail.data.audit).includes('RD-SYNTH'), false);
});

test('only signed-in team members, from this site', async () => {
  const env = on(), cookie = await adminCookie(), { request } = await ready(env, cookie);
  assert.equal((await deliver(env, undefined, request)).status, 401);
  assert.equal((await deliver(env, await adminCookie('outsider@example.test'), request)).status, 401);
  assert.equal((await call(env, 'POST', `${BASE}/${request.id}/delivery`, { cookie, origin: 'https://evil.test',
    body: { revision: request.revision, method: 'manual_handoff', result: 'accepted', evidence_ref: EVIDENCE } })).status, 403);
  assert.equal(rows(env).length, 0);
});

test('switched off, the route does not answer', async () => {
  const env = on(), cookie = await adminCookie(), { request } = await ready(env, cookie);
  env.PRE12_REQUESTS_READY = '0';
  assert.equal((await deliver(env, cookie, request)).status, 404);
  assert.equal(rows(env).length, 0);
});

test('without migration 0120 the route is 404 and the request page lists no handovers', async () => {
  const env = on({ skip: [120] }), cookie = await adminCookie(), { request } = await ready(env, cookie);
  const r = await deliver(env, cookie, request);
  assert.equal(r.status, 404, r.text);
  const detail = await call(env, 'GET', `${BASE}/${request.id}`, { cookie });
  assert.equal(detail.status, 200);
  assert.equal('deliveries' in detail.data, false);
  assert.equal(env.DB.raw.prepare('SELECT revision FROM privacy_requests WHERE id=?').get(request.id).revision, request.revision);
});
