import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";
import { checkOperationMode } from "../../server/operation-modes.js";

// AUT-10: per-operation Draft/Approve/Auto policy, versioned with CAS, behind AUT10_MODES_READY.
const ADMIN = "admin@example.test", COLLEAGUE = "colleague@example.test";
const LT = { automation_id: "listing_text", operation: "prepare_draft" };
const HUMAN = ["match_approval", "unknown_required_consultation", "dictated_criteria_confirmation",
  "search_resolution", "presentation_review"];
const on = () => ({ ...makeEnv(), AUT10_MODES_READY: "1" });
const as = async (env, method, path, body, email = ADMIN) => call(env, method, path, { body, cookie: await adminCookie(email) });
const grant = (env, email = ADMIN) => env.DB.raw.prepare(
  "INSERT INTO operation_policy_managers (staff_email, granted_by, granted_at) VALUES (?, 'setup', ?)").run(email, T0);
const row = env => ({ ...env.DB.raw.prepare(
  "SELECT mode, revision, updated_by FROM operation_policies WHERE automation_id = ? AND operation = ?").get(LT.automation_id, LT.operation) });
const versions = env => env.DB.raw.prepare(
  "SELECT revision, mode, changed_by FROM operation_policy_versions WHERE automation_id = ? AND operation = ? ORDER BY revision")
  .all(LT.automation_id, LT.operation).map(r => ({ ...r }));
const set = (env, mode, expected_revision, email) => as(env, "POST", "/admin/automations/modes", { ...LT, mode, expected_revision }, email);
// Row counts of every table but the policy's own: what an Auto switch must not touch.
const others = env => Object.fromEntries(env.DB.raw.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'operation_polic%' AND name NOT LIKE 'sqlite_%'").all()
  .map(({ name }) => [name, env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n]));

test("flag off: the screen, the route and the guard behave as before", async () => {
  const env = makeEnv();
  const { data } = await as(env, "GET", "/admin/automations");
  assert.equal("modes" in data, false);
  assert.equal((await set(env, "Auto", 1)).status, 404);
  assert.equal((await call(env, "POST", "/admin/automations/modes", { body: { ...LT, mode: "Auto", expected_revision: 1 } })).status, 404);
  assert.deepEqual(row(env), { mode: "Draft", revision: 1, updated_by: "migration" });
  assert.deepEqual(await checkOperationMode(env, { ...LT, action: "perform_operation" }),
    { allowed: false, mode: null, revision: null, reasons: ["modes_off"] });
});

test("flag on: three known operations start in Draft; signing in is not authority to change them", async () => {
  const env = on();
  const { data } = await as(env, "GET", "/admin/automations");
  assert.equal(data.modes.can_edit, false);
  assert.deepEqual(data.modes.operations.map(o => [o.automation_id, o.operation, o.mode, o.revision]), [
    ["hampton_intent_v1", "propose_intent", "Draft", 1],
    ["listing_text", "prepare_draft", "Draft", 1],
    ["market_ambiguity_v1", "propose_interpretation", "Draft", 1]]);
  const r = await set(env, "Auto", 1);
  assert.equal(r.status, 403);
  assert.deepEqual(row(env), { mode: "Draft", revision: 1, updated_by: "migration" });
  assert.equal((await call(env, "POST", "/admin/automations/modes", { body: { ...LT, mode: "Auto", expected_revision: 1 } })).status, 401);
});

test("a manager changes a mode with CAS; each change is a new version and a stale revision gets 409", async () => {
  const env = on();
  grant(env);
  assert.equal((await as(env, "GET", "/admin/automations")).data.modes.can_edit, true);
  let r = await set(env, "Approve", 1);
  assert.equal(r.status, 200);
  assert.deepEqual([r.data.policy.mode, r.data.policy.revision, r.data.policy.updated_by], ["Approve", 2, ADMIN]);
  r = await set(env, "Auto", 1);
  assert.equal(r.status, 409);
  assert.deepEqual([r.data.policy.mode, r.data.policy.revision], ["Approve", 2]);
  r = await set(env, "Approve", 2);
  assert.equal(r.status, 200, "same mode: nothing to change");
  assert.equal(r.data.policy.revision, 2);
  assert.deepEqual(versions(env), [
    { revision: 1, mode: "Draft", changed_by: "migration" }, { revision: 2, mode: "Approve", changed_by: ADMIN }]);
  const both = await Promise.all([set(env, "Auto", 2), set(env, "Draft", 2)]);
  assert.deepEqual(both.map(x => x.status).sort(), [200, 409]);
  assert.equal(row(env).revision, 3);
});

