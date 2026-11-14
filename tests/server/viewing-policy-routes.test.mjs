import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { plusDays, addMinutes } from "../../server/viewings.js";

// VIS-09 wired behind VIS09_VIEWING_POLICY_READY. Tuesday 20 October 2026, 13:05 in Jersey (BST): the clocks go
// back on Sunday the 25th, so Saturday the 24th and Monday the 26th sit next to the change.
const NOW = Date.parse("2026-10-20T12:05:00.000Z"), TODAY = "2026-10-20", WED = "2026-10-21";
const ADMIN = "admin@example.test";

async function world(t, { ready = true } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv();
  if (ready) env.VIS09_VIEWING_POLICY_READY = "1";
  seedListing(env, { parish: "St Helier" });
  seedListing(env, { id: "HE-R002", title: "Trinity house", parish: "Trinity" });
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: "hampton.test" }));
  return { env, cookie: await adminCookie() };
}
const rules = (env, o = {}, id = 1) => {
  const p = { duration_minutes: 45, buffer_minutes: 15, parish_extra_minutes: 15, max_daily: 3, revision: 1, ...o };
  env.DB.raw.prepare(`INSERT INTO viewing_policy_settings (negotiator_id, duration_minutes, buffer_minutes,
    parish_extra_minutes, max_daily, revision, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'fixture')`)
    .run(id, p.duration_minutes, p.buffer_minutes, p.parish_extra_minutes, p.max_daily, p.revision, T0);
};
const seedViewing = (env, o = {}) => {
  const r = { listing_id: "HE-R001", negotiator_id: 1, agent: "Gilberto Franco", kind: "In person", date: WED,
    time: "10:00", name: "Sam Buyer", email: "sam@x.je", status: "confirmed", created_at: T0, ...o };
  r.end_time ??= addMinutes(r.time, 30);
  const cols = Object.keys(r);
  return Number(env.DB.raw.prepare(`INSERT INTO viewing_requests (${cols}) VALUES (${cols.map(() => "?")})`)
    .run(...Object.values(r)).lastInsertRowid);
};
const free = async (env, cookie, date, listing = "HE-R001") => {
  const r = await call(env, "GET", `/admin/availability?from=${date}&days=1&negotiator_id=1&listing_id=${listing}`, { cookie });
  assert.equal(r.status, 200);
  return r.data.days[0].slots[1].filter(s => !s.booked).map(s => s.time);
};
const book = (env, cookie, o = {}) => call(env, "POST", "/admin/viewings", { cookie, body: { listing_id: "HE-R001",
  negotiator_id: 1, kind: "In person", date: WED, time: "12:00", name: "Jane Le Brocq", email: "jane@example.je", ...o } });
const webBook = (env, o = {}) => call(env, "POST", "/viewings", { body: { listing_id: "HE-R001", negotiator_id: 1,
  kind: "In person", date: WED, time: "12:00", name: "Jane Le Brocq", email: "jane@example.je", turnstile: "t", ...o } });
const last = env => env.DB.raw.prepare("SELECT * FROM viewing_requests ORDER BY id DESC LIMIT 1").get();
const snap = (env, id) => env.DB.raw.prepare("SELECT * FROM viewing_policy_snapshots WHERE viewing_id = ?").get(id);
const raceOn = (env, marker, before) => {
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => { if (stmts.some(s => s.sql.includes(marker))) before(); return batch(stmts); };
};

test("gate off: saved rules are ignored and every route keeps the fixed 30-minute, 15-minute-margin rules", async t => {
  const { env, cookie } = await world(t, { ready: false });
  rules(env, { duration_minutes: 60, max_daily: 1 });
  seedViewing(env);
  const times = await free(env, cookie, WED);
  assert.ok(times.includes("11:00") && times.includes("17:00") && !times.includes("10:30"));
  assert.equal((await book(env, cookie, { time: "11:00" })).status, 201);
  assert.equal(last(env).end_time, "11:30");
  assert.equal(snap(env, last(env).id), undefined);
  assert.equal((await webBook(env, { time: "15:00" })).status, 201);
  const list = await call(env, "GET", "/admin/negotiators", { cookie });
  assert.equal("viewing_policy" in list.data.negotiators[0], false);
  assert.equal((await call(env, "PUT", "/admin/negotiators/1/viewing-policy", { cookie,
    body: { duration_minutes: 30, buffer_minutes: 15, parish_extra_minutes: 15, max_daily: 8, revision: 0 } })).status, 404);
});

