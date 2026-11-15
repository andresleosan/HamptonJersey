// AGE-08 (M06): an enquiry sent with no useful answer two working dates later (Monday to Friday, at the same Jersey time)
// gets one Inbox task to call the advertiser. A useful answer or a cancellation closes it. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./listing-client.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { extractFeatures } from "../../server/listing-features.js";
import { callDue, enquiries } from "../../server/consultations.js";
import { ENQUIRY_GATES } from "../../server/routes/matches.js";
import worker from "../../server/jobs.js";

const ADMIN = "admin@example.test", HOME = "HE-R001";
const { callPass } = enquiries(ENQUIRY_GATES);
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const rows = (env, sql, ...args) => env.DB.raw.prepare(sql).all(...args).map(r => ({ ...r }));
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };

function world({ ready = true } = {}) {
  const env = makeEnv();
  Object.assign(env, { AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1", AGE06_RESPONSES_READY: "1" },
    ready && { AGE08_CALL_TASKS_READY: "1" });
  seedListing(env, { id: HOME, title: "Fixture home", operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null,
    bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description: "Parking for two cars" }),
    parish: "St Helier", location: "St Helier" });
  return env;
}
const PHONES = [{ name: "Agency Desk", email: "desk@agency.example.test", phones: [{ label: "Office", number: "01534 000000" },
  { label: "Mobile", number: "07700 900001" }] }, { name: "Second Desk", email: "", phones: [{ label: "Office", number: "01534 000002" }] }];
// Sent on a Friday at 16:00 in Jersey (GMT): the call is due on Tuesday at 16:00.
const SENT = "2026-11-06T16:00:00.000Z", DUE = "2026-11-10T16:00:00.000Z", BEFORE = "2026-11-10T15:50:00.000Z";
async function sentEnquiry(env, { kind = "agency", contacts = PHONES, name = "Fixture Agency" } = {}) {
  const agency = ok(await req(env, "POST", "/admin/advertisers", { name, kind, channels: [], source_ids: [], listing_ids: [HOME],
    commission: "", photo_permission: "", contacts }), 201).advertiser.id;
  const c = run(env, "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES ('Ana Le Gros', 'age08@example.test', "
    + "'+447700900299', ?, ?, ?)", T0, T0, T0);
  const a = Number(run(env, `INSERT INTO applicants (contact_id, operation, stage, source, budget_max, bedrooms_min, parking_spaces, pets,
    household_adults, household_children, household_total, created_at, updated_at, requirement_priorities) VALUES (?, 'rent', 'searching', 'phone',
    2000, 2, 2, '[{"kind":"none"}]', 2, 1, 3, ?, ?, ?)`, Number(c.lastInsertRowid), T0, T0,
    JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] })).lastInsertRowid);
  await recomputeForApplicant(env, a, "system");
  const match = rows(env, "SELECT id FROM matches WHERE applicant_id = ?", a)[0].id;
  ok(await req(env, "PUT", `/admin/matches/${match}`, { status: "shortlisted", from: "found" }));
  const id = ok(await req(env, "POST", `/admin/matches/${match}/consultation`, { operation_id: randomUUID(), kind: "general", advertiser_id: agency }), 201)
    .consultation.id;
  run(env, "UPDATE consultations SET prepared_at = ? WHERE id = ?", "2026-11-06T15:00:00.000Z", id);
  ok(await req(env, "POST", `/admin/consultations/${id}/manual-send`, { operation_id: randomUUID(), revision: 1, sent_at: SENT, via: "email",
    evidence_ref: "Sent items FIXTURE" }));
  return { id, match, agency };
}
const calls = env => rows(env, "SELECT task_key, title, task_reason, due_at, resolved_at FROM notifications WHERE task_key LIKE '%:call'");
const respond = (env, id, o = {}) => req(env, "POST", `/admin/consultations/${id}/response`, { operation_id: randomUUID(), revision: 1,
  outcome: "available", answered_at: new Date(Date.now() - 3600e3).toISOString(), via: "phone", answered_by: "Desk", scope: "property",
  evidence_ref: "Call log FIXTURE", ...o });
const view = async env => ok(await req(env, "GET", `/admin/listings/${HOME}/consultations`)).consultations[0];

test("due two working dates after it was sent, Monday to Friday, at the same Jersey time", () => {
  for (const [sent, due] of [
    ["2026-11-13T16:00:00.000Z", "2026-11-17T16:00:00.000Z"], // Friday 16:00 → Tuesday 16:00
    ["2026-11-11T09:30:00.000Z", "2026-11-13T09:30:00.000Z"], // Wednesday → Friday
    ["2026-11-14T10:00:00.000Z", "2026-11-17T10:00:00.000Z"], // Saturday → Tuesday (Monday is the first working date)
    ["2026-11-15T18:45:00.000Z", "2026-11-17T18:45:00.000Z"], // Sunday → Tuesday
    ["2026-10-23T15:00:00.000Z", "2026-10-27T16:00:00.000Z"], // Friday 16:00 BST → Tuesday 16:00 GMT (clocks go back on the Sunday)
    ["2026-03-27T16:00:00.000Z", "2026-03-31T15:00:00.000Z"], // Friday 16:00 GMT → Tuesday 16:00 BST (clocks go forward)
    ["2026-07-02T23:30:00.000Z", "2026-07-06T23:30:00.000Z"], // Friday 00:30 in Jersey (Thursday in UTC) → Tuesday 00:30
  ]) assert.equal(callDue(sent), due, sent);
  for (const bad of [null, "", "not a date"]) assert.equal(callDue(bad), null, String(bad));
});

