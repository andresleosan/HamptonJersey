// Business describes the listing category; tenure determines its price basis.
// Explicit rentals remain rentals, including rentals of freehold property.
export function priceOperation(listing) {
  if (listing.operation !== "business") return listing.operation;
  const tenure = String(listing.tenure_type || listing.tenureType || listing.tenure || "").trim().toLowerCase();
  return tenure === "freehold" ? "sale" : "rent";
}
export const priceField = listing => ({sale: "sale_price", rent: "rent"})[priceOperation(listing)];
export const listingAmount = listing => listing[priceField(listing)] ?? null;
// Same rule for the transactional publishing guard.
export const PRICE_SQL = `CASE WHEN operation = 'sale' OR (operation = 'business'
  AND lower(trim(COALESCE(NULLIF(tenure_type,''),tenure,''))) = 'freehold') THEN sale_price
  WHEN operation IN ('rent','business') THEN rent END`;
