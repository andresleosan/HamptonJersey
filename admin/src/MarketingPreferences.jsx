import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

// PRE-10 (art. 36): the contact's marketing answer per purpose and channel, and the objection the team records when
// the person asks by phone, email, in person or by letter. The panel never records a consent. Shown only when the
// record carries marketing_preferences (PRE10_PURPOSE_READY, migration 0096).
const PURPOSE = { news: "News about homes and the Jersey market", property_alerts: "Property alerts", valuation_offer: "Valuation offers" };
const CHANNEL = { email: "Email", phone: "Phone calls", sms: "Text messages" };
const SOURCE = { phone: "Phone call", email: "Email", in_person: "In person", letter: "Letter" };
const STATE = { granted: "Agreed", objected: "Objected", none: "Not agreed" };
const START = { purpose: "all", channel: "all", source: "" };

export default function MarketingPreferences({ contact, preferences, blocked, busy, onRecorded, onStale }) {
  const [open, setOpen] = useState(false), [choice, setChoice] = useState(START);
  const [pending, setPending] = useState(false), [error, setError] = useState(null);
  const generation = useRef(0), first = useRef(null), opener = useRef(null);
  // A late answer never lands on another contact, after leaving the page or after the session ends.
  useEffect(() => {
    const expired = () => { generation.current++; setPending(false); };
    addEventListener("hs:signed-out", expired);
    return () => { generation.current++; removeEventListener("hs:signed-out", expired); };
  }, []);
  useEffect(() => { generation.current++; setOpen(false); setPending(false); setError(null); setChoice(START); }, [contact.id]);

  const show = () => { setOpen(true); setError(null); requestAnimationFrame(() => first.current?.focus()); };
  const cancel = () => { setOpen(false); setChoice(START); setError(null); requestAnimationFrame(() => opener.current?.focus()); };
  const submit = async e => {
    e.preventDefault();
    if (pending || busy || blocked) return;
    if (!choice.source) { setError("Choose how the objection was received."); return; }
    const g = ++generation.current, contactId = contact.id;
    setPending(true); setError(null);
    try {
      const r = await api(`/admin/contacts/${contactId}/marketing-objection`,
        { method: "POST", body: { updated_at: contact.updated_at, ...choice } });
      if (g !== generation.current || r.contact?.id !== contactId) return;
      setOpen(false); setChoice(START);
      onRecorded(r);
    } catch (err) {
      if (g !== generation.current) return;
      if (err.status === 409) { setOpen(false); onStale(); }
      else setError(err.message);
    } finally { if (g === generation.current) setPending(false); }
  };
  const field = (key, label, options, ref) => <label>{label}
    <select ref={ref} value={choice[key]} disabled={pending} onChange={e => setChoice(c => ({ ...c, [key]: e.target.value }))}>
      {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>;
  const disabled = pending || busy || !!blocked;

  return <>
    <dl className="changes" aria-label="Marketing by purpose and channel">{Object.entries(PURPOSE).map(([p, label]) =>
      <div key={p}><dt>{label}</dt><dd>{Object.entries(CHANNEL).map(([ch, name]) =>
        `${name}: ${STATE[preferences.find(x => x.purpose === p && x.channel === ch)?.state ?? "none"]}`).join(" · ")}</dd></div>)}</dl>
    <p className="muted">Consent is given only on the website. Record here what the person tells you: an objection stops
      that marketing at once.</p>
    {error && <p role="alert" className="err">{error}</p>}
    {open ? <form onSubmit={submit}>
      <div className="inline">
        {field("purpose", "Purpose", [["all", "All marketing"], ...Object.entries(PURPOSE)], first)}
        {field("channel", "Channel", [["all", "All channels"], ...Object.entries(CHANNEL)])}
        {field("source", "How it was received", [["", "Choose…"], ...Object.entries(SOURCE)])}
      </div>
      <div className="inline"><button type="submit" className="btn sm" disabled={disabled}>Record objection</button>
        <button type="button" className="btn ghost sm" disabled={pending} onClick={cancel}>Cancel</button></div>
    </form> : <button ref={opener} type="button" className="btn ghost sm" disabled={disabled} onClick={show}>Record marketing objection</button>}
  </>;
}
