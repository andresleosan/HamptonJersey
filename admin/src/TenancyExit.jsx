import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { useFieldErrors } from "./Sales.jsx";
import { pence } from "./Rentals.jsx";
import { METER, UNIT, described } from "./RentalOrigin.jsx";
import { parseMoney } from "../../server/rentals.js";
import { jerseyToday } from "../../server/viewings.js";

// ADM-16 (server/tenancy-exits.js, flag ADM16_TENANCY_EXIT_READY): in a tenancy card with a move-out, the exit inventory
// compared with the entry inventory it cites, the deductions proposed from the deposit and what happened with
// mydeposits. With the flag off the routes answer 404 and none of this shows. Nothing here moves money: a proposal is not
// an agreement, and a request is not a return.

let probe = null; // asked once per page load, like useOriginReady
function useExitReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    probe ??= api("/admin/tenancy-exits").then(() => true, e => { if (e.status !== 404) probe = null; return false; });
    probe.then(ok => live && setReady(ok));
    return () => { live = false; };
  }, []);
  return ready;
}

export const CONDITION = { as_entry: "As at check-in", changed: "Changed", not_checked: "Not checked" };
export const OUTCOME = { requested: "Repayment requested in mydeposits", agreed: "Deductions agreed", disputed: "In dispute",
  returned: "Returned by mydeposits" };
const RELOADED = "The saved record is shown above; your entries are still in the form. Save again to replace it.";

// A save's answer by its form; a conflict offers Reload and keeps what was typed.
export function Note({ msg, onReload }) {
  return msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}
    {msg.stale && <> <button type="button" className="btn ghost sm" onClick={onReload}>Reload</button></>}</p>;
}
// A form's submit: its field errors (focus on the first) and its answer. run() resolves true once saved.
export function useSave(prefix) {
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), fe = useFieldErrors(prefix), ref = useRef(null);
  useEffect(() => { ref.current?.querySelector("[aria-invalid=true]")?.focus(); }, [fe.errors]);
  const run = async (send, ok) => {
    if (busy) return false;
    setBusy(true); setMsg(null); fe.setErrors({});
    try { await send(); setMsg({ ok: true, text: ok }); return true; }
    catch (x) { fe.setErrors(x.data?.fields || {}); setMsg({ text: x.message, stale: x.status === 409 }); return false; }
    finally { setBusy(false); }
  };
  const reload = onSaved => () => { setMsg({ ok: true, text: RELOADED }); onSaved(); };
  return { msg, setMsg, busy, fe, ref, run, reload };
}
const byName = rooms => new Map((rooms ?? []).map(r => [r.name.toLowerCase(), r]));

export function TenancyExit({ id, tick, moveOut }) {
  const ready = useExitReady(), [d, setD] = useState(null), [err, setErr] = useState(null);
  const load = () => api(`/admin/tenancies/${id}/exit`).then(x => { setD(x); setErr(null); }, e => setErr(e.message));
  useEffect(() => { if (ready && moveOut) load(); }, [ready, id, tick, moveOut]);
  if (!ready || !moveOut) return null;
  if (!d) return err ? <p role="alert" className="err">{err} <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>
    : <p className="muted">Loading the move-out…</p>;
  return <><ExitInventory d={d} onSaved={load} /><Deposit d={d} onSaved={load} /></>;
}

const blankRoom = name => ({ name, condition: "", observations: "" });
const toExitForm = ({ exit: x, entry: e }) => ({ moved_out_on: x?.moved_out_on ?? "",
  rooms: x ? x.rooms.map(r => ({ ...r })) : e?.rooms.length ? e.rooms.map(r => blankRoom(r.name)) : [blankRoom("")],
  meter_readings: x ? x.meter_readings.map(m => ({ ...m }))
    : (e?.meter_readings ?? []).map(m => ({ meter: m.meter, reading: "", unit: m.unit, read_on: "" })),
  refs: (x?.evidence_refs ?? []).map(r => r.evidence_ref).join("\n") });

