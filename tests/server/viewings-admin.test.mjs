import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0, captured, plan } from "./helpers.mjs";
import { plusDays, addMinutes } from "../../server/viewings.js";

// A fixed clock: Wednesday 28 October 2026, 12:05 in Jersey (GMT since the 25th, so the same as UTC).
const NOW = Date.parse("2026-10-28T12:05:00.000Z"), TODAY = "2026-10-28";
const day = n => plusDays(TODAY, n);
const ADMIN = "luismadef45@gmail.com";
const TAKEN = "That time was just booked. Please choose another.";

async function world(t) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv();
  seedListing(env);
  seedListing(env, { id: "HE-R002", title: "Draft", published: 0 });
  return { env, cookie: await adminCookie() };
}
// A viewing straight into the table (never edited: updated_at NULL, as a website request).
const seedViewing = (env, o = {}) => {
  const row = { listing_id: "HE-R001", negotiator_id: 1, agent: "Gilberto Franco", kind: "In person", date: day(1),
    time: "10:00", name: "Sam Buyer", email: "sam@x.je", status: "requested", created_at: T0, ...o };
  row.end_time ??= addMinutes(row.time, 30);
  const cols = Object.keys(row);
  return Number(env.DB.raw.prepare(`INSERT INTO viewing_requests (${cols}) VALUES (${cols.map(() => "?")})`)
    .run(...Object.values(row)).lastInsertRowid);
};
// A request from the website, with its event and open notice.
async function requested(env, o = {}) {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: "hampton.test" }));
  const r = await call(env, "POST", "/viewings", { body: { listing_id: "HE-R001", negotiator_id: 1, kind: "In person",
    date: day(1), time: "11:00", name: "Jane Le Brocq", email: "jane@example.je", turnstile: "t", ...o } });
  assert.equal(r.status, 201);
  return env.DB.raw.prepare("SELECT MAX(id) id FROM viewing_requests").get().id;
}
const row = (env, id) => env.DB.raw.prepare("SELECT * FROM viewing_requests WHERE id = ?").get(id);
const events = env => env.DB.raw.prepare("SELECT * FROM events ORDER BY id").all();
const notices = env => env.DB.raw.prepare("SELECT * FROM notifications ORDER BY id").all();
const counts = env => ["viewing_requests", "events", "notifications"]
  .map(t => env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);
const put = (env, cookie, id, body) => call(env, "PUT", `/admin/viewings/${id}`, { cookie, body });
const act = (env, cookie, id, action, more = {}) =>
  put(env, cookie, id, { action, updated_at: row(env, id).updated_at, ...more });
// Runs `before` just ahead of the batch whose SQL contains `marker`: another write landing between check and write.
const raceOn = (env, marker, before) => {
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = stmts => { if (stmts.some(s => s.sql.includes(marker))) before(); return batch(stmts); };
};

test("tabs: each lists its viewings in its order, with the four counts, names and the listing filter", async t => {
  const { env, cookie } = await world(t);
  const v = o => seedViewing(env, o);
  const r1 = v({ created_at: "2026-10-20T09:00:00.000Z" });
  const r2 = v({ created_at: "2026-10-19T09:00:00.000Z", listing_id: "HE-R002", negotiator_id: 2, agent: "Joshua Franco" });
  const u1 = v({ status: "confirmed", date: day(1) });
  const u2 = v({ status: "confirmed", date: TODAY, time: "13:00" });
  const u3 = v({ status: "confirmed", date: TODAY, time: "11:40" });            // ends 12:10: still on
  const o1 = v({ status: "confirmed", date: TODAY, time: "10:00" });            // today, over at 10:30
  const o2 = v({ status: "confirmed", date: day(-1), time: "15:00" });
  const p1 = v({ status: "completed", outcome: "proceed", date: day(-3) });
  const p2 = v({ status: "cancelled", date: day(2) });
  const p3 = v({ status: "no_show", date: day(-1) });
  const p4 = v({ status: "completed", date: day(-10), negotiator_id: null, agent: "Former Agent" });
  const tab = async (name, q = "") => {
    const r = await call(env, "GET", `/admin/viewings?tab=${name}${q}`, { cookie });
    assert.equal(r.status, 200);
    return r.data;
  };
  const ids = d => d.viewings.map(x => x.id);
  const requests = await tab("requests");
  assert.deepEqual(ids(requests), [r2, r1]);
  assert.deepEqual(requests.counts, { requests: 2, upcoming: 3, outcome: 2, past: 4 });
  assert.deepEqual(requests.viewings.map(x => [x.listing_title, x.negotiator_name]),
    [["Draft", "Joshua Franco"], ["Le Bernage", "Gilberto Franco"]]);
  assert.deepEqual(ids(await tab("upcoming")), [u3, u2, u1]);
  assert.deepEqual(ids(await tab("outcome")), [o2, o1]);
  const past = await tab("past");
  assert.deepEqual(ids(past), [p2, p3, p1, p4]);
  assert.equal(past.viewings.at(-1).negotiator_name, "Former Agent", "an unlinked migrated row shows its old agent");
  const one = await tab("requests", "&listing_id=HE-R002");
  assert.deepEqual(ids(one), [r2]);
  assert.deepEqual(one.counts, { requests: 1, upcoming: 0, outcome: 0, past: 0 });
  for (const q of ["", "?tab=new", "?status=requested", "?tab=requests&listing_id=x"])
    assert.equal((await call(env, "GET", `/admin/viewings${q}`, { cookie })).status, 400, q);
  assert.equal((await call(env, "GET", "/admin/viewings?tab=requests")).status, 401);
});

