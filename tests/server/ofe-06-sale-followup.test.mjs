import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie } from "./listing-client.mjs";
import worker from "../../server/jobs.js";

// OFE-06: one internal weekly review task per sale in progress and Jersey week, off until the team sets day and time.
const ADMIN = "admin@example.test";
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const row = (env, sql, ...args) => env.DB.raw.prepare(sql).get(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args);
const tick = (env, iso) => worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.parse(iso) }, env, { waitUntil() {} });
const at = (t, iso) => t.mock.timers.setTime(Date.parse(iso));
const tasks = env => rows(env, "SELECT task_key, category, title, task_reason, target_kind, target_id, resolved_at, resolved_by FROM notifications WHERE task_key LIKE 'sale-followup:%' ORDER BY task_key");
const followups = env => rows(env, "SELECT sale_id, week_key, status, reviewed_by, note FROM sale_followups ORDER BY sale_id, week_key");

let n = 0;
function world(t, ready = true) {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-05T10:00:00.000Z") });
  t.mock.method(console, "log", () => {});
  const env = makeEnv();
  if (ready) env.OFE06_WEEKLY_REVIEW_READY = "1";
  for (const [id, title] of [["HE-R001", "Le Bernage"], ["HE-R002", "La Rocque"]]) seedListing(env, { id, title, matchable: 1 });
  return env;
}
async function sale(env, listing_id = "HE-R001") {
  n++;
  const a = await req(env, "POST", "/admin/applicants", { name: `Buyer ${n}`, email: `followup${n}@example.je`, source: "phone",
    operation: "buy", budget_max: 900000 });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const o = await req(env, "POST", "/admin/offers", { listing_id, applicant_id: a.data.id, amount: 750000 });
  assert.equal(o.status, 201, JSON.stringify(o.data));
  const s = await req(env, "POST", `/admin/offers/${o.data.offer.id}/accept`);
  assert.equal(s.status, 201, JSON.stringify(s.data));
  return s.data.sale_id;
}
const monday9 = env => req(env, "PUT", "/admin/sale-followups/schedule", { enabled: true, day: "mon", time: "09:00" });

