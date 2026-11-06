import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

const STATUS={draft:"Draft",queued:"Queued",sending:"Sending",accepted:"Accepted by Cloudflare",failed:"Failed",unknown:"Unknown result",cancelled:"Cancelled"};
export default function Email() {
  const [box,setBox]=useState("inbound"),[before,setBefore]=useState(null),[revision,setRevision]=useState(0);
  const [data,setData]=useState(null),[error,setError]=useState(null),[selected,setSelected]=useState(null),[result,setResult]=useState(null);
  const said=useRef(null);
  useEffect(()=>{if(result)said.current?.focus();},[result]);
  useEffect(()=>{
    let live=true;setData(null);setError(null);
    api(`/admin/email?box=${box}${before?`&before=${before}`:""}`).then(d=>{if(live)setData(d);},e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[box,before,revision]);
  const chooseBox=value=>{setBox(value);setBefore(null);setSelected(null);setResult(null);};
  const changed=text=>{setSelected(null);setBefore(null);setRevision(n=>n+1);setResult(text);};
  return <section aria-labelledby="email-title">
    <div className="head"><div><h1 id="email-title">Email</h1><p className="muted">Read replies and check sending results.</p></div><a className="btn ghost" href="#/automations">Email preferences</a></div>
    <div className="seg" role="group" aria-label="Email box">
      <button type="button" aria-pressed={box==="inbound"} onClick={()=>chooseBox("inbound")}>Received</button>
      <button type="button" aria-pressed={box==="outbound"} onClick={()=>chooseBox("outbound")}>Outgoing</button>
    </div>
    {result && <p role="status" tabIndex={-1} ref={said} className="ok">{result}</p>}
    <div className="email-layout">
      <div className="email-list">
        {error?<><p role="alert" className="err">Couldn't load email. {error}</p><button type="button" className="btn ghost" onClick={()=>setRevision(n=>n+1)}>Retry loading emails</button></>
          :!data?<p>Loading emails…</p>:data.items.length?<ul>{data.items.map(m=><li key={m.id}>
            <button type="button" aria-current={selected===m.id?"true":undefined} onClick={()=>{setSelected(m.id);setResult(null);}}>
              <span>{m.subject||"Content removed"}</span>
              <small>{m.sender||m.recipient||"Address removed"} · {fmtDate(m.received_at||m.created_at)}</small>
              {box==="outbound" && <span className={`badge ${m.status==="accepted"?"positive":m.status==="unknown"?"attention":"neutral"}`}>{STATUS[m.status]}</span>}
            </button></li>)}</ul>:<div className="card empty"><p>{box==="inbound"?"No received emails yet.":"No outgoing emails yet."}</p>
              <p className="muted">{box==="inbound"?"Replies sent to the app's configured address appear here after Email Routing is connected.":"Enable the daily team summary in Automations after the email service is ready."}</p></div>}
        <div className="inline">
          {data?.next && <button type="button" className="btn ghost sm" onClick={()=>{setBefore(data.next);setSelected(null);}}>Older emails</button>}
          {before && <button type="button" className="btn ghost sm" onClick={()=>{setBefore(null);setSelected(null);}}>Newest emails</button>}
          <button type="button" className="btn ghost sm" onClick={()=>setRevision(n=>n+1)}>Refresh email list</button>
        </div>
      </div>
      {selected && <EmailDetail key={`${box}:${selected}`} box={box} id={selected} onChanged={changed} onOutgoing={id=>{setBox("outbound");setBefore(null);setSelected(id);}}/>}
      {!selected && !!data?.items.length && <p className="muted">Choose an email to read it and review its result.</p>}
    </div>
  </section>;
}

function EmailDetail({box,id,onChanged,onOutgoing}) {
  const [message,setMessage]=useState(null),[error,setError]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const title=useRef(null),said=useRef(null),focused=useRef(false);
  useEffect(()=>{
    let live=true;setError(null);
    api(`/admin/email/${box}/${id}`).then(d=>{if(live)setMessage(d.message);},e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[box,id,revision]);
  useEffect(()=>{if(message&&!focused.current){title.current?.focus();focused.current=true;}},[message]);
  useEffect(()=>{if(result)said.current?.focus();},[result]);
  const act=async(fn,text)=>{setBusy(true);setResult(null);try{await fn();setResult({text});setRevision(n=>n+1);}catch(e){setResult({error:true,text:e.message});}finally{setBusy(false);}};
  const remove=async()=>{
    if(!confirm("Delete this email permanently? A duplicate delivery will not restore it."))return;
    setBusy(true);try{await api(`/admin/email/inbound/${id}`,{method:"DELETE"});onChanged("Email deleted.");}
    catch(e){setResult({error:true,text:e.message});setBusy(false);}
  };
  if(!message)return <article className="card">{error?<><p role="alert" className="err">Couldn't load email. {error}</p><button type="button" className="btn ghost" onClick={()=>setRevision(n=>n+1)}>Retry loading email</button></>:<p>Loading email…</p>}</article>;
  const address=box==="inbound"?message.sender:message.recipient;
  return <article className="card email-detail" aria-labelledby={`email-detail-${box}-${id}`}>
    <h2 id={`email-detail-${box}-${id}`} ref={title} tabIndex={-1}>{message.subject||"Content removed"}</h2>
    <p className="email-address">{box==="inbound"?"From":"To"}: {address||"Address removed"}</p>
    <p className="muted">{fmtDate(message.received_at||message.created_at)}</p>
    {box==="outbound"?<><p>{STATUS[message.status]}</p>
      <p className="muted">Acceptance does not confirm delivery to the recipient's inbox.</p>
      <dl className="kv"><div><dt>Reference</dt><dd>HE-OUT-{message.ref}</dd></div><div><dt>Attempts</dt><dd>{message.attempts}</dd></div>
        {message.message_id&&<div><dt>Cloudflare acceptance ID</dt><dd>{message.message_id}</dd></div>}
        {message.error_code&&<div><dt>Result code</dt><dd>{message.error_code}</dd></div>}</dl>
      {message.status==="unknown" && <p className="warn">The provider may have accepted this email. Check its activity log before contacting the recipient again. This app will not resend it automatically.</p>}
      {message.status==="unknown" && !message.reviewed_at && <button type="button" className="btn" disabled={busy}
        onClick={()=>{if(confirm("Acknowledge that you checked this unknown result? This will not resend the email."))act(()=>api(`/admin/email/outbound/${id}/review`,{method:"POST",body:{acknowledged:true}}),"Unknown result reviewed. No email was resent.");}}>Acknowledge unknown result</button>}
      {message.reviewed_at&&<p className="muted">Reviewed {fmtDate(message.reviewed_at)}.</p>}
    </>:<><p className="muted">Check the sender before acting on this message. A suggested thread does not verify who sent it.</p>
      {message.outbound_id&&<button type="button" className="btn ghost sm" onClick={()=>onOutgoing(message.outbound_id)}>View suggested outgoing thread</button>}
      {message.html_only===1&&<p className="muted">HTML-only message shown as source text. Formatting and remote content are not loaded.</p>}
      {message.attachments>0&&<p className="muted">{message.attachments} attachments were not saved.</p>}
      {message.truncated===1&&<p className="warn">Message truncated to 50,000 characters.</p>}</>}
    {message.text?<pre className="email-body">{message.text}</pre>:<p className="muted">Email content was removed after 30 days or following a deletion request.</p>}
    {error&&<p role="alert" className="err">Couldn't refresh this email. {error}</p>}
    <div className="inline">
      {address&&<button type="button" className="btn ghost sm" disabled={busy} onClick={()=>{
        if(confirm("Stop sending to this address and cancel its pending emails?"))act(()=>api("/admin/email/suppressions",{method:"POST",body:{address}}),"Address suppressed. Pending sending to it is cancelled.");
      }}>Stop sending to this address</button>}
      {box==="inbound"&&<button type="button" className="btn ghost sm danger" disabled={busy} onClick={remove}>Delete email</button>}
    </div>
    {result&&<p ref={said} tabIndex={-1} role={result.error?"alert":"status"} className={result.error?"err":"ok"}>{result.text}</p>}
  </article>;
}
