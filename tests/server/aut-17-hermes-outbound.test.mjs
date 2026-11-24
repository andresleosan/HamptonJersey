// AUT-17: the app's approved email queue (outbound) delivered by Hermes's mail carrier from Hampton's Gmail, verbatim,
// with the same claim as the clock's dispatcher: approval, pause, suppressions, the day's limit, one claim each.
import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";
import { configure, TS } from "./email-helpers.mjs";
import { prepareSummary, DAILY_LIMIT, emailDay } from "../../server/email.js";

const KEY = "hermes-mail-key-hermes-mail-key-0123456789";
const door = (env, path, body) => call(env, "POST", `/hermes/mail/${path}`, { body, bearer: KEY, origin: null });
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.data)); return r.data; };
const row = (env, sql, ...a) => ({ ...env.DB.raw.prepare(sql).get(...a) });
function world({ mail = true } = {}) {
  const env = { ...makeEnv(), HERMES_KEY: "g".repeat(40), HERMES_MAIL_KEY: KEY, ...(mail && { HERMES_MAIL_READY: "1" }) };
  configure(env);
  return env;
}
const at = (t, iso) => t.mock.timers.enable({ apis: ["Date"], now: Date.parse(iso) });

test("with Hermes as the transport, the clock prepares the day's team summary without Cloudflare's binding", async () => {
  const off = world({ mail: false });
  await prepareSummary(off, TS);
  assert.equal(row(off, "SELECT COUNT(*) n FROM outbound").n, 0, "no transport, nothing prepared");
  const env = world();
  await prepareSummary(env, TS);
  assert.equal(row(env, "SELECT COUNT(*) n FROM outbound WHERE status = 'queued'").n, 1);
});

test("Hermes claims an approved email once, verbatim with its reference, and its result settles it once", async t => {
  at(t, TS);
  const env = world();
  await prepareSummary(env, TS);
  const { email } = ok(await door(env, "outbound/next"));
  assert.equal(email.to, "team@example.test");
  assert.match(email.subject, /^Hampton summary · 2026-11-06 \[HE-OUT-[a-f0-9]{32}\]$/);
  assert.ok(email.text.includes("Hampton summary"));
  assert.equal(ok(await door(env, "outbound/next")).email, null, "claimed once");
  assert.equal(row(env, "SELECT COUNT(*) n FROM email_attempts WHERE day = ?", emailDay(TS)).n, 1, "counted in the day's limit");
  assert.equal((await door(env, `outbound/${email.ref}/result`, { token: "x".repeat(36), outcome: "sent", message_id: "m1" })).status, 403);
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "sent", message_id: "m1" }));
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "sent", message_id: "m1" }));
  const o = row(env, "SELECT status, message_id FROM outbound WHERE ref = ?", email.ref);
  assert.deepEqual([o.status, o.message_id], ["accepted", "m1"]);
  assert.equal((await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "failed" })).status, 409);
});

test("paused, suppressed, email switched off or over the day's limit: nothing is claimed; failed and unknown settle as the clock's", async t => {
  at(t, TS);
  const env = world();
  await prepareSummary(env, TS);
  env.DB.raw.prepare("INSERT INTO app_settings VALUES ('outbound', '{\"paused\":true}', ?, 'x')").run(T0);
  assert.equal(ok(await door(env, "outbound/next")).email, null, "paused");
  env.DB.raw.prepare("DELETE FROM app_settings WHERE key = 'outbound'").run();
  for (let i = 0; i < DAILY_LIMIT; i++) env.DB.raw.prepare("INSERT INTO email_attempts VALUES (?, NULL, ?, ?)").run(`t${i}`, emailDay(TS), T0);
  assert.equal(ok(await door(env, "outbound/next")).email, null, "limit");
  env.DB.raw.prepare("DELETE FROM email_attempts").run();
  configure(env, { enabled: false });
  assert.equal(ok(await door(env, "outbound/next")).email, null, "email off in Email settings");
  configure(env);
  const { email } = ok(await door(env, "outbound/next"));
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "unknown" }));
  assert.equal(row(env, "SELECT status FROM outbound WHERE ref = ?", email.ref).status, "unknown");
  const off = world({ mail: false });
  assert.equal((await door(off, "outbound/next")).status, 404);
});

test("Email settings and the enquiry panel see Hermes as the sender while it polls", async () => {
  const env = world();
  const s = ok(await call(env, "GET", "/admin/email/settings", { cookie: await adminCookie() }));
  assert.equal(s.ready, true);
  ok(await door(env, "outbound/next"));
  assert.ok(row(env, "SELECT value FROM app_settings WHERE key = 'hermes_mail_seen'").value);
});

test("a late result settles an expired claim; a rate limit goes back to the queue; notices stay on Cloudflare", async t => {
  at(t, TS);
  const env = world();
  await prepareSummary(env, TS);
  const { email } = ok(await door(env, "outbound/next"));
  t.mock.timers.tick(6 * 60e3);
  ok(await door(env, "outbound/next")); // expires the claim, as the clock's tick would
  assert.equal(row(env, "SELECT status FROM outbound WHERE ref = ?", email.ref).status, "unknown");
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "sent", message_id: "late1" }));
  assert.deepEqual({ ...row(env, "SELECT status, message_id FROM outbound WHERE ref = ?", email.ref) }, { status: "accepted", message_id: "late1" });
  const again = world();
  await prepareSummary(again, TS);
  const e2 = ok(await door(again, "outbound/next")).email;
  ok(await door(again, `outbound/${e2.ref}/result`, { token: e2.token, outcome: "retry" }));
  assert.equal(row(again, "SELECT status FROM outbound WHERE ref = ?", e2.ref).status, "queued", "back to the queue, as the clock's");
  const n = world();
  n.DB.raw.prepare(`INSERT INTO outbound (ref, dedupe_key, template, entity_id, version, recipient, recipient_hash, subject, text, status,
    approved_by, approved_at, created_at, updated_at) VALUES (?, 'k', 'retention_notice', '1', 1, 'p@example.test', 'h', 'S', 'T', 'queued', 'a', ?, ?, ?)`)
    .run("b".repeat(32), T0, T0, T0);
  assert.equal(ok(await door(n, "outbound/next")).email, null, "a retention notice is never handed to Hermes");
});

