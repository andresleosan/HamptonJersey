import { CRITERIA, hasAnswer, hasHouseholdPets, notApplicable, prioritiesFor, budgetLimitNote } from "./requirements.js";
// "Register your search" (spec §5) and the privacy notice. index.html imports this module only on #/apply or
// #/privacy, so the home page never downloads it. Values from the API or the visitor reach the page only through
// esc() or textContent.

const TEL = "01534 727582";
const STORE = "hampton-apply";
// Answers kept in this tab so a reload loses nothing; personal details and consents never are (DESIGN.md).
const PRIVATE = ["name", "email", "phone", "preferred_channel", "best_time", "requirements", "housing_status", "privacy",
  "marketing", "viewing_availability", "preferred_language", "household_adults", "household_children", "household_children_status", "household_children_ages"];
const STEPS = [
  { title: "What are you looking for?", fields: ["operation", "search_category", "commercial_kind"] },
  { title: "Where?", fields: ["area_answer", "parishes_wanted", "preferred_parish", "parishes_excluded", "near"] },
  { title: "Property details", fields: ["property_types", "bedrooms_min", "bedrooms_max", "bedrooms_ideal", "bathrooms_min", "commercial_use", "area_min", "area_max", "area_unit"] },
  { title: "Parking, outdoor space and pets", fields: ["parking_spaces", "outdoor", "furnished", "pets", "pets_cat",
    "pets_dog", "pets_other", "requirement_priorities"] },
  { title: "Budget and timing", fields: ["viewing_availability", "budget_max", "budget_min", "budget_stretch", "budget_max_rent", "budget_max_buy", "move_in_date",
    "lease_term_months", "buyer_position", "mortgage_aip", "commercial_purchase", "commercial_rent", "commercial_rent_period", "commercial_premium", "commercial_expenses"] },
  { title: "Living in Jersey", fields: ["housing_status", "household_adults", "household_children_status", "household_children", "household_children_ages"] },
  { title: "About you", fields: ["name", "email", "phone", "preferred_channel", "best_time", "requirements", "preferred_language",
    "privacy", "marketing"] },
];
const FIELDS = new Set(STEPS.flatMap(s => s.fields));
const ONLY = { rent: ["furnished", "lease_term_months"], buy: ["buyer_position", "mortgage_aip"] };
const CHOICES = ["operation", "furnished", "buyer_position", "mortgage_aip", "housing_status", "household_children_status", "preferred_channel", "search_category", "commercial_kind", "area_unit", "commercial_rent_period", "area_answer", "preferred_parish"];
const TEXT = ["near", "move_in_date", "name", "email", "phone", "best_time", "requirements", "commercial_use", "preferred_language"];
const LISTS = ["parishes_wanted", "parishes_excluded", "property_types", "outdoor"];
const INTS = ["bedrooms_min", "bedrooms_max", "bedrooms_ideal", "bathrooms_min", "parking_spaces", "lease_term_months",
  "household_adults", "household_children", "pets_cat", "pets_dog", "pets_other"];
const MONEY = ["budget_min", "budget_max", "budget_stretch", "budget_max_rent", "budget_max_buy", "commercial_purchase", "commercial_rent", "commercial_premium", "commercial_expenses", "area_min", "area_max"];
const HOME_ONLY = ["property_types", "bedrooms_min", "bedrooms_max", "bedrooms_ideal", "bathrooms_min", "parking_spaces", "outdoor", "furnished", "pets", "household_adults", "household_children", "household_children_status", "housing_status", "budget_min", "budget_max", "budget_stretch", "lease_term_months", "buyer_position", "mortgage_aip"];
const COMMERCIAL_ONLY = ["commercial_kind", "commercial_use", "area_min", "area_max", "area_unit", "commercial_purchase", "commercial_rent", "commercial_rent_period", "commercial_premium", "commercial_expenses"];

// "£1,500" → 1500; empty → null (never 0); anything else stays text, for the check or the server to refuse.
const number = s => {
  const t = String(s ?? "").replace(/[£,\s]/g, "");
  return t === "" ? null : Number.isFinite(Number(t)) ? Number(t) : t;
};

// answers: {name: string | string[]} as read from the form (checkbox groups are lists). Returns the API body:
// empty answers are left out, numbers are numbers, and only the operation's own fields are sent.
export function toBody(a) {
  const b = {}, skip = a.operation === "both" ? [] : ONLY[a.operation === "rent" ? "buy" : "rent"];
  const put = (k, v) => {
    if (!skip.includes(k) && !(a.search_category === "commercial" && HOME_ONLY.includes(k))
      && !(a.search_category !== "commercial" && COMMERCIAL_ONLY.includes(k))
      && v != null && v !== "" && !(Array.isArray(v) && !v.length)) b[k] = v;
  };
  put("viewing_availability", a.viewing_availability);
  CHOICES.forEach(k => put(k, a[k]));
  TEXT.forEach(k => put(k, String(a[k] ?? "").trim()));
  LISTS.forEach(k => put(k, a[k]));
  INTS.filter(k => !k.startsWith("pets_")).forEach(k => { if (!(k === "parking_spaces" && a[k] === "unknown")) put(k, number(a[k])); });
  MONEY.filter(k => !["budget_max_rent", "budget_max_buy"].includes(k)).forEach(k => put(k, number(a[k])));
  if (a.operation === "both") {
    delete b.budget_min; delete b.budget_max; delete b.budget_stretch;
    b.searches = ["rent", "buy"].map(operation => ({ operation,
      ...(a.search_category === "commercial" ? {} : { budget_max: number(a[`budget_max_${operation}`]) }) }));
  }
  const pets = a.pets ?? [];
  if (!pets.includes("unknown")) put("pets", pets.includes("none") ? [{ kind: "none" }] : pets.map(kind => ({ kind, count: number(a[`pets_${kind}`]) })));
  if (a.requirement_priorities && a.search_category !== 'commercial') {
    const p={...a.requirement_priorities, values:{...a.requirement_priorities.values}, unknown:[]};
    for (const key of Object.keys(CRITERIA)) {
      const answered=key==='budget' && b.searches ? b.searches.every(search=>hasAnswer(key,search)) : hasAnswer(key,b);
      if ((key==='parking' && a.parking_spaces==='unknown') || (key==='pets' && pets.includes('unknown'))
        || (p.values[key]==='must' && !answered)) p.unknown.push(key);
    }
    b.requirement_priorities=prioritiesFor(p,{...b, operation:a.operation});
  }
  if (a.search_category !== 'commercial' && a.household_children_status === 'known' && Array.isArray(a.household_children_ages))
    b.household_children_ages=a.household_children_ages.map(number);
  b.privacy = (a.privacy ?? []).length > 0;
  b.marketing = (a.marketing ?? []).length > 0;
  return b;
}

