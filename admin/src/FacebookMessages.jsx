import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtAgo, fmtDate } from "./format.js";
import { usePoll } from "./poll.js";
import { TEAM_MAX } from "../../server/chat.js";
import { ChatContact } from "./ChatContact.jsx";

// MSG-01: messages to Hampton's Facebook page. A person reads and replies; nothing is sent on its own. Sending is a
// switch of its own (META_SEND_READY): off, the screen says so and the reply box stays for when it is on.
const TABS = { waiting: "Waiting", answered: "Answered", handled: "Handled", all: "All" };
const STATUS = { waiting: ["Waiting", "attention"], answered: ["Answered", "active"], handled: ["Handled", "neutral"] };
const EMPTY = {
  waiting: "No Facebook messages are waiting. Messages to Hampton's Facebook page appear here.",
  answered: "No answered conversations. One moves here when someone replies, until the person writes again.",
  handled: "No handled conversations yet.",
  all: "No Facebook messages yet.",
};
const OUT = { sending: "Sending…", failed: "Not sent", unknown: "May not have been sent: check on Facebook" };
// Facebook gives a page-scoped number, not a name: the linked contact's name, else the number's last digits.
const who = c => c.contact_name ?? `Facebook user …${String(c.external_user_id).slice(-4)}`;

export default function FacebookMessages({ paused, onChange, channels }) {
  const [tab, setTab] = useState("waiting"), [data, setData] = useState(null), [sel, setSel] = useState(null);
  const [loadErr, setLoadErr] = useState(null), [note, setNote] = useState(null), seq = useRef(0), noteRef = useRef(null);
  const load = useCallback(next => {
    const n = ++seq.current;
    return api(`/admin/facebook?status=${tab}`).then(d => {
      if (n !== seq.current) return;
      setData(d); setLoadErr(null);
      setSel(id => (id != null && (next !== true || d.conversations.some(c => c.id === id)) ? id : d.conversations[0]?.id ?? null));
    }, e => { if (n === seq.current) setLoadErr(e.message); });
  }, [tab]);
  usePoll(load, paused ? null : 30000);
  const show = t => { if (t !== tab) { setTab(t); setData(null); setSel(null); setNote(null); } };
  const changed = useCallback(async text => { await load(true); onChange?.(); setNote(text); }, [load, onChange]);
  const gone = useCallback(async () => { setSel(null); await changed("Conversation deleted from Hampton. It is still on Facebook."); }, [changed]);
  useEffect(() => { if (note) noteRef.current?.focus(); }, [note]);

  return <section aria-labelledby="t-msg">
    <div className="head"><div><h1 id="t-msg">Messages</h1>
      <p className="muted">Messages to Hampton's Facebook page. A person replies to every one.</p></div></div>
    {channels}
    <div className="seg" role="group" aria-label="Facebook conversations">{Object.entries(TABS).map(([k, t]) =>
      <button key={k} type="button" aria-pressed={tab === k} onClick={() => show(k)}>{t}
        {k !== "all" && data && <span className="count">{data.counts[k]}</span>}</button>)}</div>
    {note && <p ref={noteRef} tabIndex={-1} role="status" className="ok">{note}</p>}
    {loadErr && <p role="alert" className="err">{loadErr}</p>}
    {!data ? !loadErr && <p>Loading conversations…</p> : !data.conversations.length && !sel ? <p className="empty card">{EMPTY[tab]}</p> :
      <div className="inbox">
        {!data.conversations.length ? <p className="empty card">{EMPTY[tab]}</p> :
        <ul className="inbox-list" aria-label={`Facebook conversations: ${TABS[tab]}`}>{data.conversations.map(c => <li key={c.id}>
          <button type="button" aria-current={c.id === sel ? "true" : undefined} className={c.status === "waiting" ? "unread" : ""}
            onClick={() => setSel(c.id)}>
            <span className="who">{who(c)}</span>
            <time className="muted" dateTime={c.waiting_since ?? c.last_at}>{c.status === "waiting" ? `waiting ${fmtAgo(c.waiting_since)}` : fmtAgo(c.last_at)}</time>
            <span className="what">{c.last_text}</span>
            <span className="muted">{tab === "all" ? STATUS[c.status][0] : ""}</span>
          </button></li>)}</ul>}
        {sel && <Conversation key={sel} id={sel} paused={paused} onChanged={changed} onGone={gone} />}
      </div>}
  </section>;
}

