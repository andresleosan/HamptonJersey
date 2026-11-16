// ADM-12 (plan tp03-adm-12, Tareas 1 and 3): shared fixtures for the tenant's limited repair access. Fictitious data only.
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";
import { jerseyToday, plusDays } from "../../server/viewings.js";

export const KEY = "fixture-case-challenge-key-0123456789abcdef";
export const ADMIN = "admin@example.test", OTHER = "colleague@example.test";
export const TENANT = "tenant.one@example.test";
const at = "2000-01-01T00:00:00.000Z";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);

// Two properties, each with a running tenancy; the admin (not the colleague) holds case_data_write for repair_report on
// both tenancies, approved by a fictitious operator as ADM-18 (0046 and 0049) expects.
export function seed(env, { capability = true } = {}) {
  run(env, "INSERT INTO landlords (id, name, created_at, updated_at) VALUES (1, 'Fixture landlord', ?, ?)", T0, T0);
  for (const id of [1, 2]) {
    run(env, `INSERT INTO rentals (id, landlord_id, address, parish, service, created_at, updated_at)
      VALUES (?, 1, ?, 'St Helier', 'let_only', ?, ?)`, id, `${id} Fixture Street`, T0, T0);
    run(env, `INSERT INTO tenancies (id, rental_id, tenant_name, tenant_email, kind, regime, start_on, rent, due_day, created_at, updated_at)
      VALUES (?, ?, 'Fixture tenant', ?, 'periodic', '2025', '2025-01-01', 1000, 1, ?, ?)`, id, id,
      id === 1 ? TENANT : `tenant.two@example.test`, T0, T0);
  }
  if (!capability) return env;
  run(env, `INSERT INTO case_purpose_policies (purpose, revision, status, retention_ref, privacy_ref, approval_ref, approved_by, valid_from)
    VALUES ('repair_report', 1, 'approved', 'fixture-retention', 'fixture-privacy', 'fixture-policy', 'fixture-operator', ?)`, at);
  for (const id of [1, 2]) {
    run(env, `INSERT INTO case_capability_memberships (case_kind, case_id, staff_email, status, version, approval_ref, approved_by,
      approved_at, lifecycle_generation) VALUES ('tenancy', ?, ?, 'active', 1, 'fixture-member', 'fixture-operator', ?, 1)`, id, ADMIN, at);
    run(env, `INSERT INTO case_capability_grants (id, case_kind, case_id, staff_email, capability, purpose, status, version,
      membership_version, policy_revision, approval_ref, approved_by, valid_from)
      VALUES (?, 'tenancy', ?, ?, 'case_data_write', 'repair_report', 'active', 1, 1, 1, 'fixture-grant', 'fixture-operator', ?)`,
      `fixture-${id}`, id, ADMIN, at);
  }
  return env;
}

// Switched on, with the operator's key and an email service that records what it is asked to send.
export function onEnv(extra = {}, schema = {}) {
  const sent = [];
  const env = { ...makeEnv(schema), ADM12_CASE_ACCESS_READY: "1", CASE_CHALLENGE_HMAC_KEY: KEY, EMAIL_SERVICE_READY: "true",
    EMAIL: { send: async m => { sent.push(m); return { messageId: `fixture-${sent.length}` }; } }, ...extra };
  env.sent = sent;
  run(env, "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('email', ?, ?, 'setup')",
    JSON.stringify({ enabled: true, summary: false, recipients: [], revision: 1 }), T0);
  return env;
}

export const staff = async (env, method, path, body, who = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(who) });
export const inAWeek = () => plusDays(jerseyToday(), 7);
export const count = (env, table, where = "1") => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get().n;
export const backdate = (env, table, column, where = "1") =>
  run(env, `UPDATE ${table} SET ${column} = '2000-01-01T00:00:00.000Z' WHERE ${where}`);

// A link created by the admin; sent (working) unless asked otherwise. The token is the URL's fragment.
export async function link(env, { tenancy = 1, expires_on = inAWeek(), sent = true } = {}) {
  const r = await staff(env, "POST", `/admin/tenancies/${tenancy}/repair-links`, { expires_on });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.link, /^https:\/\/hampton\.test\/repair-report#[A-Za-z0-9_-]{43}$/);
  if (sent) assert.equal((await staff(env, "POST", `/admin/case-grants/${r.data.id}/sent`, {})).status, 200);
  return { id: r.data.id, token: r.data.link.split("#")[1] };
}

export const ask = (env, bootstrap) => call(env, "POST", "/case-access/challenge", { body: { bootstrap } });
export const verify = (env, challenge_id, code) => call(env, "POST", "/case-access/verify", { body: { challenge_id, code } });
export const lastCode = env => /Your code is (\d{6})\b/.exec(env.sent.at(-1)?.text ?? "")?.[1];

// The tenant: a code by email, then the session cookie (only its name=value pair).
export async function signIn(env, token) {
  const c = await ask(env, token);
  assert.equal(c.status, 202, JSON.stringify(c.data));
  const v = await verify(env, c.data.challenge_id, lastCode(env));
  assert.equal(v.status, 200, JSON.stringify(v.data));
  return v.headers.get("set-cookie").split(";")[0];
}
