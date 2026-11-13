import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {priceOperation, listingAmount} from "../../server/listing-pricing.js";
import {checkPrice, toPublic, validateListing} from "../../server/listing.js";
import {listingCriteria} from "../../admin/src/listing-completeness.js";
import {monthlyPrice} from "../../admin/src/listing-filters.js";
import {draftBody} from "../../server/listing-import.js";
const publicPrices = createRequire(import.meta.url)("../../site/lib.js");
const business = {operation:"business", use:"commercial", property_type:"Lodging House",
  tenure_type:"freehold", sale_price:1250000, rent:2000, rent_period:null, premium:90000,
  currency:"GBP", specs:"[]"};
test("freehold business uses total sale price everywhere, without requiring rent period", () => {
  assert.equal(priceOperation(business), "sale");
  assert.equal(listingAmount(business), 1250000);
  assert.deepEqual(checkPrice(business), {});
  assert.equal(monthlyPrice(business), 1250000);
  const pub = toPublic(business, []);
  assert.equal(publicPrices.priceLabel(pub), "£1,250,000");
  assert.equal(pub.rent, null);
  assert.equal(pub.rentPeriod, null);
  assert.equal("premium" in pub, false);
  assert.equal(pub.specs.some(s => s.label === "Rent"), false);
  assert.equal(listingCriteria(business, "", [], null).find(c => c.id === "price").target, "f-sale_price");
});
test("legacy premium cannot supply a missing sale price", () => {
  const row = {...business,sale_price:null};
  assert.equal(listingAmount(row), null);
  assert.equal(publicPrices.priceLabel(toPublic(row, [])), "Price not published");
  assert.equal(listingCriteria(row, "", [], null).find(c => c.id === "price").met, false);
  assert.equal("premium" in validateListing({premium:100}, {partial:true}).value, false);
});
test("commercial rentals keep rent and its period, even for freehold property", () => {
  for (const row of [{...business,operation:"rent"}, {...business,tenure_type:"leasehold"}]) {
    assert.equal(priceOperation(row), "rent");
    assert.ok(checkPrice(row).rent_period);
    for (const [rent_period,label] of [["month","£2,000 pcm"],["year","£2,000 p.a."]]) {
      const rental = {...row,rent_period};
      assert.equal(publicPrices.priceLabel(toPublic(rental, [])), label);
      assert.deepEqual(checkPrice(rental), {});
    }
  }
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
