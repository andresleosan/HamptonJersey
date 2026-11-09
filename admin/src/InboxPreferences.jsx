import {useEffect,useState} from 'react';
import {api} from './api.js';
const CATEGORIES={new_applicant:'New applicants',viewing:'Viewings',matched:'Matched',task:'Tasks'};

export default function InboxPreferences({paused,blocked,onDirty,onSaved}) {
  const [saved,setSaved]=useState(null),[checked,setChecked]=useState([]),[busy,setBusy]=useState(false);
  const [error,setError]=useState(null),[message,setMessage]=useState(null),[conflict,setConflict]=useState(false);
  const dirty=saved&&JSON.stringify(checked)!==JSON.stringify(saved.feed_categories);
  useEffect(()=>{onDirty(Boolean(dirty||busy));},[dirty,busy,onDirty]);
  useEffect(()=>()=>onDirty(false),[onDirty]);
  const load=async preserve=>{
    try {
      const row=await api('/admin/notification-preferences');
      const next=preserve&&saved?Object.keys(CATEGORIES).filter(c=>checked.includes(c)!==saved.feed_categories.includes(c)?checked.includes(c):row.feed_categories.includes(c)):row.feed_categories;
      setSaved(row);setChecked(next);setError(null);setConflict(false);setMessage(preserve?'Latest preferences loaded. Your choices have been kept.':null);
    }catch(e){setError(e.message);}
  };
  useEffect(()=>{if(!paused)load(false);},[paused]);
  const save=async e=>{
    e.preventDefault();if(busy||!saved||blocked||paused)return;setBusy(true);setError(null);setMessage(null);
    try {
      const row=await api('/admin/notification-preferences',{method:'PUT',body:{revision:saved.revision,feed_categories:checked}});
      setSaved(row);setChecked(row.feed_categories);setConflict(false);setMessage('Feed preferences saved.');await onSaved();
    }catch(err){setError(err.message);if(err.status===409)setConflict(true);}
    finally{setBusy(false);}
  };
  return <form className="task-preferences" onSubmit={save}>
    <p className="muted">Choose informational updates for your Feed. Tasks needing action and completed tasks stay visible to the team.</p>
    {!saved&&!error&&<p role="status">Loading feed preferences…</p>}
    <fieldset disabled={!saved||busy||paused}><legend>Informational updates</legend>
      <div className="task-checks">{Object.entries(CATEGORIES).map(([key,label])=><label className="check" key={key}>
        <input type="checkbox" checked={checked.includes(key)} onChange={e=>setChecked(values=>Object.keys(CATEGORIES).filter(c=>c===key?e.target.checked:values.includes(c)))}/>{label}
      </label>)}</div>
      <div className="inline task-actions"><button className="btn" disabled={!dirty||conflict||blocked}>Save feed preferences</button>
        {dirty&&<button type="button" className="btn ghost" onClick={()=>{setChecked(saved.feed_categories);setMessage(null);}}>Discard preference changes</button>}</div>
    </fieldset>
    {blocked&&<p className="muted">Save or discard task changes before saving feed preferences.</p>}
    {error&&<p role="alert" className="err">{error}</p>}
    {message&&<p role="status" className="ok">{message}</p>}
    {(conflict||!saved)&&<p><button type="button" className="btn ghost" disabled={busy||paused} onClick={()=>load(true)}>Reload preferences</button></p>}
  </form>;
}
