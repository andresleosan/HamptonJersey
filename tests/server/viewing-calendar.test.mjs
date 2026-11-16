// VIS-12: a confirmed viewing in its negotiator's Google Calendar (one event per viewing, moved and cancelled in place)
// and, behind its own switch, the applicant's invitation. A fake Google stands in for the real one; synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { plusDays, addMinutes } from "../../server/viewings.js";
import { fakeGoogle, API } from "./google-calendar-fake.mjs";
import { sealToken, syncViewingCalendar, calendarRetryTick, viewingEvent } from "../../server/viewing-calendar.js";
import { eventIdFor } from "../../server/calendar-google.js";

// Wednesday 28 October 2026, 12:05 in Jersey (GMT, the same as UTC).
const NOW = Date.parse("2026-10-28T12:05:00.000Z"), TODAY = "2026-10-28", ID = "HE-R001";
const day = n => plusDays(TODAY, n);
const NOTE = "Call before FIXTURE-PRIVATE-NOTE", KEYS = "Key safe FIXTURE-KEYS", ACCESS = "Gate code FIXTURE-ACCESS";
export const TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");

async function world(t, { ready = true, invites = false, connect = true, schema } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv(schema);
  Object.assign(env, { GOOGLE_CALENDAR_CLIENT_ID: "client.apps.googleusercontent.com", GOOGLE_CALENDAR_CLIENT_SECRET: "FIXTURE-CLIENT-SECRET",
    GOOGLE_CALENDAR_TOKEN_KEY: TOKEN_KEY, SITE_URL: "https://hampton.test" });
  if (ready) env.VIS12_CALENDAR_READY = "1";
  if (invites) env.VIS12_CALENDAR_INVITES_READY = "1";
  seedListing(env, { road_name: "La Rue du Bocage", parish: "St Saviour" });
  if (schema?.through == null || schema.through >= 66) {
    env.DB.raw.prepare(`INSERT INTO listing_viewing_rules (listing_id, notice_hours, keys, access_note, updated_at, updated_by)
      VALUES (?, 0, ?, ?, ?, 'fixture')`).run(ID, KEYS, ACCESS, T0);
  }
  env.DB.raw.prepare("INSERT INTO listing_details (listing_id, building_name_or_number, postcode) VALUES (?, 'Le Bernage', 'JE2 7XX')").run(ID);
  if (connect && (schema?.through == null || schema.through >= 105)) await connectNegotiator(env, 1);
  const google = fakeGoogle();
  globalThis.fetch = google.fetch;
  return { env, google, cookie: await adminCookie() };
}
export async function connectNegotiator(env, negotiatorId, calendarId = "primary") {
  env.DB.raw.prepare(`INSERT INTO calendar_connections (negotiator_id, calendar_id, state, refresh_token_enc, scopes,
    connected_at, connected_by) VALUES (?, ?, 'active', ?, 'x', ?, 'admin@example.test')`)
    .run(negotiatorId, calendarId, await sealToken(env, negotiatorId, "1//FIXTURE-REFRESH"), T0);
}
const seedViewing = (env, o = {}) => {
  const v = { listing_id: ID, listing_title_snapshot: "Le Bernage", negotiator_id: 1, agent: "Gilberto Franco", kind: "In person",
    date: day(1), time: "10:00", name: "Sam Buyer", email: "sam@example.je", phone: "07700 900123", notes: NOTE,
    status: "requested", created_at: T0, ...o };
  v.end_time ??= addMinutes(v.time, 30);
  const cols = Object.keys(v);
  return Number(env.DB.raw.prepare(`INSERT INTO viewing_requests (${cols}) VALUES (${cols.map(() => "?")})`)
    .run(...Object.values(v)).lastInsertRowid);
};
const row = (env, id) => env.DB.raw.prepare("SELECT * FROM viewing_requests WHERE id = ?").get(id);
const link = (env, id) => env.DB.raw.prepare("SELECT * FROM calendar_event_links WHERE viewing_id = ?").get(id);
const act = (env, cookie, id, action, more = {}) => call(env, "PUT", `/admin/viewings/${id}`, { cookie,
  body: { action, updated_at: row(env, id).updated_at, ...more } });
const writesTo = (google, method) => google.writes().filter(c => c.method === method);

