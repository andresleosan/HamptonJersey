import test from "node:test";
import assert from "node:assert/strict";
import { validateListing, toPublic, nextId, idPrefix, regionOf } from "../../server/listing.js";
import { isPublicMedia } from "../../server/visibility.js";

const L = { id: "HE-R001", title: "Le Bernage", use: "residential", operation: "sale", availability: "for_sale",
  country: "Jersey", location: "St Saviour", sale_price: 779000, rent: null, rent_period: null, premium: null,
  currency: "GBP", price_text: "£779,000", bedrooms: 3, bathrooms: 1, property_type: "House", tenure: null,
  summary: "Semi-detached\n\nGarage ", description: "Line one\nLine two", tour_url: null, specs: "[]",
  cover_media_id: "A2", published: 1, archived_at: null };
const M = (o) => ({ id: "A1", origin: "hampton", kind: "photo", public: 1, r2_key: "k", label: "Kitchen.png", ...o });

test("create needs title, use, operation and availability", () => {
  assert.deepEqual(Object.keys(validateListing({}).errors).sort(), ["availability", "operation", "title", "use"]);
  assert.ok(validateListing({ title: "X", use: "commercial", operation: "business", availability: "for_sale" }).value);
});

test("partial update only touches the fields sent and ignores locked ones", () => {
  const r = validateListing({ title: " New ", published: 1, id: "HE-R999" }, { partial: true });
  assert.deepEqual(r.value, { title: "New" });
  assert.equal(validateListing({ title: "" }, { partial: true }).errors.title, "Obligatorio");
});

test("prices: positive or null, never zero; integers for rooms", () => {
  assert.match(validateListing({ sale_price: 0 }, { partial: true }).errors.sale_price, /mayor que 0/);
  assert.equal(validateListing({ sale_price: "" }, { partial: true }).value.sale_price, null);
  assert.ok(validateListing({ bedrooms: 2.5 }, { partial: true }).errors.bedrooms);
  assert.ok(validateListing({ currency: "USD" }, { partial: true }).errors.currency);
});

test("tour must be https and specs need label and value", () => {
  assert.ok(validateListing({ tour_url: "javascript:alert(1)" }, { partial: true }).errors.tour_url);
  assert.equal(validateListing({ tour_url: "https://my.matterport.com/show/?m=x" }, { partial: true }).value.tour_url,
    "https://my.matterport.com/show/?m=x");
  assert.ok(validateListing({ specs: [{ group: "Interior", label: "Heating", value: "" }] }, { partial: true }).errors.specs);
  assert.equal(validateListing({ specs: [{ group: "Interior", label: "Heating", value: "Oil" }] }, { partial: true }).value.specs,
    '[{"group":"Interior","label":"Heating","value":"Oil"}]');
});

test("non-object bodies are treated as empty", () => {
  assert.ok(validateListing(null).errors.title);
  assert.ok(validateListing([1, 2]).errors.title);
});

test("ids: next free number per prefix", () => {
  assert.equal(nextId(["HE-R001", "HE-R026", "HE-C017", "HE-I001"], "HE-R"), "HE-R027");
  assert.equal(nextId([], "HE-C"), "HE-C001");
  assert.equal(idPrefix("commercial", "Jersey"), "HE-C");
  assert.equal(idPrefix("residential", "Portugal"), "HE-I");
  assert.deepEqual(["Jersey", "United Kingdom", "France"].map(regionOf), ["jersey", "uk", "international"]);
});

test("external media are never public, whatever their flag says", () => {
  assert.equal(isPublicMedia(M({ origin: "external", public: 1 }), L), false);
  assert.equal(isPublicMedia(M({}), { ...L, published: 0 }), false);
  assert.equal(isPublicMedia(M({}), { ...L, archived_at: "2026-10-07" }), false);
  assert.equal(isPublicMedia(M({ r2_key: null }), L), false);
  assert.equal(isPublicMedia(M({ origin: "upload" }), L), true);
});

test("toPublic keeps the shape index.html expects", () => {
  const media = [M({ id: "A1" }), M({ id: "A2", label: null }), M({ id: "A3", origin: "external", public: 0 }),
    M({ id: "A4", kind: "floorplan", label: "Ground floor" }), M({ id: "A5", kind: "aerial" })];
  const p = toPublic(L, media);
  assert.equal(p.status, "For Sale");
  assert.equal(p.region, "jersey");
  assert.equal(p.salePrice, 779000);
  assert.equal(p.image, "/media/A2");          // cover_media_id wins
  assert.equal(p.thumb, "/media/A2?thumb");
  assert.deepEqual(p.photos.map(x => x.src), ["/media/A1", "/media/A2"]);
  assert.equal(p.photos[0].alt, "Kitchen");    // extension stripped
  assert.equal(p.photos[1].alt, "Le Bernage");
  assert.deepEqual(p.floorplans, [{ src: "/media/A4", alt: "Ground floor" }]);
  assert.equal(p.aerial.src, "/media/A5");
  assert.deepEqual(p.summary, ["Semi-detached", "Garage"]);
  assert.deepEqual(p.description, ["Line one", "Line two"]);
  assert.deepEqual(p.specs, []);
  assert.ok(!JSON.stringify(p).includes("A3"));
});
