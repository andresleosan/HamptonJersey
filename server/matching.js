import { hasAnswer, hasHouseholdPets, parsePriorities } from "../site/requirements.js";
import { parseFeatureEvidence, petPolicy, requirementChecks, requirementsSummary } from "./requirements.js";
import { normalizeBudgetTerms } from "./search-criteria.js";
// One applicant against one listing (spec §4, B11): the hard filters, the checks a match shows and its 0–90 preference score.
// The single source of truth for every matching rule: server/match-store.js only stores what evaluate() returns.
// Pure ESM: it reads precomputed feat_* columns rather than listing text. Unknown never excludes a house.


// The score table of spec §4, with price scored by band (B11). A row the applicant asked nothing about scores in
// full; outdoor, type and furnished score half when the listing does not say.
const POINTS = { area: 30, areaUnknown: 15, bedrooms: 15, priceInBand: 20, priceBelowBand: 8, priceUnknown: 10,
  outdoor: 10, type: 10, furnished: 5 };
const BAND_START = 0.6; // without budget_min, the band starts at 60 % of the top
const PRICE_FLOOR = 0.75; // a price under 75 % of budget_min excludes the house

const LISTING_OPERATION = { rent: "rent", buy: "sale" };

const list = json => (json ? JSON.parse(json) : []);
const POUNDS = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }); // built once: toLocaleString rebuilds it
const gbp = n => `£${POUNDS.format(n)}`;
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const share = (result, full) => (result === "meets" ? full : result === "unknown" ? full / 2 : 0);
const currencyNote = currency => (currency === "EUR" ? "Confirm whether the EUR price fits the GBP budget" : "Confirm the price currency");

// The rent per month, or null when there is no rent or its period is not said.
export function monthlyRent(listing) {
  const { rent, rent_period: period } = listing;
  if (rent == null) return null;
  return period === "month" ? rent : period === "year" ? rent / 12 : null;
}

function budget(a, l) {
  const source = l.operation === "rent" ? l.rent : l.sale_price;
  if (typeof source !== "number" || !Number.isFinite(source) || source <= 0)
    return { result: "unknown", evidence: null, points: POINTS.priceUnknown };
  const price = l.operation === "rent" ? monthlyRent(l) : source;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0)
    return { result: "unknown", evidence: null, points: POINTS.priceUnknown };
  // Applicant budgets are GBP; no exchange rate or currency is inferred.
  if (l.currency !== "GBP")
    return { result: "unknown", evidence: currencyNote(l.currency), points: POINTS.priceUnknown };
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
const NOT_ENTITLED = ["licensed", "licensed_lease_only", "entitled_work_only", "standard"]; // no first-time buyer scheme
const QUALIFIED_NEEDS = "Qualified: not open to Entitled for Work Only or Registered status";
const NO_CATEGORY = ["unknown", "Housing category not given"];
const NO_TENURE = ["unknown", "Tenure not given"];
const JOINTLY = ["unknown", "Buys only jointly with an Entitled or fully Licensed partner"];
const MEETS = ["meets", null];
const RENT = { // by category, then status; a status not named falls to the row's "other"
  registered: { other: MEETS },
  qualified: { licensed_lease_only: ["meets", "Qualified: lease under 9 years"],
    entitled_work_only: ["fails", QUALIFIED_NEEDS], standard: ["fails", QUALIFIED_NEEDS], other: MEETS },
  none: { entitled_work_only: NO_CATEGORY, standard: NO_CATEGORY, other: MEETS },
};
const BUY = { // "court": a sale through the Royal Court (freehold, flying freehold, leasehold)
  court: { licensed_lease_only: JOINTLY, entitled_work_only: JOINTLY,
    standard: ["fails", "Registered status cannot buy through the Royal Court"], other: MEETS },
  noTenure: { licensed_lease_only: NO_TENURE, entitled_work_only: NO_TENURE, standard: NO_TENURE, other: MEETS },
  share_registered: { other: MEETS },
  share_qualified: { entitled_work_only: ["unknown", "Qualified: occupies only with an eligible partner"],
    standard: ["fails", QUALIFIED_NEEDS], other: MEETS },
  share_none: { entitled_work_only: NO_CATEGORY, standard: NO_CATEGORY, other: MEETS },
};
// J5: without a status, only the category speaks (none: the restriction alone, if any).
const NO_STATUS = { registered: ["meets", "Registered: open to all"],
  qualified: ["unknown", "Qualified: housing status not given"] };
const WORST = { meets: 0, unknown: 1, fails: 2 };

// The restriction's cell; first-time buyer schemes need Entitled status (spec §3 «Restricciones»).
function restricted(a, restriction) {
  if (restriction === "over_55") return ["unknown", "Over 55s only: check age"];
  if (restriction !== "first_time_buyer") return MEETS;
  const s = a.housing_status, position = a.buyer_position;
  if (NOT_ENTITLED.includes(s)) return ["fails", "First-time buyers only: needs Entitled status"];
  // Needing to sell means owning a home already; a cash buyer or one with nothing to sell may still be a first-time buyer.
  if (position === "needs_to_sell") return ["fails", "First-time buyers only"];
  return ENTITLED.includes(s) && position === "first_time" ? MEETS : ["unknown", "First-time buyers only"];
}

