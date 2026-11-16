import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { runRetention, RETENTION_CAP } from "../../server/retention.js";
import { emailDay } from "../../server/email.js";
import { seed, onEnv, count, backdate, link, signIn, ask, TENANT } from "./adm-12-tp03-fixtures.mjs";

// ADM-12 (MEJORAS 16-nov): the daily retention pass clears the sign-in leftovers of migration 0110 whatever the switch:
// sessions and codes 30 days after they expired (a code once nothing points at it), each code email's outcome 90 days
// after it was sent. Links (case_grants) and repair receipts are business records: never deleted. And when the 30 codes
// of a Jersey day are used up, one Inbox task for the team that day, with no personal data.
const TS = new Date().toISOString();
const ago = days => new Date(Date.parse(TS) - days * 86400e3).toISOString();
const H = c => c.repeat(64);
let n = 0;
const tokenHash = () => (++n).toString(16).padStart(64, "0");
const ins = (env, sql, ...a) => env.DB.raw.prepare(sql).run(...a);
const challenge = (env, grant, expires_at, id = crypto.randomUUID()) => (ins(env, `INSERT INTO case_challenges (id, grant_id,
  digest, key_id, status, created_at, expires_at) VALUES (?, ?, ?, ?, 'verified', ?, ?)`, id, grant, H("0"), "0".repeat(16), expires_at,
expires_at), id);
const session = (env, grant, challenge_id, expires_at) => ins(env, `INSERT INTO case_sessions (token_hash, grant_id, challenge_id,
  purpose, source_revision, created_at, expires_at) VALUES (?, ?, ?, 'repair_report', ?, ?, ?)`,
tokenHash(), grant, challenge_id, H("a"), expires_at, expires_at);
const attempt = (env, grant, challenge_id, at) => ins(env, `INSERT INTO case_auth_attempts (id, challenge_id, grant_id,
  recipient_version, status, day, at, expires_at) VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?)`, crypto.randomUUID(), challenge_id, grant,
H("a"), at.slice(0, 10), at, at);
const has = (env, table, where, ...a) => !!env.DB.raw.prepare(`SELECT 1 FROM ${table} WHERE ${where}`).get(...a);
const off = env => { delete env.ADM12_CASE_ACCESS_READY; return env; };

