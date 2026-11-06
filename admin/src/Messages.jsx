import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtAgo, fmtDate } from "./format.js";
import { usePoll } from "./poll.js";
import { TEAM_MAX } from "../../server/chat.js";

// MSG-02 (spec 2026-11-06): the website's chats. Waiting ones first, oldest wait first; a person replies, marks it
// handled or deletes it. The visitor sees a reply while the chat is open on their device, for 7 days (C5).
const TABS = { waiting: "Waiting", answered: "Answered", handled: "Handled", all: "All" };
const STATUS = { waiting: ["Waiting", "attention"], answered: ["Answered", "active"], handled: ["Handled", "neutral"] };
const EMPTY = {
  waiting: "No chats are waiting. New messages from the website appear here.",
  answered: "No answered chats. A chat moves here when someone replies, until the visitor writes again.",
  handled: "No handled chats yet.",
  all: "No chats yet. They appear here once the web chat is on in Settings, Automations.",
};
// C14: whether to reply in the chat or call.
const seen = iso => !iso ? "Not seen on the website since their first message"
  : Date.now() - Date.parse(iso) < 60e3 ? "Visitor on the website now" : `Last on the website ${fmtAgo(iso)}`;

export default function Messages({ paused, onChange }) {
  const [tab, setTab] = useState("waiting"), [data, setData] = useState(null), [sel, setSel] = useState(null);
  const [loadErr, setLoadErr] = useState(null), [note, setNote] = useState(null), seq = useRef(0), noteRef = useRef(null);
  // A poll keeps the chat on screen even when it left this tab (a colleague replied): a reply being typed is never
  // swapped for another chat. After your own action, or with none selected, the first one in the list.
  const load = useCallback(next => {
    const n = ++seq.current;
    return api(`/admin/chats?status=${tab}`).then(d => {
      if (n !== seq.current) return;
      setData(d); setLoadErr(null);
      setSel(id => (id != null && (next !== true || d.chats.some(c => c.id === id)) ? id : d.chats[0]?.id ?? null));
    }, e => { if (n === seq.current) setLoadErr(e.message); });
  }, [tab]);
  usePoll(load, paused ? null : 30000);
  const show = t => { if (t !== tab) { setTab(t); setData(null); setSel(null); setNote(null); } };
  // After an action: the list and the bar's counter again. What happened is said above the list, since the chat may
  // leave it (a reply moves it from Waiting to Answered); the focus goes there.
  const changed = useCallback(async text => { await load(true); onChange?.(); setNote(text); }, [load, onChange]);
  const gone = useCallback(async () => { setSel(null); await changed("Chat deleted."); }, [changed]);
  useEffect(() => { if (note) noteRef.current?.focus(); }, [note]);

  return <section aria-labelledby="t-msg">
    <div className="head"><div><h1 id="t-msg">Messages</h1>
      <p className="muted">Chats from the website. A person replies to every one.</p></div></div>
    <div className="seg" role="group" aria-label="Chats">{Object.entries(TABS).map(([k, t]) =>
      <button key={k} type="button" aria-pressed={tab === k} onClick={() => show(k)}>{t}
        {k !== "all" && data && <span className="count">{data.counts[k]}</span>}</button>)}</div>
    {note && <p ref={noteRef} tabIndex={-1} role="status" className="ok">{note}</p>}
    {loadErr && <p role="alert" className="err">{loadErr}</p>}
    {!data ? !loadErr && <p>Loading chats…</p> : !data.chats.length && !sel ? <p className="empty card">{EMPTY[tab]}</p> :
      <div className="inbox">
        {!data.chats.length ? <p className="empty card">{EMPTY[tab]}</p> :
        <ul className="inbox-list" aria-label={`Chats: ${TABS[tab]}`}>{data.chats.map(c => <li key={c.id}>
          <button type="button" aria-current={c.id === sel ? "true" : undefined} className={c.status === "waiting" ? "unread" : ""}
            onClick={() => setSel(c.id)}>
            <span className="who">{c.name}</span>
            <time className="muted" dateTime={c.waiting_since ?? c.last_at}>{c.status === "waiting" ? `waiting ${fmtAgo(c.waiting_since)}` : fmtAgo(c.last_at)}</time>
            <span className="what">{c.last_text}</span>
            <span className="muted">{c.listing_title ?? (tab === "all" ? STATUS[c.status][0] : "")}</span>
          </button></li>)}</ul>}
        {sel && <Chat key={sel} id={sel} paused={paused} onChanged={changed} onGone={gone} />}
      </div>}
  </section>;
}

