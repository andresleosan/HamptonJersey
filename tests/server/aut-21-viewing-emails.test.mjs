// AUT-21: two viewing emails through the approved queue (outbound) that Hermes's carrier sends verbatim from Hampton's
// Gmail: the feedback request one hour after a viewing is marked Completed, and the notice to the other viewings'
// clients 24 hours after their property is let or sold, when the clock cancels those viewings. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, seedListing, T0 } from "./helpers.mjs";
import { sha256 } from "../../server/http.js";
import { jerseyNow, addMinutes } from "../../server/viewings.js";
import { claimForHermes, settleForHermes } from "../../server/email.js";
import { processExpiredRentalClosures } from "../../server/rental-closure-job.js";
import { viewingEmailClaimSql } from "../../server/viewing-email-check.js";
import { viewingEmailPass, viewingEmailSettlePass, feedbackEmail, closedEmail } from "../../server/viewing-emails.js";

const H = 3600e3, D = 24 * H, HOME = "HE-R001";
const run = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const rows = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const outbound = env => rows(env, "SELECT * FROM outbound ORDER BY id");
const status = (env, id) => rows(env, "SELECT status FROM viewing_requests WHERE id = ?", id)[0].status;
const at = t => { const j = jerseyNow(new Date(t)); return { date: j.date, time: j.time }; };
const iso = t => new Date(t).toISOString();
const openTasks = (env, id) => rows(env, `SELECT n.title FROM notifications n JOIN events e ON e.id = n.event_id
  WHERE e.entity_type = 'viewing' AND e.entity_id = ? AND n.category = 'task' AND n.resolved_at IS NULL ORDER BY n.id`, String(id)).map(t => t.title);

function world({ on = true, listing = {} } = {}) {
  const env = makeEnv();
  Object.assign(env, { HERMES_MAIL_READY: "1", PUB16_TIMED_CLOSURE_READY: "1" }, on && { AUT21_VIEWING_EMAILS_READY: "1" });
  seedListing(env, { id: HOME, title: "Fixture Cottage", location: "St Helier", operation: "sale", availability: "for_sale", ...listing });
  run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('email', ?, ?, 'admin@example.test')`,
    JSON.stringify({ enabled: true, summary: false, recipients: [], revision: 1, approved_by: "admin@example.test", approved_at: T0 }), T0);
  // The carrier is running (emailStop): the clock has Hermes on and the carrier asked the door just now.
  const now = iso(Date.now());
  run(env, "INSERT INTO app_settings VALUES ('email_worker', ?, ?, 'system')", JSON.stringify({ at: now, ready: false, hermes: true }), now);
  run(env, "INSERT INTO app_settings VALUES ('hermes_mail_seen', ?, ?, 'system')", JSON.stringify({ at: now }), now);
  return env;
}
// The switch's first-on moment, as the clock would have stored it.
const since = (env, t) => run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('aut21_viewing_emails', ?, ?, 'system')
  ON CONFLICT (key) DO UPDATE SET value = excluded.value`, JSON.stringify({ since: iso(t) }), iso(t));
let n = 0;
function viewing(env, slot, { status: s = "confirmed", email = `client-${++n}@example.test`, created = T0, phone = null, name = "Fixture Viewer" } = {}) {
  return Number(run(env, `INSERT INTO viewing_requests (listing_id, kind, date, time, end_time, name, email, phone, status, created_at,
    updated_at, updated_by, negotiator_id, notes) VALUES (?, 'In person', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin@example.test', 1,
    'Key safe code 4321, tenant has a dog')`, HOME, slot.date, slot.time, addMinutes(slot.time, 30), name, email, phone, s, created, created).lastInsertRowid);
}
// Marked Completed at `when` (with no answer yet), as the panel's Mark completed writes it.
function complete(env, id, when, outcome = null) {
  run(env, "UPDATE viewing_requests SET status = 'completed', outcome = ?, updated_at = ? WHERE id = ?", outcome, iso(when), id);
  run(env, `INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, 'admin@example.test', 'viewing', ?, 'viewing.completed', ?)`,
    iso(when), String(id), JSON.stringify({ outcome }));
}