test("confirm closes the request's notice; complete records the outcome; each writes its event", async t => {
  const { env, cookie } = await world(t);
  const id = await requested(env);
  assert.equal((await act(env, cookie, id, "confirm")).status, 200);
  assert.equal(row(env, id).status, "confirmed");
  assert.equal(row(env, id).updated_by, ADMIN);
  const [n] = notices(env);
  assert.ok(n.resolved_at);
  assert.equal(n.resolved_by, ADMIN);
  let e = events(env).at(-1);
  assert.deepEqual([e.type, e.actor, e.entity_type, e.entity_id, e.data], ["viewing.confirmed", ADMIN, "viewing", String(id), null]);
  t.mock.timers.tick(1000);
  const done = await act(env, cookie, id, "complete", { outcome: "proceed", outcome_note: "  Wants a second look  " });
  assert.equal(done.status, 200);
  assert.deepEqual([row(env, id).status, row(env, id).outcome, row(env, id).outcome_note], ["completed", "proceed", "Wants a second look"]);
  e = events(env).at(-1);
  assert.deepEqual([e.type, JSON.parse(e.data)], ["viewing.completed", { outcome: "proceed" }]);
  assert.equal(notices(env).length, 1, "no new notice");
});

test("cancel closes the notice; no-show marks a confirmed viewing; an outcome note is optional", async t => {
  const { env, cookie } = await world(t);
  const id = await requested(env);
  assert.equal((await act(env, cookie, id, "cancel")).status, 200);
  assert.equal(row(env, id).status, "cancelled");
  assert.ok(notices(env)[0].resolved_at);
  assert.equal(events(env).at(-1).type, "viewing.cancelled");
  const c = seedViewing(env, { status: "confirmed", date: day(-1) });
  assert.equal((await act(env, cookie, c, "no_show")).status, 200);
  assert.equal(row(env, c).status, "no_show");
  assert.deepEqual([events(env).at(-1).type, events(env).at(-1).entity_id], ["viewing.no_show", String(c)]);
  const d = seedViewing(env, { status: "confirmed", date: day(-1), time: "15:00" });
  assert.equal((await act(env, cookie, d, "complete", { outcome: "not_interested" })).status, 200);
  assert.deepEqual([row(env, d).outcome, row(env, d).outcome_note], ["not_interested", null]);
});

