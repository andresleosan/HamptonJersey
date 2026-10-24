import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDay } from "./format.js";
import { setUnsaved } from "./unsaved.js";
import { Received, money, useFieldErrors } from "./Sales.jsx";
import { GAS, KIND, MarkStep, REPAIR_STATUS, SERVICE, URGENCY, checkState, pence } from "./Rentals.jsx";
import { ChangeRent, CorrectCharge, DETAILS, EditTenancy, EndTenancy, NewTenancy, RecordNotice, RecordPayment, Renew, RepairDialog,
  UpdateCheck, needsApproval, rentLine } from "./RentalDialogs.jsx";
import { OPTIONS } from "../../server/applicants.js";
import { ARREARS_STEPS, COMPLIANCE, LEGAL } from "../../server/rentals.js";
import { jerseyToday, plusDays } from "../../server/viewings.js";

// Spec §4 property page (#/rentals/<id>): the work first (its tenancy with the payment reference, balance, arrears and
// actions; its checks; its repairs), so a phone shows it above the property's details, which save with the Save bar
// (locked by updated_at). Past tenancies and the history are folded at the end. Every write reloads the page and the
// bar's count (onChange).
const FIELDS = ["address", "parish", "service", "fee_percent", "has_gas", "notes"];
const toForm = r => ({ address: r.address, parish: r.parish, service: r.service, fee_percent: r.fee_percent == null ? "" : String(r.fee_percent),
  has_gas: GAS.find(g => g[2] === (r.has_gas == null ? null : r.has_gas === 1))[0], notes: r.notes ?? "", collect_from: "" });
const toBody = f => ({ address: f.address.trim() || null, parish: f.parish || null, service: f.service, fee_percent: f.fee_percent.trim() || null,
  has_gas: GAS.find(([k]) => k === f.has_gas)[2], notes: f.notes.trim() || null });
const DIALOGS = { payment: RecordPayment, rent: ChangeRent, renew: Renew, notice: RecordNotice, end: EndTenancy, charge: CorrectCharge,
  edit: EditTenancy, check: UpdateCheck, repair: RepairDialog };
const day = iso => fmtDay(jerseyToday(new Date(iso)));
const FINAL = ["done", "cancelled"];
const TONE = { reported: "active", awaiting_approval: "attention", approved: "active", in_progress: "active", done: "positive", cancelled: "neutral" };

