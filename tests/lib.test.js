// Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../site/lib.js");
const PROPS = require("../site/data/properties.json");
const byId = id => PROPS.find(p => p.id === id);

test("Pathfield Road is London (UK), not Jersey", () => {
  assert.equal(byId("91c754ff").region, "uk");
});

test("unknown prices stay null, never zero; known prices carry a currency", () => {
  for (const p of PROPS) {
    for (const k of ["salePrice", "rent", "premium"]) assert.notEqual(p[k], 0, `${p.id}.${k}`);
    if (L.amount(p) != null) assert.ok(["GBP", "EUR"].includes(p.currency), p.id);
  }
  assert.equal(L.priceLabel(byId("8eb8ffab")), "Price not published");
});

test("sale, rent and business premium are separate fields", () => {
  const rent = byId("d5967950");
  assert.deepEqual([rent.operation, rent.rent, rent.rentPeriod, rent.salePrice], ["rent", 1900, "month", null]);
  assert.equal(L.priceLabel(rent), "£1,900 pcm");
  const biz = byId("cc99defd");
  assert.deepEqual([biz.operation, biz.premium, biz.salePrice], ["business", 90000, null]);
  const madeira = byId("c320d961");
  assert.deepEqual([madeira.currency, madeira.salePrice], ["EUR", 110000]);
  assert.match(madeira.priceText, /£99,999/); // original text kept, no conversion invented
});

test("comparables never mix operations, uses, regions or currencies", () => {
  const pub = PROPS.filter(p => p.public);
  for (const p of pub) {
    for (const x of L.comparables(p, pub)) {
      for (const k of ["operation", "use", "region", "currency", "rentPeriod"]) assert.equal(x[k], p[k], `${p.id} vs ${x.id}: ${k}`);
      assert.ok(!L.isSold(x));
    }
  }
  assert.deepEqual(L.comparables(byId("8eb8ffab"), pub), []); // no price, nothing to compare
  assert.deepEqual(L.comparables(byId("91c754ff"), pub), []); // only UK listing: show none rather than Jersey homes
});

test("max-price filter compares like with like", () => {
  const f = {region: "all", op: "sale", beds: 0, max: 600000};
  assert.ok(!L.matches(byId("d5967950"), f), "a £1,900 rent is not a sale under £600k");
  assert.ok(!L.matches(byId("c320d961"), f), "EUR price is not compared with a GBP limit");
  assert.ok(L.matches(byId("38b1444c"), f));
  assert.ok(L.matches(byId("d5967950"), {region: "jersey", op: "rent", beds: 2, max: 2500}));
});

test("only safe https URLs reach attributes", () => {
  assert.equal(L.safeUrl("javascript:alert(1)", L.IMG_HOST), null);
  assert.equal(L.safeUrl("http://static.wixstatic.com/media/x.jpg", L.IMG_HOST), null);
  assert.equal(L.safeUrl("https://evil.example/media/x.jpg", L.IMG_HOST), null);
  for (const p of PROPS) {
    assert.ok(L.safeUrl(p.source.url, L.SRC_HOST), p.id);
    assert.match(p.source.retrieved, /^\d{4}-\d{2}-\d{2}$/);
    if (p.public) assert.ok(L.safeUrl(p.image, L.IMG_HOST), p.id);
  }
  assert.doesNotMatch(L.safeUrl("https://static.wixstatic.com/media/x');background:url('https://evil", L.IMG_HOST), /['()]/);
  assert.equal(L.esc(`"><img onerror=x>`), "&quot;&gt;&lt;img onerror=x&gt;");
});

test("mortgage repayment", () => {
  assert.equal(Math.round(L.pmt(200000, 0.05, 25)), 1169);
  assert.equal(L.pmt(120000, 0, 10), 1000);
});
