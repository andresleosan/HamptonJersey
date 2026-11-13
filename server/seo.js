// Listing pages, sitemap and robots for crawlers and link previews (spec 2026-10-25, S2–S6). Pure builders plus the
// listing page's data; the Functions in functions/ only put them into the response.
import { readLive } from "./routes/public.js";
import { BRAND, headTags, listingMeta } from "./listing-meta.js";
import lib from "../site/lib.js";
export { headTags, listingMeta } from "./listing-meta.js";
const { shownOnSite } = lib;
const base = siteUrl => siteUrl.replace(/\/+$/, "");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
  // Ask caches not to retain either a live page or a 404. This does not
  // invalidate older copies or control intermediary cache rules.
  headers.set("cache-control", "no-store");
  const siteUrl = base(env.SITE_URL);
  if (!p) return { status: 404, headers, siteUrl, title: null, head: '<meta name="robots" content="noindex">' };
  const m = listingMeta(p, env.SITE_URL);
  return { status: 200, headers, siteUrl, title: m.title, head: headTags(m) };
}

// PUB-22: what /properties puts into index.html. One canonical for every choice (?op=…), so the catalogue is one page
// for search engines and not a copy of the home page.
const PROPERTIES = { title: `Properties · ${BRAND}`,
  description: "Homes to let, homes for sale and businesses for sale across Jersey, from Hampton Estates on Bath Street, St Helier, since 1982." };
export function propertiesPage(request, env) {
  const siteUrl = base(env.SITE_URL), canonical = `${siteUrl}/properties`;
  const ld = { "@context": "https://schema.org", "@type": "CollectionPage", name: PROPERTIES.title, url: canonical, description: PROPERTIES.description };
  return { status: 200, headers: seoHeaders(request, env), siteUrl, title: PROPERTIES.title,
    head: headTags({ ...PROPERTIES, canonical, image: `${siteUrl}/og-image.jpg`,
      imageAlt: "A country house in Jersey with a courtyard garden and a conservatory", jsonLd: JSON.stringify(ld).replace(/</g, "\\u003c") }) };
}

// Tags the static page carries for the home page (S4); a page's own replace them. HTMLRewriter only exists on Workers:
// the pages that use this are tested by the e2e against `wrangler pages dev`.
const HOME_TAGS = 'meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]';
// html: the Response of index.html (HTMLRewriter transforms a Response).
export function withPageHead(html, page) {
  const body = new HTMLRewriter()
    .on(HOME_TAGS, { element: e => e.remove() })
    .on("title", { element: e => { if (page.title) e.setInnerContent(page.title); } })
    // S7: the base of the links the page shares, from this deployment's SITE_URL. The page's tags go right after it,
    // near the top of <head>: some preview robots read only the first bytes, and the inline CSS below is ~28 KB.
    .on('meta[name="site-url"]', { element: e => { e.setAttribute("content", page.siteUrl); e.after(page.head, { html: true }); } })
    .transform(html).body;
  page.headers.set("content-type", "text/html; charset=utf-8");
  return new Response(body, { status: page.status, headers: page.headers });
}

// S6: the home page and each live listing.
export function sitemapXml(listings, siteUrl) {
  const site = base(siteUrl);
  const urls = [`<url><loc>${esc(site)}/</loc></url>`, `<url><loc>${esc(site)}/properties</loc></url>`, ...listings.map(l =>
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
