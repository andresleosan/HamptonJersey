// VIS-08: the cycle of a viewing: Requested, Confirmed, Reminded, Completed and Feedback received. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { plusDays, addMinutes } from "../../server/viewings.js";
import { stageOf, reminderDue, REMINDER_CHANNELS } from "../../server/viewing-cycle.js";

// Wednesday 28 October 2026, 12:05 in Jersey (GMT, the same as UTC).
const NOW = Date.parse("2026-10-28T12:05:00.000Z"), TODAY = "2026-10-28", ADMIN = "admin@example.test", ID = "HE-R001";
const day = n => plusDays(TODAY, n);
const SUMMARY = "Loved the garden FIXTURE-SUMMARY";

async function world(t, { ready = true, schema, rules = false } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv(schema);
  if (ready) env.VIS08_CYCLE_READY = "1";
  if (rules) env.VIS10_HOUSE_RULES_READY = "1";
  seedListing(env, rules ? { occupancy: "tenanted" } : {});
  if (rules) env.DB.raw.prepare(`INSERT INTO listing_viewing_rules (listing_id, notice_hours, updated_at, updated_by)
    VALUES (?, 24, ?, 'fixture')`).run(ID, T0);
  return { env, cookie: await adminCookie() };
}
const seedViewing = (env, o = {}) => {
  const v = { listing_id: ID, negotiator_id: 1, agent: "Gilberto Franco", kind: "In person", date: day(1),
    time: "10:00", name: "Sam Buyer", email: "sam@example.je", status: "confirmed", created_at: T0, ...o };
  v.end_time ??= addMinutes(v.time, 30);
  const cols = Object.keys(v);
  return Number(env.DB.raw.prepare(`INSERT INTO viewing_requests (${cols}) VALUES (${cols.map(() => "?")})`)
    .run(...Object.values(v)).lastInsertRowid);
};
const row = (env, id) => env.DB.raw.prepare("SELECT * FROM viewing_requests WHERE id = ?").get(id);
const events = env => env.DB.raw.prepare("SELECT * FROM events ORDER BY id").all();
const lastEvent = env => { const e = events(env).at(-1); return [e.type, e.actor, e.entity_id, JSON.parse(e.data)]; };
const act = (env, cookie, id, action, more = {}) => call(env, "PUT", `/admin/viewings/${id}`, { cookie,
  body: { action, updated_at: row(env, id).updated_at, ...more } });
const tab = async (env, cookie, name) => (await call(env, "GET", `/admin/viewings?tab=${name}`, { cookie })).data;

test("the stage is read from the status and its dates; a reminder is due within 24 hours of a confirmed viewing", () => {
  const v = { status: "confirmed", date: day(1), time: "10:00", end_time: "10:30" };
  assert.deepEqual([{ status: "requested" }, v, { ...v, reminded_at: T0 }, { status: "completed", reminded_at: T0 },
    { status: "completed", outcome: "proceed" }, { status: "no_show", reminded_at: T0 }, { status: "cancelled", reminded_at: T0 }].map(stageOf),
  ["requested", "confirmed", "reminded", "completed", "feedback", "no_show", "cancelled"]);
  const clock = { date: TODAY, time: "12:05" };
  assert.equal(reminderDue(v, clock), true);
  assert.equal(reminderDue({ ...v, time: "12:05", end_time: "12:35" }, clock), false, "exactly 24 hours away is not due yet");
  assert.equal(reminderDue({ ...v, time: "12:00", end_time: "12:30" }, clock), true);
  assert.equal(reminderDue({ ...v, reminded_at: T0 }, clock), false);
  assert.equal(reminderDue({ ...v, status: "requested" }, clock), false, "an unconfirmed request has nothing to remind of");
  assert.equal(reminderDue({ ...v, date: TODAY, time: "11:00", end_time: "11:30" }, clock), false, "over: it needs an outcome instead");
});

