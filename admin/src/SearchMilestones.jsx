import { useEffect, useState } from 'react';
import { api } from './api.js';
import { fmtDayMonth } from './format.js';
import './SearchMilestones.css';

const STAGE_LABELS = {new:'New',searching:'Searching',viewing:'Viewing',offer:'Offer',agreed:'Agreed',
  completed:'Completed',paused:'Paused',lost:'Lost'};
const MILESTONES = [['viewing_completed','Viewing completed'],['offer','Offer'],['agreed','Agreed'],['completed','Completed']];
const OPERATION = {all:'All operations',rent:'Rent',buy:'Buy',transfer:'Transfer'};
const CATEGORY = {all:'All categories',residential:'Residential',commercial:'Commercial'};
const n = value => value.toLocaleString('en-GB');

export default function SearchMilestones({days}) {
  const [operation,setOperation] = useState('all'), [category,setCategory] = useState('all');
  const [data,setData] = useState(null), [error,setError] = useState(null), [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let stale = false;
    setData(null); setError(null);
    const params = new URLSearchParams({days:String(days),operation,category});
    api(`/admin/insights/milestones?${params}`).then(value => {
      if (stale) return;
      if (value?.enabled === true || (value?.enabled === false && value.reason === 'not_configured')) setData(value);
      else setError('Search measurement is temporarily unavailable.');
    },
      e => { if (!stale) setError(e.message); });
    return () => { stale = true; };
  }, [days,operation,category,attempt]);
  return <section className="block search-milestones" aria-labelledby="h-search-measurement">
    <h2 id="h-search-measurement">Search measurement</h2>
    {error ? <p className="err" role="alert">{error}{' '}
      <button type="button" className="btn ghost sm" onClick={()=>setAttempt(a=>a+1)}>Retry</button></p>
      : !data ? <p role="status">Loading search measurement…</p>
      : !data.enabled ? <p role="status">Search measurement is not configured.</p>
      : <>
        <div className="milestone-filters">
          <label>Operation <select value={operation} onChange={e=>setOperation(e.target.value)}>
            {Object.entries(OPERATION).map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select></label>
          <label>Category <select value={category} onChange={e=>setCategory(e.target.value)}>
            {Object.entries(CATEGORY).map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select></label>
        </div>
        <MilestonesReport data={data} />
      </>}
  </section>;
}

function Bars({rows,total}) {
  return <div className="card funnel milestone-bars" aria-hidden="true"><ul>{rows.map(([label,value])=>
    <li key={label}><span>{label}</span><span className="track"><span className="fill"
      ref={el=>{ el?.style.setProperty('--share', total ? Math.min(1,value/total) : 0); }} /></span>
      <span className="num">{n(value)}</span></li>)}</ul></div>;
}

function MetricTable({title,rows}) {
  return <div className="table-scroll" role="region" aria-label={`${title} table`} tabIndex={0}>
    <table className="list" aria-label={title}><thead><tr><th scope="col">Measure</th><th scope="col" className="num">Search records</th></tr></thead>
      <tbody>{rows.map(([label,value])=><tr key={label}><th scope="row">{label}</th>
        <td className="num">{value == null ? 'Not integrated' : n(value)}</td></tr>)}</tbody></table>
  </div>;
}

export function MilestonesReport({data}) {
  const {cohort,coverage} = data;
  const stages = data.observed_stages.map(row=>[STAGE_LABELS[row.stage] ?? row.stage,row.count]);
  const verified = MILESTONES.map(([key,label])=>[label,data.verified_business[key].count]);
  const integrated = verified.filter(([,value])=>value != null);
  return <div>
    <p className="muted">{fmtDayMonth(cohort.from)} to {fmtDayMonth(cohort.to)} · Jersey · {OPERATION[cohort.operation]} · {CATEGORY[cohort.category]}</p>
    <p><strong>{n(cohort.count)} search records</strong> created in this period, including retained archived searches.
      One contact can have more than one search; these are not unique people.</p>
    <section aria-labelledby="h-recorded-stages">
      <h3 id="h-recorded-stages">Recorded search stages</h3>
      <p className="muted">Stages explicitly recorded for these searches by the period end. Each bar uses the same search-record
        denominator; bars do not imply a sequence. A recorded viewing stage is not a completed viewing.</p>
      <Bars rows={stages} total={cohort.count}/><MetricTable title="Recorded search stages" rows={stages}/>
    </section>
    <section aria-labelledby="h-verified-milestones">
      <h3 id="h-verified-milestones">Verified milestones</h3>
      <p className="muted">Business facts require an approved link to the search. Not integrated means the source is unavailable,
        not that the count is zero. No web activity is linked to these records.</p>
      {integrated.length > 0 && <Bars rows={integrated} total={cohort.count}/>}
      <MetricTable title="Verified milestones" rows={verified}/>
    </section>
    <p className="muted">Measurement start is unknown. Deleted search records and missing history are unknown and cannot be reconstructed.
      {' '}{n(coverage.excluded_invalid)} invalid {coverage.excluded_invalid === 1 ? 'event was' : 'events were'} excluded.</p>
  </div>;
}
