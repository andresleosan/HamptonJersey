import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { makeEnv, call, adminCookie } from './helpers.mjs';
import { runRetention } from '../../server/retention.js';

// PRE-12: a tenancy linked to a contact by a team member, one click per tenancy (migration 0113,
// PRE12_TENANCY_LINK_READY). Synthetic people only.
const T = '2026-11-10T09:00:00.000Z', PASS = '2026-11-16T09:00:00.000Z', OLD = '2024-01-01T00:00:00.000Z';
const BASE = '/admin/privacy-requests';
const env0 = (schema = {}) => ({ ...makeEnv(schema), PRE12_REQUESTS_READY: '1' });
const on = (schema = {}) => ({ ...env0(schema), PRE12_TENANCY_LINK_READY: '1' });

function contact(env, { email = 'pre12-tenant@example.test', phone = '+447700900131', at = T, search = 'active' } = {}) {
  const db = env.DB.raw;
  const id = Number(db.prepare(`INSERT INTO contacts (name,email,phone,last_activity_at,created_at,updated_at)
    VALUES ('Synthetic Tenant',?,?,?,?,?)`).run(email, phone, at, at, at).lastInsertRowid);
  const resolved = search === 'resolved' ? [at, 'admin@example.test', 'Found a home', at] : [null, null, null, null];
  const applicant = search && Number(db.prepare(`INSERT INTO applicants (contact_id,operation,source,search_state,resolved_at,
    resolved_by,resolution_reason,archived_at,created_at,updated_at) VALUES (?,'rent','phone',?,?,?,?,?,?,?)`)
    .run(id, search, ...resolved, at, at).lastInsertRowid);
  return { id, applicant };
}
function tenancy(env, { email = 'PRE12-tenant@example.test', phone = '07700 900131', name = 'Synthetic Tenant', ended = null } = {}) {
  const db = env.DB.raw;
  if (!db.prepare('SELECT 1 FROM landlords').get())
    db.prepare("INSERT INTO landlords (name,created_at,updated_at) VALUES ('Synthetic Landlord',?,?)").run(T, T);
  const r = Number(db.prepare(`INSERT INTO rentals (landlord_id,address,parish,service,fee_percent,created_at,updated_at)
    VALUES ((SELECT MAX(id) FROM landlords),'1 Fictitious Row','St Helier','full',10,?,?)`).run(T, T).lastInsertRowid);
  return Number(db.prepare(`INSERT INTO tenancies (rental_id,payment_ref,tenant_name,tenant_email,tenant_phone,occupants,kind,regime,
    start_on,end_on,rent,due_day,deposit,ended_on,notes,created_at,updated_at) VALUES (?,?,?,?,?,'A child of the tenant','fixed','2025',
    '2026-01-01','2027-01-01',1500,1,2000,?,'internal tenancy note',?,?)`)
    .run(r, `REF${r}`, name, email, phone, ended, T, T).lastInsertRowid);
}
const links = env => env.DB.raw.prepare('SELECT tenancy_id, contact_id, linked, actor FROM tenancy_contact_links ORDER BY id').all()
  .map(r => ({ ...r }));
const setLink = (env, cookie, t, c, linked) => call(env, 'POST', `/admin/tenancies/${t}/contacts/${c}`, { cookie, body: { linked } });
const create = (env, cookie, kind) => call(env, 'POST', BASE, { cookie, body: { id: randomUUID(), kind,
  received_on: '2026-11-12', received_via: 'email', reference: 'Email to the office' } });
async function request(env, cookie, c, kind = 'access') {
  const made = await create(env, cookie, kind);
  let r = await call(env, 'POST', `${BASE}/${made.data.request.id}/contact`, { cookie,
    body: { revision: made.data.request.revision, contact_id: c } });
  r = await call(env, 'POST', `${BASE}/${made.data.request.id}/identity`, { cookie,
    body: { revision: r.data.request.revision, method: 'photo_id', reference: 'Passport seen' } });
  assert.equal(r.status, 200, r.text);
  return r.data.request;
}
const copyOf = async (env, cookie, id) => (await call(env, 'GET', `${BASE}/${id}/copy`, { cookie })).data;
const sqlOf = async env => {
  const seen = [], prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => { seen.push(sql); return prepare(sql); };
  await runRetention(env, PASS);
  env.DB.prepare = prepare;
  return seen;
};

