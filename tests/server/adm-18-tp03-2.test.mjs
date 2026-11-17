// ADM-18 (plan tp03-adm-18, Tarea 2): an explainable affordability check and a human decision. Fictitious data only.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAffordability, affordabilityPolicy } from "../../server/rental-applications.js";
import { count } from "./adm-12-tp03-fixtures.mjs";
import { ANSWERS, OTHER, staff, seed, onEnv, application, link, signIn } from "./adm-18-fixtures.mjs";
import { call } from "./helpers.mjs";

const POLICY = { version: "fixture-v1", basis: "gross", max_rent_share: 0.4, sources: "fixture-source" };
const income = (amount, period = "monthly", basis = "gross", currency = "GBP") => ({ amount, period, basis, currency });

test("without an approved threshold the result is human review, never a pass, with the totals shown", () => {
  for (const raw of [undefined, "", "###", JSON.stringify({ version: "###", basis: "###", max_rent_share: "###", sources: "###" }),
    JSON.stringify({ ...POLICY, max_rent_share: null }), JSON.stringify({ ...POLICY, basis: "after tax" }), "{not json"]) {
    const policy = affordabilityPolicy({ ADM18_AFFORDABILITY_POLICY: raw });
    assert.equal(policy, null, String(raw));
    const r = evaluateAffordability({ income: [income(5000)], rent: 1000, policy });
    assert.equal(r.status, "needs_human_review");
    assert.equal(r.reason, "no_policy");
    assert.equal(r.policy_version, null);
    assert.equal(r.inputs.annual_income, 60000);
  }
  assert.deepEqual(affordabilityPolicy({ ADM18_AFFORDABILITY_POLICY: JSON.stringify(POLICY) }), POLICY);
});

test("annual, monthly and weekly incomes convert explicitly to a year in GBP", () => {
  const r = evaluateAffordability({ income: [income(1000, "weekly"), income(12000, "annual"), income(500, "monthly")], rent: 2000, policy: POLICY });
  assert.deepEqual(r.inputs.incomes.map(i => [i.period, i.factor, i.annual]), [["weekly", 52, 52000], ["annual", 1, 12000], ["monthly", 12, 6000]]);
  assert.equal(r.inputs.annual_income, 70000);
  assert.equal(r.inputs.annual_rent, 24000);
  assert.equal(r.inputs.rent_share, 24000 / 70000);
  assert.equal(r.status, "within_policy");
  assert.equal(r.policy_version, "fixture-v1");
  assert.equal(evaluateAffordability({ income: [income(4000)], rent: 2000, policy: POLICY }).status, "outside_policy");
});

test("gross and net are never mixed, with each other or with the policy's basis", () => {
  const mixed = evaluateAffordability({ income: [income(3000), income(1000, "monthly", "net")], rent: 1000, policy: POLICY });
  assert.equal(mixed.status, "needs_human_review");
  assert.equal(mixed.reason, "basis_mixed");
  assert.equal(mixed.inputs.annual_income, null);
  const other = evaluateAffordability({ income: [income(9000, "monthly", "net")], rent: 1000, policy: POLICY });
  assert.equal(other.status, "needs_human_review");
  assert.equal(other.reason, "basis_policy");
});

test("an unknown income or another currency is never counted", () => {
  for (const [list, reason] of [[[], "income_unknown"], [[income(null)], "income_unknown"], [[income(3000), income(null)], "income_unknown"],
    [[income(3000, "monthly", "gross", "other")], "currency"]]) {
    const r = evaluateAffordability({ income: list, rent: 1000, policy: POLICY });
    assert.equal(r.status, "needs_human_review");
    assert.equal(r.reason, reason);
    assert.equal(r.inputs.annual_income, null);
  }
});

