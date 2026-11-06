# Hampton App design pass: execution record

Plan: [2026-11-06-hampton-app-design-pass.md](2026-11-06-hampton-app-design-pass.md). Local branch: `codex/hampton-design-pass`. Production publication is pending.

## Delivered

- Tasks 1-3: native swipeable home gallery, arrows, keyboard and live counter; no autoplay. Facts have separate spans, sections use sentence case, no template stat strip, Featured hidden with five properties or fewer.
- Tasks 4-6: stable-width catalogue photo buttons, balanced four-card grids, swipeable listing photos, thumbnails and lightbox, quieter summary/specifications. Register's seven steps, Privacy and Not found checked at 1280/390.
- Tasks 7-15: shared staff-panel metadata and label rules; applicant/listing/viewing/sale/rental screens, Review shortcuts, demand table, owner report and printed statements simplified. Empty-cell em dashes and meaningful controls retained.
- Task 16: DESIGN.md, status and the existing PUB-22 checklist entry updated locally. No migration or new dependency.

## Decisions and limits

- Work stays in a local feature branch in the requested checkout. Pre-existing untracked files are preserved.
- Recommended plan options applied: sentence-case titles, no autoplay, Featured hidden with at most five properties and capped at two with larger inventory.
- Hero title width uses 28ch rather than 20ch: the measured longest title needs that width to fit two lines at 1280px. Cost: a wider title block.
- Task 1 followed Task 2 and shipped with Task 3; its decorative-arrow guard required removing that CSS arrow there. Tasks 4-6 share one public-site commit. Cost: broader review units, no behavioral difference.
- Panel Tasks 7-15 were one same-shape delegated batch with separate review. Root implemented and verified the public site and browser integration.
- Browser tests use isolated local D1/R2 data and fictitious environment values. Existing development credentials and databases were not changed. Tests can choose `E2E_STATE` and `E2E_VARS` instead of the default paths.
- Featured integration tests restore six *visible* properties: the earlier no-photo test makes a published business invisible to the website. The temporary fixture changes are restored after the assertions.
- The final Widen criteria check runs before folder/Drive import tests: their photo-only draft has unknown bedrooms/price/parish and correctly counts as another possible match. This isolates the controlled widening fixture without changing matching policy.
- Native dialog-close and gesture-inertia completion are awaited in browser tests. The original synchronous assumptions caused test races after native scrolling replaced DOM swaps.
- Real Safari/Android and MacBook back/forward gestures still require device confirmation. WebKit could not start here because required system libraries are absent; the environment was not modified to install them.
- The private checklist copy in claude.ai remains pending: that integration is not available here. No push, deployment or external publication was performed.

## Verification

- `npm test`: 559 Node tests and 14 Python tests pass.
- `npm run build`: passes; Vite retains its existing large-chunk advisory.
- `tests/design.e2e.cjs`: home, catalogue, 17-photo listing gallery, lightbox, single/zero/no-photo/broken-photo cases, reduced motion, horizontal wheel, emulated touch, seven Register steps, Privacy and Not found pass at 1280/390.
- Keyboard access to Insights' new overflow table: reproduced missing focusability, fixed named focusable region, verified ArrowRight scrolling at 390. Independent scoped review clean.
- Panel screenshot audit: login plus 23 routes at 1280/390, new-property form and print versions of owner report/statement; no page overflow or runtime errors. 54 captures in `/tmp/hampton-design-panel-shots`.
- Public captures: `/tmp/hampton-design-shots`.
- Original application e2e passes in full on the final fresh fixture: `E2E_PHASES=public,urls` followed by `E2E_PHASES=admin` on the same state. Both exit 0. A combined run reached the process time limit; phase selection preserves every case. Unknown phases are rejected with exit 1.

## Review record

Panel batch: `f3304d5`; keyboard fix: `45a1d3a`. Independent review found and verified the Insights scroll-region fix.

Public changes: `21508b0`, `8f18500`, `c8c5d91`; navigation/focus regression fix `37aa94a` and focus-paint refinement `81f703b`.

The independent whole-branch review identified two Important issues: a clipped keyboard focus ring in the photo stage, and an observer disconnected when a visitor canceled a slow first Register/Privacy load and returned Home. Both were reproduced before fixing. A geometric/inset-outline check proved insufficient; the final ring is painted above the photo with a white contrast edge, and a browser screenshot-pixel regression proves it is visible at both widths. The delayed-module regression proves counters/arrows remain live after returning Home. A realistic API `For Sale` fixture also exposed and verified the required summary sentence casing.

The review's set-aside items were ruled explicitly: keep existing photo eligibility and the zero-listing alert; unchanged legacy controls remain outside a full inherited-defect audit; real-device gesture checks, private checklist publication and production publication stay pending; closure documentation is completed here. Cost: pre-existing behavior remains and those external/device checks are not claimed.

No unresolved code-review finding is being deferred.

## Final acceptance

- Full application e2e: **PASS** (`/tmp/hampton-e2e-public-final7.log`, `/tmp/hampton-e2e-admin-final7.log`).
- Final design suite: **PASS**, home/navigation/catalogue/detail/auxiliary pages at both widths (`/tmp/hampton-design-delivery-browser.log`).
- Units: **559 Node + 14 Python PASS**; production build **PASS** (`/tmp/hampton-design-verified-unit.log`, `/tmp/hampton-design-verified-build.log`).
- Independent review findings: both Important regressions fixed with observed failing/passing browser tests; actual painted focus checked in screenshots. Required API status casing corrected. No unresolved finding deferred.
- Existing advisories only: Vite bundle size and Node's module-type inference warning in the browser-test helper. Neither check fails.
- Code and local documentation delivered. Real-device gesture confirmation, production publication and the private checklist copy remain pending as stated above.
