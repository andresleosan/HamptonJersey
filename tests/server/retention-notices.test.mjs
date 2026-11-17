import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, T0 } from "./helpers.mjs";
import { emailEnv } from "./email-helpers.mjs";
import { dispatchEmail, emailPass, NOTICE_DAILY_LIMIT } from "../../server/email.js";
import { sha256 } from "../../server/http.js";
import { runRetention } from "../../server/retention.js";
import { retentionNoticePass, NOTICES_PER_TICK } from "../../server/retention-notices.js";
import worker from "../../server/jobs.js";

// PRE-12 (Q05). A contact last active on 25 November 2025 at 10:00 enters its 12th month on Jersey's 26 October 2026,
// when the clock prepares its notice; its 12 months end on 25 November 2026, so the earliest day the pass may delete it
// is 26 November, the date the notice gives, also a month after it was sent on 26 October at 09:00.
const LAST = "2025-11-25T10:00:00.000Z";
const NOTICE = "2026-10-26T09:00:00.000Z";
const BEFORE_MONTH = "2026-11-26T00:05:00.000Z"; // the date given, but a month since the send is not complete
const AFTER = "2026-11-26T09:30:00.000Z";

const ON = { PRE12_RETENTION_NOTICE_READY: "1", PRE10_PURPOSE_READY: "1" };
const world = (flags = ON) => Object.assign(emailEnv(), flags);
const insert = (env, table, row) => {
  const cols = Object.keys(row);
  return Number(env.DB.raw.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .run(...cols.map(c => row[c])).lastInsertRowid);
};
const contact = (env, email, o = {}) => insert(env, "contacts", { name: "Jane Le Brocq", email, phone: null,
  last_activity_at: LAST, created_at: T0, updated_at: T0, ...o });
const all = (env, sql, ...a) => env.DB.raw.prepare(sql).all(...a).map(r => ({ ...r }));
const one = (env, sql, ...a) => { const r = env.DB.raw.prepare(sql).get(...a); return r && { ...r }; };
const exists = (env, id) => !!one(env, "SELECT 1 FROM contacts WHERE id = ?", id);
const notices = env => all(env, "SELECT template, entity_id, recipient, subject, text, status, approved_by FROM outbound ORDER BY id");
const tasks = env => all(env, `SELECT e.entity_type, e.entity_id, e.type, e.data, n.category, n.title, n.task_key, n.resolved_at
  FROM notifications n JOIN events e ON e.id = n.event_id WHERE e.type = 'contact.retention_notice_review' ORDER BY n.id`);
const state = (env, id) => one(env, "SELECT state FROM retention_notices WHERE contact_id = ?", id)?.state;
const send = (env, at) => dispatchEmail(env, () => at);

test("both wrangler files carry the switch, off", () => {
  const flag = f => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8").match(/^PRE12_RETENTION_NOTICE_READY = "(\d)"$/m)?.[1];
  assert.equal(flag("wrangler.toml"), "0");
  assert.equal(flag("jobs/wrangler.toml"), flag("wrangler.toml"));
});

test("switched off: no notice, no table named, and the pass deletes as before", async () => {
  const env = emailEnv(), legacy = Object.assign(makeEnv({ skip: [112] }), { PRE12_REQUESTS_READY: "1" });
  const c = contact(env, "jane@example.je"), d = contact(legacy, "jane@example.je");
  await retentionNoticePass(env, NOTICE);
  assert.deepEqual(notices(env), []);
  const seen = [], prepare = legacy.DB.prepare.bind(legacy.DB);
  legacy.DB.prepare = sql => { seen.push(sql); return prepare(sql); };
  await retentionNoticePass(legacy, NOTICE); // without migration 0112 too
  assert.equal((await runRetention(legacy, BEFORE_MONTH)).contacts, 1);
  // Only the one look for the table, once per pass.
  assert.equal(seen.filter(sql => /retention_notices/.test(sql) && !/sqlite_master/.test(sql)).length, 0);
  assert.equal(seen.filter(sql => /sqlite_master/.test(sql)).length, 1);
  assert.equal((await runRetention(env, BEFORE_MONTH)).contacts, 1);
  assert.deepEqual([exists(env, c), exists(legacy, d)], [false, false]);
  // A notice left queued from a time it was on is never sent while it is off.
  insert(env, "outbound", { ref: "a".repeat(32), dedupe_key: "k", template: "retention_notice", entity_id: "1", version: 1,
    recipient: "tom@example.je", recipient_hash: "h", subject: "s", text: "t", status: "queued", approved_by: "x",
    approved_at: T0, created_at: NOTICE, updated_at: NOTICE });
  await send(env, NOTICE);
  assert.equal(env.sent.length, 0);
});