test("clears old sessions, codes and code outcomes; keeps links and repair receipts; switched off too", async () => {
  const env = seed(onEnv()), l = await link(env);
  const cookie = await signIn(env, l.token);
  const r = await call(env, "POST", "/repair-report/submit", { cookie,
    body: { operation_id: crypto.randomUUID(), title: "Leak", urgency: "routine" } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  for (const [table, column] of [["case_sessions", "expires_at"], ["case_challenges", "expires_at"], ["case_auth_attempts", "at"],
    ["case_grants", "expires_at"], ["repair_report_receipts", "at"]]) backdate(env, table, column);
  assert.deepEqual(await runRetention(off(env), TS), { contacts: 0, viewings: 0, jobs: 0, chats: 0 }, "the pass's result is as before");
  assert.deepEqual(["case_sessions", "case_challenges", "case_auth_attempts", "case_grants", "repair_report_receipts", "repairs"]
    .map(t => count(env, t)), [0, 0, 0, 1, 1, 1]);
  assert.deepEqual(await runRetention(env, TS), { contacts: 0, viewings: 0, jobs: 0, chats: 0 }, "idempotent");
});

test("windows: sessions and codes 30 days after expiry, a code once nothing points at it; outcomes after 90 days", async () => {
  const env = seed(onEnv()), { id: g } = await link(env);
  off(env);
  const oldSession = challenge(env, g, ago(31)), recentSession = challenge(env, g, ago(29));
  session(env, g, oldSession, ago(31));
  session(env, g, recentSession, ago(29));
  const lone = challenge(env, g, ago(31)), fresh = challenge(env, g, ago(29));
  const oldOutcome = challenge(env, g, ago(91)), keptOutcome = challenge(env, g, ago(89));
  attempt(env, g, oldOutcome, ago(91));
  attempt(env, g, keptOutcome, ago(89));
  await runRetention(env, TS);
  assert.deepEqual([has(env, "case_sessions", "challenge_id = ?", oldSession), has(env, "case_sessions", "challenge_id = ?", recentSession)],
    [false, true]);
  assert.deepEqual([oldSession, recentSession, lone, fresh, oldOutcome, keptOutcome].map(id => has(env, "case_challenges", "id = ?", id)),
    [false, true, false, true, false, true], "a code still pointed at by a kept session or outcome stays");
  assert.deepEqual([oldOutcome, keptOutcome].map(id => has(env, "case_auth_attempts", "challenge_id = ?", id)), [false, true]);
  assert.equal(count(env, "case_grants"), 1);
});

test("bounded: at most RETENTION_CAP of each per pass, the rest the next day", async () => {
  const env = seed(onEnv()), { id: g } = await link(env);
  off(env);
  for (let i = 0; i <= RETENTION_CAP; i++) session(env, g, challenge(env, g, ago(40)), ago(40));
  await runRetention(env, TS);
  assert.deepEqual([count(env, "case_sessions"), count(env, "case_challenges")], [1, 1]);
  await runRetention(env, TS);
  assert.deepEqual([count(env, "case_sessions"), count(env, "case_challenges")], [0, 0]);
});

test("without migration 0110 the pass runs as before", async () => {
  const env = makeEnv();
  env.DB.raw.exec(`DROP TABLE repair_report_receipts; DROP TABLE case_sessions; DROP TABLE case_auth_attempts;
    DROP TABLE case_challenges; DROP TABLE case_grants;`);
  assert.deepEqual(await runRetention(env, TS), { contacts: 0, viewings: 0, jobs: 0, chats: 0 });
});

test("the 30 codes of a Jersey day used up: one Inbox task for the team that day, no personal data, closable", async () => {
  const env = seed(onEnv()), a = await link(env, { tenancy: 1 }), b = await link(env, { tenancy: 2 }), day = emailDay(TS);
  for (let i = 0; i < 30; i++) attempt(env, a.id, challenge(env, a.id, TS), `${day}T00:00:00.000Z`);
  env.DB.raw.prepare("UPDATE case_auth_attempts SET day = ?").run(day);
  const tasks = () => env.DB.raw.prepare("SELECT * FROM notifications WHERE task_key = ?").all(`adm12:codes-cap:${day}`);
  assert.equal(tasks().length, 0, "reaching the limit is not yet a refusal");
  for (const token of [b.token, b.token, a.token]) assert.equal((await ask(env, token)).status, 429);
  const [t, ...more] = tasks();
  assert.equal(more.length, 0, "one a day");
  assert.equal(t.title, "Tenant sign-in codes used up today");
  assert.match(t.task_reason, new RegExp(`^${day}: `));
  const e = env.DB.raw.prepare("SELECT * FROM events WHERE id = ?").get(t.event_id);
  assert.deepEqual([e.entity_type, e.entity_id, e.type, e.actor, e.data], ["collection", `case-codes:${day}`, "case_codes.cap_reached",
    "system", JSON.stringify({ day })]);
  const text = JSON.stringify([t, e]);
  for (const secret of [TENANT, "tenant.two@example.test", "Fixture Street", a.token, b.token, a.id, b.id])
    assert.equal(text.includes(secret), false, "no personal data or link in the task");
  const cookie = await adminCookie();
  const listed = (await call(env, "GET", "/admin/notifications?box=action", { cookie })).data.notifications.find(x => x.id === t.id);
  assert.deepEqual([listed.target_exists, listed.link], [true, null]);
  const done = await call(env, "PUT", `/admin/notification-tasks/${t.id}`, { cookie,
    body: { operation_id: crypto.randomUUID(), revision: listed.revision, action: "done" } });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal((await ask(env, b.token)).status, 429);
  assert.equal(tasks().length, 1);
  assert.ok(tasks()[0].resolved_at, "closing it is respected");
});
