import { useEffect, useState } from 'react';
import { api } from './api.js';

const recoveryKey=(scope,operation)=>`demand-draft-recovery-${scope}-${operation}`; // UUID only, never draft content.
export default function DemandCampaigns() {
  const [operation,setOperation]=useState('rent'),[draft,setDraft]=useState(null),[id,setId]=useState(''),[authorization,setAuthorization]=useState('');
  const [availability,setAvailability]=useState(null),[statusAttempt,setStatusAttempt]=useState(0);
  useEffect(()=>{let live=true;setAvailability(null);api('/admin/demand-snapshots/status').then(x=>{if(live) setAvailability(x.available===true?'available':'unavailable');},()=>{if(live) setAvailability('error');});return()=>{live=false;};},[statusAttempt]);
  const [after,setAfter]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const run=async action=>{setBusy(true);setError('');setNotice('');try {await action();} catch(e){setError(e.status===409?'The draft, policy or review changed. Reload before continuing.':e.message || 'Unable to confirm the result. Find the draft again before continuing.');} finally {setBusy(false);}};
  const load=async (target,page=0)=>{
    const d=await api(`/admin/demand-snapshots/${encodeURIComponent(target)}?after=${page}`);
    if(draft && draft.id===d.id && draft.version!==d.version && page!==0) {throw new Error('The draft changed. Open it again.');}
    setDraft(d);setId(d.id);setAfter(page);return d;
  };
  const createOrFind=async()=>{
    const {scope}=await api('/admin/demand-snapshots/recovery-scope',{method:'POST',body:{}});
    const found=await api(`/admin/demand-snapshots/active?operation=${operation}`);
    if(found.draft) {localStorage.removeItem(recoveryKey(scope,operation));await load(found.draft.id);setNotice('Opened the active draft.');return;}
    let token=localStorage.getItem(recoveryKey(scope,operation));
    if(!token) {token=crypto.randomUUID();localStorage.setItem(recoveryKey(scope,operation),token);}
    const result=await api('/admin/demand-snapshots',{method:'POST',body:{operation,operation_id:token}});
    await load(result.id);localStorage.removeItem(recoveryKey(scope,operation));
  };
  const reviewed=draft?.reviewed_pages || [];
  const allVisited=reviewed.includes(0) && (draft?.next===null ? after===0||reviewed.includes(after) : reviewed.includes(draft.next));
  if(availability!=='available') return <section className="insights" aria-labelledby="demand-title"><h1 id="demand-title">Demand publication</h1>{availability===null ? <p role="status">Checking availability…</p> : availability==='unavailable' ? <p role="status">Demand publication is not available yet.</p> : <p role="alert">Unable to check availability. <button className="btn ghost" onClick={()=>setStatusAttempt(x=>x+1)}>Try again</button></p>}</section>;
  return <section className="insights" aria-labelledby="demand-title"><div className="head"><div><h1 id="demand-title">Demand publication</h1>
    <p className="muted">Publication requires a separately accepted identity and inference review. Counts are registered search contacts, not verified unique people.</p></div></div>
    {error && <p role="alert" className="err">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="card"><h2>Create or find a private draft</h2><label>Operation <select value={operation} onChange={e=>setOperation(e.target.value)} disabled={busy}><option value="rent">To rent</option><option value="buy">To buy</option></select></label>{' '}
      <button className="btn" disabled={busy} onClick={()=>run(createOrFind)}>Create or find draft</button>
      <p className="muted">One active draft per operation and employee; retrying will find it if the response was lost.</p>
    </div>
    <div className="card"><h2>Open a draft</h2><label>Draft ID <input value={id} onChange={e=>setId(e.target.value)} autoComplete="off" /></label>{' '}
      <button className="btn ghost" disabled={busy||!id} onClick={()=>run(()=>load(id))}>Open draft</button></div>
    {draft && <div className="card"><h2>Draft {draft.operation==='rent'?'to rent':'to buy'}</h2><p>Status: {draft.status} · Version {draft.version}</p>
      <p>As of {draft.as_of} · Valid until {draft.valid_until}</p>
      <p>Identity review: not established by these counts. External evidence must match this exact snapshot and publication ledger.</p>
      {!draft.private_available ? <p role="alert">Private review matrix is no longer available.</p> : <ul>{draft.cells.map(c=><li key={`${c.parish}:${c.bedroom_band}`}>{c.parish} · minimum bedrooms {c.bedroom_band} · {c.count}</li>)}</ul>}
      <div role="group" aria-label="Draft cell pages"><button type="button" className="btn ghost sm" disabled={busy||after===0} onClick={()=>run(()=>load(draft.id,Math.max(0,after-50)))}>Previous page</button>{' '}
      <button type="button" className="btn ghost sm" disabled={busy||draft.next===null} onClick={()=>run(()=>load(draft.id,draft.next))}>Next page</button></div>
      <button type="button" className="btn ghost sm" disabled={busy||draft.status!=='draft'||!draft.private_available||reviewed.includes(after)} onClick={()=>run(async()=>{await api(`/admin/demand-snapshots/${draft.id}/review-page`,{method:'POST',body:{version:draft.version,after}});await load(draft.id,after);})}>{reviewed.includes(after)?'Page marked reviewed':'Mark this page reviewed'}</button>
      {!allVisited && <p>Review and mark all pages before approving.</p>}
      <label>Accepted authorization ID <input value={authorization} onChange={e=>setAuthorization(e.target.value)} autoComplete="off" /></label>{' '}
      <button className="btn ghost" disabled={busy||draft.status!=='draft'||!authorization||!draft.private_available||!allVisited} onClick={()=>run(async()=>{await api(`/admin/demand-snapshots/${draft.id}/approve`,{method:'POST',body:{version:draft.version,authorization_id:authorization}});await load(draft.id);setNotice('Reviewed; not yet published.');})}>Approve reviewed draft</button>{' '}
      <button className="btn" disabled={busy||draft.status!=='approved'} onClick={()=>run(async()=>{await api(`/admin/demand-snapshots/${draft.id}/publish`,{method:'POST',body:{version:draft.version}});await load(draft.id);setNotice('Publication recorded.');})}>Publish approved draft</button>{' '}
      <button className="btn ghost" disabled={busy||draft.status==='revoked'} onClick={()=>run(async()=>{await api(`/admin/demand-snapshots/${draft.id}/revoke`,{method:'POST',body:{version:draft.version}});await load(draft.id);setNotice('Withdrawn. Copies already made cannot be recalled.');})}>Withdraw</button>
    </div>}
  </section>;
}
