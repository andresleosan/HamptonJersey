import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { validateListing } from "../../server/listing.js";

const TODAY = "2026-10-28", DATE = "2026-10-29"; // Wednesday, Thursday in Jersey.
const windows = [{ day: 4, start: "10:15", end: "12:15" }, { day: 4, start: "14:00", end: "15:00" }];
async function world(t) {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(TODAY + "T09:00:00Z") });
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ success: true, hostname: "hampton.test" })));
  const env = makeEnv();
  seedListing(env);
  return { env, cookie: await adminCookie() };
}
const policy = (env, enabled = 1, hours = null) => env.DB.raw.prepare(
  "UPDATE listings SET viewings_enabled = ?, viewing_hours = ? WHERE id = 'HE-R001'").run(enabled, hours == null ? null : JSON.stringify(hours));
const booking = (env, cookie, body = {}, panel = false) => call(env, "POST", panel ? "/admin/viewings" : "/viewings", {
  cookie, body: { listing_id: "HE-R001", negotiator_id: 1, kind: "In person", date: DATE, time: "11:00",
    name: "Test Buyer", email: "buyer@example.test", turnstile: "t", ...body },
});
const counts = env => ["viewing_requests", "events", "notifications"].map(table =>
  env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
const availability = (env, cookie, panel, extra = "&listing_id=HE-R001") => call(env, "GET",
  `${panel ? "/admin" : ""}/availability?from=${DATE}&days=1${extra}`, { cookie });
const times = data => data.days[0].slots[1].map(s => s.time);
const raceOn = (env, marker, before) => {
  const batch = env.DB.batch.bind(env.DB);
  let done = false;
  env.DB.batch = stmts => {
    if (!done && stmts.some(s => s.sql.includes(marker))) { done = true; before(); }
    return batch(stmts);
  };
};
const current = (env, id) => ({ ...env.DB.raw.prepare("SELECT * FROM viewing_requests WHERE id = ?").get(id) });
const reschedule = (env, cookie, id, time = "14:00") => call(env, "PUT", `/admin/viewings/${id}`, {
  cookie, body: { action: "reschedule", updated_at: current(env, id).updated_at, negotiator_id: 1, date: DATE, time },
});

test("property policy defaults preserve existing listings and schema rejects invalid flags and JSON", async t => {
  const { env, cookie } = await world(t);
  const r = await call(env, "GET", "/admin/listings/HE-R001", { cookie });
  assert.deepEqual([r.data.listing.viewings_enabled, r.data.listing.viewing_hours], [1, null]);
  assert.throws(() => policy(env, 2), /CHECK/);
  assert.throws(() => env.DB.raw.prepare("UPDATE listings SET viewing_hours = 'not JSON'").run(), /CHECK/);
});

test("property windows require 1–21 complete non-overlapping Sunday=0 weekly spans; null restores general hours", () => {
  const validate = viewing_hours => validateListing({ viewing_hours }, { partial: true });
  const max = Array.from({ length: 21 }, (_, i) => ({ day: i % 7, start: `${10 + Math.floor(i / 7)}:00`, end: `${11 + Math.floor(i / 7)}:00` }));
  assert.equal(validate(null).value.viewing_hours, null);
  assert.deepEqual(JSON.parse(validate(max).value.viewing_hours), max);
  assert.deepEqual(JSON.parse(validate([{ day: 0, start: "00:00", end: "23:59", private: "discard" }]).value.viewing_hours),
    [{ day: 0, start: "00:00", end: "23:59" }]);
  for (const bad of [[], {}, "[]", "", [...max, { day: 0, start: "13:00", end: "14:00" }],
    [{ day: -1, start: "10:00", end: "11:00" }], [{ day: 7, start: "10:00", end: "11:00" }],
    [{ day: 1.5, start: "10:00", end: "11:00" }], [{ day: "1", start: "10:00", end: "11:00" }],
    [{ day: 1, start: "9:00", end: "11:00" }], [{ day: 1, start: "10:00", end: "24:00" }],
    [{ day: 1, start: "10:60", end: "12:00" }], [{ day: 1, start: "11:00", end: "11:00" }],
    [{ day: 1, start: "12:00", end: "11:00" }], [null],
    [{ day: 1, start: "10:00", end: "12:00" }, { day: 1, start: "11:00", end: "13:00" }]])
    assert.ok(validate(bad).errors?.viewing_hours, JSON.stringify(bad));
  for (const viewings_enabled of [null, false, true, 2, -1, "1"])
    assert.ok(validateListing({ viewings_enabled }, { partial: true }).errors?.viewings_enabled);
});

test("editor saves both policy fields and returns parsed hours, keeps optimistic lock and supports general hours", async t => {
  const { env, cookie } = await world(t);
  const save = body => call(env, "PUT", "/admin/listings/HE-R001", { cookie, body });
  const first = await save({ updated_at: T0, viewings_enabled: 0, viewing_hours: windows });
  assert.equal(first.status, 200);
  assert.deepEqual([first.data.listing.viewings_enabled, first.data.listing.viewing_hours], [0, windows]);
  assert.equal((await save({ updated_at: T0, viewings_enabled: 1 })).status, 409);
  const invalid = await save({ updated_at: first.data.listing.updated_at, viewing_hours: [] });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.data.fields.viewing_hours);
  const second = await save({ updated_at: first.data.listing.updated_at, viewings_enabled: 1, viewing_hours: null });
  assert.equal(second.status, 200);
  assert.deepEqual([second.data.listing.viewings_enabled, second.data.listing.viewing_hours], [1, null]);
});

