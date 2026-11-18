import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, T0, call, adminCookie } from "./helpers.mjs";
import { emailEnv } from "./email-helpers.mjs";
import { dispatchEmail } from "../../server/email.js";
import { runRetention } from "../../server/retention.js";
import { retentionNoticePass } from "../../server/retention-notices.js";

// PRE-12 (Q05, migration 0119): a team member's domain review of a retention notice the pass keeps a contact for. With
// manual_notice_documented (the day the person was told by other means and what shows it) the pass may delete the
// contact a month after that day, once the episode's date has come and nothing else keeps it; keep_for_review keeps it.
// A contact last active on 25 November 2025 gets its notice on 26 October 2026, which gives 26 November 2026.
const LAST = "2025-11-25T10:00:00.000Z", NOTICE = "2026-10-26T09:00:00.000Z";
const GIVEN = "2026-10-27"; // the manual notice: the pass may delete from 27 November
const MONTH_SHORT = "2026-11-26T09:30:00.000Z", MONTH_DONE = "2026-11-27T09:30:00.000Z";
const ON = { PRE12_RETENTION_NOTICE_READY: "1", PRE10_PURPOSE_READY: "1" };
// The review is recorded on 10 November 2026 (the route's own clock); the passes take their time as an argument.
const TODAY = Date.parse("2026-11-10T12:00:00.000Z");
mock.timers.enable({ apis: ["Date"], now: TODAY });

const insert = (env, table, row) => {
  const cols = Object.keys(row);
  return Number(env.DB.raw.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...cols.map(c => row[c])).lastInsertRowid);
};
const one = (env, sql, ...a) => { const r = env.DB.raw.prepare(sql).get(...a); return r && { ...r }; };
const all = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const exists = (env, id) => !!one(env, "SELECT 1 FROM contacts WHERE id = ?", id);
const state = (env, id) => one(env, "SELECT state FROM retention_notices WHERE contact_id = ?", id)?.state;
const tasks = env => all(env, `SELECT n.task_key, n.resolved_at FROM notifications n JOIN events e ON e.id = n.event_id
  WHERE e.type = 'contact.retention_notice_review' ORDER BY n.id`);
const contact = (env, email = "jane@example.test", o = {}) => insert(env, "contacts", { name: "Synthetic Person", email,
  phone: null, last_activity_at: LAST, created_at: T0, updated_at: T0, ...o });
const review = async (env, id, body, cookie) => call(env, "POST", `/admin/contacts/${id}/retention-notice-review`,
  { cookie: cookie ?? await adminCookie(), body: { activity_at: LAST, ...body } });
const manual = { resolution_code: "manual_notice_documented", notice_given_on: GIVEN,
  evidence: "Letter posted to the address on file on 27 October 2026, copy in the office file" };

// A contact whose notice the email service could not deliver, with its Inbox task open.
async function failedNotice(flags = {}) {
  const env = Object.assign(emailEnv(), ON, flags);
  const c = contact(env);
  await retentionNoticePass(env, NOTICE);
  env.EMAIL.send = async () => { throw Object.assign(new Error("no"), { code: "E_DELIVERY_FAILED" }); };
  await dispatchEmail(env, () => NOTICE);
  await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
  assert.equal(state(env, c), "failed");
  assert.equal(tasks(env).length, 1);
  return { env, c };
}

