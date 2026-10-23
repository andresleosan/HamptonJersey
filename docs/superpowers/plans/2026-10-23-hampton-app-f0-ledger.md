# SDD ledger — plan: docs/superpowers/plans/2026-10-23-hampton-app-f0.md
Spec: docs/superpowers/specs/2026-10-23-hampton-app-f0-design.md · Models: opus, effort high (Luis) · Work on main (plan Global Constraints, Luis-approved); no worktree.
Start: bce6d85

## Pre-flight scan
| Rows | Produces / consumes | Finding |
|---|---|---|
| T2 → T3 | columns of contacts/applicants → validateApplicant value | T3 must set privacy_ack_at / marketing_opt_in_at timestamps; validator has no clock → Ruling below |
| T2 → T4/T5/T6/T11 | events, notifications (entity via join on events) | plan stores no entity cols in notifications, spec §3.1 lists them → Ruling below |
| T3 → T8 | admin imports ../../server/applicants.js through Vite | applicants.js must stay pure ESM (no Node-only imports) — carry in T3 dispatch |
| T4 → T6/T11 | logEvent(entity_id null = last_insert_rowid) | consistent |
| T4 / T11 | both modify server/routes/public.js | sequential, fine |
| T5 → T7 | /admin/notifications, /counts | consistent |
| T6 → T8/T9 | applicants API, assigned_name, 409 copy | consistent |
| T7 → T10 | e2e.cjs routes #/ → #/listings | consistent |
| T11 → T12 | /api/applicants/options | consistent |
| T1 self | tests vs step 3 (bronze never as text) | consistent |
| T2 self | backfill test builds DB by hand | consistent |
| T3–T6, T11 self | tests match interfaces | consistent |
| T7–T9 self | UI tasks verified by build + T10 e2e (no unit tests) | plan-mandated; acceptable |
| T10 / T12 | release 1 push vs release 2 commits on same main | pushing main later would ship release 2 → Ruling below |

