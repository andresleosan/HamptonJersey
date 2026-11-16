// VIS-12: connecting a negotiator's Google Calendar (OAuth on the server, one-use state tied to the staff member's
// browser, fixed redirect) and disconnecting it. A fake Google stands in for the real one; synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, ORIGIN } from "./helpers.mjs";
import { handleApi } from "../../server/api.js";
import { fakeGoogle, TOKEN_URL, REVOKE_URL } from "./google-calendar-fake.mjs";
import { GOOGLE_SCOPES } from "../../server/calendar-google.js";

const NOW = Date.parse("2026-10-28T12:05:00.000Z"), TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");

async function world(t, { ready = true, schema, secrets = true } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = makeEnv(schema);
  env.SITE_URL = "https://www.hampton.test";
  if (secrets) Object.assign(env, { GOOGLE_CALENDAR_CLIENT_ID: "client.apps.googleusercontent.com",
    GOOGLE_CALENDAR_CLIENT_SECRET: "FIXTURE-CLIENT-SECRET", GOOGLE_CALENDAR_TOKEN_KEY: TOKEN_KEY });
  if (ready) env.VIS12_CALENDAR_READY = "1";
  const google = fakeGoogle();
  globalThis.fetch = google.fetch;
  return { env, google, cookie: await adminCookie() };
}
const start = (env, cookie, negotiator_id = 1) => call(env, "POST", "/admin/calendar/google/start", { cookie, body: { negotiator_id } });
const browserCookie = res => res.headers.get("set-cookie").split(";")[0];
// Google sends the browser back with a top-level GET: only the Lax cookie travels, never the Strict session.
async function callback(env, query, cookie) {
  const headers = new Headers(cookie ? { cookie } : {});
  const req = new Request(`${ORIGIN}/api/calendar/google/callback?${new URLSearchParams(query)}`, { headers });
  const pending = [], res = await handleApi(req, env, ["calendar", "google", "callback"], p => pending.push(p));
  await Promise.all(pending);
  return res;
}
const connection = env => env.DB.raw.prepare("SELECT * FROM calendar_connections WHERE negotiator_id = 1").get();

test("switched off the calendar routes do not exist (the panel is told enabled: false); before migration 0105 too", async t => {
  for (const [ready, schema] of [[false, {}], [true, { through: 104 }]]) {
    const { env, google, cookie } = await world(t, { ready, schema });
    const s = await call(env, "GET", "/admin/calendar/google", { cookie });
    assert.deepEqual([s.status, s.data], [200, { enabled: false }]);
    assert.equal((await call(env, "GET", "/admin/calendar/google")).status, 401, "staff only, even off");
    if (!ready) for (const path of ["/admin/calendar/google/start", "/admin/calendar/google/disconnect", "/admin/calendar/viewings/1/sync"])
      assert.equal((await call(env, "POST", path, { cookie, body: { negotiator_id: 1 } })).status, 404);
    assert.equal((await callback(env, { code: "c", state: "s" })).status, ready ? 303 : 404);
    assert.equal(google.calls.length, 0);
    t.mock.timers.reset();
  }
});

test("only signed-in staff start a connection; without the secrets nothing is offered", async t => {
  const { env, cookie } = await world(t, { secrets: false });
  assert.equal((await call(env, "POST", "/admin/calendar/google/start", { body: { negotiator_id: 1 } })).status, 401);
  assert.equal((await start(env, cookie)).status, 503);
  assert.equal((await call(env, "GET", "/admin/calendar/google", { cookie })).data.configured, false);
  t.mock.timers.reset();
  const w = await world(t);
  assert.equal((await start(w.env, w.cookie, 999)).status, 400, "an unknown negotiator");
});

test("the Google address has the fixed redirect, the minimum scopes and a one-use state tied to this browser", async t => {
  const { env, cookie } = await world(t);
  const r = await start(env, cookie);
  assert.equal(r.status, 200);
  const url = new URL(r.data.url);
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("redirect_uri"), "https://www.hampton.test/api/calendar/google/callback", "redirect_fixed");
  assert.deepEqual(url.searchParams.get("scope").split(" "), GOOGLE_SCOPES);
  assert.deepEqual([url.searchParams.get("access_type"), url.searchParams.get("response_type")], ["offline", "code"]);
  assert.match(r.headers.get("set-cookie"), /^__Host-hcal=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  const saved = env.DB.raw.prepare("SELECT * FROM calendar_oauth_states").get();
  assert.notEqual(saved.state_hash, url.searchParams.get("state"), "only its hash is kept");
  assert.equal(saved.admin, "admin@example.test");
});

