import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { setUnsaved } from "./unsaved.js";
import { useFieldErrors } from "./Sales.jsx";
import { jerseyToday } from "../../server/viewings.js";

// ADM-17 (#/legal, with its switch): the legal periods the rentals' dates are worked out with, and Hampton's JFSC and
// GST registrations. Saving a period never validates it: that takes who validated it and when. The server checks the
// values and the version the form was loaded with.

// The label on every date worked out with periods no lawyer has validated. legal: the screen's own answer, absent
// while the switch is off.
export const Estimated = ({ legal }) => (legal?.status === "estimated"
  ? <span className="badge neutral">Estimated · not validated by a lawyer</span> : null);
export const REGISTERED = { yes: "confirmed", no: "not registered", unknown: "not confirmed" };

const ALL_PERIODS = [["depositDays", "Deposit protected within (days)"], ["reportDays", "Check-in and check-out report within (days)"],
  ["licenceYears", "Rental dwelling licence lasts (years)"], ["eicrYears", "Electrical safety (EICR) lasts (years)"],
  ["gasYears", "Gas safety lasts (years)"], ["alarmsYears", "Smoke and CO alarms check lasts (years)"],
  ["tenantNoticeMonths", "Tenant's notice, periodic tenancy (months)"],
  ["landlordNoticeMonths", "Landlord's notice without cause (months)"],
  ["rentNoticeMonths", "Notice before a rent change (months)"], ["rentIntervalMonths", "Between rent changes (months)"],
  // ADM-11: sent by the server only with its switch.
  ["copyDays", "Licence and EICR copy to the tenant within (days)"], ["changeDays", "Licence changes notified within (days)"],
  ["checklistYears", "Electrical checklist lasts (years)"]];
const BODIES = [["jfsc", "JFSC registration (collecting rent into Hampton's account)"], ["gst", "GST registration"]];
const ANSWERS = [["yes", "Registered"], ["no", "Not registered"], ["unknown", "Not confirmed"]];
const saved = x => (x.revision ? `Version ${x.revision}, saved by ${x.updated_by} on ${fmtDate(x.updated_at)}.` : null);

export default function LegalTerms({ onChange }) {
  const [d, setD] = useState(null), [err, setErr] = useState(null), [ok, setOk] = useState(null), dirty = useRef({});
  const load = () => api("/admin/legal-terms").then(x => { setD(x); setErr(null); }, e => setErr(e.message));
  useEffect(() => { load(); return () => setUnsaved(false); }, []);
  if (!d) return err ? <p role="alert" className="err">{err} <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>
    : <p>Loading legal terms…</p>;
  // Each form starts again from what the server holds after its save or a reload (the key); the other keeps its edits.
  const done = text => x => { setD(x); setOk(text); onChange(); };
  const mark = k => v => { dirty.current[k] = v; setUnsaved(Object.values(dirty.current).some(Boolean)); };
  return <section className="automations" aria-labelledby="t-legal">
    <div className="head"><div><h1 id="t-legal">Legal terms</h1>
      <p className="muted">The periods behind the rentals' deadlines, and Hampton's registrations. A saved change applies to every date at once.</p></div></div>
    {ok && <p role="status" className="ok">{ok}</p>}
    {err && <p role="alert" className="err">{err}</p>}
    <Periods key={`t${d.terms.revision}`} terms={d.terms} onSaved={done("Legal periods saved.")} onDirty={mark("t")} reload={load} />
    <Registrations key={`r${d.registration.revision}`} registration={d.registration} onSaved={done("Registrations saved.")}
      onDirty={mark("r")} reload={load} />
  </section>;
}

// One form's state: its fields, the request and its message. A refused save (409) offers to reload.
function useSave(prefix, initial, send, onSaved, onDirty) {
  const [f, setF] = useState(initial), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const fe = useFieldErrors(prefix), said = useRef(null), dirty = JSON.stringify(f) !== JSON.stringify(initial);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty]);
  useEffect(() => { if (msg) said.current?.focus(); }, [msg]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); fe.setErrors({});
    try { onSaved(await send(f)); }
    catch (x) { fe.setErrors(x.data?.fields || {}); setMsg({ text: x.data?.fields?.revision ?? x.message, stale: x.status === 409 }); setBusy(false); }
  };
  return { f, set, busy, msg, said, dirty, submit, ...fe };
}
const Said = ({ a, reload }) => a.msg && <p ref={a.said} tabIndex={-1} role="alert" className="err">{a.msg.text}
  {a.msg.stale && <> <button type="button" className="btn ghost sm" onClick={reload}>Reload</button></>}</p>;