test("switched off, or on before migration 0071, viewings work as before", async t => {
  for (const [ready, schema] of [[false, {}], [true, { through: 70 }]]) {
    const { env, cookie } = await world(t, { ready, schema, rules: true });
    const id = seedViewing(env), past = seedViewing(env, { date: day(-1), time: "15:00" });
    assert.equal((await tab(env, cookie, "upcoming")).cycle, undefined);
    for (const [action, more] of [["remind", { channel: "phone" }], ["feedback", { outcome: "proceed" }]]) {
      const r = await act(env, cookie, id, action, more);
      assert.deepEqual([r.status, r.data.error], [400, "Unknown action"], action);
    }
    assert.equal((await act(env, cookie, past, "complete", { outcome: null })).data.fields.outcome, "Choose an outcome");
    assert.equal((await act(env, cookie, past, "complete", { outcome: "proceed" })).status, 200);
    assert.equal((await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(2), time: "11:00" })).status, 200);
    // Short of the house's notice: confirming asks nothing, as before VIS-08.
    const request = seedViewing(env, { status: "requested", time: "11:30" });
    assert.equal((await act(env, cookie, request, "confirm")).status, 200);
    assert.equal(events(env).at(-1).data, null);
    t.mock.timers.reset();
  }
});

test("only signed-in staff mark a reminder or record feedback", async t => {
  const { env } = await world(t);
  const id = seedViewing(env), done = seedViewing(env, { status: "completed", date: day(-1) });
  assert.equal((await call(env, "PUT", `/admin/viewings/${id}`, { body: { action: "remind", channel: "phone", updated_at: null } })).status, 401);
  assert.equal((await call(env, "PUT", `/admin/viewings/${done}`, { body: { action: "feedback", outcome: "proceed", updated_at: null } })).status, 401);
  assert.deepEqual([row(env, id).reminded_at, row(env, done).outcome, events(env).length], [null, null, 0]);
});

test("staff mark a confirmed viewing as reminded: when, who and how, and it stays confirmed in Upcoming", async t => {
  const { env, cookie } = await world(t);
  const id = seedViewing(env);
  assert.equal((await tab(env, cookie, "upcoming")).cycle, true);
  for (const channel of [undefined, "sms", 5]) {
    const bad = await act(env, cookie, id, "remind", { channel });
    assert.deepEqual([bad.status, bad.data.fields.channel], [400, "Choose how you reminded them"]);
  }
  assert.equal(row(env, id).reminded_at, null);
  t.mock.timers.tick(60000);
  assert.equal((await act(env, cookie, id, "remind", { channel: "whatsapp" })).status, 200);
  const v = row(env, id);
  assert.deepEqual([v.status, v.reminded_at, v.reminded_by, v.reminded_channel, v.updated_by],
    ["confirmed", "2026-10-28T12:06:00.000Z", ADMIN, "whatsapp", ADMIN]);
  assert.deepEqual(lastEvent(env), ["viewing.reminded", ADMIN, String(id), { channel: "whatsapp" }]);
  const upcoming = await tab(env, cookie, "upcoming");
  assert.deepEqual([upcoming.viewings.map(x => [x.id, x.reminded_channel]), upcoming.counts.upcoming], [[[id, "whatsapp"]], 1]);
  assert.deepEqual(REMINDER_CHANNELS, ["phone", "email", "whatsapp", "in_person"]);

  // A stale copy, or a viewing that is not confirmed and still to come, takes no reminder.
  const stale = await call(env, "PUT", `/admin/viewings/${id}`, { cookie, body: { action: "remind", channel: "phone", updated_at: null } });
  assert.equal(stale.status, 409);
  const over = seedViewing(env, { date: TODAY, time: "11:00" });
  const late = await act(env, cookie, over, "remind", { channel: "phone" });
  assert.deepEqual([late.status, late.data.error], [409, "This viewing's time has passed. Record how it went instead."]);
  for (const status of ["requested", "completed", "no_show", "cancelled"]) {
    const x = seedViewing(env, { status, time: "15:00", date: day(status === "requested" ? 2 : -1) });
    assert.equal((await act(env, cookie, x, "remind", { channel: "phone" })).status, 409, status);
    assert.equal(row(env, x).reminded_at, null, status);
  }
  assert.equal(events(env).length, 1);
});