test("the callback connects once, keeps the token sealed and never returns it; the scopes are recorded", async t => {
  const { env, google, cookie } = await world(t);
  const r = await start(env, cookie), state = new URL(r.data.url).searchParams.get("state"), browser = browserCookie(r);
  const res = await callback(env, { code: "4/FIXTURE-CODE", state }, browser);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/admin/?calendar=connected#/availability");
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.text();
  assert.ok(!body.includes("FIXTURE-REFRESH") && !body.includes("ya29"), "refresh_token_not_returned");
  const c = connection(env);
  assert.deepEqual([c.state, c.calendar_id, c.connected_by], ["active", "primary", "admin@example.test"]);
  assert.ok(!c.refresh_token_enc.includes("FIXTURE-REFRESH"), "sealed with the key kept outside D1");
  assert.equal(c.scopes, GOOGLE_SCOPES.join(" "), "scopes_recorded");
  const exchange = google.calls.find(c => c.url === TOKEN_URL);
  assert.equal(exchange.body.redirect_uri, "https://www.hampton.test/api/calendar/google/callback");
  const status = await call(env, "GET", "/admin/calendar/google", { cookie });
  assert.ok(!status.text.includes("FIXTURE-REFRESH") && !status.text.includes("refresh_token"));
  assert.deepEqual(status.data.connections.map(c => [c.negotiator_id, c.state]), [[1, "active"]]);
  // state_once_session_bound: the same answer again does nothing.
  const again = await callback(env, { code: "4/FIXTURE-CODE", state }, browser);
  assert.equal(again.headers.get("location"), "/admin/?calendar=failed#/availability");
  assert.equal(google.calls.filter(c => c.url === TOKEN_URL).length, 1);
});

test("another browser, an expired state, a removed staff member or missing scopes connect nothing", async t => {
  const { env, google, cookie } = await world(t);
  const tryWith = async (prep, cookieOf = browserCookie) => {
    const r = await start(env, cookie), state = new URL(r.data.url).searchParams.get("state");
    await prep?.();
    return (await callback(env, { code: "4/FIXTURE-CODE", state }, cookieOf(r))).headers.get("location");
  };
  assert.match(await tryWith(null, () => "__Host-hcal=someone-else"), /failed/, "state_once_session_bound: another browser");
  assert.match(await tryWith(null, () => null), /failed/);
  assert.match(await tryWith(() => t.mock.timers.setTime(NOW + 11 * 60000)), /failed/, "expired");
  t.mock.timers.setTime(NOW);
  assert.match(await tryWith(() => env.DB.raw.prepare("DELETE FROM admins").run()), /failed/, "wrong_negotiator_denied: staff no longer staff");
  assert.equal(connection(env), undefined);
  assert.equal(google.calls.length, 0, "nothing reached Google");
  env.DB.raw.prepare("INSERT INTO admins (email, added_by, added_at) VALUES ('admin@example.test', 'setup', '2026-10-01T00:00:00.000Z')").run();
  google.scope = "https://www.googleapis.com/auth/calendar.freebusy";
  assert.match(await tryWith(), /calendar=scopes/);
  assert.equal(connection(env), undefined);
});

test("refusing at Google leaves the viewings on Hampton's calendar, and the state is used up", async t => {
  const { env, google, cookie } = await world(t);
  const r = await start(env, cookie), state = new URL(r.data.url).searchParams.get("state");
  const res = await callback(env, { error: "access_denied", state }, browserCookie(r));
  assert.equal(res.headers.get("location"), "/admin/?calendar=denied#/availability", "oauth_denied_fallback");
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM calendar_oauth_states").get().n, 0);
  assert.equal(google.calls.length, 0);
});

test("disconnecting forgets the token, tells Google to revoke it and stops further writes", async t => {
  const { env, google, cookie } = await world(t);
  const r = await start(env, cookie), state = new URL(r.data.url).searchParams.get("state");
  await callback(env, { code: "4/FIXTURE-CODE", state }, browserCookie(r));
  const d = await call(env, "POST", "/admin/calendar/google/disconnect", { cookie, body: { negotiator_id: 1 } });
  assert.equal(d.status, 200);
  const c = connection(env);
  assert.deepEqual([c.state, c.refresh_token_enc, c.revoked_by], ["revoked", null, "admin@example.test"]);
  const revoke = google.calls.find(x => x.url.startsWith(REVOKE_URL));
  assert.equal(revoke.body.token, "1//FIXTURE-REFRESH");
  assert.equal((await call(env, "POST", "/admin/calendar/google/disconnect", { cookie, body: { negotiator_id: 1 } })).status, 404);
});
