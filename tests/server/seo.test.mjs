import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { makeEnv, seedListing, seedMedia } from "./helpers.mjs";
import { listingMeta, headTags, listingPage, sitemapXml, robotsTxt } from "../../server/seo.js";
import { onRequestGet as sitemap } from "../../functions/sitemap.xml.js";
import { onRequestGet as robots } from "../../functions/robots.txt.js";

const L = createRequire(import.meta.url)("../../site/lib.js");
const SITE = "https://hamptonjersey.pages.dev";
const P = o => ({ id: "HE-R001", title: "Le Bernage", place: "St Saviour", region: "jersey", operation: "sale",
  currency: "GBP", salePrice: 769000, rent: null, rentPeriod: null, premium: null, summary: ["Three bedrooms"],
  description: [], image: "/media/A00001", thumb: "/media/A00001?thumb",
  photos: [{ src: "/media/A00001", thumb: "/media/A00001?thumb", alt: "Kitchen" }, { src: "/media/A00002", alt: "Garden" }], ...o });

test("title: listing · price as the website shows it · brand; no price, no price part", () => {
  assert.equal(listingMeta(P(), SITE).title, "Le Bernage · £769,000 · Hampton Estates Jersey");
  const rent = P({ operation: "rent", salePrice: null, rent: 2500, rentPeriod: "month" });
  assert.equal(listingMeta(rent, SITE).title, "Le Bernage · £2,500 pcm · Hampton Estates Jersey");
  assert.equal(listingMeta(P({ salePrice: null }), SITE).title, "Le Bernage · Hampton Estates Jersey");
  // The price text is site/lib.js's priceLabel itself, so the preview and the page always agree.
  for (const p of [P(), rent, P({ operation: "business", premium: 90000, currency: "EUR" })])
    assert.ok(listingMeta(p, SITE).title.includes(L.priceLabel(p)));
});

test("description: the summary, trimmed at a word boundary to 160 characters", () => {
  assert.equal(listingMeta(P({ summary: ["Three bedrooms", "Garden"] }), SITE).description, "Three bedrooms. Garden.");
  const long = "Tucked away in a small private development this immaculately presented three bedroom semi detached home offers excellent family living with a garden garage and parking";
  const d = listingMeta(P({ summary: [long] }), SITE).description;
  assert.ok(d.length <= 160, d.length);
  assert.ok(d.endsWith("…"));
  assert.ok(long.startsWith(d.slice(0, -1)) && long[d.length - 1] === " ", "cut before a space, not inside a word");
  // A past open viewing is left out, as on the page; no summary falls back to the description.
  assert.equal(listingMeta(P({ summary: ["Open viewing: Thursday 1 January, 10:30 to 12:00", "Garden"] }), SITE).description
    .startsWith("Open viewing"), false);
  assert.equal(listingMeta(P({ summary: [], description: ["A fine home."] }), SITE).description, "A fine home.");
});

test("canonical, image (thumbnail, S3) and alt are absolute from SITE_URL", () => {
  const m = listingMeta(P(), SITE + "/");
  assert.equal(m.canonical, `${SITE}/p/HE-R001`);
  assert.equal(m.image, `${SITE}/media/A00001?thumb`);
  assert.equal(m.imageAlt, "Kitchen");
  assert.equal(listingMeta(P({ image: null, thumb: null, photos: [] }), SITE).image, null);
});

test("JSON-LD: RealEstateListing with offer and place; </script> in a title can't close the script", () => {
  const m = listingMeta(P({ title: 'Le "Bernage" </script><script>alert(1)</script> & co' }), SITE);
  assert.ok(!m.jsonLd.includes("<"));
  const ld = JSON.parse(m.jsonLd);
  assert.equal(ld["@type"], "RealEstateListing");
  assert.equal(ld.name, 'Le "Bernage" </script><script>alert(1)</script> & co');
  assert.equal(ld.url, `${SITE}/p/HE-R001`);
  assert.deepEqual(ld.offers, { "@type": "Offer", price: 769000, priceCurrency: "GBP" });
  assert.deepEqual(ld.contentLocation.address, { "@type": "PostalAddress", addressLocality: "St Saviour", addressCountry: "JE" });
  assert.deepEqual(ld.image, [`${SITE}/media/A00001`, `${SITE}/media/A00002`]);
  assert.equal(JSON.parse(listingMeta(P({ salePrice: null }), SITE).jsonLd).offers, undefined);
  const rent = JSON.parse(listingMeta(P({ operation: "rent", salePrice: null, rent: 2500, rentPeriod: "month" }), SITE).jsonLd);
  assert.equal(rent.offers.priceSpecification.unitCode, "MON");
});

