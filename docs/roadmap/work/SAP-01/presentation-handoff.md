# SAP-01 presentation handoff

The presentation model and `SearchProgress` component are prepared but not mounted or activated. They do not fetch, initiate matching, access D1, or establish authorization. Local synthetic tests validate presentation only; they are not evidence of production behavior or completion of SAP-01.

## Why the read path is not connected

- EST-01's `getSearchProgress` is an internal reader. It returns the progress projection, not global match counts or the server clock in a single response. The existing applicant detail reads the applicant separately from its counts, and the list has its own query. Combining those responses would not establish one SQL snapshot and could display counts from a different search revision.
- `EST01_PROGRESS_READY` is an explicit feature flag, not proof that the proposed progress schema, identity ledger, retention and deployment controls have been approved and installed. The SQL under EST-01 remains a proposal; this work does not install it. The flag must stay off until the required controls are actually ready.
- The authenticated route must itself validate the applicant ID and supply authorization before any progress is exposed. Its future SELECT or transactional batch must read applicant, progress and global counts together, capture `server_time` after that snapshot, return only the approved DTO, avoid N+1 list reads and preserve no-store behavior. The flag-off and unavailable-schema paths must fail closed without treating missing telemetry as a recorded check.

## Integration requirements

Pass the component one coherent `{search_progress, match_counts, server_time}` snapshot belonging to the selected applicant. The caller must own loading, a read-only reload, session expiry, non-overlapping visible polling and generation invalidation on navigation and each mutation; it must retain the previous snapshot as stale on refresh failure. Mount only one `announce` instance in the detail view, keep relative dates outside its live region and do not announce every list row. The component displays stale errors, `recordedMessage` and explicit labels for unverified dates; it does not itself enforce snapshot identity or retry a request.

After the data contract and real gate are reviewed, integrate list/detail/polling and verify the actual flows, keyboard, focus, responsive layout and network behavior using the isolated E2E launcher from AGENTS.md. No browser or real data was used for this disconnected component.
