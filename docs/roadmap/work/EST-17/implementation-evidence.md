# EST-17 · construction evidence · 9 November 2026

This is a local implementation on top of canonical main79ddcb0. It is not evidence of a remote migration, deployment or activation.

## Behavior

- Listings has a separate Ready for review segment. Submit for review keeps the property hidden; Return to draft clears the review markers. Edits preserve review, while publish/unpublish/archive/restore clear it. Publishing still supports normal drafts and preserves Drive approval and active-sale restrictions.
- All editorial publication commands, including Drive approval, use the version actually viewed by staff. A stale command returns409 without publishing or adding a state event.
- A rental's manual marketing form records Let agreed, Let or Return to market with a date, staff actor and an existing document/research source belonging to the listing. Generic create/update/import cannot forge these states or bypass them through an operation change. Legacy Lease and sales states are preserved.
- The event, operation receipt and private evidence metadata snapshot commit together. Repeating a request returns the original event without duplicating evidence. A moved/unavailable reference fails without changing the listing. Research refresh and ordinary deletion preserve the historical snapshot and event; snapshots contain metadata, never the document body, and are absent from public responses and event payloads.
- Public labels and styling match the panel. Agreed/let properties are excluded from new match candidates and new public viewing slots. Existing visits/history remain. No tenancy, charge, sale or search closure is created by a marketing action.

## Verification

Automated evidence lives in `tests/server/listing-editorial.test.mjs`, `rental-marketing.test.mjs`, `listing-editorial-migration.test.mjs`, import tests and existing sales/queue/event regressions. The populated rebuild compares all pre-existing tables, indices and trigger identities, and checks foreign keys before/after with enforcement enabled. The migration is exercised only on local fixtures.

`tests/listing-editorial.e2e.cjs` runs real local D1/Pages/React at1280 and390: review/publish/return, stale versions, valid rental states and public labels, required fields, temporary/conflict errors with preserved input, escaped evidence titles, keyboard/focus and200% zoom. Results, full-suite counts, review fixes and general regression evidence are recorded in the build ledger. Playwright MCP cannot start its configured browser in this environment; the runner is separate evidence.

Final result:1003JavaScript+14Python PASS; build, strict release, roadmap and package checks PASS. General browser phases `admin,reg17` and `public,urls` PASS; final EST-17 local1280/390/200% PASS. Real populated D1 migration compares53pre-existing tables with no changed data tables and no foreign-key errors. A first general run failed its login wait; serial phase reruns succeeded, and the initial failure remains recorded in the ledger.

Independent review identified stale Drive approval, restrictive live evidence references and deletion/refresh failures. Each was reproduced and fixed with a regression. A receipt-attribution race was also reproduced and fixed by selecting the event inside the transaction. No important finding is knowingly deferred.

## Design gate for the changed surface

Hampton's existing operational layout, current CSS tokens, native controls and English functional copy remain. Dials ENERGY/RHYTHM/MOTION1/1/1: calm density, existing bronze focus, no new motion or decoration.

| Gate | Result and evidence |
| --- | --- |
| R02 text separators | PASS: new UI uses functional prose and native labels. |
| R03 mobile layout | PASS: focal1280/390 and200% reflow assertions; editor grids use bounded tracks. |
| R17/R18/R38 honest content | PASS: no metrics, testimonials or product filler added; fixtures are isolated tests. |
| R23/R24 real assets/navigation | PASS: no new brand assets or navigation destinations. |
| R25 contrast | PASS: inherited ink/stone/error tokens on paper, existing visible bronze focus; no new palette. |
| R26/R27/R28 behavior/states | PASS: all new actions call protected routes; empty evidence/review, loading and error behavior specified; no FAQ added. |
| R32 keyboard | PASS: native required fields and tab controls; marketing focus restored after the committed revision. |
| R33 source | PASS: components and CSS edited in source; standalone migration derived from the verified old schema. |
| R34/R35/R36/R37 delivery | PASS: existing light theme, build and local click-through; limitations explicitly recorded, no fabricated activation. |
| R01/R04/R06/R07/R08/R09 | PASS: no gradients, icon package, extra fonts, decorative patterns/arrows or promotional badges. |
| R10/R12/R13/R14/R19/R22 | PASS: no new glass, shadows, glow, feature-card composition, animation or illustration. |
| Liveliness | PASS: real listing decision is the focal point; inherited spacing, bronze focus and Tenor headings identify Hampton. |
| C1–C5/R05/R11 | PASS: controls serve the actual workflow, bounded grids pass reflow; existing button/card/input radius hierarchy retained. |
| R15/R16/R20/R21/R29/R30/R31 | PASS: specific action copy, no marketing language, product's existing visual system; no new theme or cloned layout. |

## Publication boundary

Published with explicit approval on9November2026 at f2113769903548f4c5a4763a51c7962e84e80aef. Migration0034 applied remotely:53application tables retain their counts and foreign_key_check is empty. Pages and Jobs checks succeeded; public site/panel return200, protected API reads401, and served JS/CSS match the approved build. No production test fixtures were written. Integrated evidence recorded; the expired own lease was explicitly recovered in the same checkout and completed at generation2, with publication turn closed and catalogue imported. Future shared-inventory and tenancy producers remain separate work.
