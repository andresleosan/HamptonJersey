// VIS-04: what the decision after a viewing leaves for the team. Proceed and Need more information leave a follow-up
// task in the Inbox; Not interested leaves nothing and touches neither the search nor a match. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./helpers.mjs";
import { plusDays, addMinutes } from "../../server/viewings.js";
import { followUp } from "../../server/viewing-cycle.js";

// Wednesday 28 October 2026, 12:05 in Jersey (GMT, the same as UTC).
const NOW = Date.parse("2026-10-28T12:05:00.000Z"), TODAY = "2026-10-28", ADMIN = "admin@example.test", ID = "HE-R001";
const KEY = "hermes-test-key-hermes-test-key-0123456789", NOTE = "Wants the survey FIXTURE-NOTE";

async function world(t, { ready = true } = {}) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const env = { ...makeEnv(), VIS08_CYCLE_READY: "1", HERMES_KEY: KEY, ...(ready ? { VIS04_OUTCOME_READY: "1" } : {}) };
  seedListing(env);
  return { env, cookie: await adminCookie() };
}
// Held yesterday and still confirmed: in Needs outcome.
const seedViewing = (env, o = {}) => {
  const v = { listing_id: ID, negotiator_id: 1, agent: "Gilberto Franco", kind: "In person", date: plusDays(TODAY, -1),
    time: "10:00", name: "Sam Buyer", email: "sam@example.je", status: "confirmed", created_at: T0, ...o };
  v.end_time ??= addMinutes(v.time, 30);
  const cols = Object.keys(v);
  return Number(env.DB.raw.prepare(`INSERT INTO viewing_requests (${cols}) VALUES (${cols.map(() => "?")})`)
    .run(...Object.values(v)).lastInsertRowid);
};
const row = (env, id) => env.DB.raw.prepare("SELECT * FROM viewing_requests WHERE id = ?").get(id);
const events = env => env.DB.raw.prepare("SELECT * FROM events ORDER BY id").all();
// The follow-up tasks; the Feed fact that every completed viewing leaves (NOT-01, action_required = 0) is not one.
const notices = env => env.DB.raw.prepare("SELECT * FROM notifications WHERE action_required = 1 ORDER BY id").all();
const act = (env, cookie, id, action, more = {}) => call(env, "PUT", `/admin/viewings/${id}`, { cookie,
  body: { action, updated_at: row(env, id).updated_at, ...more } });
const inbox = async (env, cookie) => (await call(env, "GET", "/admin/notifications?box=action", { cookie })).data;

test("the follow-up is a task for Proceed and Need more information, and nothing for Not interested or when off", () => {
  const on = { VIS04_OUTCOME_READY: "1" }, v = { name: "Sam Buyer" };
  assert.deepEqual(followUp(on, v, "proceed"), { category: "task", title: "Wants to proceed: Sam Buyer", action_required: true });
  assert.deepEqual(followUp(on, v, "more_info"), { category: "task", title: "Needs more information: Sam Buyer", action_required: true });
  for (const outcome of ["not_interested", null, undefined, "toString"]) assert.equal(followUp(on, v, outcome), null, String(outcome));
  for (const env of [{}, { VIS04_OUTCOME_READY: "0" }, undefined]) assert.equal(followUp(env, v, "proceed"), null);
});

test("switched off, an outcome leaves no task, as before", async t => {
  const { env, cookie } = await world(t, { ready: false });
  const id = seedViewing(env);
  assert.equal((await call(env, "GET", "/admin/viewings?tab=outcome", { cookie })).data.follow_up, undefined);
  assert.equal((await act(env, cookie, id, "complete", { outcome: "proceed" })).status, 200);
  assert.deepEqual([row(env, id).outcome, events(env).length, notices(env).length], ["proceed", 1, 0]);
});

test("Proceed on the spot leaves a follow-up task in the Inbox that opens the viewing; Hermes does not relay it", async t => {
  const { env, cookie } = await world(t);
  const id = seedViewing(env);
  assert.equal((await call(env, "GET", "/admin/viewings?tab=outcome", { cookie })).data.follow_up, true);
  assert.equal((await act(env, cookie, id, "complete", { outcome: "proceed", outcome_note: NOTE })).status, 200);
  const [event] = events(env), [notice] = notices(env);
  assert.deepEqual([event.type, event.actor, event.entity_id, JSON.parse(event.data)], ["viewing.completed", ADMIN, String(id), { outcome: "proceed" }]);
  assert.deepEqual([notice.event_id, notice.category, notice.title, notice.action_required, notice.resolved_at],
    [event.id, "task", "Wants to proceed: Sam Buyer", 1, null]);
  assert.equal(notices(env).length, 1);
  // The reason stays in the viewing's row: never in the event or the task.
  assert.ok(!JSON.stringify([events(env), notices(env)]).includes("FIXTURE-NOTE"));

  const { notifications, counts } = await inbox(env, cookie);
  assert.deepEqual(notifications.map(n => [n.title, n.category, n.link, n.target_exists]),
    [["Wants to proceed: Sam Buyer", "task", `#/viewings?viewing=${id}`, true]]);
  assert.deepEqual([counts.action, counts.task, counts.viewing], [1, 1, 0]);
  // Telegram's news are the website's new applicants and viewing requests only: this task sends nothing.
  const news = await call(env, "GET", "/hermes/news?after=0", { bearer: KEY, origin: null });
  assert.deepEqual([news.status, news.data.items], [200, []]);

  // Done in the Inbox, like any task.
  assert.equal((await call(env, "PUT", `/admin/notifications/${notice.id}`, { cookie, body: { resolved: true } })).status, 200);
  assert.deepEqual((await inbox(env, cookie)).notifications, []);
});

