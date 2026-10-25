import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { runRetention, claimRetentionDay, RETENTION_CAP, EXPIRING } from "../../server/retention.js";

// The pass runs at 09:00 on Sunday 25 October 2026 (GMT since 01:00 that day): the contacts' cutoff is
// 2025-10-25T09:00:00.000Z and the viewings' 2025-10-25.
const TS = "2026-10-25T09:00:00.000Z";
const ADMIN = "luismadef45@gmail.com";

const insert = (env, table, row) => {
  const cols = Object.keys(row);
  const r = env.DB.raw.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...cols.map(c => row[c]));
  return Number(r.lastInsertRowid);
};
// Plain objects: node:sqlite rows have a null prototype.
const row = (env, sql, ...args) => { const r = env.DB.raw.prepare(sql).get(...args); return r && { ...r }; };
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const contact = (env, last_activity_at, o = {}) => insert(env, "contacts", {
  name: "Jane Le Brocq", email: "jane@example.je", phone: "+447797123456", last_activity_at, created_at: T0, updated_at: T0, ...o });
const applicant = (env, contact_id, o = {}) => insert(env, "applicants", {
  contact_id, operation: "buy", source: "web", created_at: T0, updated_at: T0, ...o });
const match = (env, applicant_id) => insert(env, "matches", {
  applicant_id, listing_id: "HE-R001", score: 60, checks: "[]", status: "found", created_at: T0, updated_at: T0 });
const offer = (env, applicant_id) => insert(env, "offers", {
  listing_id: "HE-R001", applicant_id, amount: 750000, status: "accepted", created_at: T0, updated_at: T0 });
const SALE_STATUS = {
  in_progress: {}, completed: { closed_at: T0 }, fallen_through: { fell_through_reason: "finance", closed_at: T0 } };
const sale = (env, applicant_id, status) => insert(env, "sales", {
  listing_id: "HE-R001", applicant_id, offer_id: offer(env, applicant_id), price: 750000, status, ...SALE_STATUS[status],
  created_at: T0, updated_at: T0 });
const viewing = (env, date, o = {}) => insert(env, "viewing_requests", {
  kind: "In person", date, time: "11:00", end_time: "11:30", name: "Tom Vibert", email: "tom@example.je",
  phone: "07797 654321", status: "completed", created_at: T0, ...o });
// An event with data and its open notice.
function notice(env, entity_type, entity_id, { category = "new_applicant", title = "New applicant: Jane Le Brocq · To Buy" } = {}) {
  const event_id = insert(env, "events", { at: T0, actor: "public", entity_type, entity_id: String(entity_id),
    type: `${entity_type}.created`, data: JSON.stringify({ name: "Jane Le Brocq" }) });
  return insert(env, "notifications", { event_id, category, title, action_required: 1, created_at: T0 });
}
const eventsOf = (env, entity_type, id) => rows(env,
  "SELECT type, actor, data FROM events WHERE entity_type = ? AND entity_id = ? ORDER BY id", entity_type, String(id));
const noticeRow = (env, id) => row(env, "SELECT title, resolved_at, resolved_by FROM notifications WHERE id = ?", id);
const count = (env, table) => row(env, `SELECT COUNT(*) AS n FROM ${table}`).n;
const exists = (env, table, id) => !!row(env, `SELECT 1 FROM ${table} WHERE id = ?`, id);

function world() {
  const env = makeEnv();
  seedListing(env);
  return env;
}