test("one notice per contact in its 12th month, in plain English, from the existing pipeline", async () => {
  const env = world();
  const c = contact(env, "jane@example.je");
  contact(env, null, { phone: "+447797000001" }); // no email: nothing to send
  contact(env, "recent@example.je", { last_activity_at: "2026-01-10T10:00:00.000Z" }); // 10 months
  const kept = contact(env, "search@example.je");
  insert(env, "applicants", { contact_id: kept, operation: "rent", source: "web", search_state: "active", created_at: T0,
    updated_at: T0 });
  await retentionNoticePass(env, "2026-10-25T09:00:00.000Z"); // still in month 11
  assert.deepEqual(notices(env), []);
  await retentionNoticePass(env, NOTICE);
  await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
  const [n, ...rest] = notices(env);
  assert.deepEqual(rest, []);
  assert.deepEqual({ ...n, text: undefined }, { template: "retention_notice", entity_id: String(c), recipient: "jane@example.je",
    subject: "Your details with Hampton Estates will be deleted", text: undefined, status: "queued",
    approved_by: "PRE12_RETENTION_NOTICE_READY" });
  assert.match(n.text, /on or after 26 November 2026/);
  assert.match(n.text, /contact details and the property searches/);
  assert.match(n.text, /reply to this email or contact us before that date/);
  assert.match(n.text, /https:\/\/www\.hamptonestatesjersey\.com\/#\/privacy/);
  assert.doesNotMatch(n.text, /Jane|Brocq/);
  assert.equal(one(env, "SELECT last_activity_at FROM contacts WHERE id = ?", c).last_activity_at, LAST);
  await send(env, NOTICE);
  assert.deepEqual(env.sent.map(m => m.to), ["jane@example.je"]);
  assert.match(env.sent[0].subject, /^Your details with Hampton Estates will be deleted \[HE-OUT-[a-f0-9]{32}\]$/);
});

test("at most 50 notices a tick; the rest follow", async () => {
  const env = world();
  for (let i = 0; i <= NOTICES_PER_TICK; i++) contact(env, `p${i}@example.je`);
  await retentionNoticePass(env, NOTICE);
  assert.equal(notices(env).length, NOTICES_PER_TICK);
  await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
  assert.equal(notices(env).length, NOTICES_PER_TICK + 1);
});

test("deletion waits for the date given and a month after the notice was accepted", async () => {
  const env = world(), off = emailEnv();
  const c = contact(env, "jane@example.je"), phoneOnly = contact(env, null, { phone: "+447797000002" });
  // Switched on after this one's 12th month began: its notice still gives a month, not its 12 months' end (11 November).
  const late = contact(env, "late@example.je", { last_activity_at: "2025-11-10T10:00:00.000Z" });
  const before = contact(off, "jane@example.je");
  await retentionNoticePass(env, NOTICE);
  assert.deepEqual(notices(env).map(n => [n.entity_id, n.text.match(/on or after (.+)\.$/m)[1]]),
    [[String(late), "26 November 2026"], [String(c), "26 November 2026"]]);
  await send(env, NOTICE);
  await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
  assert.deepEqual([state(env, c), state(env, late)], ["accepted", "accepted"]);
  assert.equal((await runRetention(env, "2026-11-20T09:00:00.000Z")).contacts, 0);
  assert.equal((await runRetention(off, BEFORE_MONTH)).contacts, 1); // switched off, as today
  assert.equal(exists(off, before), false);
  assert.equal((await runRetention(env, BEFORE_MONTH)).contacts, 1); // no email: as today
  assert.deepEqual([exists(env, c), exists(env, late), exists(env, phoneOnly)], [true, true, false]);
  assert.equal((await runRetention(env, AFTER)).contacts, 2);
  assert.deepEqual([exists(env, c), exists(env, late)], [false, false]);
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM retention_notices").n, 0);
  assert.deepEqual(tasks(env), []);
});

test("a failed, uncertain or suppressed notice keeps the contact and opens one Inbox task", async () => {
  const env = world();
  const failed = contact(env, "failed@example.je"), unknown = contact(env, "unknown@example.je");
  const suppressed = contact(env, "suppressed@example.je"), waiting = contact(env, "waiting@example.je");
  insert(env, "email_suppressions", { address_hash: await sha256("suppressed@example.je"), created_at: T0, reason: "team" });
  await retentionNoticePass(env, NOTICE);
  env.EMAIL.send = async m => {
    if (m.to === "waiting@example.je") throw Object.assign(new Error("slow"), { code: "E_RATE_LIMIT_EXCEEDED" });
    if (m.to === "failed@example.je") throw Object.assign(new Error("no"), { code: "E_DELIVERY_FAILED" });
    throw new Error("timeout");
  };
  await send(env, NOTICE);
  for (const at of ["2026-10-26T09:10:00.000Z", "2026-10-26T09:20:00.000Z"]) await retentionNoticePass(env, at);
  assert.deepEqual([state(env, failed), state(env, unknown), state(env, suppressed), state(env, waiting)],
    ["failed", "unknown", "not_sent", "queued"]);
  const open = tasks(env).sort((a, b) => a.entity_id - b.entity_id);
  assert.deepEqual(open.map(t => [Number(t.entity_id), JSON.parse(t.data).reason, t.category]),
    [[failed, "failed", "task"], [unknown, "unknown", "task"], [suppressed, "not_sent", "task"]]);
  assert.ok(open.every(t => t.task_key === `retention_notice:${t.entity_id}:${LAST}` && !/@/.test(t.title)));
  // The one still waiting for a result on the date it gave is uncertain too.
  await retentionNoticePass(env, "2026-11-26T00:01:00.000Z");
  await retentionNoticePass(env, "2026-11-26T00:11:00.000Z");
  assert.deepEqual(tasks(env).map(t => [Number(t.entity_id), JSON.parse(t.data).reason]).at(-1), [waiting, "unknown"]);
  assert.equal(tasks(env).length, 4);
  // Done on a task authorises nothing: the contacts stay, and no second task opens.
  env.DB.raw.prepare("UPDATE notifications SET resolved_at = ?, resolved_by = 'admin@example.test' WHERE task_key LIKE 'retention_notice:%'")
    .run(AFTER);
  assert.equal((await runRetention(env, AFTER)).contacts, 0);
  await retentionNoticePass(env, AFTER);
  assert.equal(tasks(env).length, 4);
  assert.ok([failed, unknown, suppressed, waiting].every(id => exists(env, id)));
});

test("a reply to the notice keeps the contact, even before the clock has seen it", async () => {
  const env = world();
  const c = contact(env, "jane@example.je");
  await retentionNoticePass(env, NOTICE);
  await send(env, NOTICE);
  await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
  insert(env, "email_inbound", { dedupe_key: "d", sender: "jane@example.je", header_from: "jane@example.je",
    recipient: "replies@app.hamptonestatesjersey.com", subject: "Re", text: "Please keep my details", html_only: 0,
    truncated: 0, received_at: "2026-11-26T09:00:00.000Z" });
  assert.equal((await runRetention(env, AFTER)).contacts, 0);
  await retentionNoticePass(env, AFTER);
  assert.equal(state(env, c), "replied");
  assert.deepEqual(tasks(env).map(t => JSON.parse(t.data).reason), ["replied"]);
  // Weeks later, with the reply's content cleared, the notice still says answered.
  env.DB.raw.prepare("DELETE FROM email_inbound").run();
  assert.equal((await runRetention(env, "2027-01-10T09:00:00.000Z")).contacts, 0);
  assert.equal(exists(env, c), true);
});

test("new activity clears the notice: its email is not sent and the contact is not deleted", async () => {
  const env = world();
  const c = contact(env, "jane@example.je"), searching = contact(env, "tom@example.je");
  await retentionNoticePass(env, NOTICE);
  env.DB.raw.prepare("UPDATE contacts SET last_activity_at = ? WHERE id = ?").run("2026-10-26T09:05:00.000Z", c);
  // An active search since: the email is held at its claim, and the next tick withdraws it.
  insert(env, "applicants", { contact_id: searching, operation: "buy", source: "web", search_state: "active", created_at: T0,
    updated_at: T0 });
  await send(env, "2026-10-26T09:06:00.000Z");
  assert.equal(env.sent.length, 0);
  await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
  assert.deepEqual(notices(env).map(n => n.status), ["cancelled", "cancelled"]);
  assert.equal(one(env, "SELECT COUNT(*) AS n FROM retention_notices").n, 0);
  assert.equal((await runRetention(env, AFTER)).contacts, 0);
  assert.deepEqual([exists(env, c), exists(env, searching)], [true, true]);
  assert.deepEqual(tasks(env), []);
  // A sent notice of an episode that ended authorises nothing either: the next episode needs its own.
  const later = contact(env, "later@example.je");
  await retentionNoticePass(env, NOTICE);
  await send(env, NOTICE);
  await retentionNoticePass(env, "2026-10-26T09:20:00.000Z");
  env.DB.raw.prepare("UPDATE contacts SET last_activity_at = ? WHERE id = ?").run("2025-11-25T10:00:01.000Z", later);
  await retentionNoticePass(env, "2026-10-26T09:30:00.000Z");
  assert.equal(state(env, later), "queued"); // a new notice for the new episode
  assert.equal(notices(env).filter(n => n.entity_id === String(later)).length, 2);
  assert.equal((await runRetention(env, AFTER)).contacts, 0);
});

test("email service off: nothing is queued, nobody with an email is deleted unnoticed, and one task each", async () => {
  const env = Object.assign(makeEnv(), ON, { EMAIL_SERVICE_READY: "false" });
  const c = contact(env, "jane@example.je"), phoneOnly = contact(env, null, { phone: "+447797000003" });
  await retentionNoticePass(env, NOTICE);
  assert.deepEqual(notices(env), []);
  assert.deepEqual(tasks(env), []); // not due yet: the service may be on by then
  assert.equal((await runRetention(env, AFTER)).contacts, 1);
  assert.deepEqual([exists(env, c), exists(env, phoneOnly)], [true, false]);
  await retentionNoticePass(env, AFTER);
  await retentionNoticePass(env, "2026-11-26T09:40:00.000Z");
  assert.deepEqual(tasks(env).map(t => [Number(t.entity_id), JSON.parse(t.data).reason]), [[c, "not_sent"]]);
  assert.deepEqual(notices(env), []);
});

test("the clock prepares and sends the notice in its tick", async t => {
  t.mock.method(console, "log", () => {});
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(NOTICE) });
  const env = Object.assign(emailEnv({ summary: false }), ON);
  contact(env, "jane@example.je");
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.parse(NOTICE) }, env, { waitUntil() {} });
  assert.deepEqual(env.sent.map(m => m.to), ["jane@example.je"]);
});

