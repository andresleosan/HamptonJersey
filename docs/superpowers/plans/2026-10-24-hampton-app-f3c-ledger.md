# SDD ledger — plan: docs/superpowers/plans/2026-10-24-hampton-app-f3c.md

Spec: docs/superpowers/specs/2026-10-24-hampton-app-f3c-design.md (V1–V21). Execution: Luis chose "subagentes opus 5.5 effort high" (23-oct), so implementers and reviewers run on opus, effort high.

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2 | tables, `server/sales.js` (MILESTONES, validateOffer, OFFER_WAITING_MS) → offers routes | consistent |
| T1 → T3 | validateSale, validateMilestone, isOverdue, nextMilestone, milestoneLabel → sale routes, counts | consistent |
| T2 ↔ T3 | both write `server/routes/sales.js`; T3 complete/fall-through need the same stage and availability statements as T2 accept | Ruling R1 below |
| T3 → T4 | GET /admin/sales, /admin/sales/:id, counts.sales → Sales.jsx, SaleDetail.jsx | consistent |
| T3 → T5 | /admin/applicants/:id/offers, /admin/listings/:id/offers → ApplicantDetail, ListingEditor | consistent |
| T4 ↔ T5 | both edit Sales.jsx (T5 adds ?applicant=) and styles.css | sequential, no conflict |
| T4 ↔ e2e | completing a sale makes a listing sold; other e2e checks use HE-R001 | plan already says: dedicated seed listing for this flow |
| T1 self | tests (FK cascade/restrict, partial unique) match §3 | consistent |
| T2 self | "sold listing is 400" and "already under_offer by hand is accepted" both follow V17 | consistent |
| T3 self | archive/delete guards (V16) touch existing routes listed in Files | consistent |
| T4 self | e2e expects public "Under offer"/"Sold" pills; the site derives pills from status text | implementer checks how the public API maps availability |
| T5 self | Offers tab only for buy searches | consistent |
| T6 self | docs only | consistent |

Ruling R1: T2 writes the stage-change and availability-change statement builders as small functions inside `server/routes/sales.js` (conditional UPDATE + logEvent ifInserted), and T3 reuses them — so accept, complete and fall-through write identical event shapes — cost if wrong: a later refactor of three call sites.

