import { listingAmount, priceOperation } from "../../server/listing-pricing.js";
// SPR-06 / SPR-07: the Listings screen's extra filters, on the list it already has. Pure, so tests pin them.
export const OPERATION_FILTER = { sale: "To Buy", rent: "To Let", business: "Business" };
const DAY = 864e5;
const PER_MONTH = { week: 52 / 12, year: 1 / 12 };

// Sales and businesses by their total price; rentals by their rent per month. null when there is no amount.
export function monthlyPrice(l) {
  if (l.operation === "rent") return l.rent == null ? null : l.rent * (PER_MONTH[l.rent_period] ?? 1);
  return listingAmount(l);
}

// The two Bedrooms selects ("" = Any): a From above the To raises the To, so the search is never impossible.
export const bedsRange = (from, to) => ({ from, to: from !== "" && to !== "" && +from > +to ? from : to });

const num = v => (v === "" || v == null ? null : +v);
// f: { op, bedsFrom, bedsTo, min, max, recent }. A listing without the value a bound needs is left out.
export function passesExtra(l, f, today = new Date()) {
  if (f.op && l.operation !== f.op) return false;
  const [from, to] = [num(f.bedsFrom), num(f.bedsTo)];
  if ((from != null || to != null) && (l.bedrooms == null || (from != null && l.bedrooms < from) || (to != null && l.bedrooms > to))) return false;
  const [min, max] = [num(f.min), num(f.max)], price = monthlyPrice(l);
  if ((min != null || max != null) && (price == null || (min != null && price < min) || (max != null && price > max))) return false;
  // ponytail: "changed" = last saved edit (updated_at); price/availability only once SPR-02 keeps a history.
  return !f.recent || today - new Date(l.updated_at) <= 7 * DAY;
}

export const bedsLabel = n => (n == null ? "" : n === 0 ? "Studio" : `${n} bed`);
export const bathsLabel = n => (n == null ? "" : `${n} ${n === 1 ? "bath" : "baths"}`);

export function daysAgo(iso, today = new Date()) {
  if (!iso) return "—";
  const d = Math.floor((today - new Date(iso)) / DAY);
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
}
