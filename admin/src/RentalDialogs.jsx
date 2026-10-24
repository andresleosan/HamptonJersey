import { Fragment, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { Modal, money, pounds, useFieldErrors } from "./Sales.jsx";
import { KIND, REPAIR_STATUS, URGENCY, pence } from "./Rentals.jsx";
import { LEGAL, REPAIR_NEXT, earliestMoveOut, parseMoney, rentAssistant } from "../../server/rentals.js";
import { jerseyToday } from "../../server/viewings.js";

// The property page's dialogs (#/rentals/<id>) and the New tenancy form. Rent, deposits, quotes and costs in whole
// pounds; payments and charges typed in pounds and pence, sent in pence (R20).

const fieldError = (k, msg) => Object.assign(new Error("Please check the highlighted fields"), { data: { fields: { [k]: msg } } });
// "1,250.00" or "£80" to pence; blank is null.
const toPence = (v, k) => {
  if (!v.trim()) return null;
  const n = parseMoney(v);
  if (n == null || n < 0) throw fieldError(k, "Enter an amount in pounds, like 1,250.00");
  return n;
};
const asPounds = p => (p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 });
const months = n => `${n} month${n === 1 ? "" : "s"}`;

// A form's values and its submit: field errors sit under each control (the focus goes to the first), the rest above the
// buttons. send(f) may throw a field error of its own; a 409 or 404 also reloads the page behind (onRefused).
export function useForm(prefix, init, send, onDone, onRefused) {
  const [f, setF] = useState(init), [err, setErr] = useState(null), [busy, setBusy] = useState(false), ref = useRef(null);
  const fe = useFieldErrors(prefix);
  useEffect(() => { ref.current?.querySelector("[aria-invalid=true]")?.focus(); }, [fe.errors]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null); fe.setErrors({});
    try { onDone(await send(f)); }
    catch (x) { fe.setErrors(x.data?.fields || {}); setErr(x.message); setBusy(false); if (x.status === 409 || x.status === 404) onRefused?.(); }
  };
  // A control with its label, error and optional hint (both describe it). textarea: true for a text area.
  const field = (k, label, { hint, textarea, ...extra } = {}) => {
    const Tag = textarea ? "textarea" : "input", hid = hint && `d-${prefix}-${k}`;
    const ctl = <label>{label}<Tag id={`${prefix}-${k}`} className={textarea ? "short" : undefined} value={f[k]} onChange={set(k)}
      autoComplete="off" {...fe.invalid(k)} {...extra}
      aria-describedby={[hid, fe.invalid(k)["aria-describedby"]].filter(Boolean).join(" ") || undefined} />{fe.error(k)}</label>;
    return hint ? <div className="field">{ctl}<small id={hid} className="muted">{hint}</small></div> : ctl;
  };
  const radios = (k, legend, options) => <fieldset className="choices-set" aria-describedby={fe.errors[k] ? `e-${prefix}-${k}` : undefined}>
    <legend>{legend}</legend><div className="choices">{options.map(([v, t]) => <label key={v} className="check">
      <input type="radio" name={`${prefix}-${k}`} value={v} checked={f[k] === v} onChange={set(k)} />{t}</label>)}</div>{fe.error(k)}</fieldset>;
  return { f, setF, set, field, radios, submit, err, busy, ref, ...fe };
}

// A dialog around one form; lead goes above it (outside, so it may hold a form of its own).
const Sheet = ({ title, a, button, danger, lead, onClose, children }) => <Modal title={title} onClose={onClose}>
  {lead}
  <form ref={a.ref} className="sheet-form" onSubmit={a.submit} noValidate>{children}
    {a.err && <p role="alert" className="err">{a.err}</p>}
    <div className="inline"><button className={`btn${danger ? " ghost danger" : ""}`}>{a.busy ? "Saving…" : button}</button>
      <button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
  </form>
</Modal>;
const Who = ({ t }) => <p>{t.tenant_name} · {t.payment_ref}</p>;

