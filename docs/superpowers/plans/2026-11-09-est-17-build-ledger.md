# EST-17 build ledger · 9 November 2026

Base verified2026-11-09T06:04:24Z: /tmp/hampton-est17-y1wdQ8JM, main/HEAD/GitHub79ddcb0d1b0b2cff79ec2a64294bf835209e7a58, clean; check-avanzar exit0. Original /root/HamptonJersey and unrelated untracked work preserved.

Reviewed existing editorial spec/plan, closed Lista1 master, task/catalogue, architecture, DESIGN and current listing, queue, events, sales/rental boundaries. Catalogue has no EST-17 dependencies. Build claim e1b2216b-32d7-4ce9-a82f-357dac0df309 generation1 confirmed active/build, list1; foreground watch renews. No remote migration, publication or activation authorized.

Ruling: use existing listing-owned document media and research-source IDs as evidence; human staff records the action/date/reason. The server verifies ownership again inside the batch; neither an arbitrary URL nor an old listing confirmation is proof of an agreement. This avoids inventing tenancy links or an external evidence service. Completion is a dated human assertion with linked evidence, not document analysis.

Ruling: the listings CHECK rebuild must explicitly preserve cascade/set-null children and temporarily recreate only the affected schema triggers inside the migration transaction. Foreign-key integrity stays enabled. Populated migration testing must compare every table before/after, including notification bookkeeping. Stop if that cannot be proved locally.

Centinela alerts classified in a separate private report: public credential variable references and a synthetic test fixture, no real secret exposure found; no remediation or host audit.

Initial stage: implementation and validation were pending; the entries below record the subsequent evidence.

Progress: review/rental contracts first failed against missing routes/tables, then passed. Populated migration compares every pre-existing table including sales, media, matches, viewings, imports, chats, jobs and notification bookkeeping; all rows, indexes and trigger identities preserved, foreign_key_check clean with integrity enabled. Local D1 migration exercised by e2e runner. A migration-generation retry initially included its own0034 input; corrected to freeze schema inputs through0033, then revalidated. This generator lives only in /tmp; the committed artifact is standalone SQL.

Global regression run996JS+14Python passed. Further regression cases subsequently added for evidence moving during a write, import observations and review Feed projection; final run pending. Review and marketing evidence/event failures roll back. UI focus after successful marketing was reproduced as failing, corrected with an effect after the new listing revision commits; browser subsequently progressed past that check. Public-detail test selectors were corrected to match the existing summary and global navigation.

Coordination correction: the initial e2e scope request accidentally read hostId from the local summary rather than the claim, creating an unused e2e:undefined resource. The real host resource was subsequently reviewed and confirmed by scope; no foreign reservation was changed. Retain the malformed historical resource rather than editing private state. Tests use unique temporary databases and dynamic local ports. No infrastructure controls changed.

Playwright MCP fails before about:blank because its configured Chromium sandbox cannot run as root. No control changes attempted; local runner evidence is recorded separately and does not certify MCP. Centinela focal report stays private in /tmp.

## Independent review and correction pass

Fresh read-only reviewer found no Critical, three Important findings and one Minor. Important: Drive approval used the server's freshly read version rather than the version viewed by staff; source FK blocked normal research refresh; media/listing FKs blocked existing deletion paths. Each was reproduced RED, then corrected GREEN. Drive UI/route now require the reviewed updated_at and leave queue review intact on conflict. Existing queue regression fixtures explicitly supply the current version through the test client; direct tests cover missing/stale versions.

Final: Ruling: regrade the review-receipt race from Minor to Important because returning another employee's event ID misattributes the mutation's audit receipt. A held/interleaved batch reproduced the incorrect listing.updated ID; selecting the generated review event inside its own context fixed it. No deferred minors.

Ruling: preserve private, immutable metadata snapshots and typed historical listing/media/source IDs, with a real event_id FK. Mutable source/media/listing rows are checked before and inside the action batch, but no longer become deletion barriers. This refines the historical plan's live-reference suggestion: research refresh and normal erasure keep their behavior, while the action's original metadata stays in the separate evidence table; no document body, snapshot, URL or title enters events/public responses. Reimport cannot overwrite this table. Lifecycle regressions prove source refresh, document deletion and listing deletion preserve snapshots/events. A referenced file may later be unavailable; a metadata snapshot is not a preserved file or analysis of its contents. The application has no snapshot-edit endpoint.

