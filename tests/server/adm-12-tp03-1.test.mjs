import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, dumpD1 } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";
import { ADMIN, OTHER, KEY, seed, onEnv, staff, inAWeek, count, backdate, link, ask, verify, lastCode, signIn }
  from "./adm-12-tp03-fixtures.mjs";

// ADM-12 (plan tp03-adm-12, Tarea 1; spec tp03-case-evidence): external authentication and permissions by purpose.
// A link (256 bits, kept as its hash) works only once a person records sending it and until the day the team chose;
// with it the tenant asks for a 6-digit code by email (10 minutes, 5 tries, 1 a minute, 10 a day, inside the team's 100
// emails a day) and gets a 30-minute session limited to one tenancy and one purpose. Off: none of it exists.
let mod;
try { mod = await import("../../server/case-access.js"); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; }
const need = () => assert.ok(mod, "server/case-access.js is not built yet");

test("off: no new route answers and the existing rental answers are the same", async () => {
  const off = seed(makeEnv()), on = seed(onEnv());
  for (const [method, path] of [["POST", "/case-access/challenge"], ["POST", "/case-access/verify"], ["GET", "/repair-report"],
    ["POST", "/repair-report/submit"], ["GET", "/admin/tenancies/1/repair-links"], ["POST", "/admin/tenancies/1/repair-links"],
    ["POST", "/admin/case-grants/00000000-0000-4000-8000-000000000000/sent"]])
    assert.equal((await call(off, method, path, { body: method === "POST" ? {} : undefined, cookie: await adminCookie() })).status,
      404, `${method} ${path}`);
  for (const path of ["/admin/rentals/1", "/admin/tenancies/1"]) {
    const a = await staff(off, "GET", path), b = await staff(on, "GET", path);
    assert.equal(a.status, 200);
    assert.deepEqual(b.data, a.data, path);
  }
  assert.equal(count(on, "case_grants"), 0);
});

test("on without the operator's key, the email service or migration 0110: closed, nothing written", async () => {
  for (const env of [seed(onEnv({ CASE_CHALLENGE_HMAC_KEY: undefined })), seed(onEnv({ CASE_CHALLENGE_HMAC_KEY: "short" }))]) {
    assert.equal((await staff(env, "POST", "/admin/tenancies/1/repair-links", { expires_on: inAWeek() })).status, 503);
    assert.equal((await ask(env, "A".repeat(43))).status, 503);
    assert.equal(count(env, "case_grants"), 0);
  }
  // The key is there but no email can go (AUT-17): no code, no challenge.
  for (const extra of [{ EMAIL_SERVICE_READY: "false" }, { EMAIL: undefined }]) {
    const env = seed(onEnv()), { token } = await link(env);
    Object.assign(env, extra);
    assert.equal((await ask(env, token)).status, 503);
    assert.deepEqual([count(env, "case_challenges"), count(env, "email_attempts")], [0, 0]);
  }
  const before = seed(onEnv({}, { skip: [110] }));
  assert.equal((await staff(before, "POST", "/admin/tenancies/1/repair-links", { expires_on: inAWeek() })).status, 503);
  assert.equal((await ask(before, "A".repeat(43))).status, 503);
});

test("case-access consumes ADM-18's capabilities: without them (or without 0046/0049) no link is created or activated", async () => {
  const env = seed(onEnv());
  assert.equal((await staff(env, "POST", "/admin/tenancies/1/repair-links", { expires_on: inAWeek() }, OTHER)).status, 403);
  const { id } = await link(env, { sent: false });
  assert.equal((await staff(env, "POST", `/admin/case-grants/${id}/sent`, {}, OTHER)).status, 403, "activating needs it too");
  assert.equal((await staff(env, "POST", `/admin/case-grants/${id}/revoke`, {}, OTHER)).status, 200, "closing access never does");
  const without = seed(onEnv({}, { skip: [46, 49] }), { capability: false });
  assert.equal((await staff(without, "POST", "/admin/tenancies/1/repair-links", { expires_on: inAWeek() })).status, 403);
  assert.equal(count(without, "case_grants"), 0);
});