test("deletes a contact inactive for 12 months with its searches, matches and offers", async () => {
  const env = world();
  const c = contact(env, "2025-10-01T10:00:00.000Z");
  const a = applicant(env, c), a2 = applicant(env, c, { operation: "rent" });
  const m = match(env, a), o = offer(env, a);
  const n = notice(env, "applicant", a), nc = notice(env, "contact", c, { title: "Jane Le Brocq registered again" });
  assert.deepEqual(await runRetention(env, TS), { contacts: 1, viewings: 0 });

  assert.deepEqual([exists(env, "contacts", c), exists(env, "applicants", a), exists(env, "applicants", a2),
    exists(env, "matches", m), exists(env, "offers", o)], [false, false, false, false, false]);
  for (const id of [n, nc]) assert.deepEqual(noticeRow(env, id), { title: "Deleted applicant", resolved_at: TS, resolved_by: "system" });
  assert.deepEqual(eventsOf(env, "applicant", a), [
    { type: "applicant.created", actor: "public", data: null }, { type: "applicant.deleted", actor: "system", data: null }]);
  assert.deepEqual(eventsOf(env, "applicant", a2), [{ type: "applicant.deleted", actor: "system", data: null }]);
  assert.deepEqual(eventsOf(env, "contact", c), [
    { type: "contact.created", actor: "public", data: null }, { type: "contact.deleted", actor: "system", data: null }]);
  assert.equal(row(env, "SELECT at FROM events ORDER BY id DESC LIMIT 1").at, TS);
  // The Inbox Feed still lists the notices, nameless, as after the manual delete.
  const feed = await call(env, "GET", "/admin/notifications?box=feed", { cookie: await adminCookie(ADMIN) });
  assert.deepEqual(feed.data.notifications.filter(x => [n, nc].includes(x.id)).map(x => [x.title, x.phone]),
    [["Deleted applicant", null], ["Deleted applicant", null]]);
});

test("keeps a contact active 11 months ago", async () => {
  const env = world();
  const recent = contact(env, "2025-11-25T09:00:00.000Z");
  // Exactly 12 months to the millisecond is not yet over.
  const edge = contact(env, "2025-10-25T09:00:00.000Z", { email: "edge@example.je", phone: null });
  const a = applicant(env, recent), n = notice(env, "applicant", a);
  assert.deepEqual(await runRetention(env, TS), { contacts: 0, viewings: 0 });
  assert.deepEqual([exists(env, "contacts", recent), exists(env, "contacts", edge), exists(env, "applicants", a)], [true, true, true]);
  assert.deepEqual(noticeRow(env, n), { title: "New applicant: Jane Le Brocq · To Buy", resolved_at: null, resolved_by: null });
  assert.equal(eventsOf(env, "applicant", a)[0].data, JSON.stringify({ name: "Jane Le Brocq" }));
});

test("keeps a contact with a sale in any status", async () => {
  const env = world();
  const kept = Object.keys(SALE_STATUS).map((status, i) => {
    const c = contact(env, "2024-01-01T00:00:00.000Z", { email: `buyer${i}@example.je`, phone: null });
    // Two searches: the sale is on the second one, and it keeps the first one too.
    const plain = applicant(env, c, { operation: "rent" }), sold = applicant(env, c);
    sale(env, sold, status);
    return { c, plain, sold, n: notice(env, "applicant", plain) };
  });
  const gone = contact(env, "2024-01-01T00:00:00.000Z");
  assert.deepEqual(await runRetention(env, TS), { contacts: 1, viewings: 0 });
  assert.equal(exists(env, "contacts", gone), false);
  for (const k of kept) {
    assert.deepEqual([exists(env, "contacts", k.c), exists(env, "applicants", k.plain), exists(env, "applicants", k.sold)],
      [true, true, true]);
    assert.equal(noticeRow(env, k.n).resolved_by, null);
    assert.notEqual(eventsOf(env, "applicant", k.plain)[0].data, null);
  }
  assert.deepEqual([count(env, "offers"), count(env, "sales")], [3, 3]);
});

