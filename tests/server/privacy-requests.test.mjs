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
    [['contact', 1], ['searches', 1], ['offers', 1], ['matches', 0], ['marketing_preferences', 0]]);
  assert.deepEqual(r.data.erasure.by_hand.map(x => [x.item, x.count]), [['viewing_requests', 1], ['rentals', null]]);
  assert.deepEqual(counts(env), before, 'nothing deleted or written by reading the plan');
  // Empty details never match someone else's: a contact without email matches no viewing request with an empty one.
  const noEmail = Number(db.prepare(`INSERT INTO contacts (name,email,phone,last_activity_at,created_at,updated_at)
    VALUES ('Blank Person',NULL,'+447700900777',?,?,?)`).run(T, T, T).lastInsertRowid);
  db.prepare(`INSERT INTO viewing_requests (listing_id,agent,kind,date,time,name,email,phone,status,created_at,updated_at)
    VALUES ('HE-R001','team','in_person','2026-11-21','11:00','Someone Else','','','requested',?,?)`).run(T, T);
  const unknown = (await create(env, cookie, { kind: 'erasure' })).data.request;
  await call(env, 'POST', `${BASE}/${unknown.id}/contact`, { cookie, body: { revision: 1, contact_id: noEmail } });
  const none = await call(env, 'GET', `${BASE}/${unknown.id}`, { cookie });
  assert.deepEqual(none.data.erasure.by_hand.map(x => [x.item, x.count]), [['viewing_requests', 0], ['rentals', null]]);
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
  assert.deepEqual(plan.by_hand.map(x => [x.item, x.count]), [['viewing_requests', 2], ['rentals', null]]);
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
