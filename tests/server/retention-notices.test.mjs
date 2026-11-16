import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, T0 } from "./helpers.mjs";
import { emailEnv } from "./email-helpers.mjs";
import { dispatchEmail } from "../../server/email.js";
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
  assert.equal(seen.some(sql => /retention_notices/.test(sql)), false);
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
