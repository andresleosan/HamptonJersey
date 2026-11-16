// VIS-12: the negotiator's busy times in Google, read before a viewing is confirmed, booked or moved. Only the intervals
// are read and none is stored. A fake Google stands in for the real one; synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { plusDays, addMinutes } from "../../server/viewings.js";
import { fakeGoogle } from "./google-calendar-fake.mjs";
import { sealToken } from "../../server/viewing-calendar.js";
import { getBusy } from "../../server/calendar-google.js";

const NOW = Date.parse("2026-10-28T12:05:00.000Z"), TODAY = "2026-10-28", ID = "HE-R001";
const day = n => plusDays(TODAY, n);
const TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");

async function world(t, { connect = true } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv();
  Object.assign(env, { VIS12_CALENDAR_READY: "1", GOOGLE_CALENDAR_CLIENT_ID: "client.apps.googleusercontent.com",
    GOOGLE_CALENDAR_CLIENT_SECRET: "FIXTURE-CLIENT-SECRET", GOOGLE_CALENDAR_TOKEN_KEY: TOKEN_KEY, SITE_URL: "https://hampton.test" });
  seedListing(env);
  if (connect) env.DB.raw.prepare(`INSERT INTO calendar_connections (negotiator_id, calendar_id, state, refresh_token_enc, scopes,
    connected_at, connected_by) VALUES (1, 'primary', 'active', ?, 'x', ?, 'admin@example.test')`)
    .run(await sealToken(env, 1, "1//FIXTURE-REFRESH"), T0);
  const google = fakeGoogle();
  globalThis.fetch = google.fetch;
  return { env, google, cookie: await adminCookie() };
}
const seedViewing = (env, o = {}) => {
  const v = { listing_id: ID, negotiator_id: 1, agent: "Gilberto Franco", kind: "In person", date: day(1), time: "10:00",
    name: "Sam Buyer", email: "sam@example.je", status: "requested", created_at: T0, ...o };
  v.end_time ??= addMinutes(v.time, 30);
  const cols = Object.keys(v);
  return Number(env.DB.raw.prepare(`INSERT INTO viewing_requests (${cols}) VALUES (${cols.map(() => "?")})`)
    .run(...Object.values(v)).lastInsertRowid);
};
const row = (env, id) => env.DB.raw.prepare("SELECT * FROM viewing_requests WHERE id = ?").get(id);
const act = (env, cookie, id, action, more = {}) => call(env, "PUT", `/admin/viewings/${id}`, { cookie,
  body: { action, updated_at: row(env, id).updated_at, ...more } });
const book = (env, cookie, o = {}) => call(env, "POST", "/admin/viewings", { cookie, body: { listing_id: ID, negotiator_id: 1,
  kind: "In person", date: day(1), time: "15:00", name: "Jo Renter", email: "jo@example.je", ...o } });
// M7: staff's own check names the negotiator, day and time it was made for; it answers for that slot only.
const checked = (date, time, negotiator_id = 1) => ({ calendar_reviewed: { negotiator_id, date, time } });
const lastEventData = env => JSON.parse(env.DB.raw.prepare("SELECT data FROM events ORDER BY id DESC LIMIT 1").get().data ?? "null");

