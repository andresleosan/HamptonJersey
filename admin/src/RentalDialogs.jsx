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
  if (n == null) throw fieldError(k, "Enter an amount in pounds, like 1,250.00");
  if (n < 1) throw fieldError(k, "Enter an amount of at least £0.01");
  return n;
};
// The server checks pence; the fields here are in pounds (R20: up to £1,000,000).
const inPounds = fields => Object.fromEntries(Object.entries(fields).map(([k, m]) => [k, /in pence/.test(m)
  ? "Enter an amount from £0.01 to £1,000,000" : m]));
// The rent in force today, and the change waiting for its date (tenancy.rent is the latest agreed, P5).
export const rentLine = (t, current) => `${money(current)} pcm${t.last_rent_change_on > jerseyToday() && t.rent !== current
  ? `, ${t.rent > current ? "rises" : "falls"} to ${money(t.rent)} from ${fmtDay(t.last_rent_change_on)}` : ""}`;
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
    catch (x) { fe.setErrors(inPounds(x.data?.fields || {})); setErr(x.message); setBusy(false); if (x.status === 409 || x.status === 404) onRefused?.(); }
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
    <legend>{legend}</legend><div className="choices">{options.map(([v, t], i) => <label key={v} className="check">
      <input type="radio" name={`${prefix}-${k}`} value={v} checked={f[k] === v} onChange={set(k)} {...(i ? {} : fe.invalid(k))} />{t}</label>)}</div>
    {fe.error(k)}</fieldset>;
  return { f, setF, set, field, radios, submit, err, busy, ref, ...fe };
}

// A dialog around one form; lead goes above it (outside, so it may hold a form of its own). back: the closing button's
// label, when "Cancel" would read as the action.
const Sheet = ({ title, a, button, danger, lead, back = "Cancel", onClose, children }) => <Modal title={title} onClose={onClose}>
  {lead}
  <form ref={a.ref} className="sheet-form" onSubmit={a.submit} noValidate>{children}
    {a.err && <p role="alert" className="err">{a.err}</p>}
    <div className="inline"><button className={`btn${danger ? " ghost danger" : ""}`}>{a.busy ? "Saving…" : button}</button>
      <button type="button" className="btn ghost" onClick={onClose}>{back}</button></div>
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
    <label>Kind<select value={a.f.kind} onChange={a.set("kind")} {...a.invalid("kind")}
      aria-describedby={["d-rp-kind", a.invalid("kind")["aria-describedby"]].filter(Boolean).join(" ")}>
      {Object.entries(KIND).filter(([k]) => full || k !== "rent").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>{a.error("kind")}</label>
    <small id="d-rp-kind" className="muted">Only rent counts towards the balance and arrears, oldest charge first.</small>
    {a.field("description", "Description (optional)", { maxLength: 300, placeholder: "e.g. Cash at the office" })}
  </Sheet>;
}

