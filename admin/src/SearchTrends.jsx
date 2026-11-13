import {useEffect, useState} from 'react';
import {api} from './api.js';
import {fmtDay} from './format.js';

const DIMENSION = {op:'Type',region:'Location',beds:'Bedrooms',max:'Maximum price'};
const count = value => value == null ? 'No data' : value.toLocaleString('en-GB');

export default function SearchTrends({days}) {
  const [data,setData] = useState(null), [error,setError] = useState(false), [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let stale=false;
    setData(null); setError(false);
    api(`/admin/insights/search-trends?days=${days}`).then(result=>{if(!stale)setData(result);},()=>{if(!stale)setError(true);});
    return ()=>{stale=true;};
  },[days,attempt]);
  return <section className="block" aria-labelledby="h-search-trends">
    <h2 id="h-search-trends">Search trends</h2>
    <p className="muted">Search actions, not people; counts may be incomplete.</p>
    {error ? <p role="alert" className="err">Search trends are unavailable.{' '}
      <button type="button" className="btn ghost sm" onClick={()=>setAttempt(x=>x+1)}>Retry search trends</button></p>
      : !data ? <p role="status">Loading search trends…</p>
      : !data.available ? <p>Search trends are not available.</p>
      : <>
        <p className="muted">{data.source} · {fmtDay(data.period.from)} to {fmtDay(data.period.to)} · Coverage unknown.
          {' '}A zero describes recorded actions and does not establish that nobody searched.</p>
        {data.capped && <p><strong>Daily limit reached; some actions were not counted.</strong></p>}
        <h3>Search filters</h3>
        {data.totals.length ? <div className="table-scroll" role="region" aria-label="Search filters table" tabIndex={0}>
          <table className="list" aria-label="Search filters"><thead><tr><th scope="col">Filter</th><th scope="col">Selection</th>
            <th scope="col">Version</th><th scope="col" className="num">Actions</th></tr></thead>
            <tbody>{data.totals.map((row,i)=><tr key={`${row.dimension}-${row.version}-${row.label}-${i}`}>
              <th scope="row">{DIMENSION[row.dimension] || 'Unknown filter'}</th><td>{row.label}</td><td>{row.version}</td>
              <td className="num">{count(row.n)}</td></tr>)}</tbody></table>
        </div> : <p>No filter data recorded for this period.</p>}
        <h3>Daily search actions</h3>
        <div className="table-scroll" role="region" aria-label="Daily search actions table" tabIndex={0}>
          <table className="list" aria-label="Daily search actions"><thead><tr><th scope="col">Day</th>
            <th scope="col" className="num">Actions</th><th scope="col" className="num">Without results</th>
            <th scope="col">Daily limit</th></tr></thead><tbody>{data.series.map(row=><tr key={row.day}>
              <th scope="row">{fmtDay(row.day)}</th><td className="num">{count(row.actions)}</td>
              <td className="num">{count(row.zero_results)}</td><td>{row.capped ? 'Reached' : 'Not known to be reached'}</td>
            </tr>)}</tbody></table>
        </div>
      </>}
  </section>;
}