test("the panel says the carrier is ready only when the clock has Hermes on too", async () => {
  const env = world();
  ok(await door(env, "outbound/next"));
  const get = async () => ok(await call(env, "GET", "/admin/email/settings", { cookie: await adminCookie() })).worker;
  assert.equal((await get()).ready, false, "the clock has not said it has Hermes on");
  env.DB.raw.prepare("INSERT INTO app_settings VALUES ('email_worker', ?, ?, 'system')").run(JSON.stringify({ at: new Date().toISOString(), ready: false, hermes: true }), T0);
  assert.equal((await get()).ready, true);
});

// An approved enquiry (AGE-05) sent by the carrier keeps its Gmail thread, so the agency's reply comes back to the app
// (fase D) linked to that email (email_inbound.outbound_id), as a reply through Cloudflare is. Only enquiries: the team
// summary and other notices are not watched.
// The claim of a real enquiry needs its consultation (AGE-05's check): here the day's summary is claimed and relabelled.
async function claimEnquiry(env) {
  await prepareSummary(env, TS);
  const { email } = ok(await door(env, "outbound/next"));
  env.DB.raw.prepare("UPDATE outbound SET template = 'enquiry' WHERE ref = ?").run(email.ref);
  return email;
}
const reply = over => ({ id: "g1", at: new Date(Date.now() + 60e3).toISOString(), from: "Desk <desk@agency.example.test>",
  subject: "Re: Enquiry", message_id: "<r1@agency.example.test>", text: "Yes, still available.", ...over });

test("an enquiry sent by the carrier keeps its thread; the agency's reply comes back linked to it", async t => {
  at(t, TS);
  const env = world();
  const email = await claimEnquiry(env);
  assert.equal((await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "sent", message_id: "m1", thread_id: "bad id!" })).status, 400);
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "sent", message_id: "m1", thread_id: "t9" }));
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "sent", message_id: "m1", thread_id: "t9" }));
  const o = row(env, "SELECT id, status, gmail_thread_id FROM outbound WHERE ref = ?", email.ref);
  assert.deepEqual([o.status, o.gmail_thread_id], ["accepted", "t9"]);
  assert.deepEqual(ok(await door(env, "threads")).threads.map(x => x.id), ["t9"]);
  t.mock.timers.tick(5 * 60e3);
  assert.deepEqual(ok(await door(env, "replies", { thread_id: "t9", messages: [reply()] })), { stored: 1 });
  assert.deepEqual(ok(await door(env, "replies", { thread_id: "t9", messages: [reply()] })), { stored: 0 }, "once");
  const r = row(env, "SELECT outbound_id, mail_task_id, reply_kind, sender FROM email_inbound");
  assert.deepEqual([r.outbound_id, r.mail_task_id, r.reply_kind, r.sender], [o.id, null, "human", "desk@agency.example.test"]);
  assert.deepEqual(ok(await door(env, "replies", { thread_id: "t9", messages: [reply({ id: "g0", at: "2000-01-01T00:00:00.000Z" })] })),
    { stored: 0 }, "older than the send");
  env.DB.raw.prepare("UPDATE outbound SET recipient = NULL WHERE id = ?").run(o.id); // the contact's erasure (0023's trigger)
  assert.deepEqual(ok(await door(env, "threads")).threads, [], "an erased contact's thread is no longer read");
  assert.equal((await door(env, "replies", { thread_id: "t9", messages: [reply({ id: "g2" })] })).status, 404);
});

test("a late result keeps the thread; the team summary's thread is not watched; the installed carrier without a thread still settles", async t => {
  at(t, TS);
  const env = world();
  const email = await claimEnquiry(env);
  t.mock.timers.tick(6 * 60e3);
  ok(await door(env, "outbound/next")); // the claim expires
  ok(await door(env, `outbound/${email.ref}/result`, { token: email.token, outcome: "sent", message_id: "late1", thread_id: "t8" }));
  assert.equal(row(env, "SELECT gmail_thread_id FROM outbound WHERE ref = ?", email.ref).gmail_thread_id, "t8");
  const s = world();
  await prepareSummary(s, TS);
  const e = ok(await door(s, "outbound/next")).email;
  ok(await door(s, `outbound/${e.ref}/result`, { token: e.token, outcome: "sent", message_id: "m2", thread_id: "t7" }));
  assert.equal(row(s, "SELECT gmail_thread_id FROM outbound WHERE ref = ?", e.ref).gmail_thread_id, null);
  assert.deepEqual(ok(await door(s, "threads")).threads, []);
  assert.equal((await door(s, "replies", { thread_id: "t7", messages: [reply()] })).status, 404);
  const old = world();
  const e2 = await claimEnquiry(old);
  ok(await door(old, `outbound/${e2.ref}/result`, { token: e2.token, outcome: "sent", message_id: "m3" }));
  assert.equal(row(old, "SELECT status FROM outbound WHERE ref = ?", e2.ref).status, "accepted");
});
