import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie, ORIGIN, captured, plan } from "./helpers.mjs";
import { serveMedia } from "../../server/media.js";
import { jerseyToday, EMAIL, addMinutes, plusDays } from "../../server/viewings.js";
import { verifyTurnstile } from "../../server/turnstile.js";

const turnstile = ok => { globalThis.fetch = async () => new Response(JSON.stringify({ success: ok, hostname: "hampton.test" })); };
const nextWeekday = () => { const d = new Date(Date.now() + 2 * 864e5); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const nextSunday = () => { const d = new Date(Date.now() + 864e5); while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const booking = (o = {}) => ({ listing_id: "HE-R001", negotiator_id: 1, kind: "In person", date: nextWeekday(),
  time: "11:30", name: "Jane Le Brocq", email: "Jane@Example.je", phone: "", turnstile: "tok", ...o });

// An existing viewing, straight into the table: Sam's details must never reach the website.
const seedViewing = (env, o = {}) => {
  const row = { negotiator_id: 1, agent: "Gilberto Franco", kind: "In person", date: nextWeekday(), time: "11:30",
    name: "Sam Secret", email: "sam@secret.je", phone: "07797 123456", status: "requested", created_at: "2026-10-07T10:00:00.000Z", ...o };
  row.end_time ??= addMinutes(row.time, 30);
  const cols = Object.keys(row);
  env.DB.raw.prepare(`INSERT INTO viewing_requests (${cols}) VALUES (${cols.map(() => "?")})`).run(...Object.values(row));
};
const count = (env, sql) => env.DB.raw.prepare(`SELECT COUNT(*) n FROM ${sql}`).get().n;
const writes = env => [count(env, "viewing_requests"), count(env, "events WHERE type = 'viewing.requested'"), count(env, "notifications")];
const TAKEN = { error: "That time was just booked. Please choose another." };

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

test("GET /listings: interest is the panel's count from 2 people, null below, with no personal data", async () => {
  const env = world(), cookie = await adminCookie(), ago = n => plusDays(jerseyToday(), -n);
  const v = o => seedViewing(env, { listing_id: "HE-R001", ...o });
  const interest = async () => (await call(env, "GET", "/listings")).data.find(p => p.id === "HE-R001").interest;
  v();
  assert.equal(await interest(), null, "one person is never shown");
  v({ name: "Ann Other", email: "Ann@X.je", phone: null, status: "completed", outcome: "proceed", date: ago(2), time: "10:00" });
  assert.equal(await interest(), 2);
  assert.equal((await call(env, "GET", "/admin/listings/HE-R001", { cookie })).data.active_interest, 2, "the panel's own count");
  v({ email: "SAM@secret.je", time: "14:00" });
  v({ name: "Gone", email: "gone@x.je", status: "cancelled", time: "15:00" });
  v({ name: "Nope", email: "nope@x.je", status: "completed", outcome: "not_interested", date: ago(1), time: "16:00" });
  assert.equal(await interest(), 2, "the same person once; cancelled and not interested never count");
  v({ listing_id: "HE-R002", email: "d1@x.je", time: "10:00" });
  v({ listing_id: "HE-R002", email: "d2@x.je", time: "10:30" });
  const r = await call(env, "GET", "/listings");
  assert.deepEqual(r.data.map(p => p.id), ["HE-R001"], "a draft's interest never reaches the website");
  assert.doesNotMatch(JSON.stringify(r.data), /Sam|secret|07797|Ann/i);
});

test("GET /listings: one person booked online and again by phone, or with one phone typed two ways, counts once", async () => {
  const env = world(), cookie = await adminCookie(), ago = n => plusDays(jerseyToday(), -n);
  const v = o => seedViewing(env, { listing_id: "HE-R001", ...o });
  const interest = async () => (await call(env, "GET", "/listings")).data.find(p => p.id === "HE-R001").interest;
  v({ name: "Jane", email: "jane@x.je", phone: "07797 123456", status: "completed", outcome: "proceed", date: ago(2), time: "10:00" });
  v({ name: "Jane", email: null, phone: "+44 7797 123-456", time: "10:00" });
  v({ name: "Pat", email: null, phone: "07700 900321", time: "11:00" });
  v({ name: "Pat", email: null, phone: "07700900321", time: "12:00" });
  assert.equal(await interest(), 2, "Jane once, Pat once");
  v({ name: "Kim", email: "kim@x.je", phone: "(07797) 555.666", status: "completed", outcome: "not_interested", date: ago(40), time: "10:00" });
  v({ name: "Kim", email: null, phone: "07797 555666", time: "13:00" });
  v({ name: "Lee", email: null, phone: "07700 111222", time: "14:00" });
  assert.equal(await interest(), 4, "Kim's new viewing and another phone-only person still count");
  assert.equal((await call(env, "GET", "/admin/listings/HE-R001", { cookie })).data.active_interest, 4, "the panel's own count");
});

test("GET /listings reads interest through the (listing_id, date) index", async () => {
  const env = world(), q = captured(env, /COUNT\(DISTINCT/);
  await call(env, "GET", "/listings");
  assert.equal(q.length, 1);
  const p = plan(env, q[0]);
  assert.match(p, /SEARCH viewing_requests USING INDEX viewing_listing \(listing_id=\? AND date>\?\)/, p);
  assert.doesNotMatch(p, /SCAN viewing_requests/, p);
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
  const r = await call(env, "POST", "/viewings", { body: booking({ agent: "Someone else" }) });
  assert.equal(r.status, 201);
  const row = await env.DB.prepare("SELECT * FROM viewing_requests").first();
  assert.equal(row.email, "jane@example.je");
  assert.equal(row.status, "requested");
  assert.equal(row.phone, null);
  // The negotiator comes from negotiator_id, never from a free-text agent; the viewing ends SLOT_MINUTES later.
  assert.equal(row.negotiator_id, 1);
  assert.equal(row.agent, "Gilberto Franco");
  assert.equal(row.time, "11:30");
  assert.equal(row.end_time, "12:00");
  assert.equal(row.listing_title_snapshot, "Le Bernage");
});

test("availability lists active negotiators and their slots with booked flags and no personal data", async () => {
  const env = world(), date = nextWeekday();
  env.DB.raw.prepare("UPDATE negotiators SET active = 0 WHERE id = 2").run();
  seedViewing(env, { date, time: "11:30" });
  const r = await call(env, "GET", `/availability?from=${date}&days=1`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.data.slot_minutes, 30);
  assert.deepEqual(r.data.negotiators, [{ id: 1, name: "Gilberto Franco", role: "Managing Director" }]);
  assert.deepEqual(r.data.days.map(d => d.date), [date]);
  assert.deepEqual(Object.keys(r.data.days[0].slots), ["1"]);
  const booked = Object.fromEntries(r.data.days[0].slots[1].map(s => [s.time, s.booked]));
  // 11:30–12:00 with 15 minutes either side: 11:00, 11:30 and 12:00 are taken, 10:30 and 12:30 are not.
  assert.deepEqual([booked["10:30"], booked["11:00"], booked["11:30"], booked["12:00"], booked["12:30"]],
    [false, true, true, true, false]);
  assert.doesNotMatch(JSON.stringify(r.data), /Sam|secret|07797/i);
});

test("availability rejects bad from/days and starts tomorrow by default", async () => {
  const env = world();
  for (const q of ["?from=2026-02-30", "?from=tomorrow", "?from=", "?days=0", "?days=15", "?days=1.5", "?days=x"])
    assert.equal((await call(env, "GET", "/availability" + q)).status, 400, q);
  // The website runs Monday to Saturday: an open Sunday is for the panel, never offered here.
  env.DB.raw.prepare(`INSERT INTO negotiator_exceptions (negotiator_id, date, kind, start_time, end_time, created_at)
    VALUES (1, ?, 'open', '10:00', '12:00', ?)`).run(nextSunday(), "2026-10-07T10:00:00.000Z");
  const r = await call(env, "GET", "/availability");
  assert.equal(r.status, 200);
  const plus = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const sunday = d => new Date(d + "T12:00:00Z").getUTCDay() === 0;
  const tomorrow = plus(jerseyToday(), 1);
  assert.equal(r.data.days[0].date, sunday(tomorrow) ? plus(tomorrow, 1) : tomorrow);
  assert.equal(r.data.days.length, 12);
  assert.equal(r.data.days.filter(d => sunday(d.date)).length, 0);
  assert.ok(r.data.days.every(d => Object.keys(d.slots).join() === "1,2"));
  assert.equal((await call(env, "GET", "/availability?days=14")).data.days.length, 14);
});

test("a booking takes a free slot once; the second gets 409 and writes nothing", async () => {
  const env = world(); turnstile(true);
  assert.equal((await call(env, "POST", "/viewings", { body: booking() })).status, 201);
  const second = await call(env, "POST", "/viewings", { body: booking({ name: "Other", email: "other@example.je" }) });
  assert.equal(second.status, 409);
  assert.deepEqual(second.data, TAKEN);
  assert.deepEqual(writes(env), [1, 1, 1]);
  // The race itself: another booking lands between the check and the write. The insert sees it (with its margins)
  // and neither the event nor the notice is written, though last_insert_rowid() then names the other row.
  for (const [over, status] of [[{ time: "10:30" }, 201], [{ time: "11:00" }, 409], [{ time: "12:00" }, 409],
    [{ time: "12:30" }, 201], [{ time: "11:30", negotiator_id: 2 }, 201], [{ time: "11:30", status: "cancelled" }, 201]]) {
    const race = world(), batch = race.DB.batch.bind(race.DB);
    race.DB.batch = stmts => {
      if (stmts.some(s => s.sql.includes("INSERT INTO viewing_requests"))) seedViewing(race, over);
      return batch(stmts);
    };
    const r = await call(race, "POST", "/viewings", { body: booking() });
    assert.equal(r.status, status, JSON.stringify(over));
    assert.deepEqual(writes(race), status === 201 ? [2, 1, 1] : [1, 0, 0], JSON.stringify(over));
    if (status === 409) assert.deepEqual(r.data, TAKEN);
  }
});

test("a booking for an inactive negotiator, a non-grid time or a booked time is refused before Turnstile", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ success: true, hostname: "hampton.test" })); };
  const env = world();
  env.DB.raw.prepare("UPDATE negotiators SET active = 0 WHERE id = 2").run();
  seedViewing(env, { time: "10:00" });
  for (const id of [2, 99]) {
    const r = await call(env, "POST", "/viewings", { body: booking({ negotiator_id: id }) });
    assert.equal(r.status, 400, `negotiator ${id}`);
    assert.ok(r.data.fields.negotiator_id);
  }
  for (const time of ["10:15", "18:00", "08:00"]) {
    const r = await call(env, "POST", "/viewings", { body: booking({ time }) });
    assert.equal(r.status, 400, time);
    assert.ok(r.data.fields.time);
  }
  const booked = await call(env, "POST", "/viewings", { body: booking({ time: "10:30" }) });   // inside 10:00's margin
  assert.equal(booked.status, 409);
  assert.deepEqual(booked.data, TAKEN);
  assert.equal(calls, 0);
  assert.deepEqual(writes(env), [1, 0, 0]);
});

test("a cancelled viewing frees its slot", async () => {
  const env = world(), date = nextWeekday(); turnstile(true);
  seedViewing(env, { date, time: "11:30", status: "cancelled" });
  const slots = (await call(env, "GET", `/availability?from=${date}&days=1`)).data.days[0].slots[1];
  assert.equal(slots.find(s => s.time === "11:30").booked, false);
  assert.equal((await call(env, "POST", "/viewings", { body: booking() })).status, 201);
  assert.equal(count(env, "viewing_requests WHERE status = 'requested'"), 1);
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
  assert.ok((await call(env, "POST", "/viewings", { body: booking({ time: "3pm" }) })).data.fields.time);
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

