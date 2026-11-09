import {useEffect,useState} from 'react';
import {api} from './api.js';
import {fmtDay} from './format.js';

const FIGURES=[['Listing views','views'],['Viewing requests','viewing_requests'],['New applicants','new_applicants'],['Viewings completed','viewings_completed']];
export default function WeeklyInsights({weekStart,paused=false}) {
  const [data,setData]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(true),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(paused)return;
    let stale=false;setBusy(true);setError(null);
    api(`/admin/insights/weekly/${encodeURIComponent(weekStart)}`).then(d=>{
      if(!stale){setData(d);setBusy(false);}
    },e=>{if(!stale){setError(e.message);setBusy(false);}});
    return ()=>{stale=true;};
  },[weekStart,attempt,paused]);
  const refresh=()=>setAttempt(n=>n+1);
  return <section className="insights" aria-labelledby="weekly-insights-title">
    <div className="head"><h1 id="weekly-insights-title">Weekly Insights</h1>
      <button type="button" className="btn ghost" disabled={busy||paused} onClick={refresh}>Refresh report</button></div>
    {error&&<p role="alert" className="err">{error}{data&&' The saved report is still shown.'} <button type="button" className="linkish" disabled={busy||paused} onClick={refresh}>Try again</button></p>}
    {busy&&<p role="status">Loading weekly Insights…</p>}
    {data&&<div className="report" aria-busy={busy}>
      <p>{fmtDay(data.period.from)} to {fmtDay(data.period.to)} · Jersey</p>
      <p className="muted">Recorded <time dateTime={data.generated_at}>{new Date(data.generated_at).toLocaleString('en-GB',{timeZone:'Europe/Jersey'})}</time> (Jersey time).</p>
      <p>Figures for the previous calendar week, recorded at the time shown. Listing views count opens, not people.</p>
      <dl className="figures">{FIGURES.map(([title,key])=><div className="card" key={key}><dt>{title}</dt><dd className="num">{data.totals[key].toLocaleString('en-GB')}</dd></div>)}</dl>
      <p className="muted">Viewing requests were created during this week, from any origin. New applicants counts searches that were not archived when this report was recorded. Completed viewings use their scheduled date and completed status when recorded.</p>
      {(!data.coverage.first_day||data.coverage.first_day>data.period.from)&&<p className="warn">View counting may not cover the whole week.</p>}
      <section className="block" aria-labelledby="weekly-most-viewed"><h2 id="weekly-most-viewed">Most viewed properties</h2>
        {data.most_viewed.length?<ol>{data.most_viewed.map(row=><li key={row.listing_id}>{row.listing_id} · {row.views.toLocaleString('en-GB')} {row.views===1?'open':'opens'}</li>)}</ol>:<p>No listing views recorded for this week.</p>}
        <p className="muted">References and figures are saved with this report. Views removed before it was recorded cannot be recovered. These figures do not identify visitors.</p>
      </section>
    </div>}
    <p className="block"><a className="btn ghost" href="#/insights">Open current Insights</a></p>
    <p className="muted">Current demand, funnel and team response times are available in Insights. They are not historical figures for this saved week.</p>
  </section>;
}
