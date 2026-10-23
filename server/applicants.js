// Applicant validation and the closed lists, shared by the API, the panel (through Vite) and the website
// (GET /api/applicants/options). Pure ESM: no database, no env, no Node- or Workers-only imports.
import { EMAIL, jerseyToday } from "./viewings.js";

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
    ["standard", "Standard"], ["not_sure", "Not sure"]],
  channels: [["whatsapp", "WhatsApp"], ["call", "Phone call"], ["email", "Email"]],
  stages: [["new", "New"], ["searching", "Searching"], ["viewing", "Viewing"], ["offer", "Offer / Application"],
    ["agreed", "Agreed"], ["completed", "Completed"], ["paused", "Paused"], ["lost", "Lost"]],
  sources: [["web", "Website"], ["phone", "Phone"], ["walk_in", "Walk-in"], ["email", "Email"]],
};
const values = list => OPTIONS[list].map(([v]) => v);

// Budgets in GBP; renting is per month.
const BUDGET = { rent: [100, 50000], buy: [10000, 100000000] };

// One stored form per number: "+" and digits only. The DB CHECK only looks at the prefix, so this is the real guard.
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
export function validateApplicant(body, { publicForm }, now = new Date().toISOString()) {
  const b = body && typeof body === "object" ? body : {};
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
  const operation = values("operation").includes(b.operation) ? b.operation
    : err("operation", "Choose To Let or To Buy");
  const rent = operation !== "buy", buy = operation !== "rent"; // unknown operation: check both groups

  const [lo, hi] = BUDGET[operation] ?? [1, BUDGET.buy[1]];
  const budgetMsg = operation === "rent" ? `Enter a monthly rent from £${lo.toLocaleString("en-GB")} to £${hi.toLocaleString("en-GB")}`
    : `Enter a price from £${lo.toLocaleString("en-GB")} to £${hi.toLocaleString("en-GB")}`;
  const budget = k => num(k, lo, hi, { int: false, required: publicForm && k === "budget_max",
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
    move_in_date = realDate(b.move_in_date) && b.move_in_date >= today && b.move_in_date <= last ? b.move_in_date
      : err("move_in_date", "Choose a date between today and two years from now");
  }

  const applicant = {
    operation, source, budget_min, budget_max, budget_stretch,
    property_types: many("property_types", "property_types"),
    bedrooms_min: num("bedrooms_min", 0, 20, { required: publicForm, msg: blank(b.bedrooms_min) ? "Choose the minimum bedrooms" : undefined }),
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