test("refused transitions, stale versions and bad input change nothing", async t => {
  const { env, cookie } = await world(t);
  const id = await requested(env), before = () => [row(env, id), events(env).length, notices(env)];
  const start = before();
  for (const action of ["complete", "no_show"]) {
    const r = await act(env, cookie, id, action, { outcome: "proceed" });
    assert.equal(r.status, 409, action);
    assert.equal(r.data.error, "This viewing is already requested.");
  }
  const stale = await put(env, cookie, id, { action: "confirm", updated_at: "2026-10-01T00:00:00.000Z" });
  assert.equal(stale.status, 409);
  assert.match(stale.data.error, /Someone else saved changes to this viewing/);
  for (const body of [{ action: "confirm" }, { action: "approve", updated_at: null }, { action: "confirm", updated_at: 5 }])
    assert.equal((await put(env, cookie, id, body)).status, 400, JSON.stringify(body));
  assert.deepEqual(before(), start, "the request and its open notice are as they were");
  for (const r of [await put(env, cookie, 999, { action: "confirm", updated_at: null }), await put(env, cookie, 999, { notes: "x" }),
    await call(env, "DELETE", "/admin/viewings/999", { cookie })]) assert.deepEqual([r.status, r.data.error], [404, "Viewing not found"]);

  const c = seedViewing(env, { status: "confirmed", date: day(-1) });
  assert.equal((await act(env, cookie, c, "confirm")).data.error, "This viewing is already confirmed.");
  for (const extra of [{}, { outcome: "maybe" }, { outcome: "proceed", outcome_note: "x".repeat(501) }, { outcome: "proceed", outcome_note: 5 }]) {
    const r = await act(env, cookie, c, "complete", extra);
    assert.equal(r.status, 400, JSON.stringify(extra));
    assert.ok(r.data.fields, JSON.stringify(extra));
  }
  for (const [status, action, error] of [["completed", "cancel", "This viewing is already completed."],
    ["cancelled", "reschedule", "This viewing is already cancelled."],
    ["no_show", "complete", "This viewing is already marked as a no-show."],
    ["cancelled", "confirm", "This viewing is already cancelled."]]) {
    const x = seedViewing(env, { status, date: day(-2), time: "16:00" });
    const r = await act(env, cookie, x, action, { outcome: "proceed", negotiator_id: 1, date: day(1), time: "15:00" });
    assert.equal(r.status, 409, `${action} from ${status}`);
    assert.equal(r.data.error, error);
  }
  assert.equal(row(env, c).status, "confirmed");
});

test("a confirm racing another save is 409: no status change, no event, and the notice stays open", async t => {
  const { env, cookie } = await world(t);
  const id = await requested(env), n = events(env).length;
  raceOn(env, "UPDATE viewing_requests SET status", () =>
    env.DB.raw.prepare("UPDATE viewing_requests SET notes = 'x', updated_at = '2026-10-28T12:04:00.000Z' WHERE id = ?").run(id));
  const r = await act(env, cookie, id, "confirm");
  assert.equal(r.status, 409);
  assert.match(r.data.error, /Someone else saved changes/);
  assert.equal(row(env, id).status, "requested");
  assert.equal(events(env).length, n);
  assert.equal(notices(env)[0].resolved_at, null);
});

test("an action on a viewing deleted between its check and its write is 404", async t => {
  const { env, cookie } = await world(t);
  const id = await requested(env);
  raceOn(env, "UPDATE viewing_requests SET status", () =>
    env.DB.raw.prepare("DELETE FROM viewing_requests WHERE id = ?").run(id));
  const r = await act(env, cookie, id, "confirm");
  assert.deepEqual([r.status, r.data.error], [404, "Viewing not found"]);
});

test("cancelling a confirmed viewing writes its event and frees its slot", async t => {
  const { env, cookie } = await world(t);
  const id = seedViewing(env, { status: "confirmed", time: "10:00" });
  const booked = async () => (await call(env, "GET", `/admin/availability?from=${day(1)}&days=1`, { cookie }))
    .data.days[0].slots[1].find(s => s.time === "10:00").booked;
  assert.equal(await booked(), true);
  assert.equal((await act(env, cookie, id, "cancel")).status, 200);
  assert.equal(row(env, id).status, "cancelled");
  const e = events(env).at(-1);
  assert.deepEqual([e.type, e.actor, e.entity_id], ["viewing.cancelled", ADMIN, String(id)]);
  assert.equal(await booked(), false);
});

test("notes still save on their own, without an action", async t => {
  const { env, cookie } = await world(t);
  const id = await requested(env);
  assert.equal((await put(env, cookie, id, { notes: "  Called, wants Saturday  " })).status, 200);
  assert.equal(row(env, id).notes, "Called, wants Saturday");
  assert.equal(notices(env)[0].resolved_at, null);
  assert.equal((await put(env, cookie, id, { status: "confirmed" })).status, 400, "the old status update is gone");
  assert.equal(row(env, id).status, "requested");
});

