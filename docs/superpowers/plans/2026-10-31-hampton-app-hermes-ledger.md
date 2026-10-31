# SDD ledger — plan: docs/superpowers/plans/2026-10-31-hampton-app-hermes.md
Spec: docs/superpowers/specs/2026-10-31-hampton-app-hermes-design.md
Executor: inline (executing-plans) in Hermes's taller, on the local branch `hermes/aut-13` from `main` at f823d17, by Luis's encargo of 31-oct-2026 (no push, no production, no e2e: Turnstile needs a connection the taller lacks).

## Pre-flight scan
| Rows | Finding |
|---|---|
| T1 -> T2 `counts.outbound` | T2's pause bar reads `counts.outbound` ({at, by} or null); T1 adds it to `openCounts` — consistent |
| T1 -> T2 `/admin/jobs` | T2's draft block reads `{job, hermes_at}` and posts use/discard; T1's tests cover those routes — consistent |
| T1 -> T3 door paths | T3's proxy allows `^/api/hermes/[A-Za-z0-9_/-]+` with GET/POST; every door route fits — consistent |
Scan clean.

Task 1: Ruling: the door is matched in `server/api.js` before the same-origin check, by the first segment, and never reads the cookie (H6) — cost if wrong: none (a browser cannot send `Authorization` cross-origin without CORS, which the app never answers).
Task 1: Ruling: the stale-claim fail and the claim are two statements, not a batch, because the node:sqlite double returns no rows from a batched `UPDATE … RETURNING`; both use the same `stale` time, so the order holds — cost if wrong: a job fails one poll later.
Task 1: Ruling: news only carries `action_required = 1` notices (from the website); a new applicant typed in the panel by the team is not news — cost if wrong: one Telegram message fewer.
Task 1: Ruling: four existing tests compared the counts object exactly; they gain `outbound: null` — cost if wrong: none.
Task 1: complete (tests: npm test → 460 + 14 OK)
Task 3: Ruling: an oversized body is read to the end and dropped, not `req.destroy()`ed — destroying the socket before the 413 left the client with "other side closed" — cost if wrong: a 160 KB+ body is read once on a private network.
Task 3: complete (tests: 2/2)
Task 2: Ruling: the draft block is hidden until Hermes has called once (`app_settings.hermes`), so merging this before Hermes is installed changes nothing visible in the panel — cost if wrong: none.
Task 2: Ruling: local walkthrough with playwright-core and the taller's Chromium (Playwright MCP not used), against `wrangler pages dev` on the e2e fixture database with a throwaway key passed as a binding (never written to `.dev.vars`), at 1280x900 and 390x844: ask → waiting → draft → Use this text → form filled and Unsaved changes; pause from the door → bar on Listings → Resume sending. The door's status and news were checked against all 22 names, emails and phones of the fixture's contacts and viewing requests. Screenshots in /home/taller/encargos/capturas/aut13 (outside the repo) — cost if wrong: none.
Task 2: complete (tests: npm test → OK; npm run build → OK)

Final review: two independent reviewers (A: bugs, security and privacy; B: design against DESIGN.md and the spec, and code that is more than needed). Neither found anything serious. Everything they raised was fixed, except one item:
Final: fixed (B1) «Use this text» silently replacing unsaved title, summary or description — it now asks first, and the message names the three fields (spec §3 updated).
Final: fixed (B2) focus lost when the pressed button unmounts — the block's heading takes it; after Resume sending, the page (`main`, tabIndex -1).
Final: fixed (B3) «Draft with Hermes» and «Draft from Hermes» stacked — the heading itself changes to «Draft from Hermes» while a draft waits.
Final: fixed (B4) duplicated `.warn` flex rules — `.warn.paused` joins the existing `.warn.uncounted,.warn.to-confirm` selectors.
Final: fixed (B5, B6) the `outbound` shaping (now two `json_extract` columns), `shape` returning null itself, `{page}` on its own line, the error alert moved out of the `role="status"` bar.
Final: fixed (A1) a team member's email could leave through the door once the panel can pause (AUT-01) — the door says `hermes` or `team`. Test added.
Final: fixed (A2) a cursor past the last notice (a restored database) silenced news — it comes back to the last notice. Test added.
Final: fixed (A4, decision) unpublished listings reached Hermes, wider than «only public data (C0)» — jobs only for listings on the website, at request and at claim; the editor shows the block only on a published listing. Asked Luis whether drafts of unpublished listings may go to Hermes. Test added; mutation check: removing the rule turns the test red.
Final: fixed (A5) a 64 KB body could refuse 25,200 characters escaped as \uXXXX — door and proxy now allow 160 KB.
Final: fixed (A6) the proxy sends its own user-agent (Cloudflare bot rules once the domain is there).
Final: minor (deferred) (A3) a 409 can answer `id: null` if the open job closes in the same instant as the second request; the caller asks again.
Final: suite 464/464 + 14, build OK, check:release OK, walkthrough OK at 1280 and 390.
