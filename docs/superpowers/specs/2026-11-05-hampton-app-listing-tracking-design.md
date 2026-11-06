# SPR-07 · Listings: Checked, Matched, Interested columns and price / 7-day filters

Approved by Luis on 6-nov-2026 (build when he says so, together with SPR-06).

## What changes (panel /admin › Listings only)
- Three new columns (Luis chose three columns over folding them into existing cells):
  - **Checked**: «12 days ago» from `listings.confirmed_at` (ADM-04's last confirmation).
  - **Matched**: applicants with a match, the same count the listing editor shows.
  - **Interested**: active interest, the same rule as the editor and the website (`interestSql`, C10).
- **Min price / Max price** in £: sale and business compare the total price; rentals compare the
  monthly rent (weekly ×52/12, yearly /12). Works with any Operation (SPR-06).
- **Changed in the last 7 days** checkbox, on `listings.updated_at` (any saved change; refine to price
  and availability once SPR-02's history exists).
- Filters join SPR-06's: count, Clear filters, empty state, drag-to-order only with no filters.

## Not now
- **Source** (Hampton or agency) column and filter: waits for the market search done by Hermes
  (Luis, 6-nov: no dependence on any single site). Checklist block changes from «Clave API Places.je»
  to «Búsqueda del mercado con Hermes».

## Constraints
- No migration. The list API computes matched and interested counts in one query (no per-row
  requests); mobile layout follows the existing `.list` card pattern (data-label cells).
- Website and public API untouched.
