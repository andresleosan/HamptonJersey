import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { setUnsaved } from "./unsaved.js";
import { milestoneLabel } from "../../server/sales.js";
import { jerseyToday } from "../../server/viewings.js";
import { Modal, OfferBadge, REASON, Received, money, pounds, useFieldErrors } from "./Sales.jsx";

// Spec §4 sale file (#/sales/<id>): its data (V7, V3) on the left, saved with the panel's Save bar, and the work on the
// right: the Jersey steps (V8), then the listing's other offers. Completing it or recording that it fell through closes it.
const MONEY = ["price", "fee", "shared_fee"];
const FIELDS = [...MONEY, "route", "target_date", "notes", "seller_name", "seller_phone", "seller_email",
  "buyer_lawyer_firm", "buyer_lawyer_name", "buyer_lawyer_email", "buyer_lawyer_phone",
  "seller_lawyer_firm", "seller_lawyer_name", "seller_lawyer_email", "seller_lawyer_phone", "shared_agency"];
const toForm = s => Object.fromEntries(FIELDS.map(k => [k, s[k] == null ? "" : MONEY.includes(k) ? s[k].toLocaleString("en-GB") : String(s[k])]));
const toBody = f => Object.fromEntries(FIELDS.map(k => [k, MONEY.includes(k) ? pounds(f[k]) : f[k].trim() || null]));
const SALE_STATUS = { in_progress: ["In progress", "active"], completed: ["Completed", "positive"], fallen_through: ["Fell through", "neutral"] };
const LAWYER = [["firm", "Firm"], ["name", "Lawyer"], ["email", "Email", "email"], ["phone", "Phone", "tel"]];

