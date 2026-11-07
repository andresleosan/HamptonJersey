# Gallery fallback implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. One independent final review.

**Goal:** Restore gallery navigation when the current photo cannot load and verify the complete e2e.
**Architecture:** Keep the existing error placeholder and navigation; correct their CSS paint order.
**Tech Stack:** Existing HTML/CSS, Playwright, Wrangler fixture database.
**Spec:** `docs/superpowers/specs/2026-11-07-hampton-gallery-fallback-design.md`

## Global constraints

DESIGN.md Colors/Typography/Components: public site ink #151515, mist #f4f3f0, stone #77736c; Montserrat body 15px, 1.65; preserve existing labels and Tenor Sans headings. Existing gallery controls remain 44×44px, 12px from either edge, with rgba(255,255,255,.88) background; site radius 16px. Gallery navigation stacking changes; the downstream panel header also restores the required single row at 1280 with 12px nav labels, 5px inline padding and 6px bar gap at 1100–1535. Mobile and brand styles stay unchanged. Check desktop/mobile, keyboard, focus, missing-image state and 200% zoom. Native radio/checkbox padding is 0, avoiding generic text-input 9px 12px padding. Labels .check have a minimum of 32px, raised to 44px at widths <=760px (including .choices and generic filters; legacy more-specific rules may retain their existing size), so removing native padding does not shrink click targets. No new assets, dependencies, requests, animation, or authentication changes.

Skills: writing-plans records this bounded repair; executing-plans/TDD require failed then passing regression and final review; impeccable preserves visible controls and semantic layer order; antislop keeps existing visual direction, accessible targets and error recovery; ponytail selects one CSS declaration; frontend-security-coder/security-best-practices preserve existing trust boundaries and local-only fixtures; web-performance-optimization adds no runtime work. Taste/redesign do not apply: no new page or redesign. Brainstorming/grill-me reuse the approved repair and resolve the cause from reproduction, without a new product decision.

## Review focus

- Missing image after closing the lightbox: arrows visible and clickable.
- Recovery to a valid image: placeholder removed and photo loaded.
- Keyboard navigation: focus survives replaced controls.
- Small screen/zoom: no horizontal overflow or obstruction.
- Other overlays/header: original stacking and modal behavior remain usable.

### Task 1: Restore controls and verify

Files: `site/index.html`, `admin/src/styles.css`, `tests/e2e.cjs`, `tests/gallery.e2e.cjs`, `tests/admin-controls.e2e.cjs`, roadmap ESTADO/checklist and this task ledger. E2e setup also stabilizes the initial hero, runs Widen before imports and scrolls before the initial chat Send, keeping all assertions.
Interfaces: consumes existing `.stage`, `.noimg`, `.stage-nav`; no new public API.

- [x] Write regression at 1280/390 with one failed and one valid photo; observe RED before implementation.
- [x] Give `.stage-nav` a stacking level of 1 above the placeholder, below sticky header level 20.
- [x] Run targeted regression, npm test, build, check:release and full tests/e2e.cjs with local fixtures.
- [x] Verify with Playwright MCP at both widths and 200% zoom; record console/network and captures.
- [x] Reconcile published EST-09/PRE-12 and bootstrap status; record gallery status separately.
- [x] Independent whole-change review, fix significant findings, commit on main; publication requires approval of the new SHA.
