import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { stoppedFlags } from "../../server/routes/automations.js";
import { runRetention, RETENTION_CAP } from "../../server/retention.js";

// AUT-01 (spec 2026-11-01): the Automations screen, the stopped count, the panel's pause and the jobs' 90 days.
const KEY = "hermes-test-key-hermes-test-key-0123456789";
const ADMIN = "admin@example.test";
const NOW = "2026-11-01T12:00:00.000Z";
const ago = min => new Date(Date.parse(NOW) - min * 60e3).toISOString();
const daysAgo = d => ago(d * 1440);
const at = (t, iso = NOW) => t.mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) });
const admin = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const insert = (env, table, o) => {
  const cols = Object.keys(o);
  return Number(env.DB.raw.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...cols.map(c => o[c])).lastInsertRowid);
};
const setting = (env, key, value) => insert(env, "app_settings", { key, value: JSON.stringify(value), updated_at: T0, updated_by: "system" });
const job = (env, o) => insert(env, "jobs", { kind: "listing_text", listing_id: "HE-R001", requested_by: ADMIN, created_at: T0, ...o });
const counts = async env => (await admin(env, "GET", "/admin/notifications/counts")).data;

test("stoppedFlags: the clock after 30 minutes or never, Hermes after 15 and never before its first request", () => {
  const now = Date.parse(NOW);
  assert.deepEqual(stoppedFlags(ago(29), ago(14), now), { clock: false, hermes: false });
  assert.deepEqual(stoppedFlags(ago(31), ago(16), now), { clock: true, hermes: true });
  assert.deepEqual(stoppedFlags(null, null, now), { clock: true, hermes: false });
});

test("counts.stalled rides the counts poll; Hermes's status does not carry it", async t => {
  at(t);
  const env = { ...makeEnv(), HERMES_KEY: KEY };
  assert.equal((await counts(env)).stalled, 1, "no clock run recorded");
  setting(env, "clock", { at: ago(5) });
  assert.equal((await counts(env)).stalled, 0, "Hermes never connected: no warning");
  setting(env, "hermes", { at: ago(16) });
  assert.equal((await counts(env)).stalled, 1);
  env.DB.raw.prepare("UPDATE app_settings SET value = json_object('at', ?) WHERE key = 'clock'").run(ago(31));
  assert.equal((await counts(env)).stalled, 2);
  const status = await call(env, "GET", "/hermes/status", { bearer: KEY, origin: null });
  assert.equal("stalled" in status.data.counts, false);
});

test("GET /admin/automations: last runs, Hermes's month, waiting drafts and recent jobs, without who or the texts", async t => {
  at(t);
  const env = makeEnv();
  seedListing(env);
  seedListing(env, { id: "HE-R002", title: "Rue des Pres" });
  assert.equal((await call(env, "GET", "/admin/automations")).status, 401);
  let { data } = await admin(env, "GET", "/admin/automations");
  assert.deepEqual(data.clock, { at: null, stopped: true });
  assert.equal(data.retention, null);
  assert.deepEqual(data.hermes.month, { used: 0, discarded: 0, failed: 0 });
  assert.equal(data.hermes.at, null);
  assert.equal(data.hermes.stopped, false);

  setting(env, "clock", { at: ago(3) });
  setting(env, "hermes", { at: ago(2) });
  setting(env, "retention_run", { date: "2026-11-01", ok: true, attempts: 1, contacts: 2, viewings: 1 }); // before AUT-01: no jobs
  job(env, { status: "used", decided_at: daysAgo(1), decided_by: ADMIN, result: JSON.stringify({ title: "Secret draft title" }) });
  job(env, { status: "discarded", decided_at: daysAgo(2), decided_by: ADMIN });
  job(env, { status: "failed", claimed_at: daysAgo(3), attempts: 3, requested_by: "hermes" });
  job(env, { status: "used", decided_at: daysAgo(40), decided_by: ADMIN });
  const draft = job(env, { listing_id: "HE-R002", status: "draft", drafted_at: ago(30), result: JSON.stringify({ title: "Another secret" }) });
  for (let i = 0; i < 20; i++) job(env, { status: "discarded", decided_at: daysAgo(60), decided_by: ADMIN });

  ({ data } = await admin(env, "GET", "/admin/automations"));
  assert.deepEqual(data.clock, { at: ago(3), stopped: false });
  assert.deepEqual(data.retention, { date: "2026-11-01", ok: true, attempts: 1, contacts: 2, viewings: 1, jobs: 0, chats: 0 });
  assert.equal(data.hermes.at, ago(2));
  assert.deepEqual(data.hermes.month, { used: 1, discarded: 1, failed: 1 });
  assert.deepEqual(data.hermes.waiting, [{ id: draft, listing_id: "HE-R002", title: "Rue des Pres", drafted_at: ago(30) }]);
  assert.equal(data.hermes.recent.length, 20);
  assert.ok(data.hermes.recent.every((j, i, a) => !i || a[i - 1].id > j.id), "newest first");
  env.DB.raw.prepare("DELETE FROM jobs WHERE decided_at = ?").run(daysAgo(60));
  const final = (await admin(env, "GET", "/admin/automations")).data, recent = final.hermes.recent;
  assert.deepEqual(recent.map(j => [j.status, j.by, j.title]), [["draft", "Team", "Rue des Pres"], ["used", "Team", "Le Bernage"],
    ["failed", "Hermes", "Le Bernage"], ["discarded", "Team", "Le Bernage"], ["used", "Team", "Le Bernage"]]);
  assert.equal(recent.find(j => j.status === "failed").closed_at, daysAgo(3), "a failed job closes when it was last taken");
  const text = JSON.stringify(final);
  for (const secret of [ADMIN, "Secret draft title", "Another secret"]) assert.ok(!text.includes(secret), secret);
});

