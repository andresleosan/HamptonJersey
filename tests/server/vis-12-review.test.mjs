// VIS-12 security review (16-nov): which Google account is connected (M1), revoking the access Hampton no longer uses
// (M2), open viewings checked against Google (M4), stale rows that must not block the clock (M5), invitations off means
// no attendee (M6) and Google endpoints that cannot be pointed elsewhere (M8). A fake Google; synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, ORIGIN, T0 } from "./helpers.mjs";
import { handleApi } from "../../server/api.js";
import worker from "../../server/jobs.js";
import { fakeGoogle, REVOKE_URL } from "./google-calendar-fake.mjs";
import { sealToken, calendarConfigured, syncViewingCalendar } from "../../server/calendar-sync.js";
import { eventIdFor } from "../../server/calendar-google.js";

// Tuesday 20 October 2026, 13:05 in Jersey (BST, UTC+1).
const NOW = Date.parse("2026-10-20T12:05:00.000Z"), WED = "2026-10-21", THU = "2026-10-22", ID = "HE-R001";
const TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");

async function world(t, { groups = false, invites = false, connect = true } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv();
  Object.assign(env, { VIS12_CALENDAR_READY: "1", GOOGLE_CALENDAR_CLIENT_ID: "client.apps.googleusercontent.com",
    GOOGLE_CALENDAR_CLIENT_SECRET: "FIXTURE-CLIENT-SECRET", GOOGLE_CALENDAR_TOKEN_KEY: TOKEN_KEY, SITE_URL: "https://www.hampton.test" });
  if (groups) env.VIS14_BLOCK_READY = "1";
  if (invites) env.VIS12_CALENDAR_INVITES_READY = "1";
  seedListing(env);
  if (connect) for (const [id, cal] of [[1, "primary"], [2, "two@example.test"]])
    env.DB.raw.prepare(`INSERT INTO calendar_connections (negotiator_id, calendar_id, state, refresh_token_enc, scopes,
      connected_at, connected_by) VALUES (?, ?, 'active', ?, 'x', ?, 'admin@example.test')`).run(id, cal, await sealToken(env, id, "1//FIXTURE-REFRESH"), T0);
  const google = fakeGoogle();
  globalThis.fetch = google.fetch;
  return { env, google, cookie: await adminCookie() };
}
let n = 0;
const seedViewing = (env, o = {}) => {
  n += 1;
  const v = { listing_id: ID, listing_ref: ID, agent: "Gilberto Franco", negotiator_id: 1, kind: "In person", date: THU,
    time: `${10 + (n % 6)}:00`, name: `Person ${n}`, email: `person${n}@example.je`, status: "requested", created_at: T0, ...o };
  v.end_time ??= `${v.time.slice(0, 3)}30`;
  const cols = Object.keys(v);
  return Number(env.DB.raw.prepare(`INSERT INTO viewing_requests (${cols}) VALUES (${cols.map(() => "?")})`)
    .run(...Object.values(v)).lastInsertRowid);
};
const row = (env, id) => env.DB.raw.prepare("SELECT * FROM viewing_requests WHERE id = ?").get(id);
const link = (env, id) => env.DB.raw.prepare("SELECT * FROM calendar_event_links WHERE viewing_id = ?").get(id);
const conn = (env, id = 1) => env.DB.raw.prepare("SELECT * FROM calendar_connections WHERE negotiator_id = ?").get(id);
const ref = (env, id) => ({ id, updated_at: row(env, id).updated_at });
const act = (env, cookie, id, action, more = {}) => call(env, "PUT", `/admin/viewings/${id}`, { cookie,
  body: { action, updated_at: row(env, id).updated_at, ...more } });
const start = (env, cookie, negotiator_id = 1) => call(env, "POST", "/admin/calendar/google/start", { cookie, body: { negotiator_id } });
async function connectVia(env, cookie) {
  const r = await start(env, cookie), state = new URL(r.data.url).searchParams.get("state");
  const headers = new Headers({ cookie: r.headers.get("set-cookie").split(";")[0] });
  const req = new Request(`${ORIGIN}/api/calendar/google/callback?${new URLSearchParams({ code: "4/FIXTURE-CODE", state })}`, { headers });
  const pending = [], res = await handleApi(req, env, ["calendar", "google", "callback"], p => pending.push(p));
  await Promise.all(pending);
  return res.headers.get("location");
}
const revoked = google => google.calls.filter(c => c.url.startsWith(REVOKE_URL)).map(c => c.body.token);

