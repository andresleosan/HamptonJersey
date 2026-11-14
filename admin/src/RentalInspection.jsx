import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { URGENCY, checkState } from "./Rentals.jsx";
import { described } from "./RentalOrigin.jsx";
import { Note, useSave } from "./TenancyExit.jsx";
import { jerseyToday } from "../../server/viewings.js";

// ADM-13 (server/rental-inspections.js, flag ADM13_INSPECTIONS_READY): in a tenancy card, when its next internal
// inspection falls due (six months after the last one, or the start), a checklist by room to record one from a phone
// during the visit, and the repairs it found, each created in Repairs or set aside by a person. With the flag off the
// routes answer 404 and none of this shows. No report, message or file goes to anyone from here.

let probe = null; // asked once per page load, like useExitReady
function useInspectionsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    probe ??= api("/admin/rental-inspections").then(() => true, e => { if (e.status !== 404) probe = null; return false; });
    probe.then(ok => live && setReady(ok));
    return () => { live = false; };
  }, []);
  return ready;
}

export const STATE = { ok: "OK", attention: "Needs attention", not_checked: "Not checked" };
const TONE = { ok: "positive", attention: "attention", not_checked: "neutral" };
const RELOADED = "The inspections saved meanwhile are listed below; your entries are still in the form. Save again to record this one too.";
const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function TenancyInspections({ id, tick, onRepair }) {
  const ready = useInspectionsReady(), [d, setD] = useState(null), [err, setErr] = useState(null), [form, setForm] = useState(false);
  const [msg, setMsg] = useState(null), heading = useRef(null);
  const load = () => api(`/admin/tenancies/${id}/inspections`).then(x => { setD(x); setErr(null); }, e => setErr(e.message));
  useEffect(() => { if (ready) load(); }, [ready, id, tick]);
  if (!ready) return null;
  const h = `h-in${id}`;
  if (!d) return <section aria-labelledby={h} className="inspections"><h3 id={h}>Inspections</h3>
    {err ? <p role="alert" className="err">{err} <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>
      : <p className="muted">Loading inspections…</p>}</section>;
  const n = d.next, last = d.inspections[0];
  const decided = text => { setMsg({ ok: true, text }); heading.current?.focus(); onRepair(); };
  return <section aria-labelledby={h} className="inspections">
    <h3 id={h} ref={heading} tabIndex={-1}>Inspections</h3>
    {n ? <p className={n.status === "overdue" ? "warn" : undefined} role={n.status === "overdue" ? "note" : undefined}>
      Next inspection due <strong>{fmtDay(n.due_on)}</strong> {checkState(n)}
      <span className="muted cell-note">Six months after {last ? `the last one, ${fmtDay(last.inspected_on)}` : "the start of the tenancy"}</span></p>
      : d.tenancy.running && <p className="muted">The tenancy ends before the next inspection falls due.</p>}
    <Note msg={msg} />
    {form ? <InspectionForm d={d} onClose={() => setForm(false)} onSaved={load}
      onDone={() => { setForm(false); setMsg({ ok: true, text: "Inspection recorded." }); load(); onRepair(); }} />
      : d.tenancy.running && d.tenancy.start_on <= jerseyToday() && <div className="inline"><button type="button" className="btn sm" onClick={() => { setMsg(null); setForm(true); }}>
        Record inspection</button></div>}
    {d.inspections.length ? <ol className="inspection-list" aria-label="Inspections recorded">{d.inspections.map(x =>
      <Inspection key={x.id} x={x} tenancy={id} onDecided={decided} onStale={load} />)}</ol>
      : <p className="muted">No inspections recorded yet.</p>}
  </section>;
}