test("switched off, nothing is created and the enquiry shows no call", async () => {
  const env = world({ ready: false }), { id } = await sentEnquiry(env);
  await callPass(env, DUE);
  assert.deepEqual(calls(env), []);
  assert.equal("call_due_at" in await view(env), false);
  assert.ok(id);
});

test("one call task at the time it is due, with how many numbers the directory has, and none again on the next ticks", async () => {
  const env = world(), { id } = await sentEnquiry(env);
  assert.equal((await view(env)).call_due_at, DUE);
  await callPass(env, BEFORE);
  assert.deepEqual(calls(env), [], "not before it is due");
  await callPass(env, DUE);
  const events = () => rows(env, "SELECT type, data FROM events WHERE type = 'consultation.call_due'");
  for (const at of ["2026-11-10T16:10:00.000Z", "2026-11-10T16:20:00.000Z"]) await callPass(env, at);
  const [task] = calls(env);
  assert.equal(calls(env).length, 1);
  assert.equal(task.title, `Call Fixture Agency about Fixture home (${HOME})`);
  assert.match(task.task_reason, /3 phone numbers/);
  assert.deepEqual([task.due_at, task.resolved_at], [DUE, null]);
  assert.equal(events().length, 1, "one event over three ticks");
  // Neither the event nor the task copies a number or a contact's name or address.
  const copied = JSON.stringify([events(), calls(env)]);
  for (const text of ["01534", "07700", "Agency Desk", "desk@agency"]) assert.ok(!copied.includes(text), text);
  // A person marks it done: the clock does not reopen it.
  run(env, "UPDATE notifications SET resolved_at = ?, resolved_by = ? WHERE task_key LIKE '%:call'", DUE, ADMIN);
  await callPass(env, "2026-11-10T17:00:00.000Z");
  assert.equal(events().length, 1);
  assert.equal(calls(env)[0].resolved_at, DUE);
  assert.ok(id);
});

test("a useful answer before it is due means no task; after it, the task closes", async () => {
  const env = world(), { id } = await sentEnquiry(env);
  ok(await respond(env, id));
  await callPass(env, DUE);
  assert.deepEqual(calls(env), []);
  const env2 = world(), second = await sentEnquiry(env2);
  await callPass(env2, DUE);
  assert.equal(calls(env2)[0].resolved_at, null);
  ok(await respond(env2, second.id, { outcome: "unavailable", reason: "let" }));
  assert.notEqual(calls(env2)[0].resolved_at, null);
  assert.doesNotMatch(calls(env2)[0].task_reason, /phone number/);
  assert.equal("call_due_at" in await view(env2), false);
});

test("no useful answer, or a request for more information, keeps the one task open", async () => {
  const env = world(), { id } = await sentEnquiry(env);
  await callPass(env, DUE);
  ok(await respond(env, id, { outcome: "no_answer", scope: undefined }));
  ok(await respond(env, id, { outcome: "more_info", scope: undefined, revision: 1 }));
  await callPass(env, "2026-11-12T16:00:00.000Z");
  assert.deepEqual(calls(env).map(t => [t.due_at, t.resolved_at]), [[DUE, null]]);
  assert.equal((await view(env)).call_due_at, DUE);
});

test("a cancelled enquiry closes its call task", async () => {
  const env = world(), { id, match } = await sentEnquiry(env);
  await callPass(env, DUE);
  ok(await req(env, "PUT", `/admin/matches/${match}`, { status: "found", from: "shortlisted" }));
  ok(await req(env, "POST", `/admin/consultations/${id}/cancel`, { revision: 1 }));
  assert.notEqual(calls(env)[0].resolved_at, null);
  await callPass(env, "2026-11-10T16:10:00.000Z");
  assert.equal(calls(env).length, 1);
});

