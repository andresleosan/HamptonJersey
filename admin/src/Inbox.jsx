import { useCallback, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtAgo, fmtDate } from "./format.js";
import { usePoll } from "./poll.js";

const BOXES = { action: "Needs action", feed: "Feed" };
const CATEGORIES = { "": "All", new_applicant: "New applicants", viewing: "Viewings" };
const KIND = { new_applicant: "New applicant", viewing: "Viewing request" };
const EMPTY = {
  action: { "": "You're all caught up. New applicants and viewing requests that need a reply appear here.",
    new_applicant: "You're all caught up. New applicants from the website appear here.",
    viewing: "You're all caught up. Viewing requests from the website appear here." },
  feed: { "": "Nothing here yet. Notices marked done and updates for your information appear here.",
    new_applicant: "No applicant notices here yet.", viewing: "No viewing request notices here yet." },
};
const isOpen = n => n.action_required === 1 && n.resolved_at == null;
const openLabel = n => (n.entity_type === "viewing" ? "Open viewing requests"
  : n.link.startsWith("#/applicants/new") ? "Add a search for this contact" : "Open applicant");

export default function Inbox({ paused, onCounts }) {
  const [box, setBox] = useState("action"), [cat, setCat] = useState("");
  const [data, setData] = useState(null), [counts, setCounts] = useState({});
  const [sel, setSel] = useState(null), [msg, setMsg] = useState(null), [loadErr, setLoadErr] = useState(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    return api(`/admin/notifications?box=${box}${cat ? `&category=${cat}` : ""}`).then(d => {
      if (n !== seq.current) return; // a newer request (another tab, a later poll) has the fresher answer
      setData(d); setCounts(d.counts); onCounts(d.counts); setLoadErr(null);
      setSel(id => (d.notifications.some(x => x.id === id) ? id : d.notifications[0]?.id ?? null));
    }, e => { if (n === seq.current) setLoadErr(e.message); });
  }, [box, cat, onCounts]);
  // Every 30 s while the tab is visible; stopped while the session has expired.
  usePoll(load, paused ? null : 30000);
  const show = (b, c) => { if (b === box && c === cat) return; setBox(b); setCat(c); setData(null); setSel(null); setMsg(null); setLoadErr(null); };
  const done = async n => {
    setMsg(null);
    try { await api(`/admin/notifications/${n.id}`, { method: "PUT", body: { resolved: true } }); setMsg({ ok: true, text: "Marked as done. It's in the Feed now." }); await load(); }
    catch (e) { setMsg({ text: e.message }); }
  };
  const n = data?.notifications.find(x => x.id === sel);

  return <section aria-labelledby="t-inbox">
    <h1 id="t-inbox">Inbox</h1>
    <div className="inbox-tabs">
      <div className="seg" role="group" aria-label="Notices">{Object.entries(BOXES).map(([k, t]) =>
        <button key={k} type="button" aria-pressed={box === k} onClick={() => show(k, cat)}>{t}{k === "action" && <span className="count">{counts.action ?? ""}</span>}</button>)}</div>
      {/* Counters are what still needs action, so they show in Needs action only. */}
      <div className="seg" role="group" aria-label="Category">{Object.entries(CATEGORIES).map(([k, t]) =>
        <button key={k} type="button" aria-pressed={cat === k} onClick={() => show(box, k)}>{t}{box === "action" && <span className="count">{counts[k || "action"] ?? ""}</span>}</button>)}</div>
    </div>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {loadErr && <p role="alert" className="err">{loadErr}</p>}
    {!data ? !loadErr && <p>Loading notices…</p> : !data.notifications.length ? <p className="empty card">{EMPTY[box][cat]}</p> :
      <div className="inbox">
        <ul className="inbox-list" aria-label={`${BOXES[box]}: ${CATEGORIES[cat]}`}>{data.notifications.map(x => <li key={x.id}>
          <button type="button" aria-current={x.id === sel ? "true" : undefined} className={isOpen(x) ? "unread" : ""} onClick={() => setSel(x.id)}>
            <span className="who">{x.title}</span><time className="muted" dateTime={x.created_at}>{fmtAgo(x.created_at)}</time>
            <span className="what">{KIND[x.category]}</span>{box === "feed" && <span className="muted">{x.resolved_at ? "Done" : "For info"}</span>}
          </button></li>)}</ul>
        {n && <Notice key={n.id} n={n} done={done} />}
      </div>}
  </section>;
}

function Notice({ n, done }) {
  const open = isOpen(n);
  return <article className="card inbox-detail" aria-labelledby="n-title">
    <div className="head"><div><h2 id="n-title">{n.title}</h2><p className="muted">{KIND[n.category]} · {fmtAgo(n.created_at)}</p></div>
      <div className="inline">
        {open && <button type="button" className="btn" onClick={() => done(n)}>Done</button>}
        <a className="btn ghost" href={n.link}>{openLabel(n)}</a>
        {n.phone && <a className="btn ghost" href={`tel:${n.phone}`}>Call</a>}
      </div></div>
    <dl className="kv">
      <div><dt>Received</dt><dd>{fmtDate(n.created_at)}</dd></div>
      {n.phone && <div><dt>Phone</dt><dd className="num">{n.phone}</dd></div>}
      <div><dt>Status</dt><dd>{open ? "Needs action" : n.resolved_at ? `Done ${fmtAgo(n.resolved_at)}` : "For your information"}</dd></div>
    </dl>
  </article>;
}
