// AUT-17 (plan docs/roadmap/work/AUT-17/plan-correo-hermes.md, fase A): what Hermes may write from Hampton's Gmail.
// The mode follows the type's switch; paused or switched off nothing is claimed; a repeated result changes nothing; a
// claim with no answer goes unknown; a search with no viewing days gets a task for the client. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { makeEnv, seedListing, call, adminCookie, T0 } from "./listing-client.mjs";
import { recomputeForApplicant } from "../../server/match-store.js";
import { extractFeatures } from "../../server/listing-features.js";
import { cleanEmail } from "../../server/email-retention.js";
import { emailDay } from "../../server/email.js";

const KEY = "hermes-test-key-hermes-test-key-0123456789", ADMIN = "admin@example.test";
const HOME = "HE-R001", DESK = "desk@agency.example.test";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie(ADMIN) });
const door = (env, method, path, body) => call(env, method, `/hermes${path}`, { body, bearer: KEY, origin: null });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const next = async env => ok(await door(env, "POST", "/mail/next"));
const result = (env, t, body) => door(env, "POST", `/mail/${t.id}/result`, { token: t.token, ...body });
const SENT = { outcome: "sent", subject: "Enquiry", body: "Hello", message_id: "m1", thread_id: "t1" };

function world({ mail = true } = {}) {
  const env = { ...makeEnv(), HERMES_KEY: KEY, AGE03_ENQUIRIES_READY: "1", EST16_AVAILABILITY_READY: "1", EST15_UNAVAILABILITY_READY: "1",
    VIS17_MULTIPART_READY: "1", ...(mail && { HERMES_MAIL_READY: "1" }) };
  seedListing(env, { id: HOME, title: `Fixture home ${HOME}`, operation: "rent", availability: "to_let", rent: 1800, rent_period: "month", sale_price: null,
    bedrooms: 2, bathrooms: 2, housing_category: "registered", matchable: 1, ...extractFeatures({ description: "Parking for two cars" }),
    parish: "St Helier", location: "St Helier", road_name: "Rue de la Fixture" });
  return env;
}
let people = 0;
async function searching(env, name, days = null) {
  const n = ++people;
  const c = run(env, "INSERT INTO contacts (name, email, phone, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    name, `client-${n}@example.test`, `+4477009003${String(n).padStart(2, "0")}`, T0, T0, T0);
  const a = { contact_id: Number(c.lastInsertRowid), operation: "rent", stage: "searching", source: "phone", budget_max: 2000, bedrooms_min: 2,
    parking_spaces: 2, pets: '[{"kind":"none"}]', household_adults: 2, household_children: 1, household_total: 3, created_at: T0, updated_at: T0,
    viewing_availability: days, requirement_priorities: JSON.stringify({ version: 1, values: { budget: "must", bedrooms: "must", parking: "must" }, unknown: [] }) };
  const cols = Object.keys(a);
  const id = Number(run(env, `INSERT INTO applicants (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, ...Object.values(a)).lastInsertRowid);
  await recomputeForApplicant(env, id, "system");
  return id;
}
const CONTACTS = [{ name: "Agency Mobile", email: "", phones: [{ label: "Mobile", number: "07700 900555" }] },
  { name: "Agency Desk", email: DESK, phones: [] }];
const advertiser = async env => ok(await req(env, "POST", "/admin/advertisers", { name: "Fixture Agency", kind: "agency", channels: [], source_ids: [],
  listing_ids: [HOME], commission: "", photo_permission: "", contacts: CONTACTS }), 201).advertiser.id;
// An enquiry prepared by hand (AGE-03) for one approved match, waiting to be sent: AGE-05 is off, as in production.
async function enquiry(env) {
  const agency = await advertiser(env), ana = await searching(env, "Ana Le Gros");
  const m = ok(await req(env, "PUT", `/admin/matches/${row(env, "SELECT id FROM matches WHERE applicant_id = ? AND listing_id = ?", ana, HOME).id}`,
    { status: "shortlisted", from: "found" })).match.id;
  return ok(await req(env, "POST", `/admin/matches/${m}/consultation`, { operation_id: randomUUID(), kind: "general", advertiser_id: agency }), 201).consultation;
}
// An open VIS-17 proposal for a search, asking the client and the advertiser.
async function proposal(env, days, date = "2099-12-03") {
  await advertiser(env);
  const a = await searching(env, "Bea Renouf", days);
  const neg = Number(run(env, "INSERT INTO negotiators (name, hours, created_at, updated_at) VALUES ('Neg', '{}', ?, ?)", T0, T0).lastInsertRowid);
  const v = Number(run(env, `INSERT INTO viewing_requests (listing_id, kind, date, time, end_time, name, email, created_at, negotiator_id)
    VALUES (?, 'In person', '2026-12-02', '11:00', '11:30', 'Bea Renouf', 'bea@example.test', ?, ?)`, HOME, T0, neg).lastInsertRowid);
  run(env, `INSERT INTO viewing_proposals (viewing_id, revision, applicant_id, negotiator_id, date, time, end_time, from_status, from_date, from_time,
    required, created_at, created_by) VALUES (?, 1, ?, ?, ?, '10:00', '10:30', 'requested', '2026-12-02', '11:00', '["client","advertiser"]', ?, ?)`,
    v, a, neg, date, T0, ADMIN);
}
const mode = (env, type, on) => req(env, "POST", "/admin/hermes-mail", { type, on });

test("switched off, the door claims nothing and the panel shows nothing", async () => {
  const env = world({ mail: false });
  await enquiry(env);
  assert.deepEqual(await next(env), { task: null, reason: "switched_off" });
  assert.equal((await door(env, "POST", "/mail/1/result", { token: "a".repeat(64), outcome: "failed" })).status, 404);
  assert.equal((await mode(env, "availability", true)).status, 404);
  assert.equal("hermes_mail" in ok(await req(env, "GET", "/admin/automations")), false);
});

test("an enquiry waiting by hand is drafted while its switch is off, once, to the agency, naming no client", async () => {
  const env = world(), c = await enquiry(env);
  const { task } = await next(env);
  assert.equal(task.kind, "availability");
  assert.equal(task.mode, "draft");
  assert.deepEqual(task.to, { email: DESK, name: "Agency Desk" });
  assert.equal(task.facts.property.reference, HOME);
  assert.equal(JSON.stringify(task).includes("Ana"), false, "never the client");
  assert.deepEqual(await next(env), { task: null, reason: "none" }, "claimed once");
  assert.equal((await result(env, task, SENT)).status, 409, "claimed as a draft, it cannot come back sent");
  assert.equal((await result(env, { ...task, token: "b".repeat(64) }, { outcome: "failed" })).status, 403, "only the claim's token");
  const drafted = { outcome: "drafted", subject: "Enquiry", body: "Hello", message_id: "d1" };
  assert.equal(ok(await result(env, task, drafted)).task.status, "drafted");
  const before = row(env, "SELECT COUNT(*) AS n FROM events").n;
  assert.equal(ok(await result(env, task, drafted)).task.status, "drafted", "the same answer again");
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events").n, before);
  assert.equal(row(env, "SELECT status FROM consultations WHERE id = ?", c.id).status, "manual_pending", "a draft sends nothing");
  assert.deepEqual(await next(env), { task: null, reason: "none" }, "the version drafted is not written again");
});

test("with its switch on it is sent, and the enquiry is sent by email once", async () => {
  const env = world(), c = await enquiry(env);
  ok(await mode(env, "availability", true));
  const panel = ok(await req(env, "GET", "/admin/automations")).hermes_mail;
  assert.deepEqual([panel.switches.availability, panel.switches.viewings], [true, false]);
  const { task } = await next(env);
  assert.equal(task.mode, "send");
  ok(await result(env, task, SENT));
  ok(await result(env, task, SENT));
  const after = row(env, "SELECT status, sent_via, sent_at FROM consultations WHERE id = ?", c.id);
  assert.deepEqual([after.status, after.sent_via], ["sent", "email"]);
  assert.ok(after.sent_at);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'consultation.sent_by_hermes'").n, 1);
  assert.equal(row(env, "SELECT resolved_at FROM notifications WHERE task_key LIKE 'consultation:%'").resolved_at !== null, true);
  assert.equal(row(env, "SELECT day FROM mail_tasks WHERE id = ?", task.id).day, emailDay(new Date().toISOString()));
});

test("paused, suppressed or over the day's limit, nothing goes; a draft does not count", async () => {
  const env = world();
  await enquiry(env);
  ok(await req(env, "POST", "/admin/outbound/pause"));
  assert.deepEqual(await next(env), { task: null, reason: "paused" });
  ok(await req(env, "POST", "/admin/outbound/resume"));
  run(env, "INSERT INTO email_suppressions VALUES (?, ?, 'team')", createHash("sha256").update(DESK).digest("hex"), T0);
  assert.equal((await next(env)).task, null, "suppressed");
  run(env, "DELETE FROM email_suppressions");
  const day = emailDay(new Date().toISOString());
  for (let i = 0; i < 100; i++) run(env, "INSERT INTO email_attempts VALUES (?, NULL, ?, ?)", `t${i}`, day, T0);
  ok(await mode(env, "availability", true));
  assert.deepEqual(await next(env), { task: null, reason: "held" });
  ok(await mode(env, "availability", false));
  assert.equal((await next(env)).task.mode, "draft", "drafts are not limited");
});

test("a claim with no answer for 30 minutes is unknown, and its late answer still settles it", async t => {
  const env = world(), c = await enquiry(env);
  ok(await mode(env, "availability", true));
  const { task } = await next(env);
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 31 * 60e3 });
  assert.deepEqual(await next(env), { task: null, reason: "none" }, "never claimed again");
  assert.equal(row(env, "SELECT status FROM mail_tasks WHERE id = ?", task.id).status, "unknown");
  assert.equal(ok(await req(env, "GET", "/admin/automations")).hermes_mail.unknown, 1);
  assert.equal(ok(await result(env, task, SENT)).task.status, "sent");
  assert.equal(row(env, "SELECT status FROM consultations WHERE id = ?", c.id).status, "sent");
});

test("a viewing proposal goes to the agency, and to the client only when their search has no viewing days", async () => {
  const env = world();
  await proposal(env, null);
  const kinds = [];
  for (let t; (t = (await next(env)).task);) kinds.push([t.kind, t.to.email, t.mode]);
  assert.deepEqual(kinds.map(k => k[0]).sort(), ["viewing_agency", "viewing_client"]);
  assert.ok(kinds.find(k => k[0] === "viewing_agency")[1] === DESK);
  assert.ok(kinds.every(k => k[2] === "draft"));
  const other = world();
  await proposal(other, JSON.stringify({ days: ["mon"] }));
  const first = (await next(other)).task;
  assert.equal(first.kind, "viewing_agency");
  assert.equal((await next(other)).task, null);
});

test("retention clears what Hermes wrote after 30 days and the row after 90", async () => {
  const env = world();
  await enquiry(env);
  const { task } = await next(env);
  ok(await result(env, task, { outcome: "drafted", subject: "S", body: "B", message_id: "d1" }));
  await cleanEmail(env, new Date(Date.now() + 31 * 86400e3).toISOString());
  const r = row(env, "SELECT recipient, body, facts, status FROM mail_tasks WHERE id = ?", task.id);
  assert.deepEqual([r.recipient, r.body, r.facts, r.status], [null, null, null, "drafted"]);
  await cleanEmail(env, new Date(Date.now() + 91 * 86400e3).toISOString());
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM mail_tasks").n, 0);
});

// Review of 21-nov: an enquiry already written by Hermes is never written again, whatever version it is at now.
test("an enquiry Hermes already wrote, or is writing, is not written again after a new version", async () => {
  const env = world(), c = await enquiry(env);
  const { task } = await next(env);
  run(env, "UPDATE consultations SET revision = revision + 1 WHERE id = ?", c.id); // what Save changes does
  assert.equal((await next(env)).task, null, "while it is being written");
  ok(await result(env, task, { outcome: "drafted", subject: "S", body: "B", message_id: "d1" }));
  ok(await mode(env, "availability", true));
  assert.equal((await next(env)).task, null, "a draft a person may have sent from Gmail is not sent again");
  const other = world(), c2 = await enquiry(other);
  ok(await mode(other, "availability", true));
  const sending = (await next(other)).task;
  run(other, "UPDATE consultations SET revision = revision + 1 WHERE id = ?", c2.id);
  ok(await result(other, sending, SENT));
  assert.equal(row(other, "SELECT status FROM consultations WHERE id = ?", c2.id).status, "sent", "sent while a new version was saved");
});

test("old enquiries and proposals for a past date are not written", async () => {
  const env = world(), c = await enquiry(env);
  run(env, "UPDATE consultations SET prepared_at = ? WHERE id = ?", new Date(Date.now() - 8 * 86400e3).toISOString(), c.id);
  assert.equal((await next(env)).task, null, "an enquiry prepared over a week ago stays by hand");
  const old = world();
  await proposal(old, null, "2020-01-01");
  assert.equal((await next(old)).task, null);
});

test("a send counts in the app's daily email limit, as the app's own email does", async () => {
  const env = world();
  await enquiry(env);
  ok(await mode(env, "availability", true));
  await next(env);
  assert.equal(row(env, "SELECT COUNT(*) AS n FROM email_attempts WHERE outbound_id IS NULL").n, 1);
});

test("removing an advertiser's personal data (AGE-14) clears what Hermes holds and cancels a claim in flight", async () => {
  const env = { ...world(), AGE14_SUPPRESSION_READY: "1" }, c = await enquiry(env);
  ok(await mode(env, "availability", true));
  const { task } = await next(env);
  const id = row(env, "SELECT advertiser_id FROM consultations WHERE id = ?", c.id).advertiser_id;
  const p = ok(await req(env, "GET", `/admin/advertisers/${id}/suppression`));
  ok(await req(env, "POST", `/admin/advertisers/${id}/suppression`, { version: p.version, preview_hash: p.preview_hash, reason: "no_longer_needed" }));
  const r = row(env, "SELECT recipient, recipient_name, facts, status FROM mail_tasks WHERE id = ?", task.id);
  assert.deepEqual([r.recipient, r.recipient_name, r.facts, r.status], [null, null, null, "cancelled"]);
  assert.equal((await result(env, task, SENT)).status, 403, "its token is gone");
  assert.equal(row(env, "SELECT status FROM consultations WHERE id = ?", c.id).status, "manual_pending");
});
