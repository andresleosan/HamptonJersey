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
  // "Changed" = the last saved edit (updated_at); with BUS07_PROVENANCE_READY the server sends material_change_at, the
  // latest change of price or availability in the listing's history over the last 7 days (null: none).
  const changed = l.material_change_at !== undefined ? l.material_change_at : l.updated_at;
  return !f.recent || (changed != null && today - new Date(changed) <= 7 * DAY);
}

export const bedsLabel = n => (n == null ? "" : n === 0 ? "Studio" : `${n} bed`);
export const bathsLabel = n => (n == null ? "" : `${n} ${n === 1 ? "bath" : "baths"}`);

export function daysAgo(iso, today = new Date()) {
  if (!iso) return "—";
  const d = Math.floor((today - new Date(iso)) / DAY);
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
}

// D1 legacy timestamps have no offset and are UTC. Normalize before sorting, filtering or displaying.
export function editTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const iso = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T");
  const ts = Date.parse(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso
    : iso.includes("T") ? iso + "Z" : iso);
  return Number.isFinite(ts) ? ts : null;
}

export function passesEditedWithin(listing, days, now = Date.now()) {
  if (!days) return true;
  const edited = editTimestamp(listing.updated_at);
  return edited !== null && edited <= now && edited >= now - Number(days) * DAY;
}

export function compareListings(a, b, order) {
  if (order) {
    const left = editTimestamp(a.updated_at), right = editTimestamp(b.updated_at);
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    if (left !== right) return order === "asc" ? left - right : right - left;
  }
  return a.id.localeCompare(b.id);
}

const LISTINGS_PER_PAGE = 25;
export function listingsPage(rows, requestedIndex) {
  const last = Math.max(0, Math.ceil(rows.length / LISTINGS_PER_PAGE) - 1);
  const index = Math.min(last, Math.max(0, requestedIndex));
  const start = index * LISTINGS_PER_PAGE, end = Math.min(start + LISTINGS_PER_PAGE, rows.length);
  return { index, start, end, rows: rows.slice(start, end), hasNext: end < rows.length };
}