test("a reminder belongs to the time it was given for: a move to another time clears it, a completed viewing keeps it", async t => {
  const { env, cookie } = await world(t);
  const id = seedViewing(env);
  await act(env, cookie, id, "remind", { channel: "phone" });
  // Another negotiator at the same time: the client was reminded of the right time.
  assert.equal((await act(env, cookie, id, "reschedule", { negotiator_id: 2, date: day(1), time: "10:00" })).status, 200);
  assert.equal(row(env, id).reminded_channel, "phone");
  assert.equal((await act(env, cookie, id, "reschedule", { negotiator_id: 2, date: day(2), time: "11:00" })).status, 200);
  assert.deepEqual([row(env, id).reminded_at, row(env, id).reminded_by, row(env, id).reminded_channel], [null, null, null]);

  const held = seedViewing(env, { date: TODAY, time: "13:00" });
  await act(env, cookie, held, "remind", { channel: "email" });
  t.mock.timers.tick(3 * 3600000);
  assert.equal((await act(env, cookie, held, "complete", { outcome: null })).status, 200);
  assert.deepEqual([row(env, held).status, row(env, held).reminded_channel, stageOf(row(env, held))], ["completed", "email", "completed"]);
  assert.equal((await act(env, cookie, held, "remind", { channel: "phone" })).status, 409, "reminded_completed_no_regress");
});

test("a viewing is completed before the client answers; their feedback is recorded once, with its date and who took it", async t => {
  const { env, cookie } = await world(t);
  const id = seedViewing(env, { date: day(-1) });
  assert.equal((await act(env, cookie, id, "complete", {})).data.fields.outcome, "Choose an outcome");
  assert.equal((await act(env, cookie, id, "complete", { outcome: null })).status, 200);
  let v = row(env, id);
  assert.deepEqual([v.status, v.outcome, v.feedback_at, v.feedback_by, stageOf(v)], ["completed", null, null, null, "completed"]);
  assert.deepEqual(lastEvent(env), ["viewing.completed", ADMIN, String(id), { outcome: null }]);
  assert.ok((await tab(env, cookie, "past")).viewings.some(x => x.id === id));

  for (const more of [{}, { outcome: null }, { outcome: "maybe" }, { outcome: "proceed", outcome_note: "x".repeat(501) }])
    assert.equal((await act(env, cookie, id, "feedback", more)).status, 400, JSON.stringify(more));
  assert.equal(row(env, id).outcome, null);
  t.mock.timers.tick(2 * 3600000);
  assert.equal((await act(env, cookie, id, "feedback", { outcome: "more_info", outcome_note: ` ${SUMMARY} ` })).status, 200);
  v = row(env, id);
  assert.deepEqual([v.status, v.outcome, v.outcome_note, v.feedback_at, v.feedback_by, stageOf(v)],
    ["completed", "more_info", SUMMARY, "2026-10-28T14:05:00.000Z", ADMIN, "feedback"]);
  assert.deepEqual(lastEvent(env), ["viewing.feedback", ADMIN, String(id), { outcome: "more_info" }]);
  // The client's words stay in the viewing's row: never in an event or a notice.
  const logged = JSON.stringify([events(env), env.DB.raw.prepare("SELECT * FROM notifications").all()]);
  assert.ok(!logged.includes("FIXTURE-SUMMARY"));

  const again = await act(env, cookie, id, "feedback", { outcome: "proceed" });
  assert.deepEqual([again.status, again.data.error], [409, "Feedback is already recorded for this viewing."]);
  assert.equal(row(env, id).outcome, "more_info");
  for (const status of ["requested", "confirmed", "no_show", "cancelled"]) {
    const x = seedViewing(env, { status, time: "15:00" });
    assert.equal((await act(env, cookie, x, "feedback", { outcome: "proceed" })).status, 409, status);
    assert.equal(row(env, x).outcome, null, status);
  }

  // Answered on the spot: completing with the outcome records the feedback at once (VIS-04's form, unchanged).
  const spot = seedViewing(env, { date: day(-1), time: "16:00" });
  assert.equal((await act(env, cookie, spot, "complete", { outcome: "proceed" })).status, 200);
  v = row(env, spot);
  assert.deepEqual([v.outcome, v.feedback_at, v.feedback_by, stageOf(v)], ["proceed", "2026-10-28T14:05:00.000Z", ADMIN, "feedback"]);
});

