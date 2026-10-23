import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { jerseyToday, plusDays, weekday, DEFAULT_HOURS } from "../../server/viewings.js";

// A Monday to Friday date at least `n` days ahead (Jersey calendar): Gilberto works 10:00–17:30 then.
const workday = (n = 2) => { let d = plusDays(jerseyToday(), n); while (["sat", "sun"].includes(weekday(d))) d = plusDays(d, 1); return d; };
const HOURS = { ...DEFAULT_HOURS, sat: null, sun: ["11:00", "12:00"] };
async function world() { return { env: makeEnv(), cookie: await adminCookie() }; }
const slotsOf = async (env, cookie, date, id = 1) =>
  (await call(env, "GET", `/admin/availability?from=${date}&days=1`, { cookie })).data.days[0].slots[id];

test("negotiator routes need a signed-in admin", async () => {
  const { env } = await world();
  for (const [method, path] of [["GET", "/admin/negotiators"], ["POST", "/admin/negotiators"], ["PUT", "/admin/negotiators/1"],
    ["POST", "/admin/negotiators/1/exceptions"], ["DELETE", "/admin/negotiators/1/exceptions/1"], ["GET", "/admin/availability"]])
    assert.equal((await call(env, method, path, { body: method === "GET" ? undefined : {} })).status, 401, `${method} ${path}`);
  // No delete (D9): a negotiator is deactivated instead.
  assert.equal((await call(env, "DELETE", "/admin/negotiators/1", { cookie: await adminCookie() })).status, 404);
});

