# SDD ledger — plan: docs/superpowers/plans/2026-10-25-hampton-app-owner-report.md
Spec: docs/superpowers/specs/2026-10-25-hampton-app-owner-report-design.md

## Pre-flight scan
| Rows | Finding |
|---|---|
| T1 -> T2 JSON shape | T2 consumes T1's exact shape (Interfaces block) — consistent |
| T1 self | tests list matches Interfaces; by_day zero-filled — consistent |
| T2 self | e2e needs a seeded listing with stats/viewings/offers — implementer seeds in tests/fixtures/seed.sql |
Scan clean.
BASE T1: a77c881
T1 implementer done 4e72a81 (387+13). Rulings on concerns: offer n stable across reports (may skip) — kept, consistency for the owner beats 1..k; milestones done-only + next — OK; stale past requests uncounted — OK; daily_stats scan per report (no listing-first index) — parked: report is on demand, ~40 listings×3×365 rows/yr; add index if Insights/report slows.
Task 1: complete (4e72a81, reviewer Approved). Ruling: a sold listing should show its completed sale (agreed price, completed date) — folded into Task 2 as a small server tweak (SALE = the in-progress sale, else the latest completed one) with a test. Notes toggle is client-side (API always sends notes) — Task 2 must remove notes from the DOM. BASE T2: 4e72a81
T2 implementer done fe098be (388+13, build, e2e OK). Controller looked at screen + print screenshots: layout good; print lacks @page A4 margins (fix round). Ruling: small read-only feature — the T2 task review also serves as the whole-range final review (a77c881..HEAD), one reviewer seat, opus — cost if wrong: less independent cross-task scrutiny.
Final review (T2 + whole feature): Ready after fixes; privacy/security clear. Fix wave sent to T2 implementer: business premium (Important), phone overflow on countered offers, applicants sentence, since-line wording, owner-facing copy, Price not published / hide not_stated, unknown days URL, @page A4 + break-inside.
Fix wave 54fff58 (388+13, build, e2e OK); controller verified tests, premium query, copy diff and 360px offers screenshot — no separate re-review (copy/CSS + one column). Task 2: complete.
