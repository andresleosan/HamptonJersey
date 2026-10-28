# SDD ledger — plan: docs/superpowers/plans/2026-10-28-hampton-app-public-interest.md
Spec: docs/superpowers/specs/2026-10-28-hampton-app-public-interest-design.md
Executor: inline (executing-plans) on main; one commit at the end with code, tests and docs (Luis's /avanzar rule).

## Pre-flight scan
| Rows | Finding |
|---|---|
| T1 -> T2 `interest` | T2 consumes `interest: number|null` (2 or more, or null) from toPublic — consistent |
| T1 self | interestSql binds: the id's own first, then interestDates(); readLive binds the dates before `l.id = ?` (the subquery is in the SELECT list) — consistent |
Scan clean.

Task 1: Ruling: interestSql returns the whole SELECT, not a parenthesised scalar subquery as the plan's Interfaces said; the website wraps it in parentheses — the parenthesised form put SCAN CONSTANT ROW into the panel's query plan and failed the existing never-a-scan test; this way the panel's statement is the same as before — cost if wrong: none.
Task 1: complete (RED: the 3 new tests failed with interest undefined; GREEN: npm test 418 + 14 OK).
Task 2: Ruling: Playwright MCP cannot launch Chrome as root (no --no-sandbox), so the browser look used chrome-devtools MCP at 1280x900 and 390x844 (mobile, touch) — cost if wrong: none (same Chromium).
Task 2: complete (RED: e2e timed out waiting for .summary .interest while the API already sent 2; GREEN: npm test, build, e2e OK after a fresh reseed).

Final review: a workflow with four lenses (correctness, security and privacy, design and copy, simplicity and performance), each lens's findings checked by a skeptic. 11 confirmed, 8 rejected.
Final: fixed one person counted twice (a web booking plus a phone-only booking from the panel, or one phone typed two ways) — the person key now gives a phone-only viewing the email of another viewing of the listing with the same phone, comparing phones by their last 10 digits without spaces, dashes, dots or brackets — test "GET /listings: one person booked online and again by phone, or with one phone typed two ways, counts once" RED (4 vs 2) → GREEN; the panel's tests and query plan unchanged; suite 419/419 + 14, build, e2e OK.
Final: Ruling: three Minor findings fixed in the same pass (the note's lone last word on desktop: text-wrap:balance; a space between the bold line and the note for screen readers; the privacy notice lists the new use and names its legitimate interest) — Luis asked on 28-oct for interfaces done right, and §7.2 wants every use in the notice — cost if wrong: three one-line changes.
Final: Ruling: a web booking without a phone plus a phone-only panel booking of the same person still counts twice, because no data links them — written into VIS-02 with the workaround (enter the email when booking by phone) — cost if wrong: the public number can show one extra person until the team edits the booking.
Final: Ruling: the checklist's other evidence pointers stay pinned to its base 127c7ef ("Código comprobado"); VIS-01, VIS-02 and VIS-03 point at the new lines — cost if wrong: a reader of an older item lands a few lines off.
Final: minor (deferred): tests for the rule's "from today", no-show and Jersey-midnight edges.

Docs audit (same session, Luis's new /avanzar rule: check the docs against `Hampton APP.md` and the architecture): Luis's text is fully covered. From the architecture: 3 new items (ADM-20 2025 tenancy law limits, ADM-21 export to accounting, BUS-19 which market sources may be read) and 5 corrected (BUS-11, BUS-13, BUS-14, ADM-11, PUB-08). ESTADO.md: 15 outdated statements fixed (live phases, deploy steps already done, missing features). A tailnet address and private note paths were removed from the checklist evidence (AUT-03, PRE-14).
