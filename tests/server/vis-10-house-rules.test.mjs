// VIS-10: what each house asks of a viewing (notice while tenanted, who shows it, keys). Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { noticeShort } from "../../server/house-rules.js";

// Tuesday 20 October 2026, 13:05 in Jersey (BST). 24 hours' notice: Wednesday 13:00 is short, 13:30 is not.
const NOW = Date.parse("2026-10-20T12:05:00.000Z"), WED = "2026-10-21", ID = "HE-R001", PATH = `/admin/listings/${ID}/viewing-rules`;
const KEYS = "Key safe by the side gate FIXTURE-KEYS", NOTE = "Ring the tenant first FIXTURE-NOTE";

async function world(t, { ready = true, schema, occupancy = "tenanted" } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv(schema);
  if (ready) env.VIS10_HOUSE_RULES_READY = "1";
  seedListing(env, { occupancy });
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: "hampton.test" }));
  return { env, cookie: await adminCookie() };
}
const rules = (o = {}) => ({ notice_hours: 24, shown_by: "tenant", negotiator_id: null, keys: KEYS, access_note: NOTE, updated_at: null, ...o });
const save = (env, cookie, o) => call(env, "PUT", PATH, { cookie, body: rules(o) });
const book = (env, cookie, o = {}) => call(env, "POST", "/admin/viewings", { cookie, body: { listing_id: ID,
  negotiator_id: 1, kind: "In person", date: WED, time: "12:00", name: "Jane Le Brocq", email: "jane@example.je", ...o } });
const webBook = (env, o = {}) => call(env, "POST", "/viewings", { body: { listing_id: ID, negotiator_id: 1,
  kind: "In person", date: WED, time: "12:00", name: "Jane Le Brocq", email: "jane@example.je", turnstile: "t", ...o } });
const viewings = env => env.DB.raw.prepare("SELECT * FROM viewing_requests ORDER BY id").all();
const everything = env => JSON.stringify([env.DB.raw.prepare("SELECT * FROM events").all(),
  env.DB.raw.prepare("SELECT * FROM notifications").all(), env.DB.raw.prepare("SELECT * FROM listing_viewing_rule_changes").all()]);

test("notice counts only for a tenanted house with hours saved, and exactly the hours is enough", () => {
  const clock = { date: "2026-10-20", time: "13:05" }, house = { occupancy: "tenanted", notice_hours: 24 };
  assert.equal(noticeShort(house, { date: WED, time: "13:00" }, clock), true);
  assert.equal(noticeShort(house, { date: WED, time: "13:05" }, clock), false, "notice_boundary");
  assert.equal(noticeShort({ ...house, occupancy: "vacant" }, { date: WED, time: "10:00" }, clock), false);
  assert.equal(noticeShort({ ...house, occupancy: "unknown" }, { date: WED, time: "10:00" }, clock), false, "occupancy is never inferred");
  assert.equal(noticeShort({ occupancy: "tenanted", notice_hours: null }, { date: WED, time: "10:00" }, clock), false);
  assert.equal(noticeShort(undefined, { date: WED, time: "10:00" }, clock), false);
  assert.equal(noticeShort(house, { date: WED, time: null }, clock), false);
});

test("switched off, or on before migration 0066, the panel and the website book as before", async t => {
  for (const [ready, schema] of [[false, {}], [true, { through: 65 }]]) {
    const { env, cookie } = await world(t, { ready, schema });
    if (!ready) env.DB.raw.prepare(`INSERT INTO listing_viewing_rules (listing_id, notice_hours, updated_at, updated_by)
      VALUES (?, 48, ?, 'fixture')`).run(ID, T0);
    assert.deepEqual((await call(env, "GET", PATH, { cookie })).data, { enabled: false });
    assert.equal((await save(env, cookie)).status, 404);
    assert.equal((await book(env, cookie)).status, 201);
    assert.equal((await webBook(env, { time: "15:00" })).status, 201);
    const web = await call(env, "GET", `/availability?from=${WED}&days=1&listing_id=${ID}`);
    assert.ok(web.data.days[0].slots[1].some(s => s.time === "10:00"));
    t.mock.timers.reset();
  }
});

