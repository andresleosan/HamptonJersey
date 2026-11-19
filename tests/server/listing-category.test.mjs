import test from "node:test";
import assert from "node:assert/strict";
import { categoryOf, fieldsFor, checkCategory, chooseCategory, chooseOperation, OPERATIONS } from "../../server/listing-category.js";
import { validateListing } from "../../server/listing.js";

const home = { use: "residential", country: "Jersey", operation: "sale", availability: "for_sale", currency: "GBP" };

test("the category is Commercial, Residential, or International when the country is not Jersey or the UK", () => {
  assert.equal(categoryOf(home), "residential");
  assert.equal(categoryOf({ ...home, use: "commercial" }), "commercial");
  assert.equal(categoryOf({ ...home, country: "United Kingdom", use: "commercial" }), "commercial");
  assert.equal(categoryOf({ ...home, country: "Portugal" }), "international");
  assert.equal(categoryOf({ ...home, country: "" }), "international");
});

test("only residential can be let; commercial and international are for sale only", () => {
  assert.deepEqual(OPERATIONS.residential, ["sale", "rent"]);
  assert.deepEqual(OPERATIONS.commercial, ["sale"]);
  assert.deepEqual(OPERATIONS.international, ["sale"]);
});

test("the form shows one price field: a rent for a rental, the asking price for anything else", () => {
  assert.equal(fieldsFor({ ...home, operation: "rent" }).price, "rent");
  for (const row of [home, { ...home, use: "commercial" }, { ...home, country: "Spain" }]) assert.equal(fieldsFor(row).price, "sale_price");
});

test("the matrix: tenure only for commercial, rooms not for commercial, no parish abroad, EUR only abroad", () => {
  const c = fieldsFor({ ...home, use: "commercial" }), i = fieldsFor({ ...home, country: "Spain" }), r = fieldsFor({ ...home, operation: "rent" });
  assert.deepEqual([c.tenure, c.rooms, c.pricePerSqft, c.housing], [true, false, true, false]);
  assert.deepEqual([i.tenure, i.rooms, i.parish, i.parishRates, i.currencies], [false, true, false, false, ["GBP", "EUR"]]);
  assert.deepEqual([r.rentalTerms, r.firstTimeBuyer, r.tenure, r.currencies], [true, false, false, ["GBP"]]);
  assert.equal(fieldsFor(home).firstTimeBuyer, true);
  assert.equal(fieldsFor({ ...home, country: "United Kingdom" }).housing, false);
});

test("the server refuses a rent on a commercial property, a business operation and a premium", () => {
  assert.deepEqual(checkCategory({ ...home, use: "commercial", operation: "rent", availability: "to_let" }).operation, "Commercial properties are for sale only");
  assert.match(checkCategory({ ...home, operation: "business" }).operation, /no longer an operation/);
  assert.match(checkCategory({ ...home, country: "Spain", operation: "rent", availability: "to_let" }).operation, /International properties are for sale only/);
  assert.match(checkCategory({ ...home, rent: 1000 }).rent, /Only a rental has a rent/);
  assert.match(checkCategory({ ...home, premium: 5000 }).premium, /no longer used/);
  assert.match(checkCategory({ ...home, operation: "rent", availability: "to_let", sale_price: 1 }).sale_price, /rent, not a sale price/);
});

test("availability must fit the operation, and the currency the place", () => {
  assert.match(checkCategory({ ...home, availability: "to_let" }).availability, /For sale/);
  assert.match(checkCategory({ ...home, operation: "rent", availability: "for_sale" }).availability, /To let/);
  assert.match(checkCategory({ ...home, currency: "EUR" }).currency, /GBP/);
  assert.deepEqual(checkCategory({ ...home, country: "Spain", currency: "EUR" }), {});
  assert.deepEqual(checkCategory({ ...home, operation: "rent", availability: "withdrawn", rent: 2000, rent_period: "month" }), {});
  assert.match(checkCategory({ ...home, operation: "rent", availability: "to_let", rent_period: "year" }).rent_period, /per month/);
});

test("a stored listing that already breaks a rule can still be edited, until the rule's field changes", () => {
  const old = { ...home, use: "commercial", operation: "business", availability: "lease", rent: 900, rent_period: "year", premium: 5000 };
  assert.deepEqual(checkCategory({ ...old, title: "edited" }, old), {});
  assert.ok(checkCategory({ ...old, operation: "rent" }, old).operation);
  assert.ok(checkCategory({ ...old, premium: 6000 }, old).premium);
});

test("a property is created or updated through the same validation", () => {
  const r = validateListing({ title: "A", use: "commercial", operation: "sale", availability: "for_sale", sale_price: 250000, currency: "GBP" });
  assert.ok(r.value);
  assert.deepEqual(checkCategory(r.value), {});
});

test("choosing a category keeps the operation and availability valid", () => {
  const rental = { ...home, operation: "rent", availability: "to_let" };
  const commercial = chooseCategory(rental, "commercial");
  assert.deepEqual([commercial.use, commercial.operation, commercial.availability], ["commercial", "sale", "for_sale"]);
  const abroad = chooseCategory(rental, "international");
  assert.deepEqual([abroad.country, abroad.operation, categoryOf(abroad)], ["", "sale", "international"]);
  assert.equal(chooseCategory({ ...abroad, country: "Spain" }, "residential").country, "Jersey");
  assert.equal(chooseCategory({ ...home, country: "United Kingdom" }, "commercial").country, "United Kingdom");
  assert.equal(chooseOperation(home, "rent").availability, "to_let");
  assert.equal(chooseOperation({ ...home, availability: "sold" }, "sale").availability, "sold");
  assert.equal(chooseOperation({ ...home, availability: "lease" }, "sale").availability, "lease"); // an old value is kept
});

test("a listing with no country yet is not treated as International by the server", () => {
  assert.deepEqual(checkCategory({ use: "residential", operation: "rent", availability: "to_let" }), {});
  assert.ok(checkCategory({ use: "residential", country: "Spain", operation: "rent", availability: "to_let" }).operation);
});