test("deletes viewing requests whose date is over 12 months old", async () => {
  const env = world();
  const old = viewing(env, "2025-10-24"), edge = viewing(env, "2025-10-25"), recent = viewing(env, "2025-10-26");
  const n = notice(env, "viewing", old, { category: "viewing", title: "Viewing request: Tom Vibert" });
  const kept = notice(env, "viewing", recent, { category: "viewing", title: "Viewing request: Tom Vibert" });
  assert.deepEqual(await runRetention(env, TS), { contacts: 0, viewings: 1 });
  assert.deepEqual([exists(env, "viewing_requests", old), exists(env, "viewing_requests", edge),
    exists(env, "viewing_requests", recent)], [false, true, true]);
  assert.deepEqual(noticeRow(env, n), { title: "Deleted viewing request", resolved_at: TS, resolved_by: "system" });
  assert.deepEqual(eventsOf(env, "viewing", old), [{ type: "viewing.created", actor: "public", data: null }]);
  assert.deepEqual(noticeRow(env, kept), { title: "Viewing request: Tom Vibert", resolved_at: null, resolved_by: null });
  assert.notEqual(eventsOf(env, "viewing", recent)[0].data, null);
});

test("stops at 500 per pass, oldest first", async () => {
  const env = world();
  assert.equal(RETENTION_CAP, 500);
  const at = i => new Date(Date.parse("2025-01-01T00:00:00.000Z") + i * 60e3).toISOString();
  const ids = Array.from({ length: 501 }, (_, i) => {
    const c = contact(env, at(i), { email: `c${i}@example.je`, phone: null });
    applicant(env, c);
    return c;
  });
  for (let i = 0; i < 501; i++) viewing(env, i < 250 ? "2025-01-02" : "2025-01-01");
  assert.deepEqual(await runRetention(env, TS), { contacts: 500, viewings: 500 });
  assert.deepEqual(rows(env, "SELECT id FROM contacts").map(r => r.id), [ids[500]]);
  // Every statement acted on the same 500: one search left, and one deletion event per contact and per search.
  assert.deepEqual(rows(env, "SELECT contact_id FROM applicants").map(r => r.contact_id), [ids[500]]);
  assert.deepEqual(rows(env, "SELECT type, COUNT(*) AS n FROM events GROUP BY type ORDER BY type").map(r => [r.type, r.n]),
    [["applicant.deleted", 500], ["contact.deleted", 500]]);
  // Viewings oldest first too: the one left is from the later date.
  assert.deepEqual(rows(env, "SELECT date FROM viewing_requests").map(r => r.date), ["2025-01-02"]);
  assert.deepEqual(await runRetention(env, TS), { contacts: 1, viewings: 1 });
});

test("claims the day once", async () => {
  const env = world();
  assert.equal(await claimRetentionDay(env, "2026-10-25"), true);
  assert.equal(await claimRetentionDay(env, "2026-10-25"), false);
  assert.equal(await claimRetentionDay(env, "2026-10-24"), false);
  assert.equal(await claimRetentionDay(env, "2026-10-26"), true);
  assert.deepEqual(JSON.parse(row(env, "SELECT value FROM app_settings WHERE key = 'retention_run'").value), { date: "2026-10-26" });
});

test("the counts request runs the pass once a day", async t => {
  // 23:30 UTC on the 24th is already the 25th in Jersey (BST until 01:00 UTC on the 25th).
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-24T23:30:00.000Z") });
  const env = world(), cookie = await adminCookie(ADMIN);
  const first = contact(env, "2025-10-01T10:00:00.000Z");
  const r = await call(env, "GET", "/admin/notifications/counts", { cookie });
  assert.equal(r.status, 200);
  assert.equal(typeof r.data.action, "number");
  assert.equal(exists(env, "contacts", first), false);
  assert.deepEqual(JSON.parse(row(env, "SELECT value FROM app_settings WHERE key = 'retention_run'").value), { date: "2026-10-25" });
  // Another poll the same Jersey day deletes nothing; the next day's first one does.
  const second = contact(env, "2025-10-01T10:00:00.000Z", { email: "late@example.je", phone: null });
  assert.equal((await call(env, "GET", "/admin/notifications/counts", { cookie })).status, 200);
  assert.equal(exists(env, "contacts", second), true);
  t.mock.timers.setTime(Date.parse("2026-10-26T08:00:00.000Z"));
  assert.equal((await call(env, "GET", "/admin/notifications/counts", { cookie: await adminCookie(ADMIN) })).status, 200);
  assert.equal(exists(env, "contacts", second), false);
});