export default function SaleDetail({ id, onChange }) {
  const [data, setData] = useState(null), [loadErr, setLoadErr] = useState(null), [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [falling, setFalling] = useState(false);
  const [step, setStep] = useState(null), [stepDirty, setStepDirty] = useState(false), [stepMsg, setStepMsg] = useState(null);
  const { errors, setErrors, invalid, error } = useFieldErrors("s");
  const formRef = useRef(null), stepButtons = useRef({}), heading = useRef(null), refocus = useRef(false);
  const load = () => api(`/admin/sales/${id}`).then(d => { setData(d); setForm(toForm(d.sale)); setErrors({}); setLoadErr(null); },
    e => setLoadErr(e.message));
  useEffect(() => { load(); }, [id]);
  useEffect(() => { formRef.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);
  // A close removes the action bar's buttons (and the dialog's opener): the heading takes the focus.
  useEffect(() => { if (refocus.current) { refocus.current = false; heading.current?.focus(); } }, [data]);

  const body = form && toBody(form), saved = data && toBody(toForm(data.sale));
  const changed = data && form ? FIELDS.filter(k => body[k] !== saved[k]) : [];
  const dirty = changed.length > 0;
  useEffect(() => { setUnsaved(dirty || stepDirty); return () => setUnsaved(false); }, [dirty, stepDirty]);

  if (!data) return loadErr ? <p role="alert" className="err">{loadErr}{" "}
    <button type="button" className="btn ghost sm" onClick={load}>Try again</button> · <a href="#/sales">Back to sales</a></p> : <p>Loading sale…</p>;
  const s = data.sale, open = s.status === "in_progress", [status, tone] = SALE_STATUS[s.status];
  // Closing waits for the fields and any open step to be saved or discarded.
  const locked = dirty || stepDirty || busy, unsaved = dirty || stepDirty ? "Save first" : undefined;

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const { sale } = await api(`/admin/sales/${id}`, { method: "PUT",
        body: { ...Object.fromEntries(changed.map(k => [k, body[k]])), updated_at: s.updated_at } });
      setData(d => ({ ...d, sale })); setForm(toForm(sale)); setErrors({}); setMsg({ ok: true, text: "Changes saved." });
    } catch (e) {
      setErrors(e.data?.fields || {}); setMsg({ text: e.message, stale: e.status === 409 && /Reload/.test(e.message) });
    } finally { setBusy(false); }
  };
  const discard = () => { setForm(toForm(s)); setErrors({}); setMsg(null); };
  const reload = () => { setMsg(null); load(); };
  // Closing reloads the file: its steps, the listing's offers (V18) and the sale, now read only.
  const closed = text => { setFalling(false); setStep(null); setMsg({ ok: true, text }); refocus.current = true; load(); onChange(); };
  const complete = async () => {
    if (!confirm(`Mark the sale of ${s.listing_title} to ${s.buyer_name} as completed? The website shows the listing as Sold, `
      + `${s.buyer_name} moves to Completed, the other open offers on this listing are rejected and ${s.buyer_name}'s open offers on `
      + "other listings are withdrawn. It can't be undone here.")) return;
    setBusy(true); setMsg(null);
    try { await api(`/admin/sales/${id}/complete`, { method: "POST" }); closed("Sale completed. The website shows the listing as Sold."); }
    catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  // The step's Update button comes back with the next render, then takes the focus again.
  const closeStep = key => { setStep(null); setStepDirty(false); requestAnimationFrame(() => stepButtons.current[key]?.focus()); };
  const stepSaved = m => {
    setData(d => ({ ...d, milestones: d.milestones.map(x => (x.key === m.key ? m : x)) }));
    setStepMsg(`${milestoneLabel(m.key, s.route)} saved.`); closeStep(m.key); onChange();
  };

  const ctl = (k, label, extra = {}) => <label key={k}>{label}<input id={`s-${k}`} value={form[k]} autoComplete="off"
    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} {...invalid(k)} {...extra} />{error(k)}</label>;
  const lawyer = side => <fieldset className="choices-set"><legend>{side === "buyer" ? "Buyer's lawyer" : "Seller's lawyer"}</legend>
    <div className="grid2">{LAWYER.map(([k, t, type]) => ctl(`${side}_lawyer_${k}`, t, { type, maxLength: 120 }))}</div></fieldset>;

  // A div, not a section: the entrance animation of `.page>section` would make it the box the fixed action bar sits in.
  return <div className="record">
    <div className="head">
      <div><h1 id="t-sale" ref={heading} tabIndex={-1}>{s.listing_title}</h1>
        <p className="muted">Sale to <a href={`#/applicants/${s.applicant_id}`}>{s.buyer_name}</a> · <a href={`#/p/${encodeURIComponent(s.listing_id)}`}>
          Listing {s.listing_id}</a> · Agreed {fmtDate(s.created_at)} <span className={`badge ${tone}`}>{status}</span></p></div>
      <a href="#/sales">← Back to sales</a>
    </div>
    {s.status === "completed" && <p className="warn" role="note">Completed {fmtDate(s.closed_at)}. A completed sale can't be reopened
      here; if it was a mistake, correct the listing in Listings.</p>}
    {s.status === "fallen_through" && <p className="warn" role="note">Fell through {fmtDate(s.closed_at)}: {REASON[s.fell_through_reason]}
      {s.fell_through_note && ` · ${s.fell_through_note}`}</p>}

    <div className="sale">
      <form ref={formRef} noValidate onSubmit={e => { e.preventDefault(); if (dirty && !busy) save(); }}>
        <fieldset className="sections plain" disabled={!open}>
          <section className="card fields-group" aria-labelledby="h-agreement"><h2 id="h-agreement">Agreement</h2><div className="grid2">
            {ctl("price", "Price (£)", { inputMode: "numeric" })}
            <label>Route<select id="s-route" value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))} {...invalid("route")}>
              <option value="">Not known yet</option><option value="freehold">Freehold or flying freehold</option>
              <option value="share_transfer">Share transfer</option></select>{error("route")}</label>
            {ctl("target_date", "Completion target", { type: "date" })}
          </div>
            <label>Notes<textarea id="s-notes" className="short" value={form.notes} maxLength={2000}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} {...invalid("notes")} />{error("notes")}</label>
          </section>
          <section className="card fields-group" aria-labelledby="h-seller"><h2 id="h-seller">Seller</h2><div className="grid2">
            {ctl("seller_name", "Name", { maxLength: 120 })}{ctl("seller_phone", "Phone", { type: "tel", maxLength: 120 })}
            {ctl("seller_email", "Email", { type: "email", maxLength: 120 })}</div></section>
          <section className="card fields-group" aria-labelledby="h-lawyers"><h2 id="h-lawyers">Lawyers</h2>
            {lawyer("buyer")}{lawyer("seller")}</section>
          <section className="card fields-group" aria-labelledby="h-fees"><h2 id="h-fees">Fees</h2>
            <p className="muted">Sales counts Hampton's fee less the other agency's share, when the sale is shared.</p><div className="grid2">
            {ctl("fee", "Hampton's fee (£)", { inputMode: "numeric" })}{ctl("shared_agency", "Other agency", { maxLength: 120 })}
            {ctl("shared_fee", "Other agency's share (£)", { inputMode: "numeric" })}</div></section>
        </fieldset>
      </form>

      <div className="sections">
        <section className="card" aria-labelledby="h-steps"><h2 id="h-steps">Steps</h2>
          <p role="status" className="ok">{stepMsg}</p>
          <ol className="steps">{data.milestones.map(m => {
            const label = milestoneLabel(m.key, s.route);
            return <li key={m.key} className={m.overdue ? "overdue" : undefined}>
              <div className="step-head"><span className="step-name">{label}</span>
                <span className="step-state">{m.done_on ? <span className="ok">Done {fmtDay(m.done_on)}</span>
                  : m.not_needed ? <span className="muted">Not needed</span>
                  : m.overdue ? <strong className="err">Overdue · planned {fmtDay(m.planned_on)}</strong>
                  : <span className="muted">{m.planned_on ? `Planned ${fmtDay(m.planned_on)}` : "No date yet"}</span>}</span>
                {open && step !== m.key && <button type="button" className="btn ghost sm" ref={el => { stepButtons.current[m.key] = el; }}
                  onClick={() => { if (!stepDirty || confirm("You have unsaved changes to a step. Leave without saving them?")) { setStepMsg(null); setStep(m.key); } }}>
                  Update<span className="sr"> {label}</span></button>}</div>
              {m.note && step !== m.key && <p className="muted">{m.note}</p>}
              {open && step === m.key && <StepForm saleId={id} m={m} label={label} onSaved={stepSaved} onClose={() => closeStep(m.key)}
                onDirty={setStepDirty} />}
            </li>;
          })}</ol>
        </section>
        <section className="card" aria-labelledby="h-others"><h2 id="h-others">Other offers on this listing</h2>
          {data.offers.length ? <div className="table-scroll" role="region" aria-labelledby="h-others" tabIndex={0}>
            <table className="list small">
              <thead><tr><th scope="col">Buyer</th><th scope="col">Offer</th><th scope="col">Status</th><th scope="col">Received</th></tr></thead>
              <tbody>{data.offers.map(o => <tr key={o.id}>
                <td><a href={`#/applicants/${o.applicant_id}`}>{o.buyer_name}</a></td>
                <td className="num">{money(o.amount)}{o.counter_amount != null && <span className="muted cell-note">Countered {money(o.counter_amount)}</span>}</td>
                <td><OfferBadge status={o.status} />{o.note && <span className="muted cell-note">{o.note}</span>}</td>
                <td><Received at={o.created_at} /></td>
              </tr>)}</tbody>
            </table></div> : <p className="muted">No other offers on this listing.</p>}
          {data.offers.some(o => o.status === "pending" || o.status === "countered") && <p><a href="#/sales">Answer open offers in Sales</a></p>}
        </section>
      </div>
    </div>

    {(open || msg) && <div className="actionbar" role="region" aria-label="Actions">
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}
        {msg.stale && <> <button type="button" className="btn ghost sm" onClick={reload}>Reload</button></>}</p>}
      {open && <>
        {dirty && <span className="unsaved">Unsaved changes</span>}
        <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</button>
        {dirty && <button type="button" className="btn ghost" onClick={discard} disabled={busy}>Discard</button>}
        <button type="button" className="btn ghost" disabled={locked} title={unsaved} onClick={complete}>Mark completed</button>
        <button type="button" className="btn ghost danger" disabled={locked} title={unsaved}
          onClick={() => { setMsg(null); setFalling(true); }}>Fell through</button></>}
    </div>}
    {falling && <FellThrough sale={s} onClose={() => setFalling(false)} onDone={closed} />}
  </div>;
}

