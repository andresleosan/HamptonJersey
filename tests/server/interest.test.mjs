import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0, captured, plan } from "./helpers.mjs";
import { plusDays, addMinutes } from "../../server/viewings.js";

// Wednesday 28 October 2026, 12:05 in Jersey (GMT since the 25th, so the same as UTC).
const NOW = "2026-10-28T12:05:00.000Z", TODAY = "2026-10-28";
const day = n => plusDays(TODAY, n);

async function world(t, now = NOW) {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(now) });
  const env = makeEnv();
  seedListing(env);
  seedListing(env, { id: "HE-R002", title: "Trinity rental" });
  return env;
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
const set = (env, id, o) => env.DB.raw.prepare(`UPDATE viewing_requests SET ${Object.keys(o).map(k => `${k} = ?`)} WHERE id = ?`)
  .run(...Object.values(o), id);
// The panel's count for HE-R001. A session lasts 8 hours, so each read signs one for the mocked clock.
const interest = async env => (await call(env, "GET", "/admin/listings/HE-R001", { cookie: await adminCookie() })).data.active_interest;

test("the rule's edges: today all day, no-show never, 30 days in, 31 out", async t => {
  const env = await world(t), v = o => seedViewing(env, o);
  v({ email: "early@x.je", date: TODAY, time: "10:00" });                        // requested, over at 10:30
  v({ email: "first@x.je", status: "confirmed", date: TODAY, time: "09:00" });
  assert.equal(await interest(env), 2, "today's viewings count all day, even once their time has passed");
  v({ email: "away@x.je", status: "no_show", date: TODAY, time: "11:00" });
  v({ email: "gone@x.je", status: "no_show", date: day(-1) });
  assert.equal(await interest(env), 2, "a no-show never counts");
  v({ email: "in@x.je", status: "completed", outcome: "proceed", date: day(-30) });
  v({ email: "out@x.je", status: "completed", outcome: "more_info", date: day(-31) });
  assert.equal(await interest(env), 3, "30 days back counts, 31 doesn't");
});

test("the day is Jersey's, also in summer", async t => {
  const env = await world(t, "2026-07-01T22:30:00.000Z");                         // 23:30 BST on 1 July
  seedViewing(env, { date: "2026-07-01", time: "15:00" });
  assert.equal(await interest(env), 1, "still 1 July in Jersey");
  t.mock.timers.setTime(Date.parse("2026-07-01T23:30:00.000Z"));                 // 00:30 BST on 2 July
  assert.equal(await interest(env), 0, "2 July in Jersey, though still 1 July in UTC");
  t.mock.timers.setTime(Date.parse("2026-07-31T23:30:00.000Z"));                 // 00:30 BST on 1 August
  seedViewing(env, { email: "in@x.je", status: "completed", outcome: "proceed", date: "2026-07-02" });
  seedViewing(env, { email: "out@x.je", status: "completed", outcome: "proceed", date: "2026-07-01" });
  assert.equal(await interest(env), 1, "30 days back from Jersey's 1 August is 2 July");
});

test("removed rows don't count; a joined row counts as its person", async t => {
  const env = await world(t), v = o => seedViewing(env, o);
  const ann = v({ name: "Ann", email: "ann@x.je" });
  const bo = v({ name: "Bo", email: null, phone: "07700 900111", time: "11:00" });
  assert.equal(await interest(env), 2);
  set(env, bo, { interest_same_as: "ann@x.je" });
  assert.equal(await interest(env), 1, "Bo joined to Ann");
  set(env, ann, { status: "cancelled" });
  assert.equal(await interest(env), 1, "still one person while Bo's booking counts");
  set(env, ann, { status: "requested" });
  set(env, bo, { interest_same_as: null });
  set(env, ann, { interest_removed_at: T0, interest_reason: "not_buyer" });
  assert.equal(await interest(env), 1, "Ann removed: only Bo");
  v({ name: "Kim", email: "kim@x.je", phone: "07797 123456", time: "12:00" });
  v({ name: "Lee", email: null, phone: "07700 222333", time: "13:00", interest_same_as: "7797123456" });
  assert.equal(await interest(env), 2, "Lee, joined to Kim's phone, counts as Kim's email");
});

