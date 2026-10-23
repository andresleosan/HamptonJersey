// One applicant against one listing (spec §4, B11): the hard filters, the checks a match shows and its 0–100 score.
// The single source of truth for every matching rule: server/match-store.js only stores what evaluate() returns.
// Pure ESM and cheap: it runs ~300 times per save inside the Worker's 10 ms CPU budget and never reads listing
// text — the features come precomputed in the feat_* columns (B10). Unknown never excludes a house.

export const MIN_SCORE = 35; // a match is only stored from this score (B11)
export const MAX_FOUND = 25; // at most this many found matches per applicant, the best first (B11)

// The score table of spec §4, with price scored by band (B11). A row the applicant asked nothing about scores in
// full; outdoor, type and furnished score half when the listing does not say.
const POINTS = { area: 30, areaUnknown: 15, bedrooms: 15, priceInBand: 20, priceBelowBand: 8, priceUnknown: 10,
  outdoor: 10, type: 10, furnished: 5, published: 10 };
const BAND_START = 0.6; // without budget_min, the band starts at 60 % of the top
const PRICE_FLOOR = 0.75; // a price under 75 % of budget_min excludes the house

const LISTING_OPERATION = { rent: "rent", buy: "sale" };

const list = json => (json ? JSON.parse(json) : []);
const POUNDS = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }); // built once: toLocaleString rebuilds it
const gbp = n => `£${POUNDS.format(n)}`;
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const share = (result, full) => (result === "meets" ? full : result === "unknown" ? full / 2 : 0);

// The rent per month, or null when there is no rent or its period is not said.
export function monthlyRent(listing) {
  const { rent, rent_period: period } = listing;
  if (rent == null) return null;
  return period === "month" ? rent : period === "year" ? rent / 12 : null;
}

function budget(a, l) {
  const price = l.operation === "rent" ? monthlyRent(l) : l.sale_price;
  if (price == null) return { result: "unknown", evidence: null, points: POINTS.priceUnknown };
  const evidence = l.operation !== "rent" ? gbp(price)
    : `${gbp(price)} a month${l.rent_period === "year" ? ` (${gbp(l.rent)} a year)` : ""}`;
  const top = a.budget_stretch ?? a.budget_max;
  if (top != null && price > top) return { result: "fails", evidence: `${evidence}, over ${gbp(top)}`, points: 0 };
  if (a.budget_min != null && price < PRICE_FLOOR * a.budget_min)
    return { result: "fails", evidence: `${evidence}, under 75% of the ${gbp(a.budget_min)} minimum`, points: 0 };
  if (top == null) return { result: "unknown", evidence, points: POINTS.priceUnknown };
  const inBand = price >= (a.budget_min ?? BAND_START * top);
  return { result: "meets", evidence, points: inBand ? POINTS.priceInBand : POINTS.priceBelowBand };
}

const atLeast = (value, min, word) => (value == null ? { result: "unknown", evidence: null }
  : { result: min != null && value < min ? "fails" : "meets", evidence: count(value, word) });

// a: an applicants row, l: a listings row (JSON lists as text, as stored).
// Returns { pass, score, checks: [{ key, result: 'meets'|'fails'|'unknown', evidence }] }; pass is the hard filters
// only (MIN_SCORE is applied by the caller), and checks and score are filled even when pass is false.
export function evaluate(a, l) {
  const said = l.feat_evidence ? JSON.parse(l.feat_evidence) : {};
  const checks = [];
  let pass = LISTING_OPERATION[a.operation] === l.operation;
  let score = 0;
  const add = (key, result, evidence, hard = false) => {
    checks.push({ key, result, evidence });
    if (hard && result === "fails") pass = false;
    return result;
  };

  const price = budget(a, l);
  add("budget", price.result, price.evidence, true);
  score += price.points;

  const beds = atLeast(l.bedrooms, a.bedrooms_min, "bedroom");
  add("bedrooms", beds.result, beds.evidence, true);
  if (a.bedrooms_ideal == null || (l.bedrooms != null && l.bedrooms >= a.bedrooms_ideal)) score += POINTS.bedrooms;

  const baths = atLeast(l.bathrooms, a.bathrooms_min, "bathroom");
  add("bathrooms", baths.result, baths.evidence, true);

  const wanted = list(a.parishes_wanted);
  if (l.parish == null) {
    add("area", "unknown", null);
    score += wanted.length ? POINTS.areaUnknown : POINTS.area;
  } else {
    const excluded = list(a.parishes_excluded).includes(l.parish);
    if (excluded) pass = false;
    const ok = !excluded && (!wanted.length || wanted.includes(l.parish));
    add("area", ok ? "meets" : "fails", l.parish);
    if (ok) score += POINTS.area;
  }

  // A pet owner never gets a listing that says no pets; one that does not say passes.
  if (list(a.pets).some(p => p.kind !== "none"))
    add("pets", l.feat_pets === "yes" ? "meets" : l.feat_pets === "no" ? "fails" : "unknown", said.pets ?? null, true);

  // Parking 0 means none wanted. "Garage" reads as 1 space, so fewer spaces than asked is Unknown; only 0 fails.
  const spaces = a.parking_spaces, has = l.feat_parking;
  if (spaces > 0)
    add("parking", has == null ? "unknown" : has >= spaces ? "meets" : has === 0 ? "fails" : "unknown",
      said.parking ?? null);

  let extras = POINTS.furnished;
  if (a.operation === "rent" && (a.furnished === "yes" || a.furnished === "no"))
    extras = share(add("furnished", l.feat_furnished == null ? "unknown"
      : l.feat_furnished === a.furnished ? "meets" : "fails", said.furnished ?? null), POINTS.furnished);

  // Outdoor never fails: a garden named when a balcony is asked says nothing about the balcony.
  const outdoor = list(a.outdoor);
  extras += !outdoor.length ? POINTS.outdoor : share(add("outdoor",
    list(l.feat_outdoor).some(k => outdoor.includes(k)) ? "meets" : "unknown", said.outdoor ?? null), POINTS.outdoor);

  const types = list(a.property_types);
  extras += !types.length ? POINTS.type : share(add("type", l.feat_type == null ? "unknown"
    : types.includes(l.feat_type) ? "meets" : "fails", said.type ?? null), POINTS.type);

  score += extras;
  if (l.published === 1 && l.archived_at == null) score += POINTS.published; // on Hampton's website
  return { pass, score: Math.round(score), checks };
}