// Help before Continue; the server checks everything again and its errors bring the visitor back to the step.
function checkStep(i, a) {
  const e = {}, missing = (k, msg) => { if (!String(a[k] ?? "").trim()) e[k] = msg; };
  const has = k => STEPS[i].fields.includes(k);
  if (has("viewing_availability") && a.viewing_availability?.length) {
    const slots = a.viewing_availability;
    const time = v => typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
    if (slots.length > 21 || slots.some(s => !time(s.start) || !time(s.end) || s.start >= s.end)
      || slots.some((s, i) => slots.slice(i + 1).some(t => s.day === t.day && s.start < t.end && t.start < s.end)))
      e.viewing_availability = "Choose valid, non-overlapping times with an end after the start (up to 21).";
  }
  if (has("operation")) missing("operation", "Choose To Let or To Buy");
  if (has("search_category")) missing("search_category", "Choose what you are looking for");
  if (has('area_answer')) {
    if (!['selected','any','unknown'].includes(a.area_answer)) e.area_answer='Choose an area answer, or Not sure yet';
    if (a.area_answer==='selected' && !(a.parishes_wanted ?? []).length) e.parishes_wanted='Choose at least one parish';
    if (a.preferred_parish && !(a.parishes_wanted ?? []).includes(a.preferred_parish)) e.preferred_parish='Choose a preferred parish from the selected areas';
  }
  if (a.search_category !== "commercial" && has("bedrooms_min")) missing("bedrooms_min", "Choose the minimum bedrooms");
  if (a.search_category !== "commercial" && has("budget_max")) {
    if (a.operation === "both") { missing("budget_max_rent", "Enter your maximum rent"); missing("budget_max_buy", "Enter your maximum purchase price"); }
    else missing("budget_max", "Enter your maximum budget");
  }
  if (has('parking_spaces') && a.search_category !== 'commercial') {
    if (!String(a.parking_spaces ?? '').trim()) e.parking_spaces='Choose a number, None or Not sure';
    if (!(a.pets ?? []).length) e.pets='Tell us about pets, or choose Not sure';
  }
  if (has("household_children") && a.search_category !== "commercial" && a.household_children_status === "known")
    missing("household_children", "Enter the number of children, or 0 if none");
  if (has("name")) {
    missing("name", "Enter your name");
    missing("email", "Enter your email address");
    if (!e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())) e.email = "Enter a valid email address";
    missing("phone", "Enter your mobile number");
    if (!(a.privacy ?? []).length) e.privacy = "Accept the privacy notice to continue";
  }
  for (const k of STEPS[i].fields) {
    if (a.search_category === "commercial" && (HOME_ONLY.includes(k) || k.startsWith("pets_"))) continue;
    if (a.search_category !== "commercial" && COMMERCIAL_ONLY.includes(k)) continue;
    if (["budget_max_rent", "budget_max_buy"].includes(k) && a.operation !== "both") continue;
    if (["budget_min", "budget_max", "budget_stretch"].includes(k) && a.operation === "both") continue;
    if (e[k] || (a.operation !== "both" && ONLY[a.operation === "rent" ? "buy" : "rent"].includes(k))) continue;
    if (k.startsWith("pets_") && !(a.pets ?? []).includes(k.slice(5))) continue;
    if (k === "parking_spaces" && a[k] === "unknown") continue;
    const n = number(a[k]);
    if (k.startsWith("pets_") && !(Number.isInteger(n) && n >= 1 && n <= 20)) e[k] = "Enter how many, from 1 to 20";
    else if (MONEY.includes(k) && typeof n === "string") e[k] = "Enter an amount in pounds, like 1,500";
    else if (INTS.includes(k) && typeof n === "string") e[k] = "Enter a whole number";
  }
  if (has("bedrooms_max") && a.search_category !== "commercial") {
    for (const k of ["bedrooms_min", "bedrooms_max"]) {
      const n = number(a[k]);
      if (n != null && !(Number.isInteger(n) && n >= 0 && n <= 20)) e[k] = "Enter a whole number from 0 to 20";
    }
    const min = number(a.bedrooms_min), max = number(a.bedrooms_max);
    if (!e.bedrooms_min && !e.bedrooms_max && min != null && max != null && min > max)
      e.bedrooms_max = "Maximum cannot be below minimum";
  }
  if (has("area_min") && a.search_category === "commercial") {
    for (const k of ["area_min", "area_max"]) {
      const n = number(a[k]);
      if (n != null && !(typeof n === "number" && n >= 0.01 && n <= 100000000)) e[k] = "Enter an area from 0.01 to 100,000,000";
    }
    const min = number(a.area_min), max = number(a.area_max);
    if ((min != null || max != null) && !a.area_unit) e.area_unit = "Choose an area unit";
    if (!e.area_min && !e.area_max && min != null && max != null && min > max)
      e.area_max = "Maximum cannot be below minimum";
  }
  return e;
}

