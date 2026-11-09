# NOT-08 · Manual Inbox categories

9 November 2026. Built locally on published EST-17 `f2113769903548f4c5a4763a51c7962e84e80aef`. Publication and remote migration0035 require approval of the final reviewed SHA. This document does not certify activated mail, Meta or future producers.

## Delivered behavior

- Agency replies, Messages and Compliance share the existing Inbox with All, New applicants, Viewings, Matched and Tasks. Server filters and counts cover all open tasks before the list limit200. A single shared category catalogue supplies validation, labels and preferences.
- Staff can classify a manual follow-up, choose an owner/deadline and retain its typed applicant/viewing/rental destination. Rental context retains the specific tenancy/check/deadline/repair. Unknown category, arbitrary target/context and unavailable records are rejected. The first event INSERT checks rental context too; rejected context leaves no event, task or receipt.
- Omitted category retains the exact old request hash. New classified retries reuse the original operation ID/payload; changing the category under that ID returns409. Event, task and receipt commit together; insertion failure rolls them all back.
- Current checks and overdue tenancy deadlines appear in Compliance. A classification-only update of an existing pending task preserves its source event and identity even when its observation signature has not changed. Revision/history advance; read rows remain, while the new revision must be read again. Done closes the notice, without resolving a check or changing the source obligation.
- Informational compliance.updated facts use Compliance from their insertion onward. No historical Feed is rebuilt. Existing saved Feed choices remain unchanged; new categories begin unchecked for those users. Without preferences the full catalogue applies. Preferences cannot hide Needs action or completed tasks.
- Category navigation, selection, errors and uncertain retries retain existing draft protection. Newly created tasks select their actual category. A category-only draft captures its initial category once, so a source refresh cannot silently remove its dirty status.

## Migration and acceptance evidence

`0035_notification_categories.sql` rebuilds only the notification category constraint and updates the event projection view, preserving all existing schema objects and rows. It keeps FK enforcement enabled, saves/restores notification children affected by cascades and checks both directions of row equality inside the migration. It does not rewrite preferences or historical Feed.

Eight new server tests cover categories, filters/preferences, old/new receipts, target/context validation with zero writes on rejection,201task counters, Compliance source semantics, same-signature reclassification, rollback and a populated migration preserving tables/indexes/triggers/history/reads/preferences. They were observed failing before implementation and then passing.

The real local D1 populated rehearsal applied0035 to a database already migrated through0034 with fixture tasks, reads, operations, preferences and observations. Hashes of55tables remained unchanged, with no FK errors. This is a local rehearsal; no NOT-08 migration or fixtures were applied in production.

Full JavaScript/Python suite:1011JS +14Python PASS. Final focused browser runner passes1280/390 and zoom200: manual classification, required fields, escaped title, uncertain503 retry with identical payload, category selection after creation, Done/Feed preference behavior, rental check navigation, category load errors/empty states, keyboard/focus and a colleague moving the task while a draft is open. Initial fixture/selector defects were corrected separately from product defects.

## Independent review and limits

Independent read-only code review found no Critical or Important issue and one Minor: refreshing the source could change the baseline of a category-only draft. It was reproduced by a real browser test, fixed by capturing the baseline on mount and verified GREEN at1280/390. No finding is deferred. This correction was verified by tests; a second independent review is not claimed.

Playwright MCP fails before about:blank because its configured sandbox cannot start in this environment. No controls were changed. Local runner/captures are separate evidence and do not certify MCP. General browser phases admin/reg17 and public/urls both pass on separate fresh local fixtures. Build, strict release,250task catalogue,23package coverage and diff checks pass; the inherited>500KB chunk warning remains. Final captures were inspected at1280/390 and200% zoom, with the selected task loaded.

Agency replies and Messages here represent work entered by staff. Real incoming communications and the future consultations/calls/capture/sources/day21/dictation producers still require their own modules and channel activation. The shared inventory and the deferred listing-history view are outside this delivery.

## Design checks

Uses the existing Hampton panel palette, Tenor Sans/Montserrat, components and spacing. Category controls wrap at390px, maintain44px mobile targets, visible keyboard focus and selected state; no new fonts, libraries or animation. English functional labels, native controls, useful empty/error states and escaped text. No personal data in new URLs, storage, public logs or evidence. Categories reuse grouped SQL counts and the existing visible-tab30second polling, without per-notice requests.