// --- Feedback request -------------------------------------------------------------------------------------------------

test("one hour after a viewing is marked Completed, one feedback request is queued, once", async () => {
  const env = world(), end = Date.parse("2026-12-10T15:00:00Z"), done = end + 10 * 60e3;
  since(env, end - D);
  const id = viewing(env, at(end - 30 * 60e3));
  complete(env, id, done);
  await viewingEmailPass(env, done + 59 * 60e3);
  assert.equal(outbound(env).length, 0, "not before the hour");
  await viewingEmailPass(env, done + H);
  await viewingEmailPass(env, done + H + 10 * 60e3);
  const [o, ...more] = outbound(env);
  assert.equal(more.length, 0);
  assert.deepEqual([o.template, o.entity_id, o.status, o.approved_by, o.recipient], ["viewing_feedback", String(id), "queued", "automation",
    rows(env, "SELECT email FROM viewing_requests WHERE id = ?", id)[0].email]);
  for (const s of ["Fixture Cottage", HOME, "St Helier", "10 December 2026", "reply to this email"]) assert.ok(o.text.includes(s), s);
  for (const s of ["4321", "dog", "Fixture Viewer", "http"]) assert.ok(!(o.subject + o.text).includes(s), s);
});

test("never after a no-show, nor once the client's answer is recorded", async () => {
  const env = world(), end = Date.parse("2026-12-10T15:00:00Z");
  since(env, end - D);
  const noShow = viewing(env, at(end - 30 * 60e3), { status: "no_show" });
  run(env, `INSERT INTO events (at, actor, entity_type, entity_id, type) VALUES (?, 'admin@example.test', 'viewing', ?, 'viewing.no_show')`, iso(end), String(noShow));
  const answered = viewing(env, at(end - 30 * 60e3));
  complete(env, answered, end, "proceed");
  await viewingEmailPass(env, end + 2 * H);
  assert.equal(outbound(env).length, 0);
});

test("never retroactive: a viewing completed before the switch was first on gets nothing", async () => {
  const env = world(), first = Date.parse("2026-12-10T12:00:00Z");
  const before = viewing(env, at(first - 3 * H)), after = viewing(env, at(first - 2 * H));
  complete(env, before, first - H); // marked Completed while the switch was off
  await viewingEmailPass(env, first); // the switch's first tick: its moment is stored
  assert.equal(JSON.parse(rows(env, "SELECT value FROM app_settings WHERE key = 'aut21_viewing_emails'")[0].value).since, iso(first));
  complete(env, after, first + 10 * 60e3);
  await viewingEmailPass(env, first + 2 * H);
  await viewingEmailPass(env, first + 3 * H); // a later tick keeps the first moment
  assert.equal(JSON.parse(rows(env, "SELECT value FROM app_settings WHERE key = 'aut21_viewing_emails'")[0].value).since, iso(first));
  assert.deepEqual(outbound(env).map(o => o.entity_id), [String(after)]);
});

test("not after 7 days from the viewing's end, even if marked Completed late", async () => {
  const env = world(), end = Date.parse("2026-12-01T15:00:00Z");
  since(env, end - D);
  const late = viewing(env, at(end - 30 * 60e3)), inTime = viewing(env, at(end - 30 * 60e3));
  complete(env, late, end + 7 * D - 2 * H);
  complete(env, inTime, end + 5 * D);
  await viewingEmailPass(env, end + 5 * D + H);
  await viewingEmailPass(env, end + 7 * D + 10 * 60e3);
  assert.deepEqual(outbound(env).map(o => o.entity_id), [String(inTime)]);
});

test("a queued feedback request whose viewing changed (answer recorded) is never claimed and is cancelled by the clock", async () => {
  const env = world(), end = Date.now() - 2 * H;
  since(env, end - D);
  const id = viewing(env, at(end - 30 * 60e3));
  complete(env, id, end);
  await viewingEmailPass(env);
  assert.equal(outbound(env).length, 1);
  run(env, "UPDATE viewing_requests SET outcome = 'not_interested' WHERE id = ?", id);
  assert.equal(await claimForHermes(env, "0"), null);
  await viewingEmailSettlePass(env);
  assert.equal(outbound(env)[0].status, "cancelled");
});

