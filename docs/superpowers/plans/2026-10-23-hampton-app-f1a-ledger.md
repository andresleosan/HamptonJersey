# SDD ledger — plan: docs/superpowers/plans/2026-10-23-hampton-app-f1a.md
Spec: docs/superpowers/specs/2026-10-23-hampton-app-f1a-design.md (B1–B15) · Models: opus, effort high (Luis) · Work on main (Luis-approved convention). Start: 042946f (on top of unreleased F0 release 2; prod = ef28568).

## Pre-flight scan
| Rows | Produces / consumes | Finding |
|---|---|---|
| T1 → T2 | feat_* + parish + feat_evidence columns ↔ extractFeatures keys | consistent; features_at set by T5/T6 callers |
| T2 → T3 | feat_* values ↔ evaluate checks | consistent |
| T3 → T4 | evaluate/MIN_SCORE/MAX_FOUND | T4 CANDIDATES_SQL "prefiltering price/beds/baths/parish" would duplicate evaluate's rules → Ruling below |
| T4 → T5/T6 | recomputeForApplicant/Listing, closeMatchedNoticeIfEmpty | consistent |
| T6 → T7/T8 | detail.matches[].listing.cover_thumb; counts.review | cover_thumb has no producer in the codebase → Ruling below |
| T5 → T9 | parish/matchable/matched_applicants/?parish= | consistent |
| Spec §3 vs B14 | "recalcs write no events" vs applicant.matched event | B14 (later, specific) wins; plan follows B14 |
| T1..T6 self | tests vs interfaces | consistent |
| T7..T9 self | UI verified by build + browser; T10 e2e | plan-mandated, same as F0 |