test("only signed-in staff read or save house rules", async t => {
  const { env } = await world(t);
  assert.equal((await call(env, "GET", PATH)).status, 401);
  assert.equal((await call(env, "PUT", PATH, { body: rules() })).status, 401);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM listing_viewing_rules").get().n, 0);
});

test("staff save the rules of a house: who and when on the row, field names only in the change log", async t => {
  const { env, cookie } = await world(t);
  const empty = await call(env, "GET", PATH, { cookie });
  assert.deepEqual([empty.status, empty.data.enabled, empty.data.occupancy, empty.data.updated_at], [200, true, "tenanted", null]);
  assert.equal((await call(env, "GET", "/admin/listings/HE-R999/viewing-rules", { cookie })).status, 404);

  const bad = await save(env, cookie, { notice_hours: 169, shown_by: "neighbour", keys: "k".repeat(201), access_note: "n".repeat(2001) });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.data.fields).sort(), ["access_note", "keys", "notice_hours", "shown_by"]);
  assert.equal((await save(env, cookie, { shown_by: "negotiator", negotiator_id: null })).data.fields.negotiator_id, "Choose an active negotiator");
  env.DB.raw.prepare("INSERT INTO negotiators (name, role, hours, active, created_at, updated_at, updated_by) VALUES ('Gone', '', '{}', 0, ?, ?, 'fixture')").run(T0, T0);
  const gone = env.DB.raw.prepare("SELECT id FROM negotiators WHERE name = 'Gone'").get().id;
  assert.equal((await save(env, cookie, { shown_by: "negotiator", negotiator_id: gone })).status, 400, "inactive_negotiator_denied");

  const first = await save(env, cookie);
  assert.equal(first.status, 200);
  assert.deepEqual([first.data.notice_hours, first.data.shown_by, first.data.keys, first.data.access_note, first.data.updated_by],
    [24, "tenant", KEYS, NOTE, "admin@example.test"]);
  // A second person's save from the empty form they still see is refused, never merged.
  const stale = await call(env, "PUT", PATH, { cookie: await adminCookie("colleague@example.test"), body: rules({ keys: "Other" }) });
  assert.equal(stale.status, 409);
  const second = await save(env, cookie, { shown_by: "negotiator", negotiator_id: 1, keys: "  ", updated_at: first.data.updated_at });
  assert.equal(second.status, 200);
  assert.deepEqual([second.data.shown_by, second.data.negotiator_id, second.data.negotiator_name, second.data.keys],
    ["negotiator", 1, "Gilberto Franco", null]);
  const log = env.DB.raw.prepare("SELECT actor, fields FROM listing_viewing_rule_changes ORDER BY id").all();
  assert.deepEqual(log.map(r => [r.actor, JSON.parse(r.fields)]), [
    ["admin@example.test", ["notice_hours", "shown_by", "keys", "access_note"]],
    ["admin@example.test", ["shown_by", "negotiator_id", "keys"]]]);
  for (const secret of ["FIXTURE-KEYS", "FIXTURE-NOTE"]) assert.ok(!everything(env).includes(secret), secret);
  // The rules go with their listing.
  env.DB.raw.prepare("DELETE FROM listings WHERE id = ?").run(ID);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM listing_viewing_rules").get().n
    + env.DB.raw.prepare("SELECT COUNT(*) n FROM listing_viewing_rule_changes").get().n, 0);
});

