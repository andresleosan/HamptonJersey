import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";
import worker from "../../server/jobs.js";

// AUT-07: Cloudflare calls the Worker's scheduled() every 10 minutes with the tick's scheduled time.
const tick = (env, iso) => worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.parse(iso) }, env, { waitUntil() {} });
const OLD = "2025-10-01T10:00:00.000Z"; // 12 months inactive by 25-oct-2026
const contact = (env, email) => Number(env.DB.raw.prepare(
  "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES ('Jane Le Brocq', ?, ?, ?, ?)")
  .run(email, OLD, T0, T0).lastInsertRowid);
const exists = (env, id) => !!env.DB.raw.prepare("SELECT 1 FROM contacts WHERE id = ?").get(id);
const setting = (env, key) => {
  const r = env.DB.raw.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return r && JSON.parse(r.value);
};

test("the Worker only answers the clock", () => {
  assert.deepEqual(Object.keys(worker), ["scheduled"]);
});

// The Worker's config next to the website's: a drift (another database, another cadence, a public URL, another
// binding) fails here. The top-level keys are read before the first [table], so one moved under a table counts as gone.
const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const val = (text, key) => text.match(new RegExp(`^${key} = (.+)$`, "m"))?.[1];
test("the clock's Worker: hampton-jobs, every 10 minutes, on the website's database, with no public URL", () => {
  const jobs = read("jobs/wrangler.toml"), pages = read("wrangler.toml"), top = jobs.split(/^\[/m)[0];
  assert.deepEqual(top.match(/^\w+(?= = )/gm), ["name", "main", "compatibility_date", "workers_dev", "preview_urls"]);
  assert.deepEqual(jobs.match(/^\[.*\]$/gm), ["[triggers]", "[[d1_databases]]", "[observability]"]);
  assert.equal(val(top, "name"), '"hampton-jobs"');
  assert.equal(val(top, "main"), '"../server/jobs.js"');
  assert.equal(val(top, "workers_dev"), "false");
  assert.equal(val(top, "preview_urls"), "false");
  assert.equal(val(top, "compatibility_date"), val(pages, "compatibility_date"));
  assert.equal(val(jobs, "crons"), '["*/10 * * * *"]');
  for (const k of ["binding", "database_name", "database_id"]) assert.equal(val(jobs, k), val(pages, k));
});

// The build that holds the account's deploy token installs the repo's locked dependencies, without their install
// scripts, and fetches nothing unpinned (the dashboard settings live in the config's header).
test("the clock's build installs from the lockfile and runs no install scripts", () => {
  const jobs = read("jobs/wrangler.toml");
  assert.match(jobs, /build command "cd \.\. && npm ci --ignore-scripts"/);
  assert.match(jobs, /deploy command "\.\.\/node_modules\/\.bin\/wrangler deploy"/);
  assert.doesNotMatch(jobs, /npx wrangler@/);
});

test("each tick leaves its time; the first tick of a Jersey day deletes once", async t => {
  const logs = t.mock.method(console, "log", () => {});
  const env = makeEnv(), gone = contact(env, "jane@example.je");
  // 23:00 UTC on the 24th is 00:00 on the 25th in Jersey (BST until 01:00 UTC on the 25th).
  await tick(env, "2026-10-24T23:00:00.000Z");
  assert.deepEqual(setting(env, "clock"), { at: "2026-10-24T23:00:00.000Z" });
  assert.equal(exists(env, gone), false);
  assert.deepEqual(setting(env, "retention_run"), { date: "2026-10-25", ok: true, attempts: 1, contacts: 1, viewings: 0 });
  // K8: the log says how many, never who.
  assert.deepEqual(logs.mock.calls.map(c => c.arguments), [["Retention pass", { contacts: 1, viewings: 0 }]]);
  // Later ticks of the same Jersey day only move the clock.
  const late = contact(env, "late@example.je");
  await tick(env, "2026-10-24T23:10:00.000Z");
  assert.deepEqual(setting(env, "clock"), { at: "2026-10-24T23:10:00.000Z" });
  assert.equal(exists(env, late), true);
  // 00:00 GMT on the 26th starts the next Jersey day.
  await tick(env, "2026-10-26T00:00:00.000Z");
  assert.equal(exists(env, late), false);
  assert.deepEqual(setting(env, "retention_run"), { date: "2026-10-26", ok: true, attempts: 1, contacts: 1, viewings: 0 });
});

test("a failed pass is logged, and the next tick tries again", async t => {
  t.mock.method(console, "log", () => {});
  const errors = t.mock.method(console, "error", () => {});
  const env = makeEnv(), gone = contact(env, "jane@example.je");
  const batch = env.DB.batch.bind(env.DB);
  let fail = 1;
  env.DB.batch = stmts => stmts.some(s => s.sql.includes("contact.deleted")) && fail-- > 0
    ? Promise.reject(new Error("D1 is down")) : batch(stmts);
  await tick(env, "2026-10-25T09:00:00.000Z");
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(exists(env, gone), true);
  await tick(env, "2026-10-25T09:10:00.000Z");
  assert.equal(exists(env, gone), false);
  assert.deepEqual(setting(env, "retention_run"), { date: "2026-10-25", ok: true, attempts: 2, contacts: 1, viewings: 0 });
});

test("the panel's poll stays a backup", async t => {
  t.mock.method(console, "log", () => {});
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-25T09:00:00.000Z") });
  const env = makeEnv();
  await tick(env, "2026-10-24T23:00:00.000Z");
  // The clock did the 25th: a poll that day deletes nothing.
  const kept = contact(env, "jane@example.je");
  assert.equal((await call(env, "GET", "/admin/notifications/counts", { cookie: await adminCookie() })).status, 200);
  assert.equal(exists(env, kept), true);
  // No tick on the 26th: the first poll of that day runs the pass.
  t.mock.timers.setTime(Date.parse("2026-10-26T08:00:00.000Z"));
  assert.equal((await call(env, "GET", "/admin/notifications/counts", { cookie: await adminCookie() })).status, 200);
  assert.equal(exists(env, kept), false);
});
