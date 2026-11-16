// VIS-14: an open viewing when several people want the same house (migration 0104). Switched off (VIS14_BLOCK_READY,
// off unless set to "1"), nothing reads or writes these tables and the panel shows nothing new.
// A place is an existing viewing request moved to the group's time: pending while requested, confirmed once confirmed,
// freed by itself when that viewing is cancelled or moved. Staff create groups and give places; nothing is sent.
import { now } from "./http.js";
import { addMinutes, BUFFER_MINUTES, ownSql } from "./viewings.js";
import { logEvent } from "./events.js";

export const vis14Ready = env => env?.VIS14_BLOCK_READY === "1";

// Viewing `m` holds a place of group `g` (aliases in scope): active and still at the group's negotiator, date and time.
const holds = (m, g) => `${m}.status IN ('requested', 'confirmed') AND ${m}.negotiator_id = ${g}.negotiator_id
  AND ${m}.date = ${g}.date AND ${m}.time = ${g}.time`;
const places = (g, status) => `(SELECT COUNT(*) FROM viewing_group_places p JOIN viewing_requests m ON m.id = p.viewing_id
  WHERE p.group_id = ${g}.id AND ${holds("m", g)}${status ? ` AND m.status = '${status}'` : ""})`;
// What a group shows: how many places are pending and confirmed. Never who holds them.
export const COUNTS = g => `${places(g, "requested")} AS pending, ${places(g, "confirmed")} AS confirmed`;
// A request that holds a place of an open group (it is planned already).
export const inOpenGroupSql = v => `EXISTS (SELECT 1 FROM viewing_group_places p JOIN viewing_groups g ON g.id = p.group_id
  WHERE p.viewing_id = ${v}.id AND g.status = 'open' AND ${holds(v, "g")})`;

// The panel's busy calendar (VIS-06): each open group of the range with its counts, no property and no people.
export async function calendarGroups(env, { from, to, negotiatorId = null }) {
  const { results } = await env.DB.prepare(`SELECT g.negotiator_id, g.date, g.time, g.end_time, g.capacity, ${COUNTS("g")}
    FROM viewing_groups g WHERE g.status = 'open' AND g.date BETWEEN ? AND ?${negotiatorId == null ? "" : " AND g.negotiator_id = ?"}
    ORDER BY g.date, g.time, g.id`).bind(from, to, ...(negotiatorId == null ? [] : [negotiatorId])).all();
  return results;
}

// One place for viewing `id` (as last read: updated_at) in `group` (its row). All the conditions are in the INSERT, so
// two staff giving the last place at once never oversell it (the migration's trigger refuses it too): the group still
// open and to come, the viewing active, of the same property and unchanged, its person without a place already, room
// left, and no other viewing of the negotiator at that time. Only then the viewing moves to the group's time.
// cycle: VIS-08 is on (a reminder was of the old time). Resolves to null, or [status, message] when refused.
export async function reserveGroupPlace(env, admin, group, { id, updated_at }, { cycle = false, clock }) {
  const ts = now(), from = addMinutes(group.time, -BUFFER_MINUTES), to = addMinutes(group.end_time, BUFFER_MINUTES);
  const [ins] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO viewing_group_places (viewing_id, group_id, created_at, created_by)
      SELECT v.id, g.id, ?, ? FROM viewing_groups g JOIN viewing_requests v ON v.id = ?
      WHERE g.id = ? AND g.status = 'open' AND g.negotiator_id = ? AND g.date = ? AND g.time = ?
        AND (g.date > ? OR (g.date = ? AND g.time > ?))
        AND v.listing_id = g.listing_id AND v.status IN ('requested', 'confirmed') AND v.updated_at IS ?
        AND ${places("g")} < g.capacity
        AND NOT EXISTS (SELECT 1 FROM viewing_group_places q JOIN viewing_requests h ON h.id = q.viewing_id
          WHERE q.group_id = g.id AND ${holds("h", "g")} AND ${ownSql("h")} = ${ownSql("v")})
        AND NOT EXISTS (SELECT 1 FROM viewing_requests c WHERE c.negotiator_id = g.negotiator_id AND c.date = g.date
          AND c.status IN ('requested', 'confirmed') AND c.id <> v.id AND c.time < ? AND c.end_time > ?
          AND NOT (c.time = g.time AND c.id IN (SELECT viewing_id FROM viewing_group_places WHERE group_id = g.id)))
        AND EXISTS (SELECT 1 FROM admins WHERE email = ?)
      ON CONFLICT (viewing_id) DO UPDATE SET group_id = excluded.group_id, created_at = excluded.created_at,
        created_by = excluded.created_by`)
      .bind(ts, admin, id, group.id, group.negotiator_id, group.date, group.time, clock.date, clock.date, clock.time,
        updated_at, to, from, admin),
    env.DB.prepare(`UPDATE viewing_requests SET negotiator_id = ?, agent = (SELECT name FROM negotiators WHERE id = ?),
        ${cycle ? `reminded_at = CASE WHEN date = ? AND time = ? THEN reminded_at END,
        reminded_by = CASE WHEN date = ? AND time = ? THEN reminded_by END,
        reminded_channel = CASE WHEN date = ? AND time = ? THEN reminded_channel END, ` : ""}date = ?, time = ?, end_time = ?,
        updated_at = ?, updated_by = ? WHERE id = ? AND changes() = 1`)
      .bind(group.negotiator_id, group.negotiator_id, ...(cycle ? Array(3).fill([group.date, group.time]).flat() : []),
        group.date, group.time, group.end_time, ts, admin, id),
    ...logEvent(env, { actor: admin, entity_type: "viewing", entity_id: String(id), type: "viewing.group_place",
      data: { group_id: group.id, negotiator_id: group.negotiator_id, date: group.date, time: group.time } }, null, { ifInserted: true }),
  ]);
  if (ins.meta.changes) return null;
  return refusal(env, group, { id, updated_at });
}

// Why a place was refused, read after the write: the first condition that no longer holds.
async function refusal(env, group, { id, updated_at }) {
  const [g, v, dup] = await Promise.all([
    env.DB.prepare(`SELECT g.status, g.capacity, ${places("g")} AS taken FROM viewing_groups g WHERE g.id = ?`).bind(group.id).first(),
    env.DB.prepare("SELECT listing_id, status, updated_at FROM viewing_requests WHERE id = ?").bind(id).first(),
    env.DB.prepare(`SELECT 1 FROM viewing_requests v JOIN viewing_groups g ON g.id = ? WHERE v.id = ? AND EXISTS (
        SELECT 1 FROM viewing_group_places q JOIN viewing_requests h ON h.id = q.viewing_id
        WHERE q.group_id = g.id AND ${holds("h", "g")} AND ${ownSql("h")} = ${ownSql("v")})`).bind(group.id, id).first(),
  ]);
  if (!g) return [404, "Open viewing not found"];
  if (g.status !== "open") return [409, "This open viewing is cancelled."];
  if (!v) return [404, "Viewing not found"];
  if (v.listing_id !== group.listing_id) return [409, "This request is for another property."];
  if (!["requested", "confirmed"].includes(v.status)) return [409, `This viewing is already ${v.status === "no_show" ? "marked as a no-show" : v.status}.`];
  if (v.updated_at !== updated_at) return [409, "Someone else saved changes to this viewing. Reload to see them (your changes were not saved)."];
  if (dup) return [409, "This person already has a place in this open viewing."];
  if (g.taken >= g.capacity) return [409, "This open viewing is full."];
  return [409, "The negotiator has another viewing at that time, or the open viewing has passed."];
}
