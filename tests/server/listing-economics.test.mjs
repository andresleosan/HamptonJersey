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

test('SPR-01: available dates use real civil years 0001 to 9999 and preserve unknown values', () => {
  const validate = value => validateListing({ available_on: value }, { partial: true });
  for (const value of ['0001-01-01', '2028-02-29', '9999-12-31'])
    assert.equal(validate(value).value.available_on, value);
  for (const value of [null, '', '   ']) assert.equal(validate(value).value.available_on, null);
  assert.equal('available_on' in validateListing({ title: 'Unchanged date' }, { partial: true }).value, false);
  for (const value of ['0000-01-01', '2027-02-29', '2026-02-30', '2026-13-01', '2026-11-12T00:00:00Z',
    ' 2026-11-12 ', 20261112, [], {}])
    assert.equal(validate(value).errors?.available_on, 'Enter a valid date as YYYY-MM-DD', JSON.stringify(value));
});

test('SPR-01: rejecting a year-zero date does not change the listing or write an event', async () => {
  const env = makeEnv();
  seedListing(env, { available_on: '2026-11-12', confirmed_at: T0 });
  const cookie = await adminCookie();
  const before = { ...env.DB.raw.prepare('SELECT available_on, confirmed_at, updated_at FROM listings WHERE id=?').get('HE-R001') };
  const eventCount = env.DB.raw.prepare('SELECT count(*) AS n FROM events').get().n;
  const result = await call(env, 'PUT', '/admin/listings/HE-R001', { cookie, body: { available_on: '0000-01-01', updated_at: T0 } });
  assert.equal(result.status, 400);
  assert.equal(result.data.fields.available_on, 'Enter a valid date as YYYY-MM-DD');
  assert.deepEqual({ ...env.DB.raw.prepare('SELECT available_on, confirmed_at, updated_at FROM listings WHERE id=?').get('HE-R001') }, before);
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM events').get().n, eventCount);
});