test("property availability intersects full slots with weekly windows, negotiator exceptions and bookings", async t => {
  const { env, cookie } = await world(t);
  policy(env, 1, windows);
  for (const panel of [false, true]) {
    const r = await availability(env, cookie, panel);
    assert.equal(r.status, 200);
    assert.equal(r.data.property_viewings_enabled, true);
    assert.deepEqual(times(r.data), ["10:30", "11:00", "11:30", "14:00", "14:30"]);
    assert.equal("viewing_hours" in r.data, false);
  }
  env.DB.raw.prepare(`INSERT INTO negotiator_exceptions (negotiator_id, date, kind, start_time, end_time, created_at, created_by)
    VALUES (1, ?, 'block', '11:00', '11:30', ?, 'test')`).run(DATE, T0);
  assert.deepEqual(times((await availability(env, cookie, false)).data), ["10:30", "11:30", "14:00", "14:30"]);
  assert.equal((await booking(env, cookie, { time: "14:00" }, true)).status, 201);
  const after = await availability(env, cookie, false);
  assert.ok(after.data.days[0].slots[1].find(s => s.time === "14:30").booked);
  policy(env, 1, [{ day: 5, start: "10:00", end: "12:00" }]);
  assert.deepEqual(times((await availability(env, cookie, false)).data), []);
});

test("disabled property has no slots; general availability and general bookings stay available", async t => {
  const { env, cookie } = await world(t);
  policy(env, 0, windows);
  for (const panel of [false, true]) {
    const blocked = await availability(env, cookie, panel);
    assert.equal(blocked.data.property_viewings_enabled, false);
    assert.ok(Object.values(blocked.data.days[0].slots).every(slots => slots.length === 0));
    const general = await availability(env, cookie, panel, "");
    assert.equal("property_viewings_enabled" in general.data, false);
    assert.ok(times(general.data).length > 5);
    const r = await booking(env, cookie, {}, panel);
    assert.equal(r.status, 400);
    assert.ok(r.data.fields.listing_id);
    assert.equal((await booking(env, cookie, { listing_id: null, negotiator_id: panel ? 2 : 1 }, panel)).status, 201);
  }
});

test("property availability validates IDs, hides unpublished and archived listings publicly, keeps public weekdays", async t => {
  const { env, cookie } = await world(t);
  for (const panel of [false, true]) {
    assert.equal((await availability(env, cookie, panel, "&listing_id=bad")).status, 400);
    assert.equal((await availability(env, cookie, panel, "&listing_id=HE-R999")).status, 404);
  }
  for (const change of ["published = 0", "published = 1, archived_at = '2026-10-28'"]) {
    env.DB.raw.prepare(`UPDATE listings SET ${change}`).run();
    assert.equal((await availability(env, cookie, false)).status, 404);
    assert.equal((await availability(env, cookie, true)).status, 200);
  }
  env.DB.raw.prepare("UPDATE listings SET published = 1, archived_at = NULL").run();
  policy(env, 1, [{ day: 0, start: "10:00", end: "12:00" }]);
  const pub = await call(env, "GET", "/availability?from=2026-11-01&days=1&listing_id=HE-R001");
  assert.equal(pub.data.days[0].date, "2026-11-02");
  assert.deepEqual(times(pub.data), []);
});

for (const panel of [false, true]) {
  test(`${panel ? "panel" : "public"} booking rejects partial overlap, allows full window boundaries and null general hours`, async t => {
    const { env, cookie } = await world(t);
    policy(env, 1, windows);
    for (const time of ["10:00", "12:00", "15:00"]) {
      const r = await booking(env, cookie, { time }, panel);
      assert.equal(r.status, 400);
      assert.ok(r.data.fields.time);
    }
    assert.equal((await booking(env, cookie, { time: "14:30" }, panel)).status, 201);
    policy(env);
    assert.equal((await booking(env, cookie, { time: "10:00" }, panel)).status, 201);
  });

  for (const change of ["disable", "restrict"]) {
    test(`${panel ? "panel" : "public"} insert rechecks a concurrent property ${change} and writes no booking, event or notice`, async t => {
      const { env, cookie } = await world(t);
      raceOn(env, "INSERT INTO viewing_requests", () => change === "disable" ? policy(env, 0) : policy(env, 1, [{ day: 4, start: "11:00", end: "11:15" }]));
      const r = await booking(env, cookie, {}, panel);
      assert.equal(r.status, 409);
      assert.deepEqual(counts(env), [0, 0, 0]);
    });
  }
}