test("a time busy in the negotiator's Google Calendar cannot be confirmed, booked or moved to", async t => {
  const { env, google, cookie } = await world(t);
  google.busy = [{ start: `${day(1)}T09:45:00Z`, end: `${day(1)}T10:15:00Z` }, { start: `${day(1)}T15:00:00Z`, end: `${day(1)}T16:00:00Z` }];
  const id = seedViewing(env);
  const r = await act(env, cookie, id, "confirm");
  assert.deepEqual([r.status, r.data.code], [409, "calendar_busy"], "busy_slot_denied");
  assert.equal(row(env, id).status, "requested");
  assert.equal((await act(env, cookie, id, "confirm", checked(day(1), "10:00"))).status, 409, "a busy time is not overridden");
  assert.equal((await book(env, cookie)).data.code, "calendar_busy");
  const free = seedViewing(env, { time: "12:00" });
  assert.equal((await act(env, cookie, free, "confirm")).status, 200);
  const moved = await act(env, cookie, free, "reschedule", { negotiator_id: 1, date: day(1), time: "15:30" });
  assert.equal(moved.data.code, "calendar_busy");
  const fb = google.calls.find(c => c.url.endsWith("/freeBusy"));
  assert.deepEqual(fb.body, { timeMin: `${day(1)}T10:00:00.000Z`, timeMax: `${day(1)}T10:30:00.000Z`, items: [{ id: "primary" }] });
  assert.ok(!google.sent().includes("Sam"), "freeBusy is sent the times only");
});

test("when Google cannot be checked the viewing stays pending, unless staff checked the calendar themselves", async t => {
  const { env, google, cookie } = await world(t);
  const id = seedViewing(env);
  for (const failure of [503, "throw"]) {
    google.fail.freebusy = failure;
    const r = await act(env, cookie, id, "confirm");
    assert.deepEqual([r.status, r.data.code], [409, "calendar_unchecked"], `freebusy_timeout_pending (${failure})`);
    assert.equal(row(env, id).status, "requested");
  }
  for (const wrong of [{ calendar_reviewed: true }, checked(day(1), "10:30"), checked(day(2), "10:00"), checked(day(1), "10:00", 2)])
    assert.equal((await act(env, cookie, id, "confirm", wrong)).data.code, "calendar_unchecked", `M7: evidence for another slot (${JSON.stringify(wrong)})`);
  assert.equal((await act(env, cookie, id, "confirm", checked(day(1), "10:00"))).status, 200);
  assert.equal(lastEventData(env).calendar_reviewed, true, "staff's check is kept with the confirmation");
});

test("M10: a viewing whose end is not after its start is 'could not check', never a server error", async t => {
  const { env, cookie } = await world(t);
  const id = seedViewing(env, { time: "10:00", end_time: "10:00" });
  const r = await act(env, cookie, id, "confirm");
  assert.deepEqual([r.status, r.data.code], [409, "calendar_unchecked"]);
});

test("getBusy gives up after 10 seconds, refuses more than 14 days and never treats more than 100 intervals as free", async t => {
  const google = fakeGoogle(), conn = { fetch: google.fetch, token: "ya29.FIXTURE-ACCESS", calendarId: "primary" };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  google.fail.freebusy = "hang";
  const pending = getBusy(conn, { from: "2026-10-29T10:00:00.000Z", to: "2026-10-29T10:30:00.000Z" });
  t.mock.timers.tick(10000);
  assert.equal((await pending).state, "unknown");
  t.mock.timers.reset();
  delete google.fail.freebusy;
  await assert.rejects(getBusy(conn, { from: "2026-10-01T00:00:00.000Z", to: "2026-10-15T00:00:01.000Z" }), /14 days/);
  google.busy = Array.from({ length: 101 }, (_, i) => ({ start: `2026-10-29T${String(i % 24).padStart(2, "0")}:00:00Z`,
    end: `2026-10-29T${String(i % 24).padStart(2, "0")}:01:00Z` }));
  const many = await getBusy(conn, { from: "2026-10-29T00:00:00.000Z", to: "2026-10-30T00:00:00.000Z" });
  assert.deepEqual([many.state, many.intervals.length], ["incomplete", 0], ">100_incomplete_not_free");
  google.busy = [{ start: "2026-10-29T10:00:00Z", end: "2026-10-29T11:00:00Z", summary: "FIXTURE-TITLE" }];
  const one = await getBusy(conn, { from: "2026-10-29T00:00:00.000Z", to: "2026-10-30T00:00:00.000Z" });
  assert.deepEqual(one.intervals, [{ start: "2026-10-29T10:00:00Z", end: "2026-10-29T11:00:00Z" }], "no_title_persisted");
  assert.equal(one.state, "ok");
});

