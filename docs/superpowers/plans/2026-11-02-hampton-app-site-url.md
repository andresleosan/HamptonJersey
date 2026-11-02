# PUB-14 · The website's own address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every absolute URL the website hands to people, link previews and search engines points at `https://www.hamptonestatesjersey.com`, the host that serves the app since 1-nov-2026.

**Architecture:** One value, `SITE_URL` in wrangler.toml (S5), feeds the listing pages, sitemap, robots and their noindex on every other host; the home page's static head repeats it and tests/server/seo.test.mjs ties the two together. Change both; the code stays as it is.

**Tech Stack:** Cloudflare Pages Functions, static site/index.html, node:test.

**Spec:** small fix, no spec. Description approved by Luis on 2-nov-2026 (option 1): the canonical host is `https://www.hamptonestatesjersey.com`, with www, because hamptonestatesjersey.com (301) and hamptonjersey.pages.dev (308) already redirect there at Cloudflare. Origin: PUB-14 and PRE-16 in the checklist; the VPS note in the handoff of 1-nov-2026.

## Global Constraints

- `SITE_URL = "https://www.hamptonestatesjersey.com"`, no trailing slash (seo.js `base()` adds it).
- S5 (security/SEO): only SITE_URL's host is indexed; on previews, the apex domain and pages.dev the listing pages, the sitemap and robots.txt keep `x-robots-tag: noindex` (the static home page sends none and relies on the www canonical).
- S7: `<meta name="site-url">` is the base of every shared link (Share, WhatsApp).
- DESIGN.md: nothing visible changes; no colours, type, spacing or components touched. Performance: no new request or byte on the page.
- The public repo carries no secrets; the JSON-LD's email and phone are already public on the website.
- Out of scope: Search Console, WAF rules, Meta, a real booking and registration, leaving Wix (Luis), and how Hermes is configured to call the app.

## Review Focus

1. A listing page, the sitemap or robots.txt requested on the apex host or on pages.dev (before Cloudflare's redirect, or if it is removed) is answered `noindex` and its canonical points at www; the static home page has no noindex and relies on its www canonical.
2. A leftover `pages.dev` URL in the home page's head (og:image, JSON-LD image) after the switch: the home-page test must find any of them, not only those under the new host.
3. A shared link from the home page built from `meta site-url` lands on www, not on the host the visitor came from.

---

### Task 1: SITE_URL to www.hamptonestatesjersey.com

**Files:**
- Modify: `wrangler.toml:10`, `site/index.html:11-25`
- Test: `tests/server/seo.test.mjs` (SITE constant, line 73, the preview-host test at :125, the home-page test at :146), `tests/e2e.cjs:190`
- Docs (same commit): `docs/roadmap/checklist-hampton-app.html` (PUB-14, PRE-16, PUB-02, ANA-09, AUT-04 and any other item that says the official site is still on Wix), `docs/roadmap/ESTADO.md`, `docs/roadmap/2026-10-23-arquitectura-hampton-app.md` (the domain question), this plan's ledger.

- [ ] **Step 1: Failing tests.** In seo.test.mjs: `const SITE = "https://www.hamptonestatesjersey.com"` (line 73 uses `${SITE}`); the home-page test asserts `site === "https://www.hamptonestatesjersey.com"`, asserts the head has no `pages.dev`, and checks every absolute `hamptonestatesjersey.com` URL in the head equals `site` or starts with `site + "/"`; the other-host test checks `https://abc123.hamptonjersey.pages.dev` and the bare domain `https://hamptonestatesjersey.com` get `noindex` on a listing page with the www canonical; the www host itself getting no `x-robots-tag` is already pinned at seo.test.mjs:105.
- [ ] **Step 2:** `node --test tests/server/seo.test.mjs` → the home-page test FAILS (wrangler.toml still has pages.dev).
- [ ] **Step 3:** wrangler.toml `SITE_URL`; in site/index.html the canonical, `site-url`, `og:url`, `og:image` and JSON-LD `url` and `image` to the www host. e2e.cjs:190 `SITE` likewise.
- [ ] **Step 4:** `npm test` → all pass; `npm run build` OK; e2e `listingUrls()` against `wrangler pages dev` (the full run stops at Turnstile in the workshop).
- [ ] **Step 5:** Docs above, then one commit with code, ESTADO and checklist.