test("an advertiser with no phone, a private one or one whose personal data was removed: the task says so", async () => {
  const env = world();
  await sentEnquiry(env, { contacts: [{ name: "Agency Desk", email: "desk@agency.example.test", phones: [] }] });
  await callPass(env, DUE);
  assert.match(calls(env)[0].task_reason, /no phone number for Fixture Agency/);

  const env2 = world(), { agency } = await sentEnquiry(env2, { kind: "individual" });
  await callPass(env2, DUE);
  assert.equal(calls(env2)[0].title, `Call the advertiser about Fixture home (${HOME})`, "a private advertiser is never named in the Inbox");
  run(env2, "UPDATE advertisers SET name = 'Personal data removed', details = json_set(details, '$.contacts', json('[]')), suppressed_at = ? WHERE id = ?",
    DUE, agency);
  await callPass(env2, "2026-11-10T16:10:00.000Z");
  assert.equal(calls(env2).length, 1);
  assert.match(calls(env2)[0].task_reason, /personal data was removed/);
});

test("the clock runs the pass on each tick", async t => {
  t.mock.method(console, "error", () => {});
  const env = world(), { id } = await sentEnquiry(env);
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, env, { waitUntil() {} });
  assert.equal(calls(env).length, 1);
  assert.ok(id);
});

test("the website and the clock share the switch, so the panel and the Inbox agree", () => {
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^AGE08_CALL_TASKS_READY = "([01])"$/m)?.[1] ?? "0";
  assert.equal(flag("wrangler.toml"), flag("jobs/wrangler.toml"));
});

test("a long title cut at a space or inside an emoji is stored as the clock writes it: four ticks, one event, no new history", async () => {
  // "Call " + name puts the 200th character on the space, or splits the emoji in two.
  for (const name of [`${"A".repeat(194)} B`, `${"A".repeat(194)}\u{1F600}B`]) {
    const env = world();
    await sentEnquiry(env, { name });
    const history = () => rows(env, "SELECT COUNT(*) AS n FROM notification_task_history")[0].n;
    await callPass(env, DUE);
    const after = history();
    for (const at of ["2026-11-10T16:10:00.000Z", "2026-11-10T16:20:00.000Z", "2026-11-10T16:30:00.000Z"]) await callPass(env, at);
    assert.equal(rows(env, "SELECT 1 FROM events WHERE type = 'consultation.call_due'").length, 1, name);
    assert.equal(history(), after, name);
    const [task] = calls(env);
    assert.ok(task.title.length <= 200 && task.title === task.title.trim() && !task.title.includes("\uFFFD"), task.title);
  }
});

test("no call when the property was confirmed not available elsewhere, or no approved match counts any more; an open one closes", async () => {
  const unavailable = env => run(env, `INSERT INTO availability_confirmations (listing_id, status, reason, confirmed_at, source, channel, evidence_ref,
    recorded_at, recorded_by) VALUES (?, 'unavailable', 'let', ?, 'owner', 'phone', 'Call note FIXTURE', ?, ?)`, HOME, "2026-11-09T10:00:00.000Z",
    "2026-11-09T10:00:00.000Z", ADMIN);
  const unmatch = (env, match) => req(env, "PUT", `/admin/matches/${match}`, { status: "found", from: "shortlisted" }).then(r => ok(r));
  for (const [label, change] of [["not available", env => unavailable(env)], ["no match counts", (env, match) => unmatch(env, match)]]) {
    const before = world(), first = await sentEnquiry(before);
    await change(before, first.match);
    await callPass(before, DUE);
    assert.deepEqual(calls(before), [], `${label}: none created`);
    const open = world(), second = await sentEnquiry(open);
    await callPass(open, DUE);
    await change(open, second.match);
    for (const at of ["2026-11-10T16:10:00.000Z", "2026-11-10T16:20:00.000Z"]) await callPass(open, at);
    assert.equal(calls(open).length, 1);
    assert.notEqual(calls(open)[0].resolved_at, null, `${label}: closed`);
    assert.equal(rows(open, "SELECT 1 FROM events WHERE type LIKE 'consultation.call_%'").length, 2, `${label}: one event to open, one to close`);
  }
});

test("a call the clock closed because no match counted opens again once one does, and stays put after", async () => {
  const env = world(), { match } = await sentEnquiry(env);
  await callPass(env, DUE);
  ok(await req(env, "PUT", `/admin/matches/${match}`, { status: "found", from: "shortlisted" }));
  await callPass(env, "2026-11-10T16:10:00.000Z");
  ok(await req(env, "PUT", `/admin/matches/${match}`, { status: "shortlisted", from: "found" }));
  for (const at of ["2026-11-10T16:20:00.000Z", "2026-11-10T16:30:00.000Z"]) await callPass(env, at);
  assert.deepEqual(calls(env).map(t => [t.resolved_at, /3 phone numbers/.test(t.task_reason)]), [[null, true]]);
  assert.equal(rows(env, "SELECT 1 FROM events WHERE type LIKE 'consultation.call_%'").length, 3);
});

test("a sent date that is not a date is skipped, never stopping the pass or the panel", async () => {
  const env = world(), { id } = await sentEnquiry(env);
  run(env, "UPDATE consultations SET sent_at = 'not a date' WHERE id = ?", id);
  await callPass(env, DUE);
  assert.deepEqual(calls(env), []);
  assert.equal((await view(env)).call_due_at, null);
});
