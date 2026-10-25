# SEO and Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each listing gets a real URL `/p/<id>` whose HTML carries title, description, preview image and structured data, plus a sitemap, robots.txt, home metadata and Share/WhatsApp buttons.

**Architecture:** Pages Functions for `/p/[id]`, `/sitemap.xml` and `/robots.txt` built on a small `server/seo.js` (pure string builders, unit-tested); the public SPA router learns path routes for listings with `pushState`.

**Tech Stack:** Cloudflare Pages Functions (HTMLRewriter, env.ASSETS), D1, vanilla JS public site (`site/index.html`, `site/lib.js`), node:test, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-25-hampton-app-seo-sharing-design.md` (S1–S11).

## Global Constraints

- `SITE_URL` in `wrangler.toml` `[vars]` = `https://hamptonjersey.pages.dev`; every absolute URL (canonical, og:url, og:image, sitemap, robots, share links) is built from it, never from the request host. A request whose host differs gets `X-Robots-Tag: noindex`.
- Only listings with `published = 1 AND archived_at IS NULL` get metadata, a 200 or a sitemap entry; anything else is 404 with `<meta name="robots" content="noindex">`.
- Every injected value is escaped for its context: attribute/text via HTMLRewriter's `setAttribute`/`setInnerContent` (text mode), JSON-LD via `JSON.stringify` with `<` replaced by `<`.
- Public text in English (D19). No migration. No new dependencies.
- The listing page does one D1 read; responses `cache-control: public, max-age=300`.

## Review Focus

1. A listing title containing `"`, `<`, `&` or `</script>`: the HTML and JSON-LD stay valid and nothing executes.
2. Navigating home → listing → another listing → Back → Back: the right page each time, no full reload, scroll restored to top on a new listing.
3. An old shared link `https://…/#/p/HE-R001` and a Wix redirect both end on `/p/HE-R001` showing the listing.
4. A booking (viewing form with Turnstile) and the gallery/tour still work on `/p/<id>` (assets load from absolute paths; stats `POST /api/stats` still fires).
5. `/p/HE-R999`, an archived and an unpublished listing: 404 + noindex, the SPA shows its not-found state, none in the sitemap.

---

### Task 1: Server side — `/p/[id]`, sitemap, robots

**Files:**
- Create: `server/seo.js` (`listingMeta(listing, siteUrl) -> { title, description, canonical, image, imageAlt, jsonLd }`, `sitemapXml(listings, siteUrl) -> string`, `robotsTxt(siteUrl) -> string`), `functions/p/[id].js`, `functions/sitemap.xml.js`, `functions/robots.txt.js`, `tests/server/seo.test.mjs`
- Modify: `wrangler.toml` (`SITE_URL`), `server/routes/public.js` or `server/listing.js` only to export the single-listing public read the Function reuses.

- [ ] **Step 1: Failing tests** for `server/seo.js`: title "Le Bernage · £769,000 · Hampton Estates Jersey" (rent shows "£2,500 pcm"; no price → no price part); description trimmed at a word boundary ≤ 160 chars; canonical `${SITE_URL}/p/HE-R001`; image absolute from `SITE_URL` (thumb vs full per S3, decided after measuring real media); JSON-LD parses, has `@type: RealEstateListing`, `offers.price`/`priceCurrency`, and a title with `</script>` serializes with `<`; sitemap has home + each given listing with `lastmod` date; robots disallows `/admin/` and `/api/` and names the sitemap. Function-level tests (call the exported `onRequestGet` with a fake `env.ASSETS.fetch` returning a minimal index.html and the D1 double): 200 with tags for a published listing; 404 + noindex for missing/unpublished/archived; `X-Robots-Tag: noindex` when the request host differs from `SITE_URL`.
- [ ] **Step 2: Run** them → fail. **Step 3: Implement.** HTMLRewriter exists on Workers but not in Node: keep the rewriting in a thin layer inside the Function and test `server/seo.js` directly; for the Function test, if HTMLRewriter is unavailable in Node, test the pure part and cover the Function end-to-end in Task 2's e2e (state this in the report).
- [ ] **Step 4: Run** `npm test` → green. **Step 5: Commit** `Serve listing pages with preview metadata, sitemap and robots`.

### Task 2: Public site — path routing, Share, home metadata

**Files:**
- Modify: `site/index.html` (router path support per S1, listing links to `/p/<id>`, absolute asset paths S9, document.title S8, Share + WhatsApp buttons S7, static home meta + `RealEstateAgent` JSON-LD S4), `site/lib.js` if links are built there, `site/_redirects` (S10), `tests/e2e.cjs`.

- [ ] **Step 1: Implement** per S1, S4, S7–S10.
- [ ] **Step 2: e2e**: open `/p/HE-R001` directly (listing shows; `curl`-style fetch of the same URL without JS contains `og:title`, `og:image`, canonical, JSON-LD); click home → listing → other listing → Back twice (Review Focus 2); `/#/p/HE-R001` ends on `/p/HE-R001` (3); book a viewing flow and gallery on `/p/<id>` (4); `/p/HE-R999` shows not-found (5); `/sitemap.xml` and `/robots.txt` content; Share button falls back to copy in headless (clipboard permission granted) and the WhatsApp link's `href` contains the encoded `/p/<id>` URL; phone width has no sideways scroll.
- [ ] **Step 3: Run** `npm test`, `npm run build` and the e2e → green. **Commit** `Give each listing a shareable URL`.
