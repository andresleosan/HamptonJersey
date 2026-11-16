// AUT-18: Ready for the team. A person marks an active search once its proposals are reviewed (at least one proposed
// home shortlisted), on the version of the search they saw; Done or a stage change takes the mark off (Done does not
// resolve the search). The mark is current while the search's criteria (match_inputs_revision) are those it was marked
// on, no proposal has been reviewed since (a match.reviewed event after it) and a home is still shortlisted; otherwise it
// is shown out of date and not counted until someone marks it again. Hermes's door counts the current marks, a number
// only. Off (AUT18_TEAM_READY not "1"), or without migration 0102, none of this is offered or read; a stage change still
// takes off a mark left from when it was on.
import { activeSql } from "./applicants.js";
import { logEvent } from "./events.js";

export const teamReadyOn = env => env?.AUT18_TEAM_READY === "1";
// Without migration 0102 the table is not there: treated as switched off. Any other error is not hidden.
const missing = e => { if (/no such table/i.test(String(e?.message))) return undefined; throw e; };

// Over applicant_team_ready r JOIN applicants a.
const SHORTLISTED = "EXISTS (SELECT 1 FROM matches m WHERE m.applicant_id = a.id AND m.status = 'shortlisted')";
const CURRENT = `r.revision = a.match_inputs_revision AND ${SHORTLISTED} AND NOT EXISTS (SELECT 1 FROM events e
  WHERE e.entity_type = 'applicant' AND e.entity_id = CAST(a.id AS TEXT) AND e.type = 'match.reviewed' AND e.at > r.marked_at)`;

// The search's stored mark with whether it is current (null: none), switch or not; undefined without the migration.
export async function storedMark(env, applicantId) {
  try {
    return await env.DB.prepare(`SELECT r.*, (${CURRENT}) AS current FROM applicant_team_ready r
      JOIN applicants a ON a.id = r.applicant_id WHERE r.applicant_id = ?`).bind(applicantId).first();
  } catch (e) { return missing(e); }
}
// The same, or undefined while switched off.
export const readyRow = (env, applicantId) => teamReadyOn(env) ? storedMark(env, applicantId) : undefined;

// Whether the search has a reviewed proposal to mark it on.
export const hasShortlisted = async (env, applicantId) => !!(await env.DB.prepare(
  "SELECT 1 FROM matches WHERE applicant_id = ? AND status = 'shortlisted' LIMIT 1").bind(applicantId).first());

// What the record shows: who marked it and when, and whether it is current.
export const readyView = row => row && { at: row.marked_at, by: row.marked_by, current: row.current === 1 };

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
      WHERE ${activeSql("a")} AND ${CURRENT}`).first()).n;
  } catch (e) { return missing(e); }
}