const $ = (s, el) => el.querySelector(s);
const ICONS = {
  rent: '<path d="M14.5 9.5a4 4 0 1 1-1.2-2.8M13.3 6.7 20 13.4v3.1h-2.6v-2.1h-2.1v-2.1h-2.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  buy: '<path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
};
const OP_NOTE = { rent: "Looking to rent", buy: "Looking to buy", both: "Explore both options", transfer: "Take over a business" };

export function renderApply(root, { esc, tsKey, tsReady }) {
  root.innerHTML = `<section class="block apply"><div class="wrap">
    <h1 class="apply-h1">Register your search</h1>
    <div class="apply-body"><p class="hint" role="status">Loading the form…</p></div></div></section>`;
  const body = $(".apply-body", root);
  fetch("/api/applicants/options").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(options => { if (document.contains(body)) wizard(body, options, { esc, tsKey, tsReady }); })
    .catch(() => {
      if (!document.contains(body)) return;
      body.innerHTML = `<div class="empty" role="alert"><p>We couldn't load the form right now. Try again, or call us on ${TEL}.</p>
        <button class="btn ghost" type="button">Try again</button></div>`;
      $("button", body).addEventListener("click", () => renderApply(root, { esc, tsKey, tsReady }));
    });
}

function wizard(body, options, { esc, tsKey, tsReady }) {
  const list = k => (Array.isArray(options?.[k]) ? options[k].filter(x => Array.isArray(x) && x.length === 2) : []);
  const err = name => `<small class="field-err" id="e-${name}" hidden></small>`;
  // "(optional)" is set apart in lighter text so the question itself reads first.
  const opt = l => l.replace(" (optional)", " <i>(optional)</i>");
  // One choice from a short scale → a segmented bar ("seg"); any number of choices, or long labels → tiles.
  const pills = (name, items, type = "radio", req = false, cls = type === "checkbox" ? " tiles" : " seg") => `<div class="opts${cls}">${items.map(([v, l]) =>
    `<label><input type="${type}" name="${name}" value="${esc(v)}"${req ? " required" : ""}><span>${esc(l)}</span></label>`).join("")}</div>`;
  const keyFor = {area_answer:'area',property_types:'type',bedrooms_min:'bedrooms',bathrooms_min:'bathrooms',parking_spaces:'parking',furnished:'furnished',budget_max:'budget',budget_max_rent:'budget',budget_max_buy:'budget',move_in_date:'move_in_date',lease_term_months:'lease_term_months',near:'near',requirements:'requirements',household_children_status:'children'};
  const must = key => `<button type="button" class="req-switch" role="switch" aria-checked="false" data-must="${key}" aria-label="${esc(CRITERIA[key][0])} must-have"${key==='budget' ? ' aria-describedby="budget-limit"' : ''}><span>Must-have</span><span class="req-track" aria-hidden="true"></span><span class="req-state" aria-hidden="true">Off</span></button>`;
  const group = (name, legend, inner, only = "") =>
    `<fieldset class="field"${only ? ` data-only="${only}"` : ""}><legend${keyFor[name] ? ' class="req-heading"' : ''}><span class="req-label">${opt(legend)}</span>${keyFor[name] ? must(keyFor[name]) : ''}</legend>${inner}${err(name)}</fieldset>`;
  const input = (name, label, attrs = "", only = "") => `<div class="field"${only ? ` data-only="${only}"` : ""}>
    <div class="req-heading"><label for="f-${name}"${label.rent ? ` data-rent="${label.rent}" data-buy="${label.buy}"` : ""}>${opt(label.rent || label)}</label>${keyFor[name] ? must(keyFor[name]) : ''}</div>
    <input id="f-${name}" name="${name}" ${attrs}>${err(name)}</div>`;
  const today = jerseyToday(), inTwoYears = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
  const count = `inputmode="numeric" autocomplete="off"`;
  const pets = list("pet_kinds").filter(([v]) => v !== "none");
  const money = (rent, buy, optional = "") => ({ rent: `${rent}, £ per month${optional}`, buy: `${buy}, £${optional}` });
  // A grey example of the expected format inside the box; amounts follow To Let or To Buy (sync).
  const eg = (rent, buy) => `placeholder="${rent}" data-ph-rent="${rent}" data-ph-buy="${buy}"`;

  const steps = [
    group("search_category", "What are you searching for?", pills("search_category", [["residential", "A home"], ["commercial", "Commercial property or a business"]]))
      + `<div data-category="commercial">${group("commercial_kind", "What are you looking for?", pills("commercial_kind", [["property", "Commercial property"], ["business", "A business"], ["both", "Both"]]))}</div>`
      + `<div class="opts cards">${[...list("operation"), ["both", "Rent and buy"], ["transfer", "Business transfer"]].map(([v, l]) => `<label${v === "transfer" ? ' data-category="commercial"' : ""}><input type="radio" name="operation" value="${esc(v)}" required>
      <span class="opt"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[v] || ""}</svg><b>${esc(l)}</b><small>${esc(OP_NOTE[v] || "")}</small></span></label>`).join("")}</div>
      ${err("operation")}`,
    group("area_answer", "Where would you consider? (required)", pills("area_answer", [["selected","Choose areas"],["any","Anywhere in Jersey"],["unknown","Not sure yet"]], "radio", true))
      + `<div data-area-selected>${group("parishes_wanted", "Parishes you'd consider", pills("parishes_wanted", list("parishes"), "checkbox"))}
        <div class="field" data-area-preferred><label for="f-preferred_parish">Preferred parish (optional)</label><select id="f-preferred_parish" name="preferred_parish"><option value="">No preference among these areas</option>${list("parishes").map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>${err("preferred_parish")}</div></div>`
      // Rarely used, so it waits behind a link; it opens by itself when it already has an answer (sync).
      + `<details class="more"><summary>Add parishes to avoid</summary>${group("parishes_excluded", "Parishes to avoid (optional)",
        pills("parishes_excluded", list("parishes"), "checkbox"))}</details>`
      + input("near", "Near somewhere in particular (optional)", `maxlength="200" placeholder="Your work, a school"`),
    `<div data-category="residential">${group("property_types", "Type of home (optional)", pills("property_types", list("property_types"), "checkbox"))
      + group("bedrooms_min", "Bedrooms, at least", pills("bedrooms_min", [[0, "Studio"], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5+"]], "radio", true))
      + group("bedrooms_max", "Bedrooms, at most (optional)", pills("bedrooms_max", [[0, "Studio"], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]], "radio"))
      + group("bedrooms_ideal", "Bedrooms, ideally (optional)", pills("bedrooms_ideal", [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5+"]], "radio"))
      + group("bathrooms_min", "Bathrooms, at least (optional)", pills("bathrooms_min", [[1, "1"], [2, "2"], [3, "3+"]], "radio"))}</div>`
      + `<div data-category="commercial">${input("commercial_use", "Intended use (optional)", 'maxlength="200"')
      + input("area_min", "Minimum area (optional)", count) + input("area_max", "Maximum area (optional)", count)
      + group("area_unit", "Area unit", pills("area_unit", [["sqm", "Square metres"], ["sqft", "Square feet"]]))}</div>`,
    `<div data-category="residential">${group("parking_spaces", "Parking spaces", pills("parking_spaces", [...list("parking"), ["unknown", "Not sure"]], "radio"))
      + group("outdoor", "Outdoor space (optional)", `<div class="req-outdoor">${list("outdoor").map(([v,l])=>`<div class="req-heading"><label><input type="checkbox" name="outdoor" value="${esc(v)}">${esc(l)}</label>${must(v)}</div>`).join('')}</div>`)
      + group("furnished", "Furnished (optional)", pills("furnished", list("furnished")), "rent")
      + group("pets", "Pets", pills("pets", [...list("pet_kinds"), ["unknown", "Not sure"]], "checkbox") + `<div class="row">${pets.map(([v, l]) =>
        `<div class="field" data-pet="${esc(v)}" hidden><label for="f-pets_${esc(v)}">How many: ${esc(l)}</label>
          <input id="f-pets_${esc(v)}" name="pets_${esc(v)}" value="1" ${count}>${err(`pets_${esc(v)}`)}</div>`).join("")}</div><p class="req-note" data-pets-mandatory hidden>Pets must be accommodated.</p>`)}</div><p data-category="commercial" class="hint">Leave unknown details blank; our team can confirm them with you.</p>`,
    `<div data-category="residential"><div data-both="no">${input("budget_max", money("Maximum rent", "Maximum price"), `${count} required ${eg("£1,300", "£550,000")}`)
      + `<div class="row">${input("budget_min", money("Minimum rent", "Minimum price", " (optional)"), `${count} ${eg("£1,000", "£400,000")}`)}
        ${input("budget_stretch", money("I can stretch to", "I can stretch to", " (optional)"), `${count} ${eg("£1,500", "£600,000")}`)}</div>`}</div>`
      + `<div data-both="yes">${input("budget_max_rent", "Maximum rent, £ per month", count)}${input("budget_max_buy", "Maximum purchase price, £", count)}</div><p id="budget-limit" class="req-note" hidden></p>`
      + input("lease_term_months", "Lease length in months (optional)", `${count} placeholder="12"`, "rent")
      + group("buyer_position", "Your position (optional)", pills("buyer_position", list("buyer_position"), "radio", false, " tiles"), "buy")
      + group("mortgage_aip", "Mortgage agreement in principle (optional)", pills("mortgage_aip", list("mortgage_aip")), "buy") + `</div>`
      + `<div data-category="commercial">${input("commercial_purchase", "Maximum purchase price, £ (optional)", count)
      + input("commercial_rent", "Maximum rent, £ (optional)", count)
      + group("commercial_rent_period", "Rent period", pills("commercial_rent_period", [["month", "Per month"], ["year", "Per year"]]))
      + input("commercial_premium", "Maximum business transfer, £ (optional)", count)
      + input("commercial_expenses", "Maximum expenses, £ (optional)", count)}</div>`
      + input("move_in_date", "When do you need it? (optional)", `type="date" min="${today}" max="${inTwoYears}"`)
      + `<div class="field"><h3>Usual viewing availability (optional)</h3><p>Realistic, flexible times in Jersey help us arrange viewings. This does not book an appointment.</p>
        <div data-viewing-slots></div>${err("viewing_availability")}<button class="btn ghost" type="button" name="viewing_availability" data-add-slot>Add time option</button></div>`,
    `<div data-category="residential"><p class="hint">It decides which homes you can rent or buy in Jersey.</p>`
      + group("housing_status", "Housing status (optional)", pills("housing_status", list("housing_status"), "radio", false, " tiles"))
      + input("household_adults", "Adults, 18 or over (optional)", `${count} placeholder="2"`)
      + group("household_children_status", "Children", pills("household_children_status", [["known", "I know how many"], ["unknown", "I don't know"], ["not_applicable", "Not applicable"]]))
      + `<div data-children-count>${input("household_children", "Number of children (enter 0 if none)", count)}<div class="children-ages" data-children-ages></div>${err("household_children_ages")}</div><p class="req-note">Children’s ages help our team understand your household. A must-have here asks us to check that the home suits your household.</p></div><p data-category="commercial" class="hint">Your search stays open until our team confirms it is resolved.</p>`,
    input("name", "Full name", `autocomplete="name" maxlength="120" required placeholder="Your name"`)
      + input("email", "Email", `type="email" autocomplete="email" maxlength="254" required placeholder="name@example.com"`)
      + input("phone", "Mobile", `type="tel" autocomplete="tel" required placeholder="07797 000000"`)
      + group("preferred_channel", "How should we contact you? (optional)", pills("preferred_channel", list("channels")))
      + input("best_time", "Best time to reach you (optional)", `maxlength="200" placeholder="Weekday mornings"`)
      + input("preferred_language", "Preferred language (optional)", `maxlength="80"`)
      + `<div class="field"><div class="req-heading"><label for="f-requirements">Anything else that matters? <i>(optional)</i></label>${must("requirements")}</div>
        <textarea id="f-requirements" name="requirements" maxlength="2000" rows="4" placeholder="A garden for the dog, close to a bus route"></textarea>${err("requirements")}</div>
      <div class="consent">
        <label><input type="checkbox" name="privacy" value="yes" required><span>I have read the
          <a href="#/privacy" target="_blank" rel="noopener noreferrer">privacy notice</a> (opens in a new tab).</span></label>${err("privacy")}
        <label><input type="checkbox" name="marketing" value="yes"><span>Send me news about homes and the Jersey market (optional). You can stop at any time.</span></label>
      </div>
      ${tsKey ? `<div class="ts"></div>` : ""}`,
  ];
  body.innerHTML = `<p class="hint">Seven short steps. Turn on Must-have for requirements that are essential for your new home.</p>
    <div class="apply-progress"><p class="num" aria-live="polite"></p><div class="pbar" aria-hidden="true"><i></i></div></div>
    <form novalidate>${steps.map((html, i) => `<fieldset class="step" hidden><legend><h2 tabindex="-1">${STEPS[i].title}</h2></legend>${html}</fieldset>`).join("")}
      <p class="form-status" role="alert"></p>
      <div class="apply-actions"><button class="apply-back" type="button">Back</button><button class="btn" type="submit">Continue</button></div>
    </form>`;

  const form = $("form", body), sets = [...form.querySelectorAll("fieldset.step")], last = sets.length - 1;
  const status = $(".form-status", form), back = $(".apply-back", form), next = $("button[type=submit]", form);
  const counter = $(".apply-progress p", body), bar = $(".pbar", body);
  const UNAVAILABLE = `Online registration is unavailable right now. Please call us on ${TEL}.`;
  const TS_FAILED = `Our anti-spam check didn't load. Please call us on ${TEL} to register, or try again later.`;
  let step = 0, widget = null, tsAsked = false, tsFailed = false, sending = false, lastAreaChoice = '', lastPreferred = '';

  const snapshot = () => {
    const a = {};
    for (const el of form.elements) {
      if (!FIELDS.has(el.name)) continue;
      if (el.type === "checkbox") { (a[el.name] ||= []); if (el.checked) a[el.name].push(el.value); }
      else if (el.type === "radio") { a[el.name] ??= ""; if (el.checked) a[el.name] = el.value; }
      else a[el.name] = el.value;
    }
    a.requirement_priorities={version:1,values:Object.fromEntries([...form.querySelectorAll('[data-must]')].map(b=>[b.dataset.must,b.getAttribute('aria-checked')==='true'?'must':'preferred'])),unknown:[]};
    a.household_children_ages=[...form.querySelectorAll('[data-child-age]')].map(el=>el.value);
    a.viewing_availability = [...form.querySelectorAll("[data-slot]")].map(row => ({ day: Number(row.querySelector("select").value),
      start: row.querySelector('[data-start]').value, end: row.querySelector('[data-end]').value }));
    return a;
  };
  const save = () => {
    const a = Object.fromEntries(Object.entries(snapshot()).filter(([k]) => !PRIVATE.includes(k)));
    if (a.requirement_priorities) delete a.requirement_priorities.values.children;
    try { sessionStorage.setItem(STORE, JSON.stringify({ step, a })); } catch { /* storage off: nothing is kept */ }
  };
  // Shows what fits the chosen operation and pets; hidden fields are not sent (toBody) and not checked.
  const sync = () => {
    const category = $("[name=search_category]:checked", form)?.value || "residential";
    const selectedOperation = $("[name=operation]:checked", form);
    if (category !== "commercial" && selectedOperation?.value === "transfer") selectedOperation.checked = false;
    const op = $("[name=operation]:checked", form)?.value;
    const childStatus = $("[name=household_children_status]:checked", form)?.value;
    $("[data-children-count]", form).hidden = childStatus !== "known";
    form.querySelectorAll("[data-category]").forEach(el => { el.hidden = el.dataset.category !== category; });
    form.querySelectorAll("[data-both]").forEach(el => { el.hidden = (el.dataset.both === "yes") !== (op === "both"); });
    form.querySelectorAll("[data-only]").forEach(el => { el.hidden = op !== "both" && el.dataset.only !== op; });
    form.querySelectorAll("[data-ph-buy]").forEach(i => { i.placeholder = op === "buy" ? i.dataset.phBuy : i.dataset.phRent; });
    form.querySelectorAll("[data-rent]").forEach(l => { l.innerHTML = opt(op === "buy" ? l.dataset.buy : l.dataset.rent); });
    const a = snapshot(), chosen = a.pets ?? [];
    const areaSelected=a.area_answer==='selected', wanted=a.parishes_wanted ?? [], preferred=$('[name=preferred_parish]',form);
    $('[data-area-selected]',form).hidden=!areaSelected && !(!a.area_answer && wanted.length);
    $('[data-area-preferred]',form).hidden=!areaSelected || (wanted.length<2 && !preferred.value);
    [...preferred.options].forEach(option=>{if(option.value){option.disabled=!wanted.includes(option.value);option.hidden=option.disabled;}});
    if(preferred.value && !wanted.includes(preferred.value))preferred.value='';
    const limit=$('#budget-limit',form), note=budgetLimitNote(a);
    limit.textContent=note; limit.hidden=!note;
    const ages=$('[data-children-ages]',form), n=childStatus==='known' ? number(a.household_children) : null;
    const size=Number.isInteger(n) && n>=0 && n<=20 ? n : 0;
    if (ages.children.length!==size) {
      const previous=[...ages.querySelectorAll('select')].map(el=>el.value);
      ages.innerHTML=Array.from({length:size},(_,i)=>`<div class="field"><label for="child-age-${i}">Child ${i+1} age</label><select id="child-age-${i}" data-child-age aria-describedby="e-household_children_ages"><option value="">To confirm</option>${Array.from({length:18},(_,n)=>`<option value="${n}">${n===0?'Under 1':n}</option>`).join('')}</select></div>`).join('');
      ages.querySelectorAll('select').forEach((el,i)=>{el.value=previous[i]??'';});
    }
    const facts={...a,pets:chosen.map(kind=>({kind}))};
    $('[data-pets-mandatory]',form).hidden=!hasHouseholdPets(facts);
    form.querySelectorAll('[data-must]').forEach(btn=>{
      btn.hidden=category==='commercial';
      btn.disabled=notApplicable(btn.dataset.must,facts);
      if (btn.disabled) btn.setAttribute('aria-checked','false');
      $('.req-state',btn).textContent=btn.getAttribute('aria-checked')==='true'?'On':'Off';
    });
    if ((a.parishes_excluded ?? []).length) $("details.more", form).open = true;
    form.querySelectorAll("[data-pet]").forEach(el => { el.hidden = !chosen.includes(el.dataset.pet); });
  };
  const slots = $("[data-viewing-slots]", form), addSlot = $("[data-add-slot]", form);
  const numberSlots = () => [...slots.children].forEach((row, i) => {
    $("legend", row).textContent = `Time option ${i + 1}`;
    $("[data-remove]", row).textContent = `Remove option ${i + 1}`;
  });
  addSlot.addEventListener("click", () => {
    if (slots.children.length >= 21) return;
    const n = slots.children.length + 1, row = document.createElement("fieldset");
    row.className = "field"; row.dataset.slot = "";
    row.innerHTML = `<legend>Time option ${n}</legend><label>Day <select>${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => `<option value="${i}"${i === 1 ? " selected" : ""}>${d}</option>`).join("")}</select></label>
      <label>From <input type="time" data-start></label><label>Until <input type="time" data-end></label><button type="button" class="btn ghost" data-remove>Remove option</button>`;
    $("[data-remove]", row).addEventListener("click", () => { row.remove(); numberSlots(); setError("viewing_availability"); addSlot.disabled = false; addSlot.focus(); });
    slots.append(row); numberSlots(); addSlot.disabled = slots.children.length >= 21; $("select", row).focus();
  });
  form.addEventListener('click',e=>{
    const btn=e.target.closest('[data-must]'); if (!btn || btn.disabled) return;
    const checked=btn.getAttribute('aria-checked')!=='true';
    form.querySelectorAll(`[data-must="${btn.dataset.must}"]`).forEach(b=>b.setAttribute('aria-checked',String(checked)));
    sync();save();
  });
  const controls = name => [...form.querySelectorAll(`[name="${name}"]`)];
  const setError = (name, msg) => {
    const slot = $(`#e-${name}`, form);
    if (slot) { slot.textContent = msg || ""; slot.hidden = !msg; }
    const targets = name === "viewing_availability" ? [...controls(name), ...form.querySelectorAll("[data-slot] select, [data-slot] input")] : name === "household_children_ages" ? [...form.querySelectorAll("[data-child-age]")] : controls(name);
    targets.forEach(c => {
      if (msg) { c.setAttribute("aria-invalid", "true"); c.setAttribute("aria-describedby", `e-${name}`); }
      else { c.removeAttribute("aria-invalid"); c.removeAttribute("aria-describedby"); }
    });
  };
  // errors: {field: message}. Returns the first one in form order, with its step, or null.
  const showErrors = (errors, clear) => {
    clear.forEach(k => setError(k));
    Object.entries(errors).forEach(([k, m]) => setError(k, String(m)));
    const i = STEPS.findIndex(s => s.fields.some(k => errors[k]));
    return i < 0 ? null : { i, first: STEPS[i].fields.find(k => errors[k]) };
  };
  const focusField = name => (name === "viewing_availability" ? $("[data-slot] select", form) ?? controls(name)[0]
    : name === "household_children_ages" ? $('[data-child-age]',form) : controls(name)[0])?.focus();

  const startTurnstile = () => {
    if (!tsKey || tsAsked) return;
    tsAsked = true;
    tsReady.then(() => { if (document.contains(form)) widget = window.turnstile.render($(".ts", form), { sitekey: tsKey }); });
    // Script blocked (content blocker, network): don't leave the visitor at a check they can't complete.
    setTimeout(() => {
      if (widget != null || !document.contains(form)) return;
      tsFailed = true;
      if (step === last) status.textContent = TS_FAILED;
    }, 6000);
  };
  const go = (i, focus = true) => {
    step = i;
    sets.forEach((s, j) => { s.hidden = j !== i; });
    counter.textContent = `Step ${i + 1} of ${sets.length}`;
    bar.style.setProperty("--step", i + 1);
    bar.style.setProperty("--total", sets.length);
    back.hidden = i === 0;
    next.textContent = i === last ? "Register my search" : "Continue";
    next.disabled = i === last && !tsKey;
    status.textContent = i !== last ? "" : !tsKey ? UNAVAILABLE : tsFailed ? TS_FAILED : "";
    if (i === last) startTurnstile();
    save();
    if (focus) $("h2", sets[i]).focus();
  };

  form.addEventListener("input", e => { if (e.target.closest("[data-slot]")) setError("viewing_availability");
    else if (FIELDS.has(e.target.name)) setError(e.target.name);
    if (e.target.name === "household_children") sync();
    if (e.target.matches("[data-child-age]")) setError("household_children_ages"); save(); });
  form.addEventListener("change", e => {
    const t = e.target;
    if (t.name === "household_children_status" && t.value !== "known") $("[name=household_children]", form).value = "";
    const preferred=$('[name=preferred_parish]',form);
    if(t.name==='area_answer'){
      if(t.value!=='selected' && (controls('parishes_wanted').some(x=>x.checked)||preferred.value)){
        if(!window.confirm('Changing this answer removes the selected and preferred areas. Continue?')){
          t.checked=false;const previous=controls('area_answer').find(x=>x.value===lastAreaChoice);if(previous)previous.checked=true;
          sync();save();return;
        }
        controls('parishes_wanted').forEach(x=>{x.checked=false;});preferred.value='';
      }
      lastAreaChoice=t.value;
    }
    if(t.name==='preferred_parish' && lastPreferred && lastPreferred!==t.value
      && !window.confirm('Change or remove your preferred parish?')){t.value=lastPreferred;sync();save();return;}
    if(t.name==='parishes_wanted'&&!t.checked){
      const clearsPreference=preferred.value===t.value;
      if(!window.confirm(clearsPreference ? 'Removing this area also removes your preferred parish. Continue?' : 'Remove this selected parish?')){t.checked=true;sync();save();return;}
      if(clearsPreference)preferred.value='';
    }
    // "No pets" stands alone; a parish is either wanted or avoided.
    if (t.name === "pets" && t.checked)
      controls("pets").forEach(x => { if (x !== t && (["none","unknown"].includes(t.value) || ["none","unknown"].includes(x.value))) x.checked = false; });
    const other = { parishes_wanted: "parishes_excluded", parishes_excluded: "parishes_wanted" }[t.name];
    if (other && t.checked) for(const x of controls(other)) if(x.value===t.value&&x.checked){
      const clearsPreference=other==='parishes_wanted'&&preferred.value===t.value;
      if(!window.confirm(clearsPreference ? 'Moving this parish will also clear your preferred parish. Continue?' : 'This parish is already in the other list. Move it?')){t.checked=false;sync();save();return;}
      x.checked=false;if(other==='parishes_wanted'&&preferred.value===t.value)preferred.value='';
    }
    sync(); lastPreferred=preferred.value; save();
  });
  // The link disappears once open, so the focus moves to the first parish rather than being lost.
  $("details.more summary", form).addEventListener("click", e =>
    setTimeout(() => $("input", e.target.parentElement).focus()));
  back.addEventListener("click", () => { if (step > 0 && !sending) go(step - 1); });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (sending || next.disabled) return;
    const a = snapshot(), found = showErrors(checkStep(step, a), STEPS[step].fields);
    if (found) { status.textContent = ""; return focusField(found.first); }
    if (step < last) return go(step + 1);
    const token = $('[name="cf-turnstile-response"]', form)?.value;
    if (!token) { status.textContent = "Please complete the anti-spam check above."; return; }
    sending = true; next.disabled = true; next.textContent = "Sending…"; status.textContent = "";
    let r, data;
    try {
      r = await fetch("/api/applicants", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...toBody(a), turnstile: token }) });
      data = await r.json().catch(() => ({}));
    } catch { data = null; }
    sending = false;
    if (r?.ok) {
      try { sessionStorage.removeItem(STORE); } catch { /* nothing to clear */ }
      if (widget != null) window.turnstile.remove(widget);
      body.innerHTML = `<div class="confirm" role="status" tabindex="-1"><h2></h2>
        <div class="actions"><a class="btn ghost" href="#portfolio">See our properties</a></div></div>`;
      $("h2", body).textContent = `Thank you, ${a.name.trim()}. We'll be in touch within one working day.`;
      $(".confirm", body).focus();
      return;
    }
    if (widget != null) window.turnstile.reset(widget);
    const fields = data?.fields && typeof data.fields === "object" ? data.fields : null;
    const at = fields ? showErrors(fields, [...FIELDS]) : null;
    go(at ? at.i : step, false);
    status.textContent = !data ? "We couldn't reach our server. Your answers are still here. Please try again."
      : `${fields ? "Please check the highlighted fields." : String(data.error || "Something went wrong.")} Your answers are still here.`;
    if (at) focusField(at.first);
  });

  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(STORE)); } catch { /* nothing saved */ }
  if (saved?.a && typeof saved.a === "object") for (const el of form.elements) {
    const v = saved.a[el.name];
    if (!FIELDS.has(el.name) || PRIVATE.includes(el.name) || v === undefined) continue;
    if (el.type === "checkbox") el.checked = Array.isArray(v) && v.includes(el.value);
    else if (el.type === "radio") el.checked = v === el.value;
    else if (typeof v === "string") el.value = v;
  }
  if (saved?.a?.requirement_priorities?.values) form.querySelectorAll('[data-must]').forEach(btn=>{
    if (btn.dataset.must!=='children') btn.setAttribute('aria-checked',String(saved.a.requirement_priorities.values[btn.dataset.must]==='must'));
  });
  lastAreaChoice=$('[name=area_answer]:checked',form)?.value || '';
  lastPreferred=$('[name=preferred_parish]',form).value;
  sync();
  // Opening (or starting again) puts focus on the step's heading, as each step change does (WCAG 2.4.3).
  const savedStep=Number.isInteger(saved?.step) && saved.step > 0 && saved.step <= last ? saved.step : 0;
  go(savedStep > 1 && !lastAreaChoice ? 1 : savedStep);
}

