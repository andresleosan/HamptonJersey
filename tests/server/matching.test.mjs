import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, monthlyRent, MIN_SCORE, MAX_FOUND } from "../../server/matching.js";

// Rows as the database returns them: list columns are JSON text, everything not said is NULL.
const applicant = (o = {}) => ({ operation: "buy", budget_min: null, budget_max: null, budget_stretch: null,
  property_types: null, bedrooms_min: null, bedrooms_ideal: null, bathrooms_min: null, parking_spaces: null,
  outdoor: null, furnished: null, pets: null, parishes_wanted: null, parishes_excluded: null, ...o });
const listing = (o = {}) => ({ operation: "sale", sale_price: null, rent: null, rent_period: null, bedrooms: null,
  bathrooms: null, parish: null, feat_pets: null, feat_parking: null, feat_furnished: null, feat_outdoor: null,
  feat_type: null, feat_evidence: null, published: 0, archived_at: null, ...o });
const json = v => JSON.stringify(v);
const check = (r, key) => r.checks.find(c => c.key === key);

test("limits", () => {
  assert.equal(MIN_SCORE, 35);
  assert.equal(MAX_FOUND, 25);
});

test("hard filters", () => {
  const pass = (a, l) => evaluate(applicant(a), listing(l)).pass;
  assert.equal(pass({}, {}), true);
  // Operation: To Let only with rent, To Buy only with sale.
  assert.equal(pass({ operation: "rent" }, { operation: "sale" }), false);
  assert.equal(pass({ operation: "buy" }, { operation: "rent" }), false);
  assert.equal(pass({ operation: "rent" }, { operation: "rent" }), true);
  // Price over the stretch; without a stretch, over the max.
  assert.equal(pass({ budget_max: 900000, budget_stretch: 1000000 }, { sale_price: 950000 }), true);
  assert.equal(pass({ budget_max: 900000, budget_stretch: 1000000 }, { sale_price: 1000001 }), false);
  assert.equal(pass({ budget_max: 900000 }, { sale_price: 950000 }), false);
  assert.equal(pass({ budget_max: 900000 }, { sale_price: 900000 }), true);
  // Under 75 % of budget_min (B11), with or without a top.
  assert.equal(pass({ budget_min: 800000, budget_max: 1000000 }, { sale_price: 599999 }), false);
  assert.equal(pass({ budget_min: 800000, budget_max: 1000000 }, { sale_price: 600000 }), true);
  assert.equal(pass({ budget_min: 800000 }, { sale_price: 500000 }), false);
  // Bedrooms and bathrooms below the minimum.
  assert.equal(pass({ bedrooms_min: 3 }, { bedrooms: 2 }), false);
  assert.equal(pass({ bedrooms_min: 3 }, { bedrooms: 3 }), true);
  assert.equal(pass({ bathrooms_min: 2 }, { bathrooms: 1 }), false);
  assert.equal(pass({ bedrooms_min: 0 }, { bedrooms: 0 }), true);
  // An excluded parish.
  assert.equal(pass({ parishes_excluded: json(["St Helier", "Trinity"]) }, { parish: "Trinity" }), false);
  assert.equal(pass({ parishes_excluded: json(["St Helier"]) }, { parish: "Trinity" }), true);
  // A pet owner and a listing that refuses pets; no pets, or a listing that does not say, passes.
  const dog = json([{ kind: "dog", count: 1 }]);
  assert.equal(pass({ pets: dog }, { feat_pets: "no" }), false);
  assert.equal(pass({ pets: dog }, { feat_pets: "yes" }), true);
  assert.equal(pass({ pets: dog }, { feat_pets: null }), true);
  assert.equal(pass({ pets: json([{ kind: "none" }]) }, { feat_pets: "no" }), true);
  // A failed filter shows as a failed check.
  const r = evaluate(applicant({ pets: dog, bedrooms_min: 3 }),
    listing({ feat_pets: "no", bedrooms: 2, feat_evidence: json({ pets: "Sorry, no pets." }) }));
  assert.deepEqual(check(r, "pets"), { key: "pets", result: "fails", evidence: "Sorry, no pets." });
  assert.deepEqual(check(r, "bedrooms"), { key: "bedrooms", result: "fails", evidence: "2 bedrooms" });
});