test("an incomplete answer blocks the promise of a free time", async t => {
  const { env, google, cookie } = await world(t);
  google.busy = Array.from({ length: 101 }, (_, i) => ({ start: `${day(1)}T16:${String(i % 30).padStart(2, "0")}:00Z`,
    end: `${day(1)}T16:${String(i % 30 + 1).padStart(2, "0")}:00Z` }));
  const id = seedViewing(env, { time: "16:00" });
  assert.equal((await act(env, cookie, id, "confirm")).data.code, "calendar_unchecked");
});

test("a summer viewing is checked at its British Summer Time instant", async t => {
  const { env, google, cookie } = await world(t);
  t.mock.timers.setTime(Date.parse("2026-10-20T08:00:00.000Z"));
  const id = seedViewing(env, { date: "2026-10-21", time: "12:00" });
  assert.equal((await act(env, cookie, id, "confirm")).status, 200);
  const fb = google.calls.find(c => c.url.endsWith("/freeBusy"));
  assert.deepEqual([fb.body.timeMin, fb.body.timeMax], ["2026-10-21T11:00:00.000Z", "2026-10-21T11:30:00.000Z"], "dst_utc_offsets");
});

test("moving onto the viewing's own event is never taken as free: staff confirm it hides nothing else", async t => {
  const { env, google, cookie } = await world(t);
  const id = seedViewing(env);
  await act(env, cookie, id, "confirm"); // its event is written (synced) at 10:00
  // freeBusy merges the viewing's own event with anything else at that time: it is never subtracted.
  google.busy = [{ start: `${day(1)}T10:00:00Z`, end: `${day(1)}T10:30:00Z` }];
  const r = await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(1), time: "10:00" });
  assert.deepEqual([r.status, r.data.code], [409, "calendar_self_overlap"], "self_event_merged_foreign_busy_never_subtracted");
  // The evidence is for this revision only: sent with an old updated_at it is refused as stale.
  const stale = await call(env, "PUT", `/admin/viewings/${id}`, { cookie, body: { action: "reschedule", updated_at: "2026-01-01T00:00:00.000Z",
    negotiator_id: 1, date: day(1), time: "10:00", ...checked(day(1), "10:00") } });
  assert.equal(stale.status, 409, "wrong_revision_evidence_denied");
  assert.equal((await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(1), time: "10:00", ...checked(day(1), "10:00") })).status, 200);
  // Busy beyond its own event is plain busy, evidence or not.
  google.busy = [{ start: `${day(1)}T10:00:00Z`, end: `${day(1)}T11:00:00Z` }];
  const later = await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(1), time: "10:30", ...checked(day(1), "10:30") });
  assert.equal(later.data.code, "calendar_busy");
});

test("M3: an event Google may not hold (its last write failed) is not counted as the viewing's own", async t => {
  const { env, google, cookie } = await world(t);
  const id = seedViewing(env);
  await act(env, cookie, id, "confirm"); // synced at 10:00
  google.fail.put = 503;
  await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(1), time: "11:00" }); // unknown: Google may hold either
  delete google.fail.put;
  assert.equal(env.DB.raw.prepare("SELECT state FROM calendar_event_links WHERE viewing_id = ?").get(id).state, "unknown");
  google.busy = [{ start: `${day(1)}T10:00:00Z`, end: `${day(1)}T10:30:00Z` }];
  const r = await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(1), time: "10:00", ...checked(day(1), "10:00") });
  assert.deepEqual([r.status, r.data.code], [409, "calendar_busy"]);
  assert.equal(row(env, id).time, "11:00");
});

test("a negotiator without a connected calendar books on Hampton's calendar alone, with no Google check", async t => {
  const { env, google, cookie } = await world(t, { connect: false });
  const id = seedViewing(env);
  assert.equal((await act(env, cookie, id, "confirm")).status, 200);
  assert.equal(google.calls.length, 0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM calendar_event_links").get().n, 0);
});
