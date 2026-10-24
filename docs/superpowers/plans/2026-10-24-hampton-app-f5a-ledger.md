# SDD ledger — plan: docs/superpowers/plans/2026-10-24-hampton-app-f5a.md

Spec: docs/superpowers/specs/2026-10-24-hampton-app-f5a-design.md (R1–R30). Execution: opus, effort high (Luis, 23-oct). Luis 24-oct: "ok sigue … preparado por si son más".

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2–T5, T8 | tables; LEGAL, ARREARS_STEPS, COMPLIANCE, paymentRef, REF_RE, addMonths, nextStep, complianceStatus, rentAssistant, earliestMoveOut, validators, parseMoney, parseBankDate | consistent; T8 imports parseMoney/parseBankDate from server/rentals.js in the panel (same as server/sales.js) |
| T2 → T3–T5 | rentalEvent helper, compliance rows | consistent |
| T3 ↔ T4 | T3's GET /admin/tenancies/:id lists `arrears`, but ARREARS_SQL is produced in T4 | Ruling P1 |
| T3 → T5 | ensureCharges(env, today) at the head of GET /admin/rentals | consistent |
| T4 → T5 | ARREARS_SQL for overview + counts | consistent |
| T5 → T6–T8 | GET /admin/rentals, statements, counts.rentals | consistent |
| T6 ↔ T7 ↔ T8 | all edit App.jsx routes and styles.css; T8 e2e statement uses T7's repair | sequential, no conflict |
| T6 seed | adds rental fixtures; other e2e checks must keep their counts | implementer checks public counts unaffected (rentals aren't listings) |
| T1 self | tests match §3 | consistent |
| T3 self | "renew after 15 April 2026 → 2025" vs LEGAL.regime2025From | consistent |
| T4 self | import hash includes n so identical rows in one file are two payments; re-import dedups | consistent |
| T5 self | CPU test is a reference on the node double, not a gate | consistent |
| T9 self | docs only | consistent |

Ruling P1: T3's GET /admin/tenancies/:id returns the tenancy, charges, payments, balance, assistant and contract deadlines; T4 adds `arrears` to that response when it builds ARREARS_SQL — the plan's ordering, without forward references — cost if wrong: none.

Task 1: dispatched (BASE 042e018)
Task 1: implementer DONE, commit fc92c0f, node 302/302 + python 13. Shared changes: server/sales.js exports fields/blank/obj/result, money() optional cap; server/viewings.js realDate fixed (threw 500 on 2026-13-01).
Ruling P2: rental_events.rental_id nullable for landlord events; compliance_items gains updated_at/updated_by — accepted (audit + lock) — cost if wrong: none.
Ruling P3: carry to Task 3: rent_changes unique per (tenancy, effective_on) → upsert; opening_balance 0 creates no charge.
Task 1: review Approved (no Critical/Important). Fix round 1: minors 1 (RPI bp floor) and 4 (REF_RE spaces).
Hand-offs (carry to later briefs): T2 routes merge stored row before validating (full needs fee; compliance kind ∈ COMPLIANCE); T3 merge for fixed needs end_on, set last_rent_change_on on rent change/renew (or use MAX of history), RPI saved with ≤2 decimals; T4 parseMoney null rows reported as ignored not errors, step ∈ ARREARS_STEPS; T5 repair create with status done needs cost/done_on → 400 not 500.
Parked: charges/payments without updated_at (events record who/when); no SQL CHECK on step/kind (precedent 0012); payments_unmatched unused by planner; parse nits (0,123; -0; DMY dots; year 0001; fee 0x10).
Task 1: fix round 1 commit 3bc1849 (2-line diff, checked by controller: bp floor and REF_RE as asked, tests added).
Task 1: complete (fc92c0f, 3bc1849)
Task 2: dispatched (BASE 3bc1849)
Task 2: implementer DONE, commit 8109bc5, node 309/309 + python 13.
Ruling P4 (shared definitions for T3–T5): active tenancy = ended_on IS NULL OR ended_on > jerseyToday() (a future move-out is still the current tenant; the unique index frees on any ended_on so the next tenancy can be entered, R24); ensureCharges filters rentals.service = 'full'; gas row ignored when has_gas = 0 (GET and counts); csv-map stores column indexes (integers); rentalEvent(env, ev, newest) third arg for ids inserted in the same batch.
Task 2: review Approved (no Critical/Important). Fix round 1: minor 2 (landlord change guard in batch), minor 4 (mid-save lock test).
Hand-off to T3: tenancy create (and end/renew) bumps rentals.updated_at in the same batch, so the R22 switch's tenancy read is covered by the rental lock (review minor 1).
Parked: R22 with two active tenancies sets one collect_from on both (edge; T3 tenancy edit corrects); percent() accepts "0x10"/"1e1" (still valid numbers); compliance PUT without lock (before/after logged).
Task 2: fix round 1 commit c495b49 (controller checked the diff: guard inside the batch, 409 mapping, two mid-save tests); 310/310 + 13.
Task 2: complete (8109bc5, c495b49)
Task 3: dispatched (BASE c495b49)
Task 3: implementer DONE, commit 515f0ad, node 321/321 + python 13.
Ruling P5: no charge on the ended_on day itself (rent in advance for a period that starts on move-out isn't owed); ending deletes later rent charges incl. hand-edited ones; tenancies.rent = latest agreed rent (charges read history); response key earliest_move_out; let_only drops collect_from — accepted — cost if wrong: small edits.
Ruling P6: collect_from stays non-editable through PUT (parked R22 two-tenancy edge) — a later collect_from correction would need charge clean-up rules Hampton hasn't given — cost if wrong: staff ends/re-enters a tenancy in that rare case.
Task 3: review Needs fixes — Important: moved collect_from (full→let_only→full) double-charges a month and the opening balance (reproduced). Fix round 1 (resume implementer): anchor series on existing charges + one opening only + skip ended tenancies + create runs for its own tenancy; R28 reprices due_on > today only; ended event records deleted charges; overlap guard in batch.
Ruling P7: PUT may still correct regime/kind/end_on/last_rent_change_on (data correction for tenancies entered wrongly; each change logged before/after) — cost if wrong: bypasses Renew's event.
Ruling P8: regime switch on 15 April itself counts as after (constant named regime2025From).
Task 3: fix round 1 commit 8c6185b, re-review Approved (edge probes pass). ensureCharges idempotent run 300×2y: 16.5 ms → 0.77 ms (node double). Parked: collect_from moved earlier doesn't backfill; opening charge created at once for a far-future collect_from.
Task 3: complete (515f0ad, 8c6185b)
Task 4: dispatched (BASE 8c6185b)
Task 4: implementer DONE, commit 6543323, node 332/332 + python 13. ARREARS_SQL binds ?1 today, ?2 tenancy|NULL; cols tenancy_id, rental_id, balance, oldest_unpaid_on, days_late, due_step, next_step. ~9-10 ms on node double with 300 owing (DB time on D1, not Worker CPU).
Ruling P9 (fix round): PUT /admin/payments/:id may move a payment to another full tenancy or back to unmatched (spec "o corregirlo"), with before/after event.
Ruling P10 (fix round): let_only tenancies accept manual payments of kind deposit/other (not rent).
Ruling P11 (fix round): imported rows dated after Jersey today are ignored with reason "Future date".
Ruling P12: ended tenancies get arrears null, debt shown in balance; PUT payment response shapes; import counts may be off under a concurrent write (no duplicates) — accepted.
Task 4: review Approved (no Critical/Important). Fix round 1: P9, P10, P11, strict dry_run, shared occurrences() with normalised key (server rejects duplicate key+n), 500 rows per request (client chunks; deviation from R9's 2,000 to bound CPU), repeat step mark → 200.
Ruling P13: import limit 500 rows per request, client sends sequential chunks — 2,000 SHA-256 + parse + 700 KB response may pass the 10 ms Functions CPU budget — cost if wrong: four requests instead of one.
Hand-off to T5: "in arrears" = next_step IS NOT NULL (not days_late 0 on the due date).
Parked: updatePayment catch null check (no delete path).
Task 4: fix round 1 commit 9559a97, re-review Approved. Spec R9 updated for 500-row chunks. Parked: chunked dry run may double-count by_hand in the preview (real import correct); 300-char check before whitespace collapse; P9 mid-save test.
Task 4: complete (6543323, 9559a97)
Task 5: dispatched
Task 5: implementer DONE, commit 738be70, node 339/339 + python 13. Overview median 12.9–14.3 ms on the node double (~8 ms SQL, ~4.5 ms JS); on D1 SQL time is not Worker CPU.
Ruling P14 (fix round): GET /admin/rentals/:id also returns the property's tenancies (current and past, newest first, without charges) and its last 100 rental_events, so Task 7 has its read path.
Ruling P15: repair transitions — approved/in_progress may go back to awaiting_approval; done and cancelled are final; approval_limit race unguarded — accepted. Statement includes properties that are full now; deposit/other shown per property outside totals; unmatched to-do shows newest 200 — accepted.
Task 5: review Needs fixes — Important: counts poll reads all rent history (≈14M rows/day at 300×2y vs D1 free 5M). Fix round 1: covering indexes in 0013; P16 cached rentals count (10 min, invalidated by rental writes); approval on max(quote, cost); rounding comment. Spec updated (R14, R15, R16).
Ruling P16: rentals count cached 10 minutes in app_settings and deleted by every rental-domain write — the badge moves at once after actions and history isn't re-read each 30 s — cost if wrong: badge up to 10 min stale after a day change.
Note for ESTADO at close: right after entering existing properties the badge will be high (missing checks and undone contract deadlines count until recorded).
Task 5: fix round 1 commit 8f2b1b1 (P14 included). Overview 12.6→9.9 ms focused; counts 5.2→1.0 ms cached / 2.8 ms recompute.
Ruling P17: cache invalidation via one AFTER INSERT trigger on rental_events (every rental write logs one) instead of 19 DELETEs — first trigger in the codebase; check on first remote migrate — cost if wrong: switch to explicit DELETEs.
Ruling P18: a final cost above an already approved quote doesn't re-block done (the landlord approved the job) — parked.
Task 5: re-review Approved (trigger survives wrangler's splitter; every rental write logs an event). P18 stays parked.
Task 5: complete (738be70, 8f2b1b1)
Task 6: dispatched (BASE 8f2b1b1)
Task 6: implementer DONE, commit ed05f3e; npm test 342+13, build OK, e2e OK.
Ruling P19 (fix round): the counts recompute (only when the cache is stale) runs ensureCharges(env, today) first in the same batch, so the badge never misses a month nobody opened Rentals for; then the seed no longer needs pre-generated charges.
Task 6: review Approved (no Critical/Important). Fix round 1: P19 + minors 1-6, 8. Minor 7 (actions inside table scroll on phone) parked as the accepted pattern.
Task 6: fix round 1 commit 4e8cf83 (new GET /admin/tenancies?q= for Assign), re-review Approved; 345+13, e2e OK.
Task 6: complete (ed05f3e, 4e8cf83)
Task 7: dispatched (BASE 4e8cf83)
Task 7: implementer DONE, commit a356b20; 345+13, build OK, e2e OK. Dialogs split into RentalDialogs.jsx; REPAIR_NEXT moved to server/rentals.js; property read adds landlord contact + approval_limit; fixed a Task 6 e2e race.
Controller note on t7-rental-desk.png: the tenancy card shows only the scheduled rent ('£1,290 pcm from Thu 16 Sept 2027') and hides today's rent — must show today's rent and 'rises to £X from <date>' → goes to Task 7 fix round.
Task 7: review Needs fixes — Important: card and Change rent show the scheduled rent, not today's (also the controller's note). Fix round 1: today's rent + "rises to"; minors 1-6.
Ruling P20: with a rise scheduled, the assistant bases the next maximum on the scheduled rent (the next change follows it), stated in the dialog.
Ruling P21: New tenancy hint becomes "collect from the next rent day" (picking a passed rent day this month creates arrears at once); spec/plan text updated.
Task 7: fix round 1 commit b428544, re-review Approved. Carry to final fix wave: current_rent before the start date falls back to tenancies.rent (latest agreed) — use the start-date rent instead; "0" rejected client-side in Owed today (server allows; blank equivalent).
Task 7: complete (a356b20, b428544)
Task 8: dispatched (BASE b428544)
Task 8: implementer DONE, commit c7034c0; 345+13, build OK, e2e OK twice. Statement response adds fee_percent per property.
Task 8: review Approved (no Critical/Important). Fix round 1: stray quote / unterminated quote, windows-1252 fallback, BOM literal, statement stale guard, e.parts guard, date reason mapping, persistent status line. Parked: landlord list via overview.
Task 8: fix round 1 commit e771c74 (controller checked parseCsv/decodeCsv: quote only at cell start, unclosed quote throws, utf-8 fatal → windows-1252); 347+13, e2e OK.
Task 8: complete (c7034c0, e771c74)
Task 9: done by controller (docs): 155779a Close F5-A
Task 9: complete
Final review: dispatched (range 042e018..HEAD)
Final review: With fixes. 1 Critical (no correction path for collect_from / planned move-out; recovery sends rent to an ended tenancy), 6 Important (payments not correctable in UI; full→let_only leaves future charges; list arrears mark/filter hides debtors after the last step; counts gate reads every tenancy; by-hand merge ignores kind; list shows scheduled rent), minors.
Ruling P22 (supersedes P6 in part): collect_from may be moved LATER (non-edited rent charges before it are deleted, with event); moving earlier → 400 (enter earlier months as an opening balance); create requires collect_from when start_on is before the current Jersey month. A future ended_on can be cancelled or moved (charges regenerate). Import sends references of tenancies ended more than 60 days ago to Unmatched.
Ruling P23: payments correction in the panel: move/unassign any payment; amount/date edit for manual payments only; each with before/after events on both properties when moved.
Ruling P24: full→let_only deletes rent charges due after today and not edited, in the same batch, logged.
Ruling P25: the list's arrears mark/filter = owing and at least 1 day late; to-do and count keep next_step.
Ruling P26: overview cost — search/filter reloads use a list-only mode (no to-do, no ensureCharges); Statements uses a small landlords query; GST editable on the Statement page.
Fix wave: dispatched.
Fix wave: commits a9d83c4 5d8eed5 749efee; 360+13, build OK, e2e OK. Re-review dispatched.
Fix wave re-review: Approved (counts gate O(1): 0.58 ms at 300 and 0.63 ms at 30k tenancies with a fresh cache; anchor probes clean). Follow-up (resume fix implementer): opening balance can be added while none exists (re-review c), merged manual payment not editable, hint only where usable.
Parked: Move offers only full tenancies for deposit/other (Unassign+Assign works); opening charge keeps its old date after collect_from moves later; \b drops references glued to a word (→ Unmatched).
Follow-up: commit 4732ee0 (controller checked the diff: opening charge inserted directly with NOT EXISTS guard, locked once made; merged manual payment not editable → 409). Controller verification: npm test 361/361 node + 13 python.
F5-A closed. Commits 12dda97 6c040ec (spec) 042e018 (plan) fc92c0f 3bc1849 8109bc5 c495b49 515f0ad 8c6185b 6543323 9559a97 95dbc38 738be70 2faaa21 8f2b1b1 ed05f3e 4e8cf83 a356b20 b428544 c7034c0 e771c74 155779a a9d83c4 5d8eed5 749efee 4732ee0.
