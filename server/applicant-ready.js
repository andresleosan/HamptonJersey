// AUT-18: Ready for the team. A person marks an active search once its proposals are reviewed, on the version of the
// search they saw; Done or a stage change takes the mark off (Done does not resolve the search). The mark keeps the
// search's match_inputs_revision: a criteria change since leaves it out of date, shown as such and not counted, until
// someone marks it again. Hermes's door counts the current marks, a number only. Off (AUT18_TEAM_READY not "1"), or
// without migration 0102, none of this is offered, read or written.
import { activeSql } from "./applicants.js";
import { logEvent } from "./events.js";

export const teamReadyOn = env => env?.AUT18_TEAM_READY === "1";
// Without migration 0102 the table is not there: treated as switched off. Any other error is not hidden.
const missing = e => { if (/no such table/i.test(String(e?.message))) return undefined; throw e; };

// The search's mark row (null: none), or undefined when switched off or not migrated.
export async function readyRow(env, applicantId) {
  if (!teamReadyOn(env)) return undefined;
  try { return await env.DB.prepare("SELECT * FROM applicant_team_ready WHERE applicant_id = ?").bind(applicantId).first(); }
  catch (e) { return missing(e); }
}

// What the record shows: who marked it and when, and whether its criteria are still those it was marked on.
export const readyView = (row, applicant) => row && { at: row.marked_at, by: row.marked_by,
  current: row.revision === applicant.match_inputs_revision };

// Statements marking (ready) or taking the mark off (Done) in the caller's versioned batch, with its event. ids only.
// revision: the match_inputs_revision of the version the caller locks on.
export const readyStatements = (env, { id, revision, ready, actor, at }) => ready ? [
  env.DB.prepare(`INSERT INTO applicant_team_ready (applicant_id, marked_at, marked_by, revision) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT (applicant_id) DO UPDATE SET marked_at = ?2, marked_by = ?3, revision = ?4`).bind(id, at, actor, revision),
  ...logEvent(env, { actor, entity_type: "applicant", entity_id: String(id), type: "applicant.team_ready",
    data: { match_inputs_revision: revision } }),
] : [
  env.DB.prepare("DELETE FROM applicant_team_ready WHERE applicant_id = ?").bind(id),
  ...logEvent(env, { actor, entity_type: "applicant", entity_id: String(id), type: "applicant.team_ready_done" }, null,
    { ifChanged: true }),
];

// A stage change takes the mark off in the same save; the event is written only when there was one.
export const clearOnStage = (env, id, actor) => [
  env.DB.prepare("DELETE FROM applicant_team_ready WHERE applicant_id = ?").bind(id),
  ...logEvent(env, { actor, entity_type: "applicant", entity_id: String(id), type: "applicant.team_ready_cleared",
    data: { reason: "stage_changed" } }, null, { ifChanged: true }),
];

// For Hermes's door: how many active searches have a current mark. undefined when switched off or not migrated, so a
// door that cannot count leaves the number out rather than saying 0.
export async function readyCount(env) {
  if (!teamReadyOn(env)) return undefined;
  try {
    return (await env.DB.prepare(`SELECT COUNT(*) AS n FROM applicant_team_ready r JOIN applicants a ON a.id = r.applicant_id
      WHERE ${activeSql("a")} AND r.revision = a.match_inputs_revision`).first()).n;
  } catch (e) { return missing(e); }
}