// Review fixes (GRAVE 1): an answer counts however it arrives; when in doubt, the contact stays.
const noticeOf = (env, id) => one(env, "SELECT id, ref, message_id FROM outbound WHERE template = 'retention_notice' AND entity_id = ?", String(id));
let inboundKey = 0;
const inbound = (env, o) => insert(env, "email_inbound", { dedupe_key: `k${++inboundKey}`, sender: "someone@example.je",
  header_from: "someone@example.je", recipient: "replies@app.hamptonestatesjersey.com", subject: "Re", text: "Please keep my details",
  html_only: 0, truncated: 0, received_at: "2026-11-26T09:00:00.000Z", ...o });

test("an answer from another address, a rewritten envelope, a thread or a linked reply keeps the contact", async () => {
  const env = world();
  const quoted = contact(env, "jane@work.je"), rewritten = contact(env, "tom@corp.je"), threaded = contact(env, "ann@example.je");
  const linked = contact(env, "bob@example.je"), unrelated = contact(env, "sue@example.je");
  await retentionNoticePass(env, NOTICE);
  await send(env, NOTICE);
  await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
  inbound(env, { sender: "jane.home@gmail.com", header_from: "jane.home@gmail.com",
    subject: `Fwd: Your details [HE-OUT-${noticeOf(env, quoted).ref.toUpperCase()}]` });
  inbound(env, { sender: "prvs=123abc=tom@corp.je", header_from: "tom@corp.je" });
  inbound(env, { references_header: `<other@example.je> <${noticeOf(env, threaded).message_id}>` });
  inbound(env, { outbound_id: noticeOf(env, linked).id });
  inbound(env, { subject: "Something else" }); // from nobody on file, about nothing sent: changes nothing
  // Before the clock has read them, and after.
  assert.equal((await runRetention(env, AFTER)).contacts, 1);
  assert.deepEqual([quoted, rewritten, threaded, linked, unrelated].map(id => exists(env, id)), [true, true, true, true, false]);
  await retentionNoticePass(env, "2026-11-26T09:40:00.000Z");
  assert.deepEqual([quoted, rewritten, threaded, linked].map(id => state(env, id)), ["replied", "replied", "replied", "replied"]);
  assert.deepEqual(tasks(env).map(t => JSON.parse(t.data).reason), ["replied", "replied", "replied", "replied"]);
});

