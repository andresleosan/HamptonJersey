# SDD ledger — plan: docs/superpowers/plans/2026-11-06-hampton-app-listings-and-properties-page.md
Start: main at f28a077 (Luis's /avanzar: work on main, no branch).
Pre-flight: T1 produces bedrooms/matched/interested → T3 consumes: names match.
Pre-flight: T2 produces monthlyPrice/bedsRange/passesExtra/bedsLabel/daysAgo/OPERATION_FILTER → T3 consumes: match.
Pre-flight: T4 produces publishedAt → T5 newestFirst/T6 consume: match.
Pre-flight: T5 produces newestFirst/homePicks/readCatalogQuery/catalogQuery/buttonPhoto → T6 consumes: match.
Ruling: work on main and commit at the end with code + docs together — Luis's /avanzar rule (code, ESTADO and checklist in the same commit) overrides the skill's worktree default — cost if wrong: larger commits to review.
Task 1: complete (uncommitted, tests: npm test → 522/522 + 14 py)
Task 2: complete (tests: listing-filters 8/8)
Task 3: complete (tests: server 504/504, build ok). Ruling: also removed PUT /admin/listings/order and its tests — its only caller (drag) is gone; home_order column kept — cost if wrong: re-add a 10-line route.
Task 4: complete (tests: server 506/506)
Task 5: complete (tests: lib 18/18)
Task 5: Ruling: newestFirst compares dates only (ties 0, stable sort) instead of id tiebreak — listings without a date keep the site's region/use order (e2e seed and any pre-0021 rows) — cost if wrong: tie order differs.
Task 6: complete (tests: npm test 536/536 + 14 py, build ok, e2e OK from clean seed ×2, shots 1280/390). Ruling: Listings Bedrooms/Price fieldsets wrap their selects in a div (legend above) — legend float rendered beside — cost if wrong: none.
Task 7: complete (checklist SPR-06 hecho, SPR-07 parcial+bloqueo Hermes, SPR-01, PUB-22 new, MSG-02→0022; ESTADO section, work-order row 12; arquitectura §3 + §5.3). Ruling: MSG-02/Hampton Bot docs renumbered to migration 0022 — 0021 now taken by PUB-22 — cost if wrong: a docs edit.
Final review: two fresh reviewers (opus): correctness + security/privacy; DESIGN.md + accessibility + over-engineering. No Critical.
Final: fixed /properties canonicalised to the home page — functions/properties.js + server/seo.js propertiesPage/withPageHead (shared with /p/<id>) — test "PUB-22: /properties has its own title, description and canonical" RED→GREEN, e2e checks the served canonical; suite 538/538, e2e OK.
Final: fixed filters applied out of sight on /properties with ≤5 listings and a max not on offer — lib catalogFilter — test "catalog filter: few listings keep only the operation…" RED→GREEN; e2e /properties?region=uk&beds=4 shows all.
Final: fixed white text contrast over light photos (ink gradient .12→.78; .45→.82 on phones) and Show all as a 44 px target (e2e asserts ≥44); removed the site's orphaned .filters/.active CSS.
Final: Ruling: kept «Checked» and «To Buy / To Let» labels — Luis approved those words — cost if wrong: two label edits.
Final: minor (deferred): «Latest properties» shows an empty grid if the 5 newest are all sold (no message).
Final: minor (deferred): Rent/Buy/Businesses use replaceState, so Back leaves /properties instead of undoing the choice.
Final: minor (deferred): Back from a listing to /properties returns to the top (same as the old home).
Final: minor (deferred): button photos use the full-size image, not ?thumb (thumbs are 640 px; the buttons are up to ~640 px wide on desktop).
Final: minor (deferred): the panel price filter compares EUR listings as if £.
Final: minor (deferred): listing-filters monthlyPrice duplicates server/matching.js monthlyRent and keeps an unused week factor; the To select's clamp mirrors bedsRange; buttonPhoto re-sorts an already sorted list; two chained sorts at data load.
Final: minor (deferred): stray #fff/#222 in the button CSS, 3 px focus ring vs DESIGN.md's 2 px, the " →" read by screen readers, the 7-days checkbox box size.
Final: minor (deferred): old browsers may keep the previous /properties → /#portfolio 301 cached (harmless: Latest properties).
Final: minor (deferred): listings.home_order is now unused (kept, no destructive migration).
