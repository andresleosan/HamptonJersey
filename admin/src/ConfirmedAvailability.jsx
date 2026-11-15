import { useEffect, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, fmtDate } from "./format.js";

// EST-16: what the listing says, what a person was told and where each comes from, as three separate things. For
// staff only. Everything here stays empty until the server reports enabled (EST16_AVAILABILITY_READY and migration 0072).
export const CONFIRMATION = { available: ["positive", "Available"], unavailable: ["neutral", "Not available"], unknown: ["neutral", "Unknown"] };
const SOURCE = { owner: "Owner", agency: "Agency", other: "Other" };
const CHANNEL = { phone: "Phone", email: "Email", in_person: "In person", message: "Message" };
const ONLY = { sale: "Only its sale", rent: "Only its letting", business: "Only its business offer" };
// When it was said, who said it and how, and who wrote it down.
export const provenance = c => `${fmtDate(c.confirmed_at)} · ${SOURCE[c.source] ?? c.source} by ${(CHANNEL[c.channel] ?? c.channel).toLowerCase()} · recorded by ${c.recorded_by}`;
export const DISAGREE = "Two confirmations of the same moment disagree";
const path = id => `/admin/listings/${encodeURIComponent(id)}/availability`;
// This minute in the browser's own time zone, as a datetime-local input takes it.
const localNow = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const blank = () => ({ status: "", confirmed_at: localNow(), source: "", channel: "", scope: "property", evidence_ref: "" });

// The listing editor's card. listing: the saved one (its status and operation are read from it, never copied).
export default function ConfirmedAvailability({ listingId, listing }) {
  const [data, setData] = useState(null), [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({}), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null); setForm(blank()); setErrors({}); setMsg(null);
    api(path(listingId)).then(d => { if (live) setData(d.enabled ? d : null); }, () => {});
    return () => { live = false; };
  }, [listingId, listing.operation]); // a confirmation about one operation says nothing of another
  if (!data) return null;

  const set = k => e => { setForm(f => ({ ...f, [k]: e.target.value })); setErrors(({ [k]: _, ...x }) => x); setMsg(null); };
  const invalid = k => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `e-ca-${k}` : undefined });
  const error = k => errors[k] && <small id={`e-ca-${k}`} className="err">{errors[k]}</small>;
  const options = map => Object.entries(map).map(([k, t]) => <option key={k} value={k}>{Array.isArray(t) ? t[1] : t}</option>);
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    const at = new Date(form.confirmed_at);
    try {
      const saved = await api(path(listingId), { method: "POST", body: { ...form, confirmed_at: Number.isFinite(at.getTime()) ? at.toISOString() : "" } });
      setData(saved.enabled ? saved : null); setForm(blank()); setErrors({});
      setMsg({ ok: true, text: "Confirmation recorded. The listing's own status was not changed." });
    } catch (err) { setErrors(err.data?.fields ?? {}); setMsg({ text: err.message }); }
    finally { setBusy(false); }
  };
  const c = data.current, said = c && !c.needs_review;
  const covers = h => ` · ${h.operation ? ONLY[h.operation] ?? h.operation : "Whole property"}`;

  return <section id="s-availability" className="card fields-group" aria-labelledby="h-confirmed-availability">
    <h2 id="h-confirmed-availability">Confirmed availability <span className="muted">(internal)</span></h2>
    <p className="muted">For staff only: never shown on the website. What the listing says and what someone confirmed are kept apart:
      recording a confirmation never changes the listing's status, and changing the status confirms nothing.</p>
    <dl className="kv">
      <div><dt>Published status</dt>
        <dd>{listing.archived_at ? "Archived · " : ""}{AVAILABILITY[listing.availability] ?? listing.availability}
          <span className="muted"> · Source: this listing's own Availability field</span></dd></div>
      <div><dt>Confirmed availability</dt>
        <dd>{said ? <><span className={`badge ${CONFIRMATION[c.status][0]}`}>{CONFIRMATION[c.status][1]}</span>{` · ${provenance(c)}${covers(c)}`}</>
          : <><span className="badge neutral">Not confirmed</span>
            {c?.needs_review && <span className="muted"> · {DISAGREE}: check and record a new one.</span>}</>}</dd></div>
    </dl>
    <form className="fields-group" onSubmit={submit} aria-labelledby="h-confirm-availability" noValidate>
      <h3 id="h-confirm-availability">Confirm availability</h3>
      <div className="grid2">
        <label>What was confirmed<select value={form.status} onChange={set("status")} {...invalid("status")}>
          <option value="">Choose…</option>{options(CONFIRMATION)}</select>{error("status")}</label>
        <label>Confirmed on (your time zone)<input type="datetime-local" value={form.confirmed_at} max={localNow()}
          onChange={set("confirmed_at")} {...invalid("confirmed_at")} />{error("confirmed_at")}</label>
        <label>Who confirmed it<select value={form.source} onChange={set("source")} {...invalid("source")}>
          <option value="">Choose…</option>{options(SOURCE)}</select>{error("source")}</label>
        <label>How it was confirmed<select value={form.channel} onChange={set("channel")} {...invalid("channel")}>
          <option value="">Choose…</option>{options(CHANNEL)}</select>{error("channel")}</label>
        <label>It covers<select value={form.scope} onChange={set("scope")} {...invalid("scope")}>
          <option value="property">The whole property</option>
          <option value="operation">{ONLY[listing.operation] ?? "Only this operation"}</option></select>{error("scope")}</label>
      </div>
      <label>Evidence reference<input value={form.evidence_ref} maxLength={300} autoComplete="off"
        placeholder="e.g. Call note of 14 Nov in the owner's file" onChange={set("evidence_ref")} {...invalid("evidence_ref")} />{error("evidence_ref")}</label>
      <p className="muted">Say where the proof is kept; do not paste a message or personal details here. A confirmation is added to the
        history, never changed, and stays in force until a newer one is recorded.</p>
      <div className="inline"><button className="btn">{busy ? "Recording…" : "Record confirmation"}</button></div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    </form>
    <h3 id="h-availability-history">Confirmation history <span className="muted">({data.history.length})</span></h3>
    {data.history.length ? <ul className="confirmations" aria-labelledby="h-availability-history">{data.history.map(h => <li key={h.id}>
      <span className={`badge ${CONFIRMATION[h.status]?.[0] ?? "neutral"}`}>{CONFIRMATION[h.status]?.[1] ?? h.status}</span>
      {` · ${provenance(h)}${covers(h)}`}<br /><span className="muted">Evidence: {h.evidence_ref}</span></li>)}</ul>
      : <p className="muted">No confirmation recorded yet.</p>}
  </section>;
}
