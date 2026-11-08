// Applicant validation and the closed lists, shared by the API, the panel (through Vite) and the website
// (GET /api/applicants/options). Pure ESM: no database, no env, no Node- or Workers-only imports.
import { EMAIL, jerseyToday, validWeeklyWindows } from "./viewings.js";
import { CRITERIA, RENT_CRITERIA, hasAnswer, notApplicable } from "../site/requirements.js";

const PARISHES = ["Grouville", "St Brelade", "St Clement", "St Helier", "St John", "St Lawrence", "St Martin",
  "St Mary", "St Ouen", "St Peter", "St Saviour", "Trinity"];

// Each list is [[value, label], …]; values match the CHECKs in migrations/0008_applicants.sql.
export const OPTIONS = {
  operation: [["rent", "To Let"], ["buy", "To Buy"]],
  parishes: PARISHES.map(p => [p, p]),
  property_types: [["flat", "Flat"], ["house", "House"], ["cottage", "Cottage"], ["studio", "Studio"]],
  outdoor: [["garden", "Garden"], ["terrace", "Terrace"], ["balcony", "Balcony"]],
  furnished: [["yes", "Furnished"], ["no", "Unfurnished"], ["either", "Either"]],
  parking: [[0, "None"], [1, "1"], [2, "2"], [3, "3+"]],
  pet_kinds: [["none", "No pets"], ["cat", "Cat"], ["dog", "Dog"], ["other", "Other"]],
  buyer_position: [["first_time", "First-time buyer"], ["nothing_to_sell", "Nothing to sell"],
    ["needs_to_sell", "Needs to sell"], ["cash", "Cash buyer"]],
  mortgage_aip: [["yes", "Yes"], ["no", "No"], ["in_progress", "In progress"]],
  housing_status: [["permanent_entitled", "Permanent Entitled"], ["entitled", "Entitled"], ["licensed", "Licensed"],
    ["licensed_lease_only", "Licensed for Lease Only"], ["entitled_work_only", "Entitled for Work Only"],
    ["standard", "Registered"], ["not_sure", "Not sure"]],
  channels: [["whatsapp", "WhatsApp"], ["call", "Phone call"], ["email", "Email"]],
  stages: [["new", "New"], ["searching", "Searching"], ["viewing", "Viewing"], ["offer", "Offer / Application"],
    ["agreed", "Agreed"], ["completed", "Completed"], ["paused", "Paused"], ["lost", "Lost"]],
  sources: [["web", "Website"], ["phone", "Phone"], ["walk_in", "Walk-in"], ["email", "Email"]],
};

// Matching lists for the panel, kept out of OPTIONS (which the website reads from GET /api/applicants/options).
// B13: the applicant's work queue, in precedence order; each label is also its value (GET /admin/applicants?queue=).
export const QUEUES = ["New properties found", "Waiting for review", "In process", "No matches"];
// Why a match is rejected (PUT /admin/matches/:id reject_reason); values match the CHECK in migrations/0009_matches.sql.
export const REJECT_REASONS = [["price", "Price"], ["area", "Area"], ["size", "Size"], ["condition", "Condition"], ["other", "Other"]];

// EST-09: commercial stages never close a search. Legacy ambiguous records await a human decision.
export const SEARCH_STATES = [["active", "Active"], ["resolved", "Resolved"], ["needs_review", "Needs review"]];
export const activeSql = alias => `${alias}.archived_at IS NULL AND ${alias}.search_state = 'active'`;
export const isActive = a => a.archived_at == null && a.search_state === "active";

const values = list => OPTIONS[list].map(([v]) => v);

// Budgets in GBP; renting is per month.
export const BUDGET = { rent: [100, 50000], buy: [10000, 100000000] };

