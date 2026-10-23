# SDD ledger — plan: docs/superpowers/plans/2026-10-23-hampton-app-f3a.md

Spec: docs/superpowers/specs/2026-10-23-hampton-app-f3a-design.md (C1–C16). Execution: Luis — "subagentes opus 5.5 effort high". Base: a2d3b96 (plan commit).

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T2 | status CHECK values → STATUSES/ACTIVE | agree |
| T1 → existing code | new status CHECK → inbox.js STATUSES (new/contacted/closed), admin/events/public tests, tests/fixtures/seed.sql | CONFLICT: suite breaks at T1. Ruling below (R1) |
| T2 → T3 | daySlots/isFree/validateViewing → viewing-store, public.js | agree |
| T2 → existing public.js | validateViewing signature change | CONFLICT: call site breaks at T2. Ruling R2 |
| T3 → T4 | loadAvailability(includeInactive, negotiatorId) → GET /admin/availability | agree |
| T3 → T5 | bookStatement (INSERT) → reschedule (UPDATE) | GAP: reschedule needs an UPDATE … WHERE NOT EXISTS. Ruling R3 |
| T4 ↔ T1 | DEFAULT_HOURS constant vs seeded JSON in SQL | duplication forced by SQL migration; accepted (R4) |
| T5 → T7 | API shapes → Viewings.jsx/SlotPicker | agree |
| T6 ↔ T7 | both touch App.jsx, styles.css | sequential; no conflict |
| T3 → T8 | /api/availability + POST shape → site form | agree |
| T1 self | tests vs migration | consistent |
| T2 self | "grid time" in validation vs isFree | fixed in plan before commit (HH:MM only in validation) |
| T3 self | atomic batch mechanism left to implementer with test | ok |
| T4 self | ok | |
| T5 self | optimistic locking via updated_at | ok |
| T6/T7/T8 self | browser checks | ok |
| T9 self | concurrency script in scratchpad, not repo | ok |

- Ruling R1: T1 also moves inbox.js STATUSES to the five new values (notice resolves when leaving `requested`), updates the old-status tests and tests/fixtures/seed.sql to new values; the panel's Viewings.jsx stays until T7 (no deploy in between) — keeps suite green per task — costs a short window where the local panel's viewing tabs are stale.
- Ruling R2: T2 updates the public.js call site to the new signature and the existing POST tests to send a seeded negotiator_id; slot checks stay T3 — keeps suite green — cost: T3 touches the same tests again.
- Ruling R3: T5 adds `rescheduleStatement` to server/viewing-store.js sharing the overlap SQL fragment with bookStatement — one overlap rule — cost: none.
- Ruling R4: DEFAULT_HOURS lives in server/viewings.js and the same JSON is seeded in 0010 — SQL can't import JS — cost: two places if the default changes (only the panel default for new negotiators).

