import test from "node:test";
import assert from "node:assert/strict";
import { validateListing, checkPrice, toPublic } from "../../server/listing.js";
import { makeEnv, seedListing, adminCookie, call, T0 } from "./helpers.mjs";

test("financial particulars validate, save, reload and reach the public listing", async () => {
  const env = makeEnv();
  seedListing(env, { operation: "business", premium: 50000, rent: null });
  const details = { price_per_sqft: "£25 per sq ft per year", rental_deposit: "£2,000", parish_rates: "£500 per year",
    service_charge: "£100 per month", utilities_included: "Water", available_on: "2027-02-28", rent: 12000, rent_period: "year" };
  const cookie = await adminCookie();
  const saved = await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { ...details, updated_at: T0 } });
  assert.equal(saved.status, 200);
  for (const [key, value] of Object.entries(details)) assert.equal(saved.data.listing[key], value);
  const event = JSON.parse(env.DB.raw.prepare("SELECT data FROM events WHERE entity_type='listing' AND entity_id='HE-R001' ORDER BY id DESC LIMIT 1").get().data);
  for (const key of ["price_per_sqft", "rental_deposit", "parish_rates", "service_charge", "utilities_included", "available_on"]) assert.ok(event.fields.includes(key), key);
  assert.ok(!JSON.stringify(event).includes("Water"), "free text is not copied into history");
  const loaded = await call(env, "GET", "/admin/listings/HE-R001", { cookie });
  assert.equal(loaded.data.listing.rent, 12000);
  const financial = toPublic({ ...loaded.data.listing, specs: JSON.stringify(loaded.data.listing.specs) }, []).specs.filter(x => x.group === "Financial details");
  assert.deepEqual(financial.map(x => x.label), ["Price per sq ft", "Rental deposit", "Parish rates", "Service charge", "Utilities included", "Available from", "Rent"]);
  assert.equal(financial.at(-1).value, "£12,000 per year");
  const cleared = await call(env, "PUT", "/admin/listings/HE-R001", { cookie, body: { available_on: null, rent: null, updated_at: saved.data.listing.updated_at } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.listing.available_on, null);
});

test("invalid dates and incomplete rent are rejected", () => {
  assert.ok(validateListing({ available_on: "2027-02-29" }, { partial: true }).errors.available_on);
  assert.ok(validateListing({ service_charge: "x".repeat(201) }, { partial: true }).errors.service_charge);
  assert.ok(checkPrice({ rent: 1000, currency: "GBP" }).rent_period);
});