// One stored form per number: "+" and digits only, which the DB CHECK also enforces; the length is checked only here.
export function normalizePhone(s) {
  if (typeof s !== "string") return null;
  let p = s.replace(/[\s\-.()]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  else if (p.startsWith("0")) p = "+44" + p.slice(1);
  if (p.startsWith("+440")) p = "+44" + p.slice(4); // "+44 (0)7797 …": UK numbers never keep the trunk 0
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : null;
}

const blank = v => v === undefined || v === null || (typeof v === "string" && !v.trim());
const realDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;

// body: the form as JSON. publicForm: the website wizard (true) or the panel's New applicant (false).
// now: ISO time used for the consent timestamps. Returns { value: { contact, applicant } } or { errors }.
// The routes add contact_id, last_activity_at, created_at, updated_at and updated_by; stage starts at its DEFAULT.
export function validateApplicant(body, { publicForm, savedMoveInDate = null }, now = new Date().toISOString()) {
  let b = body && typeof body === "object" ? body : {};
  if (b.search_category === "commercial") {
    const residential = new Set(["budget_min", "budget_max", "budget_stretch", "property_types", "bedrooms_min", "bedrooms_max",
      "bedrooms_ideal", "bathrooms_min", "parking_spaces", "outdoor", "furnished", "pets", "lease_term_months", "buyer_position",
      "mortgage_aip", "housing_status", "household_adults", "household_children", "household_children_status",
      "requirement_priorities", "household_children_ages"]);
    b = Object.fromEntries(Object.entries(b).filter(([k]) => !residential.has(k)));
  }
  const errors = {};
  const err = (k, msg) => { errors[k] ??= msg; return null; };

  const str = (k, max, required, missing = "This field is required") => {
    const v = b[k];
    if (blank(v)) return required ? err(k, missing) : null;
    if (typeof v !== "string") return err(k, "Enter text");
    return v.trim().length <= max ? v.trim() : err(k, `Use ${max} characters or fewer`);
  };
  const num = (k, min, max, { int = true, required = false, msg } = {}) => {
    const v = b[k];
    if (blank(v)) return required ? err(k, msg ?? "This field is required") : null;
    const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
    const ok = Number.isFinite(n) && (!int || Number.isInteger(n)) && n >= min && n <= max;
    return ok ? n : err(k, msg ?? `Enter a whole number from ${min} to ${max}`);
  };
  const one = (k, list, msg = "Choose one of the options") => {
    const v = b[k];
    if (blank(v)) return null;
    return values(list).includes(v) ? v : err(k, msg);
  };
  // JSON list of allowed values, no repeats; NULL when empty or absent.
  const many = (k, list) => {
    const v = b[k];
    if (blank(v)) return null;
    if (!Array.isArray(v) || v.some(x => !values(list).includes(x))) return err(k, "Choose from the options");
    if (new Set(v).size !== v.length) return err(k, "Each option only once");
    return v.length ? v : null;
  };

  // Contact
  const name = str("name", 120, true, "Enter your name");
  let email = null;
  if (!blank(b.email)) {
    const e = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    email = e.length <= 254 && EMAIL.test(e) ? e : err("email", "Enter a valid email address");
  }
  let phone = null;
  if (!blank(b.phone)) phone = normalizePhone(b.phone) ?? err("phone", "Enter a valid phone number");
  if (publicForm) {
    if (blank(b.email)) err("email", "Enter your email address");
    if (blank(b.phone)) err("phone", "Enter your mobile number");
    if (b.privacy !== true) err("privacy", "Accept the privacy notice to continue");
  } else if (blank(b.email) && blank(b.phone)) {
    err("email", "Enter an email address or a phone number");
    err("phone", "Enter an email address or a phone number");
  }
  const source = publicForm ? "web"
    : ["phone", "walk_in", "email"].includes(b.source) ? b.source : err("source", "Choose how they contacted us");

  // Search
  const search_category = blank(b.search_category) ? "residential"
    : ["residential", "commercial"].includes(b.search_category) ? b.search_category
      : err("search_category", "Choose residential or commercial");
  const commercial = search_category === "commercial";
  const search_operation = commercial && b.operation === "transfer" ? "transfer" : null;
  const operation = search_operation ? "rent" : values("operation").includes(b.operation) ? b.operation
    : err("operation", "Choose To Let, To Buy or a business transfer");
  const rent = operation !== "buy", buy = operation !== "rent"; // unknown operation: check both groups

  const [lo, hi] = BUDGET[operation] ?? [1, BUDGET.buy[1]];
  const budgetMsg = operation === "rent" ? `Enter a monthly rent from £${lo.toLocaleString("en-GB")} to £${hi.toLocaleString("en-GB")}`
    : `Enter a price from £${lo.toLocaleString("en-GB")} to £${hi.toLocaleString("en-GB")}`;
  const budget = k => num(k, lo, hi, { int: false, required: publicForm && !commercial && k === "budget_max",
    msg: blank(b[k]) ? "Enter your maximum budget" : budgetMsg });
  const budget_min = budget("budget_min"), budget_max = budget("budget_max"), budget_stretch = budget("budget_stretch");
  if (budget_min !== null && budget_max !== null && budget_min > budget_max)
    err("budget_min", "The minimum cannot be above the maximum");
  const below = budget_max ?? budget_min;
  if (budget_stretch !== null && below !== null && budget_stretch < below)
    err("budget_stretch", "The stretch cannot be below the maximum");

  const parishes_wanted = many("parishes_wanted", "parishes"), parishes_excluded = many("parishes_excluded", "parishes");
  if (parishes_wanted && parishes_excluded?.some(p => parishes_wanted.includes(p)))
    err("parishes_excluded", "A parish cannot be both wanted and excluded");

  let pets = null;
  if (!blank(b.pets)) {
    const kinds = values("pet_kinds");
    const ok = Array.isArray(b.pets) && b.pets.length > 0 && b.pets.every(p => p && kinds.includes(p.kind)
      && (p.kind === "none" || (Number.isInteger(p.count) && p.count >= 1 && p.count <= 20)))
      && new Set(b.pets.map(p => p.kind)).size === b.pets.length
      && (b.pets.length === 1 || !b.pets.some(p => p.kind === "none"));
    pets = ok ? b.pets.map(p => (p.kind === "none" ? { kind: "none" } : { kind: p.kind, count: p.count }))
      : err("pets", "Choose each kind of pet once, with how many");
  }

  let move_in_date = null;
  if (!blank(b.move_in_date)) {
    const today = jerseyToday(new Date(now));
    const last = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
    move_in_date = realDate(b.move_in_date) && ((!publicForm && b.move_in_date === savedMoveInDate) || (b.move_in_date >= today && b.move_in_date <= last)) ? b.move_in_date
      : err("move_in_date", "Choose a date between today and two years from now");
  }

  let viewing_availability = null;
  if (b.viewing_availability != null) {
    const slots = b.viewing_availability;
    const valid = validWeeklyWindows(slots, { allowEmpty: true });
    if (!valid) err("viewing_availability", "Choose valid, non-overlapping times with an end after the start (up to 21).");
    else if (slots.length) viewing_availability = JSON.stringify(slots.map(({ day, start, end }) => ({ day, start, end })));
  }
  const applicant = {
    viewing_availability,
    operation, search_operation, search_category, source, budget_min, budget_max, budget_stretch,
    property_types: many("property_types", "property_types"),
    bedrooms_min: num("bedrooms_min", 0, 20, { required: publicForm && !commercial, msg: blank(b.bedrooms_min) ? "Choose the minimum bedrooms" : undefined }),
    bedrooms_max: num("bedrooms_max", 0, 20),
    bedrooms_ideal: num("bedrooms_ideal", 0, 20),
    bathrooms_min: num("bathrooms_min", 0, 20),
    parking_spaces: num("parking_spaces", 0, 3),
    outdoor: many("outdoor", "outdoor"),
    furnished: rent ? one("furnished", "furnished") : null,
    pets,
    parishes_wanted, parishes_excluded,
    near: str("near", 200),
    move_in_date,
    lease_term_months: rent ? num("lease_term_months", 1, 120) : null,
    buyer_position: buy ? one("buyer_position", "buyer_position") : null,
    mortgage_aip: buy ? one("mortgage_aip", "mortgage_aip") : null,
    housing_status: one("housing_status", "housing_status"),
    household_adults: num("household_adults", 0, 20),
    household_children: num("household_children", 0, 20),
    requirements: str("requirements", 2000),
  };
  if (applicant.bedrooms_min != null && applicant.bedrooms_max != null && applicant.bedrooms_min > applicant.bedrooms_max)
    err("bedrooms_max", "Maximum cannot be below minimum");
  const choice = (k, allowed) => blank(b[k]) ? null : allowed.includes(b[k]) ? b[k] : err(k, "Choose one of the options");
  const area_min = commercial ? num("area_min", 0.01, 100000000, { int: false }) : null;
  const area_max = commercial ? num("area_max", 0.01, 100000000, { int: false }) : null;
  const area_unit = commercial ? choice("area_unit", ["sqm", "sqft"]) : null;
  if ((area_min != null || area_max != null) && !area_unit) err("area_unit", "Choose an area unit");
  if (area_min != null && area_max != null && area_min > area_max) err("area_max", "Maximum cannot be below minimum");
  const commercial_rent = commercial ? num("commercial_rent", 0.01, 100000000, { int: false }) : null;
  const commercial_rent_period = commercial ? choice("commercial_rent_period", ["month", "year"]) : null;
  if (commercial_rent != null && !commercial_rent_period) err("commercial_rent_period", "Choose a rent period");
  const children_status = choice("household_children_status", ["known", "unknown", "not_applicable"])
    ?? (applicant.household_children != null ? "known" : null);
  if (children_status === "known" && applicant.household_children == null) err("household_children", "Enter the number of children");
  if (children_status && children_status !== "known" && applicant.household_children != null)
    err("household_children", "Remove the number or choose a known number");
  Object.assign(applicant, {
    commercial_kind: commercial ? choice("commercial_kind", ["property", "business", "both"]) : null,
    commercial_use: commercial ? str("commercial_use", 200) : null,
    area_min, area_max, area_unit, commercial_rent, commercial_rent_period,
    commercial_purchase: commercial ? num("commercial_purchase", 0.01, 100000000, { int: false }) : null,
    commercial_premium: commercial ? num("commercial_premium", 0, 100000000, { int: false }) : null,
    commercial_expenses: commercial ? num("commercial_expenses", 0, 100000000, { int: false }) : null,
    household_total: applicant.household_adults != null && applicant.household_children != null
      ? applicant.household_adults + applicant.household_children : null,
    household_children_status: children_status,
    preferred_language: str("preferred_language", 80),
  });
  let priorities = null;
  if (b.requirement_priorities != null) {
    const p = b.requirement_priorities, object = x => x && typeof x === 'object' && !Array.isArray(x);
    const valid = object(p) && p.version === 1 && object(p.values) && Array.isArray(p.unknown)
      && Object.keys(p).every(k => ['version','values','unknown'].includes(k))
      && Object.entries(p.values).every(([k,v]) => Object.hasOwn(CRITERIA,k) && ['must','preferred','unknown'].includes(v))
      && p.unknown.every(k => Object.hasOwn(CRITERIA,k)) && new Set(p.unknown).size === p.unknown.length;
    if (!valid) err('requirement_priorities', 'Choose valid requirement priorities');
    else {
      const values = { ...p.values }, unknown = [...p.unknown];
      if (buy) for (const k of RENT_CRITERIA) { delete values[k]; const i = unknown.indexOf(k); if (i >= 0) unknown.splice(i,1); }
      for (const [k,v] of Object.entries(values)) {
        if (v === 'must' && (notApplicable(k,applicant) || (!hasAnswer(k,applicant) && !unknown.includes(k))))
          err('requirement_priorities', `Set ${CRITERIA[k][0].toLowerCase()} or mark it as not yet known before making it a must-have`);
      }
      if (unknown.some(k => hasAnswer(k,applicant))) err('requirement_priorities', 'A requirement cannot have both a value and an unknown answer');
      if (publicForm) for (const k of ['parking','pets'])
        if (!hasAnswer(k,applicant) && !unknown.includes(k)) err(CRITERIA[k][1][0], `Tell us about ${k}, or choose Not sure`);
      priorities = JSON.stringify({ version: 1, values, unknown });
    }
  }
  let ages = null;
  if (b.household_children_ages != null) {
    const v = b.household_children_ages;
    if (!Array.isArray(v) || !Number.isInteger(applicant.household_children)
      || v.length !== applicant.household_children || v.some(n => n !== null && (!Number.isInteger(n) || n < 0 || n > 17)))
      err('household_children_ages', 'Enter one age from Under 1 to 17, or To confirm, for each child');
    else ages = JSON.stringify(v);
  }
  Object.assign(applicant, { requirement_priorities: priorities, household_children_ages: ages, household_ages_at: ages == null ? null : now });
  for (const k of ["property_types", "outdoor", "pets", "parishes_wanted", "parishes_excluded"])
    if (applicant[k]) applicant[k] = JSON.stringify(applicant[k]);

  const contact = {
    name, email, phone,
    preferred_channel: one("preferred_channel", "channels"),
    best_time: str("best_time", 200),
    privacy_ack_at: b.privacy === true ? now : null,
    marketing_opt_in_at: b.marketing === true ? now : null,
  };
  // Where a consent came from: with no consent there is no source.
  contact.consent_source = contact.privacy_ack_at || contact.marketing_opt_in_at ? source : null;
  return Object.keys(errors).length ? { errors } : { value: { contact, applicant } };
}