test("explicit_expiry_required_no_default: the team picks the last day; none, past or over a year is refused", async () => {
  const env = seed(onEnv()), T = jerseyToday();
  for (const expires_on of [undefined, "", "2026-02-30", plusDays(T, -1), plusDays(T, 367)])
    assert.equal((await staff(env, "POST", "/admin/tenancies/1/repair-links", { expires_on })).status, 400, String(expires_on));
  assert.equal(count(env, "case_grants"), 0);
  // A tenancy without a valid email, or one that has ended, gets no link.
  env.DB.raw.prepare("UPDATE tenancies SET tenant_email = 'not an email' WHERE id = 2").run();
  assert.equal((await staff(env, "POST", "/admin/tenancies/2/repair-links", { expires_on: T })).status, 409);
  env.DB.raw.prepare("UPDATE tenancies SET tenant_email = 'x@example.test', ended_on = ? WHERE id = 2").run(T);
  assert.equal((await staff(env, "POST", "/admin/tenancies/2/repair-links", { expires_on: T })).status, 409);
  const ok = await link(env, { expires_on: T, sent: false });
  const g = env.DB.raw.prepare("SELECT expires_on, expires_at, status FROM case_grants WHERE id = ?").get(ok.id);
  assert.deepEqual({ ...g }, { expires_on: T, expires_at: mod.caseExpiresAt(T), status: "dormant" });
});

test("expiry_at_next_Jersey_day_start_DST: the link ends when the next Jersey day starts, BST or GMT", () => {
  need();
  assert.equal(mod.caseExpiresAt("2026-10-24"), "2026-10-24T23:00:00.000Z"); // the 25th starts in BST
  assert.equal(mod.caseExpiresAt("2026-10-25"), "2026-10-26T00:00:00.000Z"); // the 26th starts in GMT
  assert.equal(mod.caseExpiresAt("2026-03-28"), "2026-03-29T00:00:00.000Z"); // the 29th starts in GMT
  assert.equal(mod.caseExpiresAt("2026-03-29"), "2026-03-29T23:00:00.000Z"); // the 30th starts in BST
  assert.equal(mod.caseExpiresAt("2026-12-31"), "2027-01-01T00:00:00.000Z");
});

test("link_without_code_cannot_read_c3: the link alone reads nothing; a dormant link sends nothing", async () => {
  const env = seed(onEnv());
  const dormant = await link(env, { sent: false });
  assert.equal((await ask(env, dormant.token)).status, 404);
  assert.equal(env.sent.length, 0);
  const { token } = await link(env);
  const c = await ask(env, token);
  assert.equal(c.status, 202);
  assert.deepEqual(Object.keys(c.data).sort(), ["challenge_id", "expires_at"], "no address, name or email");
  for (const [method, path] of [["GET", "/repair-report"], ["POST", "/repair-report/submit"]])
    assert.equal((await call(env, method, path, { body: method === "POST" ? { title: "Leak" } : undefined })).status, 404);
  assert.equal((await ask(env, "B".repeat(43))).status, 404, "an unknown link is told apart from nothing");
  assert.equal(env.sent.length, 1);
  assert.equal(env.sent[0].to, "tenant.one@example.test");
});