const row = (env, id) => env.DB.raw.prepare("SELECT * FROM viewing_requests WHERE id = ?").get(id);
const events = (env, type) => env.DB.raw.prepare("SELECT * FROM events WHERE type = ? ORDER BY id").all(type);
const card = async env => (await call(env, "GET", "/admin/listings/HE-R001/interest", { cookie: await adminCookie() })).data;
const correct = async (env, id, body, o = {}) =>
  call(env, "PUT", `/admin/viewings/${id}/interest`, { cookie: await adminCookie(), body, ...o });
const act = async (env, id, action, more = {}) => call(env, "PUT", `/admin/viewings/${id}`,
  { cookie: await adminCookie(), body: { action, updated_at: row(env, id).updated_at, ...more } });
const CHANGED = "Someone else changed this person's count. The list now shows the latest.";

test("the card's lists: each person once, with the viewing that counts, joined contacts and the removed", async t => {
  const env = await world(t), v = o => seedViewing(env, o);
  const a1 = v({ name: "Ann Other", email: "ann@x.je", phone: "07797 1", date: day(2) });
  v({ name: "Ann Other", email: null, phone: "07797 1", status: "confirmed", date: day(1), time: "11:00" });
  v({ name: "Jane Le Brocq", email: "jane@x.je", date: day(3) });
  const j2 = v({ name: "Jane Le Brocq", email: null, phone: "07700 900321", date: day(4), interest_same_as: "jane@x.je" });
  const r1 = v({ name: "Rem Oved", email: "rem@x.je", status: "completed", outcome: "proceed", date: day(-2),
    interest_removed_at: T0, interest_reason: "not_buyer" });
  v({ name: "Bea Back", email: "back@x.je", status: "completed", outcome: "more_info", date: day(-5),
    interest_removed_at: T0, interest_reason: "no_longer_interested" });
  const b2 = v({ name: "Bea Back", email: "back@x.je", date: day(5) });
  v({ name: "Old Timer", email: "old@x.je", status: "completed", outcome: "proceed", date: day(-31),
    interest_removed_at: T0, interest_reason: "other", interest_note: "Moved away" });
  v({ name: "Elsewhere", email: "else@x.je", listing_id: "HE-R002" });
  const c = await card(env);
  assert.equal(c.title, "Le Bernage");
  assert.deepEqual(c.people.map(p => [p.viewing_id, p.joined, p.also]),
    [[b2, false, []], [j2, true, [{ email: "jane@x.je", phone: null }]], [a1, false, []]], "latest first, each once");
  assert.deepEqual(c.people[2], { viewing_id: a1, name: "Ann Other", email: "ann@x.je", phone: "07797 1", date: day(2),
    time: "10:00", status: "requested", outcome: null, also: [], joined: false });
  assert.deepEqual(c.removed, [{ viewing_id: r1, name: "Rem Oved", email: "rem@x.je", phone: null, date: day(-2), time: "10:00",
    status: "completed", outcome: "proceed", removed_at: T0, reason: "not_buyer", note: null }],
  "booked again counts; 31 days old is in neither list");
  assert.equal(c.active_interest, 3);
  assert.equal(await interest(env), 3, "the listing detail's count");
});

test("remove: only the person the count makes of that viewing", async t => {
  const env = await world(t), v = o => seedViewing(env, o);
  const a1 = v({ name: "Ann", email: "ann@x.je", phone: "07797 1", date: day(1) });
  const a2 = v({ name: "Ann", email: null, phone: "07797 1", date: day(2) });
  const b1 = v({ name: "Ben", email: "ben@x.je", phone: "07797 2", date: day(3) });
  assert.equal(await interest(env), 2);
  assert.equal((await correct(env, a2, { action: "remove", reason: "not_buyer", note: " Owner's brother " })).status, 200);
  for (const id of [a1, a2]) assert.deepEqual([row(env, id).interest_reason, row(env, id).interest_note], ["not_buyer", "Owner's brother"]);
  assert.equal(row(env, a1).interest_removed_at, new Date().toISOString());
  assert.equal(row(env, b1).interest_removed_at, null, "Ben is someone else");
  assert.equal(await interest(env), 1);
  const [e] = events(env, "viewing.uncounted");
  assert.deepEqual([events(env, "viewing.uncounted").length, e.entity_type, e.entity_id, e.actor, e.data],
    [1, "viewing", String(a2), "luismadef45@gmail.com", '{"reason":"not_buyer"}']);
  assert.equal((await correct(env, a1, { action: "restore" })).status, 200);
  for (const id of [a1, a2]) assert.deepEqual([row(env, id).interest_removed_at, row(env, id).interest_reason, row(env, id).interest_note], [null, null, null]);
  assert.equal(await interest(env), 2);
  assert.deepEqual(events(env, "viewing.recounted").map(x => [x.entity_id, x.data]), [[String(a1), null]]);
});