test("M1: the Google account connected is kept and shown, never the token; no account in Google's answer, no connection", async t => {
  const { env, google, cookie } = await world(t, { connect: false });
  google.account = { email: "gilberto@hamptonestates.je", email_verified: true };
  assert.match(await connectVia(env, cookie), /calendar=connected/);
  assert.equal(conn(env).google_email, "gilberto@hamptonestates.je");
  const s = await call(env, "GET", "/admin/calendar/google", { cookie });
  assert.equal(s.data.connections[0].google_email, "gilberto@hamptonestates.je");
  assert.ok(!s.text.includes("FIXTURE-REFRESH"));
  google.account = null; // an answer with no ID token
  assert.match(await connectVia(env, cookie), /calendar=failed/);
  google.account = { email: "someone@example.test", email_verified: false };
  assert.match(await connectVia(env, cookie), /calendar=failed/, "an unverified address is not taken");
  assert.equal(conn(env).google_email, "gilberto@hamptonestates.je", "the earlier connection stays");
});

test("M2: reconnecting revokes the previous token at Google; if Google cannot be told, the panel says so", async t => {
  const { env, google, cookie } = await world(t, { connect: false });
  await connectVia(env, cookie);
  assert.deepEqual(revoked(google), []);
  assert.match(await connectVia(env, cookie), /calendar=connected$|calendar=connected#/);
  assert.deepEqual(revoked(google), ["1//FIXTURE-REFRESH"], "the first token is revoked once the second is kept");
  google.fail.revoke = 503;
  assert.match(await connectVia(env, cookie), /calendar=connected_revoke_failed/);
  assert.equal(conn(env).state, "active");
});

test("M2: disconnecting tells the panel whether Google revoked the token, also when the key no longer opens it", async t => {
  const { env, google, cookie } = await world(t);
  const d = await call(env, "POST", "/admin/calendar/google/disconnect", { cookie, body: { negotiator_id: 1 } });
  assert.deepEqual([d.status, d.data.revoked], [200, true]);
  env.GOOGLE_CALENDAR_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64"); // a key changed since negotiator 2 connected
  const e = await call(env, "POST", "/admin/calendar/google/disconnect", { cookie, body: { negotiator_id: 2 } });
  assert.deepEqual([e.status, e.data.revoked], [200, false]);
  assert.deepEqual([conn(env, 2).state, conn(env, 2).refresh_token_enc], ["revoked", null], "disconnected all the same");
  assert.deepEqual(revoked(google), ["1//FIXTURE-REFRESH"]);
});

test("M4: an open viewing is not created at a time busy in the negotiator's Google Calendar", async t => {
  const { env, google, cookie } = await world(t, { groups: true });
  const a = seedViewing(env);
  google.busy = [{ start: `${WED}T13:45:00Z`, end: `${WED}T14:15:00Z` }];
  const r = await call(env, "POST", "/admin/viewing-groups", { cookie, body: { listing_id: ID, negotiator_id: 2, date: WED,
    time: "15:00", capacity: 4, viewings: [ref(env, a)] } });
  assert.deepEqual([r.status, r.data.code], [409, "calendar_busy"]);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM viewing_groups").get().n, 0);
  google.busy = [];
  google.fail.freebusy = 503;
  const body = { listing_id: ID, negotiator_id: 2, date: WED, time: "15:00", capacity: 4, viewings: [ref(env, a)] };
  assert.equal((await call(env, "POST", "/admin/viewing-groups", { cookie, body })).data.code, "calendar_unchecked");
  const ok = await call(env, "POST", "/admin/viewing-groups", { cookie, body: { ...body,
    calendar_reviewed: { negotiator_id: 2, date: WED, time: "15:00" } } });
  assert.equal(ok.status, 201);
});

test("M4: a confirmed viewing is not moved into an open viewing at a time busy in Google; the group's own events need staff's check", async t => {
  const { env, google, cookie } = await world(t, { groups: true });
  const first = seedViewing(env), second = seedViewing(env), request = seedViewing(env);
  for (const id of [first, second]) await act(env, cookie, id, "confirm");
  const g = await call(env, "POST", "/admin/viewing-groups", { cookie, body: { listing_id: ID, negotiator_id: 2, date: WED,
    time: "15:00", capacity: 4, viewings: [ref(env, request)] } });
  assert.equal(g.status, 201);
  const place = (id, more = {}) => call(env, "POST", `/admin/viewing-groups/${g.data.id}/places`, { cookie, body: { viewings: [ref(env, id)], ...more } });
  google.busy = [{ start: `${WED}T14:00:00Z`, end: `${WED}T14:30:00Z` }]; // someone else's appointment
  const busy = await place(first);
  assert.deepEqual([busy.status, busy.data.code], [409, "calendar_busy"]);
  assert.equal(row(env, first).date, THU, "not moved");
  google.busy = [];
  assert.equal((await place(first)).status, 200);
  assert.equal(link(env, first).state, "synced");
  // Now Google shows the group's time busy: it may be only the group's own event, or that and something else.
  google.busy = [{ start: `${WED}T14:00:00Z`, end: `${WED}T14:30:00Z` }];
  const self = await place(second);
  assert.deepEqual([self.status, self.data.code], [409, "calendar_self_overlap"]);
  const checked = await place(second, { calendar_reviewed: { negotiator_id: 2, date: WED, time: "15:00" } });
  assert.equal(checked.status, 200);
  assert.equal(row(env, second).date, WED);
});

test("M5: a row a completed or no-show viewing left pending is written by the clock, not left at the head of its queue", async t => {
  const { env, google, cookie } = await world(t);
  const done = seedViewing(env), gone = seedViewing(env);
  google.fail.insert = 503;
  for (const id of [done, gone]) await act(env, cookie, id, "confirm");
  delete google.fail.insert;
  env.DB.raw.prepare("UPDATE viewing_requests SET status = 'completed', updated_at = ? WHERE id = ?").run(T0, done);
  env.DB.raw.prepare("UPDATE viewing_requests SET status = 'no_show', updated_at = ? WHERE id = ?").run(T0, gone);
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: NOW }, env, { waitUntil() {} });
  assert.deepEqual([link(env, done).state, link(env, gone).state], ["synced", "synced"]);
  assert.equal(google.events.size, 2, "the appointment that took place stays in the calendar");
});