function ExitInventory({ d, onSaved }) {
  const t = d.tenancy, x = d.exit, held = d.outcomes.length > 0, p = `xi${t.id}`, h = `h-${p}`, today = jerseyToday();
  const [form, setForm] = useState(null), s = useSave(p), { fe } = s;
  const edit = (list, i, k) => e => setForm(f => ({ ...f, [list]: f[list].map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)) }));
  const add = (list, row) => setForm(f => ({ ...f, [list]: [...f[list], row] }));
  const drop = (list, i) => setForm(f => ({ ...f, [list]: f[list].filter((_, j) => j !== i) }));
  const save = async e => {
    e.preventDefault();
    const sent = await s.run(() => api(`/admin/tenancies/${t.id}/exit-inventory`, { method: "PUT", body: { tenancy_id: t.id,
      expectedRevision: x?.revision ?? 0, entry_inventory_revision: d.entry?.revision ?? null, moved_out_on: form.moved_out_on || null,
      rooms: form.rooms, meter_readings: form.meter_readings, evidence_refs: form.refs.split("\n").map(v => v.trim()).filter(Boolean) } }),
    "Exit inventory saved.");
    if (sent) { setForm(null); await onSaved(); }
  };
  const input = (k, label, props) => <label>{label}<input id={`${p}-${k}`} autoComplete="off" {...fe.invalid(k)} {...props} />{fe.error(k)}</label>;
  const select = (k, label, options, props) => <label>{label}<select id={`${p}-${k}`} {...fe.invalid(k)} {...props}><option value="">Choose</option>
    {options}</select>{fe.error(k)}</label>;
  const then = byName(x?.entry?.rooms), current = byName(d.entry?.rooms);
  const missing = (x?.entry?.rooms ?? []).filter(r => !x.rooms.some(y => y.name.toLowerCase() === r.name.toLowerCase()));
  const reading = m => {
    const was = x.entry?.meter_readings.find(e => e.meter === m.meter);
    return `${METER[m.meter]} ${m.reading} ${UNIT[m.unit]}, read ${fmtDay(m.read_on)}${was ? ` (check-in ${was.reading} ${UNIT[was.unit]})` : ""}`;
  };
  const refErrors = Object.entries(fe.errors).filter(([k]) => k.startsWith("evidence_refs.")).map(([k, m]) => `Line ${Number(k.split(".")[1]) + 1}: ${m}`);
  const refsBad = !!(fe.errors.evidence_refs || refErrors.length);
  return <section aria-labelledby={h}>
    <h3 id={h}>Exit inventory</h3>
    <dl className="kv">
      <div><dt>Planned move-out</dt><dd>{fmtDay(t.planned_move_out)}<span className="muted cell-note">From End tenancy</span></dd></div>
      <div><dt>Keys back</dt><dd>{x?.moved_out_on ? fmtDay(x.moved_out_on) : "Not recorded"}<span className="muted cell-note">
        {x?.moved_out_on ? "The tenant has moved out" : "A planned date is not a move-out"}</span></dd></div>
    </dl>
    {!d.entry && !x?.entry && <p className="warn" role="note">No entry inventory recorded, so the rooms cannot be compared with check-in.
      Nothing is filled in for it.</p>}
    {x ? <>
      <p className="muted">Revision {x.revision}, saved {fmtDate(x.updated_at)} by {x.updated_by}. {x.entry
        ? `Compared with entry inventory revision ${x.entry_inventory_revision}.` : "Not compared: there was no entry inventory."}</p>
      {d.entry && d.entry.revision !== x.entry_inventory_revision && <p className="warn" role="note">The entry inventory changed after this
        comparison (now revision {d.entry.revision}).{held ? "" : " Edit the exit inventory to compare again."}</p>}
      <ul className="plain-list">{x.rooms.map((r, i) => {
        const was = then.get(r.name.toLowerCase());
        return <li key={i}><span><strong>{r.name}</strong>: {CONDITION[r.condition]}
          {r.observations && <span className="cell-note">{r.observations}</span>}
          {was && <span className="muted cell-note">At check-in: {was.observations || "no notes"}</span>}</span></li>;
      })}</ul>
      {missing.length > 0 && <p className="warn" role="note">In the entry inventory but not in this one: {missing.map(r => r.name).join(", ")}.</p>}
      {x.meter_readings.length > 0 && <ul className="plain-list">{x.meter_readings.map((m, i) => <li key={i}><span>{reading(m)}</span></li>)}</ul>}
      {x.evidence_refs.length > 0 && <ul className="plain-list">{x.evidence_refs.map(r => <li key={r.evidence_ref}><span>{r.evidence_ref}
        <span className="muted cell-note">Checked by {r.reviewed_by} on {fmtDate(r.reviewed_at)}</span></span></li>)}</ul>}
    </> : <p className="muted">No exit inventory recorded yet.</p>}
    <Note msg={s.msg} onReload={s.reload(onSaved)} />
    {held ? <p className="muted">Kept as recorded: the deposit's progress with mydeposits rests on it.</p>
      : !form ? <div className="inline"><button type="button" className="btn ghost sm" onClick={() => { s.setMsg(null); setForm(toExitForm(d)); }}>
        {x ? "Edit exit inventory" : "Record exit inventory"}</button></div>
      : <form ref={s.ref} className="view-form" onSubmit={save} noValidate aria-label="Exit inventory">
        <div className="field"><label>Keys back on (optional)<input id={`${p}-moved_out_on`} type="date" max={today} value={form.moved_out_on}
          onChange={e => setForm(f => ({ ...f, moved_out_on: e.target.value }))} {...fe.invalid("moved_out_on")}
          aria-describedby={described(fe, "moved_out_on", `d-${p}-keys`)} />{fe.error("moved_out_on")}</label>
          <small id={`d-${p}-keys`} className="muted">Only once the keys are back. Leave it empty while the move-out is planned.</small></div>
        {fe.error("rooms")}
        {form.rooms.map((r, i) => {
          const was = current.get(r.name.trim().toLowerCase());
          return <fieldset key={i} className="choices-set"><legend>Room {i + 1}</legend><div className="grid2">
            {input(`rooms.${i}.name`, "Room", { value: r.name, maxLength: 80, onChange: edit("rooms", i, "name") })}
            {select(`rooms.${i}.condition`, "Compared with check-in", Object.entries(CONDITION).map(([k, v]) =>
              <option key={k} value={k} disabled={k === "as_entry" && !was}>{v}</option>), { value: r.condition, onChange: edit("rooms", i, "condition") })}
            <label>Observations{r.condition === "changed" ? ": what changed" : " (optional)"}<textarea id={`${p}-rooms.${i}.observations`}
              className="short" value={r.observations} maxLength={2000} onChange={edit("rooms", i, "observations")}
              {...fe.invalid(`rooms.${i}.observations`)} />{fe.error(`rooms.${i}.observations`)}</label></div>
            <p className="muted cell-note">{was ? `At check-in: ${was.observations || "no notes"}`
              : d.entry ? "Not in the entry inventory." : "No entry inventory to compare with."}</p>
            {form.rooms.length > 1 && <div className="inline"><button type="button" className="btn ghost sm" onClick={() => drop("rooms", i)}>
              Remove<span className="sr"> room {i + 1}</span></button></div>}
          </fieldset>;
        })}
        <div className="inline"><button type="button" className="btn ghost sm" onClick={() => add("rooms", blankRoom(""))}>Add room</button></div>
        {fe.error("meter_readings")}
        {form.meter_readings.map((m, i) => <fieldset key={i} className="choices-set"><legend>Meter reading {i + 1}</legend><div className="grid2">
          {select(`meter_readings.${i}.meter`, "Meter", Object.entries(METER).map(([k, v]) => <option key={k} value={k}>{v}</option>),
            { value: m.meter ?? "", onChange: edit("meter_readings", i, "meter") })}
          {input(`meter_readings.${i}.reading`, "Reading", { value: m.reading ?? "", inputMode: "decimal", onChange: edit("meter_readings", i, "reading") })}
          {select(`meter_readings.${i}.unit`, "Unit", Object.entries(UNIT).map(([k, v]) => <option key={k} value={k}>{v}</option>),
            { value: m.unit ?? "", onChange: edit("meter_readings", i, "unit") })}
          {input(`meter_readings.${i}.read_on`, "Read on", { type: "date", max: today, value: m.read_on ?? "", onChange: edit("meter_readings", i, "read_on") })}</div>
          <div className="inline"><button type="button" className="btn ghost sm" onClick={() => drop("meter_readings", i)}>Remove<span className="sr">
            {" "}meter reading {i + 1}</span></button></div>
        </fieldset>)}
        <div className="inline"><button type="button" className="btn ghost sm" onClick={() => add("meter_readings", { meter: "", reading: "", unit: "",
          read_on: "" })}>Add meter reading</button></div>
        <div className="field"><label>Evidence references (optional, one per line, up to 20)<textarea id={`${p}-evidence_refs`} className="short"
          value={form.refs} onChange={e => setForm(f => ({ ...f, refs: e.target.value }))} aria-invalid={refsBad || undefined}
          aria-describedby={[`d-${p}-refs`, refsBad && `e-${p}-refs`].filter(Boolean).join(" ")} />
          {refsBad && <small id={`e-${p}-refs`} className="err">{[fe.errors.evidence_refs, ...refErrors].filter(Boolean).join(" ")}</small>}</label>
          <small id={`d-${p}-refs`} className="muted">Where this tenancy's checked photos or documents are kept, like a folder name. The app does not
            receive, store or open them.</small></div>
        <div className="inline"><button className="btn sm" disabled={s.busy}>{s.busy ? "Saving…" : "Save exit inventory"}</button>
          <button type="button" className="btn ghost sm" onClick={() => { setForm(null); s.setMsg(null); fe.setErrors({}); }}>Cancel</button></div>
      </form>}
  </section>;
}