function Periods({ terms, onSaved, onDirty, reload }) {
  const PERIODS = ALL_PERIODS.filter(([k]) => k in terms.values);
  const a = useSave("lt", { ...Object.fromEntries(PERIODS.map(([k]) => [k, String(terms.values[k])])), status: terms.status,
    validated_ref: terms.validated_ref ?? "", validated_on: terms.validated_on ?? "" },
  f => api("/admin/legal-terms", { method: "PUT", body: { values: Object.fromEntries(PERIODS.map(([k]) => [k, Number(f[k])])),
    status: f.status, validated_ref: f.validated_ref, validated_on: f.validated_on || null, revision: terms.revision } }), onSaved, onDirty);
  const validated = a.f.status === "validated";
  return <form className="card" onSubmit={a.submit} noValidate aria-labelledby="h-periods">
    <h2 id="h-periods">Legal periods</h2>
    <p>{terms.status === "validated" ? <><span className="badge positive">Validated</span> {terms.validated_ref}, {fmtDay(terms.validated_on)}.</>
      : <Estimated legal={terms} />}</p>
    <p className="muted">{saved(terms) ?? "Not saved yet: these are the values the app has used so far."} Saving a
      period does not validate it. While they are estimated, every date worked out with them says so.</p>
    <div className="grid2">{PERIODS.map(([k, label]) => <label key={k}>{label}
      <input type="number" inputMode="numeric" min={1} step={1} value={a.f[k]} onChange={a.set(k)} {...a.invalid(k)} />{a.error(k)}</label>)}</div>
    <fieldset className="choices-set"><legend>Status</legend>
      <div className="choices">{[["estimated", "Estimated · not validated by a lawyer"], ["validated", "Validated by a Jersey lawyer"]].map(([v, t]) =>
        <label key={v} className="check"><input type="radio" name="lt-status" value={v} checked={a.f.status === v} onChange={a.set("status")} />{t}</label>)}</div>
      {a.error("status")}</fieldset>
    {validated && <div className="grid2">
      <div className="field"><label>Validated by, and the reference of their advice
        <input value={a.f.validated_ref} onChange={a.set("validated_ref")} maxLength={200} autoComplete="off" {...a.invalid("validated_ref")}
          aria-describedby={["d-lt-ref", a.invalid("validated_ref")["aria-describedby"]].filter(Boolean).join(" ")} />{a.error("validated_ref")}</label>
        <small id="d-lt-ref" className="muted">For example the firm and the date of its letter. Keep the advice itself out of the app.</small></div>
      <label>Validated on<input type="date" max={jerseyToday()} value={a.f.validated_on} onChange={a.set("validated_on")}
        {...a.invalid("validated_on")} />{a.error("validated_on")}</label></div>}
    {validated && <p className="warn" role="note">The validation must cover every period as shown above, changed ones included.</p>}
    <div className="inline"><button className="btn" disabled={!a.dirty && terms.revision > 0}>{a.busy ? "Saving…" : "Save legal periods"}</button>
      {a.dirty && <span className="unsaved">Unsaved changes</span>}</div>
    <Said a={a} reload={reload} />
  </form>;
}

function Registrations({ registration: r, onSaved, onDirty, reload }) {
  const a = useSave("lr", { jfsc: r.jfsc, jfsc_ref: r.jfsc_ref ?? "", gst: r.gst, gst_ref: r.gst_ref ?? "" },
    f => api("/admin/legal-terms/registration", { method: "PUT", body: { ...f, revision: r.revision } }), onSaved, onDirty);
  return <form className="card" onSubmit={a.submit} noValidate aria-labelledby="h-registrations">
    <h2 id="h-registrations">Hampton's registrations</h2>
    <p className="muted">{saved(r) ?? "Not recorded yet."} Not confirmed is not approval: confirm the JFSC registration
      before taking on full management. Nothing here stops work already under way.</p>
    {BODIES.map(([k, legend]) => <fieldset key={k} className="choices-set"><legend>{legend}</legend>
      <div className="choices">{ANSWERS.map(([v, t]) => <label key={v} className="check">
        <input type="radio" name={`lr-${k}`} value={v} checked={a.f[k] === v} onChange={a.set(k)} />{t}</label>)}</div>
      {a.error(k)}
      <label>Registration number, or where it was confirmed{a.f[k] !== "yes" && " (optional)"}
        <input value={a.f[`${k}_ref`]} onChange={a.set(`${k}_ref`)} maxLength={200} autoComplete="off" {...a.invalid(`${k}_ref`)} />{a.error(`${k}_ref`)}</label>
    </fieldset>)}
    <div className="inline"><button className="btn" disabled={!a.dirty && r.revision > 0}>{a.busy ? "Saving…" : "Save registrations"}</button>
      {a.dirty && <span className="unsaved">Unsaved changes</span>}</div>
    <Said a={a} reload={reload} />
  </form>;
}
