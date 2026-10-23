import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";

const ADMIN = "luismadef45@gmail.com";
const at = min => new Date(Date.parse(T0) + min * 60e3).toISOString();

const insert = (env, table, row) => {
  const cols = Object.keys(row);
  const r = env.DB.raw.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...cols.map(c => row[c]));
  return Number(r.lastInsertRowid);
};
const contact = (env, o = {}) => insert(env, "contacts", {
  name: "Jane Le Brocq", email: "jane@example.je", phone: "+447797123456", last_activity_at: T0, created_at: T0, updated_at: T0, ...o });
const applicant = (env, contact_id, o = {}) => insert(env, "applicants", {
  contact_id, operation: "rent", source: "web", created_at: T0, updated_at: T0, ...o });
const viewing = (env, o = {}) => insert(env, "viewing_requests", {
  kind: "In person", date: "2026-11-02", time: "11:30", name: "Tom Vibert", email: "tom@example.je",
  phone: "07797 654321", created_at: T0, ...o });
// An event and its notice; minute orders created_at.
function notice(env, { entity_type, entity_id, type = "x", data = null, category = "new_applicant", title = "Notice",
  action_required = 1, minute = 0, resolved_at = null }) {
  const event_id = insert(env, "events", {
    at: at(minute), actor: "public", entity_type, entity_id: String(entity_id), type,
    data: data == null ? null : JSON.stringify(data) });
  return insert(env, "notifications", {
    event_id, category, title, action_required, created_at: at(minute), resolved_at,
    resolved_by: resolved_at ? ADMIN : null });
}
const get = async (env, query) => call(env, "GET", `/admin/notifications${query}`, { cookie: await adminCookie() });

test("every notifications route needs a session", async () => {
  const env = makeEnv();
  assert.equal((await call(env, "GET", "/admin/notifications?box=action")).status, 401);
  assert.equal((await call(env, "GET", "/admin/notifications/counts")).status, 401);
  assert.equal((await call(env, "PUT", "/admin/notifications/1", { body: { resolved: true } })).status, 401);
});

function mixed() {
  const env = makeEnv();
  const a = applicant(env, contact(env));
  const v = viewing(env);
  const ids = {
    oldViewing: notice(env, { entity_type: "viewing", entity_id: v, category: "viewing", title: "Viewing request: Tom Vibert", minute: 1 }),
    newApplicant: notice(env, { entity_type: "applicant", entity_id: a, title: "New applicant: Jane Le Brocq · To Let", minute: 2 }),
    newerViewing: notice(env, { entity_type: "viewing", entity_id: v, category: "viewing", minute: 3 }),
    done: notice(env, { entity_type: "applicant", entity_id: a, minute: 4, resolved_at: at(5) }),
    info: notice(env, { entity_type: "applicant", entity_id: a, action_required: 0, minute: 6 }),
  };
  return { env, ids, a, v };
}

test("box=action lists open notices needing action, oldest first", async () => {
  const { env, ids, a, v } = mixed();
  const { status, data } = await get(env, "?box=action");
  assert.equal(status, 200);
  assert.deepEqual(data.notifications.map(n => n.id), [ids.oldViewing, ids.newApplicant, ids.newerViewing]);
  assert.deepEqual(data.notifications[1], {
    id: ids.newApplicant, category: "new_applicant", title: "New applicant: Jane Le Brocq · To Let", created_at: at(2),
    action_required: 1, resolved_at: null, entity_type: "applicant", entity_id: String(a),
    phone: "+447797123456", link: `#/applicants/${a}` });
  assert.equal(data.notifications[0].entity_id, String(v));
  assert.equal(data.notifications[0].link, "#/viewings");
  assert.deepEqual(data.counts, { action: 3, new_applicant: 1, viewing: 2, matched: 0, review: 0 });
});

test("box=feed lists the rest, newest first", async () => {
  const { env, ids } = mixed();
  const { status, data } = await get(env, "?box=feed");
  assert.equal(status, 200);
  assert.deepEqual(data.notifications.map(n => n.id), [ids.info, ids.done]);
  assert.equal(data.notifications[1].resolved_at, at(5));
  assert.deepEqual(data.counts, { action: 3, new_applicant: 1, viewing: 2, matched: 0, review: 0 });
});