async function submitted(env = seed(onEnv())) {
  const id = await application(env);
  const { token } = await link(env, id);
  const cookie = await signIn(env, token);
  const r = await call(env, "POST", "/rental-application/submit", { cookie, body: { operation_id: crypto.randomUUID(), revision: 1, answers: ANSWERS } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { env, id };
}
const review = (env, id, body, who) => staff(env, "POST", `/admin/rental-applications/${id}/review`, body, who);

test("the detail shows the answers and the rule's explained result to staff with the capability", async () => {
  const { env, id } = await submitted();
  const d = await staff(env, "GET", `/admin/rental-applications/${id}`);
  assert.equal(d.status, 200);
  assert.equal(d.data.answers.employment.employer, "Fixture Employer Ltd");
  assert.equal(d.data.application.housing_status, "entitled");
  assert.equal(d.data.evaluation.status, "outside_policy"); // 24,000 a year of 51,852
  assert.equal(d.data.evaluation.policy_version, "fixture-v1");
});

test("accepting is a human decision with a reason: no tenancy, listing or applicant change follows", async () => {
  const { env, id } = await submitted();
  const before = { tenancies: count(env, "tenancies"), listings: JSON.stringify(env.DB.raw.prepare("SELECT * FROM listings").all()),
    applicant: JSON.stringify(env.DB.raw.prepare("SELECT * FROM applicants").all()) };
  assert.equal((await review(env, id, { revision: 2, decision: "accepted", policy_version: "fixture-v1" })).status, 400, "reason required");
  const r = await review(env, id, { revision: 2, decision: "accepted", reason: "References checked by phone.", policy_version: "fixture-v1" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const row = env.DB.raw.prepare("SELECT status, affordability_status, policy_version, decided_by FROM rental_applications WHERE id = ?").get(id);
  assert.deepEqual({ ...row }, { status: "accepted", affordability_status: "outside_policy", policy_version: "fixture-v1", decided_by: "admin@example.test" });
  assert.equal(count(env, "tenancies"), before.tenancies);
  assert.equal(JSON.stringify(env.DB.raw.prepare("SELECT * FROM listings").all()), before.listings);
  assert.equal(JSON.stringify(env.DB.raw.prepare("SELECT * FROM applicants").all()), before.applicant);
  assert.equal((await review(env, id, { revision: 3, decision: "declined", reason: "Changed mind.", policy_version: "fixture-v1" })).status, 409,
    "a decision is final");
});

test("a policy change invalidates the result the reviewer saw", async () => {
  const { env, id } = await submitted();
  env.ADM18_AFFORDABILITY_POLICY = JSON.stringify({ ...POLICY, version: "fixture-v2" });
  const r = await review(env, id, { revision: 2, decision: "declined", reason: "Outside the rule.", policy_version: "fixture-v1" });
  assert.equal(r.status, 409);
  assert.equal(env.DB.raw.prepare("SELECT status FROM rental_applications WHERE id = ?").get(id).status, "submitted");
});

test("a wrong scope or a stale revision writes nothing", async () => {
  const { env, id } = await submitted();
  const body = { revision: 2, decision: "under_review", policy_version: "fixture-v1" };
  assert.equal((await review(env, id, body, OTHER)).status, 403);
  assert.equal((await review(env, id, { ...body, revision: 1 })).status, 409);
  assert.equal((await review(env, id, { ...body, decision: "let_agreed" })).status, 400);
  assert.equal(env.DB.raw.prepare("SELECT status, revision FROM rental_applications WHERE id = ?").get(id).revision, 2);
  assert.equal((await review(env, id, body)).status, 200);
  assert.equal(env.DB.raw.prepare("SELECT status FROM rental_applications WHERE id = ?").get(id).status, "under_review");
});

test("revoking the staff capability blocks a later read or decision", async () => {
  const { env, id } = await submitted();
  env.DB.raw.prepare("UPDATE case_capability_grants SET status = 'revoked', version = version + 1 WHERE staff_email = 'admin@example.test'").run();
  assert.equal((await staff(env, "GET", `/admin/rental-applications/${id}`)).status, 403);
  assert.equal((await review(env, id, { revision: 2, decision: "under_review", policy_version: "fixture-v1" })).status, 403);
  assert.equal(env.DB.raw.prepare("SELECT status FROM rental_applications WHERE id = ?").get(id).status, "submitted");
});
