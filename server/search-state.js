// EST-01: when each applicant's full search of Hampton's saved listings last ran and whether it finished, recorded
// around the recompute and never inside it. Switched off (or without migration 0067) nothing is read or written and
// matching answers exactly as before. A listing's own recompute (one listing against every search) is not a full
// search and is not recorded here.
import { now } from "./http.js";
import { activeSql, isActive } from "./applicants.js";
import * as engine from "./match-store.js";

export const searchStateEnabled = env => env?.EST01_SEARCH_STATE_READY === "1";
const APPLICABLE = `${activeSql("a")} AND a.search_category = 'residential'`;
const RUNNING_MS = 120000; // an attempt with no recorded result after two minutes did not finish

// Best effort: recording never changes what a save or a recompute answers. No error text is kept or logged.
const write = async (env, sql, ...args) => {
  try { await env.DB.prepare(sql).bind(...args).run(); } catch { console.error("Search state not recorded"); }
};

// A registered search waits for its first search: a row with no attempt yet.
export const queueFirstSearch = (env, applicantId) => (searchStateEnabled(env) ? write(env,
  `INSERT INTO applicant_search_runs (applicant_id) SELECT a.id FROM applicants a WHERE a.id = ? AND ${APPLICABLE}
   ON CONFLICT(applicant_id) DO NOTHING`, applicantId) : null);

// The attempt is stamped before the recompute and its result after it. The result is only written while that
// attempt is still the last one, so a slow run never overwrites a newer one.
const track = recompute => async (env, applicantId, ...rest) => {
  if (!searchStateEnabled(env)) return recompute(env, applicantId, ...rest);
  const at = now();
  await write(env, `INSERT INTO applicant_search_runs (applicant_id, last_attempt_at)
    SELECT a.id, ? FROM applicants a WHERE a.id = ? AND ${APPLICABLE}
    ON CONFLICT(applicant_id) DO UPDATE SET last_attempt_at = excluded.last_attempt_at`, at, applicantId);
  const finish = column => write(env,
    `UPDATE applicant_search_runs SET ${column} = ? WHERE applicant_id = ? AND last_attempt_at = ?`, now(), applicantId, at);
  let out;
  try { out = await recompute(env, applicantId, ...rest); } catch (e) { await finish("last_failure_at"); throw e; }
  if (out?.reason !== "not_applicable") await finish(out?.completed === false || out?.reason ? "last_failure_at" : "last_success_at");
  return out;
};
export const recomputeForApplicant = track(engine.recomputeForApplicant);
export const recomputeForApplicantWithStatus = track(engine.recomputeForApplicantWithStatus);
// After a registration: the search is queued, then searched at once.
export const firstSearch = async (env, applicantId, actor) => {
  await queueFirstSearch(env, applicantId);
  return recomputeForApplicant(env, applicantId, actor);
};

// What the panel shows. run: the applicant's row, or none for a search older than this record.
export function searchRunState(run, nowIso) {
  if (!run) return { state: "not_recorded", at: null, last_success_at: null };
  const { last_attempt_at: attempt, last_success_at: success, last_failure_at: failure } = run;
  const state = (name, at) => ({ state: name, at, last_success_at: success ?? null });
  if (!attempt) return state("queued", null);
  const result = [success, failure].filter(t => t && t >= attempt).sort().at(-1);
  if (!result) return Date.parse(nowIso) - Date.parse(attempt) > RUNNING_MS ? state("failed", attempt) : state("searching", attempt);
  return result === failure ? state("failed", failure) : state("searched", success);
}

const RUN = "r.applicant_id AS recorded, r.last_attempt_at, r.last_success_at, r.last_failure_at";
const read = async (env, sql, ...args) => {
  if (!searchStateEnabled(env)) return null;
  try { return (await env.DB.prepare(sql).bind(...args).all()).results; } catch { return null; }
};
const shown = (rows, ts) => new Map(rows.map(r => [r.id, searchRunState(r.recorded == null ? null : r, ts)]));

// SAP-01, the list: the active home searches with no match at all (a rejected match is a match), by applicant id.
export async function searchRunsWithoutMatch(env) {
  const rows = await read(env, `SELECT a.id, ${RUN} FROM applicants a LEFT JOIN applicant_search_runs r ON r.applicant_id = a.id
    WHERE ${APPLICABLE} AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.applicant_id = a.id)`);
  return rows && shown(rows, now());
}
// The record: an active home search's last run, with or without matches.
export async function searchRunFor(env, applicant) {
  if (!isActive(applicant) || applicant.search_category !== "residential") return null;
  const rows = await read(env, `SELECT a.id, ${RUN} FROM applicants a LEFT JOIN applicant_search_runs r ON r.applicant_id = a.id
    WHERE a.id = ?`, applicant.id);
  return rows?.length ? shown(rows, now()).get(applicant.id) : null;
}
