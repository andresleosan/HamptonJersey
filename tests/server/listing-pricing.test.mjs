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
test("business prices keep premium and rent distinct across tenures", () => {
  for (const tenure_type of ["freehold", "leasehold"]) {
    const row = {...business, tenure_type, rent_period: "year"};
    assert.equal(listingAmount(row), 90000);
    assert.equal(monthlyPrice(row), 90000);
    assert.deepEqual(checkPrice(row), {});
    const pub = toPublic(row, []);
    assert.equal(publicPrices.priceLabel(pub), "£90,000 premium + £2,000 p.a.");
    assert.equal(pub.rent, 2000);
    assert.equal(pub.premium, 90000);
    assert.equal(listingCriteria(row, "", [], null).find(c => c.id === "price").target, "f-premium");
  }
});
test("partial business prices never fabricate a premium or combine amounts", () => {
  const rental = {...business, premium:null, rent_period:"month"};
  assert.equal(listingAmount(rental), null);
  assert.equal(monthlyPrice(rental), null);
  assert.equal(publicPrices.priceLabel(toPublic(rental, [])), "£2,000 pcm (premium not published)");
  assert.equal(publicPrices.priceLabel(toPublic({...rental,rent:null}, [])), "Price not published");
  assert.equal(publicPrices.priceLabel(toPublic({...rental,premium:90000,rent:null}, [])), "£90,000");
  assert.equal(validateListing({premium:100}, {partial:true}).value.premium, 100);
  assert.ok(checkPrice({...rental,rent_period:null}).rent_period);
  assert.ok(checkPrice({...rental,currency:null}).currency);
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
