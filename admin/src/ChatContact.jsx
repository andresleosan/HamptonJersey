import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtAgo, fmtDate } from "./format.js";

// MSG-03: which contact a website chat belongs to. A person links or unlinks it; a contact with the visitor's email or
// phone is only suggested. Shown only when the server sends contact_link (MSG03_CONTACT_LINK_READY, migration 0093).
const who = c => [c.email, c.phone].filter(Boolean).join(" · ");
const record = c => (c.applicant_id ? <a href={`#/applicants/${c.applicant_id}`}>{c.name}</a> : c.name);

export function ChatContact({ chatId, link, onLinked }) {
  const [q, setQ] = useState(""), [found, setFound] = useState(null), [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null), said = useRef(null);
  useEffect(() => { if (msg) said.current?.focus(); }, [msg]);
  const save = async (contact, done) => {
    setBusy(true); setMsg(null);
    try {
      const r = await api(`/admin/chats/${chatId}/contact`, { method: "POST", body: { contact_id: contact?.id ?? null, version: link.version } });
      onLinked(r.contact_link); setFound(null); setQ(""); setMsg({ ok: true, text: done });
    } catch (e) {
      setMsg({ text: e.message });
      if (e.status === 409) await onLinked(null); // the parent reloads the chat: the contact shown now
    } finally { setBusy(false); }
  };
  const find = async e => {
    e.preventDefault();
    if (q.trim().length < 2) { setMsg({ text: "Type at least 2 characters of a name, email or phone." }); return; }
    setBusy(true); setMsg(null);
    try { setFound((await api(`/admin/contacts?q=${encodeURIComponent(q.trim())}`)).contacts); }
    catch (err) { setMsg({ text: err.message }); }
    finally { setBusy(false); }
  };
  const pick = c => <li key={c.id}><span>{record(c)} <span className="muted">{who(c)}</span></span>
    <button type="button" className="btn ghost sm" disabled={busy} onClick={() => save(c, `Chat linked to ${c.name}.`)}>
      Link<span className="sr"> to {c.name}</span></button></li>;
  const linked = link.contact, others = found?.filter(c => c.id !== linked?.id);

  return <section className="card" aria-labelledby={`cc-${chatId}`}>
    <h3 id={`cc-${chatId}`}>Contact</h3>
    {linked ? <div className="inline"><p>Linked to {record(linked)} <span className="muted">{who(linked)}</span></p>
      <button type="button" className="btn ghost sm" disabled={busy} onClick={() => save(null, `Chat unlinked from ${linked.name}.`)}>
        Unlink</button></div>
      : <p className="muted">Not linked to a contact. Nothing is linked automatically.</p>}
    {link.suggestions.length > 0 && <>
      <p>Same email or phone as {link.suggestions.length === 1 ? "this contact" : "these contacts"}. Check it is the same person before linking.</p>
      <ul className="plain-list" aria-label="Suggested contacts">{link.suggestions.map(pick)}</ul></>}
    <form onSubmit={find} className="inline">
      <label>Find a contact<input type="search" value={q} maxLength={100} placeholder="Name, email or phone"
        onChange={e => setQ(e.target.value)} /></label>
      <button type="submit" className="btn ghost sm" disabled={busy}>Search</button>
    </form>
    {/* Always in the page, so the result of each search is announced. */}
    <p role="status" className="muted">{others && (others.length ? `${others.length} ${others.length === 1 ? "contact" : "contacts"} found`
      : "No contact matches. To add one, use Review chat contact.")}</p>
    {others?.length > 0 && <ul className="plain-list" aria-label="Contacts found">{others.map(pick)}</ul>}
    {msg && <p ref={said} tabIndex={-1} role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </section>;
}

const STATUS = { waiting: "Waiting", answered: "Answered", handled: "Handled" };
// The contact's record: its linked website chats. Nothing shows while switched off (the route answers 404).
export function ContactChats({ contactId }) {
  const [chats, setChats] = useState(null);
  useEffect(() => {
    let live = true;
    setChats(null);
    api(`/admin/contacts/${contactId}/chats`).then(d => { if (live) setChats(d.chats); }, () => {});
    return () => { live = false; };
  }, [contactId]);
  if (!chats) return null;
  return <section className="card" aria-labelledby="h-contact-chats">
    <h2 id="h-contact-chats">Website chats</h2>
    {chats.length ? <ul className="plain-list">{chats.map(c => <li key={c.id}>
      <a href={`#/messages?chat=${c.id}`}>Chat started {fmtDate(c.created_at)}</a>
      <span className="muted">{STATUS[c.status]} · last message {fmtAgo(c.last_at)}</span></li>)}</ul>
      : <p className="muted">No website chats linked. Link one from Messages.</p>}
  </section>;
}