Other RED→GREEN evidence: moving a document to another listing between validation and write returns409 with no event/receipt; property review events now project into the existing Feed; imported Let/Let agreed are observations and require confirmation through the manual route. Existing sales/lease states remain lossless. Public slots reject new rental states. Jersey calendar helpers provide confirmation-day boundaries; no new timezone implementation.

## Verification results

Final full JavaScript/Python suite:1003JS+14Python PASS,0failed/omitted; focused editorial7/7, rental7/7, import20/20 and populated migration1/1 pass. Full output is private under /tmp/hampton-est17-tests-final.log. Build and strict release check pass; the inherited large-chunk warning remains (about756KB/gzip213KB). Roadmap/team250tasks and packages23/250 check pass. Final build/release/team/package/diff checks repeated successfully after the last product change.

Real local D1 populated migration: /tmp/hampton-est17-populated-nea1k67u/proof.json. Applied through0033, seeded synthetic rows across all child relationships, recorded table digests, applied only0034 with Wrangler --local:71commands, exit0. Compared53pre-existing tables:0changed data tables,0foreign-key errors. New review columns are null; old values, notifications, source identities and relationships preserved. No production data or credentials copied.

Focal browser runner passed1280/390, review/return/publish, stale versions, all rental marketing states, public labels/closed booking, validation,409/503 input preservation, escaped source titles, keyboard/focus and200% zoom. Scope-specific overflow in editor/media grids was reproduced and corrected with bounded tracks. Captures private /tmp/hampton-est17-shots/est17-{1280,390}[-zoom].png. An extra final run covers the empty-evidence state and reuse of Jersey date helpers. General suite initially stopped at login while another build was running; no cause is claimed without its serial phased rerun. General final results follow below.

Final browser results: general `admin,reg17` PASS and `public,urls` PASS on isolated fresh fixtures; both phases terminate exit0. The final EST-17 run, after date-helper and empty-evidence additions, passes1280/390 with200% zoom and keyboard/focus, exit0. Logs private /tmp/hampton-est17-general-{admin,public}.log and /tmp/hampton-est17-e2e-final.log. No cause is assigned to the first concurrent-run login failure beyond preserving that failure and recording successful serial reruns. Visual inspection of desktop/mobile captures completed. Synthetic fixture media has missing image bodies; no production media/PII used.

Additional acceptance regression: an archived historical row with published=1 was reproduced restoring as visible, then fixed RED→GREEN to always restore as a hidden draft. No new review or market confirmation is inferred. The full1003suite includes this case.

Final: Ruling: the reviewer declined remote D1 behavior; the53-table real local D1 proof resolves local compatibility only. Remote behavior is a publication gate after explicit approval, not an asserted result here. Final: Ruling: browser accessibility evidence is the local runner and inspected captures; MCP remains pending without weakening its controls. Final: Ruling: evidence is a staff assertion backed by recorded metadata, not automated determination that a document establishes an agreement.

Precommit GitHub recheck2026-11-09T06:34:39Z: remote and local base79ddcb0, relation equal with own pending changes, verifier exit2 correctly classified; no remote integration needed. All41changed files pass the live reservation's scope check. Public changed-file secret-pattern scan found0flagged files; no private handoff, fixture vars, databases or audit report enters the commit. Later prepublication verification is required against the final SHA.

## Next task analysis

NOT-08 manual remains unbuilt: Inbox categories currently All/New applicants/Matched/Viewings/Tasks; new producer labels/categories and destinations can reuse current task/event contracts. Read task, existing NOT-01 design, Inbox.jsx and notification routes. Coordinator confirms integrated EST-18 cf0c86d and NOT-11 3213c166. Actual email/Meta activation is only for their real channels, not manual categories. Multiple UI/server/test surfaces, existing schemas and no new sending policy make gpt-6.1-sol with high appropriate. Local Codex catalogue confirms both model and effort available; execution settings unchanged. Recommend it after EST-17 publication.

Publication/migration remain unauthorized. Commit remains local; no integrated evidence for EST-17 is asserted before remote main includes it. Shared-inventory/tenancy automation is future work, not completed by manual marketing states.
