import { jerseyNow, plusDays, weekday, WEEKDAYS } from './viewings.js';

// Only the current Jersey ISO week and future, confirmed visits. Never return a single booking.
export async function publicViewingSummary(env, { listing_id, now = new Date() }) {
  const clock = jerseyNow(now);
  const from = plusDays(clock.date, -WEEKDAYS.indexOf(weekday(clock.date)));
  const to = plusDays(from, 7);
  const row = await env.DB.prepare(`SELECT COUNT(v.id) AS n FROM listings l
    LEFT JOIN viewing_requests v ON v.listing_id = l.id AND v.status = 'confirmed'
      AND v.date >= ? AND v.date < ? AND (v.date > ? OR (v.date = ? AND v.time > ?))
    WHERE l.id = ? AND l.published = 1 AND l.archived_at IS NULL GROUP BY l.id`)
    .bind(from, to, clock.date, clock.date, clock.time, listing_id).first();
  return row ? { booked_this_week: row.n >= 2 ? row.n : null, from, to } : null;
}