test("a viewing request restarts the matching contact's clock", async t => {
  // Wednesday 28 October 2026, 12:05 in Jersey; tomorrow is a Thursday the website books.
  const NOW = Date.parse("2026-10-28T12:05:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = world(), cookie = await adminCookie(ADMIN), OLD = "2026-01-01T00:00:00.000Z";
  const byEmail = contact(env, OLD, { phone: null });
  const byPhone = contact(env, OLD, { email: null, phone: "+447797123456" });
  const other = contact(env, OLD, { email: "other@example.je", phone: "+447797999999" });
  const last = id => row(env, "SELECT last_activity_at FROM contacts WHERE id = ?", id).last_activity_at;

  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: "hampton.test" }));
  const web = await call(env, "POST", "/viewings", { body: { listing_id: "HE-R001", negotiator_id: 1, kind: "In person",
    date: "2026-10-29", time: "11:00", name: "Jane Le Brocq", email: "JANE@example.je", turnstile: "t" } });
  assert.equal(web.status, 201);
  assert.deepEqual([last(byEmail), last(byPhone), last(other)], [new Date(NOW).toISOString(), OLD, OLD]);

  t.mock.timers.setTime(NOW + 60e3);
  const panel = await call(env, "POST", "/admin/viewings", { cookie, body: { negotiator_id: 1, kind: "In person",
    date: "2026-10-28", time: "15:00", name: "Jane Le Brocq", phone: "07797 123 456" } });
  assert.equal(panel.status, 201);
  assert.deepEqual([last(byEmail), last(byPhone), last(other)],
    [new Date(NOW).toISOString(), new Date(NOW + 60e3).toISOString(), OLD]);

  // A booking whose slot is taken between its check and its batch writes nothing, the clock included.
  t.mock.timers.setTime(NOW + 120e3);
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => {
    if (stmts.some(s => s.sql.includes("INSERT INTO viewing_requests"))) viewing(env, "2026-10-28",
      { negotiator_id: 1, time: "16:00", end_time: "16:30", status: "confirmed" });
    return batch(stmts);
  };
  const lost = await call(env, "POST", "/admin/viewings", { cookie, body: { negotiator_id: 1, kind: "In person",
    date: "2026-10-28", time: "16:00", name: "Jane Le Brocq", phone: "07797 123 456" } });
  assert.equal(lost.status, 409);
  assert.equal(last(byPhone), new Date(NOW + 60e3).toISOString());
});

// Task 2 (E8, E9): the warning before the deletion and Log conversation. Now is 09:00 on 25 October 2026 (GMT).
const NOW25 = Date.parse(TS);
const cookieFor = () => adminCookie(ADMIN);
const counts = async env => (await call(env, "GET", "/admin/notifications/counts", { cookie: await cookieFor() })).data;

test("counts.expiring: a contact active 11.5 months ago, not one at 10 months nor one with a sale", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW25 });
  const env = world();
  // A day after the pass would have run: the claim is taken, so the counts request deletes nothing here.
  await claimRetentionDay(env, "2026-10-25");
  const soon = contact(env, "2025-11-10T09:00:00.000Z");
  applicant(env, soon);
  contact(env, "2025-12-25T09:00:00.000Z", { email: "ten@example.je", phone: null });
  const kept = contact(env, "2025-11-10T09:00:00.000Z", { email: "buyer@example.je", phone: null });
  sale(env, applicant(env, kept), "fallen_through");
  // Window edges: exactly 12 months is still in it, exactly 11 months is not yet.
  contact(env, "2025-10-25T09:00:00.000Z", { email: "edge12@example.je", phone: null });
  contact(env, "2025-11-25T09:00:00.000Z", { email: "edge11@example.je", phone: null });
  assert.equal((await counts(env)).expiring, 2);
});