Ruling: CANDIDATES_SQL only applies the candidate gate (matchable, residential, availability, operation, country) and the applicant's operation; evaluate() is the single source of truth for every rule — no duplicated logic; ~300 numeric evaluations fit the CPU budget — cost if wrong: add SQL prefilters later.
Ruling: match cards use the listing's `cover_id` exactly as the admin Listings list does (no new cover_thumb field) — reuse the existing media pattern — cost if wrong: rename one field.
Task 1: dispatched implementer aa0f2a5d37c962340 (BASE 042946f)
Ruling: parish is filled by JS (extractFeatures via "Recalculate all", run once right after deploy), not by SQL in 0009 — one parser, no SQL/JS drift; spec §3 wording superseded — cost if wrong: parish Unknown until the first recalc.
Ruling: text BETWEEN 'HE-R028' AND 'HE-R285' is fine — 0009 runs once against today's 3-digit ids — cost if wrong: none.
Task 1: carry → T6: the review route must require reject_reason when status=rejected (DB allows NULL).
Task 1: ⚠️ reject reason → resolved: T6 route requires it (carried).
Task 1: minor (deferred): B9 range edges (R027/R028/R285/R286) untested; feat_parking/score lack integer CHECK.
Task 1: complete (commits 042946f..27e5b80, review clean)
Task 2: dispatched implementer a574b46a3b7211ccd (BASE 27e5b80)
Ruling: accept extra real-data patterns in T2 and the known misreadings (parking-to-rent-nearby, 'home' untyped) — Unknown/approximate never excludes a house; staff see the evidence — cost if wrong: refine patterns.
Task 2: review Approved; controller confirmed minors 1–4 as real gaps (false pets exclusion risk / false readings) → fix round. ⚠️ pets hard filter reads only feat_pets='no' → verify in T3 review.
Ruling: mixed pets yes+no signals → NULL (unknown), not "no" — a false exclusion is worse than a missed one — cost if wrong: one house shown to a pet owner that refuses pets.
Task 2: minor (deferred): "no garage" → 1; unbounded parking N may capture a year; "no garden" → garden; "St Helier St Lawrence" without comma → St Lawrence.
Task 2: fix round 1 dispatched (resume a574b46a3b7211ccd). FIX_BASE 7256bff
Task 2: fix round 1/5 (4 addressed, 1 new Important: wide pets label → false "no"; commits 7256bff..b5ca720)
Task 2: minor (deferred): label qualifiers ("Visitor Parking: Yes", "Non-furnished: Yes"); "Pets: Considered" rows → null.
Task 2: fix round 2 dispatched (resume a574b46a3b7211ccd): narrow pets label; keyed 0 doesn't override stated counts. FIX_BASE b5ca720
Task 2: fix round 2/5 (2 addressed, 1 new Important: Friendly/Welcome/Negotiable: No → yes; commits b5ca720..d3a821b)
Task 2: minor (deferred): a bare "garage/parking" mention beats a keyed 0.
Task 2: fix round 3 dispatched (resume a574b46a3b7211ccd). FIX_BASE d3a821b
Task 2: fix round 3/5 (1 addressed, 0 open; commits d3a821b..53237cb)
Task 2: parked → final triage — Ruling: refused pets rows with value variants ("No.", "N", "No - sorry", "Not permitted", "N/A") still read "yes" via prose; a false yes (not an exclusion), absent from real data — cost if wrong: a pet owner sees a house that refuses pets (staff see the evidence).
Task 2: minor (deferred): keyed pets row beats opposite prose; dropped pets row hides another feature in a mixed label.
Task 2: complete (commits 27e5b80..53237cb, 1 parked)
Ruling: "+10 published" = published=1 AND archived_at IS NULL; pets hard filter only when applicant has a pet AND feat_pets='no' — matches spec §4 — cost if wrong: one condition.
Task 3: dispatched implementer ae046e950fe2362d9 (BASE 53237cb)
Ruling: unasked outdoor/type/furnished/ideal-bedrooms score full points (same as spec's parish rule); parking fails only when the listing says none (fewer → unknown); outdoor never fails; type fails only when asked and known-different; rent without period → unknown price — conservative, never wrongly excludes — cost if wrong: ranking tweaks.
Ruling: price score follows B11 bands (later, specific) over §4's 20×(1−p/top) — cost if wrong: one formula.
Task 3: carry → T4: candidate gate adds (currency IS NULL OR currency='GBP'); evaluate takes raw DB rows (JSON text lists).
Task 3: ⚠️ currency → resolved by T4 gate ruling (GBP or NULL); JSON text contract → carried to T4; evidence cap lives in listing-features (verified).
Ruling: unknown listing parish with no wanted parishes scores full 30 (spec: "o el aplicante no indicó ninguna") — cost if wrong: one branch.
Task 3: minor (deferred): scoring code readability (nested ternaries in add/share); "excluded" vs "not wanted" parish evidence indistinguishable; bedrooms ideal set + unknown beds scores 0; tests lack type-unknown and wanted+excluded cases.
Task 3: complete (commits 53237cb..8e6a6ff, review clean)
Task 4: dispatched implementer af2890bed492d1685 (BASE 8e6a6ff)
Ruling: accept T4 extras (title refreshed on any writing recompute; shortlisted re-evaluated even off-candidate; in-batch guards against duplicate notices and mid-recompute reviews) — cost if wrong: none.
Task 4: carry → T5: set matchable=0 before recomputeForListing; T6: build closeMatchedNoticeIfEmpty inside the request.
Task 4: minor (deferred): shortlisted card shows no failing check after an applicant switches operation (evaluate has no operation check); {new} may overcount by 1 on a race.
Task 4: review Needs fixes — SELECT * on listings breaks B10/CPU; controller promoted minors 1 (rows read on listing save), 5 (evaluate for non-candidates), 2 (active-search rule ×3) into the round.
Task 4: minor (deferred): no test interleaving a concurrent review with the batch; {new} overcount on race.
Task 4: fix round 1 dispatched (resume af2890bed492d1685). FIX_BASE 049c003
Task 4: fix round 1/5 (3 addressed, 0 open; commits 049c003..081fec9)
Task 4: complete (commits 8e6a6ff..081fec9, review clean)
Ruling: recompute runs after the save commits; a recompute failure is logged and never turns a successful save into a 500 (next save / Recalculate all repairs) — data first — cost if wrong: stale matches until next save.
Ruling: restore does not re-enable matchable (B9) — cost if wrong: one click on the editor switch.
Task 5: dispatched implementer adc94d5a0a8d0c9ca (BASE 081fec9)
Ruling: accept T5 extras (publish/unpublish recompute; any applicant change recomputes; afterSave helper in match-store).
Ruling (→ T9): the editor sends `parish` only when the user changed it; server rule "explicit value wins" unchanged — cost if wrong: small client logic.
Ruling: public NEW-registration recompute must not change response timing vs the duplicate path (enumeration side channel) → run it via the Pages `waitUntil` so the 201 returns first — goes into the T5 fix round — cost if wrong: matches appear a moment after the response.
Task 5: minor (deferred): contact rename leaves old name in an open matched notice; no ?parish= value for unknown.
Task 5: review Needs fixes — timing side channel (same as security hook) → waitUntil; promoted minors: restore globalThis.fetch; stored-spec features test. Spec §6 amended (waitUntil for public path).
Task 5: minor (deferred): "D1 down" stderr noise (pre-existing).
Task 5: fix round 1 dispatched (resume adc94d5a0a8d0c9ca). FIX_BASE 0f7fac6 (spec commit on top)
Ruling: pass waitUntil as p => context.waitUntil(p) (no reliance on pre-bound destructuring) and verify on wrangler pages dev — a throw after save would show an error for a stored registration — same fix round.
Task 5: fix round 1/5 (3 addressed + waitUntil binding, 0 open; commits 0f7fac6..732453b); verified on wrangler pages dev (201 in 42 ms, match+event+notice after). Local .wrangler/e2e now has 0009 applied (backup in scratchpad).
Task 5: complete (commits 081fec9..732453b, review clean)
Ruling: Recalculate-all listings phase covers ALL listings (features/parish everywhere, parish never overwritten); applicants phase only active — cost if wrong: a little extra work once.
Task 6: dispatched implementer af1725a08605b5626 (BASE 732453b)
Ruling: Recalculate-all applicants phase = 5 per call (measured ~1.2 ms CPU each vs 10 ms budget); listings 50 — cost if wrong: one constant.
Ruling: B13 gap — found matches older than first_reviewed_at with nothing shortlisted showed "No matches"; Waiting for review now = any found left (precedence New properties found → Waiting for review → In process → No matches); spec amended — goes into T6 fix round — cost if wrong: one condition.
Ruling: accept T6 extras (recalc `total`, 409 on archived search review, applicant_id on matches, /review null with remaining>0 after a full pass, counts.action includes matched, collision → 409).
Task 6: review Needs fixes — amended B13 mismatch; list scans all matches; counts.review scans all found every 30 s.
Ruling: drop `review` from the polled counts; the Review nav item has no counter; the Review screen shows `remaining` from /admin/review (overrides plan T6/T8 counter) — D1 free-plan read budget — cost if wrong: staff open Review to see how many are waiting (Inbox Matched tab still badges).
Ruling: after an Undo to found, recompute the applicant (afterSave semantics) so archived/over-cap/stale matches don't resurrect — cost if wrong: none.
Task 6: minor (deferred): matched notice title drifts after reviews; route modules share SQL fragments (move to server/match-sql.js); "D1 down" stderr.
Task 6: fix round 1 dispatched (resume af1725a08605b5626). FIX_BASE 83513ba (+ controller spec commit fc6ab80)
Task 6: carry → T7/T8: PUT /admin/matches/:id Undo may return match:null (recompute removed it) — treat as gone.
Task 6: fix round 1/5 (4 addressed, 0 open; commits 83513ba..632ae3b)
Task 6: minor (deferred → final triage, likely fix): Undo on a lost/completed (inactive, not archived) search deletes the reviewed match via recompute — block reviews on inactive searches like archived; duplicated ?queue=Done assertion; queue+operation filter test doesn't prove combination.
Task 6: complete (commits 732453b..632ae3b, review clean)
Task 7: dispatched implementer aa7b23bf08dbf0fcc (BASE 632ae3b)
Task 7: minor (deferred → final triage): queue labels + reject reasons duplicated in the panel (server route modules hold them; a shared non-public constant module would fix).
Task 7: carry → T8: MatchCard has `busy` (ignore clicks, keep focus) and `disabled` (archived) props.
Task 7: review Needs fixes — duplicated QUEUES/REASONS (global constraint) → shared non-OPTIONS exports in server/applicants.js; promoted minors: 404 = gone, failed reload shown as error, focus fallback, availability badge tones.
Task 7: minor (deferred): review message far from the card; ". " split relies on server wording.
Task 7: fix round 1 dispatched (resume aa7b23bf08dbf0fcc). FIX_BASE 67e9d1c
Task 7: fix round 1/5 (5 addressed, 0 open; commits 67e9d1c..2ee2d2b)
Task 7: complete (commits 632ae3b..2ee2d2b, review clean)
Task 8: dispatched implementer a8df7e1a57e126f06 (BASE 2ee2d2b)
Ruling: accept T8 server addition `count` on recalculate responses (keeps batch sizes server-side); "Shortlist (A)" wording per spec §5; browser confirm() as Archive does — cost if wrong: trivial.
Task 8: minor (deferred): leaving the page during Recalculate all doesn't stop the loop.
Task 8: ⚠️ human 20-review timing not measured (scripted 1.2 s) — Ruling: the scripted run proves the loop has no UI/API bottleneck; real human timing is checked by Luis in use — cost if wrong: none to the code.
Task 8: review Needs fixes — failed Undo drops focus; promoted minors: Retry focus, Try again busy guard, pending reload after Recalculate, plural.
Task 8: minor (deferred): `show` imported from ApplicantDetail page; Shift not filtered.
Task 8: fix round 1 dispatched (resume a8df7e1a57e126f06). FIX_BASE e8e73d6
Task 8: fix round 1/5 (5 addressed, 0 open; commits e8e73d6..41f28e8)
Task 8: minor (deferred): Recalculate error pulls focus to Retry even mid-review; deferred reload drops the last review's Undo.
Task 8: complete (commits 2ee2d2b..41f28e8, review clean)
Task 9: dispatched implementer a0aee9f0ecdde9e7e (BASE 41f28e8); carries the editor-parish ruling (send parish/matchable only when changed)
Ruling: Parish filter client-side like the other Listings filters — consistent, list already loaded — cost if wrong: switch to ?parish=.
Ruling: my "found = attention" badge tone contradicted DESIGN.md (Found = neutral) — DESIGN.md wins; fix in the T9 round.
Task 9: review Needs fixes — Found tone (DESIGN.md); promoted minors: matchable error a11y, null operation "—", reloadMatches ordering, rename `extra`.
Task 9: fix round 1 dispatched (resume a0aee9f0ecdde9e7e). FIX_BASE 30cb1c3
Task 9: fix round 1/5 (5 addressed, 0 open; commits 30cb1c3..307a2ea)
Task 9: complete (commits 41f28e8..307a2ea, review clean)
Task 10: Step 1 = F1-A whole-range review (042946f..HEAD) split server/UI, two parallel read-only reviewers, then ONE fix wave + scoped re-review; then Steps 2–3.
Task 10: F1-A range reviewers dispatched: server a0252af6538216f49, UI af5648983fb48425d (042946f..307a2ea)
Task 10: UI range review → 3 Important + 5 minors + ponytail in f1a-findings-ui.md
Task 10: server range review → S-1..S-6 in f1a-findings-server.md.
Ruling: listings created in the panel default to matchable=1 (offered unless switched off) — Hampton's own stock should be matched — cost if wrong: drafts appear as matches until switched off.
Ruling: deploy step: run "Recalculate all" immediately after push, before staff edit applicants (until then parish/feat_* are NULL).
Task 10: deferred (accepted to ship): M-3 listings batch sized by count not text length; M-4 cap churn re-fires notices; T2 parked pets variants; T4 {new} overcount; T4 operation switch card; T5 rename in notice; UI deferred list in f1a-findings-ui triage.
Ruling: ONE fix wave (fresh opus implementer) for f1a-findings-server.md + f1a-findings-ui.md, then one scoped re-review.
Task 10: F1-A fix wave dispatched a06def538999757eb (FIX_BASE 307a2ea)
Task 10: fix wave done (307a2ea..f15fb5b, 190/190); extras accepted: new partial index applicants_queue in 0009 (not yet remote), CROSS JOIN to force the events-driven plan, remaining recounted at pass end, visible closed-search note.
Task 10: fix wave re-review: all addressed (S-1..S-6, UI-1..UI-8, P-UI); queue rewrite proven equivalent on 955 random checks.
Task 10: minor (deferred): Undo after a failed next-load over-counts remaining by 1 until pass end; NEXT_SEARCH runs even when SAME_SEARCH hits; matched notice title not updated on review/undo.
Task 10: carry → T10 closer: add a comment in 0009 next to applicants_queue cross-referencing CLOSED_STAGES in server/applicants.js.
Task 10: steps 2–3 dispatched abb23e68e2acbc796 (BASE f15fb5b)
Task 10: complete (85d5377 Close F1-A): fresh 0001–0009, e2e.cjs OK, browser pass 1280/390 clean, ~1000-statement batch accepted on local D1 (71 ms).
Open risk (docs ambiguous): D1 Free "queries per invocation" 50 vs Cloudflare-services subrequests 1000 — whether batch statements count individually is undocumented; check the first large listing save after deploy (log). Rows written free cap 100k/day — Recalculate all ≈ a few thousand rows once.
F1-A: final review clean.
