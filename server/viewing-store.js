import { fail, now as stamp } from "./http.js";
import { daySlots, addMinutes, plusDays, weekday, SLOT_MINUTES, BUFFER_MINUTES, ACTIVE, propertyAllows } from "./viewings.js";
import { rentalClosureEnabled, noUnresolvedRentalClosureSql } from './rental-closure.js';
import { viewingPolicyReady, canReserveViewing, reservationPolicyGuard, DEFAULT_VIEWING_POLICY } from './viewing-policy.js';

const ACTIVE_SQL = ACTIVE.map(s => `'${s}'`).join(", ");
export const PUBLIC_BOOKING_BLOCKED_SQL = "'sold','let_agreed','let','withdrawn'";

// The slots of `days` days from `from` (website, fromTomorrow: Monday to Saturday only, C11), per negotiator.
// Three queries (plus an optional property policy) in one batch; exceptions and viewings are read through the (negotiator_id, date) indexes (the unary +
// keeps SQLite from picking the (status, created_at) index instead, which would read every active viewing ever).
// excludeId: a viewing being rescheduled, left out of the bookings so its own and neighbouring slots show as free.
export async function loadAvailability(env, { from, days, now, fromTomorrow, includeInactive = false, negotiatorId, excludeId, listingId }) {
  const dates = [];
  for (let d = from; dates.length < days; d = plusDays(d, 1)) if (!fromTomorrow || weekday(d) !== "sun") dates.push(d);
  const who = [includeInactive ? "1" : "active = 1", ...(negotiatorId == null ? [] : ["id = ?"])].join(" AND ");
  const args = negotiatorId == null ? [] : [negotiatorId], range = [dates[0], dates.at(-1)], ready = viewingPolicyReady(env);
  const results = await env.DB.batch([
    env.DB.prepare(`SELECT id, name, role, active, hours FROM negotiators WHERE ${who} ORDER BY id`).bind(...args),
    env.DB.prepare(`SELECT negotiator_id, date, kind, start_time, end_time FROM negotiator_exceptions
      WHERE negotiator_id IN (SELECT id FROM negotiators WHERE ${who}) AND date BETWEEN ? AND ?`).bind(...args, ...range),
    env.DB.prepare(`SELECT negotiator_id, date, time, end_time FROM viewing_requests
      WHERE negotiator_id IN (SELECT id FROM negotiators WHERE ${who}) AND date BETWEEN ? AND ? AND +status IN (${ACTIVE_SQL})${
        excludeId == null ? "" : " AND id <> ?"}`)
      .bind(...args, ...range, ...(excludeId == null ? [] : [excludeId])),
    ...(listingId == null ? [] : [env.DB.prepare(`SELECT viewings_enabled, viewing_hours${ready ? ", parish" : ""} FROM listings WHERE id = ?${
      fromTomorrow ? ` AND published = 1 AND archived_at IS NULL AND availability NOT IN (${PUBLIC_BOOKING_BLOCKED_SQL})${
        rentalClosureEnabled(env) ? ` AND ${noUnresolvedRentalClosureSql('listings')}` : ''}` : ""}`).bind(listingId)]),
    // VIS-09: the saved rules, and every non-cancelled viewing of the negotiators from the day before to the day after
    // (margins cross midnight), with the parish and margins each was booked with.
    ...(ready ? [
      env.DB.prepare(`SELECT negotiator_id, duration_minutes, buffer_minutes, parish_extra_minutes, max_daily, revision
        FROM viewing_policy_settings WHERE negotiator_id IN (SELECT id FROM negotiators WHERE ${who})`).bind(...args),
      env.DB.prepare(`SELECT v.id, v.negotiator_id, v.date, v.time, v.end_time, v.status, s.parish, s.buffer_minutes,
          s.parish_extra_minutes, s.policy_revision FROM viewing_requests v LEFT JOIN viewing_policy_snapshots s ON s.viewing_id = v.id
        WHERE v.negotiator_id IN (SELECT id FROM negotiators WHERE ${who})
          AND v.date BETWEEN ? AND ? AND v.status IS NOT 'cancelled'${excludeId == null ? "" : " AND v.id <> ?"}`)
        .bind(...args, plusDays(range[0], -1), plusDays(range[1], 1), ...(excludeId == null ? [] : [excludeId])),
    ] : []),
  ]).then(r => r.map(x => x.results));
  const [people, exceptions, bookings] = results, properties = listingId == null ? undefined : results[3];
  const [settings = [], nearby = []] = ready ? results.slice(listingId == null ? 3 : 4) : [];
  if (listingId != null && !properties.length) fail(404, "Unknown property");
  const property = properties?.[0];
  if (property) property.viewing_hours = property.viewing_hours == null ? null : JSON.parse(property.viewing_hours);
  const byDay = rows => rows.reduce((a, r) => ((a[`${r.negotiator_id} ${r.date}`] ||= []).push(r), a), {});
  const ex = byDay(exceptions), booked = byDay(bookings);
  const hours = Object.fromEntries(people.map(p => [p.id, JSON.parse(p.hours)]));
  // Master plan (10-Nov-2026): a negotiator without saved rules has the plan's defaults (30, 15, +15 between parishes,
  // 8 a day; revision 0), not the bare fixed slot. reservationPolicyGuard reads a missing row as these same values.
  const saved = Object.fromEntries(settings.map(({ negotiator_id, ...p }) => [negotiator_id, p]));
  const policies = ready ? Object.fromEntries(people.map(({ id }) => [id, saved[id] ?? { ...DEFAULT_VIEWING_POLICY }])) : {};
  const parish = property?.parish ?? null;
  const taken = (id, date) => policies[id] && (time => !canReserveViewing({ policy: policies[id],
    bookings: nearby.filter(b => b.negotiator_id === id) }, { negotiator_id: id, date, time, parish }).allowed);
  return {
    ...(property ? { property_viewings_enabled: property.viewings_enabled === 1 } : {}),
    // policies: the rules by negotiator id (saved, or the plan's defaults); parish: the one a booking here records.
    ...(ready ? { policies, parish } : {}),
    negotiators: people.map(({ id, name, role, active }) => ({ id, name, role, active })),
    days: dates.map(date => ({ date, slots: Object.fromEntries(people.map(({ id }) => [id, daySlots({ hours: hours[id],
      exceptions: ex[`${id} ${date}`] ?? [], bookings: booked[`${id} ${date}`] ?? [], date, now, fromTomorrow,
      duration: policies[id]?.duration_minutes, taken: taken(id, date) })
      .filter(slot => !property || propertyAllows(property, date, slot.time, policies[id]?.duration_minutes))])) })),
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

// Re-read the property policy within the INSERT/UPDATE, so a concurrent settings save cannot admit a stale slot.
// Dates and times are already Jersey wall-clock values; strftime('%w') uses Sunday = 0 just like the editor.
export function propertyViewingGuard({ listing_id, date, time }, { publicOnly = false, timedClosures = false, duration = SLOT_MINUTES } = {}) {
  return {
    sql: `(? IS NULL OR EXISTS (SELECT 1 FROM listings p WHERE p.id = ? AND p.viewings_enabled = 1
      ${publicOnly ? `AND p.published = 1 AND p.archived_at IS NULL AND p.availability NOT IN (${PUBLIC_BOOKING_BLOCKED_SQL})${
        timedClosures ? ` AND ${noUnresolvedRentalClosureSql('p')}` : ''}` : ""}
      AND (p.viewing_hours IS NULL OR EXISTS (SELECT 1 FROM json_each(p.viewing_hours) w
        WHERE json_extract(w.value, '$.day') = CAST(strftime('%w', ?) AS INTEGER)
          AND json_extract(w.value, '$.start') <= ? AND json_extract(w.value, '$.end') >= ?))))`,
    binds: [listing_id ?? null, listing_id ?? null, date, time, addMinutes(time, duration)],
  };
}

// The slot condition of a booking or move, part of its INSERT/UPDATE. Gate off: clash() alone, as always. Gate on: with
// the negotiator's saved rules (policy, parish: loadAvailability's), reservationPolicyGuard re-reads their revision,
// activity, the listing's parish, the daily count and the neighbours; without, clash() holds only while no rules have
// been saved meanwhile. actor: a panel write's admin, who must still be one.
export function slotGuard(env, v, { policy = null, parish = null, actor = null, excludeId = null } = {}) {
  const ready = viewingPolicyReady(env);
  const g = policy ? reservationPolicyGuard({ negotiator_id: v.negotiator_id, date: v.date, time: v.time,
    listing_id: v.listing_id ?? null, parish }, policy, { excludeViewingId: excludeId }) : null;
  const c = g ? null : clash(v, excludeId);
  const sql = g ? g.sql : `NOT ${c.sql}${ready ? " AND NOT EXISTS (SELECT 1 FROM viewing_policy_settings WHERE negotiator_id = ?)" : ""}`;
  return {
    sql: ready && actor ? `${sql} AND EXISTS (SELECT 1 FROM admins WHERE email = ?)` : sql,
    binds: [...(g ? g.binds : c.binds), ...(!g && ready ? [v.negotiator_id] : []), ...(ready && actor ? [actor] : [])],
  };
}

// VIS-09: the parish and margins a booking or move used, right after its write and only if it wrote (changes() = 1).
// viewingId null: the row just inserted. It writes one row, so logEvent's ifInserted after it still follows the write.
export const policySnapshot = (env, policy, parish, viewingId = null) => env.DB.prepare(`INSERT INTO viewing_policy_snapshots
    (viewing_id, parish, buffer_minutes, parish_extra_minutes, policy_revision)
  SELECT COALESCE(?, last_insert_rowid()), ?, ?, ?, ? WHERE changes() = 1
  ON CONFLICT (viewing_id) DO UPDATE SET parish = excluded.parish, buffer_minutes = excluded.buffer_minutes,
    parish_extra_minutes = excluded.parish_extra_minutes, policy_revision = excluded.policy_revision`)
  .bind(viewingId, parish, policy.buffer_minutes, policy.parish_extra_minutes, policy.revision);

// The booking (v: validateViewing's value, plus the panel's notes), inserted only if its slot is still free: run it in a batch followed by
// logEvent(…, { ifInserted: true }) and read meta.changes (0 = taken meanwhile). agent and the listing title are
// copied from their rows, as the text the panel shows. policy, parish, actor: see slotGuard; with a policy, add
// policySnapshot right after it.
export function bookStatement(env, v, { status, publicOnly = false, policy = null, parish = null, actor = null }) {
  const duration = policy?.duration_minutes ?? SLOT_MINUTES, g = slotGuard(env, v, { policy, parish, actor });
  const property = propertyViewingGuard(v, { publicOnly, timedClosures:rentalClosureEnabled(env), duration });
  return env.DB.prepare(`INSERT INTO viewing_requests (listing_id, listing_ref, listing_title_snapshot, negotiator_id, agent,
      kind, date, time, end_time, name, email, phone, notes, status, created_at)
    SELECT ?, ?, (SELECT title FROM listings WHERE id = ?), ?, (SELECT name FROM negotiators WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE ${g.sql} AND ${property.sql}`)
    .bind(v.listing_id, v.listing_id, v.listing_id, v.negotiator_id, v.negotiator_id, v.kind, v.date, v.time,
      addMinutes(v.time, duration), v.name, v.email, v.phone, v.notes ?? null, status, stamp(), ...g.binds, ...property.binds);
}
