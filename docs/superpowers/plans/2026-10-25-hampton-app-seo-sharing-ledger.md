# SDD ledger — plan: docs/superpowers/plans/2026-10-25-hampton-app-seo-sharing.md
Spec: docs/superpowers/specs/2026-10-25-hampton-app-seo-sharing-design.md

## Pre-flight scan
| Rows | Finding |
|---|---|
| T1 -> T2 | T2 links to /p/<id> served by T1's Function; e2e of the Function lives in T2 (HTMLRewriter not in Node) — consistent, ruling recorded |
| T1 self | tests vs code consistent; S3 image choice measured by implementer |
| T2 self | router + absolute paths + _redirects — consistent |
Scan clean.
BASE T1: dc88eaa
T1 implementer done c6fd2ae (398+13). Rulings: headTags string+{html:true} with escaping accepted in place of setAttribute (HTMLRewriter can't create elements) — reviewer must verify escaping; og:image = thumb (all 65 prod thumbs 640px JPEG ≤100KB) — portrait <600px parked; /api/listings via shared readPublic — reviewer checks same output.
Task 1: complete (c6fd2ae, Approved). Minors folded into T2: 404 cache max-age=60; don't append '.' after ! or ?. Handoff: S9 absolute paths must land with the link switch. BASE T2: c6fd2ae
T2 implementer done 0a2bd02 (399+13, build, e2e OK). Controller viewed 360px screenshot: Share/WhatsApp fit. Concerns: in-site nav updates only the tab title (crawlers load fresh — OK); admin 'View on the website' link still #/p (fix wave); og-image.jpg cropped from a client's house (tell Luis); tab title uses server format (accepted). Ruling: one opus review = T2 task review + whole-feature final review.
Final review (opus, T2+whole): Ready after fixes; no SPA navigation regression found. Fix wave sent: robots Allow public read APIs (Important; spec S6 amended), trailing slash + malformed /p → not-found, HEAD support, D1 error fallback, site-url meta, sitemap/Function aligned with SPA visibility, admin View on website link. Wix redirects to unpublished listings kept (not-found page with See our properties) — tell Luis.
Fix wave 15dc545 re-review: Approved. Parked minors: malformed site-url meta would throw (trusted config); fallback re-fetch of ASSETS could throw; /p/foo/bar soft 404 via SPA fallback. Task 2: complete.