test("head tags escape every value for its attribute", () => {
  const m = listingMeta(P({ title: `"><script>x</script>&'`, photos: [{ src: "/media/A00001", alt: `a"b<c` }] }), SITE);
  const html = headTags(m);
  assert.ok(!html.includes("<script>x"));
  assert.ok(html.includes('content="&quot;&gt;&lt;script&gt;x&lt;/script&gt;&amp;&#39; · £769,000 · Hampton Estates Jersey"'));
  assert.ok(html.includes('<meta property="og:image:alt" content="a&quot;b&lt;c">'));
  assert.equal(html.match(/<script/g).length, 1); // only the JSON-LD
  for (const t of ['<link rel="canonical" href="https://hamptonjersey.pages.dev/p/HE-R001">', 'property="og:type" content="website"',
    'property="og:site_name" content="Hampton Estates Jersey"', 'name="twitter:card" content="summary_large_image"'])
    assert.ok(html.includes(t), t);
});

test("sitemap: home and each listing with its lastmod; robots keeps out /admin/ and /api/", () => {
  const xml = sitemapXml([{ id: "HE-R001", updated_at: "2026-10-20T09:00:00.000Z" }, { id: "HE-C002", updated_at: "2026-10-21T09:00:00.000Z" }], SITE);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.ok(xml.includes(`<url><loc>${SITE}/</loc></url>`));
  assert.ok(xml.includes(`<url><loc>${SITE}/p/HE-R001</loc><lastmod>2026-10-20</lastmod></url>`));
  assert.ok(xml.includes(`<url><loc>${SITE}/p/HE-C002</loc><lastmod>2026-10-21</lastmod></url>`));
  assert.equal(robotsTxt(SITE + "/"), `User-agent: *\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
});

function world() {
  const env = { ...makeEnv(), SITE_URL: SITE };
  seedListing(env, { title: "Le Bernage", sale_price: 769000, summary: "Three bedrooms", updated_at: "2026-10-20T09:00:00.000Z" });
  seedListing(env, { id: "HE-R002", title: "Draft", published: 0 });
  seedListing(env, { id: "HE-R003", title: "Old", archived_at: "2026-10-07" });
  seedMedia(env);
  return env;
}
const req = (path, host = SITE) => new Request(host + path);

test("listing page: a published listing gets its tags, 200, cached five minutes", async () => {
  const r = await listingPage(req("/p/HE-R001"), world(), "HE-R001");
  assert.equal(r.status, 200);
  assert.equal(r.title, "Le Bernage · £769,000 · Hampton Estates Jersey");
  assert.equal(r.headers.get("cache-control"), "public, max-age=300");
  assert.equal(r.headers.get("x-robots-tag"), null);
  for (const t of ['property="og:title"', `property="og:image" content="${SITE}/media/A00001?thumb"`, 'application/ld+json',
    `<link rel="canonical" href="${SITE}/p/HE-R001">`, 'name="description" content="Three bedrooms."'])
    assert.ok(r.head.includes(t), t);
  assert.ok(!r.head.includes("noindex"));
});

test("listing page: missing, unpublished or archived is 404 + noindex, with no metadata", async () => {
  const env = world();
  for (const id of ["HE-R999", "HE-R002", "HE-R003", "../admin", "he-r001"]) {
    const r = await listingPage(req(`/p/${id}`), env, id);
    assert.equal(r.status, 404, id);
    assert.equal(r.title, null);
    assert.equal(r.head, '<meta name="robots" content="noindex">');
  }
});

test("another host (preview, old domain) is never indexed; URLs still point at SITE_URL", async () => {
  const r = await listingPage(req("/p/HE-R001", "https://abc123.hamptonjersey.pages.dev"), world(), "HE-R001");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
  assert.ok(r.head.includes(`<link rel="canonical" href="${SITE}/p/HE-R001">`));
});

test("GET /sitemap.xml lists only live listings; GET /robots.txt names it", async () => {
  const env = world();
  const s = await sitemap({ request: req("/sitemap.xml"), env });
  assert.equal(s.headers.get("content-type"), "application/xml; charset=utf-8");
  const xml = await s.text();
  assert.ok(xml.includes(`<loc>${SITE}/p/HE-R001</loc><lastmod>2026-10-20</lastmod>`));
  assert.ok(!xml.includes("HE-R002") && !xml.includes("HE-R003"));
  const r = await robots({ request: req("/robots.txt", "http://localhost:8788"), env });
  assert.equal(r.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(r.headers.get("x-robots-tag"), "noindex");
  assert.ok((await r.text()).includes(`Sitemap: ${SITE}/sitemap.xml`));
});