test("failed notice + manual notice with evidence: the pass deletes only a month after it, and nothing else moves", async () => {
  const { env, c } = await failedNotice();
  assert.equal((await runRetention(env, MONTH_DONE)).contacts, 0); // without the review: kept
  const r = await review(env, c, manual);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.review.resolution_code, "manual_notice_documented");
  // The review deletes nothing and restarts no clock; its event names no evidence.
  assert.equal(exists(env, c), true);
  assert.equal(one(env, "SELECT last_activity_at FROM contacts WHERE id = ?", c).last_activity_at, LAST);
  const ev = one(env, "SELECT actor, data FROM events WHERE type = 'contact.retention_notice_reviewed'");
  assert.equal(ev.actor, "admin@example.test");
  assert.deepEqual(JSON.parse(ev.data), { resolution_code: "manual_notice_documented", notice_given_on: GIVEN, activity_at: LAST });
  assert.ok(tasks(env)[0].resolved_at, "the episode's Inbox task is closed by the review");
  assert.equal(one(env, "SELECT actor, evidence FROM retention_notice_reviews").actor, "admin@example.test");
  assert.equal((await runRetention(env, MONTH_SHORT)).contacts, 0); // the episode's date, but not a month since
  assert.equal(exists(env, c), true);
  assert.equal((await runRetention(env, MONTH_DONE)).contacts, 1);
  assert.equal(exists(env, c), false);
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM retention_notice_reviews").n, 0); // the review went with its contact
});

test("with a manual notice, every other exception still keeps the contact", async () => {
  const { env, c } = await failedNotice();
  assert.equal((await review(env, c, manual)).status, 200);
  insert(env, "applicants", { contact_id: c, operation: "rent", source: "web", search_state: "active", created_at: T0, updated_at: T0 });
  assert.equal((await runRetention(env, MONTH_DONE)).contacts, 0);
  assert.equal(exists(env, c), true);
});

test("an email from the contact since the manual notice keeps them, as an answer to a sent notice does", async () => {
  const { env, c } = await failedNotice();
  assert.equal((await review(env, c, manual)).status, 200);
  insert(env, "email_inbound", { dedupe_key: "k", sender: "jane@example.test", header_from: "jane@example.test",
    recipient: "replies@example.test", subject: "My details", text: "Please keep them", html_only: 0, truncated: 0,
    received_at: "2026-11-02T09:00:00.000Z" });
  assert.equal((await runRetention(env, MONTH_DONE)).contacts, 0);
  assert.equal(exists(env, c), true);
});

// Review fix (GRAVE 1): the email clean-up blanks an inbound email's sender after 30 days; the answer must outlive it.
test("an email after a manual notice keeps the contact after its content is cleared, and opens a task to read it", async () => {
  const { env, c } = await failedNotice();
  assert.equal((await review(env, c, manual)).status, 200);
  insert(env, "email_inbound", { dedupe_key: "k", sender: "jane@example.test", header_from: "jane@example.test",
    recipient: "replies@example.test", subject: "My details", text: "Please keep them", html_only: 0, truncated: 0,
    received_at: "2026-11-02T09:00:00.000Z" });
  assert.equal((await runRetention(env, MONTH_DONE)).contacts, 0);
  await retentionNoticePass(env, "2026-11-27T09:40:00.000Z");
  const open = tasks(env).filter(t => !t.resolved_at);
  assert.deepEqual(open.map(t => t.task_key), [`retention_notice:${c}:${LAST}:answered`]);
  assert.equal(one(env, "SELECT json_extract(e.data, '$.reason') AS r FROM notifications n JOIN events e ON e.id = n.event_id WHERE n.task_key = ?",
    open[0].task_key).r, "replied");
  assert.equal((await runRetention(env, "2026-12-03T09:00:00.000Z")).contacts, 0);
  assert.equal(one(env, "SELECT sender FROM email_inbound").sender, null); // its content is gone by now
  for (const d of ["2027-01-10", "2027-03-01"]) assert.equal((await runRetention(env, `${d}T09:00:00.000Z`)).contacts, 0, d); // the row too
  assert.equal(exists(env, c), true);
  await retentionNoticePass(env, "2027-03-01T09:40:00.000Z");
  assert.equal(tasks(env).length, 2); // one task each, never repeated
});

