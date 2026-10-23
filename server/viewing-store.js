import { now as stamp } from "./http.js";
import { daySlots, addMinutes, plusDays, weekday, SLOT_MINUTES, BUFFER_MINUTES, ACTIVE } from "./viewings.js";

const ACTIVE_SQL = ACTIVE.map(s => `'${s}'`).join(", ");

// The slots of `days` days from `from` (website, fromTomorrow: Monday to Saturday only, C11), per negotiator.
// Three queries in one batch; exceptions and viewings are read through the (negotiator_id, date) indexes (the unary +
// keeps SQLite from picking the (status, created_at) index instead, which would read every active viewing ever).
export async function loadAvailability(env, { from, days, now, fromTomorrow, includeInactive = false, negotiatorId }) {
  const dates = [];
  for (let d = from; dates.length < days; d = plusDays(d, 1)) if (!fromTomorrow || weekday(d) !== "sun") dates.push(d);
  const who = [includeInactive ? "1" : "active = 1", ...(negotiatorId == null ? [] : ["id = ?"])].join(" AND ");
  const args = negotiatorId == null ? [] : [negotiatorId], range = [dates[0], dates.at(-1)];
  const [people, exceptions, bookings] = await env.DB.batch([
    env.DB.prepare(`SELECT id, name, role, active, hours FROM negotiators WHERE ${who} ORDER BY id`).bind(...args),
    env.DB.prepare(`SELECT negotiator_id, date, kind, start_time, end_time FROM negotiator_exceptions
      WHERE negotiator_id IN (SELECT id FROM negotiators WHERE ${who}) AND date BETWEEN ? AND ?`).bind(...args, ...range),
    env.DB.prepare(`SELECT negotiator_id, date, time, end_time FROM viewing_requests
      WHERE negotiator_id IN (SELECT id FROM negotiators WHERE ${who}) AND date BETWEEN ? AND ? AND +status IN (${ACTIVE_SQL})`)
      .bind(...args, ...range),
  ]).then(r => r.map(x => x.results));
  const byDay = rows => rows.reduce((a, r) => ((a[`${r.negotiator_id} ${r.date}`] ||= []).push(r), a), {});
  const ex = byDay(exceptions), booked = byDay(bookings);
  const hours = Object.fromEntries(people.map(p => [p.id, JSON.parse(p.hours)]));
  return {
    negotiators: people.map(({ id, name, role, active }) => ({ id, name, role, active })),
    days: dates.map(date => ({ date, slots: Object.fromEntries(people.map(({ id }) => [id, daySlots({ hours: hours[id],
      exceptions: ex[`${id} ${date}`] ?? [], bookings: booked[`${id} ${date}`] ?? [], date, now, fromTomorrow })])) })),
  };
}

// C6: an active viewing of the same negotiator that day overlapping [time, time + SLOT_MINUTES) with BUFFER_MINUTES
// either side (daySlots' rule). The bounds come from addMinutes, never SQLite's time(), which wraps at midnight.
// excludeId: the viewing being moved, which never clashes with itself. Bind `binds` where `sql` goes.
export function clash({ negotiator_id, date, time }, excludeId) {
  const end = addMinutes(time, SLOT_MINUTES);
  return {
    sql: `EXISTS (SELECT 1 FROM viewing_requests o WHERE o.negotiator_id = ? AND o.date = ? AND o.status IN (${ACTIVE_SQL})
      AND o.time < ? AND o.end_time > ?${excludeId == null ? "" : " AND o.id <> ?"})`,
    binds: [negotiator_id, date, addMinutes(end, BUFFER_MINUTES), addMinutes(time, -BUFFER_MINUTES),
      ...(excludeId == null ? [] : [excludeId])],
  };
}

// The booking (v: validateViewing's value), inserted only if its slot is still free: run it in a batch followed by
// logEvent(…, { ifInserted: true }) and read meta.changes (0 = taken meanwhile). agent and the listing title are
// copied from their rows, as the text the panel shows.
export function bookStatement(env, v, { status, excludeId }) {
  const c = clash(v, excludeId);
  return env.DB.prepare(`INSERT INTO viewing_requests (listing_id, listing_ref, listing_title_snapshot, negotiator_id, agent,
      kind, date, time, end_time, name, email, phone, status, created_at)
    SELECT ?, ?, (SELECT title FROM listings WHERE id = ?), ?, (SELECT name FROM negotiators WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT ${c.sql}`)
    .bind(v.listing_id, v.listing_id, v.listing_id, v.negotiator_id, v.negotiator_id, v.kind, v.date, v.time,
      addMinutes(v.time, SLOT_MINUTES), v.name, v.email, v.phone, status, stamp(), ...c.binds);
}