test("category narrows the list but not the counts", async () => {
  const { env, ids } = mixed();
  const viewings = await get(env, "?box=action&category=viewing");
  assert.deepEqual(viewings.data.notifications.map(n => n.id), [ids.oldViewing, ids.newerViewing]);
  assert.deepEqual(viewings.data.counts, { action: 3, new_applicant: 1, viewing: 2, matched: 0, review: 0 });
  const applicants = await get(env, "?box=feed&category=new_applicant");
  assert.deepEqual(applicants.data.notifications.map(n => n.id), [ids.info, ids.done]);
  assert.deepEqual((await get(env, "?box=feed&category=viewing")).data.notifications, []);
});

test("a bad box or category is 400", async () => {
  const env = makeEnv();
  for (const q of ["", "?box=all", "?box=action&category=deleted"]) {
    const { status, data } = await get(env, q);
    assert.equal(status, 400, q);
    assert.ok(data.error);
  }
});

test("the feed stops at 200", async () => {
  const env = makeEnv();
  const v = viewing(env);
  for (let i = 0; i < 205; i++) notice(env, { entity_type: "viewing", entity_id: v, category: "viewing", action_required: 0, minute: i });
  const { data } = await get(env, "?box=feed");
  assert.equal(data.notifications.length, 200);
  assert.equal(data.notifications[0].created_at, at(204));
});

test("counts has its own route", async () => {
  const { env } = mixed();
  const { status, data } = await call(env, "GET", "/admin/notifications/counts", { cookie: await adminCookie() });
  assert.equal(status, 200);
  assert.deepEqual(data, { action: 3, new_applicant: 1, viewing: 2, matched: 0, review: 0 });
  assert.deepEqual((await call(makeEnv(), "GET", "/admin/notifications/counts", { cookie: await adminCookie() })).data,
    { action: 0, new_applicant: 0, viewing: 0, matched: 0, review: 0 });
});

test("phone is tel-safe: normalised from the viewing, null when it does not normalise", async () => {
  const env = makeEnv();
  const ok = notice(env, { entity_type: "viewing", entity_id: viewing(env, { phone: "0044 7797-654321" }), category: "viewing", minute: 1 });
  const bad = notice(env, { entity_type: "viewing", entity_id: viewing(env, { phone: "call after 6" }), category: "viewing", minute: 2 });
  const none = notice(env, { entity_type: "viewing", entity_id: viewing(env, { phone: null }), category: "viewing", minute: 3 });
  const noPhone = notice(env, { entity_type: "applicant", entity_id: applicant(env, contact(env, { phone: null })), minute: 4 });
  const gone = notice(env, { entity_type: "viewing", entity_id: 999, category: "viewing", minute: 5 });
  const byId = Object.fromEntries((await get(env, "?box=action")).data.notifications.map(n => [n.id, n.phone]));
  assert.deepEqual(byId, { [ok]: "+447797654321", [bad]: null, [none]: null, [noPhone]: null, [gone]: null });
});

test("a duplicate links to the contact's active search with the event's operation", async () => {
  const env = makeEnv();
  const c = contact(env, { phone: "+447700900123" });
  applicant(env, c, { operation: "rent", created_at: at(1) });
  const buy = applicant(env, c, { operation: "buy", created_at: at(0) });
  applicant(env, c, { operation: "buy", created_at: at(2), archived_at: at(3) });
  notice(env, { entity_type: "contact", entity_id: c, type: "applicant.duplicate_submitted",
    data: { operation: "buy", name: "Jane Le Brocq" }, title: "Jane Le Brocq registered again" });
  const [n] = (await get(env, "?box=action")).data.notifications;
  assert.equal(n.entity_type, "contact");
  assert.equal(n.entity_id, String(c));
  assert.equal(n.phone, "+447700900123");
  assert.equal(n.link, `#/applicants/${buy}`);
});

