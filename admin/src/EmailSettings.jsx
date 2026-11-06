import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";
import { setUnsaved } from "./unsaved.js";

const fields=s=>({enabled:s.enabled,summary:s.summary,addresses:s.recipients.join("\n")});
export default function EmailSettings() {
  const [data,setData]=useState(null),[initial,setInitial]=useState(null),[form,setForm]=useState(null);
  const [error,setError]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false);
  const [sample,setSample]=useState(null),[ack,setAck]=useState(false),[address,setAddress]=useState("");
  const said=useRef(null),live=useRef(true);
  const dirty=!!initial && JSON.stringify(form)!==JSON.stringify(fields(initial));
  useEffect(()=>{setUnsaved(dirty);return ()=>setUnsaved(false);},[dirty]);
  useEffect(()=>{if(result)said.current?.focus();},[result]);
  const load=async(manual=false)=>{
    if(dirty && !confirm("Discard unsaved email preferences and reload?"))return;
    setBusy(true);setError(null);setResult(null);
    try {
      const d=await api("/admin/email/settings");
      if(live.current){setData(d);setInitial(d.settings);setForm(fields(d.settings));setSample(null);setAck(false);
        if(manual)setResult({text:"Email preferences reloaded."});}
    }catch(e){if(live.current)setError(e.message);}
    finally{if(live.current)setBusy(false);}
  };
  useEffect(()=>{live.current=true;load();return ()=>{live.current=false;};},[]);
  const change=(key,value)=>{setForm(f=>({...f,[key]:value}));setSample(null);setAck(false);setResult(null);};
  const preview=async()=>{
    setBusy(true);setResult(null);
    try{setSample(await api("/admin/email/preview"));setAck(false);}
    catch(e){setResult({error:true,text:e.message});}finally{setBusy(false);}
  };
  const save=async e=>{
    e.preventDefault();setBusy(true);setResult(null);
    try {
      const recipients=form.addresses.split(/[\n,;]/).map(a=>a.trim()).filter(Boolean);
      const r=await api("/admin/email/settings",{method:"PUT",body:{enabled:form.enabled,summary:form.summary,
        recipients,expectedRevision:initial.revision,previewed:!!sample && ack}});
      setInitial(r.settings);setForm(fields(r.settings));setAck(false);
      setResult({text:"Email preferences saved."});
    }catch(e){setResult({error:true,text:e.message});}finally{setBusy(false);}
  };
  const suppression=async allow=>{
    if(!confirm(allow?"Allow future sending to this address? This does not retry old emails.":"Stop sending to this address and cancel its pending emails?"))return;
    setBusy(true);setResult(null);
    try {
      if(allow){
        const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(address.trim().toLowerCase()));
        const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
        await api(`/admin/email/suppressions/${hash}`,{method:"DELETE"});
      }else await api("/admin/email/suppressions",{method:"POST",body:{address:address.trim()}});
      const d=await api("/admin/email/settings");setData(d);setAddress("");
      setResult({text:allow?"Address allowed for future sending. No old email was retried.":"Address suppressed. Pending sending to it is cancelled."});
    }catch(e){setResult({error:true,text:e.message});}finally{setBusy(false);}
  };
  if(!data)return <article id="email-settings" className="card"><h2>Email</h2>
    {error?<><p role="alert" className="err">Couldn't load email preferences. {error}</p><button type="button" className="btn ghost" onClick={load}>Retry email preferences</button></>:<p>Loading email preferences…</p>}</article>;
  const active=form.enabled && form.summary, o=data.overview;
  return <form id="email-settings" className="email-preferences" onSubmit={save}>
    <article className="card" aria-labelledby="email-service-title">
      <div className="head"><h2 id="email-service-title">Email</h2><button type="button" className="btn ghost sm" disabled={busy} onClick={()=>load(true)}>Reload email preferences</button></div>
      {!data.ready && <p className="warn">Email service setup is not confirmed. Tell Optimyze before enabling sending.</p>}
      <p className="email-address">From {data.from}<br/>Replies to {data.reply_to}</p>
      <p className="muted">{data.worker?`Worker last checked ${fmtDate(data.worker.at)}. ${data.worker.ready?"Email binding available.":"Email binding is not ready; nothing can be sent."}`:"Worker email status has not been reported yet."}</p>
      <label className="email-check"><input type="checkbox" checked={form.enabled} disabled={!data.ready||busy}
        onChange={e=>change("enabled",e.target.checked)}/>Enable email sending</label>
      <p>{o.attempts_today} of {o.limit} send attempts today in Jersey. {o.accepted_today} accepted by Cloudflare today, {o.failed_today} failed, {o.unknown_today} with an unknown result.</p>
      <p><a href="#/email?review=pending">{o.pending_review} unknown {o.pending_review===1?"result":"results"} waiting for review</a> across all days.</p>
      <p className="muted">Acceptance does not confirm inbox delivery. Pause all outbound also stops the team summary. Unknown results require review in Email and are never retried automatically.</p>
      <a href="#/email">Review received and outgoing email</a>
      <details className="more"><summary>Address preferences</summary>
        <p className="muted">{data.suppressions.length}{data.suppressions.length===200?" or more":""} suppressed addresses. Enter an address to stop or allow future sending. These preferences do not resend old emails.</p>
        <div className="inline"><label>Address for sending preferences<input type="email" value={address} maxLength={254} onChange={e=>setAddress(e.target.value)}/></label>
          <button type="button" className="btn ghost sm" disabled={busy||!address.trim()} onClick={()=>suppression(false)}>Stop sending to address</button>
          <button type="button" className="btn ghost sm" disabled={busy||!address.trim()} onClick={()=>suppression(true)}>Allow sending to address</button></div>
      </details>
    </article>
    <article className="card" aria-labelledby="email-summary-title">
      <h2 id="email-summary-title">Daily team summary</h2>
      <p>Counts and a link to the panel, without customer names or details. Each team address receives its own email.</p>
      <label className="email-check"><input type="checkbox" checked={form.summary} disabled={!form.enabled||busy}
        onChange={e=>change("summary",e.target.checked)}/>Daily team summary at 08:00 Jersey time</label>
      <label>Team email addresses<textarea value={form.addresses} rows={3} maxLength={5100} disabled={busy}
        onChange={e=>change("addresses",e.target.value)} aria-describedby="email-recipients-help"/></label>
      <p id="email-recipients-help" className="muted">Up to 20 addresses, separated by new lines or commas. Each person can remove their address here. Changes cancel summaries already waiting; they never repeat one sent today.</p>
      <button type="button" className="btn ghost" disabled={busy} onClick={preview}>Show sample summary</button>
      {sample && <div className="email-sample"><h3>{sample.subject}</h3><pre className="email-body">{sample.text}</pre>
        {active && <label className="email-check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>
          I authorize this summary to be sent daily to these team addresses.</label>}</div>}
      <p className="muted">Content is removed after 30 days and delivery metadata after 90 days. Sending remains subject to pauses and address preferences.</p>
      <button type="submit" className="btn" disabled={busy||!dirty||(active&&(!sample||!ack))}>Save email preferences</button>
    </article>
    {error && <p role="alert" className="err">Couldn't reload preferences. Your changes are still here. {error}</p>}
    {result && <p ref={said} tabIndex={-1} role={result.error?"alert":"status"} className={result.error?"err":"ok"}>{result.text}</p>}
  </form>;
}
