// AUT-10: the effective Draft / Approve / Auto mode of each automation operation (migration 0054), only with
// AUT10_MODES_READY === '1'. A mode says how much review an operation's output gets; it never authorizes a
// human decision (match approval, dictated criteria, search resolution...), whatever the mode, a confidence
// or a percentage. Unknown operations stay off. The actor is the server's session email, never the body.
import { fail } from "./http.js";
import { operationModeProposal } from "./operation-policy.js";

export const modesReady = env => env?.AUT10_MODES_READY === "1";

// Draft: a person approves each output; Approve: in a batch; Auto: acts and a sample is reviewed (arch. §6.2).
const REVIEW = { Draft: "each", Approve: "batch", Auto: "sample" };
const TRIGGERS = ["operation_policies_no_insert", "operation_policies_no_delete", "operation_policies_update_guard",
  "operation_policies_version_log", "operation_policy_versions_no_update", "operation_policy_versions_no_delete",
  "operation_policy_revoke_removed_admin", "operation_policy_revoke_changed_admin"];
// The history is trustworthy only while every guard trigger is in place; if one is missing, nothing is read.
const SCHEMA_OK = `(SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger'
  AND name IN (${TRIGGERS.map(t => `'${t}'`).join(", ")})) = ${TRIGGERS.length}`;
const COLUMNS = "automation_id, operation, definition_version, mode, revision, updated_at, updated_by";
// Luis, 14-nov-2026: every admin, current or added later, may change modes. Checked in the same statement as
// the write, so someone removed from admins mid-request cannot. (operation_policy_managers is no longer read.)
const MANAGER = `EXISTS (SELECT 1 FROM admins WHERE email = ?)`;

const primary = db => typeof db.withSession === "function" ? db.withSession("first-primary") : db;

// The proposal when the stored row matches a reviewed operation and definition version; null otherwise.
function reviewed(r) {
  try {
    const p = operationModeProposal(r.automation_id, r.operation, r.mode);
    return p.definition_version === r.definition_version ? p : null;
  } catch { return null; }
}
const shape = ({ automation_id, operation, mode, revision, updated_at, updated_by }) =>
  ({ automation_id, operation, mode, revision, updated_at, updated_by });

export async function readOperationModes(env, actor) {
  const db = primary(env.DB);
  const [{ results: rows }, { results: [who] }] = await db.batch([
    db.prepare(`SELECT ${COLUMNS} FROM operation_policies WHERE ${SCHEMA_OK} ORDER BY automation_id, operation`),
    db.prepare(`SELECT ${MANAGER} AS ok`).bind(actor),
  ]);
  return { can_edit: who?.ok === 1, operations: rows.filter(reviewed).map(shape) };
}

const KEYS = "automation_id,expected_revision,mode,operation";
export async function setOperationMode(env, actor, body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).sort().join() !== KEYS ||
      !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 1) fail(400, "Invalid mode change");
  const { automation_id, operation, mode, expected_revision } = body;
  let proposal;
  try { proposal = operationModeProposal(automation_id, operation, mode); } catch { fail(400, "Unknown operation or mode"); }
  const db = primary(env.DB), at = new Date().toISOString();
  // The authority and the revision are checked in the same statement that writes, so neither can go stale between them.
  const [write, { results: [current] }, { results: [who] }] = await db.batch([
    db.prepare(`UPDATE operation_policies SET mode = ?1, revision = revision + 1, updated_at = ?2, updated_by = ?3
      WHERE automation_id = ?4 AND operation = ?5 AND revision = ?6 AND definition_version = ?7 AND mode <> ?1
        AND ${SCHEMA_OK} AND ${MANAGER.replace("?", "?3")}`)
      .bind(mode, at, actor, automation_id, operation, expected_revision, proposal.definition_version),
    db.prepare(`SELECT ${COLUMNS} FROM operation_policies WHERE automation_id = ? AND operation = ? AND ${SCHEMA_OK}`)
      .bind(automation_id, operation),
    db.prepare(`SELECT ${MANAGER} AS ok`).bind(actor),
  ]);
  if (!current || !reviewed(current)) fail(503, "Automation modes unavailable");
  if (write.meta.changes === 1) return { status: 200, policy: shape(current) };
  if (who?.ok !== 1) fail(403, "You can't change automation modes. Ask Optimyze for access.");
  if (current.revision !== expected_revision) return { status: 409, policy: shape(current) };
  return { status: 200, policy: shape(current) }; // already in that mode: nothing to change
}

const ACTIONS = new Set(["perform_operation"]);
const deny = reasons => ({ allowed: false, mode: null, revision: null, reasons });

// For consumers, right before an effect. Pass the revision read when the work was prepared as expected_revision,
// so a mode changed meanwhile stops it. allowed:true covers only the mode: `gates` still have to be met by the
// consumer, and `review` says how its output is reviewed. Only plain fields are read: claims are ignored.
export async function checkOperationMode(env, input) {
  if (!modesReady(env)) return deny(["modes_off"]);
  if (!input || typeof input !== "object") return deny(["invalid_request"]);
  const { automation_id, operation, action, expected_revision } = input;
  let proposal;
  try { proposal = operationModeProposal(automation_id, operation, "Draft"); } catch { return deny(["unknown_operation"]); }
  if (proposal.hard_human_decisions.includes(action)) return deny(["human_decision_required"]);
  if (!ACTIONS.has(action) || (expected_revision !== undefined && !Number.isSafeInteger(expected_revision))) {
    return deny(["invalid_request"]);
  }
  const r = await primary(env.DB).prepare(`SELECT ${COLUMNS} FROM operation_policies
    WHERE automation_id = ? AND operation = ? AND ${SCHEMA_OK}`).bind(automation_id, operation).first();
  if (!r || !reviewed(r)) return deny(["policy_unavailable"]);
  if (expected_revision !== undefined && expected_revision !== r.revision) return deny(["policy_changed"]);
  return { allowed: true, mode: r.mode, revision: r.revision, review: REVIEW[r.mode], gates: proposal.required_gates, reasons: [] };
}
