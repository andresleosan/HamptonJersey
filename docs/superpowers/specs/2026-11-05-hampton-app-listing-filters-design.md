# SPR-06 · Listings filters: Operation and Bedrooms

Approved by Luis on 5-nov-2026 (build when he says so).

## Why
The team needs to find a house for a caller in seconds: "to let, 2 to 3 bedrooms, St Helier".
Today Listings filters by Use, Region, Availability, Parish and search, but Availability
(For sale, To let…) leaves out houses that are Under offer or Sold, and there is no bedrooms filter.

## What changes (panel /admin › Listings only)
- **Operation** dropdown in the filters row (Luis chose a dropdown, not buttons above the tabs):
  All / To Buy (`sale`) / To Let (`rent`) / Business (`business`). It matches `listings.operation`,
  whatever the availability.
- **Bedrooms** range, two dropdowns **From** and **To**: Any, Studio (0), 1, 2, 3, 4, 5, 6
  (Luis: a range like 3–5, or an exact number like 2–2).
  - From only = that many or more; To only = up to that many; both = inclusive range.
  - Choosing a From above the To raises the To to the From (no impossible search). My call.
  - With any bound set, listings without a bedrooms value (commercial units) are left out.
- Each row's grey line shows the bedrooms: «HE-R001 · Sale · 3 bed» (Studio for 0, nothing if unknown).
- The new filters join the others: listing count, «Clear filters», the empty state and the
  drag-to-order rule (dragging only with no filters) all take them into account.

## Constraints
- No migration: `listings.bedrooms` already exists; the list API adds it to `LIST_SQL`.
- Filtering stays in the panel on the list already loaded (as Use, Region, Availability).
- Website and public API untouched.
- DESIGN.md: reuse the existing `.filters` labels/selects; English UI copy; 44 px targets on mobile.

## Not in scope
Price range, source and «changed in the last 7 days» filters (SPR-07); bathrooms and available-from
date in the list (SPR-01).
