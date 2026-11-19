import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {priceOperation, listingAmount} from "../../server/listing-pricing.js";
import {checkPrice, toPublic, validateListing} from "../../server/listing.js";
import {checkCategory} from "../../server/listing-category.js";
import {priceText} from "../../admin/src/format.js";
import {listingCriteria} from "../../admin/src/listing-completeness.js";
import {monthlyPrice} from "../../admin/src/listing-filters.js";
import {draftBody} from "../../server/listing-import.js";
const publicPrices = createRequire(import.meta.url)("../../site/lib.js");
const business = {operation:"business", use:"commercial", property_type:"Lodging House",
  tenure_type:"freehold", sale_price:1250000, rent:2000, rent_period:null, premium:90000,
  currency:"GBP", specs:"[]"};
test("a commercial property has an asking price only: no rent and no premium", () => {
  const row = {...business, country:"Jersey", operation:"sale", rent:null, premium:null, tenure_type:"leasehold", availability:"for_sale", currency:"GBP"};
  assert.equal(listingAmount(row), 1250000);
  assert.deepEqual(checkPrice(row), {});
  assert.deepEqual(checkCategory(row), {});
  const pub = toPublic(row, []);
  assert.equal(publicPrices.priceLabel(pub), "£1,250,000");
  assert.equal(pub.premium, undefined);
  assert.equal(listingCriteria(row, "", [], null).find(c => c.id === "price").target, "f-sale_price");
  assert.equal(listingCriteria(row, "", [], null).some(c => c.id === "bedrooms"), false);
  assert.equal(listingCriteria(row, "", [], null).some(c => c.id === "tenure"), true);
  assert.ok(checkCategory({...row, rent:2000}).rent);
  assert.ok(checkCategory({...row, premium:90000}).premium);
});
test("the public price never shows a premium, even for an old business listing", () => {
  const old = {...business, premium:90000, rent_period:"year"};
  assert.doesNotMatch(publicPrices.priceLabel(toPublic(old, [])), /premium/);
  assert.equal(toPublic(old, []).premium, undefined);
  assert.doesNotMatch(priceText(old), /premium/);
});
test("legacy Freehold text works; explicit leasehold takes precedence", () => {
  assert.equal(priceOperation({...business,tenure_type:null,tenure:" Freehold "}), "sale");
  assert.equal(priceOperation({...business,tenure_type:"leasehold",tenure:"Freehold"}), "rent");
});
test("imports use the full selling price for freehold businesses", () => {
  const draft = draftBody({tenure_type:"freehold",price:{amount:1250000}}, {operation:"business"});
  assert.equal(draft.body.sale_price, 1250000);
  assert.equal(draft.body.premium, undefined);
  assert.deepEqual(draft.notes, []);
});
test("public and admin price basis agree across operations and tenures", () => {
  for (const operation of ["sale","rent","business"])
    for (const tenure_type of [null,"freehold","leasehold","share_transfer","flying_freehold"])
      assert.equal(publicPrices.priceOperation({operation,tenureType:tenure_type}), priceOperation({operation,tenure_type}));
});

test("rent labels do not invent a period in the panel or on the website", () => {
  for (const [period, suffix] of [[null, ""], ["month", " pcm"], ["year", " p.a."]]) {
    const row = {operation:"rent", rent:1200, rent_period:period, currency:"GBP"};
    assert.equal(priceText(row), `£1,200${suffix}`);
    assert.equal(publicPrices.priceLabel(toPublic({...row, specs:"[]"}, [])), `£1,200${suffix}`);
  }
});