test("a phone two people gave counts on its own, and corrections stay on it", async t => {
  // A couple on one mobile: a booking with only that number can't be told apart, so the rule doesn't guess.
  const env = await world(t), v = o => seedViewing(env, o);
  const ben = v({ name: "Ben", email: "ben@x.je", phone: "07797 1", date: day(1) });
  const ann = v({ name: "Ann", email: "ann@x.je", phone: "07797 1", date: day(2) });
  const tel = v({ name: "Ann", email: null, phone: "07797 1", date: day(3) });
  assert.equal(await interest(env), 3, "the phone-only booking counts on its own until the team joins it");
  assert.equal((await correct(env, tel, { action: "remove", reason: "other", note: "Ann rang" })).status, 200);
  assert.deepEqual([ben, ann].map(id => row(env, id).interest_removed_at), [null, null], "Ben and Ann are untouched");
  assert.equal(await interest(env), 2);
  assert.equal((await correct(env, tel, { action: "restore" })).status, 200);
  assert.equal((await correct(env, tel, { action: "join", same_as: ann })).status, 200);
  assert.deepEqual([ben, ann, tel].map(id => row(env, id).interest_same_as), [null, "ann@x.je", "ann@x.je"]);
  assert.equal(await interest(env), 2);
  assert.equal((await act(env, ann, "reschedule", { negotiator_id: 1, date: TODAY, time: "16:00" })).status, 200);
  assert.equal(await interest(env), 2, "moving a viewing moves no booking from one person to another");
});

test("a join holds when the booking that tied the chosen person's phone to their email goes", async t => {
  // Kim booked online (email and mobile) and by phone (mobile only); a booking from her work phone is joined to her.
  const env = await world(t), v = o => seedViewing(env, o);
  const web = v({ name: "Kim", email: "kim@x.je", phone: "07797 123456", date: day(1) });
  const mob = v({ name: "Kim", email: null, phone: "07797123456", date: day(2) });
  const work = v({ name: "Kim", email: null, phone: "01534 555555", date: day(3) });
  assert.equal(await interest(env), 2);
  assert.equal((await correct(env, work, { action: "join", same_as: mob })).status, 200);
  assert.equal(await interest(env), 1);
  assert.equal((await call(env, "DELETE", `/admin/viewings/${web}`, { cookie: await adminCookie() })).status, 200);
  assert.equal(await interest(env), 1, "Kim still counts once");
  assert.deepEqual((await card(env)).people.map(p => [p.viewing_id, p.also.length]), [[work, 1]]);
});

test("join: one person while either side counts", async t => {
  const env = await world(t), v = o => seedViewing(env, o);
  const web = v({ name: "Jane", email: "jane@x.je", date: day(1) });
  const tel = v({ name: "Jane", email: null, phone: "07700 900321", date: day(2) });
  assert.equal(await interest(env), 2);
  assert.equal((await correct(env, tel, { action: "join", same_as: web })).status, 200);
  assert.equal(row(env, tel).interest_same_as, "jane@x.je");
  assert.equal(await interest(env), 1);
  assert.deepEqual(events(env, "viewing.joined").map(x => [x.entity_id, x.data]), [[String(tel), `{"same_as":${web}}`]]);
  assert.equal((await act(env, web, "cancel")).status, 200);
  assert.equal(await interest(env), 1, "the web booking cancelled: Jane still counts once");
  assert.equal((await call(env, "DELETE", `/admin/viewings/${web}`, { cookie: await adminCookie() })).status, 200);
  assert.equal(await interest(env), 1, "and deleted");
  v({ name: "Jane", email: null, phone: "07700900321", date: day(3) });
  assert.equal(await interest(env), 2, "a booking made after the join counts on its own (R15)");
});