const toLines = pr => (pr?.lines ?? []).map(l => ({ reason: l.reason, amount: (l.amount_pence / 100).toFixed(2), evidence_ref: l.evidence_ref ?? "" }));

function Deposit({ d, onSaved }) {
  const t = d.tenancy, pr = d.proposal, x = d.exit, held = d.outcomes.length > 0, last = d.outcomes.at(-1), p = `dp${t.id}`, h = `h-${p}`;
  const [lines, setLines] = useState(null), s = useSave(p), { fe } = s;
  if (t.deposit_pence == null) return <section aria-labelledby={h}><h3 id={h}>Deposit</h3>
    <p className="muted">No deposit is recorded on this tenancy. Enter it with Edit details to propose deductions.</p></section>;
  const refs = [...new Set([x, d.entry].flatMap(v => v?.evidence_refs ?? []).map(r => r.evidence_ref))];
  const edit = (i, k) => e => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: e.target.value } : l)));
  const total = (lines ?? []).reduce((sum, l) => sum + Math.max(0, parseMoney(l.amount) ?? 0), 0);
  const save = async e => {
    e.preventDefault();
    const sent = await s.run(() => api(`/admin/tenancies/${t.id}/deposit-proposal`, { method: "PUT", body: { tenancy_id: t.id,
      expectedRevision: pr?.revision ?? 0, lines: lines.map(l => ({ reason: l.reason, amount_pence: parseMoney(l.amount),
        evidence_ref: l.evidence_ref || null })) } }), "Proposed deductions saved. Nothing is agreed or paid by saving them.");
    if (sent) { setLines(null); await onSaved(); }
  };
  return <section aria-labelledby={h}>
    <h3 id={h}>Deposit</h3>
    <p>Held: <strong>{pence(t.deposit_pence)}</strong>{t.deposit_ref && <span className="muted cell-note">{t.deposit_ref}</span>}</p>
    <p role="note" className={last?.status === "disputed" ? "warn" : undefined}>{!pr ? "No deductions proposed yet."
      : !last ? "Deductions proposed: not agreed, not requested in mydeposits and not returned."
        : `${OUTCOME[last.status]} on ${fmtDay(last.occurred_on)}.`}</p>
    {pr && <>
      {pr.lines.length ? <ul className="plain-list">{pr.lines.map((l, i) => <li key={i}><span>{l.reason}
        {l.evidence_ref && <span className="muted cell-note">Evidence: {l.evidence_ref}</span>}</span><span className="num">{pence(l.amount_pence)}</span></li>)}</ul>
        : <p>No deductions.</p>}
      <p>Proposed deductions <strong>{pence(pr.total_pence)}</strong> of {pence(pr.deposit_pence)}; if agreed, {pence(pr.deposit_pence - pr.total_pence)} would
        go back to the tenant.<span className="muted cell-note">Saved {fmtDate(pr.updated_at)} by {pr.updated_by}</span></p>
      {pr.deposit_pence !== t.deposit_pence && <p className="warn" role="note">The deposit on the tenancy is now {pence(t.deposit_pence)}, not
        {" "}{pence(pr.deposit_pence)}.{held ? "" : " Edit the proposal to check it."}</p>}
    </>}
    <Note msg={s.msg} onReload={s.reload(onSaved)} />
    {!x ? <p className="muted">Record the exit inventory first: the deductions rest on it.</p>
      : held ? null
      : !lines ? <div className="inline"><button type="button" className="btn ghost sm" onClick={() => { s.setMsg(null); setLines(toLines(pr)); }}>
        {pr ? "Edit proposed deductions" : "Propose deductions"}</button></div>
      : <form ref={s.ref} className="view-form" onSubmit={save} noValidate aria-label="Proposed deductions">
        {lines.map((l, i) => <fieldset key={i} className="choices-set"><legend>Deduction {i + 1}</legend><div className="grid2">
          <label>For<input id={`${p}-lines.${i}.reason`} value={l.reason} maxLength={200} autoComplete="off" onChange={edit(i, "reason")}
            {...fe.invalid(`lines.${i}.reason`)} />{fe.error(`lines.${i}.reason`)}</label>
          <label>Amount (£)<input id={`${p}-lines.${i}.amount_pence`} value={l.amount} inputMode="decimal" autoComplete="off" onChange={edit(i, "amount")}
            {...fe.invalid(`lines.${i}.amount_pence`)} />{fe.error(`lines.${i}.amount_pence`)}</label>
          <label>Evidence (optional)<select id={`${p}-lines.${i}.evidence_ref`} value={l.evidence_ref} onChange={edit(i, "evidence_ref")}
            {...fe.invalid(`lines.${i}.evidence_ref`)}><option value="">None</option>{refs.map(r => <option key={r} value={r}>{r}</option>)}</select>
            {fe.error(`lines.${i}.evidence_ref`)}</label></div>
          <div className="inline"><button type="button" className="btn ghost sm" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>
            Remove<span className="sr"> deduction {i + 1}</span></button></div>
        </fieldset>)}
        <div className="inline"><button type="button" className="btn ghost sm" onClick={() => setLines(ls => [...ls, { reason: "", amount: "",
          evidence_ref: "" }])}>Add deduction</button></div>
        <p aria-live="polite">{lines.length ? <>Total <strong>{pence(total)}</strong> of {pence(t.deposit_pence)}.</>
          : "No deductions: the whole deposit would go back to the tenant."}</p>
        {fe.error("lines")}
        <p className="muted">Evidence lists the references recorded in this tenancy's inventories. Saving proposes these deductions: it does not
          agree them, request them in mydeposits or move money.</p>
        <div className="inline"><button className="btn sm" disabled={s.busy}>{s.busy ? "Saving…" : "Save proposed deductions"}</button>
          <button type="button" className="btn ghost sm" onClick={() => { setLines(null); s.setMsg(null); fe.setErrors({}); }}>Cancel</button></div>
      </form>}
    {d.outcomes.length > 0 && <ol className="plain-list" aria-label="Deposit steps with mydeposits">{d.outcomes.map(o => <li key={o.revision}>
      <span><strong>{OUTCOME[o.status]}</strong> on {fmtDay(o.occurred_on)}<span className="muted cell-note">{o.evidence_ref}. Recorded by
        {" "}{o.recorded_by} on {fmtDate(o.recorded_at)}</span></span></li>)}</ol>}
    {pr && last?.status !== "returned" && <DepositStep d={d} onSaved={onSaved} />}
  </section>;
}