// Master plan (10-Nov-2026): 30 minutes, 15 of margin, 15 more between parishes and 8 a day are the rules of every
// negotiator; saving rules only changes them.
test("gate on without saved rules: the plan's defaults apply, with their snapshot", async t => {
  const { env, cookie } = await world(t);
  seedViewing(env, { time: "10:00", end_time: "10:15" });
  // A historical booking has no recorded parish: the larger margin (15 + 15) applies, so 10:30 is too soon.
  const other = await free(env, cookie, WED, "HE-R002");
  assert.ok(!other.includes("10:30") && other.includes("11:00"));
  const r = await book(env, cookie, { time: "12:00" });
  assert.equal(r.status, 201);
  assert.equal(last(env).end_time, "12:30");
  assert.deepEqual({ ...snap(env, r.data.id) }, { viewing_id: r.data.id, parish: "St Helier", buffer_minutes: 15,
    parish_extra_minutes: 15, policy_revision: 0 });
  assert.ok((await free(env, cookie, WED)).includes("17:00"), "two booked: the day is still open");
  for (const time of ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30"]) seedViewing(env, { time });
  assert.deepEqual(await free(env, cookie, WED), [], "the eighth viewing of the day reaches the maximum of 8");
  assert.equal((await book(env, cookie, { time: "17:00" })).status, 409);
  assert.equal((await webBook(env, { time: "17:00" })).status, 409);
});

test("saved rules shape the slots: length, margins by parish and the daily maximum", async t => {
  const { env, cookie } = await world(t);
  rules(env);
  seedViewing(env, { time: "10:00", end_time: "10:15" });
  const same = await free(env, cookie, WED);
  // A historical booking has no recorded parish: the larger margin (15 + 15) applies, so 10:30 is too soon.
  assert.ok(!same.includes("10:30") && same.includes("11:00"));
  assert.ok(same.includes("16:30") && !same.includes("17:00"), "a 45-minute viewing must end by 17:30");
  const r = await book(env, cookie, { time: "12:00" });
  assert.equal(r.status, 201);
  assert.equal(last(env).end_time, "12:45");
  assert.deepEqual({ ...snap(env, r.data.id) }, { viewing_id: r.data.id, parish: "St Helier", buffer_minutes: 15,
    parish_extra_minutes: 15, policy_revision: 1 });
  const ev = env.DB.raw.prepare("SELECT entity_id FROM events WHERE type = 'viewing.booked'").get();
  assert.equal(ev.entity_id, String(r.data.id));
  const sameParish = await free(env, cookie, WED), otherParish = await free(env, cookie, WED, "HE-R002");
  assert.ok(sameParish.includes("13:00") && !sameParish.includes("12:30"));
  assert.ok(!otherParish.includes("13:00") && otherParish.includes("13:30"));
  assert.equal((await book(env, cookie, { time: "13:00", listing_id: "HE-R002" })).status, 409);
  assert.equal((await webBook(env, { time: "14:00" })).status, 201);
  assert.deepEqual(await free(env, cookie, WED), [], "the third viewing of the day reaches the maximum of 3");
  assert.equal((await book(env, cookie, { time: "16:00" })).status, 409);
});

test("a rescheduled viewing takes the new length and margins, excludes itself and refreshes its snapshot", async t => {
  const { env, cookie } = await world(t);
  rules(env, { duration_minutes: 60 });
  const id = seedViewing(env, { listing_id: "HE-R002", time: "11:00" });
  seedViewing(env, { time: "14:00", end_time: "15:00" });
  const move = time => call(env, "PUT", `/admin/viewings/${id}`, { cookie, body: { action: "reschedule", negotiator_id: 1,
    date: WED, time, updated_at: env.DB.raw.prepare("SELECT updated_at FROM viewing_requests WHERE id = ?").get(id).updated_at } });
  assert.equal((await move("13:00")).status, 409, "an hour from 13:00 leaves no margin before 14:00");
  assert.equal((await move("11:30")).status, 200);
  const row = env.DB.raw.prepare("SELECT time, end_time FROM viewing_requests WHERE id = ?").get(id);
  assert.deepEqual({ ...row }, { time: "11:30", end_time: "12:30" });
  assert.equal(snap(env, id).parish, "Trinity");
  assert.equal(snap(env, id).policy_revision, 1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events WHERE type = 'viewing.rescheduled'").get().n, 1);
});

const count = env => env.DB.raw.prepare("SELECT COUNT(*) n FROM viewing_requests").get().n;
test("the write re-checks the rules' revision inside the transaction", async t => {
  const { env, cookie } = await world(t);
  rules(env);
  raceOn(env, "INSERT INTO viewing_requests", () => env.DB.raw.prepare(`UPDATE viewing_policy_settings
    SET max_daily = 4, revision = 2 WHERE negotiator_id = 1`).run());
  assert.equal((await book(env, cookie)).status, 409);
  assert.equal(count(env), 0);
});

test("rules saved after the read are not bypassed by the fixed-rule write", async t => {
  const { env, cookie } = await world(t);
  raceOn(env, "INSERT INTO viewing_requests", () => rules(env));
  assert.equal((await book(env, cookie)).status, 409);
  assert.equal(count(env), 0);
});

test("an admin removed between the check and the write books nothing", async t => {
  const { env, cookie } = await world(t);
  raceOn(env, "INSERT INTO viewing_requests", () => env.DB.raw.prepare("DELETE FROM admins WHERE email = ?").run(ADMIN));
  assert.equal((await book(env, cookie)).status, 409);
  assert.equal(count(env), 0);
});

test("days next to a clock change stay bookable in office hours, with the instant checked by its offset", async t => {
  const { env, cookie } = await world(t);
  rules(env);
  for (const date of ["2026-10-24", "2026-10-26"]) {
    const times = await free(env, cookie, date);
    assert.ok(times.includes("10:00"), date);
  }
  const r = await book(env, cookie, { date: "2026-10-24", time: "10:00" });
  assert.equal(r.status, 201);
  // An early hour on the change itself is refused: its wall time is repeated.
  env.DB.raw.prepare("INSERT INTO negotiator_exceptions (negotiator_id, date, kind, start_time, end_time, created_at) VALUES (1, '2026-10-25', 'open', '01:00', '03:00', ?)").run(T0);
  const early = await free(env, cookie, "2026-10-25");
  assert.equal(early.includes("01:00"), false);
});

test("staff save the rules with a revision check; invalid values are named and stale saves refused", async t => {
  const { env, cookie } = await world(t);
  const list = async () => (await call(env, "GET", "/admin/negotiators", { cookie })).data.negotiators[0].viewing_policy;
  assert.equal(await list(), null);
  const save = body => call(env, "PUT", "/admin/negotiators/1/viewing-policy", { cookie, body });
  const good = { duration_minutes: 45, buffer_minutes: 10, parish_extra_minutes: 20, max_daily: 6 };
  const bad = await save({ ...good, duration_minutes: 12, max_daily: 0, revision: 0 });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.data.fields).sort(), ["duration_minutes", "max_daily"]);
  assert.equal((await save({ ...good, revision: 0 })).status, 200);
  assert.deepEqual(await list(), { ...good, revision: 1 });
  assert.equal((await save({ ...good, max_daily: 7, revision: 0 })).status, 409);
  assert.equal((await save({ ...good, max_daily: 7, revision: 1 })).status, 200);
  assert.equal((await list()).revision, 2);
  assert.equal(env.DB.raw.prepare("SELECT updated_by FROM viewing_policy_settings").get().updated_by, ADMIN);
  assert.equal((await call(env, "PUT", "/admin/negotiators/99/viewing-policy", { cookie, body: { ...good, revision: 0 } })).status, 404);
  assert.equal((await call(env, "PUT", "/admin/negotiators/1/viewing-policy", { body: { ...good, revision: 2 } })).status, 401);
});
