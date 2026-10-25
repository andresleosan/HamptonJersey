import { json, fail } from "../http.js";
import { activeSql } from "../applicants.js";
import { milestoneLabel, nextMilestone } from "../sales.js";
import { plusDays, jerseyToday } from "../viewings.js";
import { jerseyDayStart } from "../insights.js";
import { period } from "./insights.js";
import { ID } from "./listings.js";
import { inOrder } from "./sales.js";

// Every statement reads one listing and selects only counts, dates, amounts and the team's notes: never who (O6, O7, O8).
const LISTING = `SELECT id, title, operation, availability, price_text, sale_price, rent, rent_period, currency
  FROM listings WHERE id = ?`;
// O4: all of the listing's days, summed below for the period and since the first one.
const STATS = "SELECT day, metric, n FROM daily_stats WHERE listing_id = ? ORDER BY day";
// O5, by viewing date from the period's start: done, cancelled or missed up to today; booked from today on.
// Bind order: to, to, to, to, id, from.
const VIEWINGS = `SELECT COALESCE(SUM(status = 'completed' AND date <= ?), 0) AS completed,
  COALESCE(SUM(status IN ('requested', 'confirmed') AND date >= ?), 0) AS upcoming,
  COALESCE(SUM(status = 'cancelled' AND date <= ?), 0) AS cancelled,
  COALESCE(SUM(status = 'no_show' AND date <= ?), 0) AS no_show
  FROM viewing_requests WHERE listing_id = ? AND date >= ?`;
const FEEDBACK = `SELECT date, outcome, outcome_note AS note FROM viewing_requests
  WHERE listing_id = ? AND status = 'completed' AND date BETWEEN ? AND ? ORDER BY date, time, id`;
// O7: active applicants whose search fits; matches are unique per applicant and listing.
const DEMAND = `SELECT COUNT(*) AS matched, COALESCE(SUM(m.status = 'shortlisted'), 0) AS shortlisted
  FROM matches m JOIN applicants a ON a.id = m.applicant_id
  WHERE m.listing_id = ? AND m.status IN ('found', 'shortlisted') AND ${activeSql("a")}`;
// O8: numbered among all the listing's offers, so "Offer 2" is the same offer in every report; shown when open or
// made in the period. Bind order: id, since.
const OFFERS = `SELECT n, created_at, amount, status, counter_amount FROM (SELECT created_at, amount, status, counter_amount,
    ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM offers WHERE listing_id = ?)
  WHERE status IN ('pending', 'countered') OR created_at >= ? ORDER BY n`;
// The sale in progress, else the latest completed one (its status tells which): a sold listing still reports its sale.
const LATEST_SALE = `SELECT id FROM sales WHERE listing_id = ? AND status IN ('in_progress', 'completed')
  ORDER BY status = 'in_progress' DESC, closed_at DESC, id DESC LIMIT 1`;
const SALE = `SELECT price, status, route, closed_at FROM sales WHERE id = (${LATEST_SALE})`;
const STEPS = `SELECT key, done_on, not_needed FROM sale_milestones WHERE sale_id = (${LATEST_SALE})`;

const METRIC = { view: "views", photos: "photos", tour: "tour" };
const zero = () => ({ views: 0, photos: 0, tour: 0 });
const add = (sums, r) => { sums[METRIC[r.metric]] += r.n; };

// O10: one listing's report for the period, read in one batch.
async function report({ request, env, params: [id] }) {
  const { days, from, to } = period(request), since = jerseyDayStart(from);
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const [[listing], stats, [viewings], feedback, [demand], offers, [sale], steps] = (await env.DB.batch([
    q(LISTING, id), q(STATS, id), q(VIEWINGS, to, to, to, to, id, from), q(FEEDBACK, id, from, to), q(DEMAND, id),
    q(OFFERS, id, since), q(SALE, id), q(STEPS, id),
  ])).map(r => r.results);
  if (!listing) fail(404, "Listing not found");

  // by_day holds every day of the period, zeros included: the panel only groups it into weeks.
  const byDay = new Map(Array.from({ length: days }, (_, i) => [plusDays(from, i), zero()]));
  const web = zero(), total = zero();
  for (const r of stats) {
    add(total, r);
    const day = byDay.get(r.day);
    if (day) { add(day, r); add(web, r); }
  }
  // O11: offers and sales are only for listings for sale.
  const forSale = listing.operation === "sale";
  const ordered = inOrder(steps), next = nextMilestone(ordered);
  return json({
    listing,
    period: { days, from, to },
    web: { ...web, by_day: [...byDay].map(([day, sums]) => ({ day, ...sums })),
      since: { first_day: stats[0]?.day ?? null, ...total } },
    viewings: { ...viewings, feedback },
    demand,
    offers: forSale ? offers : null,
    // O8: the steps done, with their dates, and the next one while the sale is in progress.
    sale: forSale && sale ? { agreed_price: sale.price, status: sale.status,
      completed_on: sale.status === "completed" ? jerseyToday(new Date(sale.closed_at)) : null,
      milestones: ordered.filter(m => m.done_on).map(m => ({ key: m.key, label: milestoneLabel(m.key, sale.route), done_on: m.done_on })),
      next: sale.status === "in_progress" && next ? { key: next.key, label: milestoneLabel(next.key, sale.route) } : null } : null,
  });
}

export default [["GET", new RegExp(`^/admin/listings/${ID}/report$`), report, true]];
