// The Insights figures (spec F7-A §2, I6–I11) from rows already read: pure, no database.
import { OPTIONS } from "./applicants.js";
import { jerseyNow } from "./viewings.js";

const PARISHES = OPTIONS.parishes.map(([p]) => p);
const ANYWHERE = "Anywhere", UNKNOWN = "Parish unknown";
const ORDER = [...PARISHES, ANYWHERE]; // rows and groups follow it
const FUNNEL = ["viewing", "offer", "agreed", "completed"];
const OPERATION = { rent: "rent", sale: "buy" }; // listing → applicant

// The first instant of a Jersey day as ISO UTC. Jersey never changes its clocks at midnight, so the offset read at
// that day's UTC midnight is the one of its local midnight.
export function jerseyDayStart(date) {
  const utc = Date.parse(date + "T00:00:00Z"), j = jerseyNow(new Date(utc));
  return new Date(2 * utc - Date.parse(`${j.date}T${j.time}:00Z`)).toISOString();
}

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const budgetMedian = list => median(list.map(a => a.budget_max).filter(b => b != null));

// I10: the funnel stages reached, now or at any stage change; a later one implies those before it.
export function reachedStages(currentStage, stageHistory) {
  const top = Math.max(...[currentStage, ...stageHistory].map(s => FUNNEL.indexOf(s)));
  return new Set(FUNNEL.slice(0, top + 1));
}

// The parishes an applicant row wants (parishes_wanted as stored: JSON list or NULL); none is Anywhere.
const wanted = a => {
  const list = a.parishes_wanted ? JSON.parse(a.parishes_wanted) : [];
  return list.length ? list : [ANYWHERE];
};

// I6. applicants: active rows {operation, parishes_wanted, budget_max, matched}; listings: available counts
// {operation: rent|sale, parish, n}. Anywhere has no listing count and Parish unknown only that; all-zero rows go.
export function groupDemand(applicants, listings) {
  const rows = applicants.map(a => ({ ...a, parishes: wanted(a) }));
  const count = (op, parish) => listings.filter(l => OPERATION[l.operation] === op && l.parish === parish)
    .reduce((n, l) => n + l.n, 0);
  const out = {};
  for (const op of ["rent", "buy"]) {
    const table = ORDER.map(parish => {
      const who = rows.filter(a => a.operation === op && a.parishes.includes(parish));
      return { parish, applicants: who.length, unmatched: who.filter(a => !a.matched).length,
        median_budget: budgetMedian(who), listings: parish === ANYWHERE ? null : count(op, parish) };
    });
    table.push({ parish: UNKNOWN, applicants: null, unmatched: null, median_budget: null, listings: count(op, null) });
    out[op] = table.filter(r => r.applicants || r.listings);
  }
  return out;
}

// I7: unmatched active applicants by operation, parish (each wanted one) and minimum bedrooms (NULL = any); top 10.
export function topUnmet(applicants) {
  const groups = new Map();
  for (const a of applicants) if (!a.matched) for (const parish of wanted(a)) {
    const key = `${a.operation}|${parish}|${a.bedrooms_min}`;
    if (!groups.has(key)) groups.set(key, { operation: a.operation, parish, bedrooms_min: a.bedrooms_min, who: [] });
    groups.get(key).who.push(a);
  }
  return [...groups.values()]
    .sort((x, y) => y.who.length - x.who.length || x.operation.localeCompare(y.operation)
      || ORDER.indexOf(x.parish) - ORDER.indexOf(y.parish) || (x.bedrooms_min ?? -1) - (y.bedrooms_min ?? -1))
    .slice(0, 10)
    .map(({ who, ...g }) => ({ ...g, applicants: who.length, median_budget: budgetMedian(who) }));
}

// I10 over the cohort rows {stage, stages: JSON list of the stages changed to}.
export function funnel(cohort) {
  const out = { registered: cohort.length, ...Object.fromEntries(FUNNEL.map(s => [s, 0])), lost: 0 };
  for (const a of cohort) {
    for (const s of reachedStages(a.stage, JSON.parse(a.stages))) out[s]++;
    if (a.stage === "lost") out.lost++;
  }
  return out;
}

// I11: [start, answer] ISO pairs; the answered ones give the median in hours, the rest are still waiting.
export function responseTime(pairs) {
  const hours = pairs.filter(([, end]) => end).map(([start, end]) => (Date.parse(end) - Date.parse(start)) / 36e5);
  const m = median(hours);
  return { median_hours: m == null ? null : Math.round(m * 10) / 10, cases: hours.length, waiting: pairs.length - hours.length };
}

// The earlier of two ISO times, either may be NULL.
export const earliest = (a, b) => (a && b ? (a < b ? a : b) : a ?? b);