test("verify: the right code opens a 30-minute session; a wrong, expired or replayed code does not", async () => {
  const env = seed(onEnv()), { token } = await link(env);
  const c = (await ask(env, token)).data, code = lastCode(env), wrong = code === "000000" ? "000001" : "000000";
  assert.equal((await verify(env, c.challenge_id, wrong)).status, 400);
  assert.equal((await verify(env, c.challenge_id, "12345")).status, 400, "6 digits");
  const v = await verify(env, c.challenge_id, code);
  assert.equal(v.status, 200);
  const cookie = v.headers.get("set-cookie");
  assert.match(cookie, /^__Host-hampton-case=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=(\d+)$/);
  assert.ok(Number(/Max-Age=(\d+)/.exec(cookie)[1]) <= 1800);
  assert.equal(v.headers.get("cache-control"), "no-store");
  assert.equal((await verify(env, c.challenge_id, code)).status, 410, "replayed");
  // Expired after 10 minutes.
  backdate(env, "case_auth_attempts", "at");
  const c2 = (await ask(env, token)).data;
  backdate(env, "case_challenges", "expires_at", `id = '${c2.challenge_id}'`);
  assert.equal((await verify(env, c2.challenge_id, lastCode(env))).status, 410);
  // A new code makes the previous one useless.
  backdate(env, "case_auth_attempts", "at");
  const c3 = (await ask(env, token)).data, old = lastCode(env);
  backdate(env, "case_auth_attempts", "at");
  await ask(env, token);
  assert.equal((await verify(env, c3.challenge_id, old)).status, 410);
});

test("max5_attempts_10min_atomic_challenge: at most 5 tries per code, even all at once", async () => {
  const env = seed(onEnv()), { token } = await link(env);
  const c = (await ask(env, token)).data, code = lastCode(env), wrong = String((Number(code) + 1) % 1e6).padStart(6, "0");
  const statuses = (await Promise.all(Array.from({ length: 8 }, () => verify(env, c.challenge_id, wrong)))).map(r => r.status);
  assert.deepEqual(statuses.sort(), [400, 400, 400, 400, 410, 410, 410, 410], "the fifth wrong try ends the code");
  assert.equal(env.DB.raw.prepare("SELECT attempts FROM case_challenges").get().attempts, 5);
  assert.equal((await verify(env, c.challenge_id, code)).status, 410, "the right code after 5 tries");
  assert.equal(count(env, "case_sessions"), 0);
});

test("quotas: one code a minute and 10 a day per link; the team's 100 emails a day are shared atomically", async () => {
  const env = seed(onEnv()), { token } = await link(env);
  assert.equal((await ask(env, token)).status, 202);
  assert.equal((await ask(env, token)).status, 429, "a minute");
  for (let i = 1; i < 10; i++) { backdate(env, "case_auth_attempts", "at"); assert.equal((await ask(env, token)).status, 202); }
  backdate(env, "case_auth_attempts", "at");
  assert.equal((await ask(env, token)).status, 429, "10 a day");
  assert.deepEqual([count(env, "case_challenges"), count(env, "case_auth_attempts"), env.sent.length], [10, 10, 10]);

  // combined_auth_business_quota100_atomic: 99 emails already today; two tenants ask at once and only one code goes.
  const shared = seed(onEnv()), a = await link(shared, { tenancy: 1 }), b = await link(shared, { tenancy: 2 });
  const { emailDay } = await import("../../server/email.js"), day = emailDay(new Date().toISOString());
  const fill = shared.DB.raw.prepare("INSERT INTO email_attempts (token, outbound_id, day, at) VALUES (?, 1, ?, ?)");
  for (let i = 0; i < 99; i++) fill.run(`business-${i}`, day, new Date().toISOString());
  const both = (await Promise.all([ask(shared, a.token), ask(shared, b.token)])).map(r => r.status).sort();
  assert.deepEqual(both, [202, 503]);
  assert.deepEqual([count(shared, "email_attempts"), count(shared, "case_challenges"), count(shared, "case_auth_attempts"),
    shared.sent.length], [100, 1, 1, 1]);
});

test("a paused, suppressed or disabled email setting sends no code and writes nothing", async () => {
  for (const sql of ["INSERT INTO app_settings VALUES ('outbound', '{\"paused\":1}', '2026-01-01', 'x')",
    "UPDATE app_settings SET value = json_set(value, '$.enabled', json('false')) WHERE key = 'email'"]) {
    const env = seed(onEnv()), { token } = await link(env);
    env.DB.raw.prepare(sql).run();
    assert.equal((await ask(env, token)).status, 503);
    assert.deepEqual([count(env, "case_challenges"), count(env, "email_attempts"), env.sent.length], [0, 0, 0]);
  }
  const env = seed(onEnv()), { token } = await link(env);
  const { sha256 } = await import("../../server/http.js");
  env.DB.raw.prepare("INSERT INTO email_suppressions VALUES (?, '2026-01-01', 'team')").run(await sha256("tenant.one@example.test"));
  assert.equal((await ask(env, token)).status, 503);
  assert.equal(env.sent.length, 0);
});

