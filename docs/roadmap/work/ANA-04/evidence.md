# ANA-04 · Synthetic validation and activation gates

This is prepared work, not an approved deployment. The current client producer is fixed off, the public endpoint validates then returns unavailable, the Staff endpoint returns an unavailable source, and the search-retention hook is fixed off. The proposed schema is deliberately outside `migrations/`. Nothing in this work establishes that a remote schema, policy, notice or budget has been verified. Activating any part requires a separate reviewed change and evidence for all gates below.

## Privacy and interpretation

The only payload fields are the fixed event and version, four closed filter values and a boolean for the visible result set. No identifier, IP, cookie, URL, referrer or free text is collected by this code; unknown values and extra fields are rejected. The browser request omits credentials and referrer, with no retry, queue or navigation dependency. The validated request temporarily contains a combination in transit; the transaction stores only individual marginal counts, a total and an optional zero-result count. No action-level or visitor-level row is stored. Infrastructure and access logging must be separately checked before activation: application code cannot promise how external infrastructure handles requests.

Options and version 1 labels are shared; historic schemas must remain available when another version is added. Unknown versions or values must not be rendered as zero; recorded marginal series retain their version and individual day without publishing combinations. Search actions are not people. A missing source or a failed read is unavailable; an absent daily total is no data. Coverage remains unknown, including on days without a recorded cap. Failure to write D1 cannot itself guarantee a recorded failure marker.

## D1 and cost, local synthetic only

The proposed D1 batch first claims a daily Jersey budget and uses the preceding statement's `changes()` to gate each separate marginal. The batch is transactional. Local Miniflare D1 tested 25 concurrent attempts at 4,999, 1,000 further attempts after the cap, a forced rollback and a bounded, idempotent retention pass leaving an unrelated table untouched. DST transition dates are included. This does not prove production concurrency, quotas, policy, infrastructure logging or cost.

In the local synthetic measurement, an uncapped action with zero results used 6 rows read and 7 rows written; an action without zero results needs at most 6 writes. Thus 5,000 fully populated actions can write up to 35,000 aggregate/budget rows per day, in addition to all other application writes and indexes. The cap is on accepted actions, not incoming requests; repeated capped requests still consume request/SQL/read resources and need independent abuse and rate controls (ANA-09). D1 errors may lose measurements, and a 204 from a future enabled endpoint must mean only that the request was processed, not that the counters increased.

A local 90-day read over 4,500 synthetic aggregate rows across 180 days used one compound query and read 2,342 rows; the plan used the day-leading primary keys. With version 1 there are at most 25 distinct aggregate keys per day, plus one budget row. Versions, indexing, actual deployed schema and all other workloads must be included in a real budget review; these local measurements are not a bill or production benchmark.

The proposed retention is the current Jersey day plus 90 previous days. Each pass removes at most 1,000 old keys per table and can be repeated safely; large backlogs require multiple passes. This is a technical proposal, not an approved policy. The maintenance hook stays off until PRE-12 and the PRE-09 notice are approved and the real schema has been checked.

## Before any activation

- Verify and approve the privacy notice, retention policy, request/edge logging and Staff permissions.
- Verify the actual D1 schema and migration ordinal; review the proposed SQL and the transaction against the deployed D1 runtime, and independently monitor failures and coverage.
- Budget aggregate, index, query and all other account traffic against current limits and costs; provide incoming-request protection independently of the 5,000-action cap.
- Re-run synthetic, browser, accessibility and release checks against the final integrated branch; explicitly review and change each hard-closed gate only after these checks.

## Cached public assets

Synthetic, networkless browser tests use snapshots of the historical HTML and library to exercise mixed releases and an unavailable dimensions resource. Catalogue filters, links and history remain usable; measurement is suppressed if its canonical module or the new helper is missing. The compatibility values are checked for exact parity with the canonical version-1 dimensions. This does not verify a deployed CDN or cache state.

## Integrated validation

On `1ee082123db27ac7d874db0fa9a1ddf91afa049c`, the complete suite passed with 1,536 JavaScript and 25 Python tests; build, release, team and package checks passed. The isolated browser runner passed the cached-file compatibility cases, synthetic producer, unavailable trends and integrated ANA-01 journeys. These checks used local fixtures, not production data. The P1 cached-page incompatibility identified by the independent review was reproduced before the fix; fallback values are tested for parity with the canonical dimensions, and metrics are never sent from the fallback.