test("reschedule onto its own slot and the slots next to it (Review Focus 3); a clash is 409", async t => {
  const { env, cookie } = await world(t);
  const id = seedViewing(env, { status: "confirmed", time: "11:00" });
  seedViewing(env, { status: "confirmed", time: "13:00", name: "Other", email: "o@x.je" });
  const move = (time, o = {}) => act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(1), time, ...o });
  for (const time of ["11:00", "11:30", "10:30"]) {
    t.mock.timers.tick(1000);
    const r = await move(time);
    assert.equal(r.status, 200, time);
    assert.deepEqual([row(env, id).time, row(env, id).end_time, row(env, id).status], [time, addMinutes(time, 30), "confirmed"]);
  }
  const e = events(env).filter(x => x.type === "viewing.rescheduled");
  assert.equal(e.length, 3);
  assert.deepEqual(JSON.parse(e[1].data), { from: { negotiator_id: 1, date: day(1), time: "11:00" },
    to: { negotiator_id: 1, date: day(1), time: "11:30" } });
  assert.equal(e[1].actor, ADMIN);
  const n = events(env).length;
  const clash = await move("12:30");                                   // 15-minute margin before the 13:00 viewing
  assert.equal(clash.status, 409);
  assert.equal(clash.data.error, TAKEN);
  for (const bad of [{ time: "11:10" }, { time: "18:00" }, { date: TODAY, time: "11:00" }, { date: day(400) }, { negotiator_id: 99 }]) {
    const r = await move(bad.time ?? "11:00", bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.ok(r.data.fields, JSON.stringify(bad));
  }
  assert.equal(events(env).length, n);
  assert.equal(row(env, id).time, "10:30");
});

test("a request rescheduled stays requested with its notice open", async t => {
  const { env, cookie } = await world(t);
  const id = await requested(env);
  const r = await act(env, cookie, id, "reschedule", { negotiator_id: 2, date: day(2), time: "15:00" });
  assert.equal(r.status, 200);
  assert.deepEqual([row(env, id).status, row(env, id).negotiator_id, row(env, id).agent, row(env, id).date],
    ["requested", 2, "Joshua Franco", day(2)]);
  assert.equal(notices(env)[0].resolved_at, null);
});

test("an inactive negotiator's viewing moves to an active one, onto that person's free slots (Review Focus 4)", async t => {
  const { env, cookie } = await world(t);
  const id = seedViewing(env, { status: "confirmed", negotiator_id: 2, agent: "Joshua Franco", time: "11:00" });
  env.DB.raw.prepare("UPDATE negotiators SET active = 0 WHERE id = 2").run();
  seedViewing(env, { status: "requested", time: "11:00", name: "Other", email: "o@x.je" });   // Gilberto at 11:00
  const move = (negotiator_id, time) => act(env, cookie, id, "reschedule", { negotiator_id, date: day(1), time });
  assert.equal((await move(1, "11:00")).status, 409, "the target's booked slot");
  assert.equal((await move(1, "18:00")).status, 400, "outside the target's hours");
  assert.ok((await move(2, "15:00")).data.fields.negotiator_id, "an inactive negotiator takes no viewings");
  assert.equal((await move(1, "14:00")).status, 200);
  assert.deepEqual([row(env, id).negotiator_id, row(env, id).agent, row(env, id).time], [1, "Gilberto Franco", "14:00"]);
});

test("a reschedule losing the race to another booking is 409 and writes nothing", async t => {
  const { env, cookie } = await world(t);
  const id = seedViewing(env, { status: "confirmed", time: "11:00" });
  const start = [row(env, id), counts(env)];
  raceOn(env, "UPDATE viewing_requests SET negotiator_id", () =>
    seedViewing(env, { time: "15:00", name: "Quick", email: "q@x.je" }));
  const r = await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(1), time: "15:00" });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, TAKEN);
  assert.deepEqual([row(env, id), counts(env)], [start[0], [start[1][0] + 1, ...start[1].slice(1)]], "only the other booking");
});