function Inspection({ x, tenancy, onDecided, onStale }) {
  const count = c => x.rooms.filter(r => r.condition === c).length;
  const summary = [plural(x.rooms.length, "room"), count("attention") && `${count("attention")} needing attention`,
    count("not_checked") && `${count("not_checked")} not checked`].filter(Boolean).join(", ");
  return <li>
    <p><strong>{fmtDay(x.inspected_on)}</strong> · {summary}<span className="muted cell-note">Recorded by {x.recorded_by} on {fmtDate(x.recorded_at)}</span></p>
    <ul className="plain-list">{x.rooms.map((r, i) => <li key={i}>
      <span><strong>{r.name}</strong>{r.observations && <span className="cell-note">{r.observations}</span>}
        {r.repair?.status === "created" && <span className="muted cell-note">Repair created by {r.repair.decided_by} on {fmtDate(r.repair.decided_at)}</span>}
        {r.repair?.status === "not_needed" && <span className="muted cell-note">Repair set aside by {r.repair.decided_by} on {fmtDate(r.repair.decided_at)}</span>}</span>
      <span className="badge-row"><span className={`badge ${TONE[r.condition]}`}>{STATE[r.condition]}</span>
        {r.repair?.status === "pending" && <span className="badge attention">Repair to confirm</span>}</span>
      {r.repair?.status === "pending" && <RepairDecision x={x} index={i} room={r} tenancy={tenancy} onDecided={onDecided} onStale={onStale} />}
    </li>)}</ul>
    {x.evidence_refs.length > 0 && <ul className="plain-list" aria-label={`Evidence references, ${fmtDay(x.inspected_on)}`}>{x.evidence_refs.map(r =>
      <li key={r.evidence_ref}><span>{r.evidence_ref}<span className="muted cell-note">Checked by {r.reviewed_by} on {fmtDate(r.reviewed_at)}</span></span></li>)}</ul>}
  </li>;
}