test("unknown_auth_no_retry_same_code: an unclear send is never repeated; a new code later replaces it", async () => {
  const env = seed(onEnv()), { token } = await link(env);
  let calls = 0;
  env.EMAIL = { send: async m => { calls++; env.sent.push(m); throw new Error("network went away"); } };
  const c = await ask(env, token);
  assert.equal(c.status, 202, "it may have arrived: the tenant is told to use the latest code");
  assert.equal(env.DB.raw.prepare("SELECT status, error_code FROM case_auth_attempts").get().status, "unknown");
  assert.equal(calls, 1);
  assert.equal((await ask(env, token)).status, 429, "no retry of the same code, and the minute holds");
  backdate(env, "case_auth_attempts", "at");
  env.EMAIL = { send: async m => { env.sent.push(m); return { messageId: "fixture-new" }; } };
  const c2 = await ask(env, token);
  assert.equal(c2.status, 202);
  assert.equal((await verify(env, c.data.challenge_id, /Your code is (\d{6})/.exec(env.sent[0].text)[1])).status, 410);
  assert.equal((await verify(env, c2.data.challenge_id, lastCode(env))).status, 200);

  // A rejection the provider names: failed, the code is withdrawn.
  const failed = seed(onEnv()), f = await link(failed);
  failed.EMAIL = { send: async () => { throw Object.assign(new Error("rejected"), { code: "E_DELIVERY_FAILED" }); } };
  assert.equal((await ask(failed, f.token)).status, 503);
  assert.deepEqual({ ...failed.DB.raw.prepare("SELECT a.status, a.error_code, c.status AS challenge FROM case_auth_attempts a "
    + "JOIN case_challenges c ON c.id = a.challenge_id").get() }, { status: "failed", error_code: "E_DELIVERY_FAILED", challenge: "revoked" });
});

test("a link revoked after the reservation is checked again right before the email: nothing is sent", async () => {
  const env = seed(onEnv()), { id, token } = await link(env), batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async stmts => {
    const out = await batch(stmts);
    if (stmts.some(s => /INSERT INTO case_challenges/.test(s.sql)))
      env.DB.raw.prepare("UPDATE case_grants SET status = 'revoked' WHERE id = ?").run(id);
    return out;
  };
  assert.equal((await ask(env, token)).status, 404);
  assert.equal(env.sent.length, 0);
  assert.equal(env.DB.raw.prepare("SELECT status FROM case_challenges").get().status, "revoked");
});