test("list shows every negotiator with their hours and upcoming exceptions by date", async () => {
  const { env, cookie } = await world();
  const ex = (date, kind = "block") => env.DB.raw.prepare(`INSERT INTO negotiator_exceptions (negotiator_id, date, kind,
    created_at) VALUES (1, ?, ?, '2026-10-07T10:00:00.000Z')`).run(date, kind);
  ex(plusDays(jerseyToday(), 5)); ex(jerseyToday()); ex(plusDays(jerseyToday(), -1));
  env.DB.raw.prepare("UPDATE negotiators SET active = 0 WHERE id = 2").run();
  const r = await call(env, "GET", "/admin/negotiators", { cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.negotiators.map(({ id, name, role, active, hours }) => ({ id, name, role, active, hours })), [
    { id: 1, name: "Gilberto Franco", role: "Managing Director", active: 1, hours: DEFAULT_HOURS },
    { id: 2, name: "Joshua Franco", role: "Negotiator", active: 0, hours: DEFAULT_HOURS }]);
  // Yesterday's is gone; today's and the later one stay, in date order.
  assert.deepEqual(r.data.negotiators[0].exceptions.map(e => e.date), [jerseyToday(), plusDays(jerseyToday(), 5)]);
  assert.deepEqual(r.data.negotiators[1].exceptions, []);
});

test("create: name, optional role and hours (the seeded week by default); a repeated name is 409", async () => {
  const { env, cookie } = await world();
  const a = await call(env, "POST", "/admin/negotiators", { cookie, body: { name: "  Ana Le Sueur " } });
  assert.equal(a.status, 201);
  const b = await call(env, "POST", "/admin/negotiators", { cookie, body: { name: "Tom Vibert", role: "Lettings", hours: HOURS } });
  assert.equal(b.status, 201);
  const rows = env.DB.raw.prepare("SELECT id, name, role, active, hours, updated_by FROM negotiators WHERE id IN (?, ?) ORDER BY id")
    .all(a.data.id, b.data.id).map(r => ({ ...r, hours: JSON.parse(r.hours) }));
  assert.deepEqual(rows, [
    { id: a.data.id, name: "Ana Le Sueur", role: null, active: 1, hours: DEFAULT_HOURS, updated_by: "luismadef45@gmail.com" },
    { id: b.data.id, name: "Tom Vibert", role: "Lettings", active: 1, hours: HOURS, updated_by: "luismadef45@gmail.com" }]);
  const dup = await call(env, "POST", "/admin/negotiators", { cookie, body: { name: "Gilberto Franco" } });
  assert.equal(dup.status, 409);
  assert.match(dup.data.error, /already/);
  for (const body of [{}, { name: "" }, { name: "x".repeat(81) }, { name: 7 }, { name: "Zoe", role: "x".repeat(81) }]) {
    const r = await call(env, "POST", "/admin/negotiators", { cookie, body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(r.data.fields, JSON.stringify(body));
  }
});

test("invalid hours are refused with 400, in every bad shape, on create and update", async () => {
  const { env, cookie } = await world();
  const bad = [null, "mon-fri", [], { ...HOURS, mon: undefined }, { ...HOURS, fun: null }, { ...HOURS, mon: ["9:00", "17:00"] },
    { ...HOURS, mon: ["10:00", "10:00"] }, { ...HOURS, mon: ["17:00", "10:00"] }, { ...HOURS, mon: ["10:00", "12:00", "14:00"] },
    { ...HOURS, mon: "10:00-17:00" }, { ...HOURS, mon: ["10:00", "24:00"] }, { ...HOURS, mon: [] }];
  for (const hours of bad) {
    const c = await call(env, "POST", "/admin/negotiators", { cookie, body: { name: "Ana Le Sueur", hours } });
    assert.equal(c.status, 400, `create ${JSON.stringify(hours)}`);
    assert.ok(c.data.fields, JSON.stringify(hours));
    const u = await call(env, "PUT", "/admin/negotiators/1", { cookie, body: { hours } });
    assert.equal(u.status, 400, `update ${JSON.stringify(hours)}`);
  }
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM negotiators").get().n, 2);
  assert.deepEqual(JSON.parse(env.DB.raw.prepare("SELECT hours FROM negotiators WHERE id = 1").get().hours), DEFAULT_HOURS);
});

test("update changes name, role, active and hours; unknown id 404, repeated name 409", async () => {
  const { env, cookie } = await world();
  const r = await call(env, "PUT", "/admin/negotiators/2", { cookie, body: { name: "Josh Franco", role: "", hours: HOURS } });
  assert.equal(r.status, 200);
  const row = env.DB.raw.prepare("SELECT name, role, active, hours, updated_by FROM negotiators WHERE id = 2").get();
  assert.deepEqual({ ...row, hours: JSON.parse(row.hours) },
    { name: "Josh Franco", role: null, active: 1, hours: HOURS, updated_by: "luismadef45@gmail.com" });
  assert.equal((await call(env, "PUT", "/admin/negotiators/2", { cookie, body: { active: false } })).status, 200);
  assert.equal(env.DB.raw.prepare("SELECT active FROM negotiators WHERE id = 2").get().active, 0);
  assert.equal((await call(env, "PUT", "/admin/negotiators/2", { cookie, body: { active: "no" } })).status, 400);
  assert.equal((await call(env, "PUT", "/admin/negotiators/2", { cookie, body: {} })).status, 400);
  assert.equal((await call(env, "PUT", "/admin/negotiators/99", { cookie, body: { role: "x" } })).status, 404);
  assert.equal((await call(env, "PUT", "/admin/negotiators/2", { cookie, body: { name: "Gilberto Franco" } })).status, 409);
});

test("a deactivated negotiator leaves the website but keeps their viewings, and the panel can still see their slots", async () => {
  const { env, cookie } = await world(), date = workday();
  env.DB.raw.prepare(`INSERT INTO viewing_requests (negotiator_id, agent, kind, date, time, end_time, name, email, status,
    created_at) VALUES (2, 'Joshua Franco', 'In person', ?, '11:00', '11:30', 'Sam Buyer', 'sam@x.je', 'requested', ?)`)
    .run(date, "2026-10-07T10:00:00.000Z");
  assert.equal((await call(env, "PUT", "/admin/negotiators/2", { cookie, body: { active: false } })).status, 200);
  const pub = await call(env, "GET", `/availability?from=${date}&days=1`);
  assert.deepEqual(pub.data.negotiators.map(n => n.id), [1]);
  assert.deepEqual(Object.keys(pub.data.days[0].slots), ["1"]);
  const inbox = await call(env, "GET", "/admin/viewings?tab=requests", { cookie });
  assert.deepEqual(inbox.data.viewings.map(v => [v.negotiator_id, v.name]), [[2, "Sam Buyer"]]);
  // The panel's general view lists active negotiators; asking for one by id includes them even when inactive.
  const all = await call(env, "GET", `/admin/availability?from=${date}&days=1`, { cookie });
  assert.deepEqual(all.data.negotiators.map(n => n.id), [1]);
  const josh = await call(env, "GET", `/admin/availability?from=${date}&days=1&negotiator_id=2`, { cookie });
  assert.deepEqual(josh.data.negotiators, [{ id: 2, name: "Joshua Franco", role: "Negotiator", active: 0 }]);
  assert.equal(josh.data.days[0].slots[2].find(s => s.time === "11:00").booked, true);
});

test("panel availability starts today, includes Sundays and checks its query", async () => {
  const { env, cookie } = await world();
  const r = await call(env, "GET", "/admin/availability", { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.data.slot_minutes, 30);
  assert.equal(r.data.days[0].date, jerseyToday());
  assert.equal(r.data.days.length, 12);
  assert.equal(r.data.days.filter(d => weekday(d.date) === "sun").length >= 1, true);
  for (const q of ["?from=2026-02-30", "?days=0", "?days=15", "?negotiator_id=x", "?negotiator_id=0"])
    assert.equal((await call(env, "GET", "/admin/availability" + q, { cookie })).status, 400, q);
  assert.equal((await call(env, "GET", "/admin/availability?negotiator_id=99", { cookie })).status, 404);
});

test("an exception blocks a day, and deleting it gives the day back", async () => {
  const { env, cookie } = await world(), date = workday();
  assert.equal((await slotsOf(env, cookie, date)).length, 15);   // 10:00 to 17:00, every 30 minutes
  const r = await call(env, "POST", "/admin/negotiators/1/exceptions", { cookie, body: { date, kind: "block", note: "Holiday" } });
  assert.equal(r.status, 201);
  assert.deepEqual(await slotsOf(env, cookie, date), []);
  const ex = (await call(env, "GET", "/admin/negotiators", { cookie })).data.negotiators[0].exceptions;
  assert.deepEqual(ex.map(({ id, date: d, kind, start_time, end_time, note }) => ({ id, date: d, kind, start_time, end_time, note })),
    [{ id: r.data.id, date, kind: "block", start_time: null, end_time: null, note: "Holiday" }]);
  assert.equal((await call(env, "DELETE", `/admin/negotiators/2/exceptions/${r.data.id}`, { cookie })).status, 404);
  assert.equal((await call(env, "DELETE", `/admin/negotiators/1/exceptions/${r.data.id}`, { cookie })).status, 200);
  assert.equal((await slotsOf(env, cookie, date)).length, 15);
  assert.equal((await call(env, "DELETE", `/admin/negotiators/1/exceptions/${r.data.id}`, { cookie })).status, 404);
});

test("exceptions: from–to blocks, an open span, a second open that day is 409, bad input 400", async () => {
  const { env, cookie } = await world(), date = workday();
  const add = (body, id = 1) => call(env, "POST", `/admin/negotiators/${id}/exceptions`, { cookie, body: { date, ...body } });
  assert.equal((await add({ kind: "open", start_time: "14:00", end_time: "16:00" })).status, 201);
  assert.equal((await add({ kind: "block", start_time: "15:00", end_time: "15:30" })).status, 201);
  assert.deepEqual((await slotsOf(env, cookie, date)).map(s => s.time), ["14:00", "14:30", "15:30"]);
  const again = await add({ kind: "open", start_time: "10:00", end_time: "11:00" });
  assert.equal(again.status, 409);
  assert.equal(again.data.error, "This day already has extra opening hours. Remove them first.");
  assert.equal((await add({ kind: "open", start_time: "10:00", end_time: "11:00" }, 2)).status, 201);   // another person
  assert.equal((await add({ kind: "open", start_time: "10:00", end_time: "11:00" }, 99)).status, 404);
  for (const body of [{ kind: "nap" }, { kind: "open" }, { kind: "block", start_time: "15:00" }, { kind: "block", start_time: "15:00", end_time: "14:00" },
    { kind: "block", date: "2026-02-30" }, { kind: "block", date: plusDays(jerseyToday(), -1) }, { kind: "block", note: "x".repeat(201) }]) {
    const r = await add(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(r.data.fields, JSON.stringify(body));
  }
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM negotiator_exceptions").get().n, 3);
});
