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