test("Gmail took the feedback request: the viewing records it once and its thread is kept for the reply", async () => {
  const env = world(), end = Date.now() - 2 * H;
  since(env, end - D);
  const id = viewing(env, at(end - 30 * 60e3));
  complete(env, id, end);
  await viewingEmailPass(env);
  const c = await claimForHermes(env, "0");
  assert.match(c.subject, /Fixture Cottage/);
  assert.equal(await settleForHermes(env, c.ref, c.token, "sent", "msg1", "thread1"), "ok");
  await viewingEmailSettlePass(env);
  await viewingEmailSettlePass(env);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM events WHERE type = 'viewing.feedback_requested' AND entity_id = ?", String(id))[0].n, 1);
  assert.equal(outbound(env)[0].gmail_thread_id, "thread1");
  await viewingEmailPass(env);
  assert.equal(outbound(env).length, 1);
  assert.equal(status(env, id), "completed"); // nothing about the viewing changes: recording the answer stays the team's
});

// --- Property let or sold ---------------------------------------------------------------------------------------------

// A sale completed `ago` ms before now, its listing Sold, bought by a search whose contact is Bought Person.
function sold(env, ago = 25 * H) {
  env.DB.raw.exec("PRAGMA foreign_keys=OFF");
  run(env, "UPDATE listings SET availability = 'sold' WHERE id = ?", HOME);
  const c = Number(run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES ('Bought Person', 'buyer@example.test', ?, ?, ?)", T0, T0, T0).lastInsertRowid);
  const buyer = Number(run(env, `INSERT INTO applicants (contact_id, operation, stage, source, created_at, updated_at)
    VALUES (?, 'buy', 'searching', 'phone', ?, ?)`, c, T0, T0).lastInsertRowid);
  const closed = iso(Date.now() - ago);
  run(env, `INSERT INTO sales (listing_id, applicant_id, offer_id, price, status, closed_at, created_at, updated_at)
    VALUES (?, ?, 1, 500000, 'completed', ?, ?, ?)`, HOME, buyer, closed, T0, closed);
  return buyer;
}
const tick = async (env, t) => { await processExpiredRentalClosures(env); await viewingEmailPass(env, t); };
const later = () => at(Date.now() + 3 * D);

test("24 hours after a sale, the other viewings to come are cancelled with one notice each; idempotent; the buyer stays unnamed", async () => {
  const env = world(), buyer = sold(env);
  since(env, Date.now() - 2 * D);
  const a = viewing(env, later(), { status: "requested" }), b = viewing(env, later());
  const after = viewing(env, later(), { created: iso(Date.now()) }); // booked after the sale: not this pass's
  const own = viewing(env, later(), { email: "someone@example.test" }); // the buyer's own viewing, linked to their search
  run(env, `INSERT INTO viewing_proposals (viewing_id, revision, applicant_id, negotiator_id, date, time, end_time, from_status,
    from_date, from_time, required, state, created_at, created_by, closed_at, closed_by) VALUES (?, 1, ?, 1, ?, ?, ?, 'requested', ?, ?, '["client"]',
    'confirmed', ?, 'admin@example.test', ?, 'admin@example.test')`, own, buyer, later().date, later().time, addMinutes(later().time, 30),
    later().date, later().time, T0, T0);
  await tick(env);
  await tick(env);
  assert.deepEqual([a, b, after, own].map(id => status(env, id)), ["cancelled", "cancelled", "confirmed", "confirmed"]);
  const out = outbound(env);
  assert.deepEqual(out.map(o => [o.template, o.entity_id, o.status]), [["viewing_cancelled_closed", String(a), "queued"],
    ["viewing_cancelled_closed", String(b), "queued"]]);
  for (const o of out) {
    assert.ok(o.text.includes("sold") && o.text.includes("Fixture Cottage") && o.text.includes(HOME), o.text);
    for (const s of ["Bought Person", "buyer@example.test", "500,000", "500000", "4321", "dog", "Fixture Viewer"]) assert.ok(!(o.subject + o.text).includes(s), s);
  }
  // The PUB-16 task of a cancelled one stays until its notice left (review 25-nov); the buyer's viewing keeps it.
  assert.deepEqual(openTasks(env, a), ["Property sold, cancel the viewing: Fixture Viewer"]);
  run(env, "UPDATE outbound SET status = 'accepted', claimed_at = ? WHERE entity_id = ?", iso(Date.now()), String(a));
  await viewingEmailSettlePass(env);
  assert.deepEqual(openTasks(env, a), []);
  assert.deepEqual(openTasks(env, own), ["Property sold, cancel the viewing: Fixture Viewer"]);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM events WHERE type = 'viewing.cancelled' AND actor = 'automation'")[0].n, 2);
});

test("24 hours after a rental is let, the notice says let", async () => {
  const env = world({ listing: { operation: "rent", availability: "let_agreed", published: 0 } });
  since(env, Date.now() - 2 * D);
  const opened = iso(Date.now() - 25 * H), due = iso(Date.parse(opened) + D);
  const e = Number(run(env, "INSERT INTO events (at, actor, entity_type, entity_id, type) VALUES (?, 'admin@example.test', 'listing', ?, 'listing.let')", opened, HOME).lastInsertRowid);
  run(env, `INSERT INTO rental_closure_windows (closure_id, listing_id, close_event_id, state, opened_at, due_at, previous_availability,
    previous_published, previous_viewings_enabled, applied_updated_at, withdrawn_at) VALUES ('c1', ?, ?, 'withdrawn', ?, ?, 'to_let', 1, 1, ?, ?)`,
    HOME, e, opened, due, opened, due);
  const id = viewing(env, later());
  await tick(env);
  assert.equal(status(env, id), "cancelled");
  assert.match(outbound(env)[0].text, /has now been let/);
});

test("a viewing with no usable email, or a suppressed one, is not cancelled and keeps its task", async () => {
  const env = world();
  sold(env);
  since(env, Date.now() - 2 * D);
  const phoneOnly = viewing(env, later(), { email: null, phone: "+44 7700 900000" });
  const bad = viewing(env, later(), { email: "not an address" });
  const gone = viewing(env, later(), { email: "gone@example.test" });
  run(env, "INSERT INTO email_suppressions VALUES (?, ?, 'team')", await sha256("gone@example.test"), T0);
  await tick(env);
  assert.deepEqual([phoneOnly, bad, gone].map(id => status(env, id)), ["confirmed", "confirmed", "confirmed"]);
  assert.equal(outbound(env).length, 0);
  for (const id of [phoneOnly, bad, gone]) assert.deepEqual(openTasks(env, id), ["Property sold, cancel the viewing: Fixture Viewer"]);
});

test("not retroactive either: a sale whose 24 hours ended before the switch was on is left to its tasks", async () => {
  const env = world();
  sold(env, 4 * D);
  since(env, Date.now() - D);
  const id = viewing(env, later());
  await tick(env);
  assert.equal(status(env, id), "confirmed");
  assert.equal(outbound(env).length, 0);
});

test("with sending stopped (paused), nothing is cancelled: the viewing keeps its task", async () => {
  const env = world();
  sold(env);
  since(env, Date.now() - 2 * D);
  run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('outbound', '{"paused":1}', ?, 'admin@example.test')`, T0);
  const id = viewing(env, later());
  await tick(env);
  assert.equal(status(env, id), "confirmed");
  assert.equal(outbound(env).length, 0);
});

test("a queued notice is not claimed while paused, suppressed, or once the sale is undone; then a person is told", async () => {
  const env = world();
  sold(env);
  since(env, Date.now() - 2 * D);
  const a = viewing(env, later()), b = viewing(env, later(), { email: "late-stop@example.test" });
  await tick(env);
  assert.equal(outbound(env).length, 2);
  run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('outbound', '{"paused":1}', ?, 'admin@example.test')`, T0);
  assert.equal(await claimForHermes(env, "0"), null);
  run(env, "DELETE FROM app_settings WHERE key = 'outbound'");
  run(env, "INSERT INTO email_suppressions VALUES (?, ?, 'team')", await sha256("late-stop@example.test"), T0);
  run(env, "UPDATE listings SET availability = 'for_sale' WHERE id = ?", HOME); // the stale case: the property is no longer sold
  assert.equal(await claimForHermes(env, "0"), null);
  await viewingEmailSettlePass(env);
  await viewingEmailSettlePass(env);
  assert.deepEqual(outbound(env).map(o => o.status), ["cancelled", "cancelled"]);
  for (const id of [a, b]) assert.deepEqual(openTasks(env, id), ["Viewing cancelled (property let or sold), the client was not emailed: Fixture Viewer"]);
});