export default function RentalDetail({ id, onChange }) {
  const [data, setData] = useState(null), [loadErr, setLoadErr] = useState(null), [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [dialog, setDialog] = useState(null), [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false), [addDirty, setAddDirty] = useState(false), [pastOpen, setPastOpen] = useState(false);
  const { errors, setErrors, invalid, error } = useFieldErrors("rt");
  const formRef = useRef(null), heading = useRef(null), refocus = useRef(false);
  // fresh: the details form starts again from what is saved; otherwise it keeps what is being typed.
  const load = fresh => api(`/admin/rentals/${id}`).then(d => { setData(d); setLoadErr(null); if (fresh) { setForm(toForm(d.rental)); setErrors({}); } },
    e => setLoadErr(e.message));
  useEffect(() => { load(true); }, [id]);
  useEffect(() => { formRef.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);
  // A change that removed the dialog's opener (an ended tenancy goes to Past tenancies): the heading takes the focus.
  useEffect(() => {
    if (refocus.current && document.activeElement === document.body) heading.current?.focus();
    refocus.current = false;
  }, [data]);

  const body = form && toBody(form), saved = data && toBody(toForm(data.rental));
  const changed = data && form ? FIELDS.filter(k => body[k] !== saved[k]) : [];
  const dirty = changed.length > 0;
  useEffect(() => { setUnsaved(dirty || addDirty); return () => setUnsaved(false); }, [dirty, addDirty]);

  if (!data) return loadErr ? <p role="alert" className="err">{loadErr}{" "}
    <button type="button" className="btn ghost sm" onClick={() => load(true)}>Try again</button> · <a href="#/rentals">Back to rentals</a></p>
    : <p>Loading property…</p>;
  const r = data.rental, today = jerseyToday(), archived = !!r.archived_at;
  const running = data.tenancies.filter(t => !t.ended_on || t.ended_on > today), past = data.tenancies.filter(t => !running.includes(t));
  // R22: going from let only to full with a tenancy running asks from when Hampton collects its rent.
  const switching = r.service === "let_only" && form.service === "full" && running.length > 0;

  const reload = () => { load(); setTick(n => n + 1); };
  const finish = where => text => { setDialog(null); setMsg({ where, text }); refocus.current = true; reload(); onChange(); };
  const open = (kind, props, where) => { setMsg(null); setDialog({ kind, props, where }); };
  const note = where => msg?.where === where && <p role="status" className="ok">{msg.text}</p>;
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await api(`/admin/rentals/${id}`, { method: "PUT", body: { ...Object.fromEntries(changed.map(k => [k, body[k]])),
        ...(switching ? { collect_from: form.collect_from || null } : {}), updated_at: r.updated_at } });
      await load(true); setTick(n => n + 1); onChange(); setMsg({ where: "bar", ok: true, text: "Changes saved." });
    } catch (e) {
      setErrors(e.data?.fields || {}); setMsg({ where: "bar", text: e.message, stale: e.status === 409 && /Reload/.test(e.message) });
    } finally { setBusy(false); }
  };
  const archive = async () => {
    if (!archived && !confirm(`Archive ${r.address}? It leaves the Rentals list (Archived only finds it) and can be restored.`)) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/admin/rentals/${id}/${archived ? "restore" : "archive"}`, { method: "POST" });
      await load(); onChange(); setMsg({ where: "bar", ok: true, text: archived ? "Property restored." : "Property archived." });
    } catch (e) { setMsg({ where: "bar", text: e.message }); }
    finally { setBusy(false); }
  };
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  // hint: linked to the control, with the error when there is one.
  const ctl = (k, label, extra = {}, hint) => {
    const c = <label>{label}<input id={`rt-${k}`} value={form[k]} onChange={set(k)} autoComplete="off" {...invalid(k)} {...extra}
      aria-describedby={[hint && `d-rt-${k}`, invalid(k)["aria-describedby"]].filter(Boolean).join(" ") || undefined} />{error(k)}</label>;
    return hint ? <div className="field">{c}<small id={`d-rt-${k}`} className="muted">{hint}</small></div> : c;
  };
  const radios = (k, legend, options, hint) => <fieldset className="choices-set"><legend>{legend}</legend>
    <div className="choices">{options.map(([v, t]) => <label key={v} className="check"><input type="radio" name={`rt-${k}`} value={v}
      checked={form[k] === v} onChange={set(k)} aria-invalid={errors[k] ? true : undefined} aria-describedby={errors[k] ? `e-rt-${k}` : undefined} />{t}</label>)}</div>
    {hint && <small className="muted">{hint}</small>}{error(k)}</fieldset>;
  const Dialog = dialog && DIALOGS[dialog.kind];

  // A div, not a section: the entrance animation of `.page>section` would make it the box the fixed action bar sits in.
  return <div className="record">
    <div className="head">
      <div><h1 id="t-rental" ref={heading} tabIndex={-1}>{r.address}</h1>
        <p className="muted">{r.parish} · {SERVICE[r.service]}{r.service === "full" && r.fee_percent != null && `, ${r.fee_percent}% fee`} · Landlord{" "}
          <a href={`#/rentals/landlords/${r.landlord_id}`}>{r.landlord_name}</a>{archived && <> <span className="badge neutral">Archived</span></>}</p></div>
      <a href="#/rentals">← Back to rentals</a>
    </div>

    <div className="rental">
      <div className="sections">
        {running.map(t => <Tenancy key={t.id} id={t.id} tick={tick} note={note(t.id)} open={(kind, props) => open(kind, props, t.id)} />)}
        {!running.some(t => !t.ended_on) && <section className="card" aria-labelledby="h-new-tenancy">
          <h2 id="h-new-tenancy">{running.length ? "Next tenancy" : "No tenancy"}</h2>
          {adding ? <NewTenancy rental={r} onClose={() => setAdding(false)} onDirty={setAddDirty} onRefused={reload}
            onDone={t => { setAdding(false); finish(t.id)(`Tenancy added for ${t.tenant_name}. Payment reference ${t.payment_ref}.`); }} />
            : archived ? <p className="muted">Restore the property to add a tenancy.</p>
            : <div className="inline"><p className="muted">{running.length ? `The tenant moves out ${fmtDay(running[0].ended_on)}. Enter the next tenancy once it's agreed.`
              : "Nobody rents it through Hampton at the moment."}</p>
              <button type="button" className="btn sm" onClick={() => { setMsg(null); setAdding(true); }}>New tenancy</button></div>}
        </section>}

        <section className="card" aria-labelledby="h-checks"><h2 id="h-checks">Checks</h2>{note("checks")}
          <ul className="plain-list" id="checks">{data.compliance.map(c => <li key={c.kind} className={["overdue", "missing"].includes(c.status) ? "overdue" : undefined}>
            <span>{c.label}<span className="muted cell-note">{c.done_on ? `Done ${fmtDay(c.done_on)}, expires ${fmtDay(c.expires_on)}` : "Not recorded yet"}
              {c.note && ` · ${c.note}`}</span></span>
            <span className="ctl">{checkState({ ...c, due_on: c.expires_on })}
              <button type="button" className="btn ghost sm" onClick={() => open("check", { item: c }, "checks")}>Update<span className="sr"> {c.label}</span></button></span>
          </li>)}</ul>
          {r.has_gas === 0 && <p className="muted">No gas supply, so no gas safety check.</p>}
        </section>

        <section className="card" aria-labelledby="h-repairs">
          <div className="head"><h2 id="h-repairs">Repairs</h2>
            {!archived && <button type="button" className="btn ghost sm" onClick={() => open("repair", {}, "repairs")}>New repair</button>}</div>
          {note("repairs")}
          {data.repairs.length ? <ul className="plain-list" id="repairs">{data.repairs.map(p => {
            const live = !FINAL.includes(p.status);
            return <li key={p.id} className={live && p.urgency === "emergency" ? "overdue" : undefined}>
              <span><strong>{p.title}</strong><span className="muted cell-note">{[p.contractor, p.quote != null && `quote ${money(p.quote)}`,
                p.cost != null && `cost ${money(p.cost)}`, p.done_on && `done ${fmtDay(p.done_on)}`, !p.charge_landlord && "not charged to the landlord"]
                .filter(Boolean).join(" · ") || `Reported ${day(p.created_at)}`}</span>
                {p.approved_at && <span className="muted cell-note">The landlord approved it {day(p.approved_at)}</span>}</span>
              <span className="ctl">{p.urgency === "emergency" ? <strong className="err">Emergency</strong>
                : <span className={`badge ${p.urgency === "urgent" ? "attention" : "neutral"}`}>{URGENCY[p.urgency]}</span>}
                <span className={`badge ${TONE[p.status]}`}>{REPAIR_STATUS[p.status]}</span>
                {live && needsApproval(p, r.approval_limit) && <span className="badge attention">Needs the landlord's approval</span>}
                {live && <button type="button" className="btn ghost sm" onClick={() => open("repair", { repair: p }, "repairs")}>Update<span className="sr"> {p.title}</span></button>}</span>
            </li>;
          })}</ul> : <p className="muted">No repairs recorded.</p>}
        </section>
      </div>

      <div className="sections">
        <form ref={formRef} noValidate onSubmit={e => { e.preventDefault(); if (dirty && !busy) save(); }}>
          <section className="card fields-group" aria-labelledby="h-details"><h2 id="h-details">Details</h2>
            {ctl("address", "Address", { maxLength: 200 })}
            <label>Parish<select id="rt-parish" value={form.parish} onChange={set("parish")} {...invalid("parish")}>
              {OPTIONS.parishes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>{error("parish")}</label>
            {radios("service", "Service", Object.entries(SERVICE))}
            {form.service === "full" && <div className="fee">{ctl("fee_percent", "Management fee (%)", { inputMode: "decimal" })}</div>}
            {switching && ctl("collect_from", "Collect rent from", { type: "date" },
              "Hampton starts collecting the running tenancy's rent on this date; nothing before it is charged.")}
            {radios("has_gas", "Gas supply", GAS.map(([k, t]) => [k, t]), "With gas, or when not sure, the property needs a yearly gas safety check.")}
            <label>Notes (optional)<textarea id="rt-notes" className="short" value={form.notes} maxLength={2000} onChange={set("notes")} {...invalid("notes")} />
              {error("notes")}</label>
          </section>
        </form>
        <section className="card" aria-labelledby="h-landlord"><h2 id="h-landlord">Landlord</h2>
          <p><a href={`#/rentals/landlords/${r.landlord_id}`}>{r.landlord_name}</a></p>
          {(r.landlord_email || r.landlord_phone) && <p className="muted">{[r.landlord_email, r.landlord_phone].filter(Boolean).join(" · ")}</p>}
          <p className="muted">{r.approval_limit != null ? `Approves repairs above ${money(r.approval_limit)}.` : "No approval limit for repairs."}</p>
        </section>
      </div>
    </div>

    {past.length > 0 && <section className="block" aria-labelledby="h-past"><details className="closed" onToggle={e => setPastOpen(e.currentTarget.open)}>
      <summary><h2 id="h-past">Past tenancies <span className="muted">({past.length})</span></h2></summary>
      {pastOpen && <div className="sections">{past.map(t => <Tenancy key={t.id} id={t.id} tick={tick} note={note(t.id)}
        open={(kind, props) => open(kind, props, t.id)} />)}</div>}
    </details></section>}

    <section className="block" aria-labelledby="h-history"><details className="closed">
      <summary><h2 id="h-history">History <span className="muted">({data.events.length})</span></h2></summary>
      {data.events.length ? <ol className="timeline card">{data.events.map(e => <li key={e.id}>
        <p>{EVENT[e.type]?.(e.data ?? {}, data) ?? e.type}</p><p className="muted"><Received at={e.at} /> · {e.actor}</p></li>)}</ol>
        : <p className="muted">Nothing recorded yet.</p>}
      {data.events.length === 100 && <p className="muted">The latest 100 changes.</p>}
    </details></section>

    <div className="actionbar" role="region" aria-label="Actions">
      {msg?.where === "bar" && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}
        {msg.stale && <> <button type="button" className="btn ghost sm" onClick={() => { setMsg(null); load(true); }}>Reload</button></>}</p>}
      {dirty && <span className="unsaved">Unsaved changes</span>}
      <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</button>
      {dirty && <button type="button" className="btn ghost" onClick={() => { setForm(toForm(r)); setErrors({}); setMsg(null); }} disabled={busy}>Discard</button>}
      <span className="spacer" />
      <button type="button" className="btn ghost" onClick={archive} disabled={busy || dirty} title={dirty ? "Save first" : undefined}>
        {archived ? "Restore property" : "Archive property"}</button>
    </div>
    {dialog?.kind === "step" && <MarkStep row={dialog.props.row} onClose={() => setDialog(null)} onDone={m => finish(dialog.where)(m.text)} onRefused={reload} />}
    {Dialog && <Dialog {...dialog.props} rental={r} onClose={() => setDialog(null)} onDone={finish(dialog.where)} onRefused={reload} />}
  </div>;
}

// One tenancy, loaded on its own (P1): the payment reference, balance and arrears (full management), its deadlines, and
// the charges and payments of the last 24 months (the newest six until asked for all).
const DONE = { deposit: ["deposit_protected_on", "Deposit protection"], inventory_in: ["inventory_in_on", "Check-in report"],
  inventory_out: ["inventory_out_on", "Check-out report"] };
const SHORT = 6;
function Tenancy({ id, tick, note, open }) {
  const [d, setD] = useState(null), [err, setErr] = useState(null), [all, setAll] = useState(false);
  const load = () => api(`/admin/tenancies/${id}`).then(x => { setD(x); setErr(null); }, e => setErr(e.message));
  useEffect(() => { load(); }, [id, tick]);
  const h = `h-tenancy-${id}`;
  if (!d) return <section className="card" id={`tenancy-${id}`} aria-labelledby={h}><h2 id={h}>Tenancy</h2>
    {err ? <p role="alert" className="err">{err} <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>
      : <p>Loading tenancy…</p>}</section>;
  const t = d.tenancy, a = d.arrears, today = jerseyToday(), ended = !!t.ended_on && t.ended_on <= today, full = t.service === "full";
  const act = (kind, extra) => () => open(kind, { d, ...extra });
  const more = rows => rows.length > SHORT && <button type="button" className="linkish" aria-expanded={all} onClick={() => setAll(x => !x)}>
    {all ? "Show the newest only" : `Show all ${rows.length} (last 24 months)`}</button>;
  return <section className="card tenancy" id={`tenancy-${id}`} aria-labelledby={h}>
    <div className="head">
      <div><h2 id={h}>{ended ? "Past tenancy" : "Tenancy"}: {t.tenant_name}</h2>
        <p className="muted">{[t.kind === "fixed" ? `Fixed term ${fmtDay(t.start_on)} to ${fmtDay(t.end_on)}` : `Periodic from ${fmtDay(t.start_on)}`,
          `${t.regime} law`, t.tenant_email, t.tenant_phone].filter(Boolean).join(" · ")}</p></div>
      <p className="ref"><span className="muted">Payment reference</span> <strong>{t.payment_ref}</strong></p>
    </div>
    {note}
    {t.ended_on ? <p className="warn" role="note">{ended ? `Ended ${fmtDay(t.ended_on)}.` : `Moves out ${fmtDay(t.ended_on)}.`}</p>
      : t.kind === "fixed" && !t.notice_given_on && t.end_on <= plusDays(today, LEGAL.renewalDays) ? <p className="warn" role="note">
        {t.end_on < today ? `Fixed term ended ${fmtDay(t.end_on)}: renew it, or record notice.` : `Renewal due: the fixed term ends ${fmtDay(t.end_on)}.`}</p>
      : t.notice_given_on && <p className="warn" role="note">Notice given by the {t.notice_by} on {fmtDay(t.notice_given_on)}. Earliest move-out:
        {" "}{fmtDay(d.earliest_move_out)}.</p>}
    <dl className="kv">
      <div><dt>Rent</dt><dd className="rent">{rentLine(t, d.current_rent)}
        <span className="muted cell-note">Due on day {t.due_day} of each month</span></dd></div>
      <div><dt>Deposit</dt><dd>{t.deposit != null ? money(t.deposit) : "—"}{t.deposit_ref && <span className="muted cell-note">{t.deposit_ref}</span>}</dd></div>
      {full && <div><dt>Collecting from</dt><dd>{t.collect_from ? fmtDay(t.collect_from) : "—"}</dd></div>}
      {t.occupants && <div><dt>Other occupants</dt><dd>{t.occupants}</dd></div>}
    </dl>
    {full && <div className="owed">
      <p className="balance"><span className="muted">Balance</span><strong className="num">{pence(Math.abs(d.balance))}</strong>
        <span className="muted">{d.balance > 0 ? "owed" : d.balance < 0 ? "in credit" : "nothing owed"}</span></p>
      <div className="late">{!a ? !ended && <p>Not late.</p> : a.days_late === 0 ? <p>Rent due today, not late yet.</p> : <>
        <p><strong className="err">{a.days_late} days late</strong> since {fmtDay(a.oldest_unpaid_on)}</p>
        {a.done.map(s => <p key={s.step} className="muted">{ARREARS_STEPS.find(x => x[1] === s.step)[2]} done {day(s.done_at)}{s.note && `: ${s.note}`}</p>)}
        {a.next_step && <p className="ctl">Next step: <strong>{a.next_step.label}</strong>
          <button type="button" className="btn sm" onClick={() => open("step", { row: { tenancy_id: t.id, oldest_unpaid_on: a.oldest_unpaid_on,
            next_step: a.next_step, tenant_name: t.tenant_name, address: t.address, payment_ref: t.payment_ref, balance: d.balance, days_late: a.days_late } })}>
            Mark done<span className="sr">: {a.next_step.label}</span></button></p>}</>}</div>
    </div>}
    <div className="ctl">
      <button type="button" className="btn sm" onClick={act("payment")}>Record payment</button>
      {!ended && <button type="button" className="btn ghost sm" onClick={act("rent")}>Change rent</button>}
      {!t.ended_on && <>
        {t.kind === "fixed" && <button type="button" className="btn ghost sm" onClick={act("renew")}>Renew</button>}
        <button type="button" className="btn ghost sm" onClick={act("notice")}>Record notice</button>
        <button type="button" className="btn ghost sm danger" onClick={act("end")}>End tenancy</button></>}
      <button type="button" className="btn ghost sm" onClick={act("edit", { keys: DETAILS, title: "Tenancy details" })}>Edit details</button>
    </div>

    {d.deadlines.length > 0 && <><h3>Deadlines</h3><ul className="plain-list">{d.deadlines.map(x => <li key={x.key} className={x.status === "overdue" ? "overdue" : undefined}>
      <span>{x.label}<span className="muted cell-note">{x.done_on ? `Done ${fmtDay(x.done_on)}` : `Due ${fmtDay(x.due_on)}`}</span></span>
      <span className="ctl">{checkState(x)}<button type="button" className="btn ghost sm" onClick={act("edit", { keys: [DONE[x.key][0]], title: DONE[x.key][1] })}>
        Update<span className="sr"> {x.label}</span></button></span></li>)}</ul></>}

    {full && <><h3 id={`h-charges-${id}`}>Charges</h3>
      {d.charges.length ? <div className="table-scroll" role="region" aria-labelledby={`h-charges-${id}`} tabIndex={0}>
        <table className="list small" id={`charges-${id}`}><thead><tr><th scope="col">Due</th><th scope="col">Amount</th><th scope="col">For</th>
          <th scope="col"><span className="sr">Actions</span></th></tr></thead>
          <tbody>{(all ? d.charges : d.charges.slice(0, SHORT)).map(c => <tr key={c.id}>
            <td className="num">{fmtDay(c.due_on)}</td>
            <td className="num">{pence(c.amount)}{c.edited ? <span className="muted cell-note">Corrected by hand</span> : null}</td>
            <td>{c.kind === "opening" ? "Owed when collection started" : c.due_on > today ? "Rent, not due yet" : "Rent"}</td>
            <td><button type="button" className="btn ghost sm" onClick={act("charge", { c })}>Correct<span className="sr"> the charge due {fmtDay(c.due_on)}</span></button></td>
          </tr>)}</tbody></table></div>
        : <p className="muted">No charges yet{t.collect_from && `: the first falls due ${fmtDay(t.collect_from)}`}.</p>}
      {more(d.charges)}</>}
    <h3 id={`h-payments-${id}`}>Payments</h3>
    {d.payments.length ? <div className="table-scroll" role="region" aria-labelledby={`h-payments-${id}`} tabIndex={0}>
      <table className="list small" id={`payments-${id}`}><thead><tr><th scope="col">Received</th><th scope="col">Amount</th><th scope="col">Kind</th>
        <th scope="col">Description</th></tr></thead>
        <tbody>{(all ? d.payments : d.payments.slice(0, SHORT)).map(p => <tr key={p.id}>
          <td className="num">{fmtDay(p.received_on)}</td><td className="num">{pence(p.amount)}</td>
          <td>{KIND[p.kind]}<span className="muted cell-note">{p.source === "import" ? "Bank import" : "By hand"}</span></td>
          <td className="wrap">{p.description ?? "—"}</td></tr>)}</tbody></table></div>
      : <p className="muted">No payments in the last 24 months.</p>}
    {more(d.payments)}
  </section>;
}

// The history's lines (R18), from each event's data.
const keys = o => Object.keys(o ?? {}).map(k => k.replaceAll("_", " ")).join(", ");
const CHECK = Object.fromEntries(COMPLIANCE.map(([k, label]) => [k, label]));
const EVENT = {
  "rental.created": () => "Property added",
  "rental.updated": d => `Details changed: ${keys(d.after)}${d.collect_from ? `; rent collected from ${fmtDay(d.collect_from)}` : ""}`,
  "rental.archived": () => "Property archived",
  "rental.restored": () => "Property restored",
  "compliance.updated": d => `${CHECK[d.kind]} done ${fmtDay(d.after.done_on)}, expires ${fmtDay(d.after.expires_on)}`,
  "repair.created": d => `Repair reported: ${d.title}`,
  "repair.updated": (d, { repairs }) => `Repair ${repairs.find(p => p.id === d.repair_id)?.title ?? ""} updated: ${d.after.status
    ? REPAIR_STATUS[d.after.status] : keys(d.after)}`,
  "tenancy.created": d => `Tenancy entered for ${d.tenant_name}`,
  "tenancy.updated": d => `Tenancy details changed: ${keys(d.after)}`,
  "tenancy.renewed": d => (d.after.kind === "fixed" ? `Tenancy renewed until ${fmtDay(d.after.end_on)}` : "Tenancy renewed as periodic"),
  "tenancy.ended": d => `Tenancy ends ${fmtDay(d.ended_on)}${d.removed?.count
    ? `; ${d.removed.count} later rent charge${d.removed.count === 1 ? "" : "s"} removed (${pence(d.removed.amount)})` : ""}`,
  "notice.recorded": d => `Notice given by the ${d.by} on ${fmtDay(d.given_on)}; earliest move-out ${fmtDay(d.earliest_move_out)}`,
  "rent.changed": d => `Rent changed from ${money(d.before)} to ${money(d.rent)} pcm from ${fmtDay(d.effective_on)}`,
  "charge.edited": d => `Charge due ${fmtDay(d.due_on)} corrected from ${pence(d.before)} to ${pence(d.after)}`,
  "arrears.step_done": d => `${ARREARS_STEPS.find(x => x[1] === d.step)?.[2]} marked done${d.note ? `: ${d.note}` : ""}`,
  "payment.recorded": d => `${KIND[d.kind]} payment of ${pence(d.amount)} recorded`,
  "payment.updated": d => (d.after.tenancy_id ? `Payment assigned as ${KIND[d.after.kind].toLowerCase()}` : "Payment moved back to Unmatched"),
  "payments.imported": d => `${d.added} bank payment${d.added === 1 ? "" : "s"} imported (${pence(d.amount)})${d.by_hand
    ? `; ${d.by_hand} already recorded by hand` : ""}`,
};