test('both wrangler files carry the switch, on (0113 applied 16-nov-2026)', () => {
  const flag = f => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').match(/^PRE12_TENANCY_LINK_READY = "(\d)"$/m)?.[1];
  assert.equal(flag('wrangler.toml'), '1');
  assert.equal(flag('jobs/wrangler.toml'), flag('wrangler.toml'));
});

test('switched off, or without 0113: no route, same copy and hash, rentals by hand and the same cleanup SQL', async () => {
  const cookie = await adminCookie();
  const copies = [];
  for (const env of [env0(), env0({ skip: [113] }), on({ skip: [113] })]) {
    const c = contact(env), t = tenancy(env), r = await request(env, cookie, c.id);
    const off = env.PRE12_TENANCY_LINK_READY !== '1';
    // Switched on before 0113: the proposals are listed, with no decision; nothing can be written.
    assert.equal((await call(env, 'GET', `/admin/tenancies/${t}/contacts`, { cookie })).status, off ? 404 : 200);
    assert.equal((await setLink(env, cookie, t, c.id, true)).status, 404);
    assert.equal((await call(env, 'POST', `${BASE}/${r.id}/tenancies/${t}`, { cookie, body: { linked: true } })).status, 404);
    const d = (await call(env, 'GET', `${BASE}/${r.id}`, { cookie })).data;
    if (off) assert.equal('tenancies' in d, false);
    else assert.deepEqual(d.tenancies.map(x => [x.id, x.matched_by, x.link]), [[t, ['email', 'phone'], null]]);
    const copy = await copyOf(env, cookie, r.id);
    assert.equal('tenancies' in copy.copy, false);
    copies.push(JSON.stringify({ ...copy.copy, request_id: null }));
    const erasure = await request(env, cookie, c.id, 'erasure');
    const plan = (await call(env, 'GET', `${BASE}/${erasure.id}`, { cookie })).data.erasure;
    assert.deepEqual(plan.by_hand.map(x => [x.item, x.count]), off ? [['viewing_requests', 0], ['owner_requests', 0], ['rentals', null]]
      : [['viewing_requests', 0], ['owner_requests', 0], ['tenancies', 0], ['tenancy_candidates', 1]]);
  }
  // Same person, same data: the same copy whatever the switch and the schema (its request id aside).
  assert.equal(new Set(copies).size, 1);
  // The cleanup's SQL is the same with the switch off whether or not 0113 exists, and switched on without 0113.
  const [a, b, c] = await Promise.all([sqlOf(env0()), sqlOf(env0({ skip: [113] })), sqlOf(on({ skip: [113] }))]);
  assert.deepEqual(a, b);
  assert.deepEqual(c.filter(s => !/tenancy_contact_links/.test(s)), b);
  assert.equal(a.some(s => /tenancy_contact_links/.test(s)), false);
});

test('the copy hash is the same switched on while nothing is linked', async () => {
  const cookie = await adminCookie(), env = env0();
  const c = contact(env); tenancy(env);
  const r = await request(env, cookie, c.id), before = (await copyOf(env, cookie, r.id)).sha256;
  env.PRE12_TENANCY_LINK_READY = '1';
  assert.equal((await copyOf(env, cookie, r.id)).sha256, before);
});

