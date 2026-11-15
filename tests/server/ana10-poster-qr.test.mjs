import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, seedMedia, call, adminCookie, captured, T0 } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";

// ANA-10: window poster QR opens, aggregated per listing and Jersey day. Synthetic listings only.
const opens = env => env.DB.raw.prepare("SELECT day, listing_id, n FROM listing_qr_opens ORDER BY listing_id").all().map(r => ({ ...r }));
const scan = (env, listing_id = "HE-R001", opts) => call(env, "POST", "/stats", { body: { listing_id, metric: "qr" }, ...opts });

function world(on = true) {
  const env = makeEnv();
  env.SITE_URL = "https://hampton.test";
  if (on) env.ANA10_QR_OPENS_READY = "1";
  seedListing(env);
  seedListing(env, { id: "HE-R002", title: "Draft", published: 0 });
  seedListing(env, { id: "HE-X001", title: "Old", archived_at: "2026-10-07" });
  seedListing(env, { id: "HE-R003", title: "Second" });
  seedMedia(env);
  return env;
}

test("ANA-10 off: a QR open is refused like an unknown metric and the staff QR answers 404", async () => {
  const env = world(false);
  assert.equal((await scan(env)).status, 400);
  assert.equal((await call(env, "GET", "/admin/listings/HE-R001/poster-qr", { cookie: await adminCookie() })).status, 404);
  assert.deepEqual(opens(env), []);
  const r = await call(env, "GET", "/admin/insights", { cookie: await adminCookie() });
  assert.equal(r.status, 200);
  assert.equal(Object.hasOwn(r.data.totals, "qr_opens"), false);
});

test("ANA-10: an open of a published listing is one row per Jersey day, in one statement, apart from daily_stats", async () => {
  const env = world();
  const seen = captured(env, /listing_qr_opens/);
  for (let i = 0; i < 3; i++) assert.equal((await scan(env)).status, 204);
  assert.equal(seen.length, 3, "one D1 statement per open");
  assert.deepEqual(opens(env), [{ day: jerseyToday(), listing_id: "HE-R001", n: 3 }]);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM daily_stats").get().n, 0);
});

test("ANA-10: drafts, archived and unknown listings are not counted but answer 204", async () => {
  const env = world();
  for (const id of ["HE-R002", "HE-X001", "HE-R999"]) assert.equal((await scan(env, id)).status, 204, id);
  assert.deepEqual(opens(env), []);
});

test("ANA-10: the table holds only day, listing and count; a cross-origin open is 403", async () => {
  const env = world();
  const cols = env.DB.raw.prepare("SELECT name FROM pragma_table_info('listing_qr_opens') ORDER BY cid").all().map(c => c.name);
  assert.deepEqual(cols, ["day", "listing_id", "n"]);
  assert.equal((await scan(env, "HE-R001", { origin: "https://evil.test" })).status, 403);
  assert.deepEqual(opens(env), []);
});

test("ANA-10: at most 200 opens a listing a day and 5,000 in all are counted, still 204", async () => {
  const env = world();
  const day = jerseyToday();
  env.DB.raw.prepare("INSERT INTO listing_qr_opens VALUES (?, 'HE-R001', 199)").run(day);
  for (let i = 0; i < 3; i++) assert.equal((await scan(env)).status, 204);
  await scan(env, "HE-R003");
  assert.deepEqual(opens(env), [{ day, listing_id: "HE-R001", n: 200 }, { day, listing_id: "HE-R003", n: 1 }]);
  // Yesterday's opens don't count against today; 5,000 today stop every listing.
  for (let i = 0; i < 25; i++) seedListing(env, { id: `HE-S${String(i).padStart(3, "0")}`, title: `Filler ${i}` });
  env.DB.raw.prepare("DELETE FROM listing_qr_opens").run();
  env.DB.raw.prepare("INSERT INTO listing_qr_opens VALUES (?, 'HE-R003', 200)").run(plusDays(day, -1));
  for (let i = 0; i < 25; i++) env.DB.raw.prepare("INSERT INTO listing_qr_opens VALUES (?, ?, 200)").run(day, `HE-S${String(i).padStart(3, "0")}`);
  await scan(env, "HE-R003");
  assert.equal(env.DB.raw.prepare("SELECT n FROM listing_qr_opens WHERE day = ? AND listing_id = 'HE-R003'").get(day), undefined);
});

test("ANA-10 with PUB-16: a rental whose Let agreed day is over is not counted while still marked published", async () => {
  const env = world();
  env.PUB16_TIMED_CLOSURE_READY = "1";
  env.DB.raw.prepare("INSERT INTO events (at, actor, entity_type, entity_id, type) VALUES (?, 'system', 'listing', 'HE-R001', 'listing.updated')").run(T0);
  env.DB.raw.prepare(`INSERT INTO rental_closure_windows (closure_id, listing_id, close_event_id, state, opened_at, due_at,
    previous_availability, previous_published, previous_viewings_enabled, applied_updated_at)
    VALUES ('c1', 'HE-R001', 1, 'open', ?, ?, 'to_let', 1, 1, ?)`).run(T0, "2026-10-08T10:00:00.000Z", T0);
  assert.equal((await scan(env)).status, 204);
  assert.deepEqual(opens(env), []);
  const r = await call(env, "GET", "/admin/listings/HE-R001/poster-qr", { cookie: await adminCookie() });
  assert.equal(r.data.shown, false);
  assert.equal(r.data.url, null);
});

test("ANA-10: staff get the poster QR address of a listing shown on the website and its last 90 days of opens", async () => {
  const env = world();
  assert.equal((await call(env, "GET", "/admin/listings/HE-R001/poster-qr")).status, 401);
  const day = jerseyToday();
  env.DB.raw.prepare("INSERT INTO listing_qr_opens VALUES (?, 'HE-R001', 4), (?, 'HE-R001', 3), (?, 'HE-R001', 50), (?, 'HE-R003', 9)")
    .run(day, plusDays(day, -89), plusDays(day, -90), day);
  const cookie = await adminCookie();
  const r = await call(env, "GET", "/admin/listings/HE-R001/poster-qr", { cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { shown: true, url: "https://hampton.test/p/HE-R001?src=qr", opens: 7, days: 90 });
  // No public photo: not on the website, so no QR to print (the count stays visible).
  const hidden = await call(env, "GET", "/admin/listings/HE-R003/poster-qr", { cookie });
  assert.deepEqual(hidden.data, { shown: false, url: null, opens: 9, days: 90 });
  assert.equal((await call(env, "GET", "/admin/listings/HE-R002/poster-qr", { cookie })).data.shown, false);
});

test("ANA-10: Insights totals the period's QR opens", async () => {
  const env = world();
  const day = jerseyToday();
  env.DB.raw.prepare("INSERT INTO listing_qr_opens VALUES (?, 'HE-R001', 4), (?, 'HE-R003', 2), (?, 'HE-R001', 8)")
    .run(day, plusDays(day, -6), plusDays(day, -7));
  const r = await call(env, "GET", "/admin/insights?days=7", { cookie: await adminCookie() });
  assert.equal(r.status, 200);
  assert.equal(r.data.totals.qr_opens, 6);
});
