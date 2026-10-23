// Run: node --test tests/apply.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// site/apply.js is a browser ES module next to a type-less package.json; importing its source as a data: URL loads
// it as ESM without Node's module-type warning.
const src = fs.readFileSync(path.join(__dirname, "..", "site", "apply.js"), "utf8");
const load = () => import("data:text/javascript," + encodeURIComponent(src));

// What the wizard reads from the form: text as strings, radios as one value or "", checkbox groups as lists.
const answers = o => ({
  operation: "rent", parishes_wanted: [], parishes_excluded: [], near: "", property_types: [], bedrooms_min: "2",
  bedrooms_ideal: "", bathrooms_min: "", parking_spaces: "", outdoor: [], furnished: "", pets: [], pets_cat: "1",
  pets_dog: "1", pets_other: "1", budget_max: "", budget_min: "", budget_stretch: "", move_in_date: "",
  lease_term_months: "", buyer_position: "", mortgage_aip: "", housing_status: "", household_adults: "",
  household_children: "", name: "", email: "", phone: "", preferred_channel: "", best_time: "", requirements: "",
  privacy: [], marketing: [], ...o,
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
