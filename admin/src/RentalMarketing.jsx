import {useRef,useState} from 'react';
import {api} from './api.js';
import {AVAILABILITY} from './format.js';
import {jerseyToday} from '../../server/viewings.js';
import {jerseyDayStart} from '../../server/insights.js';

export default function RentalMarketing({listing,media,sources,disabled,onSaved,onReload}) {
  const closed=['let_agreed','let'].includes(listing.availability);
  const [action,setAction]=useState(closed?'return_to_market':'let_agreed');
  const [date,setDate]=useState(''),[evidence,setEvidence]=useState(''),[reason,setReason]=useState('fell_through');
  const [busy,setBusy]=useState(false),[error,setError]=useState(null),[stale,setStale]=useState(false);
  const identity=useRef(null),first=useRef(null);
  const choices=[...media.filter(m=>m.kind==='document'&&m.r2_key).map(m=>[`media:${m.id}`,m.label||m.id]),
    ...sources.map(s=>[`source:${s.source_id}`,s.title||s.source_id])];
  const submit=async e=>{
    e.preventDefault();setError(null);setStale(false);
    if(!date||!evidence){setError('Choose a date and recorded evidence.');first.current?.focus();return;}
    // Validate the calendar day, then use Jersey midnight (including summer time).
    const parsed=new Date(`${date}T00:00:00.000Z`);
    if(!Number.isFinite(parsed.getTime())){setError('Choose a valid date.');first.current?.focus();return;}
    const body={updated_at:listing.updated_at,action,reason_code:action==='let_agreed'?'agreement':action==='let'?'completed':reason,
      occurred_at:jerseyDayStart(date),evidence_refs:[evidence]};
    const signature=JSON.stringify(body);
    if(identity.current?.signature!==signature)identity.current={signature,id:crypto.randomUUID()};
    setBusy(true);
    try{const result=await api(`/admin/listings/${listing.id}/rental-marketing`,{method:'POST',body:{...body,request_id:identity.current.id}});
      onSaved(result.listing);}
    catch(err){setError(err.message);setStale(err.status===409);}
    finally{setBusy(false);}
  };
  return <section className="card" aria-labelledby="h-rental-marketing">
    <h2 id="h-rental-marketing" tabIndex="-1">Rental marketing</h2>
    <p>Current availability: <strong>{AVAILABILITY[listing.availability]}</strong></p>
    <p className="muted">Record a confirmed agreement or completed letting with its evidence. This does not create a tenancy or charges.</p>
    {!choices.length?<p>No recorded evidence yet. Upload a document under Photos, or use a source already recorded in Research.</p>:
      <form onSubmit={submit}>
        <fieldset disabled={disabled||busy} className="marketing-fields">
          <legend className="sr">Record rental marketing state</legend>
          <label>Marketing action<select value={action} onChange={e=>setAction(e.target.value)}>
            {!closed&&<option value="let_agreed">Let agreed</option>}
            {listing.availability!=='let'&&<option value="let">Let</option>}
            {closed&&<option value="return_to_market">Return to market</option>}
          </select></label>
          <label>Date of confirmation<input ref={first} type="date" required value={date} max={jerseyToday()} onChange={e=>setDate(e.target.value)}/></label>
          <label>Recorded evidence<select required value={evidence} onChange={e=>setEvidence(e.target.value)}>
            <option value="">Choose a document or source</option>{choices.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select></label>
          {action==='return_to_market'&&<label>Reason<select value={reason} onChange={e=>setReason(e.target.value)}>
            <option value="fell_through">Agreement fell through</option><option value="correction">Confirmed correction</option>
          </select></label>}
          <button className="btn ghost" type="submit">{busy?'Saving changes…':'Record marketing state'}</button>
        </fieldset>
      </form>}
    {error&&<p role="alert" className="err">{error} Your changes are still here.</p>}
    {stale&&<button type="button" className="btn ghost sm" onClick={onReload}>Reload listing</button>}
  </section>;
}