// Worst wins; the evidence of every part with that result, joined. null: nothing to check (J5).
function housing(a, l) {
  const s = a.housing_status, category = l.housing_category;
  // A first-time buyer scheme concerns purchases only.
  const restriction = l.restriction === "first_time_buyer" && a.operation === "rent" ? null : l.restriction;
  let base;
  if (s == null || s === "not_sure") {
    // A Registered home is open to every status, not a purchase before the Royal Court (Registered status cannot
    // buy): there the category says nothing without the buyer's status.
    const open = category === "registered" && a.operation !== "rent" && l.tenure_type !== "share_transfer" ? null : category;
    if (open == null && restriction == null) return null;
    base = NO_STATUS[open] ?? MEETS;
  } else {
    const row = a.operation === "rent" ? RENT[category ?? "none"]
      : BUY[l.tenure_type == null ? "noTenure" : l.tenure_type !== "share_transfer" ? "court" : `share_${category ?? "none"}`];
    base = row[s] ?? row.other;
  }
  const extra = restricted(a, restriction);
  if (extra === MEETS) return { result: base[0], evidence: base[1] };
  const parts = [base, extra];
  const result = parts.reduce((w, [r]) => (WORST[r] > WORST[w] ? r : w), "meets");
  const evidence = parts.filter(([r, e]) => r === result && e).map(([, e]) => e).join("; ");
  return { result, evidence: evidence || null };
}

const atLeast = (value, min, word) => (value == null ? { result: "unknown", evidence: null }
  : { result: min != null && value < min ? "fails" : "meets", evidence: count(value, word) });

// BUS-12: a commercial or business search against a commercial listing. Its form has no priority switches, so every
// stated criterion is binding: a known shortfall makes an alternative; missing or incomparable data stays unknown.
// Each money term keeps its own limit (REG-04 terms): nothing is summed, converted or given a period it does not state.
const COMMERCIAL_OPERATION = { rent: "rent", buy: "sale", transfer: "business" };
const TERMS = { buy: ["purchase"], rent: ["rent"], transfer: ["premium", "rent"] };
const SQM_PER_SQFT = 0.09290304;
const REASON = { meets: "Meets the stated requirement", fails: "Must-have not met", unknown: "Needs confirmation" };

function commercial(a, l) {
  const operation = a.search_operation ?? a.operation;
  const wanted = list(a.parishes_wanted), excluded = list(a.parishes_excluded);
  const pass = l.use === "commercial" && COMMERCIAL_OPERATION[operation] === l.operation && !excluded.includes(l.parish)
    && l.archived_at == null && (l.availability == null || ["for_sale", "to_let", "lease"].includes(l.availability));
  const checks = [];
  const add = (key, result, evidence = null) => checks.push({ key, result, evidence, priority: "must", reason: REASON[result] });

  if (a.commercial_kind) {
    const kind = l.operation === "business" ? "business" : "property";
    add("kind", a.commercial_kind === "both" || a.commercial_kind === kind ? "meets" : "fails", kind === "business" ? "Business" : "Property");
  }
  if (a.commercial_use) add("use", "unknown", l.property_type ?? null); // free text: only the team can confirm it
  if (a.area_min != null || a.area_max != null) {
    const sqft = l.interior_area_sqft, metric = a.area_unit === "sqm", size = metric ? sqft * SQM_PER_SQFT : sqft;
    add("floor_area", sqft == null || !["sqm", "sqft"].includes(a.area_unit) ? "unknown"
      : (a.area_min != null && size < a.area_min) || (a.area_max != null && size > a.area_max) ? "fails" : "meets",
      sqft == null ? null : `${POUNDS.format(sqft)} sq ft${metric ? ` (${size.toFixed(1)} sq m)` : ""}`);
  }
  if (wanted.length || excluded.length)
    add("area", l.parish == null ? "unknown" : excluded.includes(l.parish) || (wanted.length && !wanted.includes(l.parish)) ? "fails" : "meets", l.parish);

  const { terms } = normalizeBudgetTerms({ search_category: "commercial", operation, currency: "GBP", criteria: {
    commercial_purchase: a.commercial_purchase, commercial_rent: a.commercial_rent, commercial_rent_period: a.commercial_rent_period,
    commercial_premium: a.commercial_premium, commercial_expenses: a.commercial_expenses } });
  const listed = { purchase: l.sale_price, rent: l.rent, premium: l.premium };
  for (const key of TERMS[operation] ?? []) {
    const limit = terms[`commercial_${key}`], amount = listed[key], rent = key === "rent";
    if (limit.original_value == null) continue; // no limit stated for this term
    if (typeof amount !== "number" || !(amount > 0) || (rent && !["month", "year"].includes(l.rent_period))) { add(key, "unknown"); continue; }
    if (l.currency !== "GBP") { add(key, "unknown", currencyNote(l.currency)); continue; }
    const said = `${gbp(amount)}${rent ? ` a ${l.rent_period}` : ""}`;
    if (limit.state !== "known") { add(key, "unknown", said); continue; }
    const minor = Math.round(amount * 100), monthly = limit.monthly_equivalent;
    const over = rent ? minor * monthly.denominator > monthly.numerator_minor * (l.rent_period === "year" ? 12 : 1) : minor > limit.amount_minor;
    add(key, over ? "fails" : "meets", over ? `${said}, over ${gbp(limit.original_value)}${rent ? ` a ${limit.period}` : ""}` : said);
  }
  // The search gives no period for its running costs, so they cannot be compared with any charge of the listing.
  if (terms.commercial_expenses.original_value != null)
    add("expenses", "unknown", `Up to ${gbp(terms.commercial_expenses.original_value)}, period not given`);

  const score = checks.length ? Math.round(90 * checks.filter(c => c.result === "meets").length / checks.length) : 90;
  return { pass, score, checks, ...requirementsSummary(checks, pass) };
}