// Review fix (GRAVE 2): a running tenancy withdraws the notice; it must withdraw the manual notice too, so the tenancy's
// end never deletes on an old date without a fresh notice.
// A running tenancy linked to contact c on 1 November 2026; returns the tenancy's id.
const linkTenancy = (env, c) => {
  const l = insert(env, "landlords", { name: "Synthetic Landlord", created_at: T0, updated_at: T0 });
  const rental = insert(env, "rentals", { landlord_id: l, address: "1 Fictitious Row", parish: "St Helier", service: "full",
    fee_percent: 10, created_at: T0, updated_at: T0 });
  const t = insert(env, "tenancies", { rental_id: rental, payment_ref: "REF1", tenant_name: "Synthetic Tenant", occupants: "A",
    kind: "fixed", regime: "2025", start_on: "2026-01-01", end_on: "2027-01-01", rent: 1500, due_day: 1, deposit: 2000, ended_on: null,
    notes: "n", created_at: T0, updated_at: T0 });
  insert(env, "tenancy_contact_links", { tenancy_id: t, contact_id: c, linked: 1, tenant_revision: "a".repeat(64), actor: "x",
    at: "2026-11-01T09:00:00.000Z" });
  return t;
};

test("a manual notice is withdrawn when the contact is linked to a running tenancy", async () => {
  const { env, c } = await failedNotice({ PRE12_TENANCY_LINK_READY: "1" });
  assert.equal((await review(env, c, manual)).status, 200);
  const t = linkTenancy(env, c);
  await retentionNoticePass(env, "2026-11-01T09:10:00.000Z");
  env.DB.raw.prepare("UPDATE tenancies SET ended_on = '2027-03-01' WHERE id = ?").run(t);
  assert.equal((await runRetention(env, "2027-03-02T00:05:00.000Z")).contacts, 0); // the pass runs before the notice pass
  assert.equal(exists(env, c), true);
});

// Review fix: the notice pass that withdraws it does not run while the notice switch is off; the link itself must count.
test("a link made while the notice switch was off still voids an earlier manual notice", async () => {
  const { env, c } = await failedNotice({ PRE12_TENANCY_LINK_READY: "1" });
  assert.equal((await review(env, c, manual)).status, 200);
  env.PRE12_RETENTION_NOTICE_READY = "0";
  const t = linkTenancy(env, c);
  await retentionNoticePass(env, "2026-11-01T09:10:00.000Z"); // off: does nothing
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM retention_notice_reviews").n, 1);
  env.DB.raw.prepare("UPDATE tenancies SET ended_on = '2027-03-01' WHERE id = ?").run(t);
  env.PRE12_RETENTION_NOTICE_READY = "1";
  assert.equal((await runRetention(env, "2027-03-02T00:05:00.000Z")).contacts, 0); // first tick after switching on
  assert.equal(exists(env, c), true);
});

// Review fix: a manual notice recorded late could miss an answer whose sender the 30-day clean-up already blanked.
test("a manual notice must be from the last 29 days, and the view says from when", async () => {
  const { env, c } = await failedNotice();
  mock.timers.setTime(Date.parse("2026-12-20T12:00:00.000Z"));
  try {
    const late = await review(env, c, manual); // 27 October: before 21 November
    assert.equal(late.status, 400);
    assert.ok(late.data.fields.notice_given_on);
    const a = insert(env, "applicants", { contact_id: c, operation: "rent", source: "web", search_state: "resolved", resolved_at: T0,
      resolved_by: "admin@example.test", resolution_reason: "Found a home", created_at: T0, updated_at: T0 });
    const d = (await call(env, "GET", `/admin/applicants/${a}`, { cookie: await adminCookie() })).data;
    assert.equal(d.retention_notice.notice_from, "2026-11-21");
    assert.equal((await review(env, c, { ...manual, notice_given_on: "2026-11-20" })).status, 400);
    assert.equal((await review(env, c, { ...manual, notice_given_on: "2026-11-21" })).status, 200);
  } finally { mock.timers.setTime(TODAY); }
});

test("an open privacy request still keeps a contact with a manual notice", async () => {
  const { env, c } = await failedNotice({ PRE12_REQUESTS_READY: "1" });
  assert.equal((await review(env, c, manual)).status, 200);
  insert(env, "privacy_requests", { id: "11111111-1111-4111-8111-111111111111", kind: "access", received_on: "2026-11-01",
    received_via: "email", reference: "Email to the office", contact_id: c, created_by: "admin@example.test", created_at: T0,
    updated_by: "admin@example.test", updated_at: T0 });
  assert.equal((await runRetention(env, MONTH_DONE)).contacts, 0);
  assert.equal(exists(env, c), true);
});

