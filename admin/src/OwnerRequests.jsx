import {useEffect,useState} from 'react';
import {api} from './api.js';
import {fmtDate} from './format.js';
const STATUS={new:'New',contacted:'Contacted',closed:'Closed'};
// PUB-10: one owner's request. Status changes only here; Erase removes it for a deletion request (migration 0118).
export default function OwnerRequests({id}){
 const [state,setState]=useState({loading:true}),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(null);
 const show=data=>{setState(data);setStatus(data.owner.status);};
 useEffect(()=>{let live=true;setState({loading:true});setResult(null);api(`/admin/owner-requests/${encodeURIComponent(id)}`).then(data=>{if(live)show(data)},()=>{if(live)setState({error:true})});return()=>{live=false}},[id]);
 if(state.loading)return <p role="status">Loading owner request…</p>;
 if(state.error)return <p role="alert">This request is unavailable.</p>;
 if(state.erased)return <section className="card"><a href="#/">Back to Inbox</a><p role="status" className="ok">Request erased. Its Inbox task is closed.</p></section>;
 const o=state.owner,url=`/admin/owner-requests/${encodeURIComponent(id)}`;
 const act=async(fn,text)=>{setBusy(true);setResult(null);try{await fn();setResult({text});}catch(e){setResult({error:true,text:e.message});}finally{setBusy(false);}};
 const save=()=>act(async()=>show(await api(url,{method:'PUT',body:{status,updated_at:o.updated_at}})),'Status saved.');
 const erase=()=>{if(confirm('Erase this request permanently? Use this for a deletion request. It cannot be undone.'))act(async()=>{await api(url,{method:'DELETE'});setState({erased:true});},'');};
 return <section className="card"><a href="#/">Back to Inbox</a><h1>Property owner request</h1><dl>
 <dt>Name</dt><dd>{o.name}</dd><dt>Telephone</dt><dd>{o.phone}</dd><dt>Email</dt><dd>{o.email}</dd><dt>Property address</dt><dd>{o.address}</dd>
 <dt>Operation</dt><dd>{o.operation==='sale'?'Sell':'Let'}</dd><dt>Valuation requested</dt><dd>{o.valuation_requested?'Yes':'No'}</dd><dt>Received</dt><dd>{fmtDate(o.created_at)}</dd>
 </dl><p>Closing an Inbox task does not change this request.</p>
 <div className="inline"><label>Status <select value={status} disabled={busy} onChange={e=>setStatus(e.target.value)}>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  <button type="button" className="btn sm" disabled={busy||status===o.status} onClick={save}>Save status</button>
  <button type="button" className="btn ghost sm danger" disabled={busy} onClick={erase}>Erase request</button></div>
 {result&&<p role={result.error?'alert':'status'} className={result.error?'err':'ok'}>{result.text}</p>}
 {state.related.length>0&&<><h2>Other requests with the same email or telephone</h2><ul>{state.related.map(r=><li key={r.id}><a href={`#/owners/${r.id}`}>{fmtDate(r.created_at)}</a> · {STATUS[r.status]}</li>)}</ul></>}
 </section>;
}