test('a matching email, phone or origin only proposes the contact; a click links it', async () => {
  const env = on(), cookie = await adminCookie();
  const c = contact(env), other = contact(env, { email: 'someone-else@example.test', phone: '+447700900999' });
  const byOrigin = contact(env, { email: 'household@example.test', phone: '+447700900555' });
  const t = tenancy(env);
  env.DB.raw.prepare(`INSERT INTO tenancy_origins (tenancy_id,operation_id,rental_id,listing_id,applicant_id,listing_updated_at,
    applicant_updated_at,created_at,created_by) VALUES (?,'op-pre12-1',(SELECT rental_id FROM tenancies WHERE id = ?),'HE-R001',?,?,?,?,?)`)
    .run(t, t, byOrigin.applicant, T, T, T, 'admin@example.test');
  const list = await call(env, 'GET', `/admin/tenancies/${t}/contacts`, { cookie });
  assert.equal(list.status, 200, list.text);
  assert.deepEqual(list.data.contacts.map(x => [x.id, x.matched_by, x.link]).sort((a, b) => a[0] - b[0]),
    [[c.id, ['email', 'phone'], null], [byOrigin.id, ['origin'], null]]);
  assert.deepEqual(links(env), [], 'listing writes nothing');
  assert.equal((await setLink(env, cookie, t, other.id, true)).status, 404, 'not a candidate');
  const linked = await setLink(env, cookie, t, byOrigin.id, true);
  assert.equal(linked.status, 200, linked.text);
  const l = linked.data.contacts.find(x => x.id === byOrigin.id).link;
  assert.deepEqual({ ...l, at: undefined }, { linked: true, current: true, by: 'admin@example.test', at: undefined });
  assert.deepEqual(links(env), [{ tenancy_id: t, contact_id: byOrigin.id, linked: 1, actor: 'admin@example.test' }]);
  assert.equal((await setLink(env, cookie, t, c.id, 'yes')).status, 400);
});

test('append-only: the latest decision counts, and only current links enter the copy with explicit columns', async () => {
  const env = on(), cookie = await adminCookie();
  const c = contact(env), t = tenancy(env), r = await request(env, cookie, c.id);
  const before = await copyOf(env, cookie, r.id);
  await call(env, 'POST', `${BASE}/${r.id}/copy-review`, { cookie, body: { revision: r.revision, sha256: before.sha256 } });
  const decided = await call(env, 'POST', `${BASE}/${r.id}/tenancies/${t}`, { cookie, body: { linked: true } });
  assert.equal(decided.status, 200, decided.text);
  assert.equal(decided.data.tenancies[0].link.current, true);
  // The copy changed, so its review was cleared.
  assert.equal((await call(env, 'GET', `${BASE}/${r.id}`, { cookie })).data.request.copy_review, null);
  const { copy } = await copyOf(env, cookie, r.id);
  assert.deepEqual(copy.tenancies, [{ id: t, address: '1 Fictitious Row', parish: 'St Helier', kind: 'fixed', start_on: '2026-01-01',
    end_on: '2027-01-01', ended_on: null, notice_given_on: null, notice_by: null, agreement_on: null, tenant_name: 'Synthetic Tenant',
    tenant_email: 'PRE12-tenant@example.test', tenant_phone: '07700 900131' }]);
  const text = JSON.stringify(copy);
  assert.equal(text.includes('internal tenancy note') || text.includes('A child of the tenant') || text.includes('1500'), false);
  // Every column of a tenancy is in the copy or named in not_included with its reason.
  const named = copy.not_included.filter(n => n.section === 'tenancies').flatMap(n => n.fields ?? []);
  const missing = env.DB.raw.prepare('PRAGMA table_info(tenancies)').all().map(x => x.name)
    .filter(x => !(x in copy.tenancies[0]) && !named.includes(x));
  assert.deepEqual(missing, []);
  assert.ok(named.includes('rental_id') && named.includes('occupants') && named.includes('landlord_id'));
  assert.ok(copy.not_included.some(n => n.section === 'tenancy_records' && n.reason));
  const csv = await call(env, 'POST', `${BASE}/${r.id}/copy-review`, { cookie,
    body: { revision: (await call(env, 'GET', `${BASE}/${r.id}`, { cookie })).data.request.revision,
      sha256: (await copyOf(env, cookie, r.id)).sha256 } });
  assert.equal(csv.status, 200, csv.text);
  assert.match((await call(env, 'GET', `${BASE}/${r.id}/copy/download?format=csv`, { cookie })).text, /\r\ntenancies,1,address,1 Fictitious Row\r\n/);
  assert.throws(() => env.DB.raw.prepare('UPDATE tenancy_contact_links SET linked = 0').run(), /append-only/);
  // Taken back: out of the copy; linked again: back in.
  await setLink(env, cookie, t, c.id, false);
  assert.equal('tenancies' in (await copyOf(env, cookie, r.id)).copy, false);
  await setLink(env, cookie, t, c.id, true);
  assert.deepEqual((await copyOf(env, cookie, r.id)).copy.tenancies.map(x => x.id), [t]);
  assert.deepEqual(links(env).map(x => x.linked), [1, 0, 1]);
});