// V8: one step's planned day, whether it is done (today by default) or not needed, and a note.
function StepForm({ saleId, m, label, onSaved, onClose, onDirty }) {
  const init = { planned_on: m.planned_on ?? "", state: m.done_on ? "done" : m.not_needed ? "not_needed" : "todo",
    done_on: m.done_on ?? jerseyToday(), note: m.note ?? "" };
  const [f, setF] = useState(init), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const { errors, setErrors, invalid, error } = useFieldErrors("st");
  const first = useRef(null), form = useRef(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => { onDirty(dirty); }, [dirty]);
  useEffect(() => () => onDirty(false), []);
  useEffect(() => { form.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    if (f.state === "done" && !f.done_on) return setErrors({ done_on: "Enter the day it was done" });
    setBusy(true); setErr(null); setErrors({});
    try {
      const { milestone } = await api(`/admin/sales/${saleId}/milestones/${m.key}`, { method: "PUT", body: { planned_on: f.planned_on || null,
        done_on: f.state === "done" ? f.done_on : null, not_needed: f.state === "not_needed", note: f.note.trim() || null } });
      onSaved(milestone);
    } catch (x) { setErrors(x.data?.fields || {}); setErr(x.message); setBusy(false); }
  };
  return <form ref={form} className="view-form" onSubmit={submit} noValidate aria-label={`Update ${label}`}>
    <div className="grid2">
      <label>Planned for<input ref={first} id="st-planned" type="date" value={f.planned_on} onChange={set("planned_on")} {...invalid("planned_on")} />
        {error("planned_on")}</label>
      {f.state === "done" && <label>Done on<input id="st-done" type="date" value={f.done_on} onChange={set("done_on")} {...invalid("done_on")} />
        {error("done_on")}</label>}
    </div>
    <fieldset className="choices-set"><legend>Status</legend><div className="choices">
      {[["todo", "To do"], ["done", "Done"], ["not_needed", "Not needed"]].map(([k, t]) => <label key={k} className="check">
        <input type="radio" name="st-state" value={k} checked={f.state === k} onChange={set("state")} />{t}</label>)}</div>
      {error("not_needed")}</fieldset>
    <label>Note (optional)<input id="st-note" value={f.note} maxLength={300} onChange={set("note")} {...invalid("note")} />{error("note")}</label>
    {err && <p role="alert" className="err">{err}</p>}
    <div className="inline"><button className="btn sm">{busy ? "Saving…" : "Save step"}</button>
      <button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button></div>
  </form>;
}

// V2, V6, V7: the reason is required; the listing goes back for sale only if it is still under offer.
function FellThrough({ sale: s, onClose, onDone }) {
  const [reason, setReason] = useState(null), [note, setNote] = useState(""), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const { errors, setErrors, invalid, error } = useFieldErrors("ft");
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null); setErrors({});
    try {
      await api(`/admin/sales/${s.id}/fall-through`, { method: "POST", body: { reason, note } });
      onDone("Recorded as fallen through. The listing is For sale again if it was still Under offer, and the buyer is back to Searching.");
    } catch (x) { setErrors(x.data?.fields || {}); setErr(x.message); setBusy(false); }
  };
  return <Modal title="Sale fell through" onClose={onClose}>
    <form className="sheet-form" onSubmit={submit} noValidate>
      <p>{s.listing_title} to {s.buyer_name}. The sale closes and can't be reopened; a new offer starts again.</p>
      <fieldset className="choices-set" aria-describedby={errors.reason ? "e-ft-reason" : undefined}><legend>Why did it fall through?</legend>
        <div className="choices">{Object.entries(REASON).map(([k, t]) => <label key={k} className="check">
          <input type="radio" name="ft-reason" value={k} checked={reason === k} onChange={() => setReason(k)} />{t}</label>)}</div>
        {error("reason")}</fieldset>
      <label>Note (optional)<textarea className="short" value={note} maxLength={300} onChange={e => setNote(e.target.value)} {...invalid("note")} />
        {error("note")}</label>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="inline"><button className="btn ghost danger">{busy ? "Saving…" : "Record fall-through"}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>;
}