Task 1: dispatched (BASE 7e699f8)
Task 1: implementer DONE_WITH_CONCERNS, commit ea4c05c, node 267/267 + python 13.
Ruling R2: keep counter_amount on accepted/rejected/withdrawn (pending must have none, countered must have one) — V21 prices an accepted countered offer from it and the history keeps it — cost if wrong: one CHECK line.
Ruling R3: sale price stays editable — a Jersey price is often renegotiated after survey; every change writes sale.updated with before/after — cost if wrong: drop one key from validateSale.
Ruling R4: Task 3 routes validate the merged row (stored + body) so shared_fee<=fee and done/not_needed never reach the DB CHECK as a 500; complete/fall-through set status, closed_at and reason in one UPDATE (Task 1's extra CHECKs) — carry to Task 3 brief.
Task 1: review Approved (no Critical/Important). Minors parked: nextMilestone relies on row order (WITHOUT ROWID returns key order) → carry to Task 3: rows ordered by MILESTONES before nextMilestone/response; shared_fee with blank fee message; partial-only FK indexes (negligible at this volume); UNIQUE assertion comment.
Task 1: complete (ea4c05c)
Task 2: dispatched (BASE ea4c05c)
Task 2: implementer DONE_WITH_CONCERNS, commit 84e0954, node 277/277 + python 13.
Ruling R5: test double now runs one batch at a time (D1 serialises writes too) — accepted; the race tests still fail with the guard off — cost if wrong: race only proven logically, e2e real-engine check could be added in Task 4.
Ruling R6: counter/reject/withdraw require a JSON body ({} allowed) — accepted, the panel sends {} — cost if wrong: a 400 for an empty-body client.
Ruling R7: PUT /admin/offers/:id without updated_at lock — accepted (two people correcting one offer at once is rare; each change writes offer.updated with before/after) — cost if wrong: last write wins on an offer correction.
Ruling R8: a seller may counter again (countered → countered, new counter_amount, offer.countered event) — real negotiations re-counter; buyer raising is still a new offer — goes to the fix round with the review findings.
Task 2: review Approved (no Critical/Important). Fix round 1 (resume implementer): R8 + minors 1, 2, 4. Minor 3 (reads between batch statements in test double) parked: pre-existing, no test depends on it.
Task 2: fix round 1 commit 7389ba0, re-review Approved. Minor parked: same-amount counter not short-circuited (writes a before=after event).
Task 2: complete (84e0954, 7389ba0)
Task 3: dispatched (BASE 7389ba0)
Task 3: implementer DONE_WITH_CONCERNS, commit f191a63, node 287/287 + python 13.
Ruling R9: V16 archive guard must live in the archive UPDATE (WHERE NOT EXISTS open offers / in-progress sale, then 409 on 0 changes) — check-then-write lets an offer slip in — fix round.
Ruling R10: concurrent milestone saves that trip the DB CHECK return 409 "Someone else changed this step. Reload to see it", not 500 — fix round.
Ruling R11: complete sets sold from any hand-set availability — a completed sale is sold — cost if wrong: one guard.
Ruling R12: sale/milestone edits do not touch the contact — V14 keeps buyers with a sale 5 years regardless of G2 — cost if wrong: one touch per edit.
Ruling R13: fee totals are 0 when nothing is due (a sum, shown as £0) — cost if wrong: display only.
Task 3: review Approved (no Critical/Important). Fix round 1 (resume implementer): R9, R10, minors 1-4. Minor 5 (winter year-boundary test can't distinguish Jersey/UTC) parked: code correct.
Task 3: fix round 1 commit 918b6cc, re-review Approved. Minors parked: applicant archive re-check gap can 500 (same tradeoff as LOCK); deleted-listing 0 rows shows busy message; array copy per step; duplicate request in a test.
Task 3: complete (f191a63, 918b6cc)
Task 4: dispatched (BASE 918b6cc)
Task 4: implementer DONE_WITH_CONCERNS, commit 223538a; npm test 289+13, build OK, e2e OK. Controller looked at probe-sales-1280 and admin-sale screenshots: layout reads well (full-page captures show the sticky bar mid-page, expected).
Ruling R14: native <dialog> showModal focus handling accepted as "focus trapped and returned" (the browser keeps Tab inside the modal and the page behind inert) — cost if wrong: a small focus loop.
Ruling R15: seed gains HE-R050 (sale flow) and buyer Helen Picot; three public counts updated — accepted, it isolates the flow as the plan asked.
Ruling R16: Mark completed uses confirm() like Archive — accepted, consistent with the panel.
Task 4: review Approved (no Critical/Important). Fix round 1 (resume implementer): minors 1-5 (nav headroom with 2-digit counts, 409 reload, stepDirty disable, focus after close, consistency). Minor 4b (modal non-modal after session expiry) parked: same as other dialogs.
Task 4: fix round 1 commit 4101302, re-review Approved. Minors parked: focus to body after a 409 removes the opener row; refocus flag survives a failed reload.
Task 4: complete (223538a, 4101302)
Task 5: dispatched (BASE 4101302)
Task 5: implementer DONE_WITH_CONCERNS, commit c4e244c; npm test 289+13, build OK, e2e OK.
Ruling R17: Timeline step names for passing/settled must not claim the freehold route — use route-neutral labels there ("Passing contract or completion", "Seller paid and duties settled") — fix round.
Ruling R18: after Record offer opens from #/sales?applicant=<id>, replace the hash with #/sales so a reload or the page button doesn't reuse the buyer — fix round.
Ruling R19: editor offers line loads once per open and counts backups as open — accepted, matches GET /admin/listings/:id/offers "open".
Task 5: review Approved (no Critical/Important). Fix round 1 (resume implementer): R17, R18, minors 1, 2, 3, 5. Parked: minor 4 (full applicant fetch for preselect), minor 6 (availability line repeats headline).
Task 5: fix round 1 commit 54be3aa, re-review Approved.
Task 5: complete (c4e244c, 54be3aa)
Task 6: done by controller (docs only): bcb9dbd Close F3-C
Task 6: complete (bcb9dbd)
Final review: dispatched (range 7e699f8..bcb9dbd)
Final review: With fixes. 0 Critical, 1 Important (listing offer history, spec success criterion 1), 6 Minor.
Triage: fix wave (one dispatch) = Important 1 + Minors 2 (partial index offers_open in unapplied 0012), 3 (withdraw buyer's other open offers on the same listing on record, "Superseded by a new offer", with events), 4 (ponytail ceiling note on fall-through recomputes), 5 (steps first below 960 px), 6 (done_on not after Jersey today), 7 (CAST sale_id) + recommendation 1 adapted: concurrent accept against local wrangler (real workerd SQLite) in e2e — never a preview (previews use prod D1).
Ruling R20: backup buyers whose offer closes stay at Offer (V6 moves only the sale's buyer; the team changes stage by hand) — parked as a note for Luis — cost if wrong: stage filters show stale Offer buyers.
Ruling R21: editor "N open offers" link stays unfiltered — parked.
Fix wave: commit 4ef445f; npm test 291+13, build OK, e2e OK twice; real-engine race 201/409.
Ruling R22: the buyer's own leftover open offer on the listing they bought is withdrawn with "Buyer bought this property" (clearer than V18's "Property sold") — cost if wrong: one string.
Ruling R23: sale file DOM puts Steps first (phone order = tab order); on desktop focus starts in the right column — accepted, steps are the daily work — cost if wrong: swap back with CSS order.
Fix wave re-review: dispatched.
Fix wave re-review: Approved. Minor parked: history table shows received date only (closing date is in the timeline).
Controller verification: npm test 291/291 node + 13 python (24-oct).
F3-C closed. Commits 1e77773 (spec) 7e699f8 (plan) ea4c05c 84e0954 7389ba0 f191a63 918b6cc 223538a 4101302 c4e244c 54be3aa bcb9dbd 4ef445f.