test("switched off, confirming, moving, cancelling and booking write exactly what they wrote before, and call nobody", async t => {
  const run = async (opts) => {
    const { env, google, cookie } = await world(t, opts);
    const a = seedViewing(env), b = seedViewing(env, { time: "12:00" });
    const results = [await act(env, cookie, a, "confirm"), await act(env, cookie, a, "reschedule", { negotiator_id: 1, date: day(2), time: "11:00" }),
      await act(env, cookie, b, "cancel"), await call(env, "POST", "/admin/viewings", { cookie, body: { listing_id: ID, negotiator_id: 1,
        kind: "In person", date: day(1), time: "15:00", name: "Jo Renter", email: "jo@example.je" } }),
      await call(env, "DELETE", `/admin/viewings/${b}`, { cookie })].map(r => [r.status, r.data]);
    const dump = ["viewing_requests", "events", "notifications"].map(tb => env.DB.raw.prepare(`SELECT * FROM ${tb} ORDER BY 1`).all());
    t.mock.timers.reset();
    return { results, dump, google, env };
  };
  const before = await run({ ready: false, schema: { through: 104 } });
  const off = await run({ ready: false, invites: true });
  assert.deepEqual(off.results, before.results);
  assert.deepEqual(off.dump, before.dump, "the same rows as a database without migration 0105");
  assert.equal(off.google.calls.length, 0, "no Google call at all");
  assert.equal(off.env.DB.raw.prepare("SELECT COUNT(*) n FROM calendar_event_links").get().n, 0);
  const early = await run({ ready: true, schema: { through: 104 } });
  assert.deepEqual(early.results, before.results, "switched on before migration 0105: as before");
  assert.equal(early.google.calls.length, 0);
});

test("confirming writes one event in the negotiator's calendar: the house, its address and the time, nothing private", async t => {
  const { env, google, cookie } = await world(t);
  const id = seedViewing(env);
  assert.equal((await act(env, cookie, id, "confirm")).status, 200);
  const ev = google.events.get(await eventIdFor(id));
  assert.ok(ev, "the event has the viewing's deterministic id");
  assert.match(await eventIdFor(id), /^[0-9a-f]{64}$/);
  assert.equal(ev.summary, "Viewing: Le Bernage");
  assert.equal(ev.location, "Le Bernage, La Rue du Bocage, St Saviour, JE2 7XX, Jersey");
  assert.deepEqual([ev.start, ev.end], [{ dateTime: `${day(1)}T10:00:00Z`, timeZone: "Europe/Jersey" },
    { dateTime: `${day(1)}T10:30:00Z`, timeZone: "Europe/Jersey" }]);
  assert.equal(ev.attendees, undefined, "no invitation while its own switch is off");
  assert.match(writesTo(google, "POST")[0].url, /sendUpdates=none/);
  for (const secret of [NOTE, KEYS, ACCESS, "Sam Buyer", "sam@example.je", "07700"])
    assert.ok(!google.sent().includes(secret.split(" ").at(-1)), `no_private_notes_in_event: ${secret}`);
  const l = link(env, id);
  assert.deepEqual([l.state, l.external_id, l.wanted, l.invited, l.starts_utc], ["synced", await eventIdFor(id), "confirmed", 0, `${day(1)}T10:00:00.000Z`]);
  assert.ok(!JSON.stringify(l).includes("FIXTURE-REFRESH") && !JSON.stringify(l).includes("ya29"));
});

test("retries and a second confirmation never make a second event; a lost answer is found again by its id", async t => {
  const { env, google, cookie } = await world(t);
  const id = seedViewing(env);
  google.loseInsertAnswer = true; // Google wrote the event, its answer never arrived
  await act(env, cookie, id, "confirm");
  assert.equal(link(env, id).state, "unknown");
  assert.equal(google.events.size, 1);
  assert.equal((await call(env, "POST", `/admin/calendar/viewings/${id}/sync`, { cookie })).data.state, "synced");
  await syncViewingCalendar(env, id);
  await syncViewingCalendar(env, id);
  assert.equal(google.events.size, 1, "lost_insert_response_lookup_same_id");
  assert.equal(writesTo(google, "PUT").length, 0, "the same event unchanged is not written (nor re-sent) again");
  assert.equal((await act(env, cookie, id, "confirm")).status, 409, "a second confirmation is refused by the viewing itself");
  assert.equal(google.events.size, 1);
});

