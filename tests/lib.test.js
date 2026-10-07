// Run: node --test tests/lib.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../site/lib.js");

const P = o => ({ id: "HE-R001", title: "Home", status: "For Sale", region: "jersey", use: "residential", operation: "sale",
  currency: "GBP", salePrice: null, rent: null, rentPeriod: null, premium: null, beds: 3, ...o });
const sale = P({ salePrice: 500000 });
const rent = P({ id: "HE-R002", operation: "rent", rent: 1900, rentPeriod: "month" });
const biz = P({ id: "HE-C001", use: "commercial", operation: "business", premium: 90000 });
const eur = P({ id: "HE-I001", region: "international", currency: "EUR", salePrice: 110000 });
const uk = P({ id: "HE-R018", region: "uk", salePrice: 520000 });
const near = P({ id: "HE-R003", salePrice: 600000 });
const sold = P({ id: "HE-R004", salePrice: 550000, status: "Sold" });
const noPrice = P({ id: "HE-R005" });
const ALL = [sale, rent, biz, eur, uk, near, sold, noPrice];

test("unknown prices are labelled, never shown as zero", () => {
  assert.equal(L.priceLabel(noPrice), "Price not published");
  assert.equal(L.amount(noPrice), null);
});

test("sale, rent and business premium are separate fields", () => {
  assert.equal(L.priceLabel(rent), "£1,900 pcm");
  assert.equal(L.priceLabel(biz), "£90,000");
  assert.equal(L.priceLabel(eur), "€110,000");
  assert.equal(L.money(500000, null), "500,000", "unknown currency: no 'null ' prefix");
});

test("comparables never mix operations, uses, regions or currencies, and skip sold", () => {
  assert.deepEqual(L.comparables(sale, ALL).map(x => x.id), ["HE-R003"]);
  assert.deepEqual(L.comparables(uk, ALL), []);
  assert.deepEqual(L.comparables(noPrice, ALL), []);
});

test("max-price filter compares like with like", () => {
  const f = { region: "all", op: "sale", beds: 0, max: 600000 };
  assert.ok(!L.matches(rent, f));
  assert.ok(!L.matches(eur, f), "EUR price is not compared with a GBP limit");
  assert.ok(L.matches(sale, f));
  assert.ok(L.matches(rent, { region: "jersey", op: "rent", beds: 2, max: 2500 }));
});

test("only safe URLs reach attributes", () => {
  assert.equal(L.safeUrl("javascript:alert(1)", L.IMG_HOST), null);
  assert.equal(L.safeUrl("https://evil.example/media/x.jpg", L.IMG_HOST), null);
  assert.equal(L.safeMedia("/media/A00001"), "/media/A00001");
  assert.equal(L.safeMedia("/media/A00001?thumb"), "/media/A00001?thumb");
  for (const bad of ["https://evil/media/A1", "/media/../x", "/media/A1\" onerror=x", null, 5]) assert.equal(L.safeMedia(bad), null);
  assert.equal(L.safeHttps("http://x.com"), null);
  assert.equal(L.safeHttps("https://x.com/a"), "https://x.com/a");
  assert.equal(L.embedUrl("https://my.matterport.com/show/?m=abc"), "https://my.matterport.com/show/?m=abc");
  assert.equal(L.embedUrl("https://spec.co/properties/1"), null);   // offered as a link instead
  assert.equal(L.esc(`"><img onerror=x>`), "&quot;&gt;&lt;img onerror=x&gt;");
});

test("mortgage repayment", () => {
  assert.equal(Math.round(L.pmt(200000, 0.05, 25)), 1169);
  assert.equal(L.pmt(120000, 0, 10), 1000);
});
