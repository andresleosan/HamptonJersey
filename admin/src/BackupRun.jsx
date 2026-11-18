import {useEffect,useState} from 'react';
import {api} from './api.js';
import {fmtDate} from './format.js';

// PRE-14: the read-only summary of one weekly backup run, opened from its Inbox task. Only what
// GET /admin/backups/:id returns: no keys, hashes, seal or bucket, and nothing here downloads or restores a copy.
const STATUS={queued:'Queued',draining:'Waiting for changes to finish',capturing:'Copying',sealed:'Copied, being checked',
  complete:'Complete',failed:'Failed',unknown:'Outcome uncertain',purged:'Removed after the retention period'};
export default function BackupRun({id,paused=false}){
  const [state,setState]=useState({loading:true}),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(paused)return;
    let live=true;setState({loading:true});
    api(`/admin/backups/${encodeURIComponent(id)}`).then(d=>{if(live)setState({run:d.run});},
      e=>{if(live)setState(e.status===404?{missing:true}:{error:e.message});});
    return()=>{live=false;};
  },[id,attempt,paused]);
  const r=state.run;
  return <section className="card" aria-labelledby="backup-run-title"><a href="#/">Back to Inbox</a>
    <h1 id="backup-run-title">Weekly backup</h1>
    {state.loading&&<p role="status">Loading backup summary…</p>}
    {state.missing&&<p role="alert">This backup run no longer exists.</p>}
    {state.error&&<p role="alert" className="err">{state.error} <button type="button" className="linkish" disabled={paused} onClick={()=>setAttempt(n=>n+1)}>Try again</button></p>}
    {r&&<><dl className="kv">
      <div><dt>Week starting</dt><dd>{fmtDate(r.week_start)}</dd></div>
      <div><dt>Status</dt><dd>{STATUS[r.status]??r.status}</dd></div>
      <div><dt>Attempts</dt><dd>{r.attempt} of 3</dd></div>
      <div><dt>Reason code</dt><dd>{r.reason_code?<code>{r.reason_code}</code>:'None recorded'}</dd></div>
      <div><dt>Started</dt><dd>{fmtDate(r.started_at)}</dd></div>
      <div><dt>Sealed</dt><dd>{fmtDate(r.sealed_at)}</dd></div>
      <div><dt>Expires</dt><dd>{fmtDate(r.expires_at)}</dd></div>
      <div><dt>Held for a restore review</dt><dd>{r.recovery_hold?'Yes':'No'}</dd></div>
    </dl>
    <p className="muted">This page only shows the run. Closing its Inbox task does not change it.</p></>}
  </section>;
}
