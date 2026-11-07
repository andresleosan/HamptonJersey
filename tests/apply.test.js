// Run: node --test tests/apply.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// site/apply.js is a browser ES module next to a type-less package.json; importing its source as a data: URL loads
// it as ESM without Node's module-type warning.
const src = fs.readFileSync(path.join(__dirname, "..", "site", "apply.js"), "utf8");

test("commercial form carries its own amounts and does not send home criteria", async () => {
  const { toBody } = await load();
  const b = toBody(answers({ search_category: "commercial", commercial_kind: "both", commercial_use: "Retail",
    area_min: "50", area_max: "100", area_unit: "sqm", commercial_rent: "12,000", commercial_rent_period: "year",
    commercial_premium: "20,000", bedrooms_min: "2" }));
  assert.equal(b.search_category, "commercial");
  assert.equal(b.commercial_rent, 12000);
  assert.equal(b.commercial_rent_period, "year");
  assert.equal(b.commercial_premium, 20000);
  assert.equal(b.bedrooms_min, undefined);
  assert.equal(toBody(answers({ search_category: "residential", commercial_use: "Retail" })).commercial_use, undefined);
});

test("both operations submit separate rent and purchase budgets", async () => {
  const { toBody } = await load();
  const b = toBody(answers({ operation: "both", budget_max_rent: "2,000", budget_max_buy: "650,000" }));
  assert.deepEqual(b.searches, [{ operation: "rent", budget_max: 2000 }, { operation: "buy", budget_max: 650000 }]);
  const commercial = toBody(answers({ search_category: "commercial", operation: "both", budget_max_rent: "2000", budget_max_buy: "650000" }));
  assert.deepEqual(commercial.searches, [{ operation: "rent" }, { operation: "buy" }]);
});
const load = () => import("data:text/javascript," + encodeURIComponent(src + "\nexport { checkStep };"));

// What the wizard reads from the form: text as strings, radios as one value or "", checkbox groups as lists.
const answers = o => ({
  operation: "rent", parishes_wanted: [], parishes_excluded: [], near: "", property_types: [], bedrooms_min: "2",
  bedrooms_ideal: "", bathrooms_min: "", parking_spaces: "", outdoor: [], furnished: "", pets: [], pets_cat: "1",
  pets_dog: "1", pets_other: "1", budget_max: "", budget_min: "", budget_stretch: "", move_in_date: "",
  lease_term_months: "", buyer_position: "", mortgage_aip: "", housing_status: "", household_adults: "",
  household_children: "", name: "", email: "", phone: "", preferred_channel: "", best_time: "", requirements: "",
  privacy: [], marketing: [], ...o,
});

test("the details step refuses reversed ranges and missing area units before continuing", async () => {
  const { checkStep } = await load();
  assert.ok(checkStep(2, answers({ search_category: "commercial", area_min: "100", area_max: "50", area_unit: "sqm" })).area_max);
  assert.ok(checkStep(2, answers({ search_category: "commercial", area_min: "50", area_unit: "" })).area_unit);
  assert.ok(checkStep(2, answers({ search_category: "commercial", area_min: "0", area_unit: "sqm" })).area_min);
  assert.ok(checkStep(2, answers({ search_category: "commercial", area_max: "100000001", area_unit: "sqft" })).area_max);
  assert.ok(checkStep(2, answers({ search_category: "residential", bedrooms_min: "4", bedrooms_max: "2" })).bedrooms_max);
  assert.ok(checkStep(2, answers({ search_category: "residential", bedrooms_min: "21" })).bedrooms_min);
  assert.deepEqual(checkStep(2, answers({ search_category: "residential", bedrooms_min: "0", bedrooms_max: "2" })), {});
});

test("empty answers are left out, never sent as 0", async () => {
  const { toBody } = await load();
  assert.deepEqual(toBody(answers({ budget_max: "£1,500" })),
    { operation: "rent", bedrooms_min: 2, budget_max: 1500, privacy: false, marketing: false });
});

test("numbers lose £, commas and spaces; parking None stays 0", async () => {
  const { toBody } = await load();
  const b = toBody(answers({ operation: "buy", budget_max: "£ 650,000", budget_min: "500000", budget_stretch: "700 000",
    parking_spaces: "0", household_adults: "2" }));
  assert.equal(b.budget_max, 650000);
  assert.equal(b.budget_min, 500000);
  assert.equal(b.budget_stretch, 700000);
  assert.equal(b.parking_spaces, 0);
  assert.equal(b.household_adults, 2);
  // Not a number: sent as typed, so the server explains what it expects.
  assert.equal(toBody(answers({ budget_max: "1.5k" })).budget_max, "1.5k");
});

test("lists stay lists and pets go as {kind, count}", async () => {
  const { toBody } = await load();
  const b = toBody(answers({ parishes_wanted: ["St Helier", "St Brelade"], property_types: ["flat"],
    pets: ["cat", "dog"], pets_cat: "2", pets_dog: "1" }));
  assert.deepEqual(b.parishes_wanted, ["St Helier", "St Brelade"]);
  assert.deepEqual(b.property_types, ["flat"]);
  assert.deepEqual(b.pets, [{ kind: "cat", count: 2 }, { kind: "dog", count: 1 }]);
  assert.deepEqual(toBody(answers({ pets: ["none"] })).pets, [{ kind: "none" }]);
});

test("only the chosen operation's own fields are sent", async () => {
  const { toBody } = await load();
  const both = { furnished: "yes", lease_term_months: "12", buyer_position: "cash", mortgage_aip: "yes" };
  const rent = toBody(answers(both)), buy = toBody(answers({ ...both, operation: "buy" }));
  assert.deepEqual([rent.furnished, rent.lease_term_months, rent.buyer_position, rent.mortgage_aip], ["yes", 12, undefined, undefined]);
  assert.deepEqual([buy.furnished, buy.lease_term_months, buy.buyer_position, buy.mortgage_aip], [undefined, undefined, "cash", "yes"]);
});

test("contact text is trimmed and consents are booleans", async () => {
  const { toBody } = await load();
  const b = toBody(answers({ name: "  Jane Le Brocq ", email: " Jane@Example.je ", phone: "07797 123456",
    privacy: ["yes"], marketing: [] }));
  assert.equal(b.name, "Jane Le Brocq");
  assert.equal(b.email, "Jane@Example.je");
  assert.equal(b.phone, "07797 123456");
  assert.equal(b.privacy, true);
  assert.equal(b.marketing, false);
});

test("viewing options prevent advancing with invalid or overlapping times and are sent as local preferences", async () => {
  const { checkStep, toBody } = await load();
  const valid = [{ day: 1, start: "09:00", end: "12:00" }, { day: 1, start: "13:00", end: "15:00" }];
  const a = answers({ budget_max: "2000", viewing_availability: valid });
  assert.deepEqual(checkStep(4, a), {});
  assert.deepEqual(toBody(a).viewing_availability, valid);
  assert.ok(checkStep(4, { ...a, viewing_availability: [{ day: 1, start: "12:00", end: "09:00" }] }).viewing_availability);
  assert.ok(checkStep(4, { ...a, viewing_availability: [valid[0], { day: 1, start: "11:00", end: "14:00" }] }).viewing_availability);
});