test("changing the tenant's name, email or phone needs the link confirmed again; other changes do not", async () => {
  const env = on(), cookie = await adminCookie();
  const c = contact(env), t = tenancy(env), r = await request(env, cookie, c.id);
  await setLink(env, cookie, t, c.id, true);
  const inCopy = async () => ((await copyOf(env, cookie, r.id)).copy.tenancies ?? []).map(x => x.id);
  env.DB.raw.prepare('UPDATE tenancies SET rent = 1600 WHERE id = ?').run(t);
  assert.deepEqual(await inCopy(), [t]);
  for (const [col, value] of [['tenant_name', 'Synthetic Tenant Jr'], ['tenant_email', 'pre12-tenant@example.test'], ['tenant_phone', '+447700900131']]) {
    env.DB.raw.prepare(`UPDATE tenancies SET ${col} = ? WHERE id = ?`).run(value, t);
    assert.deepEqual(await inCopy(), [], col);
    const listed = (await call(env, 'GET', `/admin/tenancies/${t}/contacts`, { cookie })).data.contacts[0].link;
    assert.equal(listed.linked && !listed.current, true);
    await setLink(env, cookie, t, c.id, true);
    assert.deepEqual(await inCopy(), [t]);
  }
});

test('the erasure plan counts linked tenancies and candidates, and deletes no tenancy', async () => {
  const env = on(), cookie = await adminCookie();
  const c = contact(env), t1 = tenancy(env), t2 = tenancy(env, { email: null }), t3 = tenancy(env);
  await setLink(env, cookie, t1, c.id, true);
  await setLink(env, cookie, t3, c.id, false);
  const r = await request(env, cookie, c.id, 'erasure');
  const d = (await call(env, 'GET', `${BASE}/${r.id}`, { cookie })).data;
  assert.deepEqual(d.erasure.by_hand.map(x => [x.item, x.count]), [['viewing_requests', 0], ['owner_requests', 0], ['tenancies', 1],
    ['tenancy_candidates', 1]]);
  assert.deepEqual(d.tenancies.map(x => x.id).sort(), [t1, t2, t3].sort());
  const closed = await call(env, 'POST', `${BASE}/${r.id}/close`, { cookie, body: { revision: d.request.revision, result: 'fulfilled' } });
  assert.equal(closed.status, 200, closed.text);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM tenancies').get().n, 3);
});

