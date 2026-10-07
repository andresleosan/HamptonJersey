export const AVAILABILITY = { for_sale: "En venta", under_offer: "Oferta aceptada", sold: "Vendida", to_let: "En alquiler",
  lease: "Arrendamiento", not_stated: "Sin indicar", withdrawn: "Retirada" };
export const OPERATION = { sale: "Venta", rent: "Alquiler", business: "Traspaso / negocio" };
export const USE = { residential: "Residencial", commercial: "Comercial" };
export const KIND = { photo: "Foto", floorplan: "Plano", aerial: "Aérea", document: "Documento" };
export const STATUS_LABEL = { published: "Publicada", draft: "Borrador", archived: "Archivada" };
export const stateOf = l => (l.archived_at ? "archived" : l.published ? "published" : "draft");

const SYM = { GBP: "£", EUR: "€" };
export function priceText(l) {
  const a = { sale: l.sale_price, rent: l.rent, business: l.premium }[l.operation];
  if (a == null) return l.price_text || "—";
  const per = l.operation === "rent" ? (l.rent_period === "year" ? " /año" : " /mes") : "";
  return `${SYM[l.currency] ?? ""}${Math.round(a).toLocaleString("en-GB")}${per}`;
}
export const fmtDate = iso => (iso ? new Date(iso).toLocaleString("es-ES",
  { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const safeHref = u => (/^https?:\/\//i.test(u || "") ? u : undefined);
