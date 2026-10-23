export const AVAILABILITY = { for_sale: "For sale", under_offer: "Under offer", sold: "Sold", to_let: "To let",
  lease: "Lease", not_stated: "Not stated", withdrawn: "Withdrawn" };
export const OPERATION = { sale: "Sale", rent: "Rent", business: "Business" };
export const USE = { residential: "Residential", commercial: "Commercial" };
export const KIND = { photo: "Photo", floorplan: "Floor plan", aerial: "Aerial", document: "Document" };
export const STATUS_LABEL = { published: "Published", draft: "Draft", archived: "Archived" };
export const stateOf = l => (l.archived_at ? "archived" : l.published ? "published" : "draft");

const SYM = { GBP: "£", EUR: "€" };
export function priceText(l) {
  const a = { sale: l.sale_price, rent: l.rent, business: l.premium }[l.operation];
  if (a == null) return l.price_text || "—";
  const per = l.operation === "rent" ? (l.rent_period === "year" ? " p.a." : " pcm") : "";
  return `${SYM[l.currency] ?? ""}${Math.round(a).toLocaleString("en-GB")}${per}`;
}
export const fmtDate = iso => (iso ? new Date(iso).toLocaleString("en-GB",
  { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const safeHref = u => (/^https?:\/\//i.test(u || "") ? u : undefined);
const AGO = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
// "3 hours ago", "yesterday", "now": whole units, never rounded up; never in the future (clock skew).
export function fmtAgo(iso) {
  if (!iso) return "—";
  const s = Math.min(0, (new Date(iso) - Date.now()) / 1000);
  const [unit, size] = STEPS.find(([, n]) => Math.abs(s) >= n) ?? ["second", 1];
  return AGO.format(Math.trunc(s / size) || 0, unit);
}