function Chat({ id, paused, onChanged, onGone }) {
  const [d, setD] = useState(null), [err, setErr] = useState(null), [msg, setMsg] = useState(null);
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), said = useRef(null), log = useRef(null);
  const last = d?.messages.at(-1)?.id;
  // The newest message, the one being answered, in view when the chat opens and when one arrives.
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [last]);
  const load = useCallback(() => api(`/admin/chats/${id}`).then(x => { setD(x); setErr(null); },
    e => (e.status === 404 ? onGone() : setErr(e.message))), [id, onGone]);
  usePoll(load, paused ? null : 10000);
  useEffect(() => { if (msg) said.current?.focus(); }, [msg]); // errors only: what went well is said by Messages
  const act = async (fn, done) => {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); await onChanged(done); return true; }
    catch (e) { if (e.status === 404) onGone(); else setMsg({ text: e.message }); return false; }
    finally { setBusy(false); }
  };
  const send = async e => {
    e.preventDefault();
    if (await act(() => api(`/admin/chats/${id}/reply`, { method: "POST", body: { text } }),
      `Reply sent to ${d.chat.name}. They see it in the chat on the website while it is open on their device.`)) setText("");
  };
  // C7: with what this screen shows; if the visitor wrote since, the new message appears instead (409).
  const handled = async () => {
    if (!(await act(() => api(`/admin/chats/${id}/handled`, { method: "POST", body: { last: d.messages.at(-1)?.id ?? 0 } }),
      `Chat with ${d.chat.name} marked as handled.`))) load();
  };
  const remove = async () => {
    if (!confirm("Delete this chat and all its messages? This can't be undone.")) return;
    setBusy(true);
    try { await api(`/admin/chats/${id}`, { method: "DELETE" }); await onGone(); }
    catch (e) { if (e.status === 404) onGone(); else { setMsg({ text: e.message }); setBusy(false); } }
  };
  if (!d) return err ? <p role="alert" className="err">{err}</p> : <p>Loading chat…</p>;
  const c = d.chat, tel = /^\+\d{8,15}$/.test(c.phone ?? "") ? c.phone : null, [label, tone] = STATUS[c.status];

  return <article className="card inbox-detail" aria-labelledby="c-title">
    <div className="head"><div>
      <h2 id="c-title">{c.name} <span className={`badge ${tone}`}>{label}</span></h2>
      <p className="muted">{seen(c.visitor_seen_at)} · started {fmtDate(c.created_at)}</p>
      {c.listing && <p>About <a href={`#/p/${encodeURIComponent(c.listing.id)}`}>{c.listing.id} {c.listing.title}</a></p>}
    </div>
      <div className="inline">
        {tel && <a className="btn ghost sm" href={`tel:${tel}`}>Call</a>}
        {tel && <a className="btn ghost sm" href={`https://wa.me/${tel.slice(1)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        {c.email && <a className="btn ghost sm" href={`mailto:${c.email}`}>Email</a>}
      </div></div>
    <dl className="kv">
      {c.email && <div><dt>Email</dt><dd>{c.email}</dd></div>}
      {c.phone && <div><dt>Phone</dt><dd className="num">{c.phone}</dd></div>}
      {c.status === "handled" && <div><dt>Handled</dt><dd>{fmtDate(c.handled_at)} by {c.handled_by}</dd></div>}
    </dl>
    {err && <p role="alert" className="err">Couldn't refresh; what you see may be out of date. {err}</p>}
    <ol ref={log} tabIndex={0} className="chat-log" aria-label="Conversation">{d.messages.map(m => <li key={m.id} className={m.role}>
      <p className="muted"><b>{m.role === "team" ? m.from : c.name}</b>{m.role === "team" && m.sent_by && ` (${m.sent_by})`}
        {" · "}<time dateTime={m.at}>{fmtDate(m.at)}</time></p>
      <p className="text">{m.text}</p></li>)}</ol>
    <form onSubmit={send} className="chat-reply">
      <label>Reply<textarea value={text} maxLength={TEAM_MAX} rows={4} onChange={e => setText(e.target.value)}
        aria-describedby="c-left" /></label>
      <small id="c-left" className="muted">{TEAM_MAX - text.length} characters left. Plain text only; links are not clickable for the visitor.</small>
      <div className="inline">
        <button type="submit" className="btn" disabled={busy || !text.trim()}>Send reply</button>
        {c.status !== "handled" && <button type="button" className="btn ghost" disabled={busy} onClick={handled}>Mark handled</button>}
      </div>
    </form>
    {msg && <p ref={said} tabIndex={-1} role="alert" className="err">{msg.text}</p>}
    <details className="more"><summary>More</summary><div className="inline">
      <button type="button" className="btn ghost sm danger" disabled={busy} onClick={remove}>Delete chat</button></div></details>
  </article>;
}
