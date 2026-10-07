import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie, ORIGIN } from "./helpers.mjs";
import { serveMedia } from "../../server/media.js";
import { jerseyToday, EMAIL } from "../../server/viewings.js";
import { verifyTurnstile } from "../../server/turnstile.js";

const turnstile = ok => { globalThis.fetch = async () => new Response(JSON.stringify({ success: ok, hostname: "hampton.test" })); };
const nextWeekday = () => { const d = new Date(Date.now() + 2 * 864e5); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const nextSunday = () => { const d = new Date(Date.now() + 864e5); while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const booking = (o = {}) => ({ listing_id: "HE-R001", agent: "Gilberto Franco", kind: "In person", date: nextWeekday(),
  time: "11:30", name: "Jane Le Brocq", email: "Jane@Example.je", phone: "", turnstile: "tok", ...o });

function world() {
  const env = makeEnv();
  seedListing(env);
  seedListing(env, { id: "HE-R002", title: "Draft", published: 0 });
  seedListing(env, { id: "HE-X001", title: "Old", published: 0, archived_at: "2026-10-07" });
  seedMedia(env);
  seedMedia(env, { id: "A00002", r2_key: "media/external/e.jpg", thumb_key: null, origin: "external", public: 0 });
  seedMedia(env, { id: "A00003", listing_id: "HE-R002", r2_key: "media/hampton/d.jpg" });
  for (const k of ["media/hampton/a.jpg", "thumbs/hampton/a.jpg", "media/external/e.jpg", "media/hampton/d.jpg"])
    env.MEDIA.store.set(k, { body: k, type: "image/jpeg" });
  return env;
}

test("GET /listings: only published, not archived, public shape, cached 60s", async () => {
  const r = await call(world(), "GET", "/listings");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "public, max-age=60");
  assert.deepEqual(r.data.map(p => p.id), ["HE-R001"]);
  assert.deepEqual(r.data[0].photos.map(p => p.src), ["/media/A00001"]);
});

test("GET /config exposes only the Turnstile site key", async () => {
  assert.deepEqual((await call(world(), "GET", "/config")).data, { turnstileSiteKey: "site-key" });
});

test("media: public photo is cacheable; private or draft media are 404 without a session", async () => {
  const env = world();
  const get = (id, cookie, q = "") => serveMedia(new Request(`${ORIGIN}/media/${id}${q}`, { headers: cookie ? { cookie } : {} }), env, id);
  const pub = await get("A00001");
  assert.equal(pub.status, 200);
  assert.equal(pub.headers.get("cache-control"), "public, max-age=86400");
  assert.equal(await (await get("A00001", null, "?thumb")).text(), "thumbs/hampton/a.jpg");
  assert.equal((await get("A00002")).status, 404);   // external
  assert.equal((await get("A00003")).status, 404);   // draft listing
  assert.equal((await get("NOPE")).status, 404);
  const priv = await get("A00002", await adminCookie());
  assert.equal(priv.status, 200);
  assert.equal(priv.headers.get("cache-control"), "private, no-store");
});

test("POST /viewings stores a valid request", async () => {
  const env = world(); turnstile(true);
  const r = await call(env, "POST", "/viewings", { body: booking() });
  assert.equal(r.status, 201);
  const row = await env.DB.prepare("SELECT * FROM viewing_requests").first();
  assert.equal(row.email, "jane@example.je");
  assert.equal(row.status, "new");
  assert.equal(row.phone, null);
});

test("POST /viewings rejects failed Turnstile, Sundays, past dates, bad email and draft listings", async () => {
  const env = world();
  turnstile(false);
  assert.equal((await call(env, "POST", "/viewings", { body: booking() })).status, 400);
  turnstile(true);
  assert.match((await call(env, "POST", "/viewings", { body: booking({ date: nextSunday() }) })).data.fields.date, /Monday to Saturday/);
  assert.ok((await call(env, "POST", "/viewings", { body: booking({ date: "2020-01-01" }) })).data.fields.date);
  assert.ok((await call(env, "POST", "/viewings", { body: booking({ date: "2026-02-30" }) })).data.fields.date);
  assert.ok((await call(env, "POST", "/viewings", { body: booking({ email: "nope" }) })).data.fields.email);
  assert.ok((await call(env, "POST", "/viewings", { body: booking({ time: "03:00" }) })).data.fields.time);
  assert.equal((await call(env, "POST", "/viewings", { body: booking({ listing_id: "HE-R002" }) })).status, 400);
  assert.equal((await call(env, "POST", "/viewings", { body: booking({ listing_id: null }) })).status, 201);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) n FROM viewing_requests").first()).n, 1);
});

test("cross-origin writes are blocked and unknown routes are JSON 404", async () => {
  turnstile(true);
  assert.equal((await call(world(), "POST", "/viewings", { body: booking(), origin: "https://evil.test" })).status, 403);
  const r = await call(world(), "GET", "/nope");
  assert.equal(r.status, 404);
  assert.equal(r.data.error, "Not found");
  assert.equal((await call(world(), "GET", "/listings%E0%A4")).status, 400); // malformed percent-encoding
});

test("M3: 'today' for viewings is the Jersey calendar day, not UTC", () => {
  assert.equal(jerseyToday(new Date("2026-07-01T23:30:00Z")), "2026-07-02"); // BST: already tomorrow in Jersey
  assert.equal(jerseyToday(new Date("2026-12-01T23:30:00Z")), "2026-12-01"); // GMT: same day
});

test("M4: field errors are returned without spending the Turnstile token", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ success: true })); };
  const r = await call(world(), "POST", "/viewings", { body: booking({ email: "nope" }) });
  assert.equal(r.status, 400);
  assert.ok(r.data.fields.email);
  assert.equal(calls, 0);
});

test("M4: Turnstile answer must be for our hostname (test secrets exempt)", async () => {
  const f = hostname => async () => new Response(JSON.stringify({ success: true, hostname }));
  assert.equal(await verifyTurnstile("t", "real-secret", null, "hamptonjersey.pages.dev", f("evil.example")), false);
  assert.equal(await verifyTurnstile("t", "real-secret", null, "hamptonjersey.pages.dev", f("hamptonjersey.pages.dev")), true);
  assert.equal(await verifyTurnstile("t", "1x0000000000000000000000000000000AA", null, "localhost", f("example.com")), true);
});

test("M7: emails with URL metacharacters are rejected", () => {
  for (const bad of ["a@x.com?bcc=b%40e.com", "a&b@x.com", "a@x.com/x", "a\"@x.com"]) assert.equal(EMAIL.test(bad), false, bad);
  assert.equal(EMAIL.test("jane.le-brocq+view@example.je"), true);
});

