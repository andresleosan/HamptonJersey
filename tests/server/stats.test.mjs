import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call } from "./helpers.mjs";
import { jerseyToday } from "../../server/viewings.js";

const rows = env => env.DB.raw.prepare("SELECT day, listing_id, metric, n FROM daily_stats ORDER BY listing_id, metric").all()
  .map(r => ({ ...r }));
const stat = (env, listing_id, metric = "view", opts) => call(env, "POST", "/stats", { body: { listing_id, metric }, ...opts });

function world() {
  const env = makeEnv();
  seedListing(env);
  seedListing(env, { id: "HE-R002", title: "Draft", published: 0 });
  seedListing(env, { id: "HE-X001", title: "Old", archived_at: "2026-10-07" });
  return env;
}

test("stats: a published listing counts once per call, per Jersey day", async () => {
  const env = world();
  for (let i = 0; i < 2; i++) {
    const r = await stat(env, "HE-R001");
    assert.equal(r.status, 204);
    assert.equal(r.data, null);
  }
  await stat(env, "HE-R001", "photos");
  await stat(env, "HE-R001", "tour");
  const day = jerseyToday();
  assert.deepEqual(rows(env), [{ day, listing_id: "HE-R001", metric: "photos", n: 1 },
    { day, listing_id: "HE-R001", metric: "tour", n: 1 }, { day, listing_id: "HE-R001", metric: "view", n: 2 }]);
});

test("stats: drafts, archived and unknown listings are not counted but answer 204", async () => {
  const env = world();
  for (const id of ["HE-R002", "HE-X001", "HE-R999"]) assert.equal((await stat(env, id)).status, 204, id);
  assert.deepEqual(rows(env), []);
});

test("stats: bad metric or id is 400", async () => {
  const env = world();
  const bad = [{ listing_id: "HE-R001", metric: "booking" }, { listing_id: "HE-R001" }, { listing_id: "R001", metric: "view" },
    { listing_id: "HE-R01", metric: "view" }, { listing_id: 1, metric: "view" }, { listing_id: ["HE-R001"], metric: "view" },{ metric: "view" }, null, []];
  for (const body of bad) {
    const r = await call(env, "POST", "/stats", { body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.ok(r.data.error, JSON.stringify(body));
  }
  assert.deepEqual(rows(env), []);
});

test("stats: cross-origin POST is 403", async () => {
  const env = world();
  assert.equal((await stat(env, "HE-R001", "view", { origin: "https://evil.test" })).status, 403);
  assert.deepEqual(rows(env), []);
});

test("stats: the day is Jersey's", async t => {
  // 00:30 BST on 2 July is still 1 July in UTC.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-07-01T23:30:00Z") });
  const env = world();
  await stat(env, "HE-R001");
  assert.deepEqual(rows(env).map(r => r.day), ["2026-07-02"]);
});

test("stats: past 20,000 opens in a Jersey day nothing more is written, still 204", async () => {
  const env = world();
  const day = jerseyToday();
  env.DB.raw.prepare("INSERT INTO daily_stats (day, listing_id, metric, n) VALUES (?, 'HE-R001', 'view', 19999)").run(day);
  for (const metric of ["view", "view", "photos"]) assert.equal((await stat(env, "HE-R001", metric)).status, 204);
  assert.deepEqual(rows(env), [{ day, listing_id: "HE-R001", metric: "view", n: 20000 }]);
});
