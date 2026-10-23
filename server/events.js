import { now } from "./http.js";

// Statements recording what happened to an entity, plus its Inbox notice when one is given.
// entity_id null = the row inserted just before, in the same batch.
export function logEvent(env, { actor, entity_type, entity_id, type, data }, notice) {
  const at = now();
  const stmts = [env.DB.prepare(
    "INSERT INTO events (at, actor, entity_type, entity_id, type, data) VALUES (?, ?, ?, COALESCE(?, last_insert_rowid()), ?, ?)")
    .bind(at, actor, entity_type, entity_id ?? null, type, data === undefined ? null : JSON.stringify(data))];
  if (notice) stmts.push(env.DB.prepare(
    "INSERT INTO notifications (event_id, category, title, action_required, created_at) VALUES (last_insert_rowid(), ?, ?, ?, ?)")
    .bind(notice.category, notice.title, notice.action_required ? 1 : 0, at));
  return stmts;
}

// Closes the open notices of an entity (optionally only one category).
export const resolveNotices = (env, { entity_type, entity_id, category }, by) => env.DB.prepare(
  `UPDATE notifications SET resolved_at = ?, resolved_by = ? WHERE resolved_at IS NULL
   AND event_id IN (SELECT id FROM events WHERE entity_type = ? AND entity_id = ?)${category ? " AND category = ?" : ""}`)
  .bind(now(), by, entity_type, entity_id, ...(category ? [category] : []));
