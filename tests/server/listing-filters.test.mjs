// SPR-06 / SPR-07: the Listings screen's filter rules (admin/src/listing-filters.js).
import test from "node:test";
import assert from "node:assert/strict";
import { monthlyPrice, bedsRange, passesExtra, bedsLabel, bathsLabel, daysAgo, OPERATION_FILTER } from "../../admin/src/listing-filters.js";

const TODAY = new Date("2026-11-06T12:00:00.000Z");
const L = o => ({ operation: "sale", bedrooms: 3, sale_price: 500000, rent: null, rent_period: null, premium: null,
  updated_at: "2026-10-01T10:00:00.000Z", ...o });
const ANY = { op: "", bedsFrom: "", bedsTo: "", min: "", max: "", recent: false };
const keeps = (l, f) => passesExtra(l, { ...ANY, ...f }, TODAY);

test("operation filter uses the listing's operation", () => {
  assert.deepEqual(OPERATION_FILTER, { sale: "To Buy", rent: "To Let", business: "Business" });
  assert.equal(keeps(L(), { op: "sale" }), true);
  assert.equal(keeps(L(), { op: "rent" }), false);
  assert.equal(keeps(L({ operation: "business" }), { op: "business" }), true);
});

test("beds range is inclusive and studio is 0", () => {
  const range = { bedsFrom: "3", bedsTo: "5" };
  assert.deepEqual([2, 3, 4, 5, 6].map(n => keeps(L({ bedrooms: n }), range)), [false, true, true, true, false]);
  assert.deepEqual([1, 2, 3].map(n => keeps(L({ bedrooms: n }), { bedsFrom: "2", bedsTo: "2" })), [false, true, false]);
  assert.equal(keeps(L({ bedrooms: 0 }), { bedsFrom: "0", bedsTo: "0" }), true);
  assert.equal(keeps(L({ bedrooms: 4 }), { bedsFrom: "3" }), true, "from only = that many or more");
  assert.equal(keeps(L({ bedrooms: 4 }), { bedsTo: "3" }), false, "to only = up to that many");
});

test("unknown bedrooms leave once a bound is set", () => {
  const unit = L({ bedrooms: null });
  assert.equal(keeps(unit, {}), true);
  assert.equal(keeps(unit, { bedsFrom: "0" }), false);
  assert.equal(keeps(unit, { bedsTo: "6" }), false);
});

test("from above to raises to", () => {
  assert.deepEqual(bedsRange("5", "3"), { from: "5", to: "5" });
  assert.deepEqual(bedsRange("2", "4"), { from: "2", to: "4" });
  assert.deepEqual(bedsRange("", "3"), { from: "", to: "3" });
  assert.deepEqual(bedsRange("4", ""), { from: "4", to: "" });
});

test("rent is compared per month", () => {
  assert.equal(monthlyPrice(L({ operation: "rent", sale_price: null, rent: 2000, rent_period: "month" })), 2000);
  assert.equal(Math.round(monthlyPrice(L({ operation: "rent", sale_price: null, rent: 500, rent_period: "week" }))), 2167);
  assert.equal(monthlyPrice(L({ operation: "rent", sale_price: null, rent: 24000, rent_period: "year" })), 2000);
  assert.equal(monthlyPrice(L({ operation: "business", sale_price: null, premium: 90000 })), 90000);
  assert.equal(keeps(L({ operation: "rent", sale_price: null, rent: 500, rent_period: "week" }), { max: 2200 }), true);
  assert.equal(keeps(L({ operation: "rent", sale_price: null, rent: 500, rent_period: "week" }), { max: 2100 }), false);
  assert.equal(keeps(L(), { min: 400000, max: 600000 }), true);
  assert.equal(keeps(L(), { min: 600000 }), false);
});

test("no price leaves once min or max is set", () => {
  const ask = L({ sale_price: null });
  assert.equal(monthlyPrice(ask), null);
  assert.equal(keeps(ask, {}), true);
  assert.equal(keeps(ask, { min: 1 }), false);
  assert.equal(keeps(ask, { max: 9e9 }), false);
});

test("recent means the last 7 days", () => {
  assert.equal(keeps(L({ updated_at: "2026-11-01T12:00:00.000Z" }), { recent: true }), true);
  assert.equal(keeps(L({ updated_at: "2026-10-29T11:59:00.000Z" }), { recent: true }), false);
});

test("bedsLabel and daysAgo wording", () => {
  assert.deepEqual([0, 1, 3, null].map(bedsLabel), ["Studio", "1 bed", "3 bed", ""]);
  assert.equal(daysAgo("2026-11-06T08:00:00.000Z", TODAY), "today");
  assert.equal(daysAgo("2026-11-05T08:00:00.000Z", TODAY), "1 day ago");
  assert.equal(daysAgo("2026-10-25T08:00:00.000Z", TODAY), "12 days ago");
  assert.equal(daysAgo(null, TODAY), "—");
});

test("SPR-01: bathroom labels keep zero distinct from an unknown value", () => {
  assert.deepEqual([0, 1, 2, null, undefined].map(bathsLabel),
    ["0 baths", "1 bath", "2 baths", "", ""]);
});