// Controller details come from Hampton's current site (Luis, 2026-10-25): it publishes no legal entity or JOIC number,
// so the notice names the business and its office. Add them here if Hampton gives them.
export function renderPrivacy(root) {
  root.innerHTML = `<section class="block"><div class="wrap legal">
    <h1>Privacy notice</h1>
    <p>This notice explains how Hampton Estates uses the personal details you give us, for example when you register
      your search or ask for a viewing, and the rights you have under the Data Protection (Jersey) Law 2018.</p>

    <h2>Who we are</h2>
    <p>Hampton Estates, 42 Bath Street, St Helier, Jersey JE2 4ST. We decide how your details are used, so we are the
      controller of your data.</p>

    <h2>What we collect</h2>
    <ul>
      <li>Your name, email address and mobile number, and how, when and in which language you prefer us to contact you.</li>
      <li>What you are looking for: renting, buying or a business transfer, areas, the kind and size of home or commercial
        property, intended use, budgets, timing, pets and anything else you tell us.</li>
      <li>Your housing status in Jersey how many adults and children would live in the home, and the children’s ages you choose to tell us.</li>
      <li>Whether you accepted this notice and whether you asked for our news, with the date.</li>
      <li>For a viewing request: the property, the day and the time you chose.</li>
      <li>If you use the chat on our website: your name, the email or mobile number you give, your messages and our
        replies, the property you were looking at and when you last had the chat open.</li>
    </ul>

    <h2>Why we use it</h2>
    <ul>
      <li>To look for properties or businesses that match your search and tell you about them.</li>
      <li>To arrange viewings and keep a record of what we have discussed with you.</li>
      <li>To answer the messages you send us through the chat on our website.</li>
      <li>To show on a property's page how many people are interested in it: a number only, from 2 people, never your
        name or details.</li>
      <li>To send you news about homes and the Jersey market, only if you ticked the box for it.</li>
    </ul>

    <h2>Our legal basis</h2>
    <p>We use your details to take the steps you ask us to take before you rent or buy a property or acquire a business, and because we have a
      legitimate interest in keeping an accurate record of our dealings with you and in showing, without naming anyone,
      how much interest a property has. We send you news only with your
      consent, which you can withdraw at any time.</p>

    <h2>Who else handles it</h2>
    <p>We do not sell your details. Our website and records are hosted by Cloudflare, which also runs the anti-spam
      check on our forms. Our systems are built and maintained for us by Optimyze. Both act
      only on our instructions. When a provider handles data outside Jersey, the law requires suitable safeguards, and
      we only use providers that give them. We pass your details to a landlord, a seller or their agent only when you
      ask us to arrange a viewing or make an offer.</p>

    <h2>How long we keep it</h2>
    <p>While any of your searches is active or awaiting our team's review, we keep your contact details and search record
      so we can continue helping you. After 11 months without activity on your record, our team reviews whether you still
      need the search. A viewing, offer or period without contact does not close it automatically.</p>
    <p>Once our team has marked all your searches as resolved, we keep your details for 12 months from the last activity
      on your record, including the closure, a registration, a recorded change, a viewing request, an offer or a conversation
      with us. An open offer also protects your record while it is being negotiated. Resolving a search does not delete it.</p>
    <p>Viewing requests have their own retention period: they are deleted 12 months after the day of the viewing.
      If you make an offer that leads to an agreed sale, we keep the sale
      record and your details for 5 years after it completes or falls through, as anti-money-laundering record-keeping
      rules require.</p>

    <h2>Web chat</h2>
    <p>A person from Hampton Estates reads and answers every message; the chat does not reply automatically. We use what
      you write only to answer you, in the chat or by contacting you. We delete a conversation 30 days after its last
      message. If you ask us to register your search or arrange a viewing, those details are kept as explained above.
      While the conversation is still open on your device, you can delete it yourself with "Delete chat"; at any time,
      you can ask us to delete it.</p>

    <h2>Email sent to the app</h2>
    <p>When you reply to an email from our app, Hampton Estates can read your reply in its staff panel. Cloudflare
      sends and receives these emails on our instructions. Email content is removed after 30 days; delivery and receipt
      records are removed after 90 days. Attachments are not saved. A minimal fingerprint of a received message is kept
      for up to 90 days so deleting a message does not let a duplicate delivery restore it. If you ask us to stop sending
      to your address, we keep a fingerprint of the address to respect that preference until you ask us to remove it.
      You can contact us to ask for deletion or to change your sending preferences.</p>

    <h2>Your rights</h2>
    <ul>
      <li>Access: ask for a copy of the details we hold about you.</li>
      <li>Rectification: have wrong or incomplete details corrected.</li>
      <li>Erasure: have your details deleted.</li>
      <li>Objection to marketing (Article 36): tell us to stop sending you news at any time, and we stop straight away.</li>
      <li>Withdrawing consent: this does not affect what we did with your consent before.</li>
    </ul>
    <p>You can also complain to the Jersey Office of the Information Commissioner at
      <a href="https://jerseyoic.org" target="_blank" rel="noopener noreferrer">jerseyoic.org</a>.</p>

    <h2>In your browser</h2>
    <p>While you fill in Register your search, your answers about the home you want are kept in that browser tab, so a
      reload does not lose them. Your name, contact details and housing status are not. They are cleared when you send
      the form or close the tab. If you start a chat, this browser keeps a random key, not your details, so you can come
      back to the conversation for 7 days. "End chat" removes it.</p>

    <h2>Contact us</h2>
    <p>To ask about your data or use any of these rights, email <a href="mailto:francopropertiesjersey@gmail.com">francopropertiesjersey@gmail.com</a>, write to us at the address
      above or call ${TEL}.</p>
  </div></section>`;
}