// R7, R26: rent counts towards the balance; a let-only tenancy takes deposits and other money only (P10).
export function RecordPayment({ d: { tenancy: t }, onClose, onDone, onRefused }) {
  const full = t.service === "full";
  const a = useForm("rp", { amount: "", received_on: jerseyToday(), kind: full ? "rent" : "deposit", description: "" }, async f => {
    const amount = toPence(f.amount, "amount");
    await api("/admin/payments", { method: "POST", body: { tenancy_id: t.id, amount, received_on: f.received_on || null, kind: f.kind,
      description: f.description.trim() || null } });
    return `Payment of ${pence(amount)} recorded.`;
  }, onDone, onRefused);
  return <Sheet title="Record payment" a={a} button="Record payment" onClose={onClose}>
    <Who t={t} />
    <div className="grid2">{a.field("amount", "Amount (£)", { inputMode: "decimal" })}
      {a.field("received_on", "Received on", { type: "date", max: jerseyToday() })}</div>
    <label>Kind<select value={a.f.kind} onChange={a.set("kind")} aria-describedby="d-rp-kind" {...a.invalid("kind")}>
      {Object.entries(KIND).filter(([k]) => full || k !== "rent").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{a.error("kind")}</label>
    <small id="d-rp-kind" className="muted">Only rent counts towards the balance and arrears, oldest charge first.</small>
    {a.field("description", "Description (optional)", { maxLength: 300, placeholder: "e.g. Cash at the office" })}
  </Sheet>;
}

// R12, R28, R30: the new rent from a date not before today. For the 2025 law the assistant gives the maximum (RPI, saved
// here for everyone) and the earliest date; for the 2011 law, only its note. Neither stops the change: the law has exceptions.
export function ChangeRent({ d: { tenancy: t, assistant }, onClose, onDone, onRefused }) {
  const today = jerseyToday(), [rpi, setRpi] = useState(assistant.rpi), [editRpi, setEditRpi] = useState(!assistant.rpi);
  const help = rentAssistant(t, rpi, today);
  const a = useForm("cr", { rent: "", effective_on: "" }, async f => {
    await api(`/admin/tenancies/${t.id}/rent`, { method: "POST", body: { rent: pounds(f.rent), effective_on: f.effective_on || null } });
    return `Rent changes to ${money(Number(pounds(f.rent)))} pcm from ${fmtDay(f.effective_on)}.`;
  }, onDone, onRefused);
  const r = useForm("rpi", { percent: rpi ? String(rpi.percent) : "", as_of: rpi?.as_of ?? "" }, async f => {
    const res = await api("/admin/settings/rpi", { method: "PUT", body: { percent: f.percent.trim() || null, as_of: f.as_of || null } });
    return res.rpi;
  }, v => { setRpi(v); setEditRpi(false); });
  const rent = Number(pounds(a.f.rent));
  const lead = help.applies && <section className="assistant view-form" aria-labelledby="h-assistant">
    <h3 id="h-assistant">Rent assistant (2025 law)</h3>
    {editRpi ? <form ref={r.ref} className="inline" onSubmit={r.submit} noValidate>
      {r.field("percent", "Jersey RPI (%)", { inputMode: "decimal" })}{r.field("as_of", "As of", { type: "date", max: today })}
      <button className="btn sm">{r.busy ? "Saving…" : "Save RPI"}</button>
      {rpi && <button type="button" className="btn ghost sm" onClick={() => setEditRpi(false)}>Cancel</button>}
      {r.err && <p role="alert" className="err">{r.err}</p>}</form>
      : <p>Jersey RPI: {rpi.percent}% as of {fmtDay(rpi.as_of)}{" "}
        <button type="button" className="linkish" onClick={() => setEditRpi(true)}>Edit RPI</button></p>}
    <dl className="kv"><div><dt>Maximum rent</dt><dd>{help.max_rent != null ? `${money(help.max_rent)} pcm` : "—"}</dd></div>
      <div><dt>Earliest date</dt><dd>{fmtDay(help.earliest_on)}</dd></div></dl>
    {help.notes.map(n => <p key={n} className="muted">{n}</p>)}
    {help.max_rent != null && <button type="button" className="btn ghost sm" onClick={() => a.setF({ rent: help.max_rent.toLocaleString("en-GB"),
      effective_on: help.earliest_on })}>Use {money(help.max_rent)} pcm from {fmtDay(help.earliest_on)}</button>}
  </section>;
  return <Sheet title="Change rent" a={a} button="Change rent" onClose={onClose}
    lead={<><Who t={t} /><p>Rent {money(t.rent)} pcm{t.last_rent_change_on > today && ` from ${fmtDay(t.last_rent_change_on)}`}.</p>{lead || <p className="warn" role="note">{help.notes[0]}</p>}</>}>
    <div className="grid2">{a.field("rent", "New rent (£ pcm)", { inputMode: "numeric" })}
      {a.field("effective_on", "Starts on", { type: "date", min: today })}</div>
    {help.applies && help.max_rent != null && rent > help.max_rent && <p className="warn" role="note">Above the maximum the RPI allows.
      Check with a lawyer before you go ahead.</p>}
    {help.applies && a.f.effective_on && a.f.effective_on < help.earliest_on && <p className="warn" role="note">Earlier than the law
      allows: the earliest date is {fmtDay(help.earliest_on)}.</p>}
    <p className="muted">Charges from that date not yet due change to the new rent, unless corrected by hand.</p>
  </Sheet>;
}

// R24: the same tenancy and payment reference, a new fixed term or periodic, optionally a new rent.
export function Renew({ d: { tenancy: t }, onClose, onDone, onRefused }) {
  const a = useForm("rn", { kind: "fixed", end_on: "", rent: "", effective_on: "" }, async f => {
    const rent = pounds(f.rent);
    await api(`/admin/tenancies/${t.id}/renew`, { method: "POST", body: { kind: f.kind, end_on: f.kind === "fixed" ? f.end_on || null : null,
      rent, effective_on: rent ? f.effective_on || null : null } });
    return f.kind === "fixed" ? `Tenancy renewed until ${fmtDay(f.end_on)}.` : "Tenancy renewed as periodic.";
  }, onDone, onRefused);
  return <Sheet title="Renew tenancy" a={a} button="Renew" onClose={onClose}>
    <Who t={t} />
    <p>It keeps its payment reference.{t.regime === "2011" && jerseyToday() >= LEGAL.regime2025From && " Renewed now, it follows the 2025 law."}</p>
    {a.radios("kind", "Renew as", [["fixed", "Fixed term"], ["periodic", "Periodic"]])}
    {a.f.kind === "fixed" && a.field("end_on", "New end date", { type: "date" })}
    <div className="grid2">{a.field("rent", "New rent (£ pcm, optional)", { inputMode: "numeric" })}
      {a.f.rent.trim() && a.field("effective_on", "New rent starts on", { type: "date", min: jerseyToday() })}</div>
    <p className="muted">For a rent rise under the 2025 law, Change rent shows the maximum and the earliest date.</p>
  </Sheet>;
}

// R13: who gave notice and when, and the earliest move-out it allows.
export function RecordNotice({ d: { tenancy: t }, onClose, onDone, onRefused }) {
  const a = useForm("rno", { given_on: jerseyToday(), by: "" }, async f => {
    const res = await api(`/admin/tenancies/${t.id}/notice`, { method: "POST", body: { given_on: f.given_on || null, by: f.by || null } });
    return `Notice recorded. Earliest move-out: ${fmtDay(res.earliest_move_out)}.`;
  }, onDone, onRefused);
  const earliest = a.f.given_on && a.f.by && earliestMoveOut(t, a.f);
  return <Sheet title="Record notice" a={a} button="Record notice" onClose={onClose}>
    <Who t={t} />
    {a.radios("by", "Given by", [["tenant", "Tenant"], ["landlord", "Landlord"]])}
    {a.field("given_on", "Given on", { type: "date", max: jerseyToday() })}
    {earliest && <p role="status">Earliest move-out: <strong>{fmtDay(earliest)}</strong></p>}
    <p className="muted">A tenant on a periodic tenancy gives {months(LEGAL.tenantNoticeMonths)}; a landlord without cause,
      {" "}{months(LEGAL.landlordNoticeMonths)}. A fixed term runs to its end date. For other cases, check with a lawyer.</p>
  </Sheet>;
}

// R13, R24: the move-out, maybe ahead; later rent charges go and the property is free for the next tenancy.
export function EndTenancy({ d: { tenancy: t, earliest_move_out }, onClose, onDone, onRefused }) {
  const a = useForm("et", { ended_on: earliest_move_out ?? jerseyToday() }, async f => {
    await api(`/admin/tenancies/${t.id}/end`, { method: "POST", body: { ended_on: f.ended_on || null } });
    return f.ended_on > jerseyToday() ? `${t.tenant_name} moves out on ${fmtDay(f.ended_on)}.` : `Tenancy ended on ${fmtDay(f.ended_on)}.`;
  }, onDone, onRefused);
  return <Sheet title="End tenancy" a={a} button="End tenancy" danger onClose={onClose}>
    <Who t={t} />
    {a.field("ended_on", "Move-out date", { type: "date", min: t.start_on })}
    <p>Rent charges stop on that date and any already made from it are removed. The property is then free for the next tenancy,
      and the check-out report is due within {LEGAL.reportDays} days. It can't be undone here.</p>
  </Sheet>;
}

// R23: a charge corrected by hand (e.g. a short first month); a rent change then leaves it alone (R28).
export function CorrectCharge({ d: { tenancy: t }, c, onClose, onDone, onRefused }) {
  const a = useForm("cc", { amount: asPounds(c.amount) }, async f => {
    const amount = toPence(f.amount, "amount") ?? (() => { throw fieldError("amount", "Enter an amount"); })();
    await api(`/admin/charges/${c.id}`, { method: "PUT", body: { amount } });
    return `Charge of ${fmtDay(c.due_on)} corrected to ${pence(amount)}.`;
  }, onDone, onRefused);
  return <Sheet title="Correct charge" a={a} button="Save charge" onClose={onClose}>
    <Who t={t} />
    <p>{c.kind === "opening" ? "Opening balance" : "Rent"} due {fmtDay(c.due_on)}, now {pence(c.amount)}.</p>
    {a.field("amount", "Amount (£)", { inputMode: "decimal", hint: "A corrected charge keeps its amount when the rent changes." })}
  </Sheet>;
}

// The tenancy's own fields, by key: [label, input props]. Dates are YYYY-MM-DD; money in whole pounds.
const DATE = { type: "date" };
const TENANCY_FIELDS = { tenant_name: ["Tenant's name", { maxLength: 120 }], tenant_email: ["Email (optional)", { type: "email", maxLength: 120 }],
  tenant_phone: ["Phone (optional)", { type: "tel", maxLength: 120 }], occupants: ["Other occupants (optional)", { maxLength: 500 }],
  start_on: ["Start date", DATE], end_on: ["End of the fixed term", DATE], rent: ["Rent (£ pcm)", { inputMode: "numeric" }],
  due_day: ["Rent day (optional)", { inputMode: "numeric", hint: "Day of the month the rent falls due, 1 to 28. Blank: the start day." }],
  deposit: ["Deposit (£, optional)", { inputMode: "numeric" }], deposit_received_on: ["Deposit received on", DATE],
  deposit_protected_on: ["Deposit protected on", DATE], deposit_ref: ["Deposit reference (optional)", { maxLength: 120 }],
  inventory_in_on: ["Check-in report done on", DATE], inventory_out_on: ["Check-out report done on", DATE],
  collect_from: ["Collect rent from", { ...DATE, hint: "For tenancies already running, collect from this month and enter what is owed today." }],
  opening_balance: ["Owed today (£, optional)", { inputMode: "decimal", hint: "Rent already owed when Hampton starts collecting. One charge, due on that date." }],
  notes: ["Notes (optional)", { textarea: true, maxLength: 2000 }] };
const POUNDS = ["rent", "deposit"];
const toTenancyForm = (t, keys) => Object.fromEntries(keys.map(k => [k, t?.[k] == null ? "" : POUNDS.includes(k) ? t[k].toLocaleString("en-GB") : String(t[k])]));
const toTenancyBody = (f, keys) => Object.fromEntries(keys.map(k => [k, POUNDS.includes(k) ? pounds(f[k])
  : k === "opening_balance" ? toPence(f[k], k) : f[k].trim() || null]));
const fieldsOf = (a, keys) => keys.map(k => <Fragment key={k}>{a.field(k, ...TENANCY_FIELDS[k])}</Fragment>);

// The tenancy's details (locked by updated_at), or one deadline's date (keys of one).
export const DETAILS = ["tenant_name", "tenant_email", "tenant_phone", "occupants", "deposit", "deposit_received_on", "deposit_ref", "notes"];
export function EditTenancy({ d: { tenancy: t }, keys, title, onClose, onDone, onRefused }) {
  const shown = t.kind === "fixed" && keys === DETAILS ? [...keys.slice(0, 4), "end_on", ...keys.slice(4)] : keys;
  const a = useForm("tf", toTenancyForm(t, shown), async f => {
    const body = toTenancyBody(f, shown), saved = toTenancyBody(toTenancyForm(t, shown), shown);
    const changed = shown.filter(k => body[k] !== saved[k]);
    if (changed.length) await api(`/admin/tenancies/${t.id}`, { method: "PUT",
      body: { ...Object.fromEntries(changed.map(k => [k, body[k]])), updated_at: t.updated_at } });
    return changed.length ? `${title} saved.` : "Nothing changed.";
  }, onDone, onRefused);
  return <Sheet title={title} a={a} button="Save" onClose={onClose}>
    <Who t={t} /><div className="grid2">{fieldsOf(a, shown)}</div>
  </Sheet>;
}

// R10, R11: a property check done on a date; without an expiry it lasts its legal period.
export function UpdateCheck({ rental, item: c, onClose, onDone, onRefused }) {
  const a = useForm("uc", { done_on: jerseyToday(), expires_on: "", note: c.note ?? "" }, async f => {
    await api(`/admin/rentals/${rental.id}/compliance/${c.kind}`, { method: "PUT", body: { done_on: f.done_on || null,
      expires_on: f.expires_on || null, note: f.note.trim() || null } });
    return `${c.label} recorded.`;
  }, onDone, onRefused);
  return <Sheet title={`Update ${c.label.toLowerCase()}`} a={a} button="Save check" onClose={onClose}>
    <p>{rental.address}{c.done_on && ` · last done ${fmtDay(c.done_on)}`}</p>
    <div className="grid2">{a.field("done_on", "Done on", { type: "date", max: jerseyToday() })}
      {a.field("expires_on", "Expires on (optional)", { type: "date", hint: `Blank: ${c.years} year${c.years === 1 ? "" : "s"} after the date done.` })}</div>
    {a.field("note", "Note (optional)", { maxLength: 300, placeholder: "e.g. Certificate 48213" })}
  </Sheet>;
}

// R14: a repair and its cycle. Above the landlord's approval limit (quote or cost, the larger) it waits for them:
// Awaiting approval, then Approved once they agree; the server refuses to go ahead before that.
const REPAIR = ["title", "detail", "urgency", "contractor", "quote", "charge_landlord", "status", "cost", "done_on"];
export const needsApproval = (p, limit) => limit != null && Math.max(p.quote ?? 0, p.cost ?? 0) > limit && !p.approved_at;
export function RepairDialog({ rental, repair: p, onClose, onDone, onRefused }) {
  const init = { title: p?.title ?? "", detail: p?.detail ?? "", urgency: p?.urgency ?? "routine", contractor: p?.contractor ?? "",
    quote: p?.quote?.toLocaleString("en-GB") ?? "", cost: p?.cost?.toLocaleString("en-GB") ?? "", charge_landlord: p ? p.charge_landlord === 1 : true,
    status: p?.status ?? "reported", done_on: p?.done_on ?? jerseyToday() };
  const a = useForm("rd", init, async f => {
    const body = { title: f.title.trim() || null, detail: f.detail.trim() || null, urgency: f.urgency, contractor: f.contractor.trim() || null,
      quote: pounds(f.quote), charge_landlord: f.charge_landlord,
      ...(p ? { status: f.status, updated_at: p.updated_at } : {}), ...(f.status === "done" ? { cost: pounds(f.cost), done_on: f.done_on || null } : {}) };
    await api(p ? `/admin/repairs/${p.id}` : `/admin/rentals/${rental.id}/repairs`, { method: p ? "PUT" : "POST", body });
    return p ? "Repair saved." : `Repair added: ${body.title}.`;
  }, onDone, onRefused);
  const f = a.f, above = needsApproval({ quote: Number(pounds(f.quote)) || 0, cost: f.status === "done" ? Number(pounds(f.cost)) || 0 : p?.cost,
    approved_at: p?.approved_at }, rental.approval_limit);
  return <Sheet title={p ? "Update repair" : "New repair"} a={a} button={p ? "Save repair" : "Add repair"} onClose={onClose}>
    <p>{rental.address}</p>
    {a.field("title", "Title", { maxLength: 120, placeholder: "e.g. Boiler not heating water" })}
    {a.field("detail", "Detail (optional)", { textarea: true, maxLength: 2000 })}
    {a.radios("urgency", "Urgency", Object.entries(URGENCY))}
    <div className="grid2">{a.field("contractor", "Contractor (optional)", { maxLength: 120 })}
      {a.field("quote", "Quote (£, optional)", { inputMode: "numeric" })}</div>
    {p && <label>Status<select value={f.status} onChange={a.set("status")} {...a.invalid("status")}>
      {[p.status, ...REPAIR_NEXT[p.status]].map(s => <option key={s} value={s}>{REPAIR_STATUS[s]}</option>)}</select>{a.error("status")}</label>}
    {f.status === "done" && <div className="grid2">{a.field("cost", "Final cost (£)", { inputMode: "numeric" })}
      {a.field("done_on", "Done on", { type: "date", max: jerseyToday() })}</div>}
    {above && f.status !== "awaiting_approval" && <p className="warn" role="note">Above {rental.landlord_name}'s approval limit of {money(rental.approval_limit)}. Mark it
      Awaiting approval and ask them; once they agree, mark it Approved.</p>}
    {p?.approved_at && <p className="muted">The landlord approved it {fmtDate(p.approved_at)}.</p>}
    <label className="check"><input type="checkbox" checked={f.charge_landlord} onChange={a.set("charge_landlord")} />Charge the cost to the
      landlord (it goes on their statement the month it's done)</label>
  </Sheet>;
}

// R4, R22, R23: a tenancy for a property without one. Full management collects from collect_from (the start by default),
// with what is owed that day as one opening charge; never anything before it.
const NEW_KEYS = ["tenant_name", "tenant_email", "tenant_phone", "occupants", "start_on", "end_on", "rent", "due_day", "deposit",
  "deposit_received_on", "deposit_protected_on", "deposit_ref", "inventory_in_on", "collect_from", "opening_balance", "notes"];
export function NewTenancy({ rental, onClose, onDone, onDirty }) {
  const blank = { ...toTenancyForm(null, NEW_KEYS), kind: "", regime: "" }, full = rental.service === "full";
  const a = useForm("nt", blank, async f => {
    const keys = NEW_KEYS.filter(k => (f.kind === "fixed" || k !== "end_on") && (full || !["collect_from", "opening_balance"].includes(k)));
    const d = await api(`/admin/rentals/${rental.id}/tenancies`, { method: "POST",
      body: { ...toTenancyBody(f, keys), kind: f.kind || null, regime: f.regime || null } });
    return d.tenancy;
  }, onDone);
  const dirty = JSON.stringify(a.f) !== JSON.stringify(blank);
  useEffect(() => { onDirty(dirty); }, [dirty]);
  useEffect(() => () => onDirty(false), []);
  const group = (title, keys) => <fieldset className="choices-set"><legend>{title}</legend><div className="grid2">{fieldsOf(a, keys)}</div></fieldset>;
  return <form ref={a.ref} id="new-tenancy" className="view-form" onSubmit={a.submit} noValidate aria-labelledby="h-new-tenancy">
    {group("Tenant", ["tenant_name", "tenant_email", "tenant_phone", "occupants"])}
    {a.radios("kind", "Kind", [["fixed", "Fixed term"], ["periodic", "Periodic"]])}
    <div className="field">{a.radios("regime", "Law", [["2011", "2011 law"], ["2025", "2025 law"]])}
      <small className="muted">Tenancies agreed from {fmtDay(LEGAL.regime2025From)} follow the 2025 law.</small></div>
    {group("Terms", ["start_on", ...(a.f.kind === "fixed" ? ["end_on"] : []), "rent", "due_day"])}
    {group("Deposit and check-in", ["deposit", "deposit_received_on", "deposit_protected_on", "deposit_ref", "inventory_in_on"])}
    {full && group("Rent collection", ["collect_from", "opening_balance"])}
    {a.field("notes", ...TENANCY_FIELDS.notes)}
    {a.err && <p role="alert" className="err">{a.err}</p>}
    <div className="inline"><button className="btn sm">{a.busy ? "Adding…" : "Add tenancy"}</button>
      <button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button></div>
  </form>;
}