// A person confirms the repair (created in Repairs, reported, at the urgency chosen) or sets it aside.
function RepairDecision({ x, index, room, tenancy, onDecided, onStale }) {
  const p = `rd${x.id}-${index}`, [urgency, setUrgency] = useState("routine"), s = useSave(p), { fe } = s;
  const send = async decision => {
    const ok = await s.run(() => api(`/admin/tenancies/${tenancy}/inspections/${x.id}/repairs`, { method: "POST", body: { tenancy_id: tenancy,
      room: index, expectedRevision: x.revision, decision, urgency: decision === "repair" ? urgency : undefined } }), "");
    if (ok) onDecided(decision === "repair" ? `Repair created in Repairs: ${room.name}.` : `Repair set aside: ${room.name}.`);
  };
  return <div ref={s.ref} className="repair-decision" role="group" aria-label={`Repair found in ${room.name}`}>
    <label>Urgency<select id={`${p}-urgency`} value={urgency} onChange={e => setUrgency(e.target.value)} {...fe.invalid("urgency")}>
      {Object.entries(URGENCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{fe.error("urgency")}</label>
    <button type="button" className="btn sm" disabled={s.busy} onClick={() => send("repair")}>Create repair<span className="sr"> for {room.name}</span></button>
    <button type="button" className="btn ghost sm" disabled={s.busy} onClick={() => send("not_needed")}>Not needed<span className="sr"> for {room.name}</span></button>
    {s.msg && !s.msg.ok && <Note msg={s.msg} onReload={onStale} />}
  </div>;
}

const blankRoom = name => ({ name, condition: "", observations: "", repair_needed: false });

// The checklist, one room after another, for a phone during the visit. Its operation id is made when it opens, so a save
// sent twice (a slow network, a second tap) records one inspection.
function InspectionForm({ d, onClose, onSaved, onDone }) {
  const t = d.tenancy, p = `if${t.id}`, today = jerseyToday(), op = useRef(crypto.randomUUID()), s = useSave(p), { fe } = s;
  const [f, setF] = useState(() => ({ inspected_on: today, refs: "",
    rooms: d.suggested_rooms.length ? d.suggested_rooms.map(blankRoom) : [blankRoom("")] }));
  const edit = (i, k, v) => setF(x => ({ ...x, rooms: x.rooms.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));
  const save = async e => {
    e.preventDefault();
    const ok = await s.run(() => api(`/admin/tenancies/${t.id}/inspections`, { method: "POST", body: { tenancy_id: t.id,
      expectedRevision: d.revision, operation_id: op.current, inspected_on: f.inspected_on || null,
      rooms: f.rooms.map(r => ({ ...r, repair_needed: r.condition === "attention" && r.repair_needed })),
      evidence_refs: f.refs.split("\n").map(v => v.trim()).filter(Boolean) } }), "Inspection recorded.");
    if (ok) onDone();
  };
  const refErrors = Object.entries(fe.errors).filter(([k]) => k.startsWith("evidence_refs.")).map(([k, m]) => `Line ${Number(k.split(".")[1]) + 1}: ${m}`);
  const refsBad = !!(fe.errors.evidence_refs || refErrors.length);
  return <form ref={s.ref} className="view-form inspection-form" onSubmit={save} noValidate aria-label="Record inspection">
    <div className="field"><label>Inspected on<input id={`${p}-inspected_on`} type="date" min={t.start_on} max={today} value={f.inspected_on}
      onChange={e => setF(x => ({ ...x, inspected_on: e.target.value }))} {...fe.invalid("inspected_on")}
      aria-describedby={described(fe, "inspected_on", `d-${p}-day`)} />{fe.error("inspected_on")}</label>
      <small id={`d-${p}-day`} className="muted">The day of the visit: today or earlier.</small></div>
    {fe.error("rooms")}
    {f.rooms.map((r, i) => {
      const k = `rooms.${i}`, label = r.name.trim() || `Room ${i + 1}`;
      return <fieldset key={i} className="inspection-room"><legend>{label}</legend>
        <label>Room<input id={`${p}-${k}.name`} value={r.name} maxLength={80} autoComplete="off" onChange={e => edit(i, "name", e.target.value)}
          {...fe.invalid(`${k}.name`)} />{fe.error(`${k}.name`)}</label>
        <fieldset className="choices-set"><legend>State of {label}</legend><div className="choices">
          {Object.entries(STATE).map(([v, text]) => <label key={v} className="check"><input type="radio" name={`${p}-${k}.condition`} value={v}
            checked={r.condition === v} onChange={() => edit(i, "condition", v)} aria-invalid={fe.errors[`${k}.condition`] ? true : undefined}
            aria-describedby={fe.errors[`${k}.condition`] ? `e-${p}-${k}.condition` : undefined} />{text}</label>)}</div>
          {fe.error(`${k}.condition`)}</fieldset>
        <label>{r.condition === "attention" ? "What needs attention" : "Observations (optional)"}<textarea id={`${p}-${k}.observations`}
          className="short" value={r.observations} maxLength={2000} onChange={e => edit(i, "observations", e.target.value)}
          {...fe.invalid(`${k}.observations`)} />{fe.error(`${k}.observations`)}</label>
        {r.condition === "attention" && <div className="field"><label className="check"><input type="checkbox" checked={r.repair_needed}
          onChange={e => edit(i, "repair_needed", e.target.checked)} {...fe.invalid(`${k}.repair_needed`)} />Needs a repair</label>
          <small className="muted">A person confirms it afterwards; nothing goes to Repairs until then.</small>{fe.error(`${k}.repair_needed`)}</div>}
        {f.rooms.length > 1 && <div className="inline"><button type="button" className="btn ghost sm"
          onClick={() => setF(x => ({ ...x, rooms: x.rooms.filter((_, j) => j !== i) }))}>Remove<span className="sr"> {label}</span></button></div>}
      </fieldset>;
    })}
    <div className="inline"><button type="button" className="btn ghost sm" onClick={() => setF(x => ({ ...x, rooms: [...x.rooms, blankRoom("")] }))}>
      Add room</button></div>
    <div className="field"><label>Evidence references (optional, one per line, up to 20)<textarea id={`${p}-evidence_refs`} className="short"
      value={f.refs} onChange={e => setF(x => ({ ...x, refs: e.target.value }))} aria-invalid={refsBad || undefined}
      aria-describedby={[`d-${p}-refs`, refsBad && `e-${p}-refs`].filter(Boolean).join(" ")} />
      {refsBad && <small id={`e-${p}-refs`} className="err">{[fe.errors.evidence_refs, ...refErrors].filter(Boolean).join(" ")}</small>}</label>
      <small id={`d-${p}-refs`} className="muted">Where the photos you checked are kept, like a folder name. The app does not receive, store or
        open them.</small></div>
    <Note msg={s.msg} onReload={() => { s.setMsg({ ok: true, text: RELOADED }); onSaved(); }} />
    <div className="inline"><button className="btn sm" disabled={s.busy}>{s.busy ? "Saving…" : "Save inspection"}</button>
      <button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button></div>
  </form>;
}
