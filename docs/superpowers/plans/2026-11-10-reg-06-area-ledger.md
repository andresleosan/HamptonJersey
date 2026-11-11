# REG-06 · Build ledger

- 10-nov-2026: Luis approved [the area design](../specs/2026-11-10-paq-02-reg-06-proposal.md) in this thread. Approval covers building, not publishing or applying production migrations.
- Resumed isolated `/tmp/hampton-paq02-15jls7Y1/repo`; local lock held. GitHub `5779655` integrated as local `e619fc3`, preserving REG-07 `d4afba0`; no work from another checkout was adopted.
- Ruling: newly published REG-06 planning lists BUS-12/AUT-19 for future review/snapshots. The approved capture and current BUS-14 matching can be built independently; those future integrations remain open and are not implemented or represented as complete.
- Migration ordinal 0039 checked free in the verified base; production application requires separate authorization. No production data or credentials are used in tests.
- Browser constraints from the previous stage: Playwright MCP cannot launch sandboxed Chromium; the general e2e lacks Playwright Core. Recheck available capabilities without weakening controls; do not claim real-browser validation if unavailable.
- Centinela flagged output from a tracked test helper. A read-only check established that the value is a fixed synthetic fixture, used with an in-memory database, with no environment read; the helper matches GitHub. No real secret exposure or active compromise is evidenced, and no remediation was performed. The triggering content is not repeated here.
- A later output alert concerned the tracked local E2E runner's fixture instructions. Read-only checks confirmed it generates ephemeral test credentials, uses a local temporary database, and that the relevant instructions match GitHub. No real credential or active compromise was evidenced; no remediation was performed and the triggering content is not repeated.
- Independent review identified missed duplicate exclusions and cleared preferences, false Anywhere labels in Review/Insights, old public drafts skipping the area question, missing confirmations and must-have handling, and stale Review decisions/cursors. Corrections merge new exclusions without discarding existing ones, preserve legacy state, require confirmation before removing selected data, and use revision checks in both staff match flows. See the focal tests and repeat review for remaining findings.
- Local verification: 1,137 JavaScript tests and 14 Python tests passed, together with build, strict release, team catalog and package checks; the populated migration test passed SQLite integrity and foreign-key checks. Vite reports a bundle-size warning above 500 kB. No production database was contacted or migrated.
- `npm run test:e2e` prepared the isolated local fixture with the globally installed Playwright and Chromium sandbox explicitly enabled. Chromium failed to initialize its sandbox; Playwright MCP failed the same way. No browser sandbox was disabled. Real-browser e2e, desktop/mobile visual checks and 200% zoom remain unverified.
- Repeat independent review found and reproduced an Undo race; the response now reads the card, search summary and revision in one snapshot. A concurrent-edit regression and an integrated DOM/SQLite sequence for Skip, Undo, Shortlist and stale restart pass. The reviewer repeated the targeted suite (53/53) and reported no remaining findings within the reviewed scope.

## 10 November: isolated browser verification

- The earlier Chromium sandbox failure remains historical. A real version-matched WebKit GTK browser (Playwright WebKit revision 2311) runs in a disposable Docker container as a non-root user, with network disabled, no host mounts or added capabilities, read-only root, no-new-privileges and seccomp. No separate browser-internal namespace is claimed.
- `npm run test:e2e:isolated` runs local fixture data only. `tests/reg06-area-e2e.cjs` verified registration, editing and persistence of chosen/unknown/any areas, exclusions and preference; matches and REG-07 Pets Unknown; keyboard focus and controls; and no horizontal overflow at 1280 and 390 pixels, including native zoom above 200%.
- The offline fixture substitutes anti-spam verification and the external widget, uses a self-signed local HTTPS certificate accepted only in the test browser, and emulates clipboard access where requested. It does not verify Cloudflare, the production TLS chain or the native system clipboard.
- A read-only production migration listing reported only `0039_area_answers.sql` pending. It was not applied; no production data were used in the browser tests. Publication and migration require separate authorization of the reviewed exact SHA, followed by production verification.

## Public production baseline, before delivery

- `npm run test:production:readonly` ran the current public homepage and registration journey anonymously in real WebKit at 1280/390, without submitting a form. With the final narrower allowlist it reported 22 blocked requests and confirmed the new REG-06 choices are not yet visible. This is a baseline of the existing deployment, not verification of the unpublished change.
- This mode uses a separate temporary container with bridge networking and no host mounts, added capabilities or existing credentials. Browser routing permits only GET/HEAD on an explicit set of reviewed static files and public read endpoints on the fixed origin, rejects redirects, other paths, other origins and other methods, blocks WebSockets and service workers, and retains normal TLS certificate checks. This is an application-level browser policy, not a host firewall or an OS-level egress allowlist. External assets are intentionally unavailable.
- After an authorized deployment, `E2E_PROD_EXPECT_REG06=1 npm run test:production:readonly` requires the three area choices to be visible. It does not exercise authenticated staff workflows or write application data.

## Focused rerun and zoom fixes

- The final focused WebKit rerun passed at both widths. In addition to the selection and unknown states, it saved and reloaded Anywhere while retaining the exclusion, and checked keyboard focus above fixed bars at native zoom. At 390 px the priority switch previously extended beyond its card; the shared control spacing now fits the measured card while retaining its minimum target size.
- During development WebKitGTK occasionally left a dismissed native confirmation painted over the page, and smooth scrolling could move the privacy checkbox during an automated click. The test restores the synthetic session draft in a new context after confirmation dialogs and waits for the control to settle before an actual click. This addresses the observed automation race; it does not establish that every rapid real-user interaction has been tested.
- The general browser suite passed `public`, `urls`, `admin` and `reg17` with the same isolated local fixture. A directed cancellation check confirmed the test runner removes its own temporary container. The final public smoke passed anonymously with the explicit read-only route allowlist.

- Final automated checks: `npm test` 1,146 JavaScript and 14 Python passed; build, release, team catalog and package checks passed.

## 11-nov-2026 · Publicación verificada

- El commit `fe9618f23677c7fab4f8aa19a3f7f836dd290df2` llegó a main; la migración 0039 se aplicó y se verificaron registro, columnas, índice y triggers. El marcador previo de recuperación se conservó fuera del repositorio.
- Cloudflare Pages y Workers Builds `hampton-jobs` terminaron correctamente. La prueba pública anónima de solo lectura, con WebKit aislado a 1280/390, confirmó las tres opciones de zona. No hubo envío de datos ni prueba autenticada del panel en producción.
- REG-07 recibió después un ajuste local adicional de mascotas imprescindibles; su verificación y publicación se registran por separado.
