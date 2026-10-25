# SDD ledger — plan: docs/superpowers/plans/2026-10-25-hampton-app-jersey-fields.md
Spec: docs/superpowers/specs/2026-10-25-hampton-app-jersey-fields-design.md

## Pre-flight scan
| Rows | Finding |
|---|---|
| T1 -> T2 | T2 uses T1 columns/public fields/check key — consistent |
| T1 self | table-driven tests vs §3 — consistent |
| T2 self | e2e needs seeded STN rent applicant + qualified rental — seed in T2 |
Scan clean. Rules sourced from gov.je (read 2026-10-25 via web-fetch).
BASE T1: 163b913
T1 implementer done 397bec7 (414+13). Ruling on noise: when the applicant's status is unknown — registered & no restriction → meets ('Registered: open to all'); qualified or a restriction → unknown with its reason; category unknown & no restriction → no housing check at all (nothing to say). Spec J5 amended; goes to the T1 fix round. MatchCard label → T2.
T1 review: Approved (every §3 cell verified, +0.33µs/eval). Fix round 1 sent: J5 amendment, clearer evidence wording, FTB ignored for renters, hoist literal/early return.
Fix round 1 9990023. Controller fix 90e3685: no-status buyer of a Registered Royal Court sale gets no check (not 'open to all'); test fails without it. Task 1: complete. BASE T2: 90e3685
T2 implementer done 00d517d (415+13, build, e2e OK). Controller viewed editor + 360px facts screenshots — good. Accepted concerns: tenure shown for commercial; category/restriction only for country Jersey; photo count from saved media; seed changed one Insights assertion. Ruling: one opus review = T2 task review + whole-feature final review.
Final review (opus, T2+whole; independent oracle of 2,160 combinations, 0 mismatches): Ready after fixes. Fix wave sent: Registered wording on Royal Court sales (Important), FTB rule — only needs_to_sell fails (cash/nothing_to_sell can be first-time buyers; spec §3 amended), aria link, card title + Nothing missing state, reduced-motion scroll, importers set tenure_type. Deploy order: 0015 before push (pushed code before migration would 500 editor saves).
Fix wave a72875a (415+14, build, e2e OK); controller verified tests and the wording/FTB diff. Task 2: complete.