// Review fixes (GRAVE 2): once 0112 exists, whatever the switch says (turned off again, or the website and the clock
// briefly different during a deploy), no contact goes against its notice.
test("switched off again, a contact is never deleted against its notice's promise", async () => {
  const env = world();
  const replied = contact(env, "replied@example.je"), unknown = contact(env, "unknown@example.je");
  const waiting = contact(env, "waiting@example.je"), suppressed = contact(env, "suppressed@example.je");
  const settled = contact(env, "settled@example.je"), none = contact(env, "none@example.je");
  const late = contact(env, "late@example.je", { last_activity_at: "2025-11-10T10:00:00.000Z" }); // promised 26 November
  insert(env, "email_suppressions", { address_hash: await sha256("suppressed@example.je"), created_at: T0, reason: "team" });
  await retentionNoticePass(env, NOTICE);
  env.EMAIL.send = async m => {
    if (m.to === "unknown@example.je") throw new Error("timeout");
    if (m.to === "waiting@example.je") throw Object.assign(new Error("slow"), { code: "E_RATE_LIMIT_EXCEEDED" });
    env.sent.push(m); return { messageId: `provider-${env.sent.length}` };
  };
  await send(env, NOTICE);
  await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
  inbound(env, { sender: "replied@example.je", header_from: "replied@example.je", received_at: "2026-10-27T09:00:00.000Z" });
  await retentionNoticePass(env, "2026-10-27T09:10:00.000Z");
  assert.deepEqual([replied, unknown, waiting, suppressed, settled, late].map(id => state(env, id)),
    ["replied", "unknown", "queued", "not_sent", "accepted", "accepted"]);
  env.DB.raw.prepare("DELETE FROM retention_notices WHERE contact_id = ?").run(none); // no notice on file, as before the switch
  env.PRE12_RETENTION_NOTICE_READY = "0";
  assert.equal((await runRetention(env, "2026-11-20T09:00:00.000Z")).contacts, 0); // late: its 12 months are over, not its date
  assert.equal((await runRetention(env, AFTER)).contacts, 3); // settled, late and the contact with no notice: as today
  assert.deepEqual([replied, unknown, waiting, suppressed, settled, late, none].map(id => exists(env, id)),
    [true, true, true, true, false, false, false]);
});

