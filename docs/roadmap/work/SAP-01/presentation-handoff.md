# SAP-01 presentation handoff

The presentation model and `SearchProgress` component are prepared but not mounted or activated. They do not fetch, initiate matching, access D1, or establish authorization. Local synthetic tests validate presentation only; they are not evidence of production behavior or completion of SAP-01.

## Why the read path is not connected

- The internal `getSearchProgressSnapshot` now reads progress and global counts in one SELECT and captures the clock afterward; it is deliberately not routed. The existing applicant detail reads the applicant separately from its counts, and the list has its own query. Combining those existing responses would not establish one SQL snapshot and could display counts from a different search revision. The new single-search reader alone does not satisfy the bounded list projection or provide authorization.
- `EST01_PROGRESS_READY` is an explicit feature flag, not proof that the proposed progress schema, identity ledger, retention and deployment controls have been approved and installed. The SQL under EST-01 remains a proposal; this work does not install it. The flag must stay off until the required controls are actually ready.
- The authenticated route must itself validate the applicant ID and supply authorization before any progress is exposed. Its future SELECT or transactional batch must read applicant, progress and global counts together, capture `server_time` after that snapshot, return only the approved DTO, avoid N+1 list reads and preserve no-store behavior. The flag-off and unavailable-schema paths must fail closed without treating missing telemetry as a recorded check.

## Integration requirements

Pass the component one coherent `{search_progress, match_counts, server_time}` snapshot belonging to the selected applicant. The caller must own loading, a read-only reload returning a Promise that settles on success or failure, session expiry, non-overlapping visible polling and generation invalidation on navigation and each mutation; it must retain the previous snapshot as stale on refresh failure. Mount only one `announce` instance in the detail view, keep relative dates outside its live region and do not announce every list row. The component displays stale errors, `recordedMessage` and explicit labels for unverified dates; it does not itself enforce snapshot identity. The reload callback must reject on failure and update the stale snapshot itself; the component catches rejection and suppresses duplicate activations until the returned Promise settles. A synchronous throw is treated as a failed attempt. Before rejecting or throwing synchronously, the caller must record or surface the error safely, without secrets or personal data: the component catches the rejection and does not report it. The caller must cancel the read or invalidate its response after unmount and after changes of applicant or generation; the component does not cancel the operation or protect the caller from late results. No such caller is implemented by this work.

After the data contract and real gate are reviewed, integrate list/detail/polling and verify the actual flows, keyboard, focus, responsive layout and network behavior using the isolated E2E launcher from AGENTS.md. An isolated Chromium test uses a synthetic harness at 1280 and 390 pixels for error, retry and keyboard focus; it is not a product-flow test. No real data was used.

Independent review confirmed the caller owns safe error reporting and cancellation or invalidation of late responses. The component does not cancel the operation.

Integration check on 13-Nov: 2,137 JavaScript tests and 25 Python tests passed, along with build, release, catalog and package checks. The isolated Chromium harness passed at 1280 and 390 pixels; it is not a product-flow or screen-reader test.
The internal reader was tested against synthetic SQLite and disposable local D1, including a write immediately after the read. This establishes behavior for that fixture, not production schema readiness, access rights, or operational performance.

Independent review found no blocking issue in the disconnected snapshot reader. Its D1 fixture did not exercise the `first-primary` session branch and introduced a write only after the SELECT; counts scale with the applicant’s matches. Authorization, operational measurement and late-response protection remain prerequisites.

Integration with REG-12: 2,159 JavaScript tests and 25 Python tests passed, plus build, release, catalog and package checks. The reader remains internal; first-primary and production authorization are not verified by these tests.
