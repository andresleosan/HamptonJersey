import { jerseyNow, plusDays, weekday, WEEKDAYS } from './viewings.js';

// SQL expression is read with the public listing in the same D1 snapshot.
export const confirmedViewingSql = id => `SELECT COUNT(*) FROM viewing_requests v
  WHERE v.listing_id = ${id} AND v.status = 'confirmed' AND v.date >= ? AND v.date < ?
    AND (v.date > ? OR (v.date = ? AND v.time > ?))`;
export function confirmedViewingWindow(clock) {
  const from = plusDays(clock.date, -WEEKDAYS.indexOf(weekday(clock.date)));
  return {from, to: plusDays(from, 7), binds: [from, plusDays(from, 7), clock.date, clock.date, clock.time]};
}

// Only the current Jersey ISO week and future, confirmed visits. Never return a single booking.
export async function publicViewingSummary(env, { listing_id, now = new Date() }) {
  const clock = jerseyNow(now), {from, to, binds} = confirmedViewingWindow(clock);
  const row = await env.DB.prepare(`SELECT (${confirmedViewingSql('l.id')}) AS n FROM listings l
    WHERE l.id = ? AND l.published = 1 AND l.archived_at IS NULL`)
    .bind(...binds, listing_id).first();
  return row ? { booked_this_week: row.n >= 2 ? row.n : null, from, to } : null;
}