test("M6: switching invitations off takes the applicant off the event at its next change, telling nobody", async t => {
  const { env, google, cookie } = await world(t, { invites: true });
  const id = seedViewing(env);
  await act(env, cookie, id, "confirm");
  assert.deepEqual(google.events.get(await eventIdFor(id)).attendees, [{ email: row(env, id).email }]);
  delete env.VIS12_CALENDAR_INVITES_READY;
  await act(env, cookie, id, "reschedule", { negotiator_id: 1, date: WED, time: "11:00" });
  const ev = google.events.get(await eventIdFor(id));
  assert.equal(ev.attendees, undefined);
  assert.match(google.writes().at(-1).url, /sendUpdates=none/);
  assert.equal(link(env, id).invited, 0);
});

test("M8: Google's addresses can only be Google's over https (or a local fake); anything else leaves the calendar unset", async t => {
  const { env, google } = await world(t);
  assert.equal(calendarConfigured(env), true);
  for (const [key, value] of [["GOOGLE_OAUTH_URL", "https://evil.example"], ["GOOGLE_CALENDAR_API", "http://www.googleapis.com/calendar/v3"],
    ["GOOGLE_CALENDAR_API", "https://googleapis.com.evil.example/calendar/v3"], ["GOOGLE_OAUTH_URL", "https://user@evil.example"]]) {
    const bad = { ...env, [key]: value };
    assert.equal(calendarConfigured(bad), false, `${key}=${value}`);
    const id = seedViewing(env, { status: "confirmed" });
    assert.equal((await syncViewingCalendar(bad, id)).state, "unknown");
  }
  assert.ok(google.calls.every(c => /^https:\/\/(oauth2|www)\.googleapis\.com\//.test(c.url)), "nothing left for another host");
  for (const ok of ["https://oauth2.googleapis.com", "http://localhost:8797", "http://127.0.0.1:8797"])
    assert.equal(calendarConfigured({ ...env, GOOGLE_OAUTH_URL: ok }), true, ok);
});