test("a join follows its person into a later join, and separate undoes it", async t => {
  const env = await world(t), v = o => seedViewing(env, o);
  const web = v({ name: "Jane", email: "jane@x.je", date: day(1) });
  const tel = v({ name: "Jane", email: null, phone: "07700 900321", date: day(2) });
  const kay = v({ name: "Kay", email: "kay@x.je", date: day(3) });
  await correct(env, tel, { action: "join", same_as: web });
  assert.equal(await interest(env), 2);
  assert.equal((await correct(env, web, { action: "join", same_as: kay })).status, 200);
  assert.deepEqual([row(env, web).interest_same_as, row(env, tel).interest_same_as], ["kay@x.je", "kay@x.je"]);
  assert.equal(await interest(env), 1);
  assert.equal((await correct(env, kay, { action: "separate" })).status, 200);
  assert.deepEqual([row(env, web).interest_same_as, row(env, tel).interest_same_as], [null, null]);
  assert.equal(await interest(env), 3);
});

test("a second identical correction changes nothing", async t => {
  const env = await world(t), v = o => seedViewing(env, o);
  const ann = v({ name: "Ann", email: "ann@x.je", date: day(1) });
  const bo = v({ name: "Bo", email: "bo@x.je", date: day(2) });
  assert.equal((await correct(env, ann, { action: "remove", reason: "no_longer_interested" })).status, 200);
  const again = await correct(env, ann, { action: "remove", reason: "other", note: "Second thoughts" });
  assert.deepEqual([again.status, again.data.error], [409, CHANGED]);
  assert.deepEqual([row(env, ann).interest_reason, row(env, ann).interest_note], ["no_longer_interested", null], "the first reason stays");
  assert.equal((await correct(env, ann, { action: "restore" })).status, 200);
  assert.equal((await correct(env, ann, { action: "restore" })).status, 409);
  assert.equal((await correct(env, bo, { action: "join", same_as: ann })).status, 200);
  const twice = await correct(env, bo, { action: "join", same_as: ann });
  assert.deepEqual([twice.status, twice.data.error], [400, "They already count as one person."]);
  assert.equal((await correct(env, ann, { action: "separate" })).status, 200);
  assert.equal((await correct(env, ann, { action: "separate" })).status, 409);
  for (const type of ["uncounted", "recounted", "joined", "separated"]) assert.equal(events(env, `viewing.${type}`).length, 1, type);
});

test("a removal outlasts later actions on the viewing", async t => {
  const env = await world(t);
  const id = seedViewing(env, { email: "sam@x.je", date: day(1), time: "10:00" });
  await correct(env, id, { action: "remove", reason: "no_longer_interested" });
  assert.equal(await interest(env), 0);
  assert.equal((await act(env, id, "confirm")).status, 200);
  assert.equal((await act(env, id, "reschedule", { negotiator_id: 1, date: day(2), time: "11:00" })).status, 200);
  assert.equal((await act(env, id, "complete", { outcome: "proceed" })).status, 200);
  assert.deepEqual([row(env, id).status, row(env, id).outcome, row(env, id).interest_reason], ["completed", "proceed", "no_longer_interested"]);
  assert.equal(await interest(env), 0, "still out until Count again");
  seedViewing(env, { email: "SAM@x.je", date: day(3), time: "12:00" });
  assert.equal(await interest(env), 1, "a new booking counts (R3)");
});

