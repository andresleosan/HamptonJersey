// One place for what each category of listing may be. The listing editor, "Add new property" and the server all read it.
// Category = Residential, Commercial or International. The database keeps `use` as residential/commercial, so
// International is the country: anything that is not Jersey or the United Kingdom (same rule as the HE-I reference).
export const CATEGORY = { residential: "Residential", commercial: "Commercial", international: "International" };
export const categoryOf = ({ use, country }) =>
  country === "Jersey" || country === "United Kingdom" ? (use === "commercial" ? "commercial" : "residential") : "international";

// Residential may be sold or let; Commercial and International are for sale only (they have an asking price, never a rent).
export const OPERATIONS = { residential: ["sale", "rent"], commercial: ["sale"], international: ["sale"] };
// 'lease' and 'not_stated' are no longer offered; a listing that already has one keeps it (see checkCategory).
export const AVAILABILITIES = { sale: ["for_sale", "under_offer", "sold", "withdrawn"], rent: ["to_let", "let_agreed", "let", "withdrawn"] };
export const DEFAULT_AVAILABILITY = { sale: "for_sale", rent: "to_let" };

// The choices shared by the editor and "Add new property": picking an operation or a category keeps the availability
// valid for it (a listing that already has an old value keeps it), and International asks for a country of its own.
export const chooseOperation = (f, operation) => ({ ...f, operation, availability:
  operation === f.operation || AVAILABILITIES[operation].includes(f.availability) ? f.availability : DEFAULT_AVAILABILITY[operation] });
export const chooseCategory = (f, category) => {
  const was = categoryOf(f);
  return chooseOperation({ ...f, use: category === "commercial" ? "commercial" : "residential",
    country: category === "international" ? (was === "international" ? f.country : "") : was === "international" ? "Jersey" : f.country },
  OPERATIONS[category].includes(f.operation) ? f.operation : "sale");
};

// What the form shows per category and operation. `price` is the one money field staff type.
export function fieldsFor({ use, country, operation }) {
  const category = categoryOf({ use, country }), rent = operation === "rent", home = category === "residential";
  return {
    category,
    price: rent ? "rent" : "sale_price",
    tenure: category === "commercial",
    rooms: category !== "commercial",                 // bedrooms and bathrooms
    parish: category !== "international",
    housing: home && country === "Jersey",
    restriction: home && country === "Jersey",
    firstTimeBuyer: home && !rent,
    pricePerSqft: category === "commercial",
    parishRates: category !== "international",
    rentalTerms: rent,                                // deposit, utilities, available from
    currencies: category === "international" ? ["GBP", "EUR"] : ["GBP"],
  };
}

// Server rule, on the full row. `stored` is the row before an update (null on create): a value that is not being
// changed is left alone, so an old listing can still be edited while it waits to be converted.
export function checkCategory(row, stored = null) {
  // A listing with no country yet is not International: only a country other than Jersey or the UK makes it so.
  const errors = {}, category = row.country ? categoryOf(row) : categoryOf({ ...row, country: "Jersey" }), changed = k => !stored || row[k] !== stored[k];
  if (changed("operation") || changed("country") || changed("use")) {
    if (row.operation === "business") errors.operation = "Business is no longer an operation: choose Sale";
    else if (!OPERATIONS[category].includes(row.operation))
      errors.operation = `${CATEGORY[category]} properties are for sale only`;
  }
  if ((changed("availability") || changed("operation")) && AVAILABILITIES[row.operation]
      && !AVAILABILITIES[row.operation].includes(row.availability))
    errors.availability = row.operation === "rent" ? "Choose To let or Withdrawn for a rental" : "Choose For sale, Under offer, Sold or Withdrawn for a sale";
  if (row.operation !== "rent" && row.rent != null && changed("rent")) errors.rent = "Only a rental has a rent: clear it, or choose Rent";
  if (row.operation === "rent" && row.sale_price != null && changed("sale_price")) errors.sale_price = "A rental has a rent, not a sale price";
  if (category !== "international" && row.currency && row.currency !== "GBP" && changed("currency"))
    errors.currency = "Jersey and UK properties are priced in GBP";
  if (row.premium != null && changed("premium")) errors.premium = "Premium is no longer used: leave it blank";
  if (row.operation === "rent" && row.rent_period && row.rent_period !== "month" && changed("rent_period"))
    errors.rent_period = "Rents are per month";
  return errors;
}
