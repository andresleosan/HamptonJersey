# BUS-17 · Widen criteria — Ledger

Ruling: inline on main, one commit at the end (Luis's /avanzar: code, ESTADO and checklist in one commit on main; no worktree, other branches' previews use the production database) — cost if wrong: no per-task commits to bisect.
Ruling: executed natively in this session (the spec was approved through Telegram; the plan is the build order), with the independent review at the end — cost if wrong: no per-task reviewer.
Builder check (before approval): three questions, all settled as builder calls and marked in the spec (W1 counts only Found/Shortlisted of listings still offered; W3 counts new listings capped at MAX_FOUND − Found, not net; W9 disables «Use this» while the form has unsaved changes).
Task 1: done. server/widen.js, BUDGET exported from server/applicants.js; tests/server/widen.test.mjs failed first on the missing module, then 10/10.
Ruling: the new top is computed in whole numbers (top × 11 / (10 × step)) — 900000 × 1.1 is 990000.0000000001 and rounded up to £991,000 (the first run's failure) — cost if wrong: none.
Ruling: widen() lives in its own file next to matching.js, not inside it — it imports the validation limit from applicants.js and matching.js stays free of imports — cost if wrong: none.
Task 2: done. detail() in server/routes/applicants.js returns widen; LISTING exported from server/match-store.js. 4 route tests RED→GREEN.
Fixed while building: the matches rows of detail() carry the listing id only inside the listing JSON, so the first version passed {undefined} as the taken set and would have counted rejected listings again; test «a rejected listing is never counted again» RED→GREEN, widen now reads the parsed cards.
Measured: 2.3 ms per call with 300 candidate listings (ponytail comment in widen.js names the ceiling, ~1,000).
Task 3: done. Widen card in admin/src/ApplicantDetail.jsx, rules in styles.css; e2e step widenCriteria run on its own against `wrangler pages dev` (the full e2e stops at Turnstile in the taller), harness outside the repo (/home/taller/encargos/capturas/widen/run.cjs).
Ruling: the button's name is aria-label «Use this: <change>» — a visually hidden span after «Use this» made Chrome read «Use this : …» — cost if wrong: none; the visible text starts the name (label in name). Superseded in the final review by «Use this (…)».
Ruling: the e2e applicant asks for 6 bedrooms — seed listings without a parish read count for any parish and made the result depend on the steps before — cost if wrong: none.
Fixed while building: a review in the Matches tab reloaded the matches but not the card, so it kept old numbers or stayed hidden after a rejection; the e2e step now reaches 3 matches (card gone) and rejects one (card back, the rejected listing not counted) — RED→GREEN.
Walkthrough with Playwright MCP at 1280 and 390: rent wording («a month»), «Nothing to widen», «Use this» focusing the field, no side scroll; screenshots in /home/taller/encargos/capturas/widen/.
Final review: 4 reviewers (bugs, security and privacy, DESIGN.md, code of more). No high or medium security findings.
Final: fixed the card going stale after a Stage or Assigned change (bugs-1) — refresh() now copies widen like the review does; e2e «Stage → Completed takes the card away» RED→GREEN.
Final: fixed Shortlisted matches of the other operation counting for W1 after a search switches To Buy ↔ To Let (bugs-2) — the live count filters by the search's operation; test RED→GREEN.
Ruling: bugs-3 not changed — with fewer than 3 Found and more than 22 new listings, the card can say 23 where up to 25 enter (new ones that outscore push the old ones out); rare and it does not change the team's decision — cost if wrong: an undercount of at most 2.
Final: design — the unsaved-changes note moved before the buttons and says where («You have unsaved changes in Requirements. Save or discard them to use these.»); «Minimum bedrooms down 1: 3 to 2» like the budget line; «Add any other parish» when none adds; «Nothing to widen» names only the real causes; the button's hidden text follows the house pattern («Use this (…)»), no aria-label.
Final: security-1 — the parish in the focus selector goes through CSS.escape. Security-2 (CPU) left as measured in the ponytail comment; a timing assertion would be flaky.
Final: code of more — LISTING_OPERATION exported from match-store.js instead of a third copy; one parish object; fits() points at result(). Kept the separate W7 assertions (each pins one hiding rule) and the e2e rejection (it is the only check of the panel refreshing the card).
Tests: npm test 537/537 and 14 Python; build OK; e2e block widenCriteria OK on its own (the full run stops at Turnstile in the taller).