test("moving updates the same event; cancelling cancels it; a cancelled viewing is never recreated", async t => {
  const { env, google, cookie } = await world(t);
  const id = seedViewing(env), eid = await eventIdFor(id);
  await act(env, cookie, id, "confirm");
  assert.equal((await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(2), time: "11:00" })).status, 200);
  assert.equal(google.events.size, 1);
  assert.equal(google.events.get(eid).start.dateTime, `${day(2)}T11:00:00Z`);
  assert.equal(link(env, id).state, "synced");
  assert.equal((await act(env, cookie, id, "cancel")).status, 200);
  assert.equal(google.events.get(eid).status, "cancelled");
  assert.equal(link(env, id).wanted, "cancelled");
  await syncViewingCalendar(env, id); // a late retry
  assert.equal(google.events.get(eid).status, "cancelled", "cancelled_no_recreate");
  assert.equal(google.events.size, 1);
  // A request cancelled before it was ever confirmed has no event to cancel.
  const other = seedViewing(env, { time: "14:00" });
  await act(env, cookie, other, "cancel");
  assert.equal(link(env, other), undefined);
  assert.equal(google.events.size, 1);
});

test("moving a viewing to another negotiator cancels it in the first calendar and writes it in the second", async t => {
  const { env, google, cookie } = await world(t);
  env.DB.raw.prepare(`INSERT INTO negotiators (id, name, hours, created_at, updated_at) SELECT 3, 'Ana Le Sueur', hours, ?, ? FROM negotiators WHERE id = 1`).run(T0, T0);
  await connectNegotiator(env, 3, "ana@example.test");
  const id = seedViewing(env);
  await act(env, cookie, id, "confirm");
  const first = google.events.get(await eventIdFor(id)).etag;
  assert.equal((await act(env, cookie, id, "reschedule", { negotiator_id: 3, date: day(1), time: "11:00" })).status, 200);
  const calls = google.writes().map(c => [c.method, c.body.status]);
  assert.deepEqual(calls.slice(1), [["PUT", "cancelled"], ["POST", "confirmed"]], `the first is cancelled, then written anew (was ${first})`);
  assert.deepEqual([link(env, id).negotiator_id, link(env, id).state], [3, "synced"]);
});

test("a result that arrives after a newer change, or after the calendar is disconnected, is not recorded", async t => {
  const { env, google, cookie } = await world(t);
  const id = seedViewing(env);
  const fetch = google.fetch;
  google.fetch = async (u, init) => {
    if (init?.method === "POST" && String(u).startsWith(API + "/calendars"))
      env.DB.raw.prepare("UPDATE calendar_event_links SET op = 'newer' WHERE viewing_id = ?").run(id);
    return fetch(u, init);
  };
  globalThis.fetch = google.fetch;
  await act(env, cookie, id, "confirm");
  assert.deepEqual([link(env, id).op, link(env, id).state], ["newer", "pending"], "stale_callback_denied");
  google.fetch = async (u, init) => {
    if (init?.method === "PUT") env.DB.raw.prepare("UPDATE calendar_connections SET state = 'revoked', refresh_token_enc = NULL, revoked_at = ?, revoked_by = 'x'").run(T0);
    return fetch(u, init);
  };
  globalThis.fetch = google.fetch;
  await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(2), time: "11:00" });
  assert.notEqual(link(env, id).state, "synced", "revoke during the write: no commit");
});

test("disconnected, nothing is sent and the viewing's calendar stays pending", async t => {
  const { env, google, cookie } = await world(t);
  env.DB.raw.prepare("UPDATE calendar_connections SET state = 'revoked', refresh_token_enc = NULL, revoked_at = ?, revoked_by = 'x'").run(T0);
  const id = seedViewing(env);
  assert.equal((await act(env, cookie, id, "confirm")).status, 200, "the viewing is confirmed in Hampton all the same");
  assert.equal(google.calls.length, 0, "revoke_stops_dispatch");
  assert.equal(link(env, id).state, "pending", "disconnect_pending");
  // A negotiator who never connected a calendar keeps Hampton's own calendar only: no row, no call.
  env.DB.raw.prepare("DELETE FROM calendar_connections").run();
  const other = seedViewing(env, { time: "14:00" });
  await act(env, cookie, other, "confirm");
  assert.equal(link(env, other), undefined);
  assert.equal(google.calls.length, 0);
});

