# SDD ledger — plan: docs/superpowers/plans/2026-10-24-hampton-app-f7a.md

Spec: docs/superpowers/specs/2026-10-24-hampton-app-f7a-design.md (I1–I13). Execution: subagents opus, effort high (Luis). Base before Task 1: see git log after "Plan F7-A".

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2 | `POST /api/stats` {listing_id, metric} 204/400 → `track()` | consistent |
| T1 → T3 | `daily_stats(day, listing_id, metric, n)` → views block | consistent |
| T2 ↔ T4 | both edit `tests/e2e.cjs`; T2 seeds `daily_stats` rows used by T4's check | consistent (T2 first) |
| T3 → T4 | JSON blocks period/totals/demand/unmet/views/funnel/times → screen | consistent; inner names are T3's, T4 reads T3's report |
| T1 self | Jersey-day test says "use the clock technique of viewings.test.mjs (mock Date)" but that file passes Dates explicitly, no mock | Ruling R1 |
| T2 self | e2e check "/api/stats aborted → no pageerror" against `.catch(() => {})` | consistent |
| T3 self | tests assert exact numbers; spec I11 cohort = cases started in period | consistent after spec fix |
| T4 self | budget format via `show("budget_max")` + " a month" vs spec §5 "/ month" | Ruling R2 |
| T5 self | docs only | consistent |

Ruling R1: Task 1's Jersey-day test uses `mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-07-01T23:30:00Z") })` from `node:test` (reset after) — no existing helper; the plan's pointer was wrong — cost if wrong: one test rewritten.
Ruling R2: budgets show as the panel already does (`show("budget_max", v)` + " a month"), not "/ month" — consistency with Review beats the spec's example text — cost if wrong: a string change.

## Tasks
Task 1: dispatched (BASE 8483c3d)
Task 1: review 1 → Important: array listing_id gives 500 (fix round 1 sent); minor (deferred): 400 message wording for null/[] body
Task 1: fix round 1 b68ea6b — verified by controller (one-line diff, stats 5/5); re-review skipped as trivial
Task 1: complete (d7add48, b68ea6b)
Task 2: dispatched (BASE b68ea6b)
Task 2: review 1 → Important: fetch sends cookies (plan defect; Ruling R3: credentials omit — spec §1 says no cookies — cost if wrong: none); minor: 500 variant (asked in same round); minor (deferred, Luis's call): tour counted even when fallback shows. Note for T4: the e2e itself writes today's daily_stats rows — T4 assertions must allow for them
Task 2: fix round 1 09f3275 — verified by controller (credentials omit + e2e cookie/500 checks; implementer ran e2e OK)
Task 2: complete (b5e9cdf, 09f3275)
Task 3: dispatched (BASE 09f3275)
Ruling R4: Task 3 builder choices accepted — viewing_requests total counts every origin (matches I9 "cualquier origen"); new_applicants = funnel registered; archived applicants out of times; Anywhere.listings null and Parish unknown applicant columns null (screen shows "—") — cost if wrong: one-line changes each.
Task 3: review 1 → Approved. Ruling R5: demand median_budget over every active applicant of the row (describes the parish's demand; Top unmet carries the unmatched-only median) — cost if wrong: one filter. minor (deferred): Most viewed may list a listing with views 0 (HAVING views > 0); minor (deferred): test module-level PERSONAL/contacts shared across worlds.
Task 3: complete (6957725)
Task 4: dispatched (BASE 6957725)
Task 4: implementer DONE_WITH_CONCERNS f9541ca — nav tightened panel-wide (email hidden ≤1535px), two extra empty-state lines; controller looked at data-1280/data-390 screenshots: OK
Task 4: review 1 → Approved. Ruling R6: email hidden up to 1535px accepted (sr-only + Sign out tooltip keep it reachable; the extra link needs the room) — cost if wrong: one breakpoint. minor (deferred → final fix wave): phone tables cut at a column boundary with no scroll hint; Most viewed named 3× (section/region/table); Rent/Buy caption vs h3 inconsistency; report flashes on period change; e2e one-line check before document.fonts.ready.
Task 4: complete (f9541ca)
Task 5: done by controller (docs only)
Final review (8483c3d..ede3e9c): With fixes. Important: (c) waiting counts applicants that can never be reviewed → Ruling R7 (waiting only if active and has a found match on an available listing — cost if wrong: a filter). Recommendation: WAF must gate the push → Ruling R8: WAF needs the custom domain, so the counter caps itself at 20k writes/day in SQL — cost if wrong: one day's counts stop at 20k. Minors: (b) boundary test, malformed JSON guard; plus deferred minors HAVING views>0, phone scroll cue, a11y name/heading, keep report on period change, fonts.ready. Declined/kept: tour counted on fallback (Luis's call), staff opens counted (I3).
Final fix wave: dispatched (BASE ede3e9c), brief final-fix-brief.md
Final fix wave: DONE_WITH_CONCERNS 39a87a0, 72268dc, e301c80 (json_valid guard in SQL too; region named 'Views by listing'; reads still cost after cap — accepted)
Final re-review (ede3e9c..e301c80): Approved, items 1–7 fixed. Residual minors: I4 rationale wording (fixed by controller), shadow gradient assumes white paper (no dark theme), cap test uses the real clock (flakes only at Jersey midnight) — accepted.
Controller verification: npm test 257/257 + 13 python OK.
