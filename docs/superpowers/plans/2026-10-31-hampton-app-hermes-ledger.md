# SDD ledger — plan: docs/superpowers/plans/2026-10-31-hampton-app-hermes.md
Spec: docs/superpowers/specs/2026-10-31-hampton-app-hermes-design.md
Executor: inline (executing-plans) in Hermes's taller, on the local branch `hermes/aut-13` from `main` at f823d17, by Luis's encargo of 31-oct-2026 (no push, no production). In the taller the e2e stops at Turnstile, which needs a connection the taller lacks; the full e2e passed on the VPS on c5cf12d (Luis's review of 1-nov-2026).

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
Task 2: Ruling: local walkthrough with playwright-core and the taller's Chromium (Playwright MCP not used), against `wrangler pages dev` on the e2e fixture database with a throwaway key passed as a binding (never written to `.dev.vars`), at 1280x900 and 390x844: ask → waiting → draft → Use this text → form filled and Unsaved changes; pause from the door → bar on Listings → Resume sending. The door's status and news were checked against all 22 names, emails and phones of the fixture's contacts and viewing requests. Screenshots kept outside the repo — cost if wrong: none.
Task 2: complete (tests: npm test → OK; npm run build → OK)

Final review: two independent reviewers (A: bugs, security and privacy; B: design against DESIGN.md and the spec, and code that is more than needed). Neither found anything serious. Everything they raised was fixed, except one item:
Final: fixed (B1) «Use this text» silently replacing unsaved title, summary or description — it now asks first, and the message names the three fields (spec §3 updated).
Final: fixed (B2) focus lost when the pressed button unmounts — the block's heading takes it; after Resume sending, the page (`main`, tabIndex -1).
Final: fixed (B3) «Draft with Hermes» and «Draft from Hermes» stacked — the heading itself changes to «Draft from Hermes» while a draft waits.
Final: fixed (B4) duplicated `.warn` flex rules — `.warn.paused` joins the existing `.warn.uncounted,.warn.to-confirm` selectors.
Final: fixed (B5, B6) the `outbound` shaping (now two `json_extract` columns), `shape` returning null itself, `{page}` on its own line, the error alert moved out of the `role="status"` bar.
Final: fixed (A1) a team member's email could leave through the door once the panel can pause (AUT-01) — the door says `hermes` or `team`. Test added.
Final: fixed (A2) a cursor past the last notice (a restored database) silenced news — it comes back to the last notice. Test added.
Final: fixed (A4, decision) unpublished listings reached Hermes, wider than «only public data (C0)» — jobs only for listings on the website, at request and at claim; the editor shows the block only on a published listing. Luis answered on 31-oct: published listings only (option 2). Test added; mutation check: removing the rule turns the test red.
Final: fixed (A5) a 64 KB body could refuse 25,200 characters escaped as \uXXXX — door and proxy now allow 160 KB.
Final: fixed (A6) the proxy sends its own user-agent (Cloudflare bot rules once the domain is there).
Final: minor (deferred) (A3) a 409 can answer `id: null` if the open job closes in the same instant as the second request; the caller asks again.
Final: suite 464/464 + 14, build OK, check:release OK, walkthrough OK at 1280 and 390.
VPS security review (Luis, 31-oct): fixed — a viewing request's notice used the title of an unpublished or archived listing, or the old `listing_title_snapshot`; now only `l.title` of a listing joined as published and not archived, else «New viewing request». Test added (RED → GREEN).
VPS security review: fixed — the custodian refuses `LISTEN_HOST` 0.0.0.0, :: and [::]; past 160 KB (declared in content-length or read) it answers 413 with `connection: close` and stops reading. Tests added (RED: the old code hung reading → GREEN).
VPS security review: noted in the plan («Installation notes»): a network only for Hermes and the custodian, the key from `openssl rand -hex 32` and only in Pages' Production environment, clearing old jobs pending, every future send reads the pause.
VPS review of c5cf12d (Luis, 1-nov-2026; full e2e passed there). Fixed in one commit:
- (A1) `tabIndex={-1}` on `<main>` let a click on empty space focus the whole page (next Tab jumped to the top, keys drew the focus ring round the page) — removed; after Resume sending the focus goes to the page's h1 or h2, made focusable only then if it is not.
- (B2) the publish steps no longer carry `HERMES_KEY`: it is generated on the VPS at install time and goes only in Production. The documents keep the real state (branch not on main, 0018 not applied remotely); the review's «in production since 1-nov» wording waits for the authorised publication.
- (B3) ESTADO no longer says «si Luis lo confirma» for To confirm in the 8:00 summary (H2).
- (B4) plan Installation notes: no key and no call to the door before Hermes is installed; the custodian's second network out to APP_ORIGIN, its fixed address, restart policy; the review-focus line said 404 where the code and its test give 401.
- (B5) spec H9 said a job whose listing left the website can be cancelled by the team; the block only shows on published listings, so it waits until the listing is back. Known limit: such a job cannot be cancelled from the panel meanwhile.
- (B6) architecture §2, §3 and §6.6 aligned with what 0018 builds (a Hermes-only, listing-only `jobs`), the summary computed in GET /status, the spec not fixing Approve/Auto, published listings only.
- (B7) this ledger names no local path for the screenshots.
- (C8) the custodian checks the address it actually bound: «0», «::0», «0:0:0:0:0:0:0:0» or a name resolving to every interface make it exit, saying LISTEN_HOST. Test RED (still listening) → GREEN.
- (C9) a caller hanging up mid-body crashed the custodian (ECONNRESET outside the try) — the read is caught and the response destroyed. Test RED (ECONNRESET) → GREEN.
- (C10) custodian tests: the declared-too-big case uses http.request with flushHeaders and requires 413 with connection close; the hanging case has a 5 s timeout and destroys its request; the interface test uses fileURLToPath, requires stderr to name LISTEN_HOST, adds «0» and «::0», removes its temp dir.
- (C11) the pause bar is hidden in print, so the owner report stays one page.
Suite after these fixes: 467 of 468; build OK; check:release OK. The one failure is not this branch's: `tests/server/tenancies.test.mjs:209` («a service switch moving collect_from…») also fails on main on 1-nov-2026 (it uses today as collect_from, and on the 1st of a month November's rent falls on the 1st instead of the 15th). It passed on 31-oct. Left untouched (outside this review's scope); noted for development.
