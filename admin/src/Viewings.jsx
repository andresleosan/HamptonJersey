import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

const TABS = { new: "New", contacted: "Contacted", closed: "Closed" };
const EMPTY = { new: "You're all caught up. New requests from the website appear here.",
  contacted: "No requests waiting on a reply.", closed: "No closed requests yet." };
const listingOf = v => v.listing_title || v.listing_ref || "General enquiry / valuation";

export default function Viewings() {
  const [status, setStatus] = useState("new"), [data, setData] = useState(null), [counts, setCounts] = useState({});
  const [sel, setSel] = useState(null), [msg, setMsg] = useState(null);
  const load = () => api(`/admin/viewings?status=${status}`).then(d => {
    setData(d); setCounts(d.counts);
    setSel(id => (d.viewings.some(v => v.id === id) ? id : d.viewings[0]?.id ?? null));
  }, e => setMsg(e.message));
  useEffect(() => { setData(null); setSel(null); setMsg(null); load(); }, [status]);
  const save = async (v, body, done) => {
    setMsg(null);
    try { await api(`/admin/viewings/${v.id}`, { method: "PUT", body }); setMsg({ ok: true, text: done }); await load(); }
    catch (e) { setMsg({ text: e.message }); }
  };
  const remove = async v => {
    if (!confirm(`Delete the request from ${v.name}? This can't be undone.`)) return;
    try { await api(`/admin/viewings/${v.id}`, { method: "DELETE" }); setMsg({ ok: true, text: "Request deleted." }); await load(); }
    catch (e) { setMsg({ text: e.message }); }
  };
  const v = data?.viewings.find(x => x.id === sel);

  return <section aria-labelledby="t-views">
    <h1 id="t-views">Viewing requests</h1>
    <div className="seg" role="group" aria-label="Status">{Object.entries(TABS).map(([k, t]) =>
      <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}>{t}<span className="count">{counts[k] ?? ""}</span></button>)}</div>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text ?? msg}</p>}
    {!data ? <p>Loading…</p> : !data.viewings.length ? <p className="empty card">{EMPTY[status]}</p> :
      <div className="inbox">
        <ul className="inbox-list" aria-label={`${TABS[status]} requests`}>{data.viewings.map(x => <li key={x.id}>
          <button type="button" aria-current={x.id === sel ? "true" : undefined} className={x.status === "new" ? "unread" : ""} onClick={() => setSel(x.id)}>
            <span className="who">{x.name}</span><span className="muted">{fmtDate(x.created_at)}</span>
            <span className="what">{listingOf(x)}</span><span className="muted num">{x.date} · {x.time}</span>
          </button></li>)}</ul>
        {v && <Detail key={v.id} v={v} save={save} remove={remove} />}
      </div>}
  </section>;
}

function Detail({ v, save, remove }) {
  const [notes, setNotes] = useState(v.notes ?? "");
  // A status change moves the request to another tab; typed notes go with it instead of being lost.
  const status = (s, done) => save(v, notes.trim() === (v.notes ?? "") ? { status: s } : { status: s, notes }, done);
  const subject = encodeURIComponent(`Your viewing request: ${listingOf(v)}`);
  return <article className="card inbox-detail" aria-labelledby="v-name">
    <div className="head"><div><h2 id="v-name">{v.name}</h2><p className="muted">Received {fmtDate(v.created_at)}</p></div>
      <div className="inline">
        {v.status === "new" && <button type="button" className="btn" onClick={() => status("contacted", "Marked as contacted.")}>Mark contacted</button>}
        {v.status !== "closed" && <button type="button" className="btn ghost" onClick={() => status("closed", "Request closed.")}>Close request</button>}
        {v.status === "closed" && <button type="button" className="btn ghost" onClick={() => status("new", "Request reopened.")}>Reopen</button>}
      </div></div>
    <dl className="kv">
      <div><dt>Listing</dt><dd>{v.listing_id ? <a href={`#/p/${v.listing_id}`}>{listingOf(v)}</a>
        : v.listing_ref ? <>{listingOf(v)} <span className="muted">({v.listing_ref}, listing deleted)</span></> : listingOf(v)}</dd></div>
      <div><dt>Requested slot</dt><dd className="num">{v.date} · {v.time}</dd></div>
      <div><dt>Viewing</dt><dd>{v.kind}{v.agent ? ` · with ${v.agent}` : ""}</dd></div>
      <div><dt>Email</dt><dd><a href={`mailto:${v.email}?subject=${subject}`}>{v.email}</a></dd></div>
      {v.phone && <div><dt>Phone</dt><dd><a href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}>{v.phone}</a></dd></div>}
    </dl>
    <div className="inline"><a className="btn ghost sm" href={`mailto:${v.email}?subject=${subject}`}>Reply by email</a>
      {v.phone && <a className="btn ghost sm" href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}>Call</a>}</div>
    <div className="field"><label htmlFor="v-notes">Internal notes (only staff see these)</label>
      <textarea id="v-notes" value={notes} maxLength={4000} onChange={e => setNotes(e.target.value)} placeholder="e.g. Called on Tuesday, prefers Saturday morning" />
      <div className="inline"><button type="button" className="btn sm" disabled={notes.trim() === (v.notes ?? "")}
        onClick={() => save(v, { notes }, "Notes saved.")}>Save notes</button></div></div>
    <details className="more"><summary>More</summary>
      <button type="button" className="btn ghost sm danger" onClick={() => remove(v)}>Delete request</button></details>
  </article>;
}