function Conversation({ id, paused, onChanged, onGone }) {
  const [d, setD] = useState(null), [err, setErr] = useState(null), [msg, setMsg] = useState(null);
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), said = useRef(null), log = useRef(null);
  const last = d?.messages.at(-1)?.id;
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [last]);
  const load = useCallback(() => api(`/admin/facebook/${id}`).then(x => { setD(x); setErr(null); },
    e => (e.status === 404 ? onGone() : setErr(e.message))), [id, onGone]);
  usePoll(load, paused ? null : 10000);
  useEffect(() => { if (msg) said.current?.focus(); }, [msg]);
  const act = async (fn, done) => {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); await onChanged(done); return true; }
    catch (e) { if (e.status === 404) onGone(); else { setMsg({ text: e.message }); await load(); } return false; }
    finally { setBusy(false); }
  };
  const send = async e => {
    e.preventDefault();
    if (await act(() => api(`/admin/facebook/${id}/reply`, { method: "POST", body: { text } }), "Reply sent on Facebook.")) setText("");
  };
  const handled = () => act(() => api(`/admin/facebook/${id}/handled`, { method: "POST", body: { last: d.messages.at(-1)?.id ?? 0 } }),
    "Conversation marked as handled.");
  const remove = async () => {
    if (!confirm("Delete this conversation from Hampton? It stays on Facebook. This can't be undone.")) return;
    setBusy(true);
    try { await api(`/admin/facebook/${id}`, { method: "DELETE" }); await onGone(); }
    catch (e) { if (e.status === 404) onGone(); else { setMsg({ text: e.message }); setBusy(false); } }
  };
  if (!d) return err ? <p role="alert" className="err">{err}</p> : <p>Loading conversation…</p>;
  const c = d.conversation, s = d.send, [label, tone] = STATUS[c.status];
  const name = d.contact_link?.contact?.name ?? `Facebook user …${String(c.external_user_id).slice(-4)}`;
  // Why Send is not available, in the order the server checks it.
  const blocked = !s.on ? "Sending replies to Facebook is off. Nothing you write here is sent; answer from Facebook's Page inbox for now."
    : s.paused ? "Sending is paused (Pause all outbound). Resume sending in Automations to reply."
    : !s.window_open ? "More than 24 hours have passed since their last message, so Facebook does not allow a reply. Contact them another way, or reply when they write again."
    : null;

  return <article className="card inbox-detail" aria-labelledby="f-title">
    <div className="head"><div>
      <h2 id="f-title">{name} <span className={`badge ${tone}`}>{label}</span></h2>
      <p className="muted">Facebook Messenger · started {fmtDate(c.created_at)}
        {s.window_open && <> · reply by <time dateTime={s.window_ends_at}>{fmtDate(s.window_ends_at)}</time></>}</p>
    </div></div>
    {c.status === "handled" && <dl className="kv"><div><dt>Handled</dt><dd>{fmtDate(c.handled_at)} by {c.handled_by}</dd></div></dl>}
    {d.contact_link && <ChatContact chatId={id} link={d.contact_link} path={`/admin/facebook/${id}/contact`} action="Applicants, New"
      onLinked={link => (link ? setD(x => ({ ...x, contact_link: link })) : load())} />}
    {err && <p role="alert" className="err">Couldn't refresh; what you see may be out of date. {err}</p>}
    <ol ref={log} tabIndex={0} className="chat-log" aria-label="Conversation">{d.messages.map(m => <li key={m.id} className={m.direction === "in" ? "visitor" : "team"}>
      <p className="muted"><b>{m.direction === "in" ? name : m.name ?? "Hampton Estates"}</b>{m.direction === "out" && m.sent_by && ` (${m.sent_by})`}
        {" · "}<time dateTime={m.sent_at}>{fmtDate(m.sent_at)}</time>
        {m.direction === "out" && OUT[m.status] && <> · <span className={m.status === "sending" ? "" : "err"}>{OUT[m.status]}</span></>}</p>
      <p className="text">{m.text}</p></li>)}</ol>
    <form onSubmit={send} className="chat-reply">
      {blocked && <p className="warn" id="f-blocked">{blocked}</p>}
      <label>Reply<textarea value={text} maxLength={TEAM_MAX} rows={4} onChange={e => setText(e.target.value)}
        aria-describedby={blocked ? "f-left f-blocked" : "f-left"} /></label>
      <small id="f-left" className="muted">{TEAM_MAX - text.length} characters left. Plain text; sent from Hampton's Facebook page.</small>
      <div className="inline">
        <button type="submit" className="btn" disabled={busy || !text.trim() || !!blocked}>Send reply</button>
        {c.status !== "handled" && <button type="button" className="btn ghost" disabled={busy} onClick={handled}>Mark handled</button>}
      </div>
    </form>
    {msg && <p ref={said} tabIndex={-1} role="alert" className="err">{msg.text}</p>}
    <details className="more"><summary>More</summary><div className="inline">
      <button type="button" className="btn ghost sm danger" disabled={busy} onClick={remove}>Delete from Hampton</button></div></details>
  </article>;
}
