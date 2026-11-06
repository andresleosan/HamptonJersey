// BUS-17: with fewer than 3 matches, what one change to the saved search would add (spec 2026-11-06, W2–W8).
// Decides no matching rule: each change is run through evaluate() as it is. Pure ESM, nothing stored.
import { evaluate, MIN_SCORE, MAX_FOUND } from "./matching.js";
import { OPTIONS, BUDGET } from "./applicants.js";

const PARISHES = OPTIONS.parishes.map(([p]) => p);
const ROUND = { rent: 50, buy: 1000 }; // the new top is rounded up to this (£, rent per month)
const list = json => (json ? JSON.parse(json) : []);

// a: an applicants row as stored; listings: the candidates of its operation (the columns evaluate() reads);
// taken: the listing ids it already has any match with; found: its Found matches.
// Returns the changes that apply, in this order: budget, parish, bedrooms, each with the new listings it adds.
// ponytail: up to 3 evaluate() per listing, on every open of a search with fewer than 3 matches; measured 2.3 ms for
// 300 listings (6-nov-2026). Past ~1,000 candidates, cache it per search or move it to the clock.
export function widen(a, listings, taken, found) {
  const room = Math.max(0, MAX_FOUND - found);
  const free = listings.filter(l => !taken.has(l.id));
  const fits = (b, l) => { const r = evaluate(b, l); return r.pass && r.score >= MIN_SCORE; }; // as result() in match-store.js
  const added = b => Math.min(room, free.filter(l => fits(b, l)).length);
  const out = [];

  const field = a.budget_stretch != null ? "budget_stretch" : "budget_max", top = a[field];
  if (top != null) {
    const step = ROUND[a.operation], to = Math.ceil((top * 11) / (10 * step)) * step; // in whole numbers: 900000 * 1.1 is not 990000
    if (to <= BUDGET[a.operation][1]) out.push({ key: "budget", field, from: top, to, added: added({ ...a, [field]: to }) });
  }

  const wanted = list(a.parishes_wanted), excluded = list(a.parishes_excluded);
  const open = PARISHES.filter(p => !wanted.includes(p) && !excluded.includes(p));
  if (wanted.length && open.length) {
    // One evaluation per listing, with its own parish added.
    const per = new Map();
    for (const l of free) if (open.includes(l.parish)
      && fits({ ...a, parishes_wanted: JSON.stringify([...wanted, l.parish]) }, l)) per.set(l.parish, (per.get(l.parish) ?? 0) + 1);
    const best = open.reduce((b, p) => ((per.get(p) ?? 0) > (per.get(b) ?? 0) ? p : b), open[0]);
    const n = Math.min(room, per.get(best) ?? 0);
    out.push({ key: "parish", field: "parishes_wanted", parish: n ? best : null, to: n ? [...wanted, best] : null, added: n });
  }

  if (a.bedrooms_min > 1)
    out.push({ key: "bedrooms", field: "bedrooms_min", from: a.bedrooms_min, to: a.bedrooms_min - 1,
      added: added({ ...a, bedrooms_min: a.bedrooms_min - 1 }) });
  return out;
}
