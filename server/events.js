import { now } from "./http.js";

// Statements recording what happened to an entity, plus its Inbox notice when one is given.
// entity_id null = the row inserted just before, in the same batch. ifInserted: write nothing unless that statement
// added a row (an INSERT … WHERE NOT EXISTS may add none, and last_insert_rowid() would then name some other row).
// changes() is the row count of the statement just before, so the notice follows the event the same way.
export function logEvent(env, { actor, entity_type, entity_id, type, data }, notice, { ifInserted = false } = {}) {
  const at = now(), only = ifInserted ? " WHERE changes() = 1" : "";
  const stmts = [env.DB.prepare(
    `INSERT INTO events (at, actor, entity_type, entity_id, type, data) SELECT ?, ?, ?, COALESCE(?, last_insert_rowid()), ?, ?${only}`)
    .bind(at, actor, entity_type, entity_id ?? null, type, data == null ? null : JSON.stringify(data))];
  if (notice) stmts.push(env.DB.prepare(
    `INSERT INTO notifications (event_id, category, title, action_required, created_at) SELECT last_insert_rowid(), ?, ?, ?, ?${only}`)
    .bind(notice.category, notice.title, notice.action_required ? 1 : 0, at));
  return stmts;
}

// Closes the open notices of an entity (optionally only one category). ifLogged: only if the statement just before
// (logEvent's, with ifInserted) wrote its event, so a change that did not happen closes nothing either.
export const resolveNotices = (env, { entity_type, entity_id, category }, by, { ifLogged = false } = {}) => env.DB.prepare(
  `UPDATE notifications SET resolved_at = ?, resolved_by = ? WHERE resolved_at IS NULL
   AND event_id IN (SELECT id FROM events WHERE entity_type = ? AND entity_id = ?)${category ? " AND category = ?" : ""}${
  ifLogged ? " AND changes() = 1" : ""}`)
  .bind(now(), by, entity_type, entity_id, ...(category ? [category] : []));
