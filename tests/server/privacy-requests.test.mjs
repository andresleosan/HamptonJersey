import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeEnv, call, adminCookie, seedListing } from './helpers.mjs';

// PRE-12: the team's register of privacy requests. Synthetic people only.
const T = '2026-11-10T09:00:00.000Z';
const on = () => ({ ...makeEnv(), PRE12_REQUESTS_READY: '1' });
const BASE = '/admin/privacy-requests';

function person(env, { email = 'pre12-person@example.test', phone = '+447700900121', state = 'active' } = {}) {
  const db = env.DB.raw;
  const id = Number(db.prepare(`INSERT INTO contacts (name,email,phone,last_activity_at,created_at,updated_at)
    VALUES ('Synthetic Person',?,?,?,?,?)`).run(email, phone, T, T, T).lastInsertRowid);
  const resolved = state === 'resolved' ? [T, 'admin@example.test', 'Found a home'] : [null, null, null];
  const applicant = Number(db.prepare(`INSERT INTO applicants (contact_id,operation,source,search_state,resolved_at,resolved_by,
    resolution_reason,requirements,created_at,updated_at) VALUES (?,'buy','phone',?,?,?,?,'Near a school',?,?)`)
    .run(id, state, ...resolved, T, T).lastInsertRowid);
  return { id, applicant };
}
const row = (env, id) => env.DB.raw.prepare('SELECT * FROM privacy_requests WHERE id=?').get(id);
const counts = env => Object.fromEntries(['contacts', 'applicants', 'offers', 'sales', 'viewing_requests', 'events']
  .map(t => [t, env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
const create = (env, cookie, over = {}) => call(env, 'POST', BASE, { cookie, body: { id: randomUUID(), kind: 'access',
  received_on: '2026-11-12', received_via: 'email', reference: 'Email to the office, subject «My data»', ...over } });
async function verified(env, cookie, kind = 'access') {
  const p = person(env), made = await create(env, cookie, { kind });
  let r = await call(env, 'POST', `${BASE}/${made.data.request.id}/contact`, { cookie,
    body: { revision: made.data.request.revision, contact_id: p.id } });
  r = await call(env, 'POST', `${BASE}/${made.data.request.id}/identity`, { cookie,
    body: { revision: r.data.request.revision, method: 'photo_id', reference: 'Passport seen in the office' } });
  assert.equal(r.status, 200, r.text);
  return { p, request: r.data.request };
}

test('switched off: no route answers and the panel counts are as before', async () => {
  const env = makeEnv(), cookie = await adminCookie();
  for (const [m, path] of [['GET', BASE], ['POST', BASE], ['GET', `${BASE}/${randomUUID()}`]])
    assert.equal((await call(env, m, path, { cookie, body: m === 'POST' ? {} : undefined })).status, 404, `${m} ${path}`);
  const c = await call(env, 'GET', '/admin/notifications/counts', { cookie });
  assert.equal(c.status, 200);
  assert.equal('privacy' in c.data, false);
});

test('only signed-in team members reach it, and writes from another site are refused', async () => {
  const env = on();
  assert.equal((await call(env, 'GET', BASE)).status, 401);
  assert.equal((await create(env, undefined)).status, 401);
  assert.equal((await call(env, 'POST', BASE, { cookie: await adminCookie(), origin: 'https://evil.test', body: {} })).status, 403);
  assert.equal((await call(env, 'GET', BASE, { cookie: await adminCookie('outsider@example.test') })).status, 401);
});

test('a request is recorded with its deadline as entered, listed, counted, and a repeated save returns it', async () => {
  const env = on(), cookie = await adminCookie(), id = randomUUID();
  const body = { id, kind: 'erasure', received_on: '2026-11-12', received_via: 'phone', due_on: '2026-12-10',
    reference: 'Call on the office line', assigned_to: 'colleague@example.test' };
  const r = await call(env, 'POST', BASE, { cookie, body });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual({ ...r.data.request, created_at: undefined, updated_at: undefined }, { id, kind: 'erasure',
    received_on: '2026-11-12', received_via: 'phone', due_on: '2026-12-10', reference: 'Call on the office line',
    contact: null, assigned_to: 'colleague@example.test', identity: null, copy_review: null, state: 'open', result: null,
    result_note: null, closed_by: null, closed_at: null, revision: 1, created_by: 'admin@example.test',
    created_at: undefined, updated_at: undefined });
  const again = await call(env, 'POST', BASE, { cookie, body });
  assert.equal(again.status, 200);
  assert.equal(again.data.request.id, id);
  assert.equal((await call(env, 'POST', BASE, { cookie, body: { ...body, kind: 'access' } })).status, 409);
  const list = await call(env, 'GET', BASE, { cookie });
  assert.deepEqual(list.data.requests.map(x => x.id), [id]);
  assert.deepEqual(list.data.team.map(t => t.email), ['admin@example.test', 'colleague@example.test']);
  assert.equal((await call(env, 'GET', '/admin/notifications/counts', { cookie })).data.privacy, 1);
  // No deadline is worked out by the app: left empty, it stays empty.
  const plain = await create(env, cookie);
  assert.equal(plain.data.request.due_on, null);
});

test('invalid input is refused with the field and writes nothing', async () => {
  const env = on(), cookie = await adminCookie();
  for (const [over, field] of [[{ kind: 'complaint' }, 'kind'], [{ received_on: '2999-01-01' }, 'received_on'],
    [{ received_via: 'fax' }, 'received_via'], [{ due_on: '2026-11-01' }, 'due_on'], [{ reference: ' ' }, 'reference'],
    [{ assigned_to: 'nobody@example.test' }, 'assigned_to'], [{ id: 'x' }, 'id']]) {
    const r = await create(env, cookie, over);
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.ok(r.data.fields?.[field], `${field}: ${r.text}`);
  }
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM privacy_requests').get().n, 0);
});

test('every change checks the revision, and the audit keeps ids and actions, never the details', async () => {
  const env = on(), cookie = await adminCookie(), p = person(env);
  const made = (await create(env, cookie)).data.request;
  const linked = await call(env, 'POST', `${BASE}/${made.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  assert.equal(linked.status, 200, linked.text);
  assert.deepEqual(linked.data.request.contact, { id: p.id, name: 'Synthetic Person' });
  const stale = await call(env, 'PUT', `${BASE}/${made.id}`, { cookie, body: { revision: 1, assigned_to: 'admin@example.test',
    due_on: null, reference: made.reference } });
  assert.equal(stale.status, 409);
  const ok = await call(env, 'PUT', `${BASE}/${made.id}`, { cookie, body: { revision: 2, assigned_to: 'admin@example.test',
    due_on: '2026-12-01', reference: made.reference } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.data.request.revision, 3);
  const audit = env.DB.raw.prepare('SELECT * FROM privacy_request_audit ORDER BY id').all();
  assert.deepEqual(audit.map(a => [a.action, a.revision, a.actor]),
    [['created', 1, 'admin@example.test'], ['contact_linked', 2, 'admin@example.test'], ['updated', 3, 'admin@example.test']]);
  const text = JSON.stringify(audit);
  for (const secret of ['Synthetic', 'pre12-person', 'subject', '+4477']) assert.equal(text.includes(secret), false, secret);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events").get().n, 0, 'no event carries the request');
  assert.throws(() => env.DB.raw.prepare("UPDATE privacy_request_audit SET actor='x'").run(), /append-only/);
});

test('identity needs a linked contact and records who and how; linking another contact clears it', async () => {
  const env = on(), cookie = await adminCookie(), p = person(env);
  const made = (await create(env, cookie)).data.request;
  const early = await call(env, 'POST', `${BASE}/${made.id}/identity`, { cookie, body: { revision: 1, method: 'photo_id' } });
  assert.equal(early.status, 400);
  let r = await call(env, 'POST', `${BASE}/${made.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  assert.equal((await call(env, 'POST', `${BASE}/${made.id}/identity`, { cookie, body: { revision: 2, method: 'guess' } })).status, 400);
  r = await call(env, 'POST', `${BASE}/${made.id}/identity`, { cookie: await adminCookie('colleague@example.test'),
    body: { revision: 2, method: 'details_on_record', reference: 'Called back on the number on file', verified_by: 'someone@else.test' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.request.identity.verified_by, 'colleague@example.test');
  assert.equal(r.data.request.identity.method, 'details_on_record');
  assert.equal(r.data.request.identity.reference, 'Called back on the number on file');
  const other = person(env, { email: 'other@example.test', phone: '+447700900999' });
  r = await call(env, 'POST', `${BASE}/${made.id}/contact`, { cookie, body: { revision: 3, contact_id: other.id } });
  assert.equal(r.data.request.identity, null);
  assert.equal(row(env, made.id).identity_verified_by, null);
});

test('contact search finds by name, email or phone, posted so nothing personal goes in the address', async () => {
  const env = on(), cookie = await adminCookie(), p = person(env);
  for (const q of ['synthetic', 'PRE12-person@', '900121']) {
    const r = await call(env, 'POST', `${BASE}/contact-search`, { cookie, body: { q } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.contacts.map(c => c.id), [p.id], q);
  }
  assert.equal((await call(env, 'POST', `${BASE}/contact-search`, { cookie, body: { q: 'a' } })).status, 400);
});

test('an erasure request lists what a deletion would remove and what holds keep, and deletes nothing', async () => {
  const env = on(), cookie = await adminCookie(), p = person(env);
  const db = env.DB.raw;
  seedListing(env);
  const offer = Number(db.prepare(`INSERT INTO offers (listing_id,applicant_id,amount,status,created_at,created_by,updated_at,updated_by)
    VALUES ('HE-R001',?,700000,'pending',?,'admin@example.test',?,'admin@example.test')`).run(p.applicant, T, T).lastInsertRowid);
  db.prepare(`INSERT INTO viewing_requests (listing_id,agent,kind,date,time,name,email,phone,status,created_at,updated_at)
    VALUES ('HE-R001','team','in_person','2026-11-20','10:00','Synthetic Person','pre12-person@example.test','+447700900121','requested',?,?)`).run(T, T);
  const made = (await create(env, cookie, { kind: 'erasure' })).data.request;
  await call(env, 'POST', `${BASE}/${made.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  const before = counts(env);
  const r = await call(env, 'GET', `${BASE}/${made.id}`, { cookie });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.data.holds.map(h => h.code), ['open_offer', 'open_search']);
  assert.equal(r.data.erasure.can_delete, false);
  assert.deepEqual(r.data.erasure.remove.map(x => [x.item, x.count]),
    [['contact', 1], ['searches', 1], ['offers', 1], ['matches', 0], ['marketing_preferences', 0]]);
  assert.deepEqual(r.data.erasure.by_hand.map(x => [x.item, x.count]), [['viewing_requests', 1], ['rentals', null]]);
  assert.deepEqual(counts(env), before, 'nothing deleted or written by reading the plan');
  // A sale, in any state, is a hold too.
  db.prepare("UPDATE offers SET status='accepted' WHERE id=?").run(offer);
  db.prepare(`UPDATE applicants SET search_state='resolved', resolved_at=?, resolved_by='admin@example.test',
    resolution_reason='Bought' WHERE id=?`).run(T, p.applicant);
  db.prepare(`INSERT INTO sales (listing_id,applicant_id,offer_id,price,route,status,created_at,created_by,updated_at,updated_by)
    VALUES ('HE-R001',?,?,700000,'freehold','in_progress',?,'admin@example.test',?,'admin@example.test')`).run(p.applicant, offer, T, T);
  const sale = await call(env, 'GET', `${BASE}/${made.id}`, { cookie });
  assert.deepEqual(sale.data.holds.map(h => h.code), ['sale']);
  // Without holds the plan says a person can delete, still with nothing deleted.
  const free = person(env, { email: 'free@example.test', phone: '+447700900555', state: 'resolved' });
  const other = (await create(env, cookie, { kind: 'erasure' })).data.request;
  await call(env, 'POST', `${BASE}/${other.id}/contact`, { cookie, body: { revision: 1, contact_id: free.id } });
  const clear = await call(env, 'GET', `${BASE}/${other.id}`, { cookie });
  assert.equal(clear.data.erasure.can_delete, true);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE id=?').get(free.id).n, 1);
  // Closing it as done is the team's record; it never deletes either.
  const closed = await call(env, 'POST', `${BASE}/${other.id}/close`, { cookie, body: { revision: 2, result: 'fulfilled' } });
  assert.equal(closed.status, 200, closed.text);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE id=?').get(free.id).n, 1);
});

test('the copy needs a checked identity, leaves out internal notes, and downloads only as reviewed', async () => {
  const env = on(), cookie = await adminCookie();
  const unverified = (await create(env, cookie)).data.request;
  assert.equal((await call(env, 'GET', `${BASE}/${unverified.id}/copy`, { cookie })).status, 400);
  const { p, request } = await verified(env, cookie);
  seedListing(env);
  env.DB.raw.prepare(`INSERT INTO offers (listing_id,applicant_id,amount,status,note,created_at,created_by,updated_at,updated_by)
    VALUES ('HE-R001',?,650000,'rejected','internal offer note',?,'admin@example.test',?,'admin@example.test')`).run(p.applicant, T, T);
  const preview = await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie });
  assert.equal(preview.status, 200, preview.text);
  const { copy, sha256 } = preview.data;
  assert.match(sha256, /^[0-9a-f]{64}$/);
  assert.equal(copy.contact.email, 'pre12-person@example.test');
  assert.equal(copy.searches[0].requirements, 'Near a school');
  assert.equal(copy.offers[0].amount, 650000);
  assert.equal(JSON.stringify(copy).includes('internal offer note'), false);
  assert.ok(copy.not_included.length > 0);
  assert.equal((await call(env, 'GET', `${BASE}/${request.id}/copy/download?format=json`, { cookie })).status, 409, 'not reviewed yet');
  assert.equal((await call(env, 'POST', `${BASE}/${request.id}/copy-review`, { cookie,
    body: { revision: request.revision, sha256: '0'.repeat(64) } })).status, 409);
  const reviewed = await call(env, 'POST', `${BASE}/${request.id}/copy-review`, { cookie: await adminCookie('colleague@example.test'),
    body: { revision: request.revision, sha256 } });
  assert.equal(reviewed.status, 200, reviewed.text);
  assert.equal(reviewed.data.request.copy_review.reviewed_by, 'colleague@example.test');
  const json = await call(env, 'GET', `${BASE}/${request.id}/copy/download?format=json`, { cookie });
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-disposition'), /attachment; filename="hampton-data-copy-[0-9a-f-]{36}\.json"/);
  assert.equal(json.headers.get('cache-control'), 'no-store');
  assert.deepEqual(json.data, copy);
  const csv = await call(env, 'GET', `${BASE}/${request.id}/copy/download?format=csv`, { cookie });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /^text\/csv/);
  assert.match(csv.text, /^section,record,field,value\r\n/);
  assert.match(csv.text, /contact,1,email,pre12-person@example\.test\r\n/);
  // The data changed since the review: no download until a person reviews it again.
  env.DB.raw.prepare("UPDATE applicants SET requirements='Near the sea' WHERE id=?").run(p.applicant);
  assert.equal((await call(env, 'GET', `${BASE}/${request.id}/copy/download?format=json`, { cookie })).status, 409);
});

test('closing: an access request is fulfilled only with a reviewed copy, and a closed request takes no more changes', async () => {
  const env = on(), cookie = await adminCookie();
  const { request } = await verified(env, cookie);
  const early = await call(env, 'POST', `${BASE}/${request.id}/close`, { cookie, body: { revision: request.revision, result: 'fulfilled' } });
  assert.equal(early.status, 400);
  const r = await call(env, 'POST', `${BASE}/${request.id}/close`, { cookie,
    body: { revision: request.revision, result: 'withdrawn', note: 'The person withdrew it by phone' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.request.state, 'closed');
  assert.equal(r.data.request.closed_by, 'admin@example.test');
  assert.equal((await call(env, 'PUT', `${BASE}/${request.id}`, { cookie, body: { revision: r.data.request.revision,
    assigned_to: null, due_on: null, reference: 'x' } })).status, 409);
  assert.equal((await call(env, 'GET', '/admin/notifications/counts', { cookie })).data.privacy, 0);
});

test('deleting the contact the existing way leaves the request, unlinked', async () => {
  const env = on(), cookie = await adminCookie(), p = person(env, { state: 'resolved' });
  const made = (await create(env, cookie, { kind: 'erasure' })).data.request;
  await call(env, 'POST', `${BASE}/${made.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  env.DB.raw.prepare('UPDATE applicants SET archived_at=? WHERE id=?').run(T, p.applicant);
  const del = await call(env, 'DELETE', `/admin/applicants/${p.applicant}`, { cookie, body: { confirm: 'Synthetic Person' } });
  assert.equal(del.status, 200, del.text);
  const r = await call(env, 'GET', `${BASE}/${made.id}`, { cookie });
  assert.equal(r.data.request.contact, null);
  assert.equal(r.data.erasure, null);
});
