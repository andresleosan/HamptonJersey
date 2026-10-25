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

// J4: who may rent or buy the house under the Control of Housing and Work Law, from the applicant's declared status and
// the listing's category, tenure and restriction: the tables of spec §3, the only copy of this rule. Source: gov.je,
// "Control of Housing and Work (CHW) Law: housing guidance" and "Residential and employment statuses", read 2026-10-25.
// Each cell is [result, evidence]; evidence describes the case, it never advises.
const ENTITLED = ["permanent_entitled", "entitled"];
const QUALIFIED_NEEDS = "Qualified: needs Entitled or Licensed status";
const NO_CATEGORY = ["unknown", "Housing category not given"];
const NO_TENURE = ["unknown", "Tenure not given"];
const JOINTLY = ["unknown", "Buys only jointly with an Entitled or Licensed partner"];
const MEETS = ["meets", null];
const RENT = { // by category, then status; a status not named falls to the row's "other"
  registered: { other: MEETS },
  qualified: { licensed_lease_only: ["meets", "Qualified: lease under 9 years"],
    entitled_work_only: ["fails", QUALIFIED_NEEDS], standard: ["fails", QUALIFIED_NEEDS], other: MEETS },
  none: { entitled_work_only: NO_CATEGORY, standard: NO_CATEGORY, other: MEETS },
};
const BUY = { // "court": a sale through the Royal Court (freehold, flying freehold, leasehold)
  court: { licensed_lease_only: JOINTLY, entitled_work_only: JOINTLY,
    standard: ["fails", "Standard status cannot buy through the Royal Court"], other: MEETS },
  noTenure: { licensed_lease_only: NO_TENURE, entitled_work_only: NO_TENURE, standard: NO_TENURE, other: MEETS },
  share_registered: { other: MEETS },
  share_qualified: { entitled_work_only: ["unknown", "Qualified: occupies only with an eligible partner"],
    standard: ["fails", QUALIFIED_NEEDS], other: MEETS },
  share_none: { entitled_work_only: NO_CATEGORY, standard: NO_CATEGORY, other: MEETS },
};
const WORST = { meets: 0, unknown: 1, fails: 2 };

// The restriction's cell; first-time buyer schemes need Entitled status (spec §3 «Restricciones»).
function restricted(a, l) {
  if (l.restriction === "over_55") return ["unknown", "Over 55s only: check age"];
  if (l.restriction !== "first_time_buyer") return MEETS;
  const s = a.housing_status, position = a.buyer_position;
  if (["licensed", "licensed_lease_only", "entitled_work_only", "standard"].includes(s))
    return ["fails", "First-time buyers only: needs Entitled status"];
  if (position != null && position !== "first_time") return ["fails", "First-time buyers only"];
  return ENTITLED.includes(s) && position === "first_time" ? MEETS : ["unknown", "First-time buyers only"];
}

// Worst wins; the evidence of every part with that result, joined.
function housing(a, l) {
  const s = a.housing_status;
  let base; // J5: no status said is Unknown, whatever the house
  if (s == null || s === "not_sure") base = ["unknown", "Housing status not given"];
  else {
    const row = a.operation === "rent" ? RENT[l.housing_category ?? "none"]
      : BUY[l.tenure_type == null ? "noTenure" : l.tenure_type !== "share_transfer" ? "court"
        : `share_${l.housing_category ?? "none"}`];
    base = row[s] ?? row.other;
  }
  const parts = [base, restricted(a, l)];
  const result = parts.reduce((w, [r]) => (WORST[r] > WORST[w] ? r : w), "meets");
  const evidence = parts.filter(([r, e]) => r === result && e).map(([, e]) => e).join("; ");
  return { result, evidence: evidence || null };
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

  // J4: a filter only, it scores nothing.
  const home = housing(a, l);
  add("housing", home.result, home.evidence, true);

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
