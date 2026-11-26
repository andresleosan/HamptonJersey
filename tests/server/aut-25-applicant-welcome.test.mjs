// AUT-25: each new website applicant gets one welcome email (their own search and what is missing) through the approved
// queue that Hermes's carrier sends verbatim, the switch being the approval, and a data check that opens one Inbox task
// naming the issues only. Only searches registered after the switch was first seen on. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, call, T0 } from "./helpers.mjs";
import { claimForHermes, settleForHermes } from "../../server/email.js";
import { welcomePass, welcomeSettlePass, welcomeEmail } from "../../server/applicant-welcome.js";

const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const outbound = env => rows(env, "SELECT * FROM outbound WHERE template = 'applicant_welcome' ORDER BY id");
const stage = (env, id) => rows(env, "SELECT stage FROM applicants WHERE id = ?", id)[0].stage;
const notice = (env, id) => rows(env, `SELECT n.resolved_at FROM notifications n JOIN events e ON e.id = n.event_id
  WHERE e.entity_type = 'applicant' AND e.entity_id = ? AND n.category = 'new_applicant'`, String(id))[0];
const review = (env, id) => rows(env, "SELECT title, task_reason, resolved_at FROM notifications WHERE task_key = ?", `applicant-review:${id}`)[0];
const later = () => new Date(Date.now() + 1000).toISOString();