test('the cleanup keeps a contact linked to a running tenancy, only with the switch', async () => {
  const cookie = await adminCookie();
  const gone = (env, id) => !env.DB.raw.prepare('SELECT 1 FROM contacts WHERE id = ?').get(id);
  for (const flag of ['1', '0']) {
    const env = on();
    const running = contact(env, { email: 'a@example.test', phone: null, at: OLD, search: null });
    const future = contact(env, { email: 'b@example.test', phone: null, at: OLD, search: null });
    const ended = contact(env, { email: 'c@example.test', phone: null, at: OLD, search: null });
    const removed = contact(env, { email: 'd@example.test', phone: null, at: OLD, search: null });
    const stale = contact(env, { email: 'e@example.test', phone: null, at: OLD, search: null });
    const tR = tenancy(env, { email: 'a@example.test', phone: null }), tF = tenancy(env, { email: 'b@example.test', phone: null, ended: '2026-12-31' });
    const tE = tenancy(env, { email: 'c@example.test', phone: null, ended: '2026-11-01' }), tD = tenancy(env, { email: 'd@example.test', phone: null });
    const tS = tenancy(env, { email: 'e@example.test', phone: null });
    for (const [t, c] of [[tR, running], [tF, future], [tE, ended], [tD, removed], [tS, stale]]) await setLink(env, cookie, t, c.id, true);
    await setLink(env, cookie, tD, removed.id, false);
    // When in doubt, kept: a link whose tenant details changed since still keeps the contact while the tenancy runs.
    env.DB.raw.prepare("UPDATE tenancies SET tenant_name = 'Changed' WHERE id = ?").run(tS);
    env.PRE12_TENANCY_LINK_READY = flag;
    await runRetention(env, PASS);
    assert.deepEqual([running, future, ended, removed, stale].map(c => gone(env, c.id)),
      flag === '1' ? [false, false, true, true, false] : [true, true, true, true, true], `switch ${flag}`);
    assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM tenancies').get().n, 5);
  }
  // Switched on before 0113: the pass deletes as before and does not fail.
  const env = on({ skip: [113] }), c = contact(env, { email: 'a@example.test', phone: null, at: OLD, search: null });
  tenancy(env, { email: 'a@example.test', phone: null });
  await runRetention(env, PASS);
  assert.equal(gone(env, c.id), true);
});

test("the applicant's Delete waits for a running linked tenancy; otherwise it is not blocked", async () => {
  const cookie = await adminCookie();
  for (const [flag, ended, status] of [['1', null, 409], ['1', '2026-11-01', 200], ['0', null, 200]]) {
    const env = on(), c = contact(env, { search: 'resolved' }), t = tenancy(env, { ended });
    env.DB.raw.prepare('UPDATE applicants SET archived_at = ? WHERE id = ?').run(T, c.applicant);
    await setLink(env, cookie, t, c.id, true);
    env.PRE12_TENANCY_LINK_READY = flag;
    const del = await call(env, 'DELETE', `/admin/applicants/${c.applicant}`, { cookie, body: { confirm: 'Synthetic Tenant' } });
    assert.equal(del.status, status, `${flag} ${ended} ${del.text}`);
    assert.equal(!!env.DB.raw.prepare('SELECT 1 FROM contacts WHERE id = ?').get(c.id), status === 409);
    assert.equal(links(env).length, 1, 'the link rows stay, ids only');
  }
});

test('only signed-in team members link; a closed request or one without a contact takes no decision', async () => {
  const env = on(), cookie = await adminCookie();
  const c = contact(env), t = tenancy(env);
  assert.equal((await call(env, 'GET', `/admin/tenancies/${t}/contacts`)).status, 401);
  assert.equal((await setLink(env, undefined, t, c.id, true)).status, 401);
  assert.equal((await call(env, 'POST', `/admin/tenancies/${t}/contacts/${c.id}`, { cookie, origin: 'https://evil.test',
    body: { linked: true } })).status, 403);
  assert.equal((await call(env, 'GET', `/admin/tenancies/${t}/contacts`, { cookie: await adminCookie('outsider@example.test') })).status, 401);
  assert.equal((await call(env, 'GET', '/admin/tenancies/999/contacts', { cookie })).status, 404);
  const bare = (await create(env, cookie, 'access')).data.request;
  assert.equal((await call(env, 'POST', `${BASE}/${bare.id}/tenancies/${t}`, { cookie, body: { linked: true } })).status, 400);
  const r = await request(env, cookie, c.id);
  const closed = await call(env, 'POST', `${BASE}/${r.id}/close`, { cookie, body: { revision: r.revision, result: 'withdrawn' } });
  assert.equal(closed.status, 200, closed.text);
  assert.equal((await call(env, 'POST', `${BASE}/${r.id}/tenancies/${t}`, { cookie, body: { linked: true } })).status, 409);
  assert.deepEqual(links(env), []);
});