test("unknown never excludes", () => {
  const a = applicant({ operation: "rent", budget_min: 1500, budget_max: 2000, bedrooms_min: 2, bathrooms_min: 1,
    parishes_excluded: json(["St Helier"]), parishes_wanted: json(["Trinity"]), pets: json([{ kind: "cat", count: 2 }]),
    parking_spaces: 1, furnished: "yes", outdoor: json(["garden"]), property_types: json(["house"]) });
  const r = evaluate(a, listing({ operation: "rent" }));
  assert.equal(r.pass, true);
  assert.deepEqual(r.checks.map(c => c.key),
    ["budget", "bedrooms", "bathrooms", "area", "housing", "pets", "parking", "furnished", "outdoor", "type"]);
  for (const c of r.checks) assert.deepEqual(c, { key: c.key, result: "unknown",
    evidence: c.key === "housing" ? "Housing status not given" : null });
  // A rent with no period is not guessed at.
  assert.equal(monthlyRent(listing({ operation: "rent", rent: 24000 })), null);
  assert.equal(evaluate(a, listing({ operation: "rent", rent: 24000 })).pass, true);
  // An applicant who asks for nothing gets only the five checks every match shows.
  const always = ["budget", "bedrooms", "bathrooms", "area", "housing"];
  assert.deepEqual(evaluate(applicant(), listing()).checks.map(c => c.key), always);
  // Parking 0 is "none", furnished "either" is no preference, and a buyer is never asked about furniture.
  assert.deepEqual(evaluate(applicant({ parking_spaces: 0, furnished: "either", pets: json([{ kind: "none" }]) }),
    listing()).checks.map(c => c.key), always);
  // Text that never says a feature is Unknown, not Fails: a garden when a balcony is asked, one space when two are.
  const feats = evaluate(applicant({ outdoor: json(["balcony"]), parking_spaces: 2 }),
    listing({ feat_outdoor: json(["garden"]), feat_parking: 1, feat_evidence: json({ outdoor: "Large garden",
      parking: "Garage" }) }));
  assert.deepEqual(check(feats, "outdoor"), { key: "outdoor", result: "unknown", evidence: "Large garden" });
  assert.deepEqual(check(feats, "parking"), { key: "parking", result: "unknown", evidence: "Garage" });
  const none = evaluate(applicant({ parking_spaces: 1 }), listing({ feat_parking: 0 }));
  assert.equal(check(none, "parking").result, "fails");
  assert.equal(none.pass, true);
});

test("yearly rent is compared per month", () => {
  const a = applicant({ operation: "rent", budget_max: 2100 });
  const yearly = listing({ operation: "rent", rent: 24000, rent_period: "year" });
  assert.equal(monthlyRent(yearly), 2000);
  assert.equal(monthlyRent(listing({ operation: "rent", rent: 1800, rent_period: "month" })), 1800);
  assert.equal(monthlyRent(listing({ sale_price: 500000 })), null);
  const r = evaluate(a, yearly);
  assert.equal(r.pass, true);
  assert.equal(check(r, "budget").result, "meets");
  assert.equal(check(r, "budget").evidence, "£2,000 a month (£24,000 a year)");
  assert.equal(evaluate(a, listing({ operation: "rent", rent: 26400, rent_period: "year" })).pass, false);
});

test("score follows the spec weights", () => {
  const a = applicant({ operation: "rent", budget_min: 1800, budget_max: 2200, bedrooms_ideal: 3,
    parishes_wanted: json(["St Helier", "St Saviour"]), outdoor: json(["garden"]), property_types: json(["house"]),
    furnished: "yes", housing_status: "entitled" });
  const best = listing({ operation: "rent", rent: 2000, rent_period: "month", bedrooms: 3, bathrooms: 2, parish: "St Helier",
    feat_outdoor: json(["garden", "terrace"]), feat_type: "house", feat_furnished: "yes", published: 1 });
  const r = evaluate(a, best);
  assert.equal(r.score, 100);
  for (const c of r.checks) assert.equal(c.result, "meets", c.key);

  // By hand: parish unknown 15 + bedrooms under the ideal 0 + price under the band 8 + outdoor unknown 5
  // + type fails 0 + furnished unknown 2.5 + published but archived 0 = 30.5 → 31.
  const mid = listing({ operation: "rent", rent: 1500, rent_period: "month", bedrooms: 2, feat_type: "flat",
    published: 1, archived_at: "2026-10-07T00:00:00.000Z" });
  const m = evaluate(a, mid);
  assert.equal(m.pass, true);
  assert.equal(m.score, 31);
  assert.equal(check(m, "type").result, "fails");

  // A parish outside the wanted ones scores 0 for area and fails; no wish at all scores the full 30.
  const other = evaluate(a, { ...best, parish: "Trinity" });
  assert.equal(other.score, 70);
  assert.equal(check(other, "area").result, "fails");
  assert.equal(evaluate({ ...a, parishes_wanted: null }, { ...best, parish: "Trinity" }).score, 100);
  // An unknown price scores 10 of 20.
  assert.equal(evaluate(a, { ...best, rent: null, rent_period: null }).score, 90);
});

test("price near the top scores higher than far below", () => {
  const a = applicant({ budget_max: 1000000 });
  const near = evaluate(a, listing({ sale_price: 950000 }));
  const far = evaluate(a, listing({ sale_price: 300000 }));
  assert.equal(near.pass && far.pass, true);
  assert.ok(near.score > far.score);
  assert.equal(near.score - far.score, 12); // 20 in the band (60 % of the top up to the top) against 8 below it
});
