import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makeEnv, call, adminCookie, seedListing } from './helpers.mjs';
import { runRetention } from '../../server/retention.js';

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
    [['contact', 1], ['searches', 1], ['offers', 1], ['matches', 0], ['marketing_preferences', 0],
      ['rental_applications', 0]]);
  assert.deepEqual(r.data.erasure.by_hand.map(x => [x.item, x.count]), [['viewing_requests', 1], ['owner_requests', 0], ['rentals', null]]);
  assert.deepEqual(counts(env), before, 'nothing deleted or written by reading the plan');
  // Empty details never match someone else's: a contact without email matches no viewing request with an empty one.
  const noEmail = Number(db.prepare(`INSERT INTO contacts (name,email,phone,last_activity_at,created_at,updated_at)
    VALUES ('Blank Person',NULL,'+447700900777',?,?,?)`).run(T, T, T).lastInsertRowid);
  db.prepare(`INSERT INTO viewing_requests (listing_id,agent,kind,date,time,name,email,phone,status,created_at,updated_at)
    VALUES ('HE-R001','team','in_person','2026-11-21','11:00','Someone Else','','','requested',?,?)`).run(T, T);
  const unknown = (await create(env, cookie, { kind: 'erasure' })).data.request;
  await call(env, 'POST', `${BASE}/${unknown.id}/contact`, { cookie, body: { revision: 1, contact_id: noEmail } });
  const none = await call(env, 'GET', `${BASE}/${unknown.id}`, { cookie });
  assert.deepEqual(none.data.erasure.by_hand.map(x => [x.item, x.count]), [['viewing_requests', 0], ['owner_requests', 0], ['rentals', null]]);
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
  env.DB.raw.prepare(`INSERT INTO viewing_requests (listing_id,agent,kind,date,time,name,email,phone,status,created_at,updated_at)
    VALUES ('HE-R001','team','in_person','2026-11-20','10:00','Someone Else','pre12-person@example.test','+447700900121','requested',?,?)`).run(T, T);
  const preview = await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie });
  assert.equal(preview.status, 200, preview.text);
  const { copy, sha256 } = preview.data;
  assert.match(sha256, /^[0-9a-f]{64}$/);
  assert.equal(copy.contact.email, 'pre12-person@example.test');
  assert.equal(copy.searches[0].requirements, 'Near a school');
  assert.equal(copy.offers[0].amount, 650000);
  // Viewing requests are matched only by email or phone, which other people can share: never in the copy by themselves.
  assert.equal('viewing_requests' in copy, false);
  assert.ok(copy.not_included.some(n => n.section === 'viewing_requests' && n.reason));
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