test("an answer recorded later leaves its task then, and the contact's activity is still touched", async t => {
  const { env, cookie } = await world(t);
  const contact = env.DB.raw.prepare(`INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at)
    VALUES ('Sam Buyer', 'sam@example.je', ?, ?, ?)`).run(T0, T0, T0).lastInsertRowid;
  const activity = () => env.DB.raw.prepare("SELECT last_activity_at FROM contacts WHERE id = ?").get(contact).last_activity_at;
  const id = seedViewing(env);
  assert.equal((await act(env, cookie, id, "complete", { outcome: null })).status, 200);
  assert.equal(notices(env).length, 0, "no answer yet: nothing to follow up");
  t.mock.timers.tick(3600000);
  assert.equal((await act(env, cookie, id, "feedback", { outcome: "more_info", outcome_note: NOTE })).status, 200);
  const event = events(env).at(-1), [notice] = notices(env);
  assert.deepEqual([event.type, JSON.parse(event.data)], ["viewing.feedback", { outcome: "more_info" }]);
  assert.deepEqual([notice.event_id, notice.category, notice.title, notice.action_required],
    [event.id, "task", "Needs more information: Sam Buyer", 1]);
  assert.equal(notices(env).length, 1);
  assert.equal(activity(), "2026-10-28T13:05:00.000Z", "the touch still follows the event, behind its task");
  assert.ok(!JSON.stringify([events(env), notices(env)]).includes("FIXTURE-NOTE"));
});

test("Not interested leaves no task and changes neither the search nor a match (master plan)", async t => {
  const { env, cookie } = await world(t);
  const contact = env.DB.raw.prepare(`INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at)
    VALUES ('Sam Buyer', 'sam@example.je', ?, ?, ?)`).run(T0, T0, T0).lastInsertRowid;
  const applicant = env.DB.raw.prepare(`INSERT INTO applicants (contact_id, operation, stage, source, created_at, updated_at)
    VALUES (?, 'rent', 'viewing', 'web', ?, ?)`).run(contact, T0, T0).lastInsertRowid;
  env.DB.raw.prepare(`INSERT INTO matches (applicant_id, listing_id, score, checks, status, created_at, updated_at)
    VALUES (?, ?, 80, '[]', 'shortlisted', ?, ?)`).run(applicant, ID, T0, T0);
  const state = () => JSON.stringify([env.DB.raw.prepare("SELECT * FROM applicants").all(), env.DB.raw.prepare("SELECT * FROM matches").all()]);
  const before = state();
  const spot = seedViewing(env), later = seedViewing(env, { time: "15:00" });
  assert.equal((await act(env, cookie, spot, "complete", { outcome: "not_interested", outcome_note: "Too small" })).status, 200);
  assert.equal((await act(env, cookie, later, "complete", { outcome: null })).status, 200);
  assert.equal((await act(env, cookie, later, "feedback", { outcome: "not_interested" })).status, 200);
  assert.deepEqual([row(env, spot).outcome, row(env, later).outcome], ["not_interested", "not_interested"]);
  assert.equal(notices(env).length, 0);
  assert.equal(state(), before, "the search and its match are as they were");
  // Proceed does not decide anything about them either: it only asks the team to follow up.
  const third = seedViewing(env, { time: "16:00" });
  assert.equal((await act(env, cookie, third, "complete", { outcome: "proceed" })).status, 200);
  assert.equal(state(), before);
  assert.deepEqual(events(env).filter(e => e.entity_type !== "viewing"), []);
});

test("a refused save leaves no task; deleting the viewing closes its task and takes the name out of it", async t => {
  const { env, cookie } = await world(t);
  const id = seedViewing(env);
  const stale = await call(env, "PUT", `/admin/viewings/${id}`, { cookie, body: { action: "complete", outcome: "proceed", updated_at: T0 } });
  assert.equal(stale.status, 409);
  assert.equal((await act(env, cookie, id, "complete", { outcome: "maybe" })).status, 400);
  assert.deepEqual([row(env, id).status, events(env).length, notices(env).length], ["confirmed", 0, 0]);

  assert.equal((await act(env, cookie, id, "complete", { outcome: "proceed" })).status, 200);
  assert.equal((await call(env, "DELETE", `/admin/viewings/${id}`, { cookie })).status, 200);
  const [notice] = notices(env);
  assert.deepEqual([notice.title, notice.resolved_by], ["Deleted viewing request", ADMIN]);
  assert.ok(notice.resolved_at);
  assert.ok(!JSON.stringify([events(env), notices(env)]).includes("Sam Buyer"));
});