// Review fixes (MENOR 4): switched on before 0112 is applied, everything works as today.
test("switched on without migration 0112: email and the retention pass work as today", async t => {
  t.mock.method(console, "error", () => {});
  const env = Object.assign(makeEnv({ skip: [112] }), ON, { EMAIL_SERVICE_READY: "true" });
  env.sent = [];
  env.EMAIL = { async send(m) { env.sent.push(m); return { messageId: `provider-${env.sent.length}` }; } };
  env.DB.raw.prepare("INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('email', ?, ?, ?)")
    .run(JSON.stringify({ enabled: true, summary: true, recipients: ["team@example.test"], revision: 1,
      approved_by: "admin@example.test", approved_at: T0 }), T0, "admin@example.test");
  const c = contact(env, "jane@example.je");
  await retentionNoticePass(env, NOTICE);
  await emailPass(env, NOTICE, () => NOTICE);
  assert.deepEqual(env.sent.map(m => m.to), ["team@example.test"]);
  assert.equal((await runRetention(env, AFTER)).contacts, 1);
  assert.equal(exists(env, c), false);
});

// Review fixes (MENOR 3): notices take at most NOTICE_DAILY_LIMIT of the day's 100 sends; the rest wait for the next day.
test("notices take at most 20 of a Jersey day's sends, so the team's emails still go", async () => {
  const env = world();
  for (let i = 0; i < 30; i++) contact(env, `p${i}@example.je`);
  await retentionNoticePass(env, NOTICE);
  for (const at of ["2026-10-26T09:01:00.000Z", "2026-10-26T09:02:00.000Z", "2026-10-26T09:03:00.000Z"]) await send(env, at);
  assert.equal(env.sent.length, NOTICE_DAILY_LIMIT);
  await emailPass(env, "2026-10-26T09:04:00.000Z", () => "2026-10-26T09:04:00.000Z");
  assert.deepEqual(env.sent.slice(NOTICE_DAILY_LIMIT).map(m => m.to), ["team@example.test"]);
  await send(env, "2026-10-27T09:00:00.000Z");
  assert.equal(env.sent.filter(m => m.to !== "team@example.test").length, 30);
});