test('deleting the contact the existing way, once its request is closed, leaves the request unlinked', async () => {
  const env = on(), cookie = await adminCookie(), p = person(env, { state: 'resolved' });
  const made = (await create(env, cookie, { kind: 'erasure' })).data.request;
  await call(env, 'POST', `${BASE}/${made.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  await call(env, 'POST', `${BASE}/${made.id}/close`, { cookie, body: { revision: 2, result: 'fulfilled' } });
  env.DB.raw.prepare('UPDATE applicants SET archived_at=? WHERE id=?').run(T, p.applicant);
  const del = await call(env, 'DELETE', `/admin/applicants/${p.applicant}`, { cookie, body: { confirm: 'Synthetic Person' } });
  assert.equal(del.status, 200, del.text);
  const r = await call(env, 'GET', `${BASE}/${made.id}`, { cookie });
  assert.equal(r.data.request.contact, null);
  assert.equal(r.data.erasure, null);
});

// Review fixes (16-nov): open requests hold the contact, the copy says everything, phones compare normalised.
const OLD = '2024-01-01T09:00:00.000Z', PASS = '2026-11-16T09:00:00.000Z';
function inactive(env, phone = '+447700900321') {
  const db = env.DB.raw;
  const id = Number(db.prepare(`INSERT INTO contacts (name,email,phone,last_activity_at,created_at,updated_at)
    VALUES ('Quiet Person',?,?,?,?,?)`).run(`quiet${phone.slice(-3)}@example.test`, phone, OLD, OLD, OLD).lastInsertRowid);
  const applicant = Number(db.prepare(`INSERT INTO applicants (contact_id,operation,source,search_state,resolved_at,resolved_by,
    resolution_reason,archived_at,created_at,updated_at) VALUES (?,'rent','phone','resolved',?,'admin@example.test','Found a home',?,?,?)`)
    .run(id, OLD, OLD, OLD, OLD).lastInsertRowid);
  return { id, applicant };
}
const exists = (env, id) => env.DB.raw.prepare('SELECT COUNT(*) AS n FROM contacts WHERE id=?').get(id).n === 1;

test('an open request of any kind keeps the contact from the retention cleanup; a closed one does not', async () => {
  const env = on(), cookie = await adminCookie();
  const held = inactive(env, '+447700900321'), freed = inactive(env, '+447700900322'), plain = inactive(env, '+447700900323');
  const a = (await create(env, cookie, { kind: 'rectification' })).data.request;
  await call(env, 'POST', `${BASE}/${a.id}/contact`, { cookie, body: { revision: 1, contact_id: held.id } });
  const b = (await create(env, cookie, { kind: 'objection' })).data.request;
  await call(env, 'POST', `${BASE}/${b.id}/contact`, { cookie, body: { revision: 1, contact_id: freed.id } });
  await call(env, 'POST', `${BASE}/${b.id}/close`, { cookie, body: { revision: 2, result: 'fulfilled' } });
  await runRetention(env, PASS);
  assert.equal(exists(env, held.id), true, 'open request: kept');
  assert.equal(exists(env, freed.id), false, 'closed request: the ordinary rule applies');
  assert.equal(exists(env, plain.id), false, 'no request: the ordinary rule applies');
});

test('switched off, the cleanup reads no privacy table and runs as before', async () => {
  const env = makeEnv({ skip: [101] }), p = inactive(env);
  await runRetention(env, PASS);
  assert.equal(exists(env, p.id), false);
});

test('the manual Delete does not delete a contact with an open request, and does once it is closed', async () => {
  const env = on(), cookie = await adminCookie(), p = inactive(env);
  const r = (await create(env, cookie, { kind: 'rectification' })).data.request;
  await call(env, 'POST', `${BASE}/${r.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  const refused = await call(env, 'DELETE', `/admin/applicants/${p.applicant}`, { cookie, body: { confirm: 'Quiet Person' } });
  assert.equal(refused.status, 409, refused.text);
  assert.equal(exists(env, p.id), true);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM applicants WHERE id=?').get(p.applicant).n, 1);
  await call(env, 'POST', `${BASE}/${r.id}/close`, { cookie, body: { revision: 2, result: 'fulfilled' } });
  const ok = await call(env, 'DELETE', `/admin/applicants/${p.applicant}`, { cookie, body: { confirm: 'Quiet Person' } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(exists(env, p.id), false);
  // Switched off, the Delete is as before.
  const off = makeEnv({ skip: [101] }), q = inactive(off);
  assert.equal((await call(off, 'DELETE', `/admin/applicants/${q.applicant}`, { cookie, body: { confirm: 'Quiet Person' } })).status, 200);
});

test('the copy has every column of its records, or names it in not_included with a reason', async () => {
  const env = on(), cookie = await adminCookie(), { p, request } = await verified(env, cookie);
  seedListing(env);
  const db = env.DB.raw;
  db.prepare(`INSERT INTO offers (listing_id,applicant_id,amount,status,created_at,created_by,updated_at,updated_by)
    VALUES ('HE-R001',?,650000,'pending',?,'admin@example.test',?,'admin@example.test')`).run(p.applicant, T, T);
  db.prepare(`INSERT INTO matches (applicant_id,listing_id,score,checks,status,created_at,updated_at)
    VALUES (?,'HE-R001',70,'[]','found',?,?)`).run(p.applicant, T, T);
  db.prepare(`INSERT INTO marketing_preferences (contact_id,purpose,channel,value,source,revision,updated_by,updated_at)
    VALUES (?,'news','phone','objected','phone',1,'admin@example.test',?)`).run(p.id, T);
  const { copy } = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data;
  for (const [table, section, sample] of [['contacts', 'contact', copy.contact], ['applicants', 'searches', copy.searches[0]],
    ['offers', 'offers', copy.offers[0]], ['matches', 'matches', copy.matches[0]], ['marketing_preferences', 'marketing_preferences', copy.marketing_preferences[0]]]) {
    assert.ok(sample, section);
    const named = copy.not_included.filter(n => n.section === section).flatMap(n => n.fields ?? []);
    for (const n of copy.not_included) assert.ok(typeof n.reason === 'string' && n.reason.length > 10, JSON.stringify(n));
    const missing = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name).filter(c => !(c in sample) && !named.includes(c));
    assert.deepEqual(missing, [], section);
  }
  for (const k of ['search_category', 'household_total', 'requirement_priorities', 'stage', 'source'])
    assert.ok(k in copy.searches[0], k);
  // Free text the team writes can name other people: reviewed by hand, never in the copy by itself.
  const named = section => copy.not_included.filter(n => n.section === section).flatMap(n => n.fields ?? []);
  for (const k of ['lost_reason', 'resolution_reason']) {
    assert.equal(k in copy.searches[0], false, k);
    assert.ok(named('searches').includes(k), k);
  }
  assert.equal('conditions' in copy.offers[0], false);
  assert.ok(named('offers').includes('conditions'));
  assert.ok('last_contact_at' in copy.contact);
  assert.equal(copy.matches[0].listing_id, 'HE-R001');
  const csv = await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie });
  assert.equal(csv.status, 200);
});

test('the erasure plan compares viewing phones normalised, as contacts store them', async () => {
  const env = on(), cookie = await adminCookie(), p = person(env);
  seedListing(env);
  const viewing = (email, phone) => env.DB.raw.prepare(`INSERT INTO viewing_requests (listing_id,agent,kind,date,time,name,email,phone,
    status,created_at,updated_at) VALUES ('HE-R001','team','in_person','2026-11-20','10:00','Someone',?,?,'requested',?,?)`).run(email, phone, T, T);
  viewing('a@example.test', '07700 900121');
  viewing('b@example.test', '+44 (0)7700-900121');
  viewing('c@example.test', '07700 900129');
  viewing('d@example.test', '');
  const r = (await create(env, cookie, { kind: 'erasure' })).data.request;
  await call(env, 'POST', `${BASE}/${r.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  const plan = (await call(env, 'GET', `${BASE}/${r.id}`, { cookie })).data.erasure;
  assert.deepEqual(plan.by_hand.map(x => [x.item, x.count]), [['viewing_requests', 2], ['owner_requests', 0], ['rentals', null]]);
});

test('closing as sent re-checks the reviewed copy in the same write', async () => {
  const env = on(), cookie = await adminCookie(), { request } = await verified(env, cookie);
  const { sha256 } = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data;
  const reviewed = (await call(env, 'POST', `${BASE}/${request.id}/copy-review`, { cookie, body: { revision: request.revision, sha256 } })).data.request;
  // Between the check and the write, the review goes (as a contact relink would clear it).
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => { env.DB.raw.prepare('UPDATE privacy_requests SET copy_hash=NULL, copy_reviewed_by=NULL, copy_reviewed_at=NULL WHERE id=?')
    .run(request.id); env.DB.batch = batch; return batch(stmts); };
  const r = await call(env, 'POST', `${BASE}/${request.id}/close`, { cookie, body: { revision: reviewed.revision, result: 'fulfilled' } });
  assert.equal(r.status, 409, r.text);
  assert.equal(row(env, request.id).state, 'open');
});

test('opening the copy is audited with ids only, and a closed request serves no copy', async () => {
  const env = on(), cookie = await adminCookie(), { request } = await verified(env, cookie);
  assert.equal((await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).status, 200);
  const audit = env.DB.raw.prepare('SELECT * FROM privacy_request_audit WHERE request_id=? ORDER BY id').all(request.id);
  assert.deepEqual({ ...audit.at(-1), id: undefined, at: undefined },
    { id: undefined, request_id: request.id, revision: request.revision, action: 'copy_viewed', actor: 'admin@example.test', at: undefined });
  await call(env, 'POST', `${BASE}/${request.id}/close`, { cookie, body: { revision: request.revision, result: 'refused' } });
  const closed = await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie });
  assert.equal(closed.status, 409);
  assert.equal(JSON.stringify(closed.data).includes('pre12-person'), false);
});

// Second review (16-nov): an erasure request is not a hold; a search delete respects an open access request; Expiring
// leaves held contacts out; the plan names another open request as a hold.
test('an open erasure request does not keep the contact: the Delete and the cleanup go ahead', async () => {
  const env = on(), cookie = await adminCookie(), a = inactive(env, '+447700900331'), b = inactive(env, '+447700900332');
  for (const p of [a, b]) {
    const r = (await create(env, cookie, { kind: 'erasure' })).data.request;
    await call(env, 'POST', `${BASE}/${r.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  }
  const plan = (await call(env, 'GET', `${BASE}/${(await call(env, 'GET', BASE, { cookie })).data.requests[0].id}`, { cookie })).data;
  assert.equal(plan.erasure.can_delete, true);
  const del = await call(env, 'DELETE', `/admin/applicants/${a.applicant}`, { cookie, body: { confirm: 'Quiet Person' } });
  assert.equal(del.status, 200, del.text);
  await runRetention(env, PASS);
  assert.equal(exists(env, b.id), false);
});

test('another open request is a hold in the erasure plan', async () => {
  const env = on(), cookie = await adminCookie(), p = inactive(env);
  const e = (await create(env, cookie, { kind: 'erasure' })).data.request;
  await call(env, 'POST', `${BASE}/${e.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  assert.deepEqual((await call(env, 'GET', `${BASE}/${e.id}`, { cookie })).data.holds, []);
  const a = (await create(env, cookie, { kind: 'access' })).data.request;
  await call(env, 'POST', `${BASE}/${a.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  const d = (await call(env, 'GET', `${BASE}/${e.id}`, { cookie })).data;
  assert.deepEqual(d.holds.map(h => h.code), ['privacy_request']);
  assert.equal(d.erasure.can_delete, false);
  // The access request itself is not "another" open request.
  assert.deepEqual((await call(env, 'GET', `${BASE}/${a.id}`, { cookie })).data.holds, []);
});

test('deleting one of several searches waits while an access or portability request is open', async () => {
  const env = on(), cookie = await adminCookie(), p = inactive(env);
  const second = Number(env.DB.raw.prepare(`INSERT INTO applicants (contact_id,operation,source,search_state,resolved_at,resolved_by,
    resolution_reason,archived_at,created_at,updated_at) VALUES (?,'buy','phone','resolved',?,'admin@example.test','Bought',?,?,?)`)
    .run(p.id, OLD, OLD, OLD, OLD).lastInsertRowid);
  const r = (await create(env, cookie, { kind: 'portability' })).data.request;
  await call(env, 'POST', `${BASE}/${r.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  const refused = await call(env, 'DELETE', `/admin/applicants/${second}`, { cookie, body: { confirm: 'Quiet Person' } });
  assert.equal(refused.status, 409, refused.text);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM applicants WHERE id=?').get(second).n, 1);
  // A rectification request does not stop deleting one search among several.
  await call(env, 'POST', `${BASE}/${r.id}/close`, { cookie, body: { revision: 2, result: 'withdrawn' } });
  const fix = (await create(env, cookie, { kind: 'rectification' })).data.request;
  await call(env, 'POST', `${BASE}/${fix.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  assert.equal((await call(env, 'DELETE', `/admin/applicants/${second}`, { cookie, body: { confirm: 'Quiet Person' } })).status, 200);
});

test('Expiring and the kept-until date leave out a contact held by an open request; switched off, as before', async () => {
  const env = on(), cookie = await adminCookie();
  const db = env.DB.raw, near = '2025-12-01T09:00:00.000Z';
  const p = inactive(env), q = inactive(env, '+447700900399');
  db.prepare('UPDATE contacts SET last_activity_at=? WHERE id IN (?,?)').run(near, p.id, q.id);
  const r = (await create(env, cookie, { kind: 'access' })).data.request;
  await call(env, 'POST', `${BASE}/${r.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  const counts = (await call(env, 'GET', '/admin/notifications/counts', { cookie })).data;
  assert.equal(counts.expiring, 1);
  const list = (await call(env, 'GET', '/admin/applicants?expiring=1', { cookie })).data;
  assert.deepEqual(list.applicants.map(x => x.id), [q.applicant]);
  const detail = (await call(env, 'GET', `/admin/applicants/${p.applicant}`, { cookie })).data;
  assert.equal(detail.retention.kept_until, null);
  assert.equal(detail.retention.privacy, true);
  const off = { ...env, PRE12_REQUESTS_READY: '0' };
  assert.equal((await call(off, 'GET', '/admin/notifications/counts', { cookie })).data.expiring, 2);
  assert.ok((await call(off, 'GET', `/admin/applicants/${p.applicant}`, { cookie })).data.retention.kept_until);
});

test('the request detail gives each audit row its id', async () => {
  const env = on(), cookie = await adminCookie(), made = (await create(env, cookie)).data.request;
  const { audit } = (await call(env, 'GET', `${BASE}/${made.id}`, { cookie })).data;
  assert.ok(Number.isInteger(audit[0].id));
});

test('REG-15: the copy lists the person\'s confirmed property alerts, and only when there are any', async () => {
  const env = on(), cookie = await adminCookie();
  const { request } = await verified(env, cookie);
  const without = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data.copy;
  assert.equal('property_alerts' in without, false, 'same copy as before for someone without alerts');
  const contact = env.DB.raw.prepare('SELECT contact_id FROM privacy_requests WHERE id = ?').get(request.id).contact_id;
  env.DB.raw.prepare(`INSERT INTO saved_searches (status, email_hash, contact_id, criteria, notice_version, unsubscribe_token,
    alerted_through, created_at, confirmed_at) VALUES ('active', ?, ?, '{"operation":"rent","budget_max":2500}', 'v1', ?, ?, ?, ?)`)
    .run('a'.repeat(64), contact, 'b'.repeat(64), T, T, T);
  const copy = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data.copy;
  assert.deepEqual(copy.property_alerts, [{ criteria: '{"operation":"rent","budget_max":2500}', created_at: T, confirmed_at: T }]);
  assert.equal(JSON.stringify(copy).includes('b'.repeat(64)), false, 'never the unsubscribe token');
});

// MSG-01, before messages come in: Delete unlinks a contact's Facebook conversations (ON DELETE SET NULL) and keeps them,
// so the erasure plan names them for a person to delete from Messages, only for someone who has them.
test('MSG-01: an erasure plan names the linked Facebook conversations to delete by hand, only for someone who has them', async () => {
  const env = on(), cookie = await adminCookie(), p = person(env);
  const made = (await create(env, cookie, { kind: 'erasure' })).data.request;
  await call(env, 'POST', `${BASE}/${made.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  const plan = async () => (await call(env, 'GET', `${BASE}/${made.id}`, { cookie })).data.erasure.by_hand.map(x => [x.item, x.count]);
  assert.equal((await plan()).some(([item]) => item === 'facebook_messages'), false);
  for (const user of ['200000000000001', '200000000000002']) env.DB.raw.prepare(`INSERT INTO channel_conversations (channel, account_id,
    external_user_id, contact_id, last_inbound_at, last_at, created_at) VALUES ('messenger', '100000000000001', ?, ?, ?, ?, ?)`)
    .run(user, p.id, T, T, T);
  assert.deepEqual((await plan()).find(([item]) => item === 'facebook_messages'), ['facebook_messages', 2]);
});

test('MSG-01: Facebook conversations are named in the copy for review by hand, only for someone who has them', async () => {
  const env = on(), cookie = await adminCookie();
  const { request } = await verified(env, cookie);
  const before = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data;
  assert.equal(before.copy.not_included.some(n => n.section === 'facebook_messages'), false);
  const contact = env.DB.raw.prepare('SELECT contact_id FROM privacy_requests WHERE id = ?').get(request.id).contact_id;
  env.DB.raw.prepare(`INSERT INTO channel_conversations (channel, account_id, external_user_id, contact_id, last_inbound_at,
    last_at, created_at) VALUES ('messenger', '100000000000001', '200000000000001', ?, ?, ?, ?)`).run(contact, T, T, T);
  const after = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data;
  assert.ok(after.copy.not_included.some(n => n.section === 'facebook_messages' && n.reason));
  assert.notEqual(after.sha256, before.sha256);
});

// PRE-12: viewing requests matched only by email or phone, reviewed one by one (migration 0111, PRE12_VIEWING_REVIEW_READY).
const reviewOn = schema => ({ ...makeEnv(schema), PRE12_REQUESTS_READY: '1', PRE12_VIEWING_REVIEW_READY: '1' });
function viewing(env, { email = '', phone = '', name = 'Someone' } = {}) {
  return Number(env.DB.raw.prepare(`INSERT INTO viewing_requests (listing_id,agent,kind,date,time,name,email,phone,status,notes,
    created_at,updated_at,updated_by) VALUES ('HE-R001','team','in_person','2026-11-20','10:00',?,?,?,'requested',
    'internal viewing note',?,?,'admin@example.test')`).run(name, email, phone, T, T).lastInsertRowid);
}
const decide = (env, cookie, id, v, confirmed) => call(env, 'POST', `${BASE}/${id}/viewings/${v}`, { cookie, body: { confirmed } });

test('viewing review: switched off or without 0111, nothing is listed and the copy keeps its hash', async () => {
  for (const schema of [{}, { skip: [111] }]) {
    const env = { ...makeEnv(schema), PRE12_REQUESTS_READY: '1' }, cookie = await adminCookie();
    const { request } = await verified(env, cookie);
    seedListing(env);
    const v = viewing(env, { email: 'pre12-person@example.test' });
    const off = await call(env, 'GET', `${BASE}/${request.id}`, { cookie });
    assert.equal('viewings' in off.data, false);
    assert.equal((await decide(env, cookie, request.id, v, true)).status, 404);
    const before = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data.sha256;
    const reviewed = await call(env, 'POST', `${BASE}/${request.id}/copy-review`, { cookie, body: { revision: request.revision, sha256: before } });
    assert.equal(reviewed.status, 200, reviewed.text);
    // Switched on, with or without 0111: listed with no decision, and the copy reviewed before still downloads.
    env.PRE12_VIEWING_REVIEW_READY = '1';
    const listed = await call(env, 'GET', `${BASE}/${request.id}`, { cookie });
    assert.equal(listed.status, 200, listed.text);
    assert.deepEqual(listed.data.viewings.map(x => [x.id, x.confirmed]), [[v, null]]);
    assert.equal((await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data.sha256, before);
    assert.equal((await call(env, 'GET', `${BASE}/${request.id}/copy/download?format=json`, { cookie })).status, 200);
  }
});

test('viewing review: candidates are listed one by one and only the confirmed ones enter the copy', async () => {
  const env = reviewOn(), cookie = await adminCookie(), { p, request } = await verified(env, cookie);
  seedListing(env);
  const byEmail = viewing(env, { email: 'PRE12-person@example.test', name: 'Synthetic Person' });
  const byPhone = viewing(env, { phone: '07700 900121', name: 'Someone Else' });
  const other = viewing(env, { email: 'other@example.test', phone: '07700 900999' });
  const before = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data;
  const list = (await call(env, 'GET', `${BASE}/${request.id}`, { cookie })).data.viewings;
  assert.deepEqual(list.map(v => [v.id, v.confirmed]), [[byEmail, null], [byPhone, null]]);
  assert.equal(list[1].name, 'Someone Else');
  assert.equal('notes' in list[0], false, 'internal notes are not shown for the review either');

  assert.equal((await decide(env, cookie, request.id, other, true)).status, 404, 'not a possible match');
  assert.equal((await decide(env, cookie, request.id, 999999, true)).status, 404);
  assert.equal((await decide(env, cookie, request.id, byEmail, 'yes')).status, 400);
  const done = await decide(env, await adminCookie('colleague@example.test'), request.id, byEmail, true);
  assert.equal(done.status, 200, done.text);
  const confirmed = done.data.viewings.find(v => v.id === byEmail).confirmed;
  assert.equal(confirmed.by, 'colleague@example.test');
  assert.match(confirmed.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(done.data.viewings.find(v => v.id === byPhone).confirmed, null);

  const after = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data;
  assert.deepEqual(after.copy.viewing_requests.map(v => v.id), [byEmail]);
  assert.notEqual(after.sha256, before.sha256);
  assert.equal(JSON.stringify(after.copy).includes('internal viewing note'), false);
  assert.equal(JSON.stringify(after.copy).includes('Someone Else'), false, 'the unconfirmed one never enters');
  // Every column is in the copy or named in not_included with its reason.
  const named = after.copy.not_included.filter(n => n.section === 'viewing_requests').flatMap(n => n.fields ?? []);
  const missing = env.DB.raw.prepare('PRAGMA table_info(viewing_requests)').all().map(c => c.name)
    .filter(c => !(c in after.copy.viewing_requests[0]) && !named.includes(c));
  assert.deepEqual(missing, []);
  const reviewed = await call(env, 'POST', `${BASE}/${request.id}/copy-review`, { cookie,
    body: { revision: request.revision, sha256: after.sha256 } });
  assert.equal(reviewed.status, 200, reviewed.text);
  assert.match((await call(env, 'GET', `${BASE}/${request.id}/copy/download?format=csv`, { cookie })).text,
    /\r\nviewing_requests,1,id,/);

  // Taken back: out of the copy again, the copy is the one from before, and the reviewed one no longer downloads.
  assert.equal((await decide(env, cookie, request.id, byEmail, false)).status, 200);
  assert.equal((await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data.sha256, before.sha256);
  assert.equal((await call(env, 'GET', `${BASE}/${request.id}/copy/download?format=json`, { cookie })).status, 409);

  // The record keeps ids, the decision, who and when: never the person's details.
  const rows = env.DB.raw.prepare('SELECT * FROM privacy_request_viewings ORDER BY id').all();
  assert.deepEqual(rows.map(r => [r.viewing_id, r.confirmed, r.actor, r.contact_id]),
    [[byEmail, 1, 'colleague@example.test', p.id], [byEmail, 0, 'admin@example.test', p.id]]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['actor', 'at', 'confirmed', 'contact_id', 'id', 'request_id', 'viewing_id']);
  assert.throws(() => env.DB.raw.prepare('UPDATE privacy_request_viewings SET confirmed = 1').run(), /append-only/);

  // Confirmed for one contact, it does not count once another contact is linked.
  assert.equal((await decide(env, cookie, request.id, byPhone, true)).status, 200);
  const q = person(env, { email: 'pre12-other@example.test', phone: '+447700900555' });
  const current = (await call(env, 'GET', `${BASE}/${request.id}`, { cookie })).data.request;
  const relinked = await call(env, 'POST', `${BASE}/${request.id}/contact`, { cookie, body: { revision: current.revision, contact_id: q.id } });
  assert.equal(relinked.status, 200, relinked.text);
  assert.deepEqual((await call(env, 'GET', `${BASE}/${request.id}`, { cookie })).data.viewings, []);
  assert.equal((await decide(env, cookie, request.id, byPhone, true)).status, 404);
});

test('viewing review: only open access or portability requests with a contact take decisions', async () => {
  const env = reviewOn(), cookie = await adminCookie();
  seedListing(env);
  const v = viewing(env, { email: 'pre12-person@example.test' });
  const erasure = (await create(env, cookie, { kind: 'erasure' })).data.request;
  assert.equal((await decide(env, cookie, erasure.id, v, true)).status, 400);
  assert.equal('viewings' in (await call(env, 'GET', `${BASE}/${erasure.id}`, { cookie })).data, false);
  const unlinked = (await create(env, cookie)).data.request;
  assert.equal((await decide(env, cookie, unlinked.id, v, true)).status, 400);
  const { request } = await verified(env, cookie);
  const closed = await call(env, 'POST', `${BASE}/${request.id}/close`, { cookie, body: { revision: request.revision, result: 'refused' } });
  assert.equal(closed.status, 200, closed.text);
  assert.equal((await decide(env, cookie, request.id, v, true)).status, 409);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM privacy_request_viewings').get().n, 0);
  assert.equal((await decide(env, undefined, request.id, v, true)).status, 401);
});

// PRE-12 / PUB-09: deleting a listing removes its private withdrawal notes in the same write, and its history says so.
test('deleting a listing removes its withdrawal notes, revisions and receipts, and records it in its history', async () => {
  const env = { ...makeEnv(), PUB09_WITHDRAWALS_READY: '1' }, cookie = await adminCookie(), db = env.DB.raw;
  const op = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const withdraw = async (id, n) => {
    const r = await call(env, 'POST', `/admin/listings/${id}/unpublish`, { cookie, body: { updated_at: db.prepare(
      'SELECT updated_at FROM listings WHERE id=?').get(id).updated_at, reason_code: 'other', note: `Private note ${n}`, operation_id: op(n) } });
    assert.equal(r.status, 200, r.text);
    return r.data.withdrawal.id;
  };
  seedListing(env);
  seedListing(env, { id: 'HE-R002' });
  const w = await withdraw('HE-R001', 1), kept = await withdraw('HE-R002', 2);
  const fixed = await call(env, 'POST', `/admin/listings/HE-R001/withdrawals/${w}/correct`, { cookie,
    body: { expected_revision: 1, reason_code: 'other', note: 'Private correction', operation_id: op(3) } });
  assert.equal(fixed.status, 200, fixed.text);
  const n = (table, where = '1') => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get().n;
  const archived = await call(env, 'POST', '/admin/listings/HE-R001/archive', { cookie,
    body: { updated_at: db.prepare("SELECT updated_at FROM listings WHERE id='HE-R001'").get().updated_at } });
  assert.equal(archived.status, 200, archived.text);
  const eventsBefore = db.prepare('SELECT id, type, data FROM events ORDER BY id').all();

  // Atomic: a delete that fails leaves the notes where they were.
  db.exec("CREATE TRIGGER fixture_keep BEFORE DELETE ON listings BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
  assert.equal((await call(env, 'DELETE', '/admin/listings/HE-R001', { cookie, body: { confirm: 'HE-R001' } })).status, 500);
  assert.deepEqual([n('listing_withdrawals'), n('listing_withdrawal_revisions'), n('listing_withdrawal_receipts')], [2, 1, 3]);
  assert.equal(n('events'), eventsBefore.length);
  db.exec('DROP TRIGGER fixture_keep');

  const gone = await call(env, 'DELETE', '/admin/listings/HE-R001', { cookie, body: { confirm: 'HE-R001' } });
  assert.equal(gone.status, 200, gone.text);
  assert.equal(n('listing_withdrawals', "listing_id='HE-R001'"), 0);
  assert.equal(n('listing_withdrawal_revisions'), 0);
  assert.equal(n('listing_withdrawal_receipts', `withdrawal_id='${w}'`), 0);
  // Another listing's notes stay.
  assert.deepEqual([n('listing_withdrawals', `id='${kept}'`), n('listing_withdrawal_receipts', `withdrawal_id='${kept}'`)], [1, 1]);
  // No historical event is deleted or changed; the purge is one more event, with ids only.
  const eventsAfter = db.prepare('SELECT id, type, data FROM events ORDER BY id').all();
  assert.deepEqual(eventsAfter.slice(0, eventsBefore.length), eventsBefore);
  const purge = eventsAfter.filter(e => e.type === 'listing.withdrawal_notes_purged');
  assert.equal(purge.length, 1);
  assert.deepEqual(JSON.parse(purge[0].data).withdrawal_ids, [w]);
  assert.equal(eventsAfter.some(e => /Private (note|correction)/.test(e.data)), false);
  const history = await call(env, 'GET', '/admin/listings/HE-R001/history', { cookie });
  assert.equal(history.status, 200, history.text);
  const item = history.data.items.find(i => i.type === 'listing.withdrawal_notes_purged');
  assert.ok(item, JSON.stringify(history.data.items.map(i => i.type)));
  assert.equal(item.details_unavailable, false);
  assert.equal(history.data.items[0].type, 'listing.deleted');

  // A listing without withdrawals is deleted as before, with no purge event.
  seedListing(env, { id: 'HE-R003', published: 0, archived_at: T });
  assert.equal((await call(env, 'DELETE', '/admin/listings/HE-R003', { cookie, body: { confirm: 'HE-R003' } })).status, 200);
  assert.equal(n('events', "entity_id='HE-R003' AND type='listing.withdrawal_notes_purged'"), 0);
});

test('viewing review: a decision clears the copy review; an edited viewing or a relink needs confirming again', async () => {
  const env = reviewOn(), cookie = await adminCookie(), { request } = await verified(env, cookie);
  seedListing(env);
  const v = viewing(env, { email: 'pre12-person@example.test' });
  const hash = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data.sha256;
  assert.equal((await call(env, 'POST', `${BASE}/${request.id}/copy-review`, { cookie, body: { revision: request.revision, sha256: hash } })).status, 200);
  assert.equal((await decide(env, cookie, request.id, v, true)).status, 200);
  const row = () => env.DB.raw.prepare('SELECT copy_hash, contact_id FROM privacy_requests WHERE id = ?').get(request.id);
  assert.equal(row().copy_hash, null, 'the copy changed, so its review was cleared');
  const inCopy = async () => ((await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data.copy.viewing_requests ?? []).map(x => x.id);
  assert.deepEqual(await inCopy(), [v]);

  // Edited after the confirmation: out of the copy until someone confirms it again.
  env.DB.raw.prepare("UPDATE viewing_requests SET name = 'Someone Else', updated_at = ? WHERE id = ?").run('2999-01-01T00:00:00.000Z', v);
  assert.deepEqual(await inCopy(), []);
  const listed = (await call(env, 'GET', `${BASE}/${request.id}`, { cookie })).data.viewings;
  assert.equal(listed.find(x => x.id === v).confirmed, null);
  env.DB.raw.prepare('UPDATE viewing_requests SET updated_at = ? WHERE id = ?').run(T, v);
  assert.deepEqual(await inCopy(), [v]);

  // Relinked (to the same contact here): the earlier confirmation was for the earlier link.
  const r = (await call(env, 'GET', `${BASE}/${request.id}`, { cookie })).data.request;
  env.DB.raw.prepare(`INSERT INTO privacy_request_audit (request_id, revision, action, actor, at) VALUES (?, ?, 'contact_linked', 'admin@example.test', ?)`)
    .run(request.id, r.revision, '2999-01-01T00:00:00.000Z');
  assert.deepEqual(await inCopy(), []);
});

// PUB-10 (0118) and ADM-18 (0117): owner requests are matched to a person only by email or phone; rental applications
// belong to a search by id. The search finds both, the erasure plan and the copy cover them, and the retention cleanup
// of a contact is not blocked by either.
function ownerRequest(env, { email = 'pre12-person@example.test', phone = '+447700900121', name = 'Synthetic Owner' } = {}) {
  const db = env.DB.raw, id = randomUUID();
  db.prepare(`INSERT INTO app_settings (key,value,updated_at,updated_by) VALUES ('owner_enquiries',?,?,'fixture')
    ON CONFLICT (key) DO NOTHING`).run(JSON.stringify({ enabled: true, privacy_version: 'fixture-v1' }), T);
  db.prepare(`INSERT INTO owner_requests (id,request_id,payload_hash,name,phone,email,address,operation,valuation_requested,
    privacy_version,created_at,updated_at) VALUES (?,?,?,?,?,?,'1 Fixture Road','sale',1,'fixture-v1',?,?)`)
    .run(id, randomUUID(), 'f'.repeat(64), name, phone, email, T, T);
  return id;
}
function rentalApplication(env, applicant) {
  const db = env.DB.raw;
  db.prepare(`INSERT OR IGNORE INTO landlords (id,name,created_at,updated_at) VALUES (90,'Fixture landlord',?,?)`).run(T, T);
  db.prepare(`INSERT OR IGNORE INTO rentals (id,landlord_id,address,parish,service,created_at,updated_at)
    VALUES (90,90,'9 Fixture Street','St Helier','let_only',?,?)`).run(T, T);
  const answers = JSON.stringify({ employment: { status: 'employed', employer: 'Fixture Ltd', role: null },
    incomes: [{ amount: 40000, period: 'annual', basis: 'gross', currency: 'GBP' }], dependants: 0,
    references: [{ kind: 'employer', name: 'Referee Person', email: 'referee@example.test' }], guarantor: null });
  return Number(db.prepare(`INSERT INTO rental_applications (rental_id,applicant_id,rent,status,answers,submitted_at,
    created_at,created_by,updated_at,updated_by) VALUES (90,?,2000,'submitted',?,?,?,'admin@example.test',?,'applicant')`)
    .run(applicant, answers, T, T, T).lastInsertRowid);
}
const n = (env, table) => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('PUB-10/ADM-18: the search finds owner requests by email or phone, also from someone with no contact', async () => {
  const env = on(), cookie = await adminCookie(), p = person(env);
  const own = ownerRequest(env), alone = ownerRequest(env, { email: 'owner-only@example.test', phone: '+447700900999' });
  ownerRequest(env, { email: 'someone@example.test', phone: '+447700900888', name: 'Someone Else' });
  for (const [q, contacts, owners] of [['pre12-person@', [p.id], [own]], ['900121', [p.id], [own]],
    ['owner-only@', [], [alone]], ['900999', [], [alone]]]) {
    const r = await call(env, 'POST', `${BASE}/contact-search`, { cookie, body: { q } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.data.contacts.map(c => c.id), contacts, q);
    assert.deepEqual(r.data.owner_requests.map(o => o.id), owners, q);
  }
  // Before 0118 the search answers as before, with no owner requests.
  const old = { ...makeEnv({ skip: [118] }), PRE12_REQUESTS_READY: '1' };
  person(old);
  const r = await call(old, 'POST', `${BASE}/contact-search`, { cookie, body: { q: 'pre12-person@' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.data.owner_requests, []);
});

test('PUB-10/ADM-18: the erasure plan counts rental applications and owner requests; the existing deletes remove them', async () => {
  const env = on(), cookie = await adminCookie(), p = person(env, { state: 'resolved' });
  const own = ownerRequest(env);
  ownerRequest(env, { email: 'someone@example.test', phone: '+447700900888', name: 'Someone Else' });
  rentalApplication(env, p.applicant);
  const made = (await create(env, cookie, { kind: 'erasure' })).data.request;
  await call(env, 'POST', `${BASE}/${made.id}/contact`, { cookie, body: { revision: 1, contact_id: p.id } });
  const before = [n(env, 'rental_applications'), n(env, 'owner_requests')];
  const { erasure } = (await call(env, 'GET', `${BASE}/${made.id}`, { cookie })).data;
  assert.deepEqual(erasure.remove.map(x => [x.item, x.count]), [['contact', 1], ['searches', 1], ['offers', 0], ['matches', 0],
    ['marketing_preferences', 0], ['rental_applications', 1]]);
  assert.deepEqual(erasure.by_hand.map(x => [x.item, x.count]), [['viewing_requests', 0], ['owner_requests', 1], ['rentals', null]]);
  assert.deepEqual([n(env, 'rental_applications'), n(env, 'owner_requests')], before, 'reading the plan deletes nothing');
  // The applicant's Delete takes its rental applications; the owner request is erased on its own page.
  await call(env, 'POST', `${BASE}/${made.id}/close`, { cookie, body: { revision: 2, result: 'fulfilled' } });
  env.DB.raw.prepare('UPDATE applicants SET archived_at=? WHERE id=?').run(T, p.applicant);
  const del = await call(env, 'DELETE', `/admin/applicants/${p.applicant}`, { cookie, body: { confirm: 'Synthetic Person' } });
  assert.equal(del.status, 200, del.text);
  assert.equal(n(env, 'rental_applications'), 0);
  assert.equal((await call(env, 'DELETE', `/admin/owner-requests/${own}`, { cookie })).status, 200);
  assert.equal(n(env, 'owner_requests'), 1);
  // Before 0117 and 0118 the plan is as before.
  const old = { ...makeEnv({ skip: [117, 118] }), PRE12_REQUESTS_READY: '1' }, q = person(old);
  const m = (await create(old, cookie, { kind: 'erasure' })).data.request;
  await call(old, 'POST', `${BASE}/${m.id}/contact`, { cookie, body: { revision: 1, contact_id: q.id } });
  const plan = (await call(old, 'GET', `${BASE}/${m.id}`, { cookie })).data.erasure;
  assert.deepEqual(plan.remove.map(x => x.item), ['contact', 'searches', 'offers', 'matches', 'marketing_preferences']);
  assert.deepEqual(plan.by_hand.map(x => x.item), ['viewing_requests', 'rentals']);
});

test('PUB-10/ADM-18: the copy lists rental applications without their answers and names owner requests, only when there are any', async () => {
  const env = on(), cookie = await adminCookie(), { p, request } = await verified(env, cookie);
  const before = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data;
  assert.equal('rental_applications' in before.copy, false, 'same copy as before for someone without them');
  assert.equal(before.copy.not_included.some(x => ['rental_applications', 'owner_requests'].includes(x.section)), false);
  const id = rentalApplication(env, p.applicant);
  ownerRequest(env);
  const after = (await call(env, 'GET', `${BASE}/${request.id}/copy`, { cookie })).data;
  assert.notEqual(after.sha256, before.sha256);
  const [sample] = after.copy.rental_applications;
  assert.equal(sample.id, id);
  assert.equal(sample.status, 'submitted');
  // Every column is in the copy or named with its reason; the answers stay behind ADM-18's own permission.
  const named = after.copy.not_included.filter(x => x.section === 'rental_applications').flatMap(x => x.fields ?? []);
  const missing = env.DB.raw.prepare('PRAGMA table_info(rental_applications)').all().map(c => c.name)
    .filter(c => !(c in sample) && !named.includes(c));
  assert.deepEqual(missing, []);
  assert.equal('answers' in sample, false);
  for (const s of ['Fixture Ltd', 'referee@example.test', 'Synthetic Owner']) assert.equal(JSON.stringify(after.copy).includes(s), false, s);
  assert.ok(after.copy.not_included.some(x => x.section === 'owner_requests' && x.reason.length > 10));
  // Without 0117 and 0118 the copy is built as before.
  const old = { ...makeEnv({ skip: [117, 118] }), PRE12_REQUESTS_READY: '1' };
  const r = (await verified(old, cookie)).request;
  assert.equal((await call(old, 'GET', `${BASE}/${r.id}/copy`, { cookie })).status, 200);
});

test('PUB-10/ADM-18: the retention cleanup deletes a due contact with a rental application; owner requests are not touched', async () => {
  const env = on(), held = inactive(env, '+447700900341');
  rentalApplication(env, held.applicant);
  const own = ownerRequest(env, { email: 'quiet341@example.test', phone: '+447700900341' });
  await runRetention(env, PASS);
  assert.equal(exists(env, held.id), false);
  assert.equal(n(env, 'rental_applications'), 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM owner_requests WHERE id=?').get(own).n, 1, 'no period given by Hampton');
});
