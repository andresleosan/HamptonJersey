import {useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {fmtAgo} from './format.js';
import './listing-history.css';

const ACTION = {created:'Property created',updated:'Property updated',published:'Property published',unpublished:'Property unpublished',
  archived:'Property archived',restored:'Property restored',confirmed:'Availability confirmed by staff',availability_changed:'Availability changed',
  featured_changed:'Featured position changed',cover_changed:'Cover changed',recalculated:'Derived features recalculated',deleted:'Property deleted',
  review_requested:'Review requested',review_returned:'Returned to draft'};
const LABEL = {title:'Title',use:'Use',property_type:'Property type',operation:'Operation',availability:'Availability',country:'Country',location:'Location',
  road_name:'Road',bedrooms:'Bedrooms',bathrooms:'Bathrooms',tenure:'Tenure',tenure_type:'Tenure',housing_category:'Housing category',restriction:'Restriction',
  sale_price:'Sale price',rent:'Rent',rent_period:'Rent period',premium:'Business premium',currency:'Currency',price_text:'Displayed price text',summary:'Summary',
  description:'Description',tour_url:'Tour URL',specs:'Specification',viewings_enabled:'Viewings enabled',viewing_hours:'Viewing hours',parish:'Parish',
  matchable:'Offered to applicants',featured_rank:'Featured position',published:'Published',archived_at:'Archived at',published_at:'Published at',
  confirmed_at:'Confirmed at',cover_media_id:'Cover media ID',feat_pets:'Pets allowed',feat_parking:'Parking spaces',feat_furnished:'Furnished',
  feat_outdoor:'Outdoor space',feat_type:'Derived property type',feat_evidence:'Feature evidence',review_requested_at:'Review requested at'};
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

export default function ListingHistory({id,refreshKey=0}) {
  const [page,setPage]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);
  const request=useRef(0),failedCursor=useRef(null),focusAfter=useRef(null);
  const load=async(cursor=null,moveFocus=false)=>{
    const trigger=document.activeElement;
    const mayFocus=()=>moveFocus&&(document.activeElement===trigger||document.activeElement===document.body);
    focusAfter.current=null;
    const n=++request.current;setLoading(true);setError(false);failedCursor.current=cursor;
    try {
      const next=await api(`/admin/listings/${id}/history${cursor?'?cursor='+encodeURIComponent(cursor):''}`);
      if(n!==request.current)return;
      if(mayFocus())focusAfter.current=cursor&&next.items.length?`history-event-${next.items[0].id}`:'h-history';
      setPage(old=>cursor&&old?{...next,items:[...new Map([...old.items,...next.items].map(i=>[i.id,i])).values()]}:next);
    } catch {if(n===request.current){if(mayFocus())focusAfter.current='history-retry';setError(true);}}
    finally {if(n===request.current)setLoading(false);}
  };
  useEffect(()=>{load();return ()=>{request.current++;};},[id,refreshKey]);
  useEffect(()=>{if(focusAfter.current){document.getElementById(focusAfter.current)?.focus();focusAfter.current=null;}},[page,error]);
  return <section id="s-history" className="card listing-history" aria-labelledby="h-history">
    <div className="head"><h2 id="h-history" tabIndex={-1}>History</h2>
      <button type="button" className="btn ghost sm" disabled={loading} onClick={()=>load()}>Refresh history</button></div>
    <p className="muted">Recorded property events. Earlier activity was not reconstructed. Dates are shown in Jersey time.</p>
    <p role="status" className="muted">{loading?'Loading property history…':page?`${page.items.length} recorded ${page.items.length===1?'event':'events'} shown.`:''}</p>
    {error&&<div><p role="alert" className="err">Couldn't load property history. Try again.</p>
      <button id="history-retry" type="button" className="btn ghost sm" disabled={loading} onClick={()=>load(failedCursor.current,true)}>Try again</button></div>}
    {page?.items.length===0&&!loading&&!error&&<p>No property events recorded yet. Earlier activity was not reconstructed.</p>}
    {page?.items.length>0&&<ol>{page.items.map(item=><li key={item.id}>
      <h3 id={`history-event-${item.id}`} tabIndex={-1}>{ACTION[item.type.slice(8)]??'Property event recorded'}</h3>
      <p className="meta">{validDate(item.at)?<><span><time dateTime={item.at} title={date(item.at)}>{fmtAgo(item.at)}</time></span>
        <span>{date(item.at)} (Jersey)</span></>:<span>Date unavailable</span>}<span>Recorded by {item.actor}</span>
        {item.source&&<span>{SOURCE[item.source]}</span>}{item.revision!==null&&<span>Revision {item.revision}</span>}</p>
      <details><summary>Event details</summary>
        {item.details_unavailable&&<p className="muted">Details unavailable</p>}
        {item.changes.length>0&&<ul className="history-changes">{item.changes.map(c=><li key={c.field}>
          <span>{LABEL[c.field]} changed{c.derived?' (derived)':''}</span>
          {(Object.hasOwn(c,'before')||Object.hasOwn(c,'after'))&&<dl>
            {['before','after'].filter(side=>Object.hasOwn(c,side)).map(side=><div key={side}><dt>{side==='before'?'Before':'After'}</dt><dd>{value(c.field,c[side])}</dd></div>)}
          </dl>}</li>)}</ul>}
        {Object.entries(item.related).map(([k,v])=><p key={k}>{({offer_id:'Offer',sale_id:'Sale',import_id:'Import'})[k]} record: {v}</p>)}
        {item.evidence.length?item.evidence.map(e=><div key={e.evidence_ref} className="history-evidence">
          <p>Recorded reference: {e.evidence_ref}</p><p className="muted">{words(e.action)}; {words(e.reason_code)}</p>
          <p className="muted">Declared occurrence: <time dateTime={e.occurred_at}>{date(e.occurred_at)}</time> (Jersey)</p>
        </div>):<p className="muted">No evidence reference recorded</p>}
      </details>
    </li>)}</ol>}
    {page?.next_cursor&&!error&&<button type="button" className="btn ghost sm" disabled={loading} onClick={()=>load(page.next_cursor,true)}>Load older events</button>}
  </section>;
}