test("bad requests fail closed: unknown operation or mode, extra claims, cross-origin", async () => {
  const env = on();
  grant(env);
  for (const body of [
    { automation_id: "listing_text", operation: "publish", mode: "Auto", expected_revision: 1 },
    { automation_id: "unknown", operation: "prepare_draft", mode: "Auto", expected_revision: 1 },
    { ...LT, mode: "Off", expected_revision: 1 },
    { ...LT, mode: "Auto", expected_revision: "1" },
    { ...LT, mode: "Auto", expected_revision: 1, approved: true },
    { ...LT, mode: "Auto", expected_revision: 1, confidence: 0.99 },
  ]) assert.equal((await as(env, "POST", "/admin/automations/modes", body)).status, 400, JSON.stringify(body));
  const cross = await call(env, "POST", "/admin/automations/modes",
    { body: { ...LT, mode: "Auto", expected_revision: 1 }, cookie: await adminCookie(), origin: "https://evil.test" });
  assert.equal(cross.status, 403);
  assert.deepEqual(row(env), { mode: "Draft", revision: 1, updated_by: "migration" });
});

test("authority follows the admins list: removal revokes it and re-adding does not restore it", async () => {
  const env = on();
  grant(env, COLLEAGUE);
  assert.equal((await set(env, "Approve", 1, COLLEAGUE)).status, 200);
  env.DB.raw.prepare("DELETE FROM admins WHERE email = ?").run(COLLEAGUE);
  env.DB.raw.prepare("INSERT INTO admins (email, added_by, added_at) VALUES (?, 'setup', ?)").run(COLLEAGUE, T0);
  assert.equal((await set(env, "Auto", 2, COLLEAGUE)).status, 403);
  assert.equal(row(env).mode, "Approve");
});

test("the schema keeps the history honest: no delete, no re-insert, no skipped or reused revision", () => {
  const env = on(), db = env.DB.raw;
  assert.throws(() => db.prepare("DELETE FROM operation_policies").run());
  assert.throws(() => db.prepare("INSERT INTO operation_policies (automation_id, operation, definition_version, mode, revision, updated_at, updated_by) VALUES ('x', 'y', 1, 'Auto', 1, ?, 'x')").run(T0));
  assert.throws(() => db.prepare("UPDATE operation_policies SET mode = 'Auto', revision = 1 WHERE operation = 'prepare_draft'").run());
  assert.throws(() => db.prepare("UPDATE operation_policies SET mode = 'Auto', revision = 5 WHERE operation = 'prepare_draft'").run());
  assert.throws(() => db.prepare("UPDATE operation_policies SET definition_version = 2, revision = revision + 1 WHERE operation = 'prepare_draft'").run());
  assert.throws(() => db.prepare("UPDATE operation_policies SET mode = 'Off', revision = revision + 1 WHERE operation = 'prepare_draft'").run());
  assert.throws(() => db.prepare("DELETE FROM operation_policy_versions").run());
  assert.throws(() => db.prepare("UPDATE operation_policy_versions SET mode = 'Auto'").run());
  assert.deepEqual(row(env), { mode: "Draft", revision: 1, updated_by: "migration" });
});

test("acceptance: Auto approves no match, saves no dictated criteria and resolves no search", async () => {
  const env = on();
  grant(env);
  const before = others(env);
  assert.equal((await set(env, "Auto", 1)).status, 200);
  assert.deepEqual(others(env), before, "switching to Auto writes nothing outside the policy");
  for (const automation of [LT, { automation_id: "market_ambiguity_v1", operation: "propose_interpretation" },
    { automation_id: "hampton_intent_v1", operation: "propose_intent" }])
    for (const action of HUMAN) {
      const g = await checkOperationMode(env, { ...automation, action, confidence: 1, percentage: 100, approved: true });
      assert.equal(g.allowed, false, `${automation.operation} ${action}`);
      assert.deepEqual(g.reasons, ["human_decision_required"]);
    }
});

test("the guard reads the stored mode for each operation and revalidates the revision before an effect", async () => {
  const env = on();
  grant(env);
  const perform = extra => checkOperationMode(env, { ...LT, action: "perform_operation", ...extra });
  for (const [mode, review, rev] of [["Draft", "each", 1], ["Approve", "batch", 2], ["Auto", "sample", 3]]) {
    if (rev > 1) assert.equal((await set(env, mode, rev - 1)).status, 200);
    const g = await perform();
    assert.deepEqual([g.allowed, g.mode, g.revision, g.review], [true, mode, rev, review]);
    assert.deepEqual(g.gates, ["source_revision", "data_classification", "model_authorization", "human_review"]);
  }
  assert.deepEqual((await perform({ expected_revision: 2 })).reasons, ["policy_changed"]);
  assert.equal((await perform({ expected_revision: 3 })).allowed, true);
  assert.deepEqual((await checkOperationMode(env, { automation_id: "listing_text", operation: "publish", action: "perform_operation" })).reasons,
    ["unknown_operation"]);
  assert.deepEqual((await checkOperationMode(env, { ...LT, action: "approve_everything" })).reasons, ["invalid_request"]);
  assert.deepEqual((await checkOperationMode(env, null)).reasons, ["invalid_request"]);
  env.DB.raw.exec("DROP TRIGGER operation_policies_no_delete");
  assert.deepEqual((await perform()).reasons, ["policy_unavailable"], "a missing guard trigger fails closed");
});
