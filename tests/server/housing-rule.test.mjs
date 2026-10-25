import test from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../../server/matching.js";

// The housing check (J4) against every cell of spec §3. Rows as the database returns them.
const applicant = (o = {}) => ({ operation: "buy", budget_min: null, budget_max: null, budget_stretch: null,
  property_types: null, bedrooms_min: null, bedrooms_ideal: null, bathrooms_min: null, parking_spaces: null,
  outdoor: null, furnished: null, pets: null, parishes_wanted: null, parishes_excluded: null, housing_status: null,
  buyer_position: null, ...o });
const listing = (o = {}) => ({ operation: "sale", sale_price: null, rent: null, rent_period: null, bedrooms: null,
  bathrooms: null, parish: null, feat_pets: null, feat_parking: null, feat_furnished: null, feat_outdoor: null,
  feat_type: null, feat_evidence: null, published: 0, archived_at: null, tenure_type: null, housing_category: null,
  restriction: null, ...o });
const housing = (a, l) => {
  const r = evaluate(applicant(a), listing(l));
  const c = r.checks.find(x => x.key === "housing");
  return { result: c.result, evidence: c.evidence, pass: r.pass, score: r.score };
};

const M = "meets", U = "unknown", F = "fails";
// The columns of the §3 tables, one status at a time: PE, ENT, LIC, LLO, EFW, STN.
const STATUSES = ["permanent_entitled", "entitled", "licensed", "licensed_lease_only", "entitled_work_only", "standard"];
const cells = (row, run) => STATUSES.forEach((s, i) => run(s, row[i]));

test("§3 rent: Registered, Qualified and no category, per status", () => {
  const RENT = { registered: [M, M, M, M, M, M], qualified: [M, M, M, M, F, F], null: [M, M, M, M, U, U] };
  for (const [category, row] of Object.entries(RENT)) cells(row, (s, want) => {
    const h = housing({ operation: "rent", housing_status: s },
      { operation: "rent", housing_category: category === "null" ? null : category });
    assert.equal(h.result, want, `${category} × ${s}`);
    assert.equal(h.pass, want !== F, `${category} × ${s}: fails is a hard filter`);
  });
});

test("§3 buy: Royal Court tenures, unknown tenure and share transfer, per status", () => {
  const COURT = [M, M, M, U, U, F], NO_TENURE = [M, M, M, U, U, U];
  const BUY = [
    // A Royal Court sale does not depend on the category.
    ...["freehold", "flying_freehold", "leasehold"].flatMap(t =>
      [null, "qualified", "registered"].map(c => [t, c, COURT])),
    ...[null, "qualified", "registered"].map(c => [null, c, NO_TENURE]),
    ["share_transfer", "registered", [M, M, M, M, M, M]],
    ["share_transfer", "qualified", [M, M, M, M, U, F]],
    ["share_transfer", null, [M, M, M, M, U, U]],
  ];
  for (const [tenure, category, row] of BUY) cells(row, (s, want) => {
    const h = housing({ housing_status: s }, { tenure_type: tenure, housing_category: category });
    assert.equal(h.result, want, `${tenure} · ${category} × ${s}`);
    assert.equal(h.pass, want !== F, `${tenure} · ${category} × ${s}: fails is a hard filter`);
  });
});

test("§3 evidence: short, says the case, no advice", () => {
  const rent = (s, category) => housing({ operation: "rent", housing_status: s }, { operation: "rent", housing_category: category });
  assert.deepEqual([rent("licensed_lease_only", "qualified").evidence, rent("standard", "qualified").evidence,
    rent("entitled_work_only", null).evidence, rent("entitled", "qualified").evidence],
  ["Qualified: lease under 9 years", "Qualified: needs Entitled or Licensed status", "Housing category not given", null]);
  const buy = (s, tenure, category = null) => housing({ housing_status: s }, { tenure_type: tenure, housing_category: category }).evidence;
  assert.equal(buy("licensed_lease_only", "freehold"), "Buys only jointly with an Entitled or Licensed partner");
  assert.equal(buy("standard", "flying_freehold"), "Standard status cannot buy through the Royal Court");
  assert.equal(buy("standard", null), "Tenure not given");
  assert.equal(buy("entitled_work_only", "share_transfer", "qualified"), "Qualified: occupies only with an eligible partner");
  assert.equal(buy("standard", "share_transfer", "qualified"), "Qualified: needs Entitled or Licensed status");
  assert.equal(buy("standard", "share_transfer"), "Housing category not given");
});