test("the panel refuses a booking short of notice until staff confirm access, and says so in the event", async t => {
  const { env, cookie } = await world(t);
  await save(env, cookie);
  const refused = await book(env, cookie);
  assert.equal(refused.status, 400);
  assert.match(refused.data.fields.notice_confirmed, /24 hours' notice/);
  assert.equal(viewings(env).length, 0, "no_silent_override");
  assert.equal((await book(env, cookie, { notice_confirmed: "yes" })).status, 400);
  assert.equal((await book(env, cookie, { notice_confirmed: true })).status, 201);
  assert.equal((await book(env, cookie, { time: "14:00", email: "sam@example.je" })).status, 201, "enough notice needs no confirmation");
  const events = env.DB.raw.prepare("SELECT data FROM events WHERE type = 'viewing.booked' ORDER BY id").all().map(e => JSON.parse(e.data));
  assert.deepEqual(events.map(e => e.notice_confirmed), [true, undefined]);
  for (const secret of ["FIXTURE-KEYS", "FIXTURE-NOTE"]) assert.ok(!everything(env).includes(secret), secret);
});

test("notice asks nothing of a vacant house, of one without hours saved, or of a general enquiry", async t => {
  const { env, cookie } = await world(t, { occupancy: "vacant" });
  await save(env, cookie);
  assert.equal((await book(env, cookie)).status, 201);
  env.DB.raw.prepare("UPDATE listings SET occupancy = 'tenanted' WHERE id = ?").run(ID);
  env.DB.raw.prepare("UPDATE listing_viewing_rules SET notice_hours = 0").run();
  assert.equal((await book(env, cookie, { time: "15:00", email: "sam@example.je" })).status, 201);
  assert.equal((await book(env, cookie, { listing_id: null, time: "16:30", email: "ann@example.je" })).status, 201);
});

test("hours saved while a booking is being made are read again by its insert", async t => {
  const { env, cookie } = await world(t);
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => {
    if (stmts.some(s => s.sql.includes("INSERT INTO viewing_requests"))) env.DB.raw.prepare(`INSERT INTO listing_viewing_rules
      (listing_id, notice_hours, updated_at, updated_by) VALUES (?, 48, ?, 'fixture')`).run(ID, T0);
    return batch(stmts);
  };
  assert.equal((await book(env, cookie)).status, 409);
  assert.equal(viewings(env).length, 0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events").get().n, 0);
});

test("a move to a time short of notice needs the same confirmation", async t => {
  const { env, cookie } = await world(t);
  await save(env, cookie);
  const { data: { id } } = await book(env, cookie, { time: "15:00" });
  const move = extra => call(env, "PUT", `/admin/viewings/${id}`, { cookie, body: { action: "reschedule", negotiator_id: 1,
    date: WED, time: "11:00", updated_at: viewings(env)[0].updated_at, ...extra } });
  const refused = await move();
  assert.equal(refused.status, 400);
  assert.match(refused.data.fields.notice_confirmed, /24 hours' notice/);
  assert.equal(viewings(env)[0].time, "15:00");
  assert.equal((await move({ notice_confirmed: true })).status, 200);
  assert.equal(viewings(env)[0].time, "11:00");
  const event = JSON.parse(env.DB.raw.prepare("SELECT data FROM events WHERE type = 'viewing.rescheduled'").get().data);
  assert.equal(event.notice_confirmed, true);
});

test("the website neither offers nor accepts a time short of notice, and never sees the rules", async t => {
  const { env, cookie } = await world(t);
  await save(env, cookie);
  const web = await call(env, "GET", `/availability?from=${WED}&days=2&listing_id=${ID}`);
  assert.equal(web.status, 200);
  const [wed, thu] = web.data.days.map(d => d.slots[1].map(s => s.time));
  assert.deepEqual([wed.includes("13:00"), wed[0], thu[0]], [false, "13:30", "10:00"]);
  const refused = await webBook(env);
  assert.equal(refused.status, 400);
  assert.equal(refused.data.fields.time, "That time is not available. Please choose another.");
  assert.equal((await webBook(env, { notice_confirmed: true })).status, 400, "the website cannot confirm access");
  assert.equal((await webBook(env, { time: "14:00" })).status, 201);
  const site = [web, await call(env, "GET", "/listings"), await call(env, "GET", "/availability")].map(r => r.text).join("");
  for (const secret of ["FIXTURE-KEYS", "FIXTURE-NOTE", "notice", "shown_by", "tenant"]) assert.ok(!site.includes(secret), secret);
  for (const secret of ["FIXTURE-KEYS", "FIXTURE-NOTE"]) assert.ok(!everything(env).includes(secret), secret);
});
