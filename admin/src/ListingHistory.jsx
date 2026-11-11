import {useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {fmtAgo} from './format.js';
import {mergeHistoryPage} from './listing-history-window.mjs';
import './listing-history.css';

const ACTION = {created:'Property created',updated:'Property updated',published:'Property published',unpublished:'Property unpublished',
  archived:'Property archived',restored:'Property restored',confirmed:'Availability confirmed by staff',availability_changed:'Availability changed',
  featured_changed:'Featured position changed',cover_changed:'Cover changed',recalculated:'Derived features recalculated',deleted:'Property deleted',
  review_requested:'Review requested',review_returned:'Returned to draft'};
const RELATED = {'match.reviewed':'Match reviewed','viewing.requested':'Viewing requested','viewing.booked':'Viewing booked',
  'viewing.confirmed':'Viewing confirmed','viewing.rescheduled':'Viewing rescheduled','viewing.cancelled':'Viewing cancelled',
  'viewing.completed':'Viewing completed','viewing.no_show':'Viewing missed','offer.recorded':'Offer recorded',
  'offer.updated':'Offer updated','offer.countered':'Offer countered','offer.rejected':'Offer rejected',
  'offer.withdrawn':'Offer withdrawn','offer.accepted':'Offer accepted','sale.updated':'Sale updated',
  'sale.milestone':'Sale milestone updated','sale.completed':'Sale completed','sale.fallen_through':'Sale fell through'};
const MATCH = {found:'Found',shortlisted:'Shortlisted',rejected:'Rejected'};
const MILESTONE_STATE = {planned:'Planned',completed:'Completed',not_needed:'Not needed',
  plan_removed:'Plan removed',completion_removed:'Completion removed',needed_again:'Needed again'};
const title = item => item.type==='match.reviewed'&&item.decision?.to==='shortlisted'?'Match shortlisted':
  item.type==='match.reviewed'&&item.decision?.to==='rejected'?'Match rejected':
  item.type==='match.reviewed'&&item.decision?.to==='found'?'Match review undone':
  item.type.startsWith('listing.')?(ACTION[item.type.slice(8)]??'Property event recorded'):
  (RELATED[item.type]??'Property event recorded');
const LABEL = {title:'Title',use:'Use',property_type:'Property type',operation:'Operation',availability:'Availability',country:'Country',location:'Location',
  road_name:'Road',bedrooms:'Bedrooms',bathrooms:'Bathrooms',tenure:'Tenure',tenure_type:'Tenure',housing_category:'Housing category',restriction:'Restriction',
  sale_price:'Sale price',rent:'Rent',rent_period:'Rent period',premium:'Business premium',currency:'Currency',price_text:'Displayed price text',summary:'Summary',
  description:'Description',tour_url:'Tour URL',specs:'Specification',viewings_enabled:'Viewings enabled',viewing_hours:'Viewing hours',parish:'Parish',
  matchable:'Offered to applicants',featured_rank:'Featured position',published:'Published',archived_at:'Archived at',published_at:'Published at',
  confirmed_at:'Confirmed at',cover_media_id:'Cover media ID',feat_pets:'Pets allowed',feat_parking:'Parking spaces',feat_furnished:'Furnished',
  feat_outdoor:'Outdoor space',feat_type:'Derived property type',feat_evidence:'Feature evidence',review_requested_at:'Review requested at',
  building_name_or_number:'Building name or number (internal)',postcode:'Postcode (internal)',property_condition:'Property condition',developer_name:'Developer (internal)',
  public_address_publication:'Exact address publication'};
const SOURCE = {panel:'Panel',queue:'Properties Queue',sales:'Sales',media:'Media',recalculate:'Recalculation'};
const validDate = iso => typeof iso==='string' && Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString()===iso;
const date = iso => validDate(iso)?new Date(iso).toLocaleString('en-GB',{timeZone:'Europe/Jersey',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}):'Date unavailable';
const words = s => s.replaceAll('_',' ');
function value(field,v) {
  if(v===null)return 'Not recorded';
  if(typeof v==='boolean')return v?'Yes':'No';
  if(field.endsWith('_at'))return `${date(v)} (Jersey)`;
  if(field==='viewing_hours')return v.map(w=>`${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][w.day]} ${w.start} to ${w.end}`).join('; ');
  if(Array.isArray(v))return v.map(words).join(', ')||'None';
  return typeof v==='number'?v.toLocaleString('en-GB'):words(v);
}

export default function ListingHistory({id,refreshKey=0,historyEndpoint}) {
  const [page,setPage]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(false),
    [invalidCursor,setInvalidCursor]=useState(false),[verificationFailed,setVerificationFailed]=useState(false);
  const request=useRef(0),failedCursor=useRef(null),focusAfter=useRef(null);
  const path=historyEndpoint??`/admin/listings/${id}/history`;
  const isolated=historyEndpoint!==undefined;
  const load=async(cursor=null,moveFocus=false)=>{
    const trigger=document.activeElement;
    const mayFocus=()=>moveFocus&&(document.activeElement===trigger||document.activeElement===document.body);
    focusAfter.current=null;
    const visible=page?.items??[],withheld=isolated||visible.some(i=>!i.type.startsWith('listing.'));
    const n=++request.current;let checking=false;
    setLoading(true);setError(false);setInvalidCursor(false);setVerificationFailed(false);failedCursor.current=cursor;
    if(withheld)setPage(null);
    try {
      const next=await api(`${path}${cursor?'?cursor='+encodeURIComponent(cursor):''}`);
      if(n!==request.current)return;
      const candidate=mergeHistoryPage(cursor?page:null,next);
      const ids=candidate.items.map(i=>i.id);
      if(ids.length){
        checking=true;
        await api(`${path}/validate`,{method:'POST',body:{ids}});
        if(n!==request.current)return;
      }
      if(mayFocus())focusAfter.current=cursor&&next.items.length?`history-event-${next.items[0].id}`:'h-history';
      setPage(candidate);
    } catch (e) {if(n===request.current){const invalid=e.status===409||!!cursor&&e.status===400,
      unverified=(checking||!!cursor&&withheld)&&!invalid;
      if(mayFocus())focusAfter.current=invalid||unverified?'history-refresh':'history-retry';
      if(invalid||unverified||isolated&&[401,403].includes(e.status))setPage(null);
      setInvalidCursor(invalid);setVerificationFailed(unverified);setError(true);}}
    finally {if(n===request.current)setLoading(false);}
  };
  useEffect(()=>{load();return ()=>{request.current++;};},[id,refreshKey,historyEndpoint]);
  useEffect(()=>{if(focusAfter.current){document.getElementById(focusAfter.current)?.focus();focusAfter.current=null;}},[page,error]);
  return <section id="s-history" className="card listing-history" aria-labelledby="h-history">
    <div className="head"><h2 id="h-history" tabIndex={-1}>History</h2>
      <button id="history-refresh" type="button" className="btn ghost sm" disabled={loading} onClick={()=>load()}>Refresh history</button></div>
    <p className="muted">Recorded property events. Earlier activity was not reconstructed. Dates are shown in Jersey time.</p>
    <p role="status" className="muted">{loading?'Loading property history…':page?`${page.items.length} recorded ${page.items.length===1?'event':'events'} shown.`:''}</p>
    {page?.trimmed&&<p className="muted">Showing older events. Refresh history to return to the newest.</p>}
    {error&&<div><p role="alert" className="err">{invalidCursor?'History changed. Refresh history to continue.':verificationFailed?"Couldn't verify property history. Refresh history to continue.":"Couldn't load property history. Try again."}</p>
      {!invalidCursor&&!verificationFailed&&<button id="history-retry" type="button" className="btn ghost sm" disabled={loading} onClick={()=>load(failedCursor.current,true)}>Try again</button>}</div>}
    {page?.items.length===0&&!loading&&!error&&<p>No property events recorded yet. Earlier activity was not reconstructed.</p>}
    {page?.items.length>0&&<ol>{page.items.map(item=><li key={item.id}>
      <h3 id={`history-event-${item.id}`} tabIndex={-1}>{title(item)}</h3>
      <p className="meta">{validDate(item.at)?<><span><time dateTime={item.at} title={date(item.at)}>{fmtAgo(item.at)}</time></span>
        <span>{date(item.at)} (Jersey)</span></>:<span>Date unavailable</span>}<span>Recorded by {item.actor}</span>
        {item.source&&<span>{SOURCE[item.source]}</span>}{item.revision!==null&&<span>Revision {item.revision}</span>}</p>
      <details><summary>Event details</summary>
        {item.details_unavailable&&<p className="muted">Details unavailable</p>}
        {item.decision?.from&&item.decision?.to&&<p>Decision: {MATCH[item.decision.from]} to {MATCH[item.decision.to]}</p>}
        {item.decision?.reason&&<p>Reason: {item.decision.reason.replaceAll('_',' ')}</p>}
        {item.milestone&&<p>Sale step: {words(item.milestone)}</p>}
        {item.type==='sale.milestone'&&<p>Step state: {MILESTONE_STATE[item.milestone_state]??'Not recorded in this event'}</p>}
        {item.changes.length>0&&<ul className="history-changes">{item.changes.map(c=><li key={c.field}>
          <span>{LABEL[c.field]} changed{c.derived?' (derived)':''}</span>
          {(Object.hasOwn(c,'before')||Object.hasOwn(c,'after'))&&<dl>
            {['before','after'].filter(side=>Object.hasOwn(c,side)).map(side=><div key={side}><dt>{side==='before'?'Before':'After'}</dt><dd>{value(c.field,c[side])}</dd></div>)}
          </dl>}</li>)}</ul>}
        {Object.entries(item.related).map(([k,v])=><p key={k}>{({offer_id:'Offer',sale_id:'Sale',import_id:'Import'})[k]} record: {v}</p>)}
        {item.evidence.length?item.evidence.map(e=><div key={e.evidence_ref} className="history-evidence">
          <p>Recorded reference: {e.evidence_ref}</p><p className="muted">{words(e.action)}; {words(e.reason_code)}</p>
          <p className="muted">Declared occurrence: <time dateTime={e.occurred_at}>{date(e.occurred_at)}</time> (Jersey)</p>
        </div>):item.type.startsWith('listing.')&&<p className="muted">No evidence reference recorded</p>}
      </details>
    </li>)}</ol>}
    {page?.next_cursor&&!error&&<button type="button" className="btn ghost sm" disabled={loading} onClick={()=>load(page.next_cursor,true)}>Load older events</button>}
  </section>;
}