// One step with mydeposits, from a confirmation someone checked; a return is the last.
function DepositStep({ d, onSaved }) {
  const t = d.tenancy, p = `ds${t.id}`, today = jerseyToday(), moved = d.exit?.moved_out_on;
  const blank = { status: "", occurred_on: today, evidence_ref: "" }, [f, setF] = useState(blank), s = useSave(p), { fe } = s;
  if (!moved) return <p className="muted">Record the day the keys came back in the exit inventory before recording a step with mydeposits.</p>;
  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const save = async e => {
    e.preventDefault();
    const sent = await s.run(() => api(`/admin/tenancies/${t.id}/deposit-outcomes`, { method: "POST", body: { tenancy_id: t.id,
      expectedRevision: d.proposal.revision, status: f.status || null, occurred_on: f.occurred_on || null, evidence_ref: f.evidence_ref } }),
    "Step recorded.");
    if (sent) { setF(blank); await onSaved(); }
  };
  return <form ref={s.ref} className="view-form" onSubmit={save} noValidate aria-label="Record a deposit step">
    <div className="grid2">
      <label>What happened<select id={`${p}-status`} value={f.status} onChange={set("status")} {...fe.invalid("status")}>
        <option value="">Choose</option>{Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{fe.error("status")}</label>
      <label>On<input id={`${p}-occurred_on`} type="date" min={moved} max={today} value={f.occurred_on} onChange={set("occurred_on")}
        {...fe.invalid("occurred_on")} />{fe.error("occurred_on")}</label>
    </div>
    <div className="field"><label>Where the confirmation is kept<input id={`${p}-evidence_ref`} value={f.evidence_ref} maxLength={120} autoComplete="off"
      onChange={set("evidence_ref")} {...fe.invalid("evidence_ref")} aria-describedby={described(fe, "evidence_ref", `d-${p}`)} />{fe.error("evidence_ref")}</label>
      <small id={`d-${p}`} className="muted">Record only what mydeposits or both parties confirmed. A request is not a return, and nothing here
        moves money.</small></div>
    <Note msg={s.msg} onReload={s.reload(onSaved)} />
    <div className="inline"><button className="btn ghost sm" disabled={s.busy}>{s.busy ? "Recording…" : "Record step"}</button></div>
  </form>;
}
