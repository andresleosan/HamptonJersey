import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { Modal } from './Sales.jsx';
import { fmtDate } from './format.js';

const REASONS = [
  ['owner_request','Owner requested removal'], ['let_elsewhere','Let elsewhere'],
  ['sold_elsewhere','Sold elsewhere'], ['data_correction','Correct listing information'], ['other','Other'],
];
const label = code => REASONS.find(([value]) => value === code)?.[1] ?? 'Unknown';

export default function WithdrawalDialog({ listing, correction = null, onClose, onSaved }) {
  const [reason,setReason]=useState(correction?.reason_code ?? ''),[note,setNote]=useState(correction?.private_note ?? '');
  const [expected,setExpected]=useState(correction?.revision ?? listing.updated_at);
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[conflict,setConflict]=useState(false),[unavailable,setUnavailable]=useState(false);
  const [fieldError,setFieldError]=useState(null);
  const operation=useRef(crypto.randomUUID());
  const edit=(setter,value)=>{setter(value);operation.current=crypto.randomUUID();setError(null);setFieldError(null);};
  const submit=async event=>{
    event.preventDefault();
    if (!reason) {setFieldError('reason');return setError('Choose a reason.');}
    if (reason==='other'&&!note.trim()) {setFieldError('note');return setError('Add a private note for Other.');}
    if (note.length>1000) {setFieldError('note');return setError('The private note must be 1,000 characters or less.');}
    setBusy(true);setError(null);setFieldError(null);setConflict(false);
    try {
      const path=correction ? `/admin/listings/${listing.id}/withdrawals/${correction.withdrawal_id}/correct`
        : `/admin/listings/${listing.id}/unpublish`;
      const body={ reason_code:reason, note:note.trim()||null, operation_id:operation.current,
        ...(correction ? {expected_revision:expected} : {updated_at:expected}) };
      onSaved(await api(path,{method:'POST',body}));
    } catch(e) {setError(e.message);setConflict(e.status===409);}
    finally {setBusy(false);}
  };
  const reload=async()=>{
    setBusy(true);setError(null);
    try {
      if (correction) {
        const data=await api(`/admin/listings/${listing.id}/traceability`);
        const latest=data.withdrawal_history.find(item=>item.withdrawal_id===correction.withdrawal_id&&item.revision===item.current_revision);
        if (!latest || data.current_publication.published) {setUnavailable(true);setError('This withdrawal is no longer available for correction. Your note is still here.');return;}
        setExpected(latest.current_revision);
      } else {
        const data=await api(`/admin/listings/${listing.id}`);
        if (!data.listing.published || data.listing.archived_at) {setUnavailable(true);setError('This listing is already hidden. Your note is still here.');return;}
        setExpected(data.listing.updated_at);
      }
      operation.current=crypto.randomUUID();setConflict(false);
    } catch(e) {setError(e.message);}
    finally {setBusy(false);}
  };
  return <Modal title={correction ? 'Correct withdrawal reason' : 'Remove from the website'} onClose={()=>{if(!busy)onClose();}}>
    <p>{correction ? 'Update the recorded reason. The original remains in history.' : 'Record why this listing is leaving the website. This does not change its availability.'}</p>
    <form onSubmit={submit} noValidate>
      <label htmlFor="withdrawal-reason">Reason</label>
      <select id="withdrawal-reason" value={reason} onChange={e=>edit(setReason,e.target.value)} disabled={busy}
        aria-invalid={fieldError==='reason'||undefined} aria-describedby={fieldError==='reason'?'withdrawal-error':undefined}>
        <option value="">Choose a reason</option>{REASONS.map(([value,text])=><option key={value} value={value}>{text}</option>)}
      </select>
      <label htmlFor="withdrawal-note">Private note {reason==='other'?'(required)':'(optional)'}</label>
      <textarea id="withdrawal-note" value={note} onChange={e=>edit(setNote,e.target.value)} maxLength={1000} disabled={busy}
        aria-invalid={fieldError==='note'||undefined} aria-describedby={fieldError==='note'?'withdrawal-note-help withdrawal-error':'withdrawal-note-help'}/>
      <small id="withdrawal-note-help" className="muted">Visible to the team only. Do not include unnecessary personal information.</small>
      {error&&<p id="withdrawal-error" role="alert" className="err">{error}</p>}
      {conflict&&<button type="button" className="btn ghost" onClick={reload} disabled={busy}>Reload latest state</button>}
      <div className="inline"><button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn" disabled={busy||unavailable}>{busy?'Saving…':correction?'Save correction':'Remove from website'}</button></div>
    </form>
  </Modal>;
}

export function WithdrawalHistory({ listing, refreshKey = 0 }) {
  const [data,setData]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[editing,setEditing]=useState(null);
  const sequence=useRef(0);
  const load=async(cursor=null)=>{
    const request=++sequence.current;setBusy(true);setError(null);
    try {
      const result=await api(`/admin/listings/${listing.id}/traceability${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`);
      if(request!==sequence.current)return;
      setData(previous=>cursor&&previous?{...result,withdrawal_history:[...previous.withdrawal_history,...result.withdrawal_history]}:result);
    } catch(e) {if(request===sequence.current)setError(e.message);}
    finally {if(request===sequence.current)setBusy(false);}
  };
  useEffect(()=>{setData(null);load();return()=>{sequence.current++;};},[listing.id,refreshKey]);
  return <section className="card" aria-labelledby="h-withdrawals">
    <h2 id="h-withdrawals">Website withdrawal history</h2>
    {error&&<p role="alert" className="err">{error}</p>}
    {!data&&busy&&<p>Loading withdrawal history…</p>}
    {data&&<>
      <p>Published: {data.current_publication.published_at ? fmtDate(data.current_publication.published_at) : 'Unknown'}.</p>
      <p>Website views recorded: {data.metrics.views.value ?? 'Unknown'}{data.metrics.views.since?` since ${data.metrics.views.since}`:''}. Saved and calls: not tracked.</p>
      {data.withdrawal_history.length===0?<p>No recorded withdrawal reasons. Older reasons may be unknown.</p>:<ul>
        {data.withdrawal_history.map(item=><li key={item.id}>
          <strong>{item.revision>1?'Correction':'Withdrawal'} · {label(item.reason_code)}</strong> · {fmtDate(item.at)} · {item.actor}
          {item.private_note&&<p>{item.private_note}</p>}
          {!data.current_publication.published&&item.revision===item.current_revision&&
            <button type="button" className="btn ghost sm" onClick={()=>setEditing(item)}>Correct reason</button>}
        </li>)}
      </ul>}
      {data.next_cursor&&<button type="button" className="btn ghost" disabled={busy} onClick={()=>load(data.next_cursor)}>Load more</button>}
    </>}
    {editing&&<WithdrawalDialog listing={listing} correction={editing} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);load();}}/>}
  </section>;
}
