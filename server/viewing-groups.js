// VIS-14: an open viewing when several people want the same house (migration 0104). Switched off (VIS14_BLOCK_READY,
// off unless set to "1"), nothing reads or writes these tables and the panel shows nothing new.
// A place is an existing viewing request moved to the group's time: pending while requested, confirmed once confirmed,
// freed by itself when that viewing is cancelled or moved. Staff create groups and give places; nothing is sent.
// For the negotiator's day (VIS-09's maximum and margins, the slots, a clash) an open group is ONE appointment: its
// viewings at its time are represented by it (collapsedSql), and an empty group still holds its time.

export const vis14Ready = env => env?.VIS14_BLOCK_READY === "1";

// Viewing `m` holds a place of group `g` (aliases in scope): active and still at the group's negotiator, date and time.
export const holds = (m, g) => `${m}.status IN ('requested', 'confirmed') AND ${m}.negotiator_id = ${g}.negotiator_id
  AND ${m}.date = ${g}.date AND ${m}.time = ${g}.time`;
export const places = (g, status) => `(SELECT COUNT(*) FROM viewing_group_places p JOIN viewing_requests m ON m.id = p.viewing_id
  WHERE p.group_id = ${g}.id AND ${holds("m", g)}${status ? ` AND m.status = '${status}'` : ""})`;
// What a group shows: how many places are pending and confirmed. Never who holds them.
export const COUNTS = g => `${places(g, "requested")} AS pending, ${places(g, "confirmed")} AS confirmed`;
// A request that holds a place of an open group (it is planned already).
export const inOpenGroupSql = v => `EXISTS (SELECT 1 FROM viewing_group_places p JOIN viewing_groups g ON g.id = p.group_id
  WHERE p.viewing_id = ${v}.id AND g.status = 'open' AND ${holds(v, "g")})`;
// Viewing `o`, whatever its status, is at the time of an open group it has a place in: the group stands for it.
export const collapsedSql = o => `EXISTS (SELECT 1 FROM viewing_group_places cp JOIN viewing_groups cg ON cg.id = cp.group_id
  WHERE cp.viewing_id = ${o}.id AND cg.status = 'open' AND cg.negotiator_id = ${o}.negotiator_id AND cg.date = ${o}.date
    AND cg.time = ${o}.time)`;
// An open group as one of canReserveViewing's bookings. Its id never meets a viewing's (excludeViewingId).
export const groupBooking = g => ({ id: Number.MAX_SAFE_INTEGER - g.id, negotiator_id: g.negotiator_id, date: g.date,
  time: g.time, end_time: g.end_time, status: "confirmed", parish: g.parish, buffer_minutes: g.buffer_minutes,
  parish_extra_minutes: g.parish_extra_minutes, policy_revision: g.policy_revision });

// The panel's busy calendar (VIS-06): each open group of the range with its counts, no property and no people.
export async function calendarGroups(env, { from, to, negotiatorId = null }) {
  const { results } = await env.DB.prepare(`SELECT g.negotiator_id, g.date, g.time, g.end_time, g.capacity, ${COUNTS("g")}
    FROM viewing_groups g WHERE g.status = 'open' AND g.date BETWEEN ? AND ?${negotiatorId == null ? "" : " AND g.negotiator_id = ?"}
    ORDER BY g.date, g.time, g.id`).bind(from, to, ...(negotiatorId == null ? [] : [negotiatorId])).all();
  return results;
}
