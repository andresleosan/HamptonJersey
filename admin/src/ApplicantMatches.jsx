import {useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {isActive} from '../../server/applicants.js';
import MatchCard,{APPROVAL_SCOPE,REASON_LABEL,hasPetRefusal} from './MatchCard.jsx';
const GROUPS=[['found','Found'],['shortlisted','Shortlisted'],['rejected','Rejected']];
export default function ApplicantMatches({applicantId,applicant:a,counts,onChange,onBusy}){
 const [pages,setPages]=useState({}),[msg,setMsg]=useState(null),[busy,setBusy]=useState(false);
 const [picked,setPicked]=useState(()=>new Set()); // BUS-15: the found matches ticked for one Shortlist; only a person ticks
 const generations=useRef({}),working=useRef(false),focus=useRef(null),mounted=useRef(true);
 const readOnly=a.archived_at?'Restore this search to review its matches':!isActive(a)?'Reopen this search to review its matches':null;
 const load=async(status,stack=[null],recover=true)=>{
  const generation=(generations.current[status]??0)+1;generations.current[status]=generation;
  const current=()=>mounted.current&&generations.current[status]===generation;
  setPages(p=>({...p,[status]:{...p[status],loading:true,error:null}}));
  try{
   const after=stack.at(-1),d=await api(`/admin/applicants/${applicantId}/matches?status=${status}${after?'&after='+encodeURIComponent(after):''}`);
   if(!current())return;
   setPages(p=>({...p,[status]:{...d,stack,loading:false}}));
  }catch(e){
   if(!current())return;
   if(e.status===409&&recover){
    setMsg({ok:true,text:'Matches changed. Showing the first page with the current results.'});
    focus.current=`group-${status}`;
    try{await onChange();if(current())await load(status,[null],false);}
    catch(reloadError){if(current())setPages(p=>({...p,[status]:{...p[status],loading:false,error:reloadError.message}}));}
   }else setPages(p=>({...p,[status]:{...p[status],stack,loading:false,error:e.message}}));
  }
 };
 useEffect(()=>{
  mounted.current=true;
  setPages({});for(const [status] of GROUPS)load(status);
  return()=>{mounted.current=false;for(const [status] of GROUPS)generations.current[status]=(generations.current[status]??0)+1;};
 },[applicantId,a.matches_revision]);
 useEffect(()=>{
  if(focus.current&&!Object.values(pages).some(p=>p.loading)){
   document.getElementById(focus.current)?.focus();focus.current=null;
  }
 },[pages]);
 const run=async action=>{
  if(working.current)return;working.current=true;setBusy(true);onBusy?.(true);setMsg(null);
  try{await action();}catch(e){setMsg({text:e.message});}
  finally{working.current=false;setBusy(false);onBusy?.(false);}
 };
 const review=(m,choice)=>run(async()=>{
  const group=pages[m.status]?.matches??[],i=group.findIndex(x=>x.id===m.id),next=group[i+1]??group[i-1];
  let error=null;
  try{
   const {match}=await api(`/admin/matches/${m.id}`,{method:'PUT',body:{...choice,from:m.status,matches_revision:pages[m.status]?.revision}});
   setMsg({ok:true,text:!match?`${m.listing.title} no longer fits this search, so it has left the list.`
    :choice.status==='shortlisted'?`Shortlisted ${m.listing.title}.`:choice.status==='rejected'
    ?`Rejected ${m.listing.title} · ${REASON_LABEL[choice.reject_reason]}.`:`${m.listing.title} is back in Found.`});
  }catch(e){error=e;setMsg({text:e.message});}
  // Invalidating the summary resets every cursor while the requirements form remains owned by the parent.
  focus.current=`group-${m.status}`;
  const fresh=await onChange();if(!fresh)return;
  if(fresh.applicant.matches_revision===a.matches_revision)await Promise.all(GROUPS.map(([s])=>load(s)));
  if(next&&document.getElementById(`match-${next.id}`))document.getElementById(`match-${next.id}`).focus();
  if(error&&![400,404,409].includes(error.status))throw error;
 });
 // Each ticked match is its own review: same checks, its own event, each from the revision the one before left.
 const chosen=(pages.found?.matches??[]).filter(m=>picked.has(m.id));
 const shortlistChosen=()=>run(async()=>{
  let revision=pages.found.revision,done=0,error=null;
  try{for(const m of chosen){
   revision=(await api(`/admin/matches/${m.id}`,{method:'PUT',body:{status:'shortlisted',from:'found',matches_revision:revision}})).revision;done++;
  }}catch(e){error=e;}
  setPicked(new Set());
  setMsg(error?{text:`Shortlisted ${done} of ${chosen.length}. ${error.message}`}:{ok:true,text:`Shortlisted ${done} ${done===1?'match':'matches'}.`});
  focus.current='group-found';
  const fresh=await onChange();
  if(fresh&&fresh.applicant.matches_revision===a.matches_revision)await Promise.all(GROUPS.map(([s])=>load(s)));
 });
 const recalculate=()=>run(async()=>{
  await api(`/admin/applicants/${applicantId}/matches/recalculate`,{method:'POST'});
  focus.current='group-found';
  let fresh;try{fresh=await onChange();}catch(error){focus.current=null;throw error;}
  if(!fresh){focus.current=null;return;}
  if(fresh.applicant.matches_revision===a.matches_revision)await Promise.all(GROUPS.map(([s])=>load(s)));setMsg({ok:true,text:'Matches recalculated.'});
 });
 const legacy=Object.values(pages).some(p=>p.rankingVersion===0);
 const stale=Object.values(pages).some(p=>p.matches?.some(m=>m.requirements_refresh_needed));
 return <div className="matches">
  {readOnly&&<p className="muted">{readOnly}.</p>}
  {(legacy||stale)&&<div className="warn"><p>{legacy?'Previous order and scores. Recalculate to use the current ranking.':'Some match details have changed. Recalculate to update the order.'}</p>
   {!readOnly&&<button className="btn ghost" type="button" aria-disabled={busy} onClick={recalculate}>Recalculate matches</button>}</div>}
  <p role="status" className="ok">{msg?.ok&&msg.text}</p>
  {msg&&!msg.ok&&<p role="alert" className="err">{msg.text}</p>}
  {GROUPS.map(([status,title])=>{const p=pages[status],stack=p?.stack??[null],rows=p?.matches??[],total=p?.counts?.[status]??counts?.[status]??0;
   const move=(to)=>{focus.current=`group-${status}`;load(status,to);};
   return <section key={status} className="match-group" aria-labelledby={`group-${status}`} aria-busy={p?.loading??true}>
    <h2 id={`group-${status}`} tabIndex={-1}>{title} <span className="count">{total}</span></h2>
    {status==='rejected'&&total>0&&<p className="muted">Previous decisions and scores are kept as history.</p>}
    {(!p||p.loading)&&<p role="status">Loading {title.toLowerCase()} matches…</p>}
    {p?.error?<div role="alert"><p className="err">{p.error}</p><button type="button" className="btn ghost" onClick={()=>load(status,stack)}>Retry {title}</button></div>
     :rows.length?<ul className="match-list">{rows.map(m=><li key={m.id}><MatchCard match={m} legacy={p.rankingVersion===0}
      busy={busy||p.loading} disabled={readOnly} onReview={r=>review(m,r)}>
      {!readOnly&&<label className="check"><input type="checkbox" checked={picked.has(m.id)} disabled={hasPetRefusal(m)}
       onChange={e=>setPicked(s=>{const n=new Set(s);if(e.target.checked)n.add(m.id);else n.delete(m.id);return n;})}/>Select<span className="sr"> {m.listing.title}</span></label>}
     </MatchCard></li>)}</ul>
     :p&&!p.loading&&<p className="empty card">{status==='found'?(readOnly?`${readOnly}.`:'No listings to review right now. Check the requirements if you expected some.'):`Nothing ${status} yet.`}</p>}
    {status==='found'&&!readOnly&&rows.length>0&&<div className="inline match-batch">
     <button type="button" className="btn" disabled={!chosen.length} aria-disabled={busy} onClick={shortlistChosen}>Shortlist selected ({chosen.length})</button>
     <p className="muted">{APPROVAL_SCOPE}</p></div>}
    {p&&<nav className="match-pagination" aria-label={`${title} pages`}>
     <button type="button" className="btn ghost" disabled={busy||p.loading||!!p.error||stack.length===1} aria-label={`Previous ${title} page`} onClick={()=>move(stack.slice(0,-1))}>Previous</button>
     <span>Page {stack.length} · {total} {total===1?'match':'matches'}</span>
     <button type="button" className="btn ghost" disabled={busy||p.loading||!!p.error||!p.next} aria-label={`Next ${title} page`} onClick={()=>move([...stack,p.next])}>Next</button>
    </nav>}
   </section>;
  })}
 </div>;
}
