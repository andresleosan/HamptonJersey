# Hermes E2E proxy repair · verification ledger

## Scope and base

7-nov-2026. User authorized repairing the Turnstile blockage in Hermes. The shared clone was main with pending REG-11 at 712bf27. Its concurrent review fixes advanced it to e62d1b964bbd9d235c6aa465c712105f0e5f3f91; the pre-edit SHA guard stopped an attempted edit and the repair was applied on that new base. Origin/main was 5d10220007cbca9860b86fdc3924614aa2601b5f after fetch. Application changes and migration 0025 were preserved. h1's existing lock was verified through its normal SSH terminal. No push or production migration performed.

## Cause and correction

A minimal workerd fetch of the Turnstile script failed with a DNS lookup error. The identical request through the existing EnvHttpProxyAgent returned HTTP 200; Chromium also returned 200 without a browser change. Thus the failing component was the local server's outbound transport. tests/serve-e2e.cjs bundles the actual Pages Functions and runs them on the installed Miniflare with real outbound fetch through the existing proxy and NO_PROXY. It preserves methods, bodies, headers, status and redirects. Turnstile verification in server/ is unchanged; no approval response is mocked.

tests/run-e2e.cjs creates fresh local D1/R2 state, builds, applies only local migrations and seeds fixtures. It generates a random session signing value and synthetic RSA for the fake Drive; the Turnstile pair comes from the existing official test example. Variables are mode 600 in a mode 700 temporary directory. The emulator binds 127.0.0.1. E2E_VARS lets the general suite use that file; all existing assertions remain unchanged. The parent cleans its fixture after child completion. Production variables, data, network policy, wrappers, credentials, permissions and services remain untouched.

## Evidence

- RED: original REG-11 E2E in Hermes stopped before the viewing confirmation, with workerd DNS failure in verifyTurnstile. Independent REG-11 review reproduced the same failure. A minimal runtime comparison isolated the failed transport.
- GREEN: npm run test:e2e inside hermes-taller completed with e2e OK and exit 0 on e62d1b9 plus this test setup. All general phases, including public submissions, URLs, panel, fake Drive and web chat ran. First full log: /tmp/hampton-turnstile-complete-e2e.log inside the workshop.
- Final code suite: 656 JavaScript + 14 Python, all passed. /tmp/hampton-turnstile-unit-final.log. Build passed; existing bundle warning above 500 kB. check:release passed.
- Final MCP used a separate local fixture and the same launcher: commercial business transfer at 1280 and residential rent plus buy at 390, invalid ranges and required fields, restored focus, actual POST /api/applicants returning 201, confirmation screens, no horizontal overflow and zero pageerrors. Screenshots: /home/taller/encargos/capturas/turnstile-reg11-1280-submitted.png and turnstile-reg11-390-submitted.png. Structured result on VPS: /tmp/hampton-reg11-turnstile-mcp-result.json. No real customer submissions or external emails.
- Focused independent review of the launcher found one P2 cancellation issue: AbortSignal could reject before npm/npx descendants finished. A real-child regression was observed failing, then passing after using direct Node CLI entrypoints and settling only on close. Reviewer confirmed P2 closed with no other important findings. This is a review of the environment repair, separate from the two application-review rounds for REG-11.
- Final full repetition after the cancellation correction: PASS, e2e OK and exit 0. Log: /tmp/hampton-turnstile-complete-e2e-final.log inside the workshop. check:release and checklist JSON validation also passed after the documentation update.

## Instructions and boundaries

Both installed Hermes taller-claude instructions now point to the versioned E2E procedure instead of asserting a permanent Turnstile blockage. Their shared read-only mounts were verified against the source; all lock/publication rules and file permissions were preserved. AVANZAR, ESTADO, checklist and the REG-11 ledger now distinguish these local verification results from production activation.

The second REG-11 application review reports R1/R2/R3 corrected and no new confirmed change defects; its remaining Turnstile blocker is superseded by the successful runs above. Its dirty-tree observation refers to this concurrent, user-authorized test repair; the reviewed application commit was not rewritten. The previously identified invalid-date P2 remains a separate known issue. Matching commercial remains in M04. Migration 0025 and publication of the eventual exact SHA still need Luis's explicit approval. PC installation is outside this session.