// Review fixes (16-nov): the erasure plan's holds, and writes checked again inside their own batch.
test('the erasure plan names a running linked tenancy as a hold, only with the switch', async () => {
  const cookie = await adminCookie();
  for (const [flag, ended, expected] of [['1', null, true], ['1', '2026-11-01', false], ['0', null, false]]) {
    const env = on(), c = contact(env, { search: 'resolved' }), t = tenancy(env, { ended });
    await setLink(env, cookie, t, c.id, true);
    env.PRE12_TENANCY_LINK_READY = flag;
    const r = await request(env, cookie, c.id, 'erasure');
    const d = (await call(env, 'GET', `${BASE}/${r.id}`, { cookie })).data;
    assert.equal(d.holds.some(h => h.code === 'running_tenancy'), expected, `${flag} ${ended}`);
    assert.equal(d.erasure.can_delete, !expected);
    assert.deepEqual(d.holds.filter(h => h.code === 'running_tenancy'), expected ? [{ code: 'running_tenancy' }] : []);
  }
  // Switched on before 0113: no hold and no failure.
  const env = on({ skip: [113] }), c = contact(env, { search: 'resolved' }), r = await request(env, cookie, c.id, 'erasure');
  const d = await call(env, 'GET', `${BASE}/${r.id}`, { cookie });
  assert.equal(d.status, 200, d.text);
  assert.deepEqual(d.data.holds, []);
});

test("a link made while the applicant's Delete runs stops it inside its batch", async () => {
  const env = on(), cookie = await adminCookie(), c = contact(env, { search: 'resolved' }), t = tenancy(env);
  env.DB.raw.prepare('UPDATE applicants SET archived_at = ? WHERE id = ?').run(T, c.applicant);
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => {
    if (stmts.some(s => /DELETE FROM contacts/.test(s.sql))) env.DB.raw.prepare(`INSERT INTO tenancy_contact_links
      (tenancy_id, contact_id, linked, tenant_revision, actor, at) VALUES (?, ?, 1, ?, 'colleague@example.test', ?)`).run(t, c.id, 'a'.repeat(64), T);
    return batch(stmts);
  };
  const del = await call(env, 'DELETE', `/admin/applicants/${c.applicant}`, { cookie, body: { confirm: 'Synthetic Tenant' } });
  assert.equal(del.status, 409, del.text);
  assert.ok(env.DB.raw.prepare('SELECT 1 FROM contacts WHERE id = ?').get(c.id));
  assert.ok(env.DB.raw.prepare('SELECT 1 FROM applicants WHERE id = ?').get(c.applicant));
});

test('a tenancy decision from a request closed or relinked meanwhile is refused and writes nothing', async () => {
  const cookie = await adminCookie();
  for (const change of ["UPDATE privacy_requests SET state = 'closed', result = 'withdrawn', closed_at = updated_at", 'UPDATE privacy_requests SET contact_id = ?']) {
    const env = on(), c = contact(env), t = tenancy(env), r = await request(env, cookie, c.id);
    const other = contact(env, { email: 'another@example.test', phone: '+447700900777' });
    const batch = env.DB.batch.bind(env.DB);
    env.DB.batch = stmts => {
      if (stmts.some(s => /INSERT INTO tenancy_contact_links/.test(s.sql)))
        env.DB.raw.prepare(change).run(...(change.includes('?') ? [other.id] : []));
      return batch(stmts);
    };
    const res = await call(env, 'POST', `${BASE}/${r.id}/tenancies/${t}`, { cookie, body: { linked: true } });
    assert.equal(res.status, 409, res.text);
    assert.deepEqual(links(env), []);
  }
});
