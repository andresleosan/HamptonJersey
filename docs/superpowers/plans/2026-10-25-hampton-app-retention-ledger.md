# SDD ledger — plan: docs/superpowers/plans/2026-10-25-hampton-app-retention.md
Spec: docs/superpowers/specs/2026-10-25-hampton-app-retention-design.md

## Pre-flight scan
| Rows | Produces / consumes | Finding |
|---|---|---|
| T1 ↔ T2 (notifications.js) | T1 adds the claim in `counts`; T2 adds `expiring` in `openCounts` | Same file, different functions: no conflict |
| T1 ↔ T2 (retention.js) | T1 exports EXEMPT; T2 uses it for the Expiring count | Consistent |
| T1 ↔ T2 (tests/server/retention.test.mjs) | T1 creates, T2 appends | Consistent |
| T1 self | tests vs code: counts hook awaited via call() pending list | helpers.call awaits waitUntil promises: tests see effects |
| T2 self | e2e + privacy text | Privacy text must drop "or make them anonymous" (E4 deletes) |
Ruling: T1 dispatch carries "do not reuse the manual remove() row-by-row; set-based SQL only" — remove() is per-applicant; E7 needs fixed statement count — cost if wrong: batch may exceed D1 limits on large backlogs.

BASE T1: 5891cef
T1 implementer done d59e789 (369+13). Concern EXEMPT scans sales: Ruling — add index sales(applicant_id) to 0014 in the fix round; spec E10 updated — cost if wrong: one extra tiny index
Task 1: complete (d59e789 + controller fix 5a04af3: sales_applicant index, pass log). Reviewer approved; fetch-restore minor parked (siblings don't restore either).
BASE T2: 5a04af3
T2 implementer done bbd1740 (375+13, build, e2e OK). Concerns: archived searches listed; UTC date label; seed contact 5; Timeline tab black pill (pre-existing?)
T2 review: Approved; 5 minors sent as fix round 1 (stale Kept until after Apply, chip wording 'Kept until', Archived marker, two-search exemption test, disabled button). Timeline black pill: not this diff (pre-existing) — check in final review.
Task 2: complete (bbd1740 + fix round 1 6878607; 376+13, build, e2e OK)
Final review (opus): Ready after fixes. Rulings for the single fix wave:
- I1 fix: touch in sales.js change() (gated on changes()) AND exempt contacts with an open offer (pending/countered) in CONTACTS and EXPIRING — cost if wrong: an abandoned open offer keeps a person until someone withdraws it (visible in Sales).
- I2 fix: touchByViewing on confirm/reschedule/complete (not no_show/cancel).
- I3 fix: retention_run stores {date, ok, attempts, contacts, viewings}; claim re-winnable same day when !ok and attempts<3; visibility via M3 (overdue contacts stay in the Expiring badge). No separate error UI — cost: an error is seen only as a growing badge.
- I4 fix: privacy text adds "an offer" and the 5-year sale sentence.
- M1 fix (claim also from notifications list()); M2 fix (Jersey-day cutoff); M3 fix (drop lower bound: overdue counted); M4 fix (title on badge); M5 fix (drop disabled, keep guard); e2e screenshot animations disabled.
- M6 parked: ponytail comment naming the ceiling (cache like rentals_count if band > ~100). M7 parked (wording fine).
Fix wave bc30598 (382+13, build, e2e OK). Concerns: ifEvent option added to resolveNotices; detail line uses NO_SALE (open offer shows Kept until); leap-day same-day; concurrent polls may burn attempts.
Re-review of bc30598: Approved (21 mutations, all real ones caught). Minor #2 (BST first hour could delete <12 months) fixed by controller: 2d6b5eb, with test failing without it.
Parked: #1 simultaneous polls may burn retry attempts (harmless; lease if failures appear); #3 open-offer buyer past 12 months shows a past "Kept until" (NO_SALE line) — show "Kept while an offer is open" if staff are confused; #4 leap day 29 Feb deleted on 1 Mar (still >= 12 months). M6 cost ceiling noted in code. 5-year sale purge: before 2031.
