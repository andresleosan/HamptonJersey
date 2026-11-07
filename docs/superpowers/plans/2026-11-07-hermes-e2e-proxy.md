# Hermes Turnstile E2E repair

> **For agentic workers:** Use superpowers:executing-plans. This is a local test environment repair; preserve the pending REG-11 commit.

**Goal:** Run the real complete E2E inside Hermes using its existing permitted HTTP proxy.

**Architecture:** Compile the existing Pages Functions with Wrangler, serve that bundle and site assets with the same installed Miniflare runtime, and forward outbound fetch requests through Undici's EnvHttpProxyAgent. Fresh local D1/R2 and synthetic credentials remain isolated from production. The browser already reaches Turnstile; the failing component is workerd's direct DNS resolution.

**Spec / decisions:** Luis authorized fixing the Hermes test blockage. Investigation reproduced default workerd fetch failing DNS and the same fetch returning HTTP 200 through the installed proxy. Keep real Siteverify validation and official test keys; never mock success or modify application authentication. No migration or publication is authorized by this repair request. Existing REG-11 implementation remains intact.

**Design constraints:** DESIGN.md security requires server validation of Turnstile. Keep that code unchanged. No UI, palette, typography, spacing or performance changes, and no new production dependencies. Bind the fixture to 127.0.0.1. Use the existing proxy and NO_PROXY; do not alter network policy, wrappers, services, credentials or locks. Synthetic variable files mode 600, their directory mode 700. No real data or .dev.vars copied.

**Skills applied:** systematic-debugging identifies the failed component; grill-me resolves testing-vs-production, ownership and network decisions from context; writing-plans and executing-plans structure the repair; TDD uses the observed failing E2E and minimal runtime reproduction as RED. Design/UI skills are not applicable because the product UI is unchanged. Security review covers test-only credentials and local routing; ponytail means a small launcher using installed dependencies. No framework or production refactor.

**Review focus:** Preserve POST bodies, response status and redirects; honour the existing proxy including loopback exclusions; keep local persistence identical to Wrangler; keep production credentials out of fixtures; clean up the fixture and child processes on failures.

## Task 1: Repeatable local E2E

- [x] Reproduce workerd DNS failure and verify the installed proxy reaches the same endpoint.
- [x] Add tests/serve-e2e.cjs for the real Functions bundle, assets, D1 and R2 using the allowed proxy.
- [x] Add tests/run-e2e.cjs and npm run test:e2e: fresh local migrations and seed, test-only variables, build, server, unchanged E2E assertions, cleanup.
- [x] Allow tests/e2e.cjs to read E2E_VARS, preserving the old .dev.vars fallback for manual runs.
- [x] Verify full E2E, npm test, build and check:release inside Hermes. Check REG-11 public submissions with MCP on local fixtures.
- [x] Review the repair independently; update the roadmap and private handoff with observed results. Commit only after review; no push or production migration.

Pre-flight: runner passes persist/varsFile to server and the same paths to the E2E; migration and emulator share persist/v3. Assets use the compiled Functions router before static fallbacks. The existing general E2E verifies URL redirects and dynamic pages.