test("without the flag there are no routes and the clock creates nothing", async t => {
  const env = world(t, false), id = await sale(env);
  env.DB.raw.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES('sale_followup_schedule',
    '{"enabled":true,"day":"mon","time":"09:00","activatedAt":"2026-11-01T00:00:00.000Z"}','2026-11-01T00:00:00.000Z')`).run();
  assert.equal((await req(env, "GET", "/admin/sale-followups/schedule")).status, 404);
  assert.equal((await req(env, "GET", `/admin/sales/${id}/followup`)).status, 404);
  at(t, "2026-11-09T09:05:00.000Z");
  await tick(env, "2026-11-09T09:00:00.000Z");
  assert.deepEqual(tasks(env), []);
});

test("the schedule is off until the team sets it, and only a valid day and time turn it on", async t => {
  const env = world(t);
  await sale(env);
  assert.deepEqual((await req(env, "GET", "/admin/sale-followups/schedule")).data,
    { schedule: { enabled: false, day: null, time: null, activated_at: null } });
  at(t, "2026-11-09T09:05:00.000Z");
  await tick(env, "2026-11-09T09:00:00.000Z");
  assert.deepEqual(tasks(env), [], "no configuration, no task");
  for (const body of [{ enabled: true }, { enabled: true, day: "monday", time: "09:00" }, { enabled: true, day: "mon", time: "9:00" },
    { enabled: "yes", day: "mon", time: "09:00" }]) {
    const r = await req(env, "PUT", "/admin/sale-followups/schedule", body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM app_settings WHERE key='sale_followup_schedule'").n, 0);
  const on = await monday9(env);
  assert.equal(on.status, 200);
  assert.deepEqual(on.data.schedule, { enabled: true, day: "mon", time: "09:00", activated_at: "2026-11-09T09:05:00.000Z" });
  at(t, "2026-11-09T10:00:00.000Z");
  assert.equal((await monday9(env)).data.schedule.activated_at, "2026-11-09T09:05:00.000Z", "same schedule keeps its start");
  const off = await req(env, "PUT", "/admin/sale-followups/schedule", { enabled: false });
  assert.deepEqual(off.data.schedule, { enabled: false, day: "mon", time: "09:00", activated_at: null });
});

test("one internal task per sale and Jersey week, repeated ticks change nothing and nothing goes out", async t => {
  const env = world(t), first = await sale(env), second = await sale(env, "HE-R002");
  at(t, "2026-11-06T12:00:00.000Z");
  await monday9(env);
  at(t, "2026-11-09T08:55:00.000Z");
  await tick(env, "2026-11-09T08:50:00.000Z");
  assert.deepEqual(tasks(env), [], "not due before Monday 09:00 Jersey");
  at(t, "2026-11-09T09:05:00.000Z");
  await tick(env, "2026-11-09T09:00:00.000Z");
  await tick(env, "2026-11-09T09:00:00.000Z");
  at(t, "2026-11-09T09:15:00.000Z");
  await tick(env, "2026-11-09T09:10:00.000Z");
  const reason = "Week of 9 November 2026: check the steps and record any step taken outside the app.";
  assert.deepEqual(tasks(env).map(x => ({ ...x })), [first, second].map(id => ({ task_key: `sale-followup:${id}:2026-11-09`,
    category: "task", title: "Weekly sale review", task_reason: reason, target_kind: "sale", target_id: String(id),
    resolved_at: null, resolved_by: null })));
  assert.deepEqual(followups(env).map(f => f.status), ["open", "open"]);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM outbound").n, 0, "no message to lawyers or clients");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events WHERE type='sale.followup_due'").n, 2);
  // The Inbox shows it as an ordinary open task on the sale.
  const inbox = (await req(env, "GET", "/admin/notifications?box=action")).data;
  assert.ok(JSON.stringify(inbox).includes("Weekly sale review"));
  // The next week gets its own task.
  at(t, "2026-11-16T09:05:00.000Z");
  await tick(env, "2026-11-16T09:00:00.000Z");
  assert.equal(followups(env).length, 4);
});

test("a sale agreed after the review time waits for the next week", async t => {
  const env = world(t);
  at(t, "2026-11-06T12:00:00.000Z");
  await monday9(env);
  at(t, "2026-11-09T09:30:00.000Z");
  await sale(env);
  at(t, "2026-11-09T09:35:00.000Z");
  await tick(env, "2026-11-09T09:30:00.000Z");
  assert.deepEqual(tasks(env), []);
});

test("a completed or fallen-through sale resolves its open review", async t => {
  const env = world(t), done = await sale(env), fell = await sale(env, "HE-R002");
  at(t, "2026-11-06T12:00:00.000Z");
  await monday9(env);
  at(t, "2026-11-09T09:05:00.000Z");
  await tick(env, "2026-11-09T09:00:00.000Z");
  assert.equal((await req(env, "PUT", `/admin/sales/${done}/milestones/passing`, { done_on: "2026-11-09" })).status, 200);
  assert.equal((await req(env, "POST", `/admin/sales/${done}/complete`)).status, 200);
  assert.equal((await req(env, "POST", `/admin/sales/${fell}/fall-through`, { reason: "finance" })).status, 200);
  at(t, "2026-11-09T09:15:00.000Z");
  await tick(env, "2026-11-09T09:10:00.000Z");
  assert.deepEqual(followups(env).map(f => f.status), ["cancelled", "cancelled"]);
  assert.ok(tasks(env).every(x => x.resolved_at), "no open task for a closed sale");
  at(t, "2026-11-16T09:05:00.000Z");
  await tick(env, "2026-11-16T09:00:00.000Z");
  assert.equal(followups(env).length, 2, "closed sales get no new week");
});

test("a review needs the steps as they are now and resolves the task without changing any step", async t => {
  const env = world(t), id = await sale(env), other = await sale(env, "HE-R002");
  at(t, "2026-11-06T12:00:00.000Z");
  await monday9(env);
  at(t, "2026-11-09T09:05:00.000Z");
  await tick(env, "2026-11-09T09:00:00.000Z");
  const view = (await req(env, "GET", `/admin/sales/${id}/followup`)).data;
  assert.equal(view.followups.length, 1);
  const [{ id: fid, week_key, status }] = view.followups;
  assert.deepEqual({ week_key, status }, { week_key: "2026-11-09", status: "open" });
  const steps = () => rows(env, "SELECT * FROM sale_milestones WHERE sale_id = ? ORDER BY key", id);
  // Wrong sale: not found, nothing written.
  assert.equal((await req(env, "POST", `/admin/sales/${other}/followups/${fid}/review`, { snapshot: view.snapshot })).status, 404);
  // A step changed after the page was read: the review is stale.
  assert.equal((await req(env, "PUT", `/admin/sales/${id}/milestones/lawyers`, { planned_on: "2026-11-20" })).status, 200);
  const before = steps();
  const stale = await req(env, "POST", `/admin/sales/${id}/followups/${fid}/review`, { snapshot: view.snapshot, note: "Chased" });
  assert.equal(stale.status, 409);
  assert.match(stale.data.error, /steps changed/i);
  assert.equal(followups(env)[0].status, "open");
  const fresh = (await req(env, "GET", `/admin/sales/${id}/followup`)).data;
  assert.equal((await req(env, "POST", `/admin/sales/${id}/followups/${fid}/review`, { snapshot: fresh.snapshot, note: "x".repeat(301) })).status, 400);
  const ok = await req(env, "POST", `/admin/sales/${id}/followups/${fid}/review`, { snapshot: fresh.snapshot, note: "Searches chased" });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(steps(), before, "a review never changes a step");
  assert.deepEqual({ ...followups(env).find(f => f.sale_id === id) }, { sale_id: id, week_key: "2026-11-09", status: "reviewed",
    reviewed_by: ADMIN, note: "Searches chased" });
  const task = tasks(env).find(x => x.target_id === String(id));
  assert.ok(task.resolved_at);
  assert.equal(task.resolved_by, ADMIN);
  assert.equal((await req(env, "POST", `/admin/sales/${id}/followups/${fid}/review`, { snapshot: fresh.snapshot })).status, 409);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM outbound").n, 0);
});

test("recording an outside step keeps a minimal reference and never marks a milestone", async t => {
  const env = world(t), id = await sale(env);
  const steps = () => rows(env, "SELECT * FROM sale_milestones WHERE sale_id = ? ORDER BY key", id);
  const before = steps();
  for (const body of [{ party: "judge", occurred_on: "2026-11-05", reference: "Call" },
    { party: "buyer_lawyer", occurred_on: "2026-11-06", reference: "Call" },
    { party: "buyer_lawyer", occurred_on: "2026-11-05", reference: "" },
    { party: "buyer_lawyer", occurred_on: "2026-11-05", reference: "x".repeat(121) }]) {
    const r = await req(env, "POST", `/admin/sales/${id}/contacts`, body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  const r = await req(env, "POST", `/admin/sales/${id}/contacts`, { party: "buyer_lawyer", occurred_on: "2026-11-05",
    reference: "Email 5 Nov, searches requested" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.deepEqual(steps(), before);
  const view = (await req(env, "GET", `/admin/sales/${id}/followup`)).data;
  assert.deepEqual(view.contacts.map(c => [c.party, c.occurred_on, c.reference, c.created_by]),
    [["buyer_lawyer", "2026-11-05", "Email 5 Nov, searches requested", ADMIN]]);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM outbound").n, 0);
  assert.equal((await call(env, "POST", `/admin/sales/${id}/contacts`, { body: { party: "buyer", occurred_on: "2026-11-05",
    reference: "Call" } })).status, 401);
});