test("an unknown result is never sent again and leaves a task to check; an accepted one is recorded and keeps its thread", async () => {
  const env = world();
  sold(env);
  since(env, Date.now() - 2 * D);
  const a = viewing(env, later()), b = viewing(env, later());
  await tick(env);
  const first = await claimForHermes(env, "0");
  assert.equal(await settleForHermes(env, first.ref, first.token, "unknown", null, null), "ok");
  const second = await claimForHermes(env, "0");
  assert.equal(await settleForHermes(env, second.ref, second.token, "sent", "msg2", "thread2"), "ok");
  assert.equal(await claimForHermes(env, "0"), null);
  await viewingEmailSettlePass(env);
  await tick(env);
  await viewingEmailSettlePass(env);
  assert.deepEqual(outbound(env).map(o => [o.status, o.gmail_thread_id]), [["unknown", null], ["accepted", "thread2"]]);
  assert.equal(await claimForHermes(env, "0"), null);
  assert.deepEqual(openTasks(env, a), ["Viewing cancelled (property let or sold), check the client's email went: Fixture Viewer"]);
  assert.deepEqual(openTasks(env, b), []);
  assert.equal(rows(env, "SELECT COUNT(*) n FROM events WHERE type = 'viewing.closed_notice_sent' AND entity_id = ?", String(b))[0].n, 1);
});