test("grant_expiry_revokes_existing_session: expiry, revocation, a new tenant email or the tenancy ending end every session", async () => {
  const cases = [
    ["expired", (env, id) => env.DB.raw.prepare("UPDATE case_grants SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(id)],
    ["revoked", async (env, id) => assert.equal((await staff(env, "POST", `/admin/case-grants/${id}/revoke`, {})).status, 200)],
    ["new email", env => env.DB.raw.prepare("UPDATE tenancies SET tenant_email = 'someone.else@example.test' WHERE id = 1").run()],
    ["ended", env => env.DB.raw.prepare("UPDATE tenancies SET ended_on = ? WHERE id = 1").run(jerseyToday())],
    ["archived", env => env.DB.raw.prepare("UPDATE rentals SET archived_at = '2026-01-01' WHERE id = 1").run()],
    ["30 minutes", env => backdate(env, "case_sessions", "expires_at")],
  ];
  for (const [label, end] of cases) {
    const env = seed(onEnv()), { id, token } = await link(env), cookie = await signIn(env, token);
    assert.equal((await call(env, "GET", "/repair-report", { cookie })).status, 200, label);
    await end(env, id);
    assert.equal((await call(env, "GET", "/repair-report", { cookie })).status, 404, label);
  }
});

test("wrong_purpose_wrong_case_denied: a session is for its purpose, its tenancy and the operations approved", async () => {
  need();
  const env = seed(onEnv()), { token } = await link(env), cookie = await signIn(env, token);
  const request = new Request("https://hampton.test/api/repair-report", { headers: { cookie } });
  const actor = await mod.resolveCaseActor(env, request, { purpose: "repair_report", caseRef: { kind: "tenancy", id: 1 }, operation: "submit" });
  assert.deepEqual([actor.kind, actor.purpose, actor.caseRef], ["case_party", "repair_report", { kind: "tenancy", id: 1 }]);
  for (const scope of [{ purpose: "rental_application", operation: "submit" }, { purpose: "renewal_response", operation: "read" },
    { purpose: "repair_report", caseRef: { kind: "tenancy", id: 2 }, operation: "read" },
    { purpose: "repair_report", caseRef: { kind: "rental", id: 1 }, operation: "read" }, { purpose: "repair_report", operation: "approve" }])
    assert.equal(await mod.resolveCaseActor(env, request, scope), null, JSON.stringify(scope));
  // The staff session is not a case session, and the case session is not a staff one.
  assert.equal(await mod.resolveCaseActor(env, new Request("https://hampton.test/", { headers: { cookie: await adminCookie() } }),
    { purpose: "repair_report", operation: "read" }), null);
  assert.equal((await call(env, "GET", "/admin/tenancies/1/repair-links", { cookie })).status, 401);
});

test("the digest is bound to its challenge and grant, under the operator's key", async () => {
  const c = await import("../../server/case-access-crypto.js");
  const d = await c.challengeDigest(KEY, "c1", "g1", "123456");
  assert.match(d, /^[0-9a-f]{64}$/);
  assert.equal(await c.verifyDigest(KEY, d, "c1", "g1", "123456"), true);
  for (const args of [["c2", "g1", "123456"], ["c1", "g2", "123456"], ["c1", "g1", "123457"]])
    assert.equal(await c.verifyDigest(KEY, d, ...args), false, args.join());
  assert.equal(await c.verifyDigest(KEY.replace("0", "1"), d, "c1", "g1", "123456"), false);
  const codes = new Set(Array.from({ length: 200 }, c.makeCode));
  assert.ok([...codes].every(x => /^\d{6}$/.test(x)) && codes.size > 190);
});

test("no_code_or_bootstrap_in_logs_storage and code_not_in_outbound_or_EmailUI", async () => {
  const env = seed(onEnv()), seen = [], keep = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(keep)) console[k] = (...a) => seen.push(a.map(String).join(" "));
  let token, cookie, code, list;
  try {
    ({ token } = await link(env));
    cookie = await signIn(env, token);
    code = lastCode(env);
    list = (await staff(env, "GET", "/admin/tenancies/1/repair-links")).text;
  } finally { Object.assign(console, keep); }
  const session = cookie.split("=")[1], dump = dumpD1(env.DB.raw);
  for (const secret of [token, session, KEY]) {
    assert.equal(dump.includes(secret), false);
    assert.equal(seen.join("\n").includes(secret), false);
    assert.equal(list.includes(secret), false);
  }
  assert.equal(new RegExp(`\\b${code}\\b`).test(dump), false, "the code is never stored");
  assert.equal(new RegExp(`\\b${code}\\b`).test(seen.join("\n") + list), false);
  assert.equal(count(env, "outbound"), 0, "not an outbound row, so never in the Email screen");
  assert.equal(env.sent.length, 1);
  assert.match(env.sent[0].text, /Your code is \d{6}\./);
  assert.equal(env.sent[0].from.email, "hello@hamptonestatesjersey.com");
});