test("a duplicate with no active search of that operation links to the most recent search, archived included", async () => {
  const env = makeEnv();
  const c = contact(env);
  applicant(env, c, { operation: "rent", created_at: at(0) });
  const latest = applicant(env, c, { operation: "rent", created_at: at(1), archived_at: at(2) });
  notice(env, { entity_type: "contact", entity_id: c, type: "applicant.duplicate_submitted", data: { operation: "buy" } });
  assert.equal((await get(env, "?box=action")).data.notifications[0].link, `#/applicants/${latest}`);
});

test("an active search of that operation beats a newer archived one; without an operation the most recent wins", async () => {
  const env = makeEnv();
  const c = contact(env);
  const active = applicant(env, c, { operation: "rent", created_at: at(0) });
  const archived = applicant(env, c, { operation: "rent", created_at: at(1), archived_at: at(2) });
  notice(env, { entity_type: "contact", entity_id: c, type: "applicant.duplicate_submitted", data: { operation: "rent" }, minute: 1 });
  notice(env, { entity_type: "contact", entity_id: c, type: "applicant.duplicate_submitted", minute: 2 });
  assert.deepEqual((await get(env, "?box=action")).data.notifications.map(n => n.link),
    [`#/applicants/${active}`, `#/applicants/${archived}`]);
});

test("a lost or completed search is not active; a paused one is", async () => {
  for (const [stage, picked] of [["lost", "recent"], ["completed", "recent"], ["paused", "same"]]) {
    const env = makeEnv();
    const c = contact(env);
    const same = applicant(env, c, { operation: "buy", stage, created_at: at(0) });
    const recent = applicant(env, c, { operation: "rent", created_at: at(1) });
    notice(env, { entity_type: "contact", entity_id: c, type: "applicant.duplicate_submitted", data: { operation: "buy" } });
    assert.equal((await get(env, "?box=action")).data.notifications[0].link,
      `#/applicants/${picked === "same" ? same : recent}`, stage);
  }
});

test("a duplicate for a contact with no search links to New applicant for that contact", async () => {
  const env = makeEnv();
  const c = contact(env);
  notice(env, { entity_type: "contact", entity_id: c, type: "applicant.duplicate_submitted", data: { operation: "rent" } });
  assert.equal((await get(env, "?box=action")).data.notifications[0].link, `#/applicants/new?contact=${c}`);
});

test("PUT resolved:true closes the notice and it stops counting", async () => {
  const { env, ids } = mixed();
  const cookie = await adminCookie();
  const r = await call(env, "PUT", `/admin/notifications/${ids.oldViewing}`, { cookie, body: { resolved: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true });
  const row = env.DB.raw.prepare("SELECT resolved_at, resolved_by FROM notifications WHERE id = ?").get(ids.oldViewing);
  assert.ok(row.resolved_at);
  assert.equal(row.resolved_by, ADMIN);
  assert.deepEqual((await call(env, "GET", "/admin/notifications/counts", { cookie })).data, { action: 2, new_applicant: 1, viewing: 1, matched: 0, review: 0 });
  assert.ok((await get(env, "?box=feed")).data.notifications.some(n => n.id === ids.oldViewing));

  const again = await call(env, "PUT", `/admin/notifications/${ids.oldViewing}`,
    { cookie: await adminCookie("andres.san1404@gmail.com"), body: { resolved: true } });
  assert.equal(again.status, 200, "resolving twice is fine");
  assert.deepEqual(env.DB.raw.prepare("SELECT resolved_at, resolved_by FROM notifications WHERE id = ?").get(ids.oldViewing),
    row, "and leaves it unchanged");
});

test("PUT on a missing notice is 404, anything but resolved:true is 400", async () => {
  const { env, ids } = mixed();
  const cookie = await adminCookie();
  assert.equal((await call(env, "PUT", "/admin/notifications/999", { cookie, body: { resolved: true } })).status, 404);
  for (const body of [{}, { resolved: false }, { resolved: "true" }, { resolved: true, title: "x" }, [true], null]) {
    const r = await call(env, "PUT", `/admin/notifications/${ids.newApplicant}`, { cookie, body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal(env.DB.raw.prepare("SELECT resolved_at FROM notifications WHERE id = ?").get(ids.newApplicant).resolved_at, null);
});