// --- The switch -------------------------------------------------------------------------------------------------------

test("switched off: nothing queued, cancelled or claimed; the clock takes back what was queued and tells a person", async () => {
  const env = world({ on: false });
  sold(env);
  since(env, Date.now() - 2 * D);
  const id = viewing(env, later());
  const done = viewing(env, at(Date.now() - 3 * H));
  complete(env, done, Date.now() - 2 * H);
  await tick(env);
  assert.equal(outbound(env).length, 0);
  assert.equal(status(env, id), "confirmed");
  assert.equal(await viewingEmailClaimSql(env), "0");
  // Queued while on, then switched off: never claimed, and the clock cancels it.
  const on = { ...env, AUT21_VIEWING_EMAILS_READY: "1" };
  await tick(on, Date.now());
  assert.equal(outbound(env).length, 2);
  assert.equal(await claimForHermes(env, "0"), null);
  await viewingEmailSettlePass(env);
  assert.deepEqual(outbound(env).map(o => o.status), ["cancelled", "cancelled"]);
  assert.deepEqual(openTasks(env, id), ["Viewing cancelled (property let or sold), the client was not emailed: Fixture Viewer"]);
  // Off, the first-on moment is forgotten: switched on again, only what is completed after that counts.
  assert.equal(rows(env, "SELECT COUNT(*) n FROM app_settings WHERE key = 'aut21_viewing_emails'")[0].n, 0);
});

test("the texts hold the property, place, date and time only", () => {
  const v = { title: "Fixture Cottage", listing_id: HOME, location: "St Helier", date: "2026-12-10", time: "14:00", name: "Fixture Viewer",
    notes: "Key safe code 4321", household_total: 5 };
  for (const { subject, text } of [feedbackEmail(v), closedEmail({ ...v, what: "sold" })]) {
    for (const s of ["Fixture Cottage", HOME, "St Helier", "Thursday, 10 December 2026", "14:00", "reply to this email"]) assert.ok(text.includes(s), s);
    for (const s of ["4321", "Key", "Fixture Viewer", "5 ", "http"]) assert.ok(!(subject + text).includes(s), s);
  }
});