// Review fixes (MENOR 5): the task says what is true whichever way the notice ends.
test("the task's text holds whether the notice later goes or not", async () => {
  const env = world();
  contact(env, "jane@example.je");
  await retentionNoticePass(env, NOTICE);
  await retentionNoticePass(env, "2026-11-26T00:05:00.000Z"); // no result by the date it gave
  const [task] = all(env, "SELECT task_reason FROM notifications WHERE task_key LIKE 'retention_notice:%'");
  assert.match(task.task_reason, /Nothing has been deleted\./);
  assert.match(task.task_reason, /only once a notice has been confirmed sent and a month has passed/);
  assert.doesNotMatch(task.task_reason, /on hold/);
  await send(env, "2026-11-26T00:10:00.000Z"); // sent after all: a month later the pass may delete, as the task said
  await retentionNoticePass(env, "2026-11-26T00:20:00.000Z");
  assert.equal((await runRetention(env, "2026-12-27T09:00:00.000Z")).contacts, 1);
});

// PRE-12 (D4): a contact linked to a tenancy still running is kept by the pass, so the notice must not tell them they
// will be deleted; when the tenancy ends they get a fresh notice, never the old one.
const tenancyLink = (env, id, ended = null) => {
  const r = insert(env, "landlords", { name: "Synthetic Landlord", created_at: T0, updated_at: T0 });
  const rental = insert(env, "rentals", { landlord_id: r, address: "1 Fictitious Row", parish: "St Helier", service: "full",
    fee_percent: 10, created_at: T0, updated_at: T0 });
  const t = insert(env, "tenancies", { rental_id: rental, payment_ref: `REF${rental}`, tenant_name: "Synthetic Tenant", occupants: "A",
    kind: "fixed", regime: "2025", start_on: "2026-01-01", end_on: "2027-01-01", rent: 1500, due_day: 1, deposit: 2000, ended_on: ended,
    notes: "n", created_at: T0, updated_at: T0 });
  insert(env, "tenancy_contact_links", { tenancy_id: t, contact_id: id, linked: 1, tenant_revision: "a".repeat(64), actor: "x", at: T0 });
  return t;
};

test("a contact linked to a running tenancy gets no notice, and a waiting or sent one is withdrawn", async () => {
  const env = world({ ...ON, PRE12_TENANCY_LINK_READY: "1" });
  const held = contact(env, "tenant@example.je"), free = contact(env, "free@example.je");
  tenancyLink(env, held);
  await retentionNoticePass(env, NOTICE);
  assert.deepEqual(notices(env).map(n => n.entity_id), [String(free)]);
  assert.equal(state(env, held), undefined);
  // Linked after its notice was already sent: the old notice goes, so the tenancy's end does not delete on it.
  const later = contact(env, "later@example.je");
  await retentionNoticePass(env, "2026-10-26T09:10:00.000Z");
  await send(env, "2026-10-26T09:12:00.000Z");
  await retentionNoticePass(env, "2026-10-26T09:20:00.000Z"); // records the outcome
  assert.equal(state(env, later), "accepted");
  tenancyLink(env, later);
  await retentionNoticePass(env, "2026-10-27T09:00:00.000Z");
  assert.equal(state(env, later), undefined);
  assert.equal((await runRetention(env, AFTER)).contacts, 1); // only the free one: both tenants stay
  assert.deepEqual([exists(env, held), exists(env, later)], [true, true]);
});

test("an ended tenancy holds nothing: the notice goes as for any contact", async () => {
  const env = world({ ...ON, PRE12_TENANCY_LINK_READY: "1" });
  const c = contact(env, "gone@example.je");
  tenancyLink(env, c, "2026-09-01");
  await retentionNoticePass(env, NOTICE);
  assert.deepEqual(notices(env).map(n => n.entity_id), [String(c)]);
});

test("with the tenancy link switch off the notice is as before", async () => {
  const env = world();
  const c = contact(env, "tenant@example.je");
  tenancyLink(env, c);
  await retentionNoticePass(env, NOTICE);
  assert.deepEqual(notices(env).map(n => n.entity_id), [String(c)]);
});