test("evidence, a valid result and a past notice date are required", async () => {
  const { env, c } = await failedNotice();
  for (const body of [{ ...manual, evidence: "  " }, { ...manual, evidence: undefined }, { ...manual, evidence: "x".repeat(1001) },
    { ...manual, notice_given_on: undefined }, { ...manual, notice_given_on: "2999-01-01" }, { ...manual, notice_given_on: "2026-02-30" },
    { ...manual, notice_given_on: "2025-11-24" }, { ...manual, notice_given_on: "2026-10-24" }, { ...manual, resolution_code: "verified_contact" }, { ...manual, activity_at: undefined }]) {
    const r = await review(env, c, body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM retention_notice_reviews").n, 0);
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM events WHERE type = 'contact.retention_notice_reviewed'").n, 0);
  assert.equal((await review(env, 999999, manual)).status, 404);
  assert.equal((await call(env, "POST", `/admin/contacts/${c}/retention-notice-review`, { body: manual })).status, 401);
});

test("a review for an episode that new activity ended is refused (409), and an old review authorises nothing", async () => {
  const { env, c } = await failedNotice();
  const stale = await review(env, c, { ...manual, activity_at: "2025-11-20T10:00:00.000Z" });
  assert.equal(stale.status, 409);
  assert.equal((await review(env, c, manual)).status, 200);
  // New activity (still over 12 months ago, so the contact is due again): the old review no longer counts.
  env.DB.raw.prepare("UPDATE contacts SET last_activity_at = ? WHERE id = ?").run("2025-11-25T10:00:01.000Z", c);
  assert.equal((await runRetention(env, MONTH_DONE)).contacts, 0);
  assert.equal(exists(env, c), true);
  assert.equal((await review(env, c, manual)).status, 409); // its episode is not the contact's any more
});

test("keep for review keeps the contact, and its task stays open; a manual notice may follow", async () => {
  const { env, c } = await failedNotice();
  const r = await review(env, c, { resolution_code: "keep_for_review", evidence: "Owner of a rented flat: check with Luis",
    notice_given_on: undefined });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.data.review.resolution_code, "keep_for_review");
  assert.equal(tasks(env)[0].resolved_at, null);
  assert.equal((await runRetention(env, "2027-03-01T09:00:00.000Z")).contacts, 0);
  assert.equal(exists(env, c), true);
  assert.equal((await review(env, c, manual)).status, 200);
  assert.equal((await review(env, c, manual)).status, 409); // a recorded manual notice is final for its episode
  assert.equal((await runRetention(env, MONTH_DONE)).contacts, 1);
});

test("marking the task done changes nothing", async () => {
  const { env, c } = await failedNotice();
  env.DB.raw.prepare("UPDATE notifications SET resolved_at = ?, resolved_by = 'admin@example.test'").run(MONTH_SHORT);
  assert.equal((await runRetention(env, "2027-03-01T09:00:00.000Z")).contacts, 0);
  await retentionNoticePass(env, "2027-03-01T09:10:00.000Z");
  assert.equal(tasks(env).length, 1);
  assert.equal(exists(env, c), true);
});

test("an answered, accepted or waiting notice needs no review: 409", async () => {
  const env = Object.assign(emailEnv(), ON);
  const sent = contact(env, "sent@example.test"), replied = contact(env, "replied@example.test");
  await retentionNoticePass(env, NOTICE);
  await dispatchEmail(env, () => NOTICE);
  await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
  insert(env, "email_inbound", { dedupe_key: "d", sender: "replied@example.test", header_from: "replied@example.test",
    recipient: "replies@example.test", subject: "Re", text: "Please keep my details", html_only: 0, truncated: 0,
    received_at: "2026-10-27T09:00:00.000Z" });
  await retentionNoticePass(env, "2026-10-27T09:10:00.000Z");
  assert.deepEqual([state(env, sent), state(env, replied)], ["accepted", "replied"]);
  const waiting = contact(env, "waiting@example.test");
  await retentionNoticePass(env, "2026-10-27T09:20:00.000Z");
  assert.equal(state(env, waiting), "queued");
  for (const id of [sent, replied, waiting]) assert.equal((await review(env, id, manual)).status, 409);
  assert.equal((await runRetention(env, "2027-03-01T09:00:00.000Z")).contacts, 1); // only the accepted one, as before
  assert.equal(exists(env, replied), true);
});

test("email service off: a manual notice recorded before the task stops it opening, and releases the contact", async () => {
  const env = Object.assign(makeEnv(), ON, { EMAIL_SERVICE_READY: "false" });
  const c = contact(env);
  await retentionNoticePass(env, NOTICE);
  assert.equal(state(env, c), undefined);
  assert.equal((await review(env, c, manual)).status, 200);
  await retentionNoticePass(env, MONTH_SHORT);
  assert.deepEqual(tasks(env), []);
  assert.equal((await runRetention(env, MONTH_SHORT)).contacts, 0);
  assert.equal((await runRetention(env, MONTH_DONE)).contacts, 1);
});

test("the applicant view shows the review only when it is on", async () => {
  const { env, c } = await failedNotice();
  const a = insert(env, "applicants", { contact_id: c, operation: "rent", source: "web", search_state: "resolved", resolved_at: T0,
    resolved_by: "admin@example.test", resolution_reason: "Found a home", created_at: T0, updated_at: T0 });
  const cookie = await adminCookie();
  let d = (await call(env, "GET", `/admin/applicants/${a}`, { cookie })).data;
  assert.deepEqual(d.retention_notice, { activity_at: LAST, notice_from: "2026-10-25", state: "failed", reviewable: true,
    review: null });
  await review(env, c, manual);
  d = (await call(env, "GET", `/admin/applicants/${a}`, { cookie })).data;
  assert.equal(d.retention_notice.reviewable, false);
  assert.deepEqual({ ...d.retention_notice.review, created_at: undefined }, { resolution_code: "manual_notice_documented",
    notice_given_on: GIVEN, evidence: manual.evidence, actor: "admin@example.test", created_at: undefined });
  env.PRE12_RETENTION_NOTICE_READY = "0";
  d = (await call(env, "GET", `/admin/applicants/${a}`, { cookie })).data;
  assert.equal(d.retention_notice, undefined);
});

test("switched off, or without 0119: no route, no review decides a deletion, and a failed notice keeps the contact as before", async () => {
  const { env, c } = await failedNotice();
  env.PRE12_RETENTION_NOTICE_READY = "0";
  assert.equal((await review(env, c, manual)).status, 404);
  const seen = [], prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => { seen.push(sql); return prepare(sql); };
  assert.equal((await runRetention(env, MONTH_DONE)).contacts, 0);
  // Switched off, the table is read only to record answers before the email clean-up (as noticeOutcomeStatements does).
  assert.deepEqual(seen.filter(sql => /retention_notice_reviews/.test(sql)
    && !/sqlite_master|^UPDATE retention_notice_reviews SET answered_at/.test(sql.trim())), []);
  env.DB.prepare = prepare;

  const legacy = Object.assign(emailEnv(), ON);
  legacy.DB.raw.exec("DROP TABLE retention_notice_reviews"); // as before 0119 is applied
  const d = contact(legacy);
  await retentionNoticePass(legacy, NOTICE);
  legacy.EMAIL.send = async () => { throw Object.assign(new Error("no"), { code: "E_DELIVERY_FAILED" }); };
  await dispatchEmail(legacy, () => NOTICE);
  await retentionNoticePass(legacy, "2026-10-26T09:10:00.000Z");
  assert.equal((await review(legacy, d, manual)).status, 404);
  assert.equal((await runRetention(legacy, MONTH_DONE)).contacts, 0);
  assert.equal(exists(legacy, d), true);
  assert.equal(tasks(legacy).length, 1);
});
