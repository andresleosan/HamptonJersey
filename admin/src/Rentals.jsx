import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDay } from "./format.js";
import { setUnsaved } from "./unsaved.js";
import { Modal, Received, money, pounds, useFieldErrors } from "./Sales.jsx";
import { OPTIONS } from "../../server/applicants.js";
import { LEGAL } from "../../server/rentals.js";
import { jerseyToday } from "../../server/viewings.js";

// Spec §4 Rentals (#/rentals): what needs doing today, in blocks, then every managed property with search and filters.
// Charges, payments and balances are in pence; rents, quotes and limits in whole pounds (R20).
export const pence = p => (p / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
export const SERVICE = { full: "Full management", let_only: "Let only" };
const MARK = { arrears: "Arrears", compliance: "Checks due", renewals: "Renewal", repairs: "Open repair" };
const SHOW = { arrears: "With arrears", compliance: "With checks due", renewals: "With a renewal due", repairs: "With an open repair" };
const URGENCY = { emergency: "Emergency", urgent: "Urgent", routine: "Routine" };
const REPAIR_STATUS = { reported: "Reported", awaiting_approval: "Awaiting approval", approved: "Approved", in_progress: "In progress" };
const KIND = { rent: "Rent", deposit: "Deposit", other: "Other" };
const AS = { rent: "rent", deposit: "a deposit", other: "other money" };
const WARN = Math.max(...LEGAL.warnDays);
const daysTo = d => Math.round((Date.parse(d) - Date.parse(jerseyToday())) / 864e5);
// What New property says once it has gone back to the list.
let added = null;

const Block = ({ id, title, rows, empty, head, children }) => <section className="block" aria-labelledby={id}>
  <h3 id={id}>{title} <span className="muted">({rows.length})</span></h3>
  {rows.length ? <div className="table-scroll" role="region" aria-labelledby={id} tabIndex={0}>
    <table className="list"><thead><tr>{head.map(h => <th key={h} scope="col">{h || <span className="sr">Actions</span>}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
    : <p className="empty card slim">{empty}</p>}
</section>;
const checkState = c => c.status === "missing" ? <strong className="err">Not recorded</strong>
  : c.status === "overdue" ? <strong className="err">Overdue</strong>
  : <span className={`badge ${c.status === "due7" ? "attention" : "neutral"}`}>{inDays(daysTo(c.due_on))}</span>;
const inDays = n => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`);

export default function Rentals({ onChange }) {
  const [data, setData] = useState(null), [loadErr, setLoadErr] = useState(null), [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(() => added && { text: added }), [dialog, setDialog] = useState(null);
  const [f, setF] = useState({ q: "", service: "", filter: "", archived: false }), [tick, setTick] = useState(0);
  const head = useRef(null), refocus = useRef(false);
  useEffect(() => { added = null; }, []);
  const query = new URLSearchParams(Object.entries({ q: f.q.trim(), service: f.service, filter: f.filter, archived: f.archived ? "1" : "" })
    .filter(([, v]) => v)).toString();
  // Typing and filters reload a moment after the last change; only the latest answer shows.
  useEffect(() => {
    let live = true;
    setBusy(true);
    const t = setTimeout(() => api(`/admin/rentals${query && `?${query}`}`).then(d => { if (live) { setData(d); setLoadErr(null); setBusy(false); } },
      e => { if (live) { setLoadErr(e.message); setBusy(false); } }), data ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [query, tick]);
  // A row that a change removed took the dialog's opener with it: the To do heading takes the focus.
  useEffect(() => {
    if (refocus.current && document.activeElement === document.body) head.current?.focus();
    refocus.current = false;
  }, [data]);

  const reload = () => setTick(n => n + 1);
  const done = m => { setDialog(null); setMsg(m); refocus.current = true; reload(); onChange(); };
  const open = (kind, row) => () => { setMsg(null); setDialog({ kind, row }); };
  const set = k => e => setF(x => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const todo = data?.todo, t = data?.totals, filtered = query !== "";

  return <section className="rentals" aria-labelledby="t-rentals">
    <div className="head"><h1 id="t-rentals">Rentals</h1>
      <div className="ctl"><button type="button" className="btn ghost" onClick={open("landlord")}>New landlord</button>
        <a className="btn" href="#/rentals/new">New property</a></div></div>
    {msg && <p role="status" className="ok">{msg.text}{msg.landlord && <> <a href={`#/rentals/new?landlord=${msg.landlord.id}`}>
      Add a property for {msg.landlord.name}</a></>}</p>}
    {loadErr && <p role="alert" className="err">{loadErr} <button type="button" className="btn ghost sm" onClick={reload}>Try again</button></p>}
    {!data ? !loadErr && <p>Loading rentals…</p> : <>
      <p className="muted">{t.properties} {t.properties === 1 ? "property" : "properties"}, {t.occupied} with a tenancy · {pence(t.owed)} owed</p>

      <h2 ref={head} tabIndex={-1} className="todo-title">To do</h2>
      <Block id="h-arrears" title="Arrears" rows={todo.arrears} empty="No tenant needs an arrears step today."
        head={["Property", "Owed", "Late", "Next step", ""]}>
        {todo.arrears.map(a => <tr key={a.tenancy_id} className="overdue">
          <td>{a.address}<span className="muted cell-note">{a.tenant_name} · {a.payment_ref}</span></td>
          <td className="num">{pence(a.balance)}</td>
          <td className="num">{a.days_late} days<span className="muted cell-note">Since {fmtDay(a.oldest_unpaid_on)}</span></td>
          <td>{a.next_step.label}</td>
          <td><button type="button" className="btn sm" onClick={open("step", a)}>Mark done<span className="sr">: {a.next_step.label} for {a.tenant_name}</span></button></td>
        </tr>)}
      </Block>
      <Block id="h-checks" title="Checks and deadlines" rows={todo.compliance} head={["Property", "Check", "Due", "Status"]}
        empty={`Nothing falls due in the next ${WARN} days.`}>
        {todo.compliance.map(c => <tr key={`${c.rental_id}-${c.tenancy_id}-${c.kind}`} className={["overdue", "missing"].includes(c.status) ? "overdue" : undefined}>
          <td>{c.address}</td>
          <td>{c.label}{c.tenant_name && <span className="muted cell-note">{c.tenant_name}</span>}</td>
          <td className="num">{c.due_on ? fmtDay(c.due_on) : "—"}</td>
          <td>{checkState(c)}</td>
        </tr>)}
      </Block>
      <Block id="h-renewals" title="Renewals" rows={todo.renewals} head={["Property", "Tenant", "Fixed term ends", "Status"]}
        empty={`No fixed term ends in the next ${LEGAL.renewalDays} days.`}>
        {todo.renewals.map(r => <tr key={r.tenancy_id}>
          <td>{r.address}</td><td>{r.tenant_name}</td><td className="num">{fmtDay(r.end_on)}</td>
          <td>{r.end_on < jerseyToday() ? <strong className="err">{r.label}</strong> : <span className="badge attention">{r.label}</span>}</td>
        </tr>)}
      </Block>
      <Block id="h-repairs" title="Repairs" rows={todo.repairs} head={["Property", "Repair", "Urgency", "Status", "Reported"]}
        empty="No open repairs.">
        {todo.repairs.map(r => <tr key={r.id} className={r.urgency === "emergency" ? "overdue" : undefined}>
          <td>{r.address}</td>
          <td className="wrap">{r.title}{r.contractor && <span className="muted cell-note">{r.contractor}{r.quote != null && ` · quote ${money(r.quote)}`}</span>}</td>
          <td>{r.urgency === "emergency" ? <strong className="err">Emergency</strong>
            : <span className={`badge ${r.urgency === "urgent" ? "attention" : "neutral"}`}>{URGENCY[r.urgency]}</span>}</td>
          <td>{REPAIR_STATUS[r.status]}</td>
          <td><Received at={r.created_at} /></td>
        </tr>)}
      </Block>
      <Block id="h-unmatched" title="Unmatched payments" rows={todo.unmatched} head={["Received", "Amount", "Description", ""]}
        empty="Every payment is matched.">
        {todo.unmatched.map(p => <tr key={p.id}>
          <td className="num">{fmtDay(p.received_on)}</td><td className="num">{pence(p.amount)}</td>
          <td className="wrap">{p.description ?? "—"}</td>
          <td><button type="button" className="btn sm" onClick={open("assign", p)}>Assign<span className="sr"> {pence(p.amount)} of {fmtDay(p.received_on)}</span></button></td>
        </tr>)}
      </Block>
      {t.unmatched > todo.unmatched.length && <p className="muted">Showing the newest {todo.unmatched.length} of {t.unmatched} unmatched payments.</p>}

      <section className="block" aria-labelledby="h-properties">
        <h2 id="h-properties">Properties</h2>
        <div className="filters">
          <label>Search<input type="search" value={f.q} onChange={set("q")} autoComplete="off" aria-describedby="d-r-q" /></label>
          <label>Service<select value={f.service} onChange={set("service")}><option value="">All</option>
            {Object.entries(SERVICE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Show<select value={f.filter} onChange={set("filter")}><option value="">All properties</option>
            {Object.entries(SHOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={f.archived} onChange={set("archived")} />Archived only</label>
        </div>
        <small id="d-r-q" className="muted">Address, landlord, tenant or payment reference (past tenants too).</small>
        <div aria-busy={busy} className="results">{data.rentals.length ? <div className="table-scroll" role="region" aria-labelledby="h-properties" tabIndex={0}>
          <table className="list" id="rentals-list">
            <thead><tr><th scope="col">Property</th><th scope="col">Landlord</th><th scope="col">Service</th><th scope="col">Tenant</th>
              <th scope="col">Rent</th><th scope="col">Balance</th><th scope="col">Needs</th></tr></thead>
            <tbody>{data.rentals.map(r => <tr key={r.id}>
              <td>{r.address}<span className="muted cell-note">{r.parish}</span></td>
              <td><a href={`#/rentals/landlords/${r.landlord_id}`}>{r.landlord_name}</a></td>
              <td>{SERVICE[r.service]}</td>
              <td>{r.tenant_name ?? <span className="muted">No tenancy</span>}{r.payment_ref && <span className="muted cell-note">{r.payment_ref}</span>}</td>
              <td className="num">{r.rent != null ? `${money(r.rent)} pcm` : "—"}</td>
              <td className="num">{r.balance != null ? pence(r.balance) : "—"}</td>
              <td><span className="ctl">{r.archived_at && <span className="badge neutral">Archived</span>}
                {r.marks.map(m => <span key={m} className="badge attention">{MARK[m]}</span>)}</span></td>
            </tr>)}</tbody>
          </table></div>
          : filtered ? <p className="empty card">No properties match these filters.{" "}
            <button type="button" className="btn ghost sm" onClick={() => setF({ q: "", service: "", filter: "", archived: false })}>Clear filters</button></p>
          : <p className="empty card">No properties yet. Add the landlord first, then their property.</p>}</div>
      </section>
    </>}
    {dialog?.kind === "landlord" && <NewLandlord onClose={() => setDialog(null)}
      onDone={l => { setDialog(null); setMsg({ text: `Landlord added: ${l.name}.`, landlord: l }); }} />}
    {dialog?.kind === "step" && <MarkStep row={dialog.row} onClose={() => setDialog(null)} onDone={done} onRefused={reload} />}
    {dialog?.kind === "assign" && <Assign payment={dialog.row} onClose={() => setDialog(null)} onDone={done} onRefused={reload} />}
  </section>;
}

// R8, R27: the step is recorded as done, with a note; F5-A sends nothing.
function MarkStep({ row: a, onClose, onDone, onRefused }) {
  const [note, setNote] = useState(""), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const { errors, setErrors, invalid, error } = useFieldErrors("ms");
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null); setErrors({});
    try {
      await api(`/admin/tenancies/${a.tenancy_id}/arrears/${a.oldest_unpaid_on}/${a.next_step.step}`, { method: "PUT", body: { note: note.trim() || null } });
      onDone({ text: `${a.next_step.label} marked done for ${a.tenant_name}.` });
    } catch (x) { setErrors(x.data?.fields || {}); setErr(x.message); setBusy(false); if (x.status === 409) onRefused(); }
  };
  return <Modal title="Mark step done" onClose={onClose}>
    <form className="sheet-form" onSubmit={submit} noValidate>
      <p>{a.tenant_name} · {a.address} · {a.payment_ref}</p>
      <p>{pence(a.balance)} owed. The oldest unpaid rent fell due {fmtDay(a.oldest_unpaid_on)}, {a.days_late} days ago.</p>
      <p><strong>{a.next_step.label}</strong> <span className="muted">(day {a.next_step.days})</span>. Nothing is sent from here: record it
        once it's done.</p>
      <label>Note (optional)<textarea className="short" value={note} maxLength={300} onChange={e => setNote(e.target.value)}
        placeholder="e.g. Letter sent by post" {...invalid("note")} />{error("note")}</label>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="inline"><button className="btn">{busy ? "Saving…" : "Mark done"}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>;
}

// An unmatched payment goes to a tenancy, found by tenant, address or reference: a running one, or a full one that ended
// in the last 12 months (a former tenant paying off a debt). Only rent counts towards balances (R26); let-only tenancies
// take deposits and other money only, so for them the kind starts at Deposit.
function Assign({ payment: p, onClose, onDone, onRefused }) {
  const [q, setQ] = useState(""), [found, setFound] = useState(null), [findErr, setFindErr] = useState(null);
  const [pick, setPick] = useState(null), [kind, setKind] = useState(p.kind);
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const { errors, setErrors, invalid, error } = useFieldErrors("as");
  useEffect(() => {
    if (!q.trim()) { setFound(null); setFindErr(null); return; }
    let live = true;
    const t = setTimeout(() => api(`/admin/tenancies?q=${encodeURIComponent(q.trim())}`)
      .then(d => { if (live) { setFound(d.tenancies); setFindErr(null); } }, e => { if (live) setFindErr(e.message); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const shown = found && pick && !found.some(r => r.tenancy_id === pick.tenancy_id) ? [pick, ...found] : found ?? (pick ? [pick] : []);
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    if (!pick) return setErrors({ tenancy_id: "Search for the tenancy, then choose it" });
    setBusy(true); setErr(null); setErrors({});
    try {
      await api(`/admin/payments/${p.id}`, { method: "PUT", body: { tenancy_id: pick.tenancy_id, kind } });
      onDone({ text: `${pence(p.amount)} assigned to ${pick.tenant_name} as ${AS[kind]}.` });
    } catch (x) { setErrors(x.data?.fields || {}); setErr(x.message); setBusy(false); if (x.status === 409 || x.status === 404) onRefused(); }
  };
  return <Modal title="Assign payment" onClose={onClose}>
    <form className="sheet-form" onSubmit={submit} noValidate>
      <p>{pence(p.amount)} received {fmtDay(p.received_on)}{p.description && ` · ${p.description}`}</p>
      <label>Tenancy<input type="search" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" aria-invalid={errors.tenancy_id ? true : undefined}
        aria-describedby={errors.tenancy_id ? "d-as-q e-as-tenancy_id" : "d-as-q"} /></label>
      <small id="d-as-q" className="muted">Search by tenant, address or payment reference: current tenancies, and full management ones
        that ended in the last 12 months.</small>
      {findErr && <p role="alert" className="err">{findErr}</p>}
      {shown.length > 0 && <fieldset className="choices-set"><legend>Matching tenancies</legend><div className="buyers">
        {shown.map(r => <label key={r.tenancy_id} className="check"><input type="radio" name="as-tenancy" checked={pick?.tenancy_id === r.tenancy_id}
          onChange={() => { setPick(r); setKind(r.service === "let_only" && p.kind === "rent" ? "deposit" : p.kind); setErrors(({ tenancy_id, ...x }) => x); }} />
          <span>{r.tenant_name}{r.ended_on && r.ended_on <= jerseyToday() && ` (ended ${fmtDay(r.ended_on)})`} <span className="muted">
            {r.address} · {r.payment_ref} · {SERVICE[r.service]}</span></span></label>)}
      </div></fieldset>}
      {found && !found.length && <p className="muted" role="status">No tenancy matches “{q.trim()}”.</p>}
      {error("tenancy_id")}
      <label>Kind<select value={kind} onChange={e => setKind(e.target.value)} aria-describedby="d-as-kind" {...invalid("kind")}>
        {Object.entries(KIND).filter(([k]) => k !== "rent" || pick?.service !== "let_only").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>{error("kind")}</label>
      <small id="d-as-kind" className="muted">Only rent counts towards the balance and arrears. Let-only tenancies take deposits and other money, not rent.</small>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="inline"><button className="btn">{busy ? "Assigning…" : "Assign payment"}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>;
}

// A landlord's details, shared by New landlord and their page. approval_limit: repairs quoted above it wait for them (R14).
const LANDLORD = ["name", "email", "phone", "approval_limit", "notes"];
const toLandlordForm = l => Object.fromEntries(LANDLORD.map(k => [k, l?.[k] == null ? "" : k === "approval_limit" ? l[k].toLocaleString("en-GB") : String(l[k])]));
const toLandlordBody = f => Object.fromEntries(LANDLORD.map(k => [k, k === "approval_limit" ? pounds(f[k]) : f[k].trim() || null]));
function LandlordFields({ f, set, invalid, error, prefix, notes = true }) {
  // A hint id and, when invalid, the error's id: both describe the field.
  const input = (k, label, { hint, ...extra } = {}) => <label>{label}<input id={`${prefix}-${k}`} value={f[k]} onChange={set(k)}
    autoComplete="off" maxLength={120} {...invalid(k)} {...extra}
    aria-describedby={[hint, invalid(k)["aria-describedby"]].filter(Boolean).join(" ") || undefined} />{error(k)}</label>;
  return <>
    <div className="grid2">{input("name", "Name")}{input("email", "Email", { type: "email" })}{input("phone", "Phone", { type: "tel" })}
      {input("approval_limit", "Approval limit (£, optional)", { inputMode: "numeric", hint: `d-${prefix}-limit` })}</div>
    <small id={`d-${prefix}-limit`} className="muted">Repairs quoted above this wait for the landlord's approval. Blank: no limit.</small>
    {notes && <label>Notes (optional)<textarea className="short" value={f.notes} maxLength={2000} onChange={set("notes")} {...invalid("notes")} />
      {error("notes")}</label>}
  </>;
}

function NewLandlord({ onClose, onDone }) {
  const [f, setF] = useState(toLandlordForm), [err, setErr] = useState(null), [busy, setBusy] = useState(false), form = useRef(null);
  const { errors, setErrors, invalid, error } = useFieldErrors("nl");
  useEffect(() => { form.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try { const { landlord } = await api("/admin/landlords", { method: "POST", body: toLandlordBody(f) }); onDone(landlord); }
    catch (x) { setErrors(x.data?.fields || {}); setErr(x.message); setBusy(false); }
  };
  return <Modal title="New landlord" onClose={onClose}>
    <form ref={form} className="sheet-form" onSubmit={submit} noValidate>
      <LandlordFields f={f} set={set} invalid={invalid} error={error} prefix="nl" />
      {err && <p role="alert" className="err">{err}</p>}
      <div className="inline"><button className="btn">{busy ? "Adding…" : "Add landlord"}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>;
}

// #/rentals/new[?landlord=<id>]: a property for a landlord already entered, or for a new one entered here (R1, R3).
// Its legal checks start as Not recorded (R11).
const RENTAL = { landlord: "", address: "", parish: "", service: "", fee_percent: "", has_gas: "", notes: "" };
const GAS = [["yes", "Yes", true], ["no", "No", false], ["", "Not sure", null]];
export function NewRental({ landlordId, onChange }) {
  const [landlords, setLandlords] = useState(null), [listErr, setListErr] = useState(null);
  const blank = { ...RENTAL, landlord: landlordId ?? "" };
  const [f, setF] = useState(blank), [l, setL] = useState(toLandlordForm), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const r = useFieldErrors("nr"), nl = useFieldErrors("nrl"), form = useRef(null);
  useEffect(() => { api("/admin/landlords").then(d => setLandlords(d.landlords.filter(x => !x.archived_at)), e => setListErr(e.message)); }, []);
  useEffect(() => { form.current?.querySelector("[aria-invalid=true]")?.focus(); }, [r.errors, nl.errors]);
  const fresh = f.landlord === "new";
  const dirty = JSON.stringify(f) !== JSON.stringify(blank) || (fresh && JSON.stringify(l) !== JSON.stringify(toLandlordForm()));
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); r.setErrors({}); nl.setErrors({});
    let id = f.landlord, step = "landlord";
    try {
      // The new landlord is saved first and then chosen, so trying again after a refused property doesn't add them twice.
      if (fresh) {
        const { landlord } = await api("/admin/landlords", { method: "POST", body: toLandlordBody(l) });
        id = String(landlord.id);
        setLandlords(ls => [...ls, landlord].sort((a, b) => a.name.localeCompare(b.name)));
        setF(x => ({ ...x, landlord: id }));
      }
      step = "rental";
      const { rental } = await api("/admin/rentals", { method: "POST", body: { landlord_id: id ? Number(id) : null, address: f.address.trim() || null,
        parish: f.parish || null, service: f.service || null, fee_percent: f.service === "full" ? f.fee_percent.trim() || null : null,
        has_gas: GAS.find(([k]) => k === f.has_gas)[2], notes: f.notes.trim() || null } });
      setUnsaved(false);
      added = `Property added: ${rental.address}.`;
      onChange(); // its checks start as Not recorded, so the Rentals count goes up
      location.hash = "#/rentals";
    } catch (x) {
      (step === "landlord" ? nl : r).setErrors(x.data?.fields || {});
      setMsg(fresh && step === "rental" ? `${l.name.trim()} was added as a landlord; the property wasn't. ${x.message}` : x.message);
      setBusy(false);
    }
  };

  const radio = (k, v, t) => <label key={v} className="check"><input type="radio" name={`nr-${k}`} value={v} checked={f[k] === v} onChange={set(k)}
    aria-invalid={r.errors[k] ? true : undefined} aria-describedby={r.errors[k] ? `e-nr-${k}` : undefined} />{t}</label>;
  // A div, not a section: the entrance animation of `.page>section` would make it the box the fixed action bar sits in.
  return <div>
    <div className="head"><h1 id="t-new-rental">New property</h1><a href="#/rentals">← Back to rentals</a></div>
    <form ref={form} className="sections" noValidate onSubmit={submit}>
      <section className="card fields-group" aria-labelledby="g-landlord"><h2 id="g-landlord">Landlord</h2>
        <label>Landlord<select id="r-landlord" value={f.landlord} onChange={set("landlord")} {...r.invalid("landlord_id")}>
          <option value="">{landlords ? "Choose a landlord" : listErr ? "The landlords couldn't be loaded" : "Loading landlords…"}</option>
          {landlords?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          <option value="new">A new landlord</option></select>{r.error("landlord_id")}</label>
        {listErr && <p role="alert" className="err">{listErr}</p>}
        {fresh && <LandlordFields f={l} set={k => e => setL(x => ({ ...x, [k]: e.target.value }))} invalid={nl.invalid} error={nl.error}
          prefix="nrl" notes={false} />}
      </section>
      <section className="card fields-group" aria-labelledby="g-property"><h2 id="g-property">Property</h2>
        <div className="grid2">
          <label>Address<input value={f.address} maxLength={200} onChange={set("address")} autoComplete="off" {...r.invalid("address")} />{r.error("address")}</label>
          <label>Parish<select value={f.parish} onChange={set("parish")} {...r.invalid("parish")}><option value="">Choose a parish</option>
            {OPTIONS.parishes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>{r.error("parish")}</label>
        </div>
        <fieldset className="choices-set"><legend>Service</legend>
          <div className="choices">{Object.entries(SERVICE).map(([v, t]) => radio("service", v, t))}</div>
          <small className="muted">Full management: Hampton collects the rent and pays the landlord. Let only: Hampton found the tenant.</small>
          {r.error("service")}</fieldset>
        {f.service === "full" && <label className="fee">Management fee (%)<input value={f.fee_percent} inputMode="decimal" autoComplete="off"
          onChange={set("fee_percent")} {...r.invalid("fee_percent")} />{r.error("fee_percent")}</label>}
        <fieldset className="choices-set"><legend>Gas supply</legend>
          <div className="choices">{GAS.map(([v, t]) => radio("has_gas", v, t))}</div>
          <small className="muted">With gas, or when not sure, the property needs a yearly gas safety check.</small>{r.error("has_gas")}</fieldset>
        <label>Notes (optional)<textarea className="short" value={f.notes} maxLength={2000} onChange={set("notes")} {...r.invalid("notes")} />{r.error("notes")}</label>
      </section>
      <div className="actionbar" role="region" aria-label="Actions">
        {msg && <p role="alert" className="err">{msg}</p>}
        <button className="btn" disabled={busy}>{busy ? "Adding…" : "Add property"}</button>
        <a className="btn ghost" href="#/rentals">Cancel</a>
      </div>
    </form>
  </div>;
}

// #/rentals/landlords/<id>: their details, saved with the Save bar (locked by updated_at), and their properties.
export function Landlord({ id }) {
  const [data, setData] = useState(null), [loadErr, setLoadErr] = useState(null), [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), formRef = useRef(null);
  const { errors, setErrors, invalid, error } = useFieldErrors("ll");
  const load = () => api(`/admin/landlords/${id}`).then(d => { setData(d); setForm(toLandlordForm(d.landlord)); setErrors({}); setLoadErr(null); },
    e => setLoadErr(e.message));
  useEffect(() => { load(); }, [id]);
  useEffect(() => { formRef.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);
  const body = form && toLandlordBody(form), saved = data && toLandlordBody(toLandlordForm(data.landlord));
  const changed = data && form ? LANDLORD.filter(k => body[k] !== saved[k]) : [];
  const dirty = changed.length > 0;
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);

  if (!data) return loadErr ? <p role="alert" className="err">{loadErr}{" "}
    <button type="button" className="btn ghost sm" onClick={load}>Try again</button> · <a href="#/rentals">Back to rentals</a></p> : <p>Loading landlord…</p>;
  const ll = data.landlord;
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const { landlord } = await api(`/admin/landlords/${id}`, { method: "PUT",
        body: { ...Object.fromEntries(changed.map(k => [k, body[k]])), updated_at: ll.updated_at } });
      setData(d => ({ ...d, landlord })); setForm(toLandlordForm(landlord)); setErrors({}); setMsg({ ok: true, text: "Changes saved." });
    } catch (e) {
      setErrors(e.data?.fields || {}); setMsg({ text: e.message, stale: e.status === 409 && /Reload/.test(e.message) });
    } finally { setBusy(false); }
  };
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  return <div className="record">
    <div className="head"><div><h1 id="t-landlord">{ll.name}</h1>
      <p className="muted">Landlord{ll.archived_at && <> · <span className="badge neutral">Archived</span></>}</p></div>
      <a href="#/rentals">← Back to rentals</a></div>
    <div className="sections">
      <form ref={formRef} noValidate onSubmit={e => { e.preventDefault(); if (dirty && !busy) save(); }}>
        <section className="card fields-group" aria-labelledby="h-ll-details"><h2 id="h-ll-details">Details</h2>
          <LandlordFields f={form} set={set} invalid={invalid} error={error} prefix="ll" /></section>
      </form>
      <section className="card" aria-labelledby="h-ll-rentals"><div className="head"><h2 id="h-ll-rentals">Properties</h2>
        {!ll.archived_at && <a className="btn ghost sm" href={`#/rentals/new?landlord=${ll.id}`}>Add a property</a>}</div>
        {data.rentals.length ? <ul className="plain-list" id="landlord-rentals">{data.rentals.map(r => <li key={r.id}>
          <span>{r.address}<span className="muted cell-note">{r.parish} · {SERVICE[r.service]}</span></span>
          {r.archived_at && <span className="badge neutral">Archived</span>}</li>)}</ul>
          : <p className="muted" id="landlord-rentals">No properties yet.</p>}
      </section>
    </div>
    <div className="actionbar" role="region" aria-label="Actions">
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}
        {msg.stale && <> <button type="button" className="btn ghost sm" onClick={() => { setMsg(null); load(); }}>Reload</button></>}</p>}
      {dirty && <span className="unsaved">Unsaved changes</span>}
      <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</button>
      {dirty && <button type="button" className="btn ghost" onClick={() => { setForm(toLandlordForm(ll)); setErrors({}); setMsg(null); }} disabled={busy}>Discard</button>}
    </div>
  </div>;
}