test("J5: an applicant without a status is Unknown, whatever the house", () => {
  for (const status of [null, "not_sure"]) {
    for (const l of [{ tenure_type: "share_transfer", housing_category: "registered" }, { tenure_type: "freehold" }, {}]) {
      const h = housing({ housing_status: status }, l);
      assert.deepEqual([h.result, h.evidence, h.pass], [U, "Housing status not given", true], `${status} · ${JSON.stringify(l)}`);
    }
    for (const category of ["registered", "qualified", null])
      assert.deepEqual(housing({ operation: "rent", housing_status: status }, { operation: "rent", housing_category: category })
        .result, U);
  }
});

test("§3 restriction first-time buyers: Entitled status and a first-time buyer", () => {
  const ftb = (s, position) => housing({ housing_status: s, buyer_position: position },
    { tenure_type: "share_transfer", housing_category: "registered", restriction: "first_time_buyer" });
  // Assisted purchase needs Entitled: these fail whatever their position.
  for (const s of ["licensed", "licensed_lease_only", "entitled_work_only", "standard"])
    for (const position of [null, "first_time", "cash"])
      assert.deepEqual([ftb(s, position).result, ftb(s, position).evidence], [F, "First-time buyers only: needs Entitled status"],
        `${s} · ${position}`);
  // A known position other than first time fails, with or without a status (J5's exception).
  for (const s of ["permanent_entitled", "entitled", null, "not_sure"])
    for (const position of ["nothing_to_sell", "needs_to_sell", "cash"])
      assert.equal(ftb(s, position).result, F, `${s} · ${position}`);
  assert.equal(ftb("entitled", "cash").evidence, "First-time buyers only");
  for (const s of ["permanent_entitled", "entitled"]) assert.equal(ftb(s, "first_time").result, M, s);
  // Review focus 2: Entitled with no position said is Unknown, not Fails.
  assert.deepEqual([ftb("entitled", null).result, ftb("entitled", null).evidence, ftb("entitled", null).pass],
    [U, "First-time buyers only", true]);
  assert.equal(ftb("permanent_entitled", null).result, U);
  assert.equal(ftb(null, "first_time").result, U);
  assert.equal(ftb("not_sure", null).result, U);
});

test("§3 restriction over 55s: always Unknown, the age is not stored", () => {
  for (const s of [...STATUSES.slice(0, 3), null]) {
    const h = housing({ housing_status: s }, { tenure_type: "freehold", restriction: "over_55" });
    assert.equal(h.result, U, s);
    assert.match(h.evidence, /Over 55s only: check age/);
  }
});

test("§3 restrictions combine with the status rule: the worst wins", () => {
  const h = (s, l, position = null) => housing({ housing_status: s, buyer_position: position }, l);
  assert.deepEqual([h("permanent_entitled", { tenure_type: "freehold", restriction: "over_55" }).result,
    h("permanent_entitled", { tenure_type: "freehold", restriction: "over_55" }).evidence], [U, "Over 55s only: check age"]);
  // Fails beats Unknown, from either side, and only the failing part speaks.
  const lease = h("licensed_lease_only", { tenure_type: "freehold", restriction: "first_time_buyer" });
  assert.deepEqual([lease.result, lease.evidence], [F, "First-time buyers only: needs Entitled status"]);
  const std = h("standard", { tenure_type: "share_transfer", housing_category: "qualified", restriction: "over_55" });
  assert.deepEqual([std.result, std.evidence], [F, "Qualified: needs Entitled or Licensed status"]);
  // Two failing parts both say why; two unknown parts too.
  const both = h("standard", { tenure_type: "freehold", restriction: "first_time_buyer" });
  assert.deepEqual([both.result, both.evidence],
    [F, "Standard status cannot buy through the Royal Court; First-time buyers only: needs Entitled status"]);
  const unsure = h(null, { tenure_type: "freehold", restriction: "over_55" });
  assert.deepEqual([unsure.result, unsure.evidence], [U, "Housing status not given; Over 55s only: check age"]);
  // Meets with Meets stays Meets.
  assert.equal(h("entitled", { tenure_type: "freehold", restriction: "first_time_buyer" }, "first_time").result, M);
});

test("J4: the housing check scores nothing", () => {
  const free = housing({ housing_status: "entitled" }, { tenure_type: "freehold" });
  const unknown = housing({ housing_status: null }, { tenure_type: "freehold" });
  const fails = housing({ housing_status: "standard" }, { tenure_type: "freehold" });
  assert.equal(free.score, unknown.score);
  assert.equal(free.score, fails.score);
});