test("corrections leave the viewing and the contact as they were", async t => {
  const env = await world(t);
  env.DB.raw.prepare("INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run("Sam Buyer", "sam@x.je", T0, T0, T0);
  const sam = seedViewing(env, { email: "sam@x.je", phone: "07797 123456", notes: "Called", status: "confirmed",
    updated_at: "2026-10-20T09:00:00.000Z", updated_by: "andres.san1404@gmail.com" });
  const kay = seedViewing(env, { name: "Kay", email: "kay@x.je", date: day(2) });
  const COLS = ["status", "date", "time", "end_time", "notes", "name", "email", "phone", "negotiator_id", "updated_at", "updated_by"];
  const viewing = () => Object.fromEntries(COLS.map(c => [c, row(env, sam)[c]]));
  const contact = () => env.DB.raw.prepare("SELECT last_activity_at FROM contacts").get().last_activity_at;
  const before = viewing();
  for (const body of [{ action: "remove", reason: "other", note: "Asked us to" }, { action: "restore" },
    { action: "join", same_as: kay }, { action: "separate" }]) {
    assert.equal((await correct(env, sam, body)).status, 200, body.action);
    assert.deepEqual(viewing(), before, body.action);
    assert.equal(contact(), T0, `${body.action} is not the contact's activity`);
  }
});

test("corrections are checked", async t => {
  const env = await world(t), v = o => seedViewing(env, o);
  const ann = v({ email: "ann@x.je" }), ann2 = v({ email: "ann@x.je", date: day(2) });
  const other = v({ email: "bo@x.je", listing_id: "HE-R002" }), general = v({ email: "gen@x.je", listing_id: null });
  const bad = async (id, body, status, error, o) => {
    const r = await correct(env, id, body, o);
    assert.deepEqual([r.status, typeof error === "string" ? r.data.error : r.data.fields], [status, error], JSON.stringify(body));
  };
  await bad(ann, { action: "nope" }, 400, "Unknown action");
  await bad(ann, { action: ["remove"], reason: "not_buyer" }, 400, "Unknown action");
  await bad(ann, {}, 400, "Unknown action");
  await bad(ann, { action: "remove", reason: "counted_twice" }, 400, { reason: "Choose a reason" });
  await bad(ann, { action: "remove", reason: "other", note: "  " }, 400, { note: "Add a note for Other" });
  await bad(ann, { action: "remove", reason: "not_buyer", note: "x".repeat(201) }, 400, { note: "Use 200 characters or fewer" });
  await bad(ann, { action: "remove", reason: "not_buyer", note: 7 }, 400, { note: "Use 200 characters or fewer" });
  for (const same_as of [other, undefined, 9999, "x"])
    await bad(ann, { action: "join", same_as }, 400, { same_as: "Choose who they are" });
  await bad(ann, { action: "join", same_as: ann2 }, 400, "They already count as one person.");
  await bad(ann, { action: "join", same_as: ann }, 400, "They already count as one person.");
  await bad(general, { action: "remove", reason: "not_buyer" }, 400, "This viewing isn't for a listing.");
  await bad(9999, { action: "restore" }, 404, "Viewing not found");
  await bad(ann, { action: "restore" }, 401, "Please sign in to continue", { cookie: undefined });
  await bad(ann, { action: "restore" }, 403, "Cross-origin request blocked", { origin: "https://evil.example" });
  assert.equal(env.DB.raw.prepare(`SELECT COUNT(*) n FROM viewing_requests WHERE interest_removed_at IS NOT NULL
    OR interest_same_as IS NOT NULL`).get().n, 0, "nothing changed");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events").get().n, 0);
});

test("the card's rows and the corrections read through the listing index", async t => {
  const env = await world(t);
  const ann = seedViewing(env, { email: "ann@x.je" }), bo = seedViewing(env, { email: "bo@x.je", date: day(2) });
  const rows = captured(env, /AS own/), updates = captured(env, /UPDATE viewing_requests SET interest_/);
  await card(env);
  await correct(env, ann, { action: "remove", reason: "not_buyer" });
  await correct(env, bo, { action: "join", same_as: ann });
  assert.deepEqual([rows.length, updates.length], [1, 2]);
  for (const q of [...rows, ...updates]) {
    const p = plan(env, q);
    assert.match(p, /SEARCH viewing_requests USING INDEX viewing_listing \(listing_id=\?/, p);
    assert.doesNotMatch(p, /SCAN viewing_requests/, p);
  }
});