// a: an applicants row, l: a listings row (JSON lists as text, as stored).
// Returns { pass, score, checks: [{ key, result: 'meets'|'fails'|'unknown', evidence }] }; pass is the hard filters
// only, and checks and score are filled even when pass is false.
export function evaluate(a, l) {
  if (a.search_category === "commercial") return commercial(a, l);
  const said = parseFeatureEvidence(l.feat_evidence);
  const priorities = parsePriorities(a.requirement_priorities);
  const checks = [];
  let pass = LISTING_OPERATION[a.operation] === l.operation;
  let score = 0;
  const add = (key, result, evidence, hard = false) => {
    checks.push({ key, result, evidence });
    if (hard && result === "fails") pass = false;
    return result;
  };

  const price = budget(a, l);
  // The declared must-have is the accepted ceiling. The minimum still affects the preference score.
  const ceiling = priorities ? budget({...a,budget_min:null},l) : price;
  add("budget", ceiling.result, ceiling.evidence, true);
  score += price.points;

  const beds = atLeast(l.bedrooms, a.bedrooms_min, "bedroom");
  if (a.bedrooms_max != null && l.bedrooms != null && l.bedrooms > a.bedrooms_max) beds.result = "fails";
  add("bedrooms", beds.result, beds.evidence, true);
  if (a.bedrooms_ideal == null || (l.bedrooms != null && l.bedrooms >= a.bedrooms_ideal)) score += POINTS.bedrooms;

  const baths = atLeast(l.bathrooms, a.bathrooms_min, "bathroom");
  add("bathrooms", baths.result, baths.evidence, true);

  const wanted = list(a.parishes_wanted), excluded = list(a.parishes_excluded);
  const unknownArea = a.area_answer === 'unknown' || (a.area_answer == null && !wanted.length);
  if (l.parish == null) {
    add("area", a.area_answer === 'any' && !excluded.length ? 'meets' : 'unknown', null);
    score += wanted.length || a.area_answer === 'unknown' ? POINTS.areaUnknown : POINTS.area;
  } else {
    const veto = excluded.includes(l.parish);
    if (veto) pass = false;
    const result = veto ? 'fails' : unknownArea ? 'unknown' : !wanted.length || wanted.includes(l.parish) ? 'meets' : 'fails';
    add("area", result, l.parish);
    if (result === 'meets') score += POINTS.area;
    else if (result === 'unknown') score += a.area_answer === 'unknown' ? POINTS.areaUnknown : POINTS.area;
  }

  // J4: a filter only, it scores nothing.
  const home = housing(a, l);
  if (home) add("housing", home.result, home.evidence, true);

  // Exclude only an unequivocal refusal; missing or contradictory older evidence stays unknown.
  if (hasAnswer("pets",a) && hasHouseholdPets(a)) {
    const policy = petPolicy(l,said);
    add("pets", policy === "yes" ? "meets" : policy === "no" ? "fails" : "unknown", said.pets ?? null, true);
  }

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
  if (priorities) {
    pass = LISTING_OPERATION[a.operation] === l.operation && home?.result !== 'fails'
      && !list(a.parishes_excluded).includes(l.parish) && l.archived_at == null
      && (l.availability == null || ['for_sale','to_let','lease'].includes(l.availability));
    const current = requirementChecks(a,l,checks);
    if (hasHouseholdPets(a) && current.some(c => c.key === 'pets' && c.result === 'fails')) pass = false;
    return { pass, score: Math.round(score), checks:current, ...requirementsSummary(current,pass) };
  }
  return { pass, score: Math.round(score), checks, ...requirementsSummary(checks,pass,true) };
}
