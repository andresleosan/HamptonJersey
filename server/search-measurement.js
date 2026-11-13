import {validSearchAction} from './measurement-dimensions.js';
import {jerseyToday, plusDays, realDate} from './viewings.js';

// Prepared only for synthetic tests. No production route invokes this writer while policy/schema/cost are unverified.
// D1 executes a batch sequentially in one transaction: changes() carries the budget decision through each marginal.
export async function writeSearchAction({DB}, action, at = new Date()) {
  if (!validSearchAction(action)) throw new Error('Invalid search measurement');
  const day = jerseyToday(at);
  const budget = DB.prepare(`INSERT INTO search_metric_budget(day,n,capped) VALUES (?,1,0)
    ON CONFLICT(day) DO UPDATE SET n=n+1, capped=CASE WHEN n+1>=5000 THEN 1 ELSE capped END
    WHERE n<5000`).bind(day);
  const metrics = [['total','all'], ...['op','region','beds','max'].map(key => [key, action[key] ?? 'none'])];
  if (action.zero_results) metrics.push(['zero_results','true']);
  const statements = metrics.map(([dimension,value]) => DB.prepare(`INSERT INTO search_metric_days(day,version,dimension,value,n)
    SELECT ?,?,?,?,1 WHERE changes()=1 ON CONFLICT(day,version,dimension,value) DO UPDATE SET n=n+1`)
    .bind(day,action.version,dimension,value));
  const result = await DB.batch([budget,...statements]);
  return result[0].meta.changes === 1;
}

// Kept disconnected from the real maintenance job until the schema and retention policy are approved.
export async function pruneSearchMetrics({DB}, at = new Date()) {
  const before = plusDays(jerseyToday(at), -90);
  return DB.batch([
    DB.prepare(`DELETE FROM search_metric_days WHERE (day,version,dimension,value) IN
      (SELECT day,version,dimension,value FROM search_metric_days WHERE day<? ORDER BY day,version,dimension,value LIMIT 1000)`).bind(before),
    DB.prepare(`DELETE FROM search_metric_budget WHERE day IN
      (SELECT day FROM search_metric_budget WHERE day<? ORDER BY day LIMIT 1000)`).bind(before),
  ]);
}

// One bounded, indexed read for both marginals and budget; missing rows are not evidence of no searches.
export async function readSearchTrends({DB}, period) {
  const {searchValueLabel} = await import('./measurement-dimensions.js');
  const {days,from,to} = period;
  if (!Number.isInteger(days) || days < 1 || days > 90 || !realDate(from) || !realDate(to) || plusDays(from, days - 1) !== to)
    return {available:false,coverage:'unknown',period};
  try {
    const {results} = await DB.prepare(`SELECT day,version,dimension,value,n,NULL AS capped FROM search_metric_days
      WHERE day BETWEEN ?1 AND ?2
      UNION ALL SELECT day,0,'budget','',n,capped FROM search_metric_budget WHERE day BETWEEN ?1 AND ?2`)
      .bind(from,to).all();
    const series = Array.from({length:days},(_,i)=>({day:plusDays(from,i),actions:null,zero_results:null,capped:false}));
    const byDay = new Map(series.map(x=>[x.day,x])), totals = new Map(), versions = new Set();
    for (const row of results) {
      if (!byDay.has(row.day) || !Number.isSafeInteger(row.n) || row.n < 0) throw new Error('Invalid aggregate');
      const day = byDay.get(row.day);
      if (row.dimension === 'budget') { day.capped = row.capped === 1; continue; }
      if (!Number.isSafeInteger(row.version) || row.version < 1) throw new Error('Invalid version');
      versions.add(row.version);
      if (row.dimension === 'total' && row.value === 'all') day.actions = (day.actions ?? 0) + row.n;
      else if (row.dimension === 'zero_results' && row.value === 'true') day.zero_results = (day.zero_results ?? 0) + row.n;
      else if (['op','region','beds','max'].includes(row.dimension)) {
        const label = searchValueLabel(row.version,row.dimension,row.value), key = JSON.stringify([row.version,row.dimension,label]);
        const existing = totals.get(key) || {version:row.version,dimension:row.dimension,label,n:0,series:new Map()};
        existing.n += row.n;
        existing.series.set(row.day,(existing.series.get(row.day) ?? 0) + row.n);
        if (!Number.isSafeInteger(existing.n) || !Number.isSafeInteger(existing.series.get(row.day))) throw new Error('Invalid aggregate');
        totals.set(key,existing);
      } else throw new Error('Invalid aggregate');
    }
    for (const day of series) {
      if ((day.actions !== null && !Number.isSafeInteger(day.actions)) ||
          (day.zero_results !== null && (!Number.isSafeInteger(day.zero_results) || day.actions === null || day.zero_results > day.actions)))
        throw new Error('Inconsistent aggregate');
      if (day.actions !== null && day.zero_results === null) day.zero_results = 0;
    }
    const dimensions = [...totals.values()].map(({series:observed,...entry}) => ({...entry,
      series:[...observed].sort(([a],[b])=>a.localeCompare(b)).map(([day,n])=>({day,n}))}));
    return {available:true,source:'Website search counters',coverage:'unknown',period,versions:[...versions].sort((a,b)=>a-b),
      capped:series.some(x=>x.capped),series,totals:dimensions};
  } catch { return {available:false,coverage:'unknown',period}; }
}
