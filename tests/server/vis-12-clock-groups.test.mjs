// VIS-12 with the clock and with VIS-14: the clock retries what Google Calendar did not take (only switched on, the same
// switches as the website), and open or back-to-back viewings move or cancel the same events. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import worker from "../../server/jobs.js";
import { fakeGoogle } from "./google-calendar-fake.mjs";
import { sealToken } from "../../server/calendar-sync.js";
import { eventIdFor } from "../../server/calendar-google.js";

// Tuesday 20 October 2026, 13:05 in Jersey (BST, UTC+1).
const NOW = Date.parse("2026-10-20T12:05:00.000Z"), WED = "2026-10-21", THU = "2026-10-22", ID = "HE-R001";
const TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
const tick = env => worker.scheduled({ cron: "*/10 * * * *", scheduledTime: NOW }, env, { waitUntil() {} });

async function world(t, { ready = true, groups = false, schema } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  t.mock.method(console, "log", () => {});
  const env = makeEnv(schema);
  Object.assign(env, { GOOGLE_CALENDAR_CLIENT_ID: "client.apps.googleusercontent.com", GOOGLE_CALENDAR_CLIENT_SECRET: "FIXTURE-CLIENT-SECRET",
    GOOGLE_CALENDAR_TOKEN_KEY: TOKEN_KEY, SITE_URL: "https://hampton.test" });
  if (ready) env.VIS12_CALENDAR_READY = "1";
  if (groups) env.VIS14_BLOCK_READY = "1";
  seedListing(env);
  if (schema?.through == null) for (const [id, cal] of [[1, "primary"], [2, "two@example.test"]])
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
const ref = (env, id) => ({ id, updated_at: row(env, id).updated_at });
const act = (env, cookie, id, action, more = {}) => call(env, "PUT", `/admin/viewings/${id}`, { cookie,
  body: { action, updated_at: row(env, id).updated_at, ...more } });
// The UTC instant Google holds for a Jersey summer wall time.
const bst = (date, time) => `${date}T${String(Number(time.slice(0, 2)) - 1).padStart(2, "0")}:${time.slice(3)}:00Z`;
const event = async (google, id, cal = "primary") => google.events.get(cal === "primary" ? await eventIdFor(id) : `${cal}/${await eventIdFor(id)}`);
const sqlLog = env => {
  const seen = [], prepare = env.DB.prepare.bind(env.DB), batch = env.DB.batch.bind(env.DB);
  env.DB.prepare = sql => { seen.push(sql); return prepare(sql); };
  env.DB.batch = stmts => { seen.push(...stmts.map(s => s.sql)); return batch(stmts); };
  return seen;
};

test("the sync module the clock imports never reaches the panel's session (auth.js, jose)", () => {
  const seen = new Set();
  const walk = url => {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    for (const [, spec] of readFileSync(url, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g))
      if (spec.startsWith(".")) walk(new URL(spec, url)); else seen.add(spec);
  };
  walk(new URL("../../server/calendar-sync.js", import.meta.url));
  assert.deepEqual([...seen].filter(s => /\/auth\.js$|^jose/.test(s)), []);
});

test("switched off, the tick runs exactly the SQL it ran before migration 0105 and calls nobody", async t => {
  const runs = [];
  for (const schema of [{ through: 104 }, {}]) {
    const { env, google } = await world(t, { ready: false, schema });
    if (schema.through == null) env.DB.raw.prepare(`INSERT INTO calendar_event_links (viewing_id, negotiator_id, calendar_id, external_id,
      op, wanted, state, updated_at) VALUES (99, 1, 'primary', ?, 'x', 'confirmed', 'unknown', ?)`).run("a".repeat(64), T0);
    const seen = sqlLog(env);
    await tick(env);
    runs.push(seen);
    assert.equal(google.calls.length, 0);
    t.mock.timers.reset(); t.mock.reset();
  }
  assert.deepEqual(runs[1], runs[0]);
  assert.ok(!runs[1].some(s => /calendar_/.test(s)));
});

test("switched on, the tick writes what Google did not take, and leaves a disconnected calendar's viewings alone", async t => {
  const { env, google, cookie } = await world(t);
  const id = seedViewing(env), other = seedViewing(env, { negotiator_id: 2 });
  google.fail.insert = 503;
  await act(env, cookie, id, "confirm");
  await act(env, cookie, other, "confirm");
  assert.deepEqual([link(env, id).state, link(env, other).state], ["unknown", "unknown"]);
  delete google.fail.insert;
  env.DB.raw.prepare("UPDATE calendar_connections SET state = 'revoked', refresh_token_enc = NULL, revoked_at = ?, revoked_by = 'x' WHERE negotiator_id = 2").run(T0);
  const before = link(env, other);
  await tick(env);
  assert.equal(link(env, id).state, "synced", "the clock retried it");
  assert.equal((await event(google, id)).start.dateTime, bst(THU, row(env, id).time));
  assert.deepEqual(link(env, other), before, "a disconnected calendar's row is not touched");
  assert.equal(google.events.size, 1);
});

const vars = text => Object.fromEntries([...text.split(/^\[(?!vars\])/m)[0].matchAll(/^(\w+) = "(.*)"$/gm)].map(m => [m[1], m[2]]));
test("the website and the clock carry the same calendar switches (absent means off), both off today", () => {
  const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
  const jobs = vars(read("jobs/wrangler.toml")), pages = vars(read("wrangler.toml"));
  for (const flag of ["VIS12_CALENDAR_READY", "VIS12_CALENDAR_INVITES_READY"]) {
    assert.equal(jobs[flag] ?? "0", pages[flag] ?? "0", flag);
    assert.equal(jobs[flag] ?? "0", "0", `${flag} stays off until Luis switches it on`);
  }
});

test("a place in an open viewing moves a confirmed viewing's event to its time and calendar; cancelling it cancels the event", async t => {
  const { env, google, cookie } = await world(t, { groups: true });
  const id = seedViewing(env), request = seedViewing(env);
  await act(env, cookie, id, "confirm");
  assert.ok(await event(google, id));
  const r = await call(env, "POST", "/admin/viewing-groups", { cookie, body: { listing_id: ID, negotiator_id: 2, date: WED,
    time: "15:00", capacity: 4, viewings: [ref(env, request)] } });
  assert.equal(r.status, 201);
  assert.equal(link(env, request), undefined, "a request has no event");
  const p = await call(env, "POST", `/admin/viewing-groups/${r.data.id}/places`, { cookie, body: { viewings: [ref(env, id)] } });
  assert.deepEqual([p.status, p.data.placed], [200, [id]]);
  assert.equal((await event(google, id)).status, "cancelled", "out of the first negotiator's calendar");
  const moved = await event(google, id, "two@example.test");
  assert.deepEqual([moved.start.dateTime, moved.status], [bst(WED, "15:00"), "confirmed"]);
  assert.deepEqual([link(env, id).negotiator_id, link(env, id).state], [2, "synced"]);
  const c = await call(env, "POST", `/admin/viewing-groups/${r.data.id}/cancel`, { cookie });
  assert.deepEqual(c.data.cancelled.sort(), [id, request].sort());
  assert.equal((await event(google, id, "two@example.test")).status, "cancelled");
});

test("back-to-back times move requests (no event yet); confirmed later, each gets one event at its new time", async t => {
  const { env, google, cookie } = await world(t, { groups: true });
  const a = seedViewing(env), b = seedViewing(env);
  const r = await call(env, "POST", "/admin/viewing-groups/consecutive", { cookie, body: { listing_id: ID, negotiator_id: 1,
    date: WED, time: "10:00", viewings: [ref(env, a), ref(env, b)] } });
  assert.deepEqual([r.status, r.data.moved.length], [200, 2]);
  assert.equal(google.writes().length, 0, "requests are not written to the calendar");
  for (const id of [a, b]) {
    await act(env, cookie, id, "confirm");
    const v = row(env, id), ev = await event(google, id);
    assert.deepEqual([v.date, ev.start.dateTime, link(env, id).state], [WED, bst(WED, v.time), "synced"]);
  }
  assert.equal(google.events.size, 2);
});