test("panel booking: any listing or none, today at a time still to come, confirmed with its event and no notice", async t => {
  const { env, cookie } = await world(t);
  const book = o => call(env, "POST", "/admin/viewings", { cookie, body: { listing_id: "HE-R002", negotiator_id: 1,
    kind: "Live video call", date: TODAY, time: "14:00", name: "Walk In", phone: "07797 000111", notes: "  Called the office  ", ...o } });
  const r = await book();
  assert.equal(r.status, 201);
  const v = row(env, r.data.id);
  assert.deepEqual([v.status, v.email, v.phone, v.end_time, v.agent, v.notes, v.listing_title_snapshot, v.updated_at],
    ["confirmed", null, "07797 000111", "14:30", "Gilberto Franco", "Called the office", "Draft", null]);
  const [e, ...more] = events(env);
  assert.equal(more.length, 0);
  assert.deepEqual([e.type, e.actor, e.entity_id, JSON.parse(e.data)], ["viewing.booked", ADMIN, String(r.data.id),
    { listing_id: "HE-R002", date: TODAY, time: "14:00", kind: "Live video call", negotiator_id: 1 }]);
  assert.equal(notices(env).length, 0);
  // General enquiry, by email only.
  const g = await book({ listing_id: null, phone: null, email: "Walk@In.je", time: "16:00", notes: undefined });
  assert.equal(g.status, 201);
  assert.deepEqual([row(env, g.data.id).listing_id, row(env, g.data.id).email, row(env, g.data.id).notes], [null, "walk@in.je", null]);
  for (const time of ["14:00", "14:30"]) {
    const again = await book({ time });
    assert.equal(again.status, 409, time);
    assert.equal(again.data.error, TAKEN);
  }
  const n = counts(env);
  for (const [o, field] of [[{ time: "12:00" }, "time"], [{ time: "14:10" }, "time"], [{ phone: null }, "email"],
    [{ listing_id: "HE-R999" }, "listing_id"], [{ negotiator_id: 99 }, "negotiator_id"], [{ date: day(-1) }, "date"],
    [{ notes: "x".repeat(4001) }, null]]) {
    const bad = await book({ time: "15:00", ...o });
    assert.equal(bad.status, 400, JSON.stringify(o));
    if (field) assert.ok(bad.data.fields[field], JSON.stringify(o));
  }
  env.DB.raw.prepare("UPDATE negotiators SET active = 0 WHERE id = 2").run();
  assert.ok((await book({ negotiator_id: 2 })).data.fields.negotiator_id, "an inactive negotiator takes no viewings");
  assert.deepEqual(counts(env), n);
  assert.equal((await call(env, "POST", "/admin/viewings", { body: {} })).status, 401);
});

test("panel booking losing the race is 409 with no row, no event and no notice", async t => {
  const { env, cookie } = await world(t);
  raceOn(env, "INSERT INTO viewing_requests", () => seedViewing(env, { date: TODAY, time: "14:15", name: "Quick", email: "q@x.je" }));
  const r = await call(env, "POST", "/admin/viewings", { cookie, body: { negotiator_id: 1, kind: "In person", date: TODAY,
    time: "14:00", name: "Walk In", email: "w@x.je" } });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, TAKEN);
  assert.deepEqual(counts(env), [1, 0, 0], "only the other booking");
});

test("active interest counts each person once: active from today on, proceed or more info in the last 30 days", async t => {
  const { env, cookie } = await world(t);
  const interest = async () => (await call(env, "GET", "/admin/listings/HE-R001", { cookie })).data.active_interest;
  const v = o => seedViewing(env, o);
  assert.equal(await interest(), 0);
  v({ email: "Ann@X.je", status: "requested", date: day(1) });
  v({ email: "ann@x.je", status: "confirmed", date: TODAY });
  assert.equal(await interest(), 1, "two viewings of the same email");
  v({ email: "nope@x.je", status: "completed", outcome: "not_interested", date: day(-2) });
  assert.equal(await interest(), 1, "not interested");
  v({ email: "old@x.je", status: "completed", outcome: "proceed", date: day(-31) });
  assert.equal(await interest(), 1, "proceed 31 days ago");
  v({ email: "gone@x.je", status: "cancelled", date: day(3) });
  v({ email: "late@x.je", status: "confirmed", date: day(-1) });
  v({ email: "else@x.je", status: "requested", date: day(1), listing_id: "HE-R002" });
  assert.equal(await interest(), 1, "cancelled, past still-active and other listings' viewings");
  v({ email: "bob@x.je", status: "completed", outcome: "proceed", date: day(-30) });
  v({ email: null, phone: "07797 1", status: "completed", outcome: "more_info", date: day(-5) });
  v({ email: null, phone: "07797 1", status: "requested", date: day(2) });
  assert.equal(await interest(), 3, "proceed 30 days ago, and a phone-only person once");
});