Ruling: validateApplicant takes an optional third arg `now` (ISO string, default current time) and fills privacy_ack_at / marketing_opt_in_at from it — the validator stays pure and testable — cost if wrong: trivial refactor.
Ruling: notifications keep only event_id; entity read by joining events — spec §9 leaves internal structure to the builder and it avoids duplicated columns — cost if wrong: one migration adding two columns.
Ruling: build all tasks on main; release 1 is deployed by pushing the Task 10 commit by SHA (`git push origin <sha>:main`), never HEAD, while any TO CONFIRM remains — keeps release 2 off production without branches (branches would create Pages previews on prod D1) — cost if wrong: Luis must push a specific SHA.
Ruling: stop points: Task 10 Step 5 (remote migration + push need Luis's yes); Task 13 Step 2+ (needs Hampton's legal data); domain Steps 2–4 (need access). Everything else runs.
Task 1: dispatched implementer a830160459d9241a0 (BASE bce6d85)
Task 1: ⚠️ browser check — screenshots exist in scratchpad/shots (controller checked); .pill.offer/.badge.archived CSS-only — accepted.
Task 1: minor (deferred): .tabs (site:111), .seg/.nudge (panel) keep --line borders, not --field-line.
Task 1: minor (deferred): active media tab mixes --bronze border + --bronze-dk text (site:238); one-line unify if wanted.
Task 1: minor (deferred): design.test.js bronze guard only catches exact `color:var(--bronze)` form.
Task 1: complete (commits bce6d85..c96cdb3, review clean)
Task 2: dispatched implementer ade84dd9c64e2cc51 (BASE c96cdb3)
Task 2: carry → T6/T11 must set contacts.last_activity_at on insert; T3 normalizePhone guards digits-only after +
Task 2: minor (deferred, fix before remote apply): contacts.last_activity_at nullable — make NOT NULL (retention purge would skip NULLs).
Task 2: minor (deferred): email CHECK accepts '' / spaces; phone GLOB accepts '+1abc'.
Task 2: minor (deferred): no index notifications(event_id).
Task 2: minor (deferred): schema.test addApplicant duplicates helpers insert builder; back-fill test lacks 'contacted' row; hand-built DatabaseSync not closed.
Task 2: complete (commits c96cdb3..7ce6415, review clean)
Task 3: dispatched implementer aa4b3c7c3cfb348b3 (BASE 7ce6415)
Ruling: validateApplicant leaves stage/lost_reason/assigned_to to Task 6 routes — they are workflow, not form input — cost if wrong: small move later.
Ruling: panel fills privacy_ack_at only when privacy===true (overrides my earlier "always fill") — recording an acknowledgement nobody gave would be false consent — cost if wrong: none.
Ruling: pets stored as array of {kind,count} (spec showed one object) — households with a cat and a dog — carry to T8/T12 — cost if wrong: trivial.
Task 3: controller-confirmed gap: readJson 32 KB default can 413 a long listing save (description 20000 + summary 5000 chars) → listings/media routes need a larger limit. Goes into fix round with review findings.
Task 3: security hook finding (MEDIUM): readJson buffers whole body before size check → check Content-Length first and stream-count bytes. Goes into fix round.
Ruling: consent_source NULL when no consent timestamp is set — it names where a consent came from — cost if wrong: trivial.
Ruling: listings create/update use readJson(request, 256*1024) (file outside T3 brief, authorised) — validator allows ~54k chars — cost if wrong: none.
Task 3: minor (deferred): realDate duplicated from viewings.js; panel "Enter your name" wording; stretch msg when no max; "2,000" refused → T12 strips separators.
Task 3: fix round 1 dispatched (resume aa4b3c7c3cfb348b3): listings limit, streaming size cap, consent_source NULL. FIX_BASE 81247bc
Task 3: fix round 1/5 (3 addressed, 0 open; commits 81247bc..a69010d)
Task 3: complete (commits 7ce6415..a69010d, review clean)
Task 4: dispatched implementer a92d4f3b8c411d245 (BASE a69010d)
Task 4: ⚠️ "closes on Done" → Task 5 PUT /admin/notifications/:id (controller confirmed in plan). ⚠️ D1 batch chaining — documented D1 behaviour; verify in T10 e2e on wrangler local.
Task 4: minor (deferred): chaining test uses ids that all equal 1 — strengthen with diverging ids.
Task 4: minor → carried to T5 dispatch: logEvent stores data:null as 'null' — one-line fix `data == null ? null : JSON.stringify(data)`.
Task 4: minor (deferred): PUT to missing viewing runs resolveNotices before 404 (harmless).
Task 4: complete (commits a69010d..f72568b, review clean)
Task 5: dispatched implementer ae31c4890ffdf2cf7 (BASE f72568b)
Ruling: "active search" = archived_at IS NULL AND stage NOT IN ('lost','completed') (paused stays active) — a lost/completed search is over; same definition in T6/T9 — cost if wrong: one WHERE clause. Task 5 implemented archived-only → goes into fix round.
Task 5: carry → T6: permanent delete must set events.data to NULL (never ''), and resolve the entity's notices; T7 must always send box.
Ruling: duplicate link follows spec §3.3 order exactly (active same-operation → most recent → new), no extra "any open" step — spec is authority — cost if wrong: one ORDER BY term.
Task 5: minor (deferred): link() falls through to contact branch for unknown entity types; json_extract 500s on malformed data (guard with json_valid); "D1 down" stderr from admin.test.mjs:224 (pre-existing).
Task 5: fix round 1 dispatched (resume ae31c4890ffdf2cf7): active-search stage rule, spec link order, index-friendly joins. FIX_BASE 0749c43
Task 5: fix round 1/5 (3 addressed, 0 open; commits 0749c43..8cccbc9)
Task 5: complete (commits f72568b..8cccbc9, review clean)
Task 6: dispatched implementer a9df0a231c7448ecf (BASE 8cccbc9); authorised: 0008 last_activity_at NOT NULL (deferred T2 minor)
Task 6: carry → T8/T9: PUT partial; source read-only; archive/restore bump updated_at; JSON lists as arrays in detail; duplicates carry notice id; actor→name via /admin/users; no "Unassigned" filter (assigned=none if wanted).
Task 6: carry → T10 e2e: confirm stale-save lock error text on wrangler D1 (NOT NULL constraint failed: applicants.updated_at).
Ruling: permanent delete leaves viewing_requests untouched (G4: not linked in F0); erasure of those is via Viewing requests delete — cost if wrong: an erasure request needs two deletes.
Task 6: ⚠️ D1 lock wording → confirmed as real gap (500 instead of 409 risk) → fix round.
Task 6: minor (deferred): PUT on a row deleted mid-flight writes an event after the wipe (refuse PUT on archived or guard event INSERT); DELETE lacks in-batch archived guard; contact-route "reload the applicant" wording; create skips asObject; partial local phone q (07797 123) can't match; repeated raw event+notice test setup.
Task 6: fix round 1 dispatched (resume a9df0a231c7448ecf): active_search_id + POST 409, lock independent of error wording. FIX_BASE 6857e1f
Task 6: fix round 1/5 (2 addressed, 0 open; commits 6857e1f..cbad6bc)
Task 6: minor (deferred): one-active-search check is read-before-batch (two simultaneous POSTs could both pass).
Task 6: complete (commits 8cccbc9..cbad6bc, review clean)
Ruling: Task 7 registers only routes whose screens exist; Tasks 8/9 add #/applicants routes and the nav item — anti-goal "nothing for later" — cost if wrong: none.
Task 7: dispatched implementer a7bb54f7b2b80bf2e (BASE cbad6bc)
Ruling: Inbox category counters show only in Needs action — counts are pending work; Feed has nothing pending — cost if wrong: one condition.
Task 7: ⚠️ #/applicants links dead until T8/T9 — both land before any deploy (T10 gate).
Task 7: minor (deferred): focus lost after Done (WCAG 2.4.3) — move focus to next notice; guard n.link with /^#\//; /counts errors swallowed; double poll on visibility return; no unit test for fmtAgo; Feed empty state has no next action.
Task 7: complete (commits cbad6bc..59773a8, review clean)
Task 8: dispatched implementer a81d001474c98e0e6 (BASE 59773a8)
Ruling: accept GET /admin/contacts/:id added in T8 (needed for #/applicants/new?contact=) — no other endpoint returns a contact — cost if wrong: 3 lines.
Task 8: carry → T9: use ApplicantFields' toForm/toBody and `contact` prop; page root must not be a <section> holding the fixed .actionbar (rise animation pins it); unsaved.js wording is listing-specific.
Task 8: ⚠️ #/applicants/<id> links → Task 9 adds the route (before any deploy).
Task 8: minor (deferred): duplicate flow needs an extra submit after operation switch; fieldset + inputs both carry aria-describedby; "already a contact" styled .err; ?contact= error state lacks heading.
Task 8: fix round 1 dispatched (resume a81d001474c98e0e6): lost_reason in list, unsaved warning + generic unsaved.js wording, scroll-padding. FIX_BASE 80d3e15
Task 8: fix round 1/5 (3 addressed, 0 open; commits 80d3e15..af4d0d1)
Task 8: minor (deferred): long lost_reason in mobile card widens auto stage column and squeezes the name.
Task 8: complete (commits 59773a8..af4d0d1, review clean)
Task 9: dispatched implementer ae63dd9c49d9b6789 (BASE af4d0d1)
Task 9: carry → T11: applicant.duplicate_submitted data must be the flat submission with API field names (+ optional other_contact_id) — T9's strip compares on it.
Ruling: Copy fields never copies `operation` — a different-operation duplicate is a second search, not an edit (spec §3.3) — goes into T9 fix round.
Ruling: Stage and Assigned to save immediately (outside the Save bar) — they are single-click workflow actions like ListingEditor's publish — cost if wrong: small UX change.
Ruling: Stage/Assigned to save on an explicit Apply (not on change) — keyboard arrows fired a save per step — supersedes the earlier "save immediately" ruling — cost if wrong: one extra click.
Ruling: archived searches are read-only in the record (form, stage, assignment, copy); Restore and delete stay — matches the banner and D9 — cost if wrong: small.
Ruling: "Confirm marketing opt-in" in the duplicate strip implements spec §3.3 (no task owned it); contact PUT may gain `marketing` — cost if wrong: small.
Task 9: minor (deferred): focus drops after Save as lost / actionbar Save; Reload error shown in note; duplicated .seg CSS rule; Lost reason not editable; show("pets") hides unknown kinds.
Task 9: fix round 1 dispatched (resume ae63dd9c49d9b6789). FIX_BASE 7bb4d71
Task 9: fix round 1/5 (5 addressed, 0 open; commits 7bb4d71..1be5448)
Task 9: minor (deferred): applying Assigned to while the Lost form is open drops the typed reason but leaves choice.stage=lost (setLost(null) only for stage; reset choice in load); focus falls to page after Lost Cancel / Confirm opt-in.
Task 9: carry → T11: duplicate data = flat body with API keys incl. `marketing`.
Task 9: complete (commits af4d0d1..1be5448, review clean)
Ruling: Task 10 Step 1 (release review with skills) runs as the release-1 whole-range review, split server/UI into two parallel read-only reviewers (opus) — 237 KB diff too large for one pass — then ONE fix dispatch, one scoped re-review; then T10 steps 2–4 (seed, Playwright MCP e2e, ESTADO.md). Final whole-branch review after T13 covers release 2.
Task 10: release-1 reviewers dispatched: server a3fd3ca9e8fe861f0, UI a59dd6ffddb758721 (range bce6d85..1be5448)
Task 10: UI review → 3 Important + 4 promoted minors + ponytail cuts in release1-findings-ui.md
Task 10: server review → S-1 (Important erasure), S-2 indexes, S-3/S-4 hardening, S-6 copy, S-7 ponytail in release1-findings-server.md.
Ruling: deploy order = remote migrate → push immediately → re-run back-fill for `new` viewing requests lacking a viewing.requested event (server reviewer S-5) — cost if wrong: a few unnoticed requests.
Ruling: all Important + promoted items from both release reviews go to ONE fix dispatch (opus), then one scoped re-review.
Task 10: release-1 fix wave dispatched a3827c4d142774980 (FIX_BASE 1be5448)
Ruling: AUTOINCREMENT on contacts.id and applicants.id in 0008 — without it a deleted person's history/notices attach to the next new record (privacy) — load-bearing, applied in the same fix wave before re-review — cost if wrong: none.
Ruling: UI-8 skipped (Order select is the only sort control on phones) — accepted.
Task 10: fix wave done (commits 1be5448..b575ad4, 123/123); scoped re-review dispatched a8e4345d0ad7ac5be
Task 10: release-1 fix wave re-review: all addressed (S-1..S-4,S-6,S-7, UI-1..7,9,10, R-1,R-2; UI-8 skipped by ruling).
Task 10: parked — viewing_requests.id (0001, remote) has no AUTOINCREMENT; a reused id would share wiped events/notices — Ruling: no personal data leaks (S-1 wipes), changing a remote table needs a rebuild — cost if wrong: confusing history on a reused id.
Task 10: minor → carried to T10 implementer: stale comment server/applicants.js:33 about the phone CHECK.
Task 10: steps 2–4 dispatched ac4b388201e367e7e (BASE b575ad4)
Task 10: steps 2–4 done (ef28568): e2e flow passed at 1280/390 via chrome-devtools MCP (Playwright MCP cannot launch Chrome as root without --no-sandbox — config not changed); tests/e2e.cjs (playwright-core) passes; D1 checks a–d pass on wrangler local; controller viewed screenshots 06 and 11.
Task 10: minor (deferred): focus drops after Save / Archive / Add applicant; nav Inbox counter lags one poll after Dismiss on a record.
Task 10: complete except Step 5 (deploy) — RELEASE-1 SHA = ef28568 — awaiting Luis's yes.
Task 11: dispatched implementer aa49f1f20742c500c (BASE ef28568)
Ruling: duplicate notice title uses the saved contact name (not the submitted one) — staff recognise the person they know; avoids attacker-chosen text in titles — cost if wrong: one word.
Ruling: accept T11 extras: lower-id contact is "first"; consent change bumps contact updated_at (stale opt-in confirm → 409); race guards for delete-after-lookup and simultaneous identical submissions.
Task 11: security hook (MEDIUM): unverified public duplicate changes consent on an existing contact.
Ruling: keep the automatic marketing WITHDRAWAL on a duplicate (fail-safe: an objection must be honoured at once; a forged one only stops marketing), but do NOT fill privacy_ack_at from an unverified duplicate (a forged acknowledgement would be a false consent record) — it stays in the event only. Deviates from spec §3.3 one clause; report to Luis — cost if wrong: one line back.
Task 11: review Approved; parked for Luis's sign-off — Ruling: an unverified duplicate can still (a) withdraw someone's marketing, (b) restart their retention clock, (c) add an action notice + attacker-written diff to their record (Copy fields never copies name/email/phone) — spec §3.3/G2 behaviour, Turnstile is the only throttle — cost if wrong: add per-contact rate limit or email verification later.
Task 11: minor (deferred): list fields re-parsed from validator JSON; silent drop when contact deleted mid-flight (correct after erasure); "D1 down" stderr.
Task 11: fix round 1 dispatched (resume aa49f1f20742c500c): no privacy_ack fill on duplicate; marketing from validated value. FIX_BASE e0f03fd
Task 11: fix round 1/5 (2 addressed, 0 open; commits e0f03fd..25d44a0); spec §3.3 updated to the ruling.
Task 11: complete (commits ef28568..25d44a0, review clean)
Task 12: dispatched implementer af78a335952131208 (BASE 2a98f82)
Ruling: wizard never stores name/email/phone/free text/housing status/consents in sessionStorage (DESIGN.md: no personal data in browser storage); a reload keeps the other answers — cost if wrong: retyping contact details after a reload.
Ruling: accept site menu breakpoint 860→900px (new "Register" link overflowed), Register-on-confirmation restarts the form, CTA row at the end of Portfolio.
Task 12: ⚠️ e2e scripts live in scratchpad, not committed — accepted (plan mandates Playwright check, not committed scripts); server behaviour covered by T11 tests.
Task 12: minor (deferred → final triage): focus not moved to step 1 heading on entry; privacy notice says contact details aren't stored but best_time/preferred_channel/near are (add to PRIVATE or reword); #/apply & #/privacy unreachable if /api/listings fails; footer Privacy + consent labels < 44px; no committed test for the PRIVATE storage filter; TS_FAILED message replaced on Send; lone "£" passes client check; hard-coded 6 in progress CSS; ~2.5 KB wizard CSS inline on home.
Task 12: complete (commits 2a98f82..e1b83b5, review clean)
Final review (release 2, ef28568..e1b83b5) dispatched a697b6aa6f6d24761; domain step 1 dispatched a3086cf077b9b3ac6 (touches only site/_redirects; reviewer reads fixed range)
Domain step 1: complete (fd43820, site/_redirects, 30 static 301s; curl-verified locally). Controller inline check instead of a reviewer seat (31-line data file). Notes: archived HE-C listings → SPA falls back to #/ (graceful); /#/apply lands on home until release 2 is live; exact-match only (trailing slash/case variants fall through to home 200).
Ruling: enquiry-buying/renting → /#/apply and listing indexes → /#portfolio accepted — closest equivalents — cost if wrong: one line each.
Deploy: Luis approved release 1 ("si aprobado"); my remote migrate+push was blocked by the permission classifier → Luis runs the 3 steps himself.
Final review (release 2): With fixes — I-1 (G5 gate not enforced; main carries release 2), I-2 (retention wording), M-1..M-5, P-1 → final-findings.md. Abuse risks (a)(b)(c) accepted with M-4 copy + recommended WAF rate limit (dashboard, Luis).
Final: ONE fix dispatch for final-findings.md (FIX_BASE fd43820).
DEPLOYED release 1: Luis ran remote migrate 0008 ✅, pushed ef28568 to main, gap back-fill wrote 0 rows; prod /api/admin/notifications/counts and /api/admin/applicants answer 401 (routes live). TODO after fix wave: ESTADO.md → F0 release 1 deployed.
Luis verified prod /admin: Inbox home + Applicants visible (2026-10-23).
Final fix wave done (fd43820..08db1eb, 141/141); note: Pages build now fails past ef28568 until markers filled — holds back fd43820 redirects too (cherry-pick onto ef28568 if the domain switch comes first).
Final fix wave re-review: all addressed (I-1,I-2,M-1..M-5,P-1). Final review clean.