test("with the invitation switch on, the applicant alone is invited, once; later changes reach them", async t => {
  const { env, google, cookie } = await world(t, { invites: true });
  const id = seedViewing(env);
  await act(env, cookie, id, "confirm");
  const ev = google.events.get(await eventIdFor(id));
  assert.deepEqual(ev.attendees, [{ email: "sam@example.je" }], "invited_client_only");
  assert.equal(ev.guestsCanSeeOtherGuests, false);
  assert.match(writesTo(google, "POST")[0].url, /sendUpdates=all/);
  assert.equal(link(env, id).invited, 1);
  await syncViewingCalendar(env, id);
  assert.equal(google.writes().length, 1, "one_invitation_channel: a retry sends nothing again");
  await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(2), time: "11:00" });
  assert.match(writesTo(google, "PUT")[0].url, /sendUpdates=all/);
  // A viewing with a phone and no email: no attendee, nothing sent to anyone.
  const phoneOnly = seedViewing(env, { time: "14:00", email: null });
  await act(env, cookie, phoneOnly, "confirm");
  assert.equal(google.events.get(await eventIdFor(phoneOnly)).attendees, undefined);
});

test("a time changed in Google, or an event changed meanwhile (412), goes to review and is never overwritten", async t => {
  const { env, google, cookie } = await world(t);
  const id = seedViewing(env), eid = await eventIdFor(id);
  await act(env, cookie, id, "confirm");
  google.moveInGoogle(eid, `${day(1)}T15:00:00Z`, `${day(1)}T15:30:00Z`);
  await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: day(2), time: "11:00" });
  assert.equal(link(env, id).state, "conflict", "external_change_new_proposal: staff decide");
  assert.equal(google.events.get(eid).start.dateTime, `${day(1)}T15:00:00Z`, "Google's time is left as it is");
  assert.equal(row(env, id).date, day(2), "Hampton's time is not changed from Google either");

  const other = seedViewing(env, { time: "14:00" });
  await act(env, cookie, other, "confirm");
  const realFetch = google.fetch;
  globalThis.fetch = async (u, init) => {
    if (init?.method === "PUT") google.moveInGoogle(await eventIdFor(other), `${day(1)}T14:00:00Z`, `${day(1)}T14:30:00Z`);
    return realFetch(u, init);
  };
  await act(env, cookie, other, "reschedule", { negotiator_id: 1, date: day(2), time: "15:00" });
  assert.equal(link(env, other).state, "conflict", "412_review");
});

test("deleting a viewing cancels its event; the link that is left holds no personal data", async t => {
  const { env, google, cookie } = await world(t, { invites: true });
  const id = seedViewing(env);
  await act(env, cookie, id, "confirm");
  assert.equal((await call(env, "DELETE", `/admin/viewings/${id}`, { cookie })).status, 200);
  assert.equal(google.events.get(await eventIdFor(id)).status, "cancelled");
  const l = link(env, id);
  assert.equal(l.state, "synced");
  assert.ok(!/sam|Buyer|07700|Bernage/.test(JSON.stringify(l)));
});

test("a summer viewing is written at its British Summer Time instant", () => {
  const ev = viewingEvent({ id: 9, listing_id: ID, title: "Le Bernage", date: "2026-10-21", time: "12:00", end_time: "12:30",
    kind: "In person", notes: NOTE, name: "Sam", email: "sam@example.je" }, { invite: false });
  assert.deepEqual([ev.start.dateTime, ev.end.dateTime], ["2026-10-21T11:00:00Z", "2026-10-21T11:30:00Z"], "dst_utc_offsets");
  assert.ok(!JSON.stringify(ev).includes("FIXTURE"));
});

test("the retry pass writes what Google could not take before", async t => {
  const { env, google, cookie } = await world(t);
  const id = seedViewing(env);
  google.fail.insert = 503;
  await act(env, cookie, id, "confirm");
  assert.equal(link(env, id).state, "unknown");
  delete google.fail.insert;
  assert.deepEqual(await calendarRetryTick(env, { limit: 50 }), { tried: 1 });
  assert.equal(link(env, id).state, "synced");
  assert.equal(google.events.size, 1);
});
