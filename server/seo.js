// Listing pages, sitemap and robots for crawlers and link previews (spec 2026-10-25, S2–S6). Pure builders plus the
// listing page's data; the Functions in functions/ only put them into the response.
import lib from "../site/lib.js";
import { readLive } from "./routes/public.js";

// The website's own helpers (site/lib.js), so a preview's price and summary always match the page.
const { amount, priceLabel, liveSummary, jerseyToday, shownOnSite } = lib;
const BRAND = "Hampton Estates Jersey";
const COUNTRY = { jersey: "JE", uk: "GB" };
const base = siteUrl => siteUrl.replace(/\/+$/, "");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// At most n characters, cut at a word boundary.
function clip(s, n = 160) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,.;:·-]+$/, "") + "…";
}

// p: the public shape (server/listing.js toPublic).
export function listingMeta(p, siteUrl) {
  const site = base(siteUrl), price = amount(p) == null ? null : priceLabel(p);
  const lines = liveSummary(p.summary, jerseyToday());
  const text = lines.length ? lines.map(l => l.replace(/^[-•]\s*/, "").replace(/[.;:,]$/, "").replace(/[^!?]$/, "$&.")).join(" ") : p.description.join(" ");
  const canonical = `${site}/p/${p.id}`;
  const photos = p.photos.map(x => site + x.src);
  const ld = {
    "@context": "https://schema.org", "@type": "RealEstateListing", name: p.title, url: canonical,
    description: text || undefined, image: photos.length ? photos : undefined,
    contentLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: p.place || undefined, addressCountry: COUNTRY[p.region] } },
    offers: price ? { "@type": "Offer", price: amount(p), priceCurrency: p.currency,
      ...(p.operation === "rent" && { priceSpecification: { "@type": "UnitPriceSpecification", price: amount(p),
        priceCurrency: p.currency, unitCode: { month: "MON", year: "ANN" }[p.rentPeriod] } }) } : undefined,
  };
  return {
    title: [p.title, price, BRAND].filter(Boolean).join(" · "),
    description: clip(text || `${p.title}${p.place ? `, ${p.place}` : ""}. ${BRAND}.`),
    canonical,
    // S3: the cover's thumbnail. Measured 2026-10-25 on the 65 published photos: every thumb is a 640px-wide JPEG
    // (23–100 KB; covers 58–79 KB) against 768–1440px and up to 445 KB for the full images. Thumbs fit a 640px box,
    // so only a portrait or small cover would fall under 600px wide.
    image: p.thumb ? site + p.thumb : null,
    imageAlt: p.photos.find(x => x.src === p.image)?.alt ?? p.title,
    // Inside <script>, "<" as \u003c: no value can close the tag (Global Constraints).
    jsonLd: JSON.stringify(ld).replace(/</g, "\\u003c"),
  };
}

// Escaped for an attribute; the Function appends it to <head> (HTMLRewriter has no way to build new elements).
export function headTags(m) {
  const meta = (k, v, attr = "property") => `<meta ${attr}="${k}" content="${esc(v)}">`;
  return [
    meta("description", m.description, "name"),
    `<link rel="canonical" href="${esc(m.canonical)}">`,
    meta("og:type", "website"), meta("og:site_name", BRAND), meta("og:title", m.title),
    meta("og:description", m.description), meta("og:url", m.canonical),
    ...(m.image ? [meta("og:image", m.image), meta("og:image:alt", m.imageAlt)] : []),
    meta("twitter:card", m.image ? "summary_large_image" : "summary", "name"),
    `<script type="application/ld+json">${m.jsonLd}</script>`,
  ].join("\n");
}

// S5: only SITE_URL's host is indexed; previews and other hosts say noindex.
export function seoHeaders(request, env, type) {
  // _headers doesn't reach Function responses: its site-wide headers are repeated here.
  const h = new Headers({ "cache-control": "public, max-age=300", "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin" });
  if (type) h.set("content-type", type);
  if (new URL(request.url).host !== new URL(env.SITE_URL).host) h.set("x-robots-tag", "noindex");
  return h;
}

// S2: what /p/<id> puts into index.html. Not live (missing, draft, archived) or not shown by the website (no public
// photo): 404 + noindex and no metadata.
export async function listingPage(request, env, id) {
  const p = /^HE-[A-Z]\d{3,}$/.test(id) ? (await readLive(env, id)).map(x => x.pub).find(shownOnSite) : null;
  const headers = seoHeaders(request, env);
  // A short cache on the 404, so a listing published a minute later doesn't stay hidden for five.
  const siteUrl = base(env.SITE_URL);
  if (!p) { headers.set("cache-control", "public, max-age=60"); return { status: 404, headers, siteUrl, title: null, head: '<meta name="robots" content="noindex">' }; }
  const m = listingMeta(p, env.SITE_URL);
  return { status: 200, headers, siteUrl, title: m.title, head: headTags(m) };
}

// S6: the home page and each live listing.
export function sitemapXml(listings, siteUrl) {
  const site = base(siteUrl);
  const urls = [`<url><loc>${esc(site)}/</loc></url>`, ...listings.map(l =>
    `<url><loc>${esc(`${site}/p/${l.id}`)}</loc><lastmod>${esc(l.updated_at.slice(0, 10))}</lastmod></url>`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// The public reads the pages are built from stay open, so a search engine can render them (the longest rule wins).
export const robotsTxt = siteUrl => `User-agent: *\nAllow: /api/listings\nAllow: /api/config\nAllow: /api/tours\n` +
  `Disallow: /admin/\nDisallow: /api/\n\nSitemap: ${base(siteUrl)}/sitemap.xml\n`;

// S6: the listings the website shows, with their last change.
const sitemapListings = async env => (await readLive(env)).filter(x => shownOnSite(x.pub)).map(x => x.row);
export const sitemapResponse = async (request, env) =>
  new Response(sitemapXml(await sitemapListings(env), env.SITE_URL), { headers: seoHeaders(request, env, "application/xml; charset=utf-8") });
export const robotsResponse = (request, env) =>
  new Response(robotsTxt(env.SITE_URL), { headers: seoHeaders(request, env, "text/plain; charset=utf-8") });
