import { useEffect, useState } from "react";
import { api } from "./api.js";

const HELP = "Paste a Matterport, YouTube or Vimeo link. Only use your own tours or ones you have permission for.";

// 3D tours shown next to the booking form on the home page, in this order (visitors can switch between the visible ones).
export default function Tours() {
  const [tours, setTours] = useState(null), [msg, setMsg] = useState(null), [adding, setAdding] = useState(false);
  const load = () => api("/admin/tours").then(d => setTours(d.tours), e => setMsg({ text: e.message }));
  useEffect(() => { load(); }, []);
  const run = async (fn, done) => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: done }); await load(); return true; } catch (e) { setMsg({ text: e.message }); return false; }
  };
  const move = (i, to) => { const ids = tours.map(t => t.id); ids.splice(to, 0, ids.splice(i, 1)[0]);
    return run(() => api("/admin/tours/order", { method: "PUT", body: { ids } }), "Order saved. The home page shows it within a minute."); };
  if (!tours) return msg ? <p role="alert" className="err">{msg.text}</p> : <p>Loading tours…</p>;
  const live = tours.filter(t => t.published).length;

  return <section aria-labelledby="t-tours">
    <div className="head"><div><h1 id="t-tours">3D tours</h1>
      <p className="muted">Shown beside the booking form on the home page{live > 1 ? "; visitors can switch between them" : ""}. {live} visible.</p></div>
      {!adding && <button type="button" className="btn" onClick={() => setAdding(true)}>Add tour</button>}</div>
    {adding && <TourForm onCancel={() => setAdding(false)}
      onSave={body => run(() => api("/admin/tours", { method: "POST", body }), "Tour added.").then(ok => { if (ok) setAdding(false); return ok; })} />}
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {tours.length ? <ol className="tour-list">{tours.map((t, i) => <li key={t.id} className="card">
      <Preview t={t} />
      <div className="tour-body">
        <TourForm key={t.updated_at} t={t} onSave={body => run(() => api(`/admin/tours/${t.id}`, { method: "PUT", body }), "Tour saved.")} />
        <div className="ctl">
          <button type="button" role="switch" className="switch" aria-checked={!!t.published} aria-label={`Visible on the website: ${t.title}`}
            onClick={() => run(() => api(`/admin/tours/${t.id}`, { method: "PUT", body: { published: !t.published } }), t.published ? "Tour hidden." : "Tour visible on the home page.")}>
            <span className="knob" aria-hidden="true" />{t.published ? "Visible" : "Hidden"}</button>
          <span className="spacer" />
          <button type="button" className="nudge" disabled={i === 0} aria-label={`Move ${t.title} up`} onClick={() => move(i, i - 1)}>↑</button>
          <button type="button" className="nudge" disabled={i === tours.length - 1} aria-label={`Move ${t.title} down`} onClick={() => move(i, i + 1)}>↓</button>
          <button type="button" className="btn ghost sm danger" onClick={() => confirm(`Delete "${t.title}"?`)
            && run(() => api(`/admin/tours/${t.id}`, { method: "DELETE" }), "Tour deleted.")}>Delete</button>
        </div>
      </div></li>)}</ol>
      : !adding && <div className="empty card"><p>No 3D tours yet. The booking section shows only the form until you add one.</p>
        <button type="button" className="btn sm" onClick={() => setAdding(true)}>Add tour</button></div>}
  </section>;
}

function TourForm({ t, onSave, onCancel }) {
  const init = { title: t?.title ?? "", url: t?.url ?? "", caption: t?.caption ?? "" };
  const [f, setF] = useState(init), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const dirty = JSON.stringify(f) !== JSON.stringify(init), uid = t?.id ?? "new";
  const submit = async e => { e.preventDefault(); setBusy(true); await onSave(f); setBusy(false); };
  return <form className={t ? "tour-form" : "card tour-form new"} onSubmit={submit} aria-label={t ? `Edit ${t.title}` : "New 3D tour"}>
    {!t && <h2>New 3D tour</h2>}
    <label htmlFor={`tt-${uid}`}>Title</label><input id={`tt-${uid}`} required maxLength={120} value={f.title} onChange={set("title")} autoFocus={!t} placeholder="e.g. 23 Le Bernage walkthrough" />
    <label htmlFor={`tu-${uid}`}>Link</label><input id={`tu-${uid}`} required type="url" maxLength={500} value={f.url} onChange={set("url")} placeholder="https://my.matterport.com/show/?m=…" aria-describedby={`th-${uid}`} />
    <p id={`th-${uid}`} className="muted">{HELP}</p>
    <label htmlFor={`tc-${uid}`}>Caption (optional)</label><input id={`tc-${uid}`} maxLength={300} value={f.caption} onChange={set("caption")} placeholder="One line shown under the tour" />
    {(dirty || !t) && <div className="inline"><button className="btn sm" disabled={busy || !dirty}>{busy ? "Saving…" : t ? "Save changes" : "Add tour"}</button>
      <button type="button" className="btn ghost sm" onClick={() => (t ? setF(init) : onCancel())}>{t ? "Discard" : "Cancel"}</button></div>}
  </form>;
}

// The tour only loads when asked: a Matterport player is heavy.
function Preview({ t }) {
  const [on, setOn] = useState(false);
  return <div className="tour-prev">{on
    ? <iframe src={t.url} title={`Preview: ${t.title}`} allow="fullscreen; xr-spatial-tracking" allowFullScreen />
    : <button type="button" onClick={() => setOn(true)}><span className="play" aria-hidden="true" />Preview<span className="sr"> {t.title}</span></button>}</div>;
}