test("reschedule enforces property windows and disabled policy while existing appointments remain manageable", async t => {
  const { env, cookie } = await world(t);
  const made = await booking(env, cookie, {}, true), id = made.data.id;
  assert.equal(made.status, 201);
  policy(env, 1, windows);
  assert.equal((await reschedule(env, cookie, id, "12:00")).status, 400);
  assert.equal((await reschedule(env, cookie, id, "14:30")).status, 200);
  policy(env, 0);
  const before = current(env, id);
  const blocked = await reschedule(env, cookie, id);
  assert.equal(blocked.status, 400);
  assert.ok(blocked.data.fields.listing_id);
  assert.deepEqual(current(env, id), before);
  const complete = await call(env, "PUT", `/admin/viewings/${id}`, { cookie,
    body: { action: "complete", updated_at: before.updated_at, outcome: "proceed" } });
  assert.equal(complete.status, 200);
  assert.equal(current(env, id).status, "completed");
});

for (const change of ["disable", "restrict"]) {
  test(`reschedule atomically rejects concurrent property ${change} without changing the appointment or events`, async t => {
    const { env, cookie } = await world(t);
    const made = await booking(env, cookie, {}, true), id = made.data.id;
    const before = current(env, id), n = counts(env);
    raceOn(env, "UPDATE viewing_requests SET negotiator_id", () => change === "disable" ? policy(env, 0) : policy(env, 1, [{ day: 4, start: "14:00", end: "14:15" }]));
    assert.equal((await reschedule(env, cookie, id)).status, 409);
    assert.deepEqual(current(env, id), before);
    assert.deepEqual(counts(env), n);
  });
}


test("property hours cannot extend the negotiator schedule, including open exceptions and panel Sundays", async t => {
  const { env, cookie } = await world(t);
  policy(env, 1, [{ day: 4, start: "08:00", end: "20:00" }, { day: 0, start: "10:00", end: "11:15" }]);
  let r = await availability(env, cookie, true);
  assert.equal(times(r.data)[0], "10:00");
  assert.equal(times(r.data).at(-1), "17:00");
  env.DB.raw.prepare(`INSERT INTO negotiator_exceptions (negotiator_id, date, kind, start_time, end_time, created_at, created_by)
    VALUES (1, ?, 'open', '09:00', '11:00', ?, 'test')`).run(DATE, T0);
  r = await availability(env, cookie, true);
  assert.deepEqual(times(r.data), ["09:00", "09:30", "10:00", "10:30"]);
  env.DB.raw.prepare(`INSERT INTO negotiator_exceptions (negotiator_id, date, kind, start_time, end_time, created_at, created_by)
    VALUES (1, '2026-11-01', 'open', '09:00', '12:00', ?, 'test')`).run(T0);
  r = await call(env, "GET", "/admin/availability?from=2026-11-01&days=1&listing_id=HE-R001", { cookie });
  assert.deepEqual(times(r.data), ["10:00", "10:30"]);
});

test("disabled properties preserve confirmation, cancellation, no-show and notes on existing appointments", async t => {
  const { env, cookie } = await world(t);
  assert.equal((await booking(env, cookie)).status, 201);
  const id = env.DB.raw.prepare("SELECT id FROM viewing_requests").get().id;
  policy(env, 0);
  const action = action => call(env, "PUT", `/admin/viewings/${id}`, { cookie,
    body: { action, updated_at: current(env, id).updated_at } });
  assert.equal((await action("confirm")).status, 200);
  assert.equal((await call(env, "PUT", `/admin/viewings/${id}`, { cookie, body: { notes: "Keep this appointment" } })).status, 200);
  assert.equal(current(env, id).status, "confirmed");
  assert.equal(current(env, id).notes, "Keep this appointment");
  assert.equal((await action("no_show")).status, 200);
  env.DB.raw.prepare("UPDATE viewing_requests SET status = 'confirmed' WHERE id = ?").run(id);
  assert.equal((await action("cancel")).status, 200);
});

test("general rescheduling still works when properties are disabled", async t => {
  const { env, cookie } = await world(t);
  policy(env, 0);
  const made = await booking(env, cookie, { listing_id: null }, true);
  assert.equal(made.status, 201);
  assert.equal((await reschedule(env, cookie, made.data.id)).status, 200);
  assert.equal(current(env, made.data.id).time, "14:00");
});

test("public insert rechecks property visibility changed since availability was read", async t => {
  const { env, cookie } = await world(t);
  raceOn(env, "INSERT INTO viewing_requests", () => env.DB.raw.prepare("UPDATE listings SET published = 0").run());
  assert.equal((await booking(env, cookie)).status, 409);
  assert.deepEqual(counts(env), [0, 0, 0]);
});
