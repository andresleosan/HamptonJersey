import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { useFieldErrors } from "./Sales.jsx";
import { jerseyToday } from "../../server/viewings.js";

// OFE-06: the weekly internal review of a sale, and the steps taken outside the app. Both render nothing while the
// server has the feature off (404). Nothing here contacts a lawyer or a client.
const PARTY = { buyer_lawyer: "Buyer's lawyer", seller_lawyer: "Seller's lawyer", buyer: "Buyer", seller: "Seller",
  lender: "Lender", other: "Other" };
const DAYS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

// version: the steps as SaleDetail shows them; a change there reloads the snapshot a review sends back.
export function WeeklyReview({ saleId, open, version }) {
  const [d, setD] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const load = () => api(`/admin/sales/${saleId}/followup`).then(setD, e => { if (e.status !== 404) setMsg({ text: e.message }); });
  useEffect(() => { load(); }, [saleId, version]);
  if (!d) return msg ? <section className="card" aria-labelledby="h-review"><h2 id="h-review">Weekly review</h2>
    <p role="alert" className="err">{msg.text}</p></section> : null;
  const pending = d.followups.filter(f => f.status === "open"), done = d.followups.filter(f => f.status !== "open");
  const reviewed = async f => {
    setBusy(true); setMsg(null);
    try {
      await api(`/admin/sales/${saleId}/followups/${f.id}/review`, { method: "POST", body: { snapshot: d.snapshot, note } });
      setNote(""); setMsg({ ok: true, text: `Week of ${fmtDay(f.week_key)} reviewed.` }); await load();
    } catch (e) { setMsg({ text: e.message }); if (e.status === 409) load(); }
    finally { setBusy(false); }
  };
  return <>
    <section className="card" aria-labelledby="h-review"><h2 id="h-review">Weekly review</h2>
      <p className="muted">Check the steps above and record any step taken outside the app. A review doesn't change a step or
        contact anyone.</p>
      {open && pending.map(f => <div key={f.id} className="view-form">
        <p><strong>Week of {fmtDay(f.week_key, true)}</strong></p>
        <label>Internal note (optional)<input value={note} maxLength={300} onChange={e => setNote(e.target.value)} /></label>
        <div className="inline"><button type="button" className="btn sm" disabled={busy} onClick={() => reviewed(f)}>
          {busy ? "Saving…" : "Mark reviewed"}</button></div>
      </div>)}
      {open && !pending.length && <p className="muted">No review due.</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
      {done.length > 0 && <ul>{done.map(f => <li key={f.id}>Week of {fmtDay(f.week_key)}: {f.status === "reviewed"
        ? <>reviewed by {f.reviewed_by}, {fmtDate(f.reviewed_at)}{f.note && <span className="muted"> · {f.note}</span>}</>
        : <span className="muted">closed with the sale</span>}</li>)}</ul>}
    </section>
    <OutsideSteps saleId={saleId} open={open} rows={d.contacts} onSaved={load} />
  </>;
}

function OutsideSteps({ saleId, open, rows, onSaved }) {
  const blank = { party: "", occurred_on: jerseyToday(), reference: "" };
  const [f, setF] = useState(blank), [err, setErr] = useState(null), [ok, setOk] = useState(null), [busy, setBusy] = useState(false);
  const { errors, setErrors, invalid, error } = useFieldErrors("xs"), form = useRef(null);
  useEffect(() => { form.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null); setOk(null); setErrors({});
    try {
      await api(`/admin/sales/${saleId}/contacts`, { method: "POST", body: f });
      setF(blank); setOk("Step recorded."); await onSaved();
    } catch (x) { setErrors(x.data?.fields || {}); setErr(x.message); }
    finally { setBusy(false); }
  };
  return <section className="card" aria-labelledby="h-outside"><h2 id="h-outside">Steps taken outside the app</h2>
    <p className="muted">A short reference only, such as "Email 12 Nov, searches requested". Keep documents and legal
      advice outside the app. Recording a step doesn't mark it done above.</p>
    {rows.length ? <ul>{rows.map(c => <li key={c.id}>{fmtDay(c.occurred_on)} · {PARTY[c.party]} · {c.reference}
      <span className="muted"> ({c.created_by})</span></li>)}</ul> : <p className="muted">Nothing recorded yet.</p>}
    {open && <form ref={form} className="view-form" onSubmit={submit} noValidate aria-label="Record a step taken outside the app">
      <div className="grid2">
        <label>With<select id="xs-party" value={f.party} onChange={set("party")} {...invalid("party")}>
          <option value="">Choose…</option>{Object.entries(PARTY).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </select>{error("party")}</label>
        <label>On<input id="xs-occurred_on" type="date" value={f.occurred_on} max={jerseyToday()} onChange={set("occurred_on")}
          {...invalid("occurred_on")} />{error("occurred_on")}</label>
      </div>
      <label>Reference<input id="xs-reference" value={f.reference} maxLength={120} autoComplete="off" onChange={set("reference")}
        {...invalid("reference")} />{error("reference")}</label>
      {err && <p role="alert" className="err">{err}</p>}
      <p role="status" className="ok">{ok}</p>
      <div className="inline"><button className="btn sm" disabled={busy}>{busy ? "Saving…" : "Record step"}</button></div>
    </form>}
  </section>;
}

// The team's day and time for the weekly review (Jersey time); off until set.
export function ReviewSchedule() {
  const [s, setS] = useState(null), [f, setF] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/admin/sale-followups/schedule").then(r => { setS(r.schedule); setF({ day: r.schedule.day ?? "mon", time: r.schedule.time ?? "09:00" }); },
      e => e.status !== 404 && setMsg({ text: e.message }));
  }, []);
  if (!s) return msg ? <article className="card"><h2>Weekly sale review</h2><p role="alert" className="err">{msg.text}</p></article> : null;
  const save = async enabled => {
    setBusy(true); setMsg(null);
    try {
      const r = await api("/admin/sale-followups/schedule", { method: "PUT", body: { enabled, ...(enabled ? f : {}) } });
      setS(r.schedule);
      setMsg({ ok: true, text: enabled ? `On: every ${DAYS[r.schedule.day]} at ${r.schedule.time}, Jersey time.` : "Off. No new reviews are created." });
    } catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  return <article className="card" aria-labelledby="a-review">
    <h2 id="a-review">Weekly sale review</h2>
    <p className="muted">Each week, at the day and time you choose, every sale in progress gets one internal Inbox task to review
      its steps. Off until you set it. Nothing is sent to lawyers or clients.</p>
    <p>{s.enabled ? <span className="badge positive">On</span> : <span className="badge neutral">Off</span>}
      {s.enabled && <span> Every {DAYS[s.day]} at {s.time}, since {fmtDate(s.activated_at)}</span>}</p>
    <div className="grid2">
      <label>Day<select value={f.day} onChange={e => setF(x => ({ ...x, day: e.target.value }))}>
        {Object.entries(DAYS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
      <label>Time (Jersey)<input type="time" value={f.time} onChange={e => setF(x => ({ ...x, time: e.target.value }))} /></label>
    </div>
    <div className="inline">
      <button type="button" className="btn sm" disabled={busy} onClick={() => save(true)}>{s.enabled ? "Save" : "Turn on"}</button>
      {s.enabled && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => save(false)}>Turn off</button>}
    </div>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </article>;
}
