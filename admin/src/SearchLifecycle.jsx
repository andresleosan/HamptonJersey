import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";
import { SEARCH_STATES } from "../../server/applicants.js";

const LABEL = Object.fromEntries(SEARCH_STATES);

export default function SearchLifecycle({ applicant: a, dirty, busy, onChanged, onReload, onEditing, nameOf }) {
  const [action, setAction] = useState(null), [reason, setReason] = useState("");
  const [working, setWorking] = useState(false), [message, setMessage] = useState(null), [invalid, setInvalid] = useState(false);
  const input = useRef(null), summary = useRef(null), refocus = useRef(false), trigger = useRef(null);
  useEffect(() => { if (action) input.current?.focus(); }, [action]);
  useEffect(() => { onEditing(Boolean(action)); }, [action, onEditing]);
  useEffect(() => { if (refocus.current) { summary.current?.focus(); refocus.current = false; } }, [message]);
  const disabled = dirty || busy || working;
  const start = (state, e) => { trigger.current = e.currentTarget; setAction(state); setReason(""); setInvalid(false); setMessage(null); };
  const cancel = () => { setAction(null); setReason(""); setInvalid(false); trigger.current?.focus(); };
  const reload = async () => {
    setWorking(true);
    try { await onReload(); setMessage(null); }
    catch (err) { setMessage({ text: err.message, reload: true }); }
    finally { setWorking(false); }
  };
  const submit = async e => {
    e.preventDefault();
    if (disabled) return;
    if (!reason.trim() || reason.trim().length > 200) { setInvalid(true); input.current?.focus(); return; }
    setWorking(true); setMessage(null); setInvalid(false);
    let saved = false;
    const text = action === "resolved" ? "Search resolved. Its history is kept." : "Search is active again.";
    try {
      const { applicant } = await api(`/admin/applicants/${a.id}/search`, { method: "POST",
        body: { state: action, reason: reason.trim(), updated_at: a.updated_at } });
      saved = true; setAction(null); setReason("");
      await onChanged(applicant);
      refocus.current = true; setMessage({ ok: true, text });
    } catch (err) {
      if (err.data?.fields?.reason) { setInvalid(true); input.current?.focus(); }
      refocus.current = saved;
      setMessage({ text: saved ? `${text} Couldn't refresh the record. Reload to see it.` : err.message,
        reload: saved || err.status === 409 });
    } finally { setWorking(false); }
  };
  return <section className="search-lifecycle" aria-labelledby="search-heading">
    <div className="inline"><h2 id="search-heading" ref={summary} tabIndex={-1}>Search</h2>
      <span className={`badge ${a.search_state === "active" ? "active" : a.search_state === "resolved" ? "positive" : "attention"}`}>{LABEL[a.search_state]}</span></div>
    {a.search_state === "active" ? <p className="muted">Searching continues through viewings, offers and stage changes. Resolve it when the client has found a property.</p>
      : a.search_state === "needs_review" ? <p className="muted">This older search needs a decision from the team. Its history is kept and no new matches are proposed until you confirm it is active.</p>
      : <p className="muted">Resolved {fmtDate(a.resolved_at)} by {nameOf(a.resolved_by)}. {a.resolution_reason}</p>}
    {dirty && <p className="muted">Save or discard your changes before changing the search status.</p>}
    {!action && <div className="inline">
      {a.search_state !== "resolved" && <button type="button" className="btn ghost sm" disabled={disabled}
        onClick={e => start("resolved", e)}>Resolve search</button>}
      {a.search_state !== "active" && !a.archived_at && <button type="button" className="btn ghost sm" disabled={disabled}
        onClick={e => start("active", e)}>{a.search_state === "needs_review" ? "Confirm still searching" : "Reopen search"}</button>}
      {a.archived_at && a.search_state !== "active" && <p className="muted">Restore this record before making the search active.</p>}
    </div>}
    {action && <form className="search-decision" noValidate onSubmit={submit}>
      <p>{action === "resolved" ? "Confirm that the client has found a property. New matches stop for this search; other searches continue."
        : "Confirm that this client is looking for a property again. The saved criteria will be used."}</p>
      <label htmlFor="search-reason">{action === "resolved" ? "Resolution reason" : "Reason for making the search active"}
        <input id="search-reason" ref={input} value={reason} maxLength={200} disabled={working} required
          aria-invalid={invalid || undefined} aria-describedby={invalid ? "search-reason-error" : "search-reason-help"}
          onChange={e => { setReason(e.target.value); setInvalid(false); }} /></label>
      {invalid ? <small id="search-reason-error" className="err">Enter a reason from 1 to 200 characters.</small>
        : <small id="search-reason-help" className="muted">Recorded in this search's timeline.</small>}
      <div className="inline"><button className="btn sm" disabled={disabled}>{working ? "Saving…" : action === "resolved" ? "Confirm resolution" : "Confirm active search"}</button>
        <button type="button" className="btn ghost sm" disabled={working} onClick={cancel}>Cancel</button></div>
    </form>}
    {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "ok" : "err"}>{message.text}
      {message.reload && <> <button type="button" className="btn ghost sm" disabled={working} onClick={reload}>Reload search</button></>}</p>}
  </section>;
}