test("active interest and a listing's viewings are read through the (listing_id, date) index, never a scan", async t => {
  const { env, cookie } = await world(t);
  const interest = captured(env, /COUNT\(DISTINCT/);
  await call(env, "GET", "/admin/listings/HE-R001", { cookie });
  assert.equal(interest.length, 1);
  const p = plan(env, interest[0]);
  assert.match(p, /SEARCH viewing_requests USING INDEX viewing_listing \(listing_id=\? AND date>\?\)/, p);
  assert.doesNotMatch(p, /SCAN|viewing_status/, p);
  for (const tab of Object.keys({ requests: 1, upcoming: 1, outcome: 1, past: 1 })) {
    const q = captured(env, /FROM viewing_requests v/);
    await call(env, "GET", `/admin/viewings?tab=${tab}&listing_id=HE-R001`, { cookie });
    assert.equal(q.length, 2, tab);
    for (const one of q) {
      const p2 = plan(env, one);
      assert.match(p2, /SEARCH v USING INDEX viewing_listing \(listing_id=\?/, `${tab}: ${p2}`);
      assert.doesNotMatch(p2, /SCAN|viewing_status/, `${tab}: ${p2}`);
    }
  }
});

test("availability with exclude leaves the moving viewing out: its own and neighbouring slots are free", async t => {
  const { env, cookie } = await world(t);
  const own = seedViewing(env, { status: "confirmed", date: day(1), time: "10:30" });
  seedViewing(env, { date: day(1), time: "12:00", name: "Other", email: "o@x.je" });
  const slots = async q => Object.fromEntries((await call(env, "GET", `/admin/availability?from=${day(1)}&days=1${q}`, { cookie }))
    .data.days[0].slots[1].map(s => [s.time, s.booked]));
  const before = await slots("");
  assert.deepEqual([before["10:00"], before["10:30"], before["11:00"], before["11:30"]], [true, true, true, true]);
  const after = await slots(`&exclude=${own}`);
  assert.deepEqual([after["10:00"], after["10:30"], after["11:00"]], [false, false, false], "own slot and its neighbours");
  assert.deepEqual([after["11:30"], after["12:00"], after["12:30"]], [true, true, true], "the other viewing still blocks");
  for (const q of ["&exclude=x", "&exclude=0"])
    assert.equal((await call(env, "GET", `/admin/availability?from=${day(1)}${q}`, { cookie })).status, 400, q);
});

test("the interest route gives the title and the same count as the listing detail, through the index", async t => {
  const { env, cookie } = await world(t);
  seedViewing(env, { email: "ann@x.je", status: "requested", date: day(1) });
  seedViewing(env, { email: null, phone: "07797 1", status: "completed", outcome: "proceed", date: day(-2) });
  const q = captured(env, /AS own/);
  const r = await call(env, "GET", "/admin/listings/HE-R001/interest", { cookie });
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.title, r.data.active_interest, r.data.people.length, r.data.removed], ["Le Bernage", 2, 2, []]);
  assert.equal((await call(env, "GET", "/admin/listings/HE-R001", { cookie })).data.active_interest, 2);
  const p = plan(env, q[0]);
  assert.match(p, /SEARCH viewing_requests USING INDEX viewing_listing \(listing_id=\?/, p);
  assert.doesNotMatch(p, /SCAN viewing_requests/, p);
  assert.equal((await call(env, "GET", "/admin/listings/HE-Z999/interest", { cookie })).status, 404);
  assert.equal((await call(env, "GET", "/admin/listings/HE-R001/interest")).status, 401);
});

test("the slim listing list names every listing without reading media", async t => {
  const { env, cookie } = await world(t);
  seedListing(env, { id: "HE-R000", title: "Old import", published: 1, archived_at: T0 });
  seedListing(env, { id: "HE-R003", title: "Second live" });
  const media = captured(env, /FROM media/);
  const r = await call(env, "GET", "/admin/listings?slim=1", { cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(new Set(r.data.listings.map(l => Object.keys(l).sort().join())), new Set(["archived_at,id,published,title"]));
  // Published first, then drafts, then the archived ones (most of them agency imports).
  assert.deepEqual(r.data.listings.map(l => l.id), ["HE-R001", "HE-R003", "HE-R002", "HE-R000"]);
  assert.equal(media.length, 0);
});