test("the website and the clock carry the same AUT21_VIEWING_EMAILS_READY, off", () => {
  const flag = f => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8").match(/^AUT21_VIEWING_EMAILS_READY = "(\d)"/m)?.[1];
  assert.equal(flag("wrangler.toml"), "0");
  assert.equal(flag("jobs/wrangler.toml"), "0");
});

// Review 25-nov: three ways a cancelled viewing's client could be failed.
test("the cancel ends an open VIS-17 proposal even though the clock carries no VIS-17 switch", async () => {
  const env = world(); sold(env); since(env, Date.now() - 2 * D);
  const id = viewing(env, later()), slot = later();
  run(env, `INSERT INTO viewing_proposals (viewing_id, revision, applicant_id, negotiator_id, date, time, end_time, from_status, from_date,
    from_time, required, state, created_at, created_by) VALUES (?, 1, NULL, 1, ?, ?, ?, 'requested', ?, ?, '["client"]', 'open', ?, 'admin@example.test')`,
    id, slot.date, slot.time, addMinutes(slot.time, 30), slot.date, slot.time, T0);
  assert.equal(env.VIS17_MULTIPART_READY, undefined);
  await tick(env);
  assert.equal(status(env, id), "cancelled");
  assert.notEqual(rows(env, "SELECT state FROM viewing_proposals WHERE viewing_id = ?", id)[0].state, "open");
});

test("a notice not sent before the viewing starts is not claimed after it, and a person is told", async () => {
  const env = world(); sold(env); since(env, Date.now() - 2 * D);
  const id = viewing(env, at(Date.now() + 2 * H));
  await tick(env);
  assert.equal(status(env, id), "cancelled");
  const after = Date.now() + 3 * H;
  assert.equal(await viewingEmailClaimSql(env, after).then(sql => rows(env, `SELECT ${sql.replaceAll("outbound.", "o.")} AS ok
    FROM outbound o WHERE o.entity_id = ?`, String(id))[0].ok), 0);
  await viewingEmailSettlePass(env, after);
  assert.equal(outbound(env)[0].status, "cancelled");
  assert.deepEqual(openTasks(env, id), [`Viewing cancelled (property let or sold), the client was not emailed: Fixture Viewer`]);
});

test("after a let, the incoming tenant's own viewing (named by the tenancy) is not cancelled", async () => {
  const env = world({ listing: { operation: "rent", availability: "let_agreed", published: 0 } });
  since(env, Date.now() - 2 * D);
  const opened = iso(Date.now() - 25 * H), due = iso(Date.parse(opened) + D);
  const e = Number(run(env, "INSERT INTO events (at, actor, entity_type, entity_id, type) VALUES (?, 'admin@example.test', 'listing', ?, 'listing.let')", opened, HOME).lastInsertRowid);
  run(env, `INSERT INTO rental_closure_windows (closure_id, listing_id, close_event_id, state, opened_at, due_at, previous_availability,
    previous_published, previous_viewings_enabled, applied_updated_at, withdrawn_at) VALUES ('c2', ?, ?, 'withdrawn', ?, ?, 'to_let', 1, 1, ?, ?)`,
    HOME, e, opened, due, opened, due);
  env.DB.raw.exec("PRAGMA foreign_keys=OFF");
  const c = Number(run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES ('New Tenant', 'tenant@example.test', ?, ?, ?)", T0, T0, T0).lastInsertRowid);
  const ap = Number(run(env, "INSERT INTO applicants (contact_id, operation, stage, source, created_at, updated_at) VALUES (?, 'rent', 'searching', 'phone', ?, ?)", c, T0, T0).lastInsertRowid);
  run(env, `INSERT INTO tenancy_origins (tenancy_id, operation_id, rental_id, listing_id, applicant_id, listing_updated_at, applicant_updated_at,
    created_at, created_by) VALUES (1, 'op-fixture-1', 1, ?, ?, ?, ?, ?, 'admin@example.test')`, HOME, ap, T0, T0, T0);
  const mine = viewing(env, later(), { email: "Tenant@Example.test" }), other = viewing(env, later());
  await tick(env);
  assert.deepEqual([status(env, mine), status(env, other)], ["confirmed", "cancelled"]);
});
