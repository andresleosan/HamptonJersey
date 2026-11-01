# SDD ledger — plan: docs/superpowers/plans/2026-11-01-hampton-app-automations.md
Spec: docs/superpowers/specs/2026-11-01-hampton-app-automations-design.md
Executor: inline (executing-plans) on main, by Luis's /avanzar rule (work on main, one commit at the end with code, tests and docs).

## Pre-flight scan
| Rows | Finding |
|---|---|
| T1 -> T2 `GET /admin/automations` | T2 reads `clock`, `retention`, `hermes`; T1 produces them — consistent |
| T1 -> T2 `counts.stalled`, `counts.outbound` | T2's Settings count and Sending card read them from App's counts poll — consistent |
| T1 -> T2 `POST /admin/outbound/pause` | T2's card calls it, then App's `loadCounts` — consistent |
Scan clean.
Spec: builder check (fresh subagent) answered «nothing important left»; its six minor notes went into spec A11 and A7 as Claude's calls.
Task 1: Ruling: `pauseOutbound` lives in server/routes/automations.js, not hermes.js as the plan first said — notifications.js imports `stoppedFlags` from automations.js, and hermes.js imports notifications.js, so the pause in hermes.js would have made a cycle — cost if wrong: none (plan updated).
Task 1: Ruling: `GET /admin/automations` returns no `outbound` — the card reads `counts.outbound`, which the pause bar already uses (spec A11), so the route never carries an email — cost if wrong: none (plan updated).
Task 1: Ruling: the jobs DELETE is bound on its own (`.bind(ts)`), not through the batch's `q`, which binds two values to statements that use one — RED «column index out of range» → GREEN.
Task 1: Ruling: existing tests deep-equalling the counts object gain `stalled: 1` (their databases have no clock run, which A4 counts as stopped) and the retention records gain `jobs: 0` — cost if wrong: none.
Task 1: complete (tests: npm test → 473/473 + 14 Python OK)
Task 2: Ruling: the recent-jobs table gets its own phone layout (`.list.jobs`: listing on the first line, status on its right, labelled dates below) — the generic `.list` phone rule reserves a 72px thumbnail column — cost if wrong: one CSS rule.
Task 2: Ruling: e2e in the workshop stops at Turnstile (tests/e2e.cjs:125, no connection to Cloudflare's challenge); the new `automations()` block ran on its own against `wrangler pages dev` with a harness kept outside the repo (/home/taller/encargos/capturas/aut01-run.cjs): «automations block OK», no page errors at 1280 and 390. The first harness run wrote its two screenshots into the repo root (e2e.cjs reads argv[2] as the screenshot folder); moved to capturas before any commit and the harness fixed.
Task 2: Walkthrough with Playwright MCP at 1280 and 390: Settings opens with Enter, Tab reaches «Automations1 stopped», Enter opens it; «Pause all outbound» 32px tall; no sideways scroll at 390. Screenshots in /home/taller/encargos/capturas/aut01/.
Task 2: complete (tests: npm test OK, npm run build OK)
Deploy: no migration; `migrar-hampton` (read-only) says «No migrations to apply».
Final review: four independent reviewers (fresh subagents, read-only): correctness, security and privacy, design and accessibility against DESIGN.md, code that should not be there. Security: no findings. Correctness: one minor. Design: one Important, three minor. Code: seven minor. All fixed, none deferred (Luis's /avanzar asks to fix what the reviewers find).
Final: fixed (Important, design) the focus falling to <body> after Pause all outbound or Resume sending in the card (the pressed button is swapped for the other) — the result message takes the focus (tabIndex -1); e2e asserts document.activeElement is «Sending resumed.» — GREEN.
Final: fixed (minor, correctness) the cards not following the Settings number while the screen stays open — the screen loads again when `counts.stalled` changes.
Final: fixed (minor, design) recent-job cards without a divider on phones (the Applicants rule's border copied to `.list.jobs`); an open job's Closed cell now «—» like every empty panel cell; the empty state gets its next step: «No jobs yet. Once Hermes is connected, ask for a draft in a listing's editor.» (spec §3 updated; the editor's draft block is hidden until Hermes connects, hence «Once…»).
Final: fixed (minors, code) one `jobLastActivity(t)` in server/retention.js for the jobs' last activity, used by the pass and by the screen (it was written three times); `stalled` in openCounts read through a plain object; no `useCallback` for a load used once; no `jobs = 0` default in `recordRetentionDay` (runRetention always returns it; the old test passes it); a redundant test assertion and a third GET removed; a repeated comment shortened.
Final: npm test 473/473 + 14 Python OK; npm run build OK; e2e automations block OK (full e2e stops at Turnstile in the workshop, tests/e2e.cjs:125).