## Tasks
Task 1: implementer DONE_WITH_CONCERNS 7aae77b (sqlite_sequence carry-over added; panel Viewings stale until T7 per R1)
Task 1: review spec ✅ quality approved (task-1-review.md)
Task 1: minor (deferred): 0010 comment cites DEFAULT_HOURS before it exists (Task 4 must use that exact name)
Task 1: minor (deferred): sqlite_sequence carry-over verified on local D1 only — deploy note: if remote apply refuses it, drop those lines
Task 1: minor (deferred): seed row agent NULL → 'Joshua Franco' (Task 9 seed rework starts there)
Task 1: Ruling: deploy window (panel breaks once 0010 is remote with old code) — apply 0010 remote immediately before the F3-A push; goes in deploy steps
Task 1: complete (7aae77b)
Task 2: implementer DONE_WITH_CONCERNS df579dd (web refuses Sundays per C11, panel any day; unknown negotiator 500 until T3)
Task 2: security hook (MEDIUM) — POST /api/viewings accepts any HH:MM without slot check. Ruling: by design Task 3 adds isFree + atomic NOT EXISTS insert; nothing deploys before T3; T3 brief must close it
Task 2: review spec ✅ quality approved (task-2-review.md)
Task 2: minor (deferred): viewings.js:104 email-or-phone check uses raw src.phone (whitespace phone → misleading "too long" error)
Task 2: minor (deferred): viewings.js:83-84 whitespace/non-string note → "Note is too long"
Task 2: minor (deferred): viewings.js:44 local `span` shadows module-level `span`
Task 2: Ruling: website = Mon–Sat (C11) → /api/availability (website mode) omits Sundays so form never offers a slot POST refuses — carried into T3
Task 2: Ruling: overlap margins computed in JS with addMinutes, never SQLite time() — carried into T3/T5
Task 2: Ruling: T4 rejects a second `open` exception on the same date (409/400) — carried into T4
Task 2: complete (df579dd)
Task 3: implementer DONE_WITH_CONCERNS c3dfce3 (days counts Mon–Sat days in website mode; excludeId only via clash(); from beyond 60d accepted by GET)
Task 3: review spec ✅ quality approved (task-3-review.md)
Task 3: verify in T9: changes() carry-over between statements of one D1 batch (ifInserted) — proven on local workerd only
Task 3: minor (deferred): public.js:104-106 POST assumes a.days[0] is requested date (Sunday from shifts to Monday; unreachable today)
Task 3: minor (deferred): GET /api/availability accepts past/>60d `from`
Task 3: minor (deferred): bookStatement excludeId is a no-op for INSERT — T5 must use clash(v, id)
Task 3: minor (deferred): viewing-store.js:187-188 dense days mapping
Task 3: minor (deferred, pre-existing): stray "Error: D1 down" console line in npm test
Task 3: complete (c3dfce3)
Task 4: implementer DONE_WITH_CONCERNS 6043501 (past-dated exception 400; name UNIQUE case-sensitive; no stale-save 409 on negotiator PUT; availabilityRange exported from public.js)
Task 4: review spec ✅ quality approved (task-4-review.md)
Task 4: minor (deferred): negotiators.js:95 malformed negotiator_id 400 says "Unknown negotiator" (same as 404)
Task 4: minor (deferred): negotiators.js imports availabilityRange from routes/public.js — T5 moves it to viewing-store.js if it needs it
Task 4: minor (deferred): duplicate negotiator names case-sensitive (UNIQUE) — Ruling: accept; 2-person team, panel shows the list
Task 4: minor (deferred): missing tests: reactivate → back on public availability; role null stored NULL; exception created_by
Task 4: minor (deferred): PUT bad body to unknown id → 400 not 404
Task 4: carried into T5: test reschedule of an inactive negotiator's viewing onto an active one (Review Focus 4)
Task 4: complete (6043501)
Task 5: implementer DONE_WITH_CONCERNS ff35266 (target negotiator must be active; action wins over notes; ?status removed; raw status in 409 text; resolveNotices ifLogged; ifInserted reused after UPDATE)
Task 5: review spec ✅ quality changes requested (task-5-review.md): I-1 active_interest/listing filter scans without listing_id index
Task 5: Ruling: I-1 index goes into 0010 (not applied remote yet)
Task 5: Ruling: M-1 (plan-mandated raw status in 409 text) conflicts with plain-English UI — map statuses to labels; into fix round
Task 5: Ruling: M-6 remove bookStatement's unused excludeId (our own orphan); into fix round
Task 5: minor (deferred): M-2 unfiltered tab counts read whole table each load (same as before)
Task 5: minor (deferred): M-3 PUT with action+notes drops notes silently
Task 5: minor (deferred): M-4 phone-only interest dedup on raw phone text
Task 5: minor (deferred): M-5 cancel from confirmed untested
Task 5: fix round 1/5 (3 addressed, 0 open — I-1 listing index, M-1 plain-English 409, M-6 excludeId removed; commits ff35266..68d2ca5)
Task 5: complete (ff35266, 68d2ca5)
Task 6: implementer DONE_WITH_CONCERNS dbde82a (nav wraps at 1280 until T7 rename; add form not guarded by unsaved, like Users/Tours)
Task 6: review spec ✅ quality approved (task-6-review.md)
Task 6: verify after T7: nav fits one line at 1280 after "Viewings" rename
Task 6: minor (deferred): focus drops to body after Save details/Save hours (button disables), and after failed Remove (Availability.jsx:165,189,202)
Task 6: minor (deferred): Cancel/Add in Add negotiator form drop focus (same as Tours)
Task 6: minor (deferred): duplicate-name 409 doesn't mark Name field invalid
Task 6: minor (deferred): "No negotiators yet" empty state lacks inline button (DESIGN.md:277)
Task 6: minor (deferred): hard-coded 10:00/17:30 and "30-minute" instead of DEFAULT_HOURS/SLOT_MINUTES
Task 6: minor (deferred): styles.css .unsaved rule duplicated (241 vs 106)
Task 6: minor (deferred): 390px "All day" checkbox misaligned in exception form
Task 6: minor (deferred): pure helpers toWeek/toHours/weekErrors/exceptionText untested
Task 6: complete (dbde82a)
Task 7: implementer DONE_WITH_CONCERNS 7eccd8c (email hidden visually <1440px to keep nav on one line; interest via full listing detail per selection; reschedule picker reads Requests+Upcoming lists client-side to free own slot)
Task 7: review spec ❌ quality changes requested (task-7-review.md): I1 pager focus lost; I2 full listing detail per click for interest; I3 409 moving viewing out of tab drops typed notes
Task 7: Ruling: I2 — add light endpoint GET /admin/listings/:id/interest → {active_interest} (same SQL as listings.js detail, shared); Viewings uses it — cross-task server change accepted, cost: one more route
Task 7: Ruling: M4 — add `exclude=<viewing id>` to GET /admin/availability using clash excludeId; drop the client-side booked rebuild — one rule on the server
Task 7: Ruling: M7 — New viewing uses a slim listing list (id, title, published, archived) instead of full /admin/listings — reuse an existing light query if present, else `?slim=1`
Task 7: Ruling: M8 — accept hiding the signed-in email visually below 1440px (SR + Sign out tooltip keep it) — Luis delegated design calls; cost: revert one CSS rule
Task 7: M5, M6, M9, M10 go into the fix round (cheap UI correctness)
Task 7: fix round 1/5 (8 addressed, 1 open — M6 booked() on Upcoming tab still drops dirty notes; commits 7eccd8c..0b6b2ae). New minor: declined leaveDetail leaves Upcoming counter stale
Task 7: fix round 2/5 (2 addressed, 0 open; commits 0b6b2ae..24c6e39)
Task 7: complete (7eccd8c, 0b6b2ae, 24c6e39)
Task 8: implementer DONE 8b256e4 (minor: no time chosen after day/agent change or 409; Book-with during load refetches; nextViewingDay removed; e2e seed dated 2026-10-28)
Task 8: review spec ✅ quality approved (task-8-review.md)
Task 8: minor (deferred): site/index.html:514 400 for vanished slot/deactivated negotiator doesn't refetch availability
Task 8: minor (deferred): day/agent change leaves no time chosen (native required catches)
Task 8: minor (deferred): "Book with X" for a team.json member absent from API gives no feedback
Task 8: minor (deferred): first free day not scrolled into view at 390px
Task 8: minor (deferred): s.time/n.id/date interpolated without esc() (safe via parseAvailability)
Task 8: minor (deferred): e2e lacks API-down (C13) and disabled-day checks
Task 8: minor (deferred): pre-existing Turnstile console warning filtered
Task 8: complete (8b256e4)
Ruling: Task 9 Step 2 (skills review + one fix round) is run as the SDD final whole-branch review + one fix wave, not by the T9 implementer
Task 9 step 1: real local D1 (workerd) concurrency PASS — run 1: 10 simultaneous POSTs same slot → 201×1, 409×9; 1 row, 1 event, 1 notice, event entity_id = viewing id. Run 2: 5×14:00 + 5×14:30 (overlap via 15-min margin) → 201×1, 409×9; one row. Confirms changes()-carry-over (ifInserted) on workerd. Log: scratchpad/concurrency/log.txt
Final review (final-review.md): ready with fixes; 0 Critical, 3 Important
Final: Ruling I-1 (0010 on remote unproven): keep sqlite_sequence lines (a D1 migration that fails rolls back, nothing applied, push not done); deploy steps add remote pre-flight SELECTs (status/agent mapping) and "stop if the apply errors"; cost: one failed deploy step
Final: Ruling I-2 (changes() carry-over): closed by Task 9 step 1 PASS on workerd (1 row/1 event/1 notice of 10 concurrent); watch first remote bookings
Final: I-3 Availability focus → fix wave
Final: Ruling: per-email cap on requested holds — spec choice; recommend the WAF rate-limit rule already pending with Luis
Final: Ruling: home availability fetch per render and exceptions date index — stay (small)
Final: fix wave DONE ff8f50e 4943010 52052f5 b3c865c (13 items + Add exception focus + DELETE message); npm test 242+13, e2e OK
Final: re-review — 13/13 ADDRESSED, no new Critical/Important (final-rereview.md)
Final: minor (deferred): Availability step="1800" and exception defaults 10:00/11:00 hard-coded
Final: minor (deferred): Save buttons stay enabled while saving, extra presses ignored (intended, matches toggleActive)
Task 9: complete — ESTADO.md F3 row, e2e header reseed note; npm test 242 + 13 pass; e2e OK (fix wave run)