function world({ on = true } = {}) {
  const env = makeEnv();
  Object.assign(env, { HERMES_MAIL_READY: "1" }, on && { AUT25_APPLICANT_WELCOME_READY: "1" });
  run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('email', ?, ?, 'admin@example.test')`,
    JSON.stringify({ enabled: true, summary: false, recipients: [], revision: 1, approved_by: "admin@example.test", approved_at: T0 }), T0);
  return env;
}
let people = 0;
// A website registration as the website leaves it: a New search, its New applicant notice, created at `at`.
function applicant(env, { at = later(), email = `aut25-${++people}@example.test`, phone = `+4477009${String(people).padStart(5, "0")}`, operation = "rent",
  budget_max = 2000, move_in_date = "2027-01-15", housing_status = "entitled", source = "web", parishes = ["St Helier", "St Saviour"] } = {}) {
  const c = Number(run(env, "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES ('Fixture Person', ?, ?, ?, ?, ?)",
    email, phone, at, at, at).lastInsertRowid);
  const id = Number(run(env, `INSERT INTO applicants (contact_id, operation, stage, source, budget_max, bedrooms_min, bedrooms_max, parishes_wanted,
    move_in_date, housing_status, household_adults, household_children, household_total, created_at, updated_at)
    VALUES (?, ?, 'new', ?, ?, 2, 3, ?, ?, ?, 2, 1, 3, ?, ?)`, c, operation, source, budget_max, JSON.stringify(parishes), move_in_date,
    housing_status, at, at).lastInsertRowid);
  const e = Number(run(env, "INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, 'public', 'applicant', ?, 'applicant.created', '{}')",
    at, String(id)).lastInsertRowid);
  run(env, "INSERT INTO notifications (event_id, category, title, action_required, created_at) VALUES (?, 'new_applicant', 'New applicant', 1, ?)", e, at);
  return id;
}
// The switch first seen on now: start the clock with nobody to welcome.
async function started(env) { await welcomePass(env); return env; }

test("switched off: nothing is queued or checked, and a queued welcome is never claimed and is taken back", async () => {
  const env = world({ on: false });
  const id = applicant(env, { at: T0 }); // registered while off
  await welcomePass(env);
  assert.equal(outbound(env).length, 0);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM events WHERE type = 'applicant.welcome_checked'")[0].n, 0);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM app_settings WHERE key = 'applicant_welcome_since'")[0].n, 0);
  env.AUT25_APPLICANT_WELCOME_READY = "1";
  await welcomePass(env); // first seen on now: the applicant above registered before, so stays with the team
  assert.equal(outbound(env).length, 0);
  const b = applicant(env);
  await welcomePass(env);
  assert.equal(outbound(env).length, 1);
  env.AUT25_APPLICANT_WELCOME_READY = "0";
  assert.equal(await claimForHermes(env, "0"), null);
  await welcomeSettlePass(env);
  assert.equal(outbound(env)[0].status, "cancelled");
  assert.equal(stage(env, b), "new");
  assert.equal(stage(env, id), "new");
});

test("only new website searches: one welcome ever, approved by the switch, with their own search and what is missing", async () => {
  const env = await started(world());
  const id = applicant(env, { phone: null, move_in_date: null, housing_status: null });
  applicant(env, { source: "phone" }); // registered by the team: they already spoke
  await welcomePass(env);
  await welcomePass(env);
  const [o, ...more] = outbound(env);
  assert.equal(more.length, 0);
  assert.deepEqual([o.entity_id, o.status, o.approved_by, o.version], [String(id), "queued", "automation", 1]);
  for (const s of ["Looking to: rent", "St Helier, St Saviour", "Bedrooms: 2 to 3", "up to £2,000 a month", "please reply with",
    "a phone number", "when you would like to move", "your housing status"]) assert.ok(o.text.includes(s), s);
  assert.ok(!o.text.includes("your budget"));
  assert.ok(!o.text.includes("Fixture Person"));
  assert.equal(o.subject, "Welcome to Hampton Estates: your property search");
});

test("the claim is refused once the search changed, was taken, moved on, the address changed or sending is paused", async () => {
  for (const change of [
    (env, id) => run(env, "UPDATE applicants SET match_inputs_revision = match_inputs_revision + 1 WHERE id = ?", id),
    (env, id) => run(env, "UPDATE applicants SET assigned_to = 'admin@example.test' WHERE id = ?", id),
    (env, id) => run(env, "UPDATE applicants SET stage = 'searching' WHERE id = ?", id),
    (env, id) => run(env, "UPDATE contacts SET email = 'other@example.test' WHERE id = (SELECT contact_id FROM applicants WHERE id = ?)", id),
    env => run(env, "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('outbound', '{\"paused\":1}', ?, 'admin@example.test')", T0),
  ]) {
    const env = await started(world()), id = applicant(env);
    await welcomePass(env);
    change(env, id);
    assert.equal(await claimForHermes(env, "0"), null);
  }
  const env = await started(world()), id = applicant(env);
  await welcomePass(env);
  run(env, "UPDATE outbound SET created_at = ?", new Date(Date.now() - 25 * 3600e3).toISOString());
  assert.equal(await claimForHermes(env, "0"), null, "queued more than a day ago");
  await welcomeSettlePass(env);
  assert.equal(outbound(env)[0].status, "cancelled");
  assert.equal(stage(env, id), "new");
});

test("accepted by Gmail: the search moves to Searching by automation, its New applicant notice is done, and nothing is sent again", async () => {
  const env = await started(world()), id = applicant(env);
  await welcomePass(env);
  const c = await claimForHermes(env, "0");
  assert.match(c.subject, /^Welcome to Hampton Estates: your property search/);
  assert.equal(await settleForHermes(env, c.ref, c.token, "sent", "msg1", "thread1"), "ok");
  await welcomeSettlePass(env);
  await welcomeSettlePass(env);
  assert.equal(stage(env, id), "searching");
  assert.ok(notice(env, id).resolved_at);
  assert.equal(outbound(env)[0].gmail_thread_id, "thread1"); // the reply is read in that thread
  assert.equal(rows(env, "SELECT COUNT(*) n FROM events WHERE type = 'applicant.stage_changed' AND actor = 'automation'")[0].n, 1);
  await welcomePass(env);
  assert.equal(outbound(env).length, 1);
  assert.equal(await claimForHermes(env, "0"), null);
});

test("an unknown result waits for a person, is never sent again and leaves the search New", async () => {
  const env = await started(world()), id = applicant(env);
  await welcomePass(env);
  const c = await claimForHermes(env, "0");
  assert.equal(await settleForHermes(env, c.ref, c.token, "unknown", null, null), "ok");
  await welcomeSettlePass(env);
  await welcomePass(env);
  assert.deepEqual(outbound(env).map(o => [o.status, o.reviewed_at]), [["unknown", null]]); // Settings › Email: pending review
  assert.equal(await claimForHermes(env, "0"), null);
  assert.equal(stage(env, id), "new");
  assert.equal(notice(env, id).resolved_at, null);
});

test("the data check opens one task naming the issues, never the values", async () => {
  const env = await started(world());
  const a = applicant(env, { budget_max: 150 });
  const b = applicant(env, { operation: "buy", budget_max: 20000 });
  const c = applicant(env, { operation: "buy", budget_max: 650000, housing_status: null });
  await welcomePass(env);
  await welcomePass(env);
  assert.deepEqual(review(env, a), { title: "Check the new applicant's data", task_reason: "Budget looks unusual.", resolved_at: null });
  assert.equal(review(env, b).task_reason, "Budget looks unusual.");
  assert.equal(review(env, c), undefined);
  for (const s of ["150", "20,000", "20000"]) assert.ok(!JSON.stringify(rows(env, "SELECT title, task_reason FROM notifications")).includes(s), s);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM notifications WHERE task_key LIKE 'applicant-review:%'")[0].n, 2);
  // A buyer is not asked for a housing status; a known budget is not asked for.
  const buyer = outbound(env).find(o => o.entity_id === String(c));
  assert.ok(!buyer.text.includes("housing status") && !buyer.text.includes("please reply with"));
  assert.ok(buyer.text.includes("Budget: up to £650,000") && !buyer.text.includes("a month"));
});

test("without a valid email address: no welcome, and the task says so", async () => {
  const env = await started(world()), id = applicant(env, { email: "not-an-email" });
  await welcomePass(env);
  assert.equal(outbound(env).length, 0);
  assert.equal(review(env, id).task_reason, "No email address to welcome them.");
});

test("the email holds the applicant's own search only", () => {
  const { subject, text } = welcomeEmail({ operation: "rent", parishes_wanted: "[]", bedrooms_min: 1, bedrooms_max: null, budget_min: null,
    budget_max: null, move_in_date: null, housing_status: "licensed", phone: "+447700900123", email: "x@example.test" });
  assert.ok(text.includes("anywhere in Jersey") && text.includes("Bedrooms: 1 or more") && text.includes("- your budget"));
  for (const s of ["x@example.test", "+447700900123", "licensed", "http"]) assert.ok(!(subject + text).includes(s), s);
});

test("the website and the clock carry the same AUT25_APPLICANT_WELCOME_READY, off", () => {
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^AUT25_APPLICANT_WELCOME_READY = "(.*)"$/m)?.[1];
  assert.equal(flag("wrangler.toml"), "0");
  assert.equal(flag("jobs/wrangler.toml"), "0");
});

// Pre-switch check (26-nov): REG-14 finds a returning person by email OR phone. A second website registration with the
// same phone and another email creates no search (only "registered again" for the team), so no welcome goes to the new
// address; the one welcome goes to the address the first registration stored.
test("a repeat registration by phone with another email gets no welcome; the first one's address keeps the only one", async () => {
  const env = await started(world());
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, hostname: "hampton.test" }));
  const form = o => ({ operation: "rent", name: "Fixture Person", phone: "+447797000111", budget_max: 2500, bedrooms_min: 2,
    parishes_wanted: ["St Helier"], privacy: true, marketing: false, turnstile: "tok", ...o });
  assert.equal((await call(env, "POST", "/applicants", { body: form({ email: "first@example.test" }) })).status, 201);
  assert.equal((await call(env, "POST", "/applicants", { body: form({ email: "second@example.test" }) })).status, 201);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM applicants")[0].n, 1);
  assert.deepEqual(rows(env, "SELECT email FROM contacts"), [{ email: "first@example.test" }]);
  await welcomePass(env);
  assert.deepEqual(outbound(env).map(o => o.recipient), ["first@example.test"]);
});
