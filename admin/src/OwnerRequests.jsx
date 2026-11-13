import {useEffect,useState} from 'react';
import {api} from './api.js';
import {fmtDate} from './format.js';
export default function OwnerRequests({id}){
 const [state,setState]=useState({loading:true});
 useEffect(()=>{let live=true;setState({loading:true});api(`/admin/owner-requests/${encodeURIComponent(id)}`).then(data=>{if(live)setState({owner:data.owner})},()=>{if(live)setState({error:true})});return()=>{live=false}},[id]);
 if(state.loading)return <p role="status">Loading owner request…</p>;
 if(state.error)return <p role="alert">This request is unavailable.</p>;
 const o=state.owner;return <section className="card"><a href="#/">Back to Inbox</a><h1>Property owner request</h1><dl>
 <dt>Name</dt><dd>{o.name}</dd><dt>Telephone</dt><dd>{o.phone}</dd><dt>Email</dt><dd>{o.email}</dd><dt>Property address</dt><dd>{o.address}</dd>
 <dt>Operation</dt><dd>{o.operation==='sale'?'Sell':'Let'}</dd><dt>Valuation requested</dt><dd>{o.valuation_requested?'Yes':'No'}</dd><dt>Status</dt><dd>{o.status}</dd><dt>Received</dt><dd>{fmtDate(o.created_at)}</dd>
 </dl><p>Closing an Inbox task does not change this request.</p></section>;
}
