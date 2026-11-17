// ADM-18 (plan tp03-adm-18): shared fixtures for the rental application. Fictitious data only.
import assert from "node:assert/strict";
import { KEY, ADMIN, OTHER, staff, inAWeek, ask, verify, lastCode } from "./adm-12-tp03-fixtures.mjs";
import { makeEnv, T0 } from "./helpers.mjs";

export { ADMIN, OTHER, staff };
export const APPLICANT = "applicant.one@example.test";
export const POLICY = JSON.stringify({ version: "fixture-v1", basis: "gross", max_rent_share: 0.4, sources: "fixture-source" });
const at = "2000-01-01T00:00:00.000Z";
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);

// Two properties and two rent applicants. The admin holds case_data_read and case_data_write for rental_application on
// property 1 only, the colleague on property 2 only, approved by a fictitious operator as ADM-18 (0046 and 0049) expects.
export function seed(env, { capability = true } = {}) {
  run(env, "INSERT INTO landlords (id, name, created_at, updated_at) VALUES (1, 'Fixture landlord', ?, ?)", T0, T0);
  for (const id of [1, 2]) {
    run(env, `INSERT INTO rentals (id, landlord_id, address, parish, service, created_at, updated_at)
      VALUES (?, 1, ?, 'St Helier', 'let_only', ?, ?)`, id, `${id} Fixture Street`, T0, T0);
    run(env, `INSERT INTO contacts (id, name, email, last_activity_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      id, `Fixture applicant ${id}`, id === 1 ? APPLICANT : "applicant.two@example.test", T0, T0, T0);
    run(env, `INSERT INTO applicants (id, contact_id, operation, stage, source, housing_status, created_at, updated_at)
      VALUES (?, ?, 'rent', 'viewing', 'web', 'entitled', ?, ?)`, id, id, T0, T0);
  }
  if (!capability) return env;
  run(env, `INSERT INTO case_purpose_policies (purpose, revision, status, retention_ref, privacy_ref, approval_ref, approved_by, valid_from)
    VALUES ('rental_application', 1, 'approved', 'fixture-retention', 'fixture-privacy', 'fixture-policy', 'fixture-operator', ?)`, at);
  for (const [id, who] of [[1, ADMIN], [2, OTHER]]) {
    run(env, `INSERT INTO case_capability_memberships (case_kind, case_id, staff_email, status, version, approval_ref, approved_by,
      approved_at, lifecycle_generation) VALUES ('rental', ?, ?, 'active', 1, 'fixture-member', 'fixture-operator', ?, 1)`, id, who, at);
    for (const capability of ["case_data_read", "case_data_write"]) run(env, `INSERT INTO case_capability_grants (id, case_kind, case_id,
      staff_email, capability, purpose, status, version, membership_version, policy_revision, approval_ref, approved_by, valid_from)
      VALUES (?, 'rental', ?, ?, ?, 'rental_application', 'active', 1, 1, 1, 'fixture-grant', 'fixture-operator', ?)`,
      `fixture-${id}-${capability}`, id, who, capability, at);
  }
  return env;
}

// Switched on, with the operator's key, a configured fictitious policy and an email service that records what it sends.
export function onEnv(extra = {}) {
  const sent = [];
  const env = { ...makeEnv(), ADM18_APPLICATION_READY: "1", ADM18_AFFORDABILITY_POLICY: POLICY, CASE_CHALLENGE_HMAC_KEY: KEY,
    EMAIL_SERVICE_READY: "true", EMAIL: { send: async m => { sent.push(m); return { messageId: `fixture-${sent.length}` }; } }, ...extra };
  env.sent = sent;
  run(env, "INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('email', ?, ?, 'setup')",
    JSON.stringify({ enabled: true, summary: false, recipients: [], revision: 1 }), T0);
  return env;
}

export async function application(env, { rental = 1, applicant = rental, rent = 2000, who = rental === 1 ? ADMIN : OTHER } = {}) {
  const r = await staff(env, "POST", `/admin/rentals/${rental}/applications`, { applicant_id: applicant, rent }, who);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
}

// A link for the application, recorded as sent; the token is the URL's fragment.
export async function link(env, id, { who = ADMIN, sent = true } = {}) {
  const r = await staff(env, "POST", `/admin/rental-applications/${id}/links`, { expires_on: inAWeek() }, who);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.link, /^https:\/\/hampton\.test\/rental-application#[A-Za-z0-9_-]{43}$/);
  if (sent) assert.equal((await staff(env, "POST", `/admin/rental-applications/${id}/links/${r.data.grant_id}/sent`, {}, who)).status, 200);
  return { id: r.data.grant_id, token: r.data.link.split("#")[1] };
}

export async function signIn(env, token) {
  const c = await ask(env, token);
  assert.equal(c.status, 202, JSON.stringify(c.data));
  const v = await verify(env, c.data.challenge_id, lastCode(env));
  assert.equal(v.status, 200, JSON.stringify(v.data));
  return v.headers.get("set-cookie").split(";")[0];
}

export const ANSWERS = Object.freeze({
  employment: { status: "employed", employer: "Fixture Employer Ltd", role: "Fixture analyst" },
  incomes: [{ amount: 4321, period: "monthly", basis: "gross", currency: "GBP" }],
  dependants: 0,
  references: [{ kind: "landlord", name: "Fixture Referee", email: "referee@example.test" }],
  guarantor: null,
});
