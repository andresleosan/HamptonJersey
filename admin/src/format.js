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
