// BUS-17: with fewer than 3 matches, what one change to the saved search would add (spec 2026-11-06, W2–W8).
// Decides no matching rule: each change is run through evaluate() as it is. Pure ESM, nothing stored.
import { parsePriorities } from "../site/requirements.js";
import { evaluate, monthlyRent } from "./matching.js";
import { OPTIONS, BUDGET } from "./applicants.js";

const PARISHES = OPTIONS.parishes.map(([p]) => p);
const ROUND = { rent: 50, buy: 1000 }; // the new top is rounded up to this (£, rent per month)
const list = json => (json ? JSON.parse(json) : []);

// a: an applicants row as stored; listings: the candidates of its operation (the columns evaluate() reads);
// pairs: every saved relationship, including decisions and requirement ranks; independent of the visible page.
// Returns budget, parish and bedroom changes, separating new candidates from existing Found improvements.
// ponytail: evaluate at most three changes per candidate, only for searches with fewer than three offered meets.
// For a substantially larger inventory, measure this request before introducing a cache.
export function widen(a, listings, pairs=[]) {
  if(!parsePriorities(a.requirement_priorities))return [];
  const stored=new Map(pairs.map(m=>[m.listing_id,m]));
  const free=listings.filter(l=>{const m=stored.get(l.id);return !m||(m.status==='found'&&m.requirements_rank!==0);});
  const fits=(b,l)=>{const r=evaluate(b,l);return r.pass&&r.requirements_status==='meets';};
  const counted=list=>{const improved=list.filter(l=>stored.has(l.id)).length;return {added:list.length,improved,fresh:list.length-improved};};
  const added=b=>counted(free.filter(l=>fits(b,l)));
  const out = [];

  const field = a.budget_stretch != null ? "budget_stretch" : "budget_max", top = a[field];
  if (top != null) {
    const step = ROUND[a.operation], to = Math.ceil((top * 11) / (10 * step)) * step; // in whole numbers: 900000 * 1.1 is not 990000
    if (to <= BUDGET[a.operation][1]) {
      const expanded = { ...a, [field]: to };
      // Attribute a gain to this change only when the budget check actually changes from
      // a known failure to a known success. Unknown currency cannot prove either side.
      const budgetResult = result => result.checks.find(c => c.key === 'budget')?.result;
      let unknownPrices=0;
      const improved = free.filter(l => {
        const before=budgetResult(evaluate(a,l));
        if (before === 'unknown') {
          const amount=l.operation === 'rent' ? monthlyRent(l) : l.sale_price;
          if (l.currency !== 'GBP' || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)
            unknownPrices++;
          return false;
        }
        if (before !== 'fails') return false;
        const next=evaluate(expanded,l);
        return next.pass && next.requirements_status === 'meets' && budgetResult(next) === 'meets';
      });
      out.push({ key: "budget", field, from: top, to, ...counted(improved),
        ...(unknownPrices ? { unknownPrices } : {}) });
    }
  }

  const wanted = list(a.parishes_wanted), excluded = list(a.parishes_excluded);
  const open = PARISHES.filter(p => !wanted.includes(p) && !excluded.includes(p));
  if (wanted.length && open.length) {
    // One evaluation per listing, with its own parish added.
    const per = new Map();
    for (const l of free) if (open.includes(l.parish)
      && fits({ ...a, parishes_wanted: JSON.stringify([...wanted, l.parish]) }, l)) per.set(l.parish, [...(per.get(l.parish) ?? []),l]);
    const best = open.reduce((b, p) => ((per.get(p)?.length ?? 0) > (per.get(b)?.length ?? 0) ? p : b), open[0]);
    const count=counted(per.get(best)??[]),n=count.added;
    out.push({ key: "parish", field: "parishes_wanted", parish: n ? best : null, to: n ? [...wanted, best] : null, ...count });
  }

  if (a.bedrooms_min > 1)
    out.push({ key: "bedrooms", field: "bedrooms_min", from: a.bedrooms_min, to: a.bedrooms_min - 1,
      ...added({ ...a, bedrooms_min: a.bedrooms_min - 1 }) });
  return out;
}
