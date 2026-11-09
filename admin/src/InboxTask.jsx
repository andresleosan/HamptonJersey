import {useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {fmtAgo,fmtDate} from './format.js';
import {CATEGORY_LABELS,MANUAL_CATEGORIES} from '../../shared/notification-categories.js';

const localTime=iso=>iso?new Date(new Date(iso).getTime()-new Date(iso).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
const fields=t=>({assigned_to:t.assigned_to??'',due:localTime(t.due_at)});
const same=(a,b)=>a.assigned_to===b.assigned_to&&a.due===b.due;
const HISTORY={created:'Task created',claim:'Task claimed',assign:'Owner changed',deadline:'Deadline changed',edit:'Task details updated',
  done:'Marked done',reopen:'Task reopened',source_update:'Context updated',source_resolved:'Resolved by source'};

function Owners({value,users,onChange,disabled,label='Assigned to'}) {
  const unavailable=value&&!users.some(u=>u.email===value);
  return <label>{label}<select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>
    <option value="">Unassigned</option>
    {unavailable&&<option value={value}>{value} (no longer has access)</option>}
    {users.map(u=><option key={u.email} value={u.email}>{u.name||u.email}</option>)}
  </select></label>;
}

export default function InboxTask({n,users,me,paused,onChanged,onRead,onDirty,onPending,reloadUsers}) {
  const [task,setTask]=useState(n),[draft,setDraft]=useState(()=>fields(n)),[history,setHistory]=useState([]);
  const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
  const [error,setError]=useState(null),[message,setMessage]=useState(null),[conflict,setConflict]=useState(false);
  const [creating,setCreating]=useState(false),[createDirty,setCreateDirty]=useState(false);
  const [createPending,setCreatePending]=useState(false);
  const seq=useRef(0),lastLoaded=useRef(0),pending=useRef(null),state=useRef(null);
  const dirty=!same(draft,fields(task));state.current={task,draft,dirty,busy,uncertain};
  useEffect(()=>{onDirty(dirty||createDirty||busy||uncertain);},[dirty,createDirty,busy,uncertain,onDirty]);
  useEffect(()=>()=>{seq.current++;onDirty(false);},[onDirty]);
  useEffect(()=>{onPending(busy||uncertain||createPending);},[busy,uncertain,createPending,onPending]);
  useEffect(()=>()=>onPending(false),[onPending]);

  const load=async(preserve=false,announce=false)=>{
    const ticket=++seq.current;
    try {
      const d=await api(`/admin/notification-tasks/${n.id}`);
      if(ticket!==seq.current)return;
      const current=state.current,old=fields(current.task),incoming=fields(d.task);
      // A poll may have started before editing or a retry became uncertain.
      if(!preserve&&(current.dirty||current.busy||current.uncertain)){
        if(d.task.revision!==current.task.revision)setConflict(true);
        return;
      }
      const merged=preserve?{assigned_to:current.draft.assigned_to!==old.assigned_to?current.draft.assigned_to:incoming.assigned_to,
        due:current.draft.due!==old.due?current.draft.due:incoming.due}:incoming;
      setTask(d.task);setDraft(merged);setHistory(d.history);setLoaded(true);setError(null);setConflict(false);lastLoaded.current=d.task.revision;
      if(announce)setMessage(preserve?'Latest task loaded. Your draft has been kept.':'Latest task loaded.');
      await api(`/admin/notification-tasks/${n.id}/read`,{method:'PUT',body:{revision:d.task.revision}})
        .then(()=>onRead(n.id,d.task.revision),()=>{});
    } catch(e){if(ticket===seq.current){setError(e.message);setLoaded(false);}}
  };
  useEffect(()=>{
    if(paused)return;
    const current=state.current;
    if(current.dirty||current.busy||current.uncertain){if(n.revision!==current.task.revision||n.moved)setConflict(true);return;}
    if(lastLoaded.current!==n.revision||!loaded)load();
  },[n.id,n.revision,n.moved,paused]);

  const save=async(action,extra={})=>{
    if(busy||paused)return;
    const body=pending.current??{operation_id:crypto.randomUUID(),revision:task.revision,action,...extra};
    pending.current=body;setBusy(true);setError(null);setMessage(null);seq.current++;
    try {
      const result=await api(`/admin/notification-tasks/${n.id}`,{method:'PUT',body});
      if(!result?.task||result.task.id!==n.id||!Number.isSafeInteger(result.task.revision))
        throw new Error('The task response could not be confirmed. Retry the same change.');
      pending.current=null;setUncertain(false);setConflict(false);setTask(result.task);setDraft(fields(result.task));lastLoaded.current=result.task.revision;
      if(!['done','reopen'].includes(body.action))await load(true);
      await onChanged({task:result.task,action:body.action});
    } catch(e){
      setError(e.message);
      if(typeof e.status!=='number'||e.status===0||e.status>=500)setUncertain(true);
      else {pending.current=null;setUncertain(false);if(e.status===409)setConflict(true);}
    } finally {setBusy(false);}
  };
  const reload=async()=>{if(busy||uncertain)return;await reloadUsers();await load(true,true);};
  const discard=()=>{setDraft(fields(task));setError(null);setMessage(null);if(conflict)load(false,true);};
  const disabled=paused||busy||uncertain||!loaded;
  const open=task.action_required===1&&task.resolved_at==null;
  const actorName=actor=>users.find(u=>u.email===actor)?.name||({system:'System',public:'Website'}[actor])||actor;

  return <article className="card inbox-detail task-controls" aria-labelledby="n-title">
    <div className="head"><div><h2 id="n-title">{task.title}</h2>
      <p className="muted">{task.urgency==='urgent'?'Urgent · ':''}{fmtAgo(task.created_at)}</p></div>
      <div className="inline">
        {open&&<button type="button" className="btn" disabled={disabled||dirty||createDirty||conflict||!task.target_exists} onClick={()=>save('done')}>Done</button>}
        {task.can_reopen&&<button type="button" className="btn" disabled={disabled||dirty||createDirty||conflict} onClick={()=>save('reopen')}>Reopen task</button>}
        {task.link&&task.target_exists&&<a className="btn ghost" href={task.link}>{task.weekly_insights?'Open weekly Insights':({viewing:'Open viewing',listing:'Open property',offer:'Open offer',sale:'Open sale',rental:'Open rental',payment:'Open payment',collection:'Open unmatched payments'})[task.entity_type]||(task.category==='matched'?'Review matches':'Open applicant')}</a>}
        {task.phone&&<a className="btn ghost" href={`tel:${task.phone}`}>Call</a>}
      </div></div>
    {error&&<p role="alert" className="err">{error}</p>}
    {conflict&&<p role="alert" className="warn">This task has newer context. Reload to review it; your draft is kept.</p>}
    {message&&<p role="status" className="ok">{message}</p>}
    {uncertain&&<p className="warn">The result could not be confirmed. <button type="button" className="linkish" disabled={busy||paused} onClick={()=>save()}>Retry same change</button></p>}
    {(conflict||!loaded)&&!uncertain&&<p><button type="button" className="btn ghost" disabled={busy||paused} onClick={reload}>Reload task</button></p>}
    {!loaded&&!error&&<p role="status">Loading task details…</p>}
    {task.task_reason&&<p className="task-reason">{task.task_reason}</p>}
    {task.context_label&&<p>{task.context_label}</p>}
    <dl className="kv">
      <div><dt>Received</dt><dd>{fmtDate(task.created_at)}</dd></div>
      <div><dt>Status</dt><dd>{open?'Needs action':task.resolved_at?(task.closed_by_source?'Resolved by source':'Done'):'For your information'}</dd></div>
      {!task.weekly_insights&&<div><dt>Assigned to</dt><dd>{task.assigned_name||task.assigned_to||'Unassigned'}{task.assigned_to&&!task.assigned_available?' (no longer has access)':''}</dd></div>}
      {!task.weekly_insights&&<div><dt>Deadline</dt><dd>{task.due_at?new Date(task.due_at).toLocaleString('en-GB'):'No deadline'}{task.due_at&&open&&Date.parse(task.due_at)<Date.now()?' · Overdue':''}</dd></div>}
      {task.phone&&<div><dt>Phone</dt><dd className="num">{task.phone}</dd></div>}
    </dl>
    {!task.target_exists&&<p className="warn">The related record is no longer available.</p>}
    {!task.weekly_insights&&<form className="task-form" onSubmit={e=>{e.preventDefault();save('edit',{assigned_to:draft.assigned_to||null,due_at:draft.due?new Date(draft.due).toISOString():null});}}>
      <fieldset disabled={disabled||!task.target_exists}><legend>Task details</legend>
        <div className="task-fields"><Owners value={draft.assigned_to} users={users} onChange={value=>setDraft(d=>({...d,assigned_to:value}))}/>
          <label>Deadline (your time zone)<input type="datetime-local" value={draft.due} onChange={e=>setDraft(d=>({...d,due:e.target.value}))}/></label></div>
        <div className="inline task-actions"><button className="btn" disabled={!dirty||conflict||createDirty}>Save task details</button>
          {dirty&&<button type="button" className="btn ghost" onClick={discard}>Discard task changes</button>}
          {open&&(!task.assigned_to||task.assigned_to===me)&&<button type="button" className="btn ghost" disabled={dirty||createDirty||conflict||task.assigned_to===me} onClick={()=>save('claim')}>Claim task</button>}
        </div></fieldset>
    </form>}
    {['applicant','viewing','rental'].includes(task.entity_type)&&task.target_exists&&!creating&&
      <p><button type="button" className="btn ghost" disabled={disabled||dirty||conflict} onClick={()=>setCreating(true)}>Add follow-up task</button></p>}
    {creating&&<Followup task={task} users={users} paused={paused} onDirty={setCreateDirty} onPending={setCreatePending} onCreated={result=>onChanged({task:result.task,action:'created'})} onCancel={()=>setCreating(false)}/>}
    <details className="task-history"><summary>Task history ({history.length})</summary>
      {!history.length?<p className="muted">No task changes recorded yet.</p>:<ol>{history.map(h=><li key={h.revision}>
        <span>{HISTORY[h.action]||'Task updated'}</span><span className="muted">{actorName(h.actor)} · <time dateTime={h.at}>{fmtDate(h.at)}</time></span>
      </li>)}</ol>}</details>
  </article>;
}

function Followup({task,users,paused,onDirty,onPending,onCreated,onCancel}) {
  const [initialCategory]=useState(()=>MANUAL_CATEGORIES.includes(task.category)?task.category:'task');
  const [category,setCategory]=useState(initialCategory);
  const [title,setTitle]=useState(''),[reason,setReason]=useState(''),[owner,setOwner]=useState(task.assigned_to??''),[due,setDue]=useState('');
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(null);const pending=useRef(null);
  useEffect(()=>{onDirty(Boolean(title||reason||due||category!==initialCategory||owner!==(task.assigned_to??'')||busy||uncertain));},[title,reason,owner,due,category,initialCategory,busy,uncertain,onDirty,task.assigned_to]);
  useEffect(()=>()=>onDirty(false),[onDirty]);
  useEffect(()=>{onPending(busy||uncertain);},[busy,uncertain,onPending]);
  useEffect(()=>()=>onPending(false),[onPending]);
  const submit=async e=>{
    e?.preventDefault();if(busy||paused)return;
    const body=pending.current??{operation_id:crypto.randomUUID(),target:{kind:task.entity_type,id:task.entity_id,
      ...(task.entity_type==='rental'&&task.context?{context:task.context}:{})},category,title,reason,
      assigned_to:owner||null,due_at:due?new Date(due).toISOString():null};
    pending.current=body;setBusy(true);setError(null);
    try {const result=await api('/admin/notification-tasks',{method:'POST',body});
      if(!Number.isSafeInteger(result?.task?.id)||!Number.isSafeInteger(result.task.revision))
        throw new Error('The task response could not be confirmed. Retry the same task.');
      pending.current=null;setUncertain(false);onDirty(false);await onCreated(result);}
    catch(err){setError(err.message);if(typeof err.status!=='number'||err.status===0||err.status>=500)setUncertain(true);else{pending.current=null;setUncertain(false);}}
    finally{setBusy(false);}
  };
  return <form className="task-form" onSubmit={submit}>
    <fieldset disabled={busy||uncertain||paused}><legend>Follow-up task</legend>
      <label>Follow-up category<select aria-label="Follow-up category" value={category} onChange={e=>setCategory(e.target.value)}>
        {MANUAL_CATEGORIES.map(key=><option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}
      </select></label>
      <label>Follow-up title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={200} required/></label>
      <label>Follow-up reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} rows={2}/></label>
      <div className="task-fields"><Owners label="Follow-up assigned to" value={owner} users={users} onChange={setOwner}/>
        <label>Follow-up deadline (your time zone)<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label></div>
      <div className="inline task-actions"><button className="btn">Create follow-up task</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel follow-up</button></div>
    </fieldset>
    {error&&<p role="alert" className="err">{error}</p>}
    {uncertain&&<p className="warn">The result could not be confirmed. <button type="button" className="linkish" disabled={busy||paused} onClick={()=>submit()}>Retry same task</button></p>}
    {busy&&<p role="status">Saving follow-up…</p>}
  </form>;
}