test("the expiring count reads only the window through the activity index", async () => {
  const env = world();
  const plan = env.DB.raw.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(*) FROM contacts c WHERE ${EXPIRING}`).all("x", "x")
    .map(r => r.detail).join("\n");
  assert.match(plan, /SEARCH c USING (COVERING )?INDEX contacts_activity \(last_activity_at>\? AND last_activity_at<\?\)/);
});

test("?expiring=1 lists only the expiring searches, with the day they go", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW25 });
  const env = world(), cookie = await cookieFor();
  const soon = contact(env, "2025-11-10T23:30:00.000Z");
  const a = applicant(env, soon), archived = applicant(env, soon, { operation: "rent", archived_at: T0 });
  applicant(env, contact(env, "2025-12-25T09:00:00.000Z", { email: "ten@example.je", phone: null }));
  const kept = contact(env, "2025-11-10T09:00:00.000Z", { email: "buyer@example.je", phone: null });
  sale(env, applicant(env, kept), "completed");
  const r = await call(env, "GET", "/admin/applicants?expiring=1", { cookie });
  assert.equal(r.status, 200);
  // Archived searches too: the contact goes with all of them.
  assert.deepEqual(r.data.applicants.map(x => [x.id, x.expires_on]).sort(), [[a, "2026-11-10"], [archived, "2026-11-10"]]);
  // The current list marks the same row and no other.
  const all = (await call(env, "GET", "/admin/applicants", { cookie })).data.applicants;
  assert.deepEqual(all.filter(x => x.expires_on).map(x => x.id), [a]);
  assert.equal(all.length, 3);
});

test("the applicant's record says how long it is kept", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW25 });
  const env = world(), cookie = await cookieFor();
  const a = applicant(env, contact(env, "2025-11-10T09:00:00.000Z"));
  const b = applicant(env, contact(env, "2024-01-01T00:00:00.000Z", { email: "buyer@example.je", phone: null }));
  sale(env, b, "in_progress");
  assert.deepEqual((await call(env, "GET", `/admin/applicants/${a}`, { cookie })).data.retention,
    { kept_until: "2026-11-10", exempt: false });
  assert.deepEqual((await call(env, "GET", `/admin/applicants/${b}`, { cookie })).data.retention,
    { kept_until: null, exempt: true });
});

test("Log conversation restarts the clock and the contact leaves Expiring", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW25 });
  const env = world(), cookie = await cookieFor();
  await claimRetentionDay(env, "2026-10-25");
  const c = contact(env, "2025-11-10T09:00:00.000Z");
  const a = applicant(env, c);
  assert.equal((await counts(env)).expiring, 1);
  const before = row(env, "SELECT updated_at FROM contacts WHERE id = ?", c).updated_at;
  const r = await call(env, "POST", `/admin/contacts/${c}/conversation`, { cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true, kept_until: "2027-10-25" });
  assert.deepEqual(row(env, "SELECT last_activity_at, updated_at FROM contacts WHERE id = ?", c),
    { last_activity_at: TS, updated_at: before });
  assert.deepEqual(eventsOf(env, "contact", c), [{ type: "contact.conversation", actor: ADMIN, data: null }]);
  assert.equal((await counts(env)).expiring, 0);
  // The record shows it in its history and the new date.
  const d = (await call(env, "GET", `/admin/applicants/${a}`, { cookie })).data;
  assert.equal(d.events[0].type, "contact.conversation");
  assert.deepEqual(d.retention, { kept_until: "2027-10-25", exempt: false });
});

test("Log conversation: signed out 401, cross-origin 403, unknown contact 404", async () => {
  const env = world();
  const c = contact(env, "2025-11-10T09:00:00.000Z");
  assert.equal((await call(env, "POST", `/admin/contacts/${c}/conversation`)).status, 401);
  assert.equal((await call(env, "POST", `/admin/contacts/${c}/conversation`,
    { cookie: await cookieFor(), origin: "https://evil.test" })).status, 403);
  const missing = await call(env, "POST", `/admin/contacts/${c + 1}/conversation`, { cookie: await cookieFor() });
  assert.equal(missing.status, 404);
  assert.equal(count(env, "events"), 0);
  assert.equal(row(env, "SELECT last_activity_at FROM contacts WHERE id = ?", c).last_activity_at, "2025-11-10T09:00:00.000Z");
});