test("confirming a request short of a tenanted house's notice needs staff to say access is agreed, as a booking does", async t => {
  const { env, cookie } = await world(t, { rules: true });
  const near = seedViewing(env, { status: "requested" }), far = seedViewing(env, { status: "requested", date: day(2), time: "15:00" });
  const refused = await act(env, cookie, near, "confirm");
  assert.equal(refused.status, 400);
  assert.match(refused.data.fields.notice_confirmed, /24 hours' notice/);
  assert.equal((await act(env, cookie, near, "confirm", { notice_confirmed: "yes" })).status, 400);
  assert.deepEqual([row(env, near).status, events(env).length], ["requested", 0], "no_silent_override");
  assert.equal((await act(env, cookie, near, "confirm", { notice_confirmed: true })).status, 200);
  assert.equal(row(env, near).status, "confirmed");
  assert.deepEqual(lastEvent(env), ["viewing.confirmed", ADMIN, String(near), { notice_confirmed: true }]);
  assert.equal((await act(env, cookie, far, "confirm")).status, 200, "enough notice asks nothing");
  assert.equal(events(env).at(-1).data, null);

  // A vacant house, or a general enquiry, asks nothing either.
  env.DB.raw.prepare("UPDATE listings SET occupancy = 'vacant'").run();
  const vacant = seedViewing(env, { status: "requested", time: "12:30" });
  assert.equal((await act(env, cookie, vacant, "confirm")).status, 200);
  const general = seedViewing(env, { status: "requested", listing_id: null, time: "14:00" });
  assert.equal((await act(env, cookie, general, "confirm")).status, 200);
});

test("notice hours saved while a request is being confirmed are read again by its update", async t => {
  const { env, cookie } = await world(t, { rules: true });
  const id = seedViewing(env, { status: "requested", date: day(2), time: "15:00" });
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => {
    if (stmts.some(s => s.sql.includes("UPDATE viewing_requests"))) env.DB.raw.prepare("UPDATE listing_viewing_rules SET notice_hours = 72").run();
    return batch(stmts);
  };
  const r = await act(env, cookie, id, "confirm");
  assert.deepEqual([r.status, r.data.error], [409, "This property's notice changed while you were confirming. Check it and confirm again."]);
  assert.deepEqual([row(env, id).status, events(env).length], ["requested", 0]);
});

test("no state of a viewing closes the applicant's search or changes its stage (acceptance)", async t => {
  const { env, cookie } = await world(t);
  const contact = env.DB.raw.prepare(`INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at)
    VALUES ('Sam Buyer', 'sam@example.je', ?, ?, ?)`).run(T0, T0, T0).lastInsertRowid;
  for (const stage of ["searching", "viewing"]) env.DB.raw.prepare(`INSERT INTO applicants (contact_id, operation, stage, source,
    created_at, updated_at) VALUES (?, ?, ?, 'web', ?, ?)`).run(contact, stage === "viewing" ? "rent" : "buy", stage, T0, T0);
  const searches = () => env.DB.raw.prepare("SELECT * FROM applicants ORDER BY id").all();
  const before = searches();
  assert.deepEqual(before.map(a => [a.stage, a.search_state]), [["searching", "active"], ["viewing", "active"]]);
  const ok = async (id, action, more) => {
    const r = await act(env, cookie, id, action, more);
    assert.equal(r.status, 200, `${action}: ${JSON.stringify(r.data)}`);
    assert.deepEqual(searches(), before, `${action} left every search as it was`);
  };

  // The whole cycle, with the "not interested" answer that could look like the end of a search.
  const id = seedViewing(env, { status: "requested", date: TODAY, time: "13:00" });
  await ok(id, "confirm");
  await ok(id, "remind", { channel: "phone" });
  await ok(id, "reschedule", { negotiator_id: 1, date: TODAY, time: "14:00" });
  await ok(id, "remind", { channel: "in_person" });
  t.mock.timers.tick(4 * 3600000);
  await ok(id, "complete", { outcome: null });
  await ok(id, "feedback", { outcome: "not_interested", outcome_note: "Too small" });
  assert.equal(stageOf(row(env, id)), "feedback");
  // The exits: a cancelled request, a cancelled viewing and a no-show.
  await ok(seedViewing(env, { status: "requested", date: day(1), time: "11:00" }), "cancel");
  await ok(seedViewing(env, { date: day(1), time: "12:00" }), "cancel");
  await ok(seedViewing(env, { date: day(-1), time: "12:00" }), "no_show");
  await ok(seedViewing(env, { date: day(-1), time: "15:00" }), "complete", { outcome: "proceed" });
  assert.deepEqual(events(env).filter(e => e.entity_type !== "viewing"), [], "and nothing is written about the applicant");
});