// R12, R28, R30: the new rent from a date not before today. For the 2025 law the assistant gives the maximum (RPI, saved
// here for everyone) and the earliest date; for the 2011 law, only its note. Neither stops the change: the law has exceptions.
export function ChangeRent({ d: { tenancy: t, assistant, current_rent }, onClose, onDone, onRefused }) {
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
    {t.last_rent_change_on > today && <p className="muted">Based on the rent from {fmtDay(t.last_rent_change_on)}, the next change allowed.</p>}
    <dl className="kv"><div><dt>Maximum rent</dt><dd>{help.max_rent != null ? `${money(help.max_rent)} pcm` : "—"}</dd></div>
      <div><dt>Earliest date</dt><dd>{fmtDay(help.earliest_on)}</dd></div></dl>
    {help.notes.map(n => <p key={n} className="muted">{n}</p>)}
    {help.max_rent != null && <button type="button" className="btn ghost sm" onClick={() => a.setF({ rent: help.max_rent.toLocaleString("en-GB"),
      effective_on: help.earliest_on })}>Use {money(help.max_rent)} pcm from {fmtDay(help.earliest_on)}</button>}
  </section>;
  return <Sheet title="Change rent" a={a} button="Change rent" onClose={onClose}
    lead={<><Who t={t} /><p>Rent {rentLine(t, current_rent)}.</p>{lead || <p className="warn" role="note">{help.notes[0]}</p>}</>}>
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

// R13, R24: the move-out, maybe ahead; later rent charges go and the property is free for the next tenancy. P22: a
// planned move-out (still ahead) can move to another date from today.
export function EndTenancy({ d: { tenancy: t, earliest_move_out }, onClose, onDone, onRefused }) {
  const today = jerseyToday(), planned = !!t.ended_on;
  const a = useForm("et", { ended_on: t.ended_on ?? earliest_move_out ?? today }, async f => {
    await api(`/admin/tenancies/${t.id}/end`, { method: "POST", body: { ended_on: f.ended_on || null } });
    return f.ended_on > today ? `${t.tenant_name} moves out on ${fmtDay(f.ended_on)}.` : `Tenancy ended on ${fmtDay(f.ended_on)}.`;
  }, onDone, onRefused);
  return <Sheet title={planned ? "Change move-out" : "End tenancy"} a={a} button={planned ? "Save move-out" : "End tenancy"} danger={!planned}
    onClose={onClose}>
    <Who t={t} />
    {a.field("ended_on", "Move-out date", { type: "date", min: planned && today > t.start_on ? today : t.start_on })}
    {planned ? <p>Now {fmtDay(t.ended_on)}. Rent charges stop on the new date: a later one charges the months up to it again, an
      earlier one removes those from it.</p>
      : <p>Rent charges stop on that date and any already made from it are removed. The property is then free for the next tenancy,
        and the check-out report is due within {LEGAL.reportDays} days. A date still ahead can be changed or cancelled until then.</p>}
  </Sheet>;
}

// P22: a planned move-out cancelled; the tenancy goes on and its rent is charged again from where it stopped.
export function CancelMoveOut({ d: { tenancy: t }, onClose, onDone, onRefused }) {
  const a = useForm("cm", {}, async () => {
    await api(`/admin/tenancies/${t.id}/end`, { method: "DELETE" });
    return `Move-out cancelled: ${t.tenant_name} stays.`;
  }, onDone, onRefused);
  return <Sheet title="Cancel move-out" a={a} button="Cancel move-out" back="Back" onClose={onClose}>
    <Who t={t} />
    <p>{t.tenant_name} was moving out on {fmtDay(t.ended_on)}. The tenancy goes on with no end date, and its rent is charged
      again from where it stopped.</p>
  </Sheet>;
}

// P23: a payment recorded by hand, its amount or date corrected (an imported one keeps the bank's).
export function EditPayment({ d: { tenancy: t }, p, onClose, onDone, onRefused }) {
  const a = useForm("ep", { amount: asPounds(p.amount), received_on: p.received_on }, async f => {
    const amount = toPence(f.amount, "amount") ?? (() => { throw fieldError("amount", "Enter an amount"); })();
    await api(`/admin/payments/${p.id}`, { method: "PUT", body: { amount, received_on: f.received_on || null } });
    return `Payment corrected to ${pence(amount)} received ${fmtDay(f.received_on)}.`;
  }, onDone, onRefused);
  return <Sheet title="Edit payment" a={a} button="Save payment" onClose={onClose}>
    <Who t={t} />
    <p>{KIND[p.kind]} of {pence(p.amount)} received {fmtDay(p.received_on)}, recorded by hand.</p>
    <div className="grid2">{a.field("amount", "Amount (£)", { inputMode: "decimal" })}
      {a.field("received_on", "Received on", { type: "date", max: jerseyToday() })}</div>
  </Sheet>;
}

// P23: a payment back to Unmatched, to be assigned again from Rentals.
export function UnassignPayment({ d: { tenancy: t }, p, onClose, onDone, onRefused }) {
  const a = useForm("up", {}, async () => {
    await api(`/admin/payments/${p.id}`, { method: "PUT", body: { tenancy_id: null } });
    return `${pence(p.amount)} moved to Unmatched payments.`;
  }, onDone, onRefused);
  return <Sheet title="Unassign payment" a={a} button="Move to Unmatched" onClose={onClose}>
    <Who t={t} />
    <p>{KIND[p.kind]} of {pence(p.amount)} received {fmtDay(p.received_on)}{p.description && ` · ${p.description}`}.</p>
    <p>It leaves this tenancy{p.kind === "rent" && " and its balance"} and waits in Unmatched payments on the Rentals screen, to be
      assigned again.</p>
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

export const NEXT_DAY = "For tenancies already running, collect from the next rent day";
// The tenancy's own fields, by key: [label, input props]. Dates are YYYY-MM-DD; money in whole pounds.
const DATE = { type: "date" };
const TENANCY_FIELDS = { tenant_name: ["Tenant's name", { maxLength: 120 }], tenant_email: ["Email (optional)", { type: "email", maxLength: 120 }],
  tenant_phone: ["Phone (optional)", { type: "tel", maxLength: 120 }], occupants: ["Other occupants (optional)", { maxLength: 500 }],
  start_on: ["Start date", DATE], end_on: ["End of the fixed term", DATE], rent: ["Rent (£ pcm)", { inputMode: "numeric" }],
  due_day: ["Rent day (optional)", { inputMode: "numeric", hint: "Day of the month the rent falls due, 1 to 28. Blank: the start day." }],
  deposit: ["Deposit (£, optional)", { inputMode: "numeric" }], deposit_received_on: ["Deposit received on", DATE],
  deposit_protected_on: ["Deposit protected on", DATE], deposit_ref: ["Deposit reference (optional)", { maxLength: 120 }],
  inventory_in_on: ["Check-in report done on", DATE], inventory_out_on: ["Check-out report done on", DATE],
  collect_from: ["Collect rent from", { ...DATE, hint: `${NEXT_DAY} and enter what is owed today.` }],
  opening_balance: ["Owed today (£, optional)", { inputMode: "decimal", hint: "Rent already owed when Hampton starts collecting. One charge, due on that date." }],
  notes: ["Notes (optional)", { textarea: true, maxLength: 2000 }] };
const POUNDS = ["rent", "deposit"];
// opening_balance is in pence; none (or 0) shows blank.
const toTenancyForm = (t, keys) => Object.fromEntries(keys.map(k => [k, t?.[k] == null ? "" : POUNDS.includes(k) ? t[k].toLocaleString("en-GB")
  : k === "opening_balance" ? (t[k] ? asPounds(t[k]) : "") : String(t[k])]));
const toTenancyBody = (f, keys) => Object.fromEntries(keys.map(k => [k, POUNDS.includes(k) ? pounds(f[k])
  : k === "opening_balance" ? toPence(f[k], k) : f[k].trim() || null]));
// over: [label, props] by key, in place of TENANCY_FIELDS.
const fieldsOf = (a, keys, over = {}) => keys.map(k => <Fragment key={k}>{a.field(k, ...(over[k] ?? TENANCY_FIELDS[k]))}</Fragment>);

// The tenancy's details (locked by updated_at), or one deadline's date (keys of one), or collect_from (P22). note: a line
// under the tenant; over: [label, props] by key in place of the usual ones.
export const DETAILS = ["tenant_name", "tenant_email", "tenant_phone", "occupants", "deposit", "deposit_received_on", "deposit_ref", "notes"];
export function EditTenancy({ d: { tenancy: t }, keys, title, note, over, onClose, onDone, onRefused }) {
  const shown = t.kind === "fixed" && keys === DETAILS ? [...keys.slice(0, 4), "end_on", ...keys.slice(4)] : keys;
  const a = useForm("tf", toTenancyForm(t, shown), async f => {
    const body = toTenancyBody(f, shown), saved = toTenancyBody(toTenancyForm(t, shown), shown);
    const changed = shown.filter(k => body[k] !== saved[k]);
    if (changed.length) await api(`/admin/tenancies/${t.id}`, { method: "PUT",
      body: { ...Object.fromEntries(changed.map(k => [k, body[k]])), updated_at: t.updated_at } });
    return changed.length ? `${title} saved.` : "Nothing changed.";
  }, onDone, onRefused);
  return <Sheet title={title} a={a} button="Save" onClose={onClose}>
    <Who t={t} />{note && <p>{note}</p>}<div className="grid2">{fieldsOf(a, shown, over)}</div>
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
  // A higher quote asks the landlord again (the server drops the approval on save).
  const f = a.f, quote = Number(pounds(f.quote)) || 0, approved = !(quote > (p?.quote ?? 0)) && p?.approved_at;
  const above = needsApproval({ quote, cost: f.status === "done" ? Number(pounds(f.cost)) || 0 : p?.cost, approved_at: approved }, rental.approval_limit);
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
    {approved && <p className="muted">The landlord approved it {fmtDate(p.approved_at)}.</p>}
    <label className="check"><input type="checkbox" checked={f.charge_landlord} onChange={a.set("charge_landlord")} />Charge the cost to the
      landlord (it goes on their statement the month it's done)</label>
  </Sheet>;
}

// R4, R22, R23: a tenancy for a property without one. Full management collects from collect_from (the start by default),
// with what is owed that day as one opening charge; never anything before it.
const NEW_KEYS = ["tenant_name", "tenant_email", "tenant_phone", "occupants", "start_on", "end_on", "rent", "due_day", "deposit",
  "deposit_received_on", "deposit_protected_on", "deposit_ref", "inventory_in_on", "collect_from", "opening_balance", "notes"];
export function NewTenancy({ rental, onClose, onDone, onDirty, onRefused }) {
  const blank = { ...toTenancyForm(null, NEW_KEYS), kind: "", regime: "" }, full = rental.service === "full";
  const a = useForm("nt", blank, async f => {
    const keys = NEW_KEYS.filter(k => (f.kind === "fixed" || k !== "end_on") && (full || !["collect_from", "opening_balance"].includes(k)));
    const d = await api(`/admin/rentals/${rental.id}/tenancies`, { method: "POST",
      body: { ...toTenancyBody(f, keys), kind: f.kind || null, regime: f.regime || null } });
    return d.tenancy;
  }, onDone, onRefused);
  const dirty = JSON.stringify(a.f) !== JSON.stringify(blank);
  useEffect(() => { onDirty(dirty); }, [dirty]);
  useEffect(() => () => onDirty(false), []);
  // P22: a tenancy that started before this month needs the date Hampton collects from (blank would charge its past months).
  const [label, props] = TENANCY_FIELDS.collect_from, needed = !!a.f.start_on && a.f.start_on < `${jerseyToday().slice(0, 8)}01`;
  const collect = { collect_from: needed ? [label, { ...props, "aria-required": true }] : [`${label} (optional)`, props] };
  const group = (title, keys) => <fieldset className="choices-set"><legend>{title}</legend><div className="grid2">{fieldsOf(a, keys, collect)}</div></fieldset>;
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