test("POST /admin/outbound/pause: any admin pauses; a pause already asked keeps who and when", async t => {
  at(t);
  const env = { ...makeEnv(), HERMES_KEY: KEY };
  assert.equal((await call(env, "POST", "/admin/outbound/pause")).status, 401);
  assert.equal((await call(env, "POST", "/admin/outbound/pause", { cookie: await adminCookie(), origin: "https://evil.test" })).status, 403);
  const p = await admin(env, "POST", "/admin/outbound/pause");
  assert.deepEqual(p.data, { outbound: { paused: true, at: NOW, by: ADMIN } });
  assert.deepEqual((await counts(env)).outbound, { at: NOW, by: ADMIN });
  await admin(env, "POST", "/admin/outbound/resume");
  assert.equal((await counts(env)).outbound, null);

  await call(env, "POST", "/hermes/pause", { bearer: KEY, origin: null });
  t.mock.timers.setTime(Date.parse(NOW) + 60e3);
  assert.deepEqual((await admin(env, "POST", "/admin/outbound/pause")).data, { outbound: { paused: true, at: NOW, by: "hermes" } });
  assert.deepEqual((await counts(env)).outbound, { at: NOW, by: "hermes" });
});

test("the daily pass deletes Hermes jobs closed or untouched for 90 days, never a draft", async () => {
  const env = makeEnv();
  seedListing(env);
  seedListing(env, { id: "HE-R002" });
  for (const id of ["HE-R003", "HE-R004", "HE-R005", "HE-R006", "HE-R007"]) seedListing(env, { id }); // one open job each
  [
    job(env, { status: "queued", created_at: daysAgo(91) }),
    job(env, { listing_id: "HE-R002", status: "failed", created_at: daysAgo(120), claimed_at: daysAgo(91) }),
    job(env, { status: "used", created_at: daysAgo(100), decided_at: daysAgo(91) }),
    job(env, { listing_id: "HE-R004", status: "working", created_at: daysAgo(95), claimed_at: daysAgo(91) }), // abandoned
    job(env, { status: "discarded", created_at: daysAgo(95), decided_at: daysAgo(91) }),
    job(env, { listing_id: "HE-R005", status: "queued", created_at: ago(90 * 1440 + 1) }),
  ];
  const kept = [
    job(env, { listing_id: "HE-R003", status: "draft", created_at: daysAgo(200), drafted_at: daysAgo(199) }),
    job(env, { status: "used", created_at: daysAgo(100), decided_at: daysAgo(89) }),
    job(env, { listing_id: "HE-R002", status: "queued", created_at: daysAgo(10) }),
    job(env, { status: "used", created_at: daysAgo(100), claimed_at: daysAgo(99), decided_at: daysAgo(1) }), // decided_at counts
    job(env, { listing_id: "HE-R006", status: "queued", created_at: daysAgo(90) }),
    job(env, { listing_id: "HE-R007", status: "queued", created_at: ago(90 * 1440 - 1) }),
  ];
  const r = await runRetention(env, NOW);
  assert.equal(r.jobs, 6);
  const left = env.DB.raw.prepare("SELECT id FROM jobs ORDER BY id").all().map(j => j.id);
  assert.deepEqual(left, kept);
});

test("the pass deletes at most 500 jobs, oldest first", async () => {
  const env = makeEnv();
  seedListing(env);
  const newest = job(env, { status: "used", created_at: daysAgo(200), decided_at: daysAgo(91) });
  for (let i = 0; i < RETENTION_CAP; i++) job(env, { status: "used", created_at: daysAgo(200), decided_at: daysAgo(92) });
  assert.equal((await runRetention(env, NOW)).jobs, RETENTION_CAP);
  assert.deepEqual(env.DB.raw.prepare("SELECT id FROM jobs").all().map(j => j.id), [newest]);
});
