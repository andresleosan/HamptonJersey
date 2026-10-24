import { useEffect, useId, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtAgo, fmtDate, fmtDay, show } from "./format.js";
import { jerseyToday } from "../../server/viewings.js";

// Spec §4 Sales: the open offers by listing, the sales in progress (overdue first) and those closed in the last 12
// months, with Hampton's fees on the way and those completed this year.
export const money = v => show("budget_max", v);
// Whole pounds as typed ("£820,000" or "820000"); the server says when it isn't one.
export const pounds = v => v.replace(/[£,\s]/g, "") || null;
const OFFER_STATUS = { pending: ["Pending", "neutral"], countered: ["Countered", "active"], accepted: ["Accepted", "positive"],
  rejected: ["Rejected", "neutral"], withdrawn: ["Withdrawn", "neutral"] };
export const OfferBadge = ({ status }) => { const [t, tone] = OFFER_STATUS[status] ?? [status, "neutral"]; return <span className={`badge ${tone}`}>{t}</span>; };
export const REASON = { buyer_withdrew: "Buyer withdrew", seller_withdrew: "Seller withdrew", finance: "Finance",
  survey: "Survey", chain: "Chain", other: "Other" };
export const Received = ({ at }) => <time dateTime={at} title={fmtDate(at)}>{fmtAgo(at)}</time>;
const forSale = l => l.operation === "sale" && !l.archived_at && ["for_sale", "under_offer"].includes(l.availability);

// A native modal dialog: the focus moves in and stays in (the page behind is inert), Escape closes it and the focus goes
// back to what opened it. When the session expires it stays open but no longer modal, under the sign-in (App.jsx), so
// what was typed in it is still there afterwards.
export function Modal({ title, onClose, children }) {
  const ref = useRef(null), id = useId();
  useEffect(() => {
    const d = ref.current, opener = document.activeElement;
    d.showModal();
    const expired = () => { d.close(); d.show(); };
    addEventListener("hs:signed-out", expired);
    return () => { removeEventListener("hs:signed-out", expired); opener?.focus(); };
  }, []);
  return <dialog ref={ref} className="sheet" aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }}>
    <h2 id={id}>{title}</h2>{children}</dialog>;
}

// A form's field errors: `aria-invalid` and the message under the control, linked by `aria-describedby`.
export const useFieldErrors = prefix => {
  const [errors, setErrors] = useState({});
  const invalid = k => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `e-${prefix}-${k}` : undefined });
  const error = k => errors[k] && <small id={`e-${prefix}-${k}`} className="err">{errors[k]}</small>;
  return { errors, setErrors, invalid, error };
};

// buyer: an applicant id from #/sales?applicant=<id> (their record's Record offer), chosen in Record offer at once.
export default function Sales({ buyer, onChange }) {
  const [data, setData] = useState(null), [loadErr, setLoadErr] = useState(null), [msg, setMsg] = useState(null);
  const [dialog, setDialog] = useState(buyer ? { action: "record" } : null); // { action, offer } or { action: "record" }
  const head = useRef(null), refocus = useRef(false);
  const load = () => api("/admin/sales").then(d => { setData(d); setLoadErr(null); }, e => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  // An offer that a change closed leaves the list, and with it the menu the focus went back to: the heading takes it.
  useEffect(() => {
    if (refocus.current && document.activeElement === document.body) head.current?.focus();
    refocus.current = false;
  }, [data]);

  const done = text => { setDialog(null); setMsg(text); refocus.current = true; load(); onChange(); };
  // The row menu closes and its button keeps the focus, so the dialog gives it back there.
  const open = (action, offer) => e => {
    const menu = e.currentTarget.closest("details");
    if (menu) { menu.open = false; menu.querySelector("summary").focus(); }
    setMsg(null); setDialog({ action, offer });
  };

  const t = data?.totals;
  return <section className="sales" aria-labelledby="t-sales">
    <div className="head"><h1 id="t-sales">Sales</h1>
      <button type="button" className="btn" onClick={() => { setMsg(null); setDialog({ action: "record" }); }}>Record offer</button></div>
    {loadErr && <p role="alert" className="err">{loadErr} <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>}
    {!data ? !loadErr && <p>Loading sales…</p> : <>
      <dl className="figures">{[["Open offers", t.open_offers], ["Sales in progress", t.in_progress],
        ["Fees in progress", money(t.fees_in_progress)], ["Fees completed this year", money(t.fees_completed_year)]].map(([k, v]) =>
        <div key={k} className="card"><dt>{k}</dt><dd className="num">{v.toLocaleString("en-GB")}</dd></div>)}</dl>
      <p className="muted">Fees are Hampton's, less any other agency's share. This year: completed since 1 January.</p>

      <section className="block" aria-labelledby="h-offers">
        <h2 id="h-offers" ref={head} tabIndex={-1}>Offers</h2>
        {msg && <p role="status" className="ok">{msg}</p>}
        {data.offers.length ? <>
          <p className="muted">Waiting: no change for more than 2 days. Backup: the listing already has a sale in progress, so the
            offer stays open in case it falls through.</p>
          {Object.values(data.offers.reduce((a, o) => ((a[o.listing_id] ||= []).push(o), a), {})).map(offers => {
            const l = offers[0];
            return <div key={l.listing_id}>
              <h3 id={`h-o-${l.listing_id}`}><a href={`#/p/${encodeURIComponent(l.listing_id)}`}>{l.listing_title}</a> <span className="muted">{l.listing_id}</span></h3>
              <div className="table-scroll offers" role="region" aria-labelledby={`h-o-${l.listing_id}`} tabIndex={0}>
                <table className="list">
                  <thead><tr><th scope="col">Buyer</th><th scope="col">Offer</th><th scope="col">Conditions</th>
                    <th scope="col">Buyer's position</th><th scope="col">Received</th><th scope="col">Status</th>
                    <th scope="col"><span className="sr">Actions</span></th></tr></thead>
                  <tbody>{offers.map(o => <tr key={o.id}>
                    <td><a href={`#/applicants/${o.applicant_id}`}>{o.buyer_name}</a></td>
                    <td className="num">{money(o.amount)}{o.counter_amount != null
                      && <span className="muted cell-note">Seller countered {money(o.counter_amount)}</span>}</td>
                    <td className="wrap">{o.conditions ?? "—"}</td>
                    <td>{show("buyer_position", o.buyer_position)}
                      {o.mortgage_aip && <span className="muted cell-note">Mortgage in principle: {show("mortgage_aip", o.mortgage_aip)}</span>}</td>
                    <td><Received at={o.created_at} /></td>
                    <td><span className="ctl"><OfferBadge status={o.status} />{o.waiting && <span className="badge attention">Waiting</span>}
                      {o.backup && <span className="badge neutral">Backup</span>}</span></td>
                    <td><span className="ctl">
                      {!o.backup && <button type="button" className="btn sm" onClick={open("accept", o)}>Accept<span className="sr"> the offer from {o.buyer_name}</span></button>}
                      <details className="more row-menu"><summary aria-label={`More actions for the offer from ${o.buyer_name}`}>…</summary><div className="menu">
                        <button type="button" onClick={open("counter", o)}>Counter</button>
                        <button type="button" onClick={open("edit", o)}>Edit</button>
                        <button type="button" onClick={open("reject", o)}>Reject</button>
                        <button type="button" onClick={open("withdraw", o)}>Withdraw</button>
                      </div></details></span></td>
                  </tr>)}</tbody>
                </table></div></div>;
          })}</>
          : <p className="empty card">No open offers. Use Record offer when a buyer makes one.</p>}
      </section>

      <section className="block" aria-labelledby="h-progress">
        <h2 id="h-progress">Sales in progress</h2>
        {data.sales.length ? <div className="table-scroll" role="region" aria-labelledby="h-progress" tabIndex={0}>
          <table className="list">
            <thead><tr><th scope="col">Listing</th><th scope="col">Buyer</th><th scope="col">Price</th><th scope="col">Next step</th>
              <th scope="col">Completion target</th></tr></thead>
            <tbody>{data.sales.map(s => <tr key={s.id} className={s.overdue ? "overdue" : undefined}>
              <td><a href={`#/sales/${s.id}`}>{s.listing_title}</a>{s.overdue && <strong className="err cell-note">A step is overdue</strong>}</td>
              <td>{s.buyer_name}</td>
              <td className="num">{money(s.price)}</td>
              <td>{s.next ? <>{s.next.label}<span className="muted cell-note">{s.next.planned_on ? `Planned ${fmtDay(s.next.planned_on)}` : "No date yet"}</span></>
                : "Every step done"}</td>
              <td className="num">{s.target_date ? fmtDay(s.target_date) : "—"}</td>
            </tr>)}</tbody>
          </table></div>
          : <p className="empty card">No sales in progress. Accepting an offer opens one.</p>}
      </section>

      <section className="block" aria-labelledby="h-closed">
        <details className="closed">
          <summary><h2 id="h-closed">Closed <span className="muted">({data.closed.length})</span></h2></summary>
          {data.closed.length ? <div className="table-scroll" role="region" aria-labelledby="h-closed" tabIndex={0}>
            <table className="list">
              <thead><tr><th scope="col">Listing</th><th scope="col">Buyer</th><th scope="col">Price</th><th scope="col">Outcome</th>
                <th scope="col">Closed</th></tr></thead>
              <tbody>{data.closed.map(s => <tr key={s.id}>
                <td><a href={`#/sales/${s.id}`}>{s.listing_title}</a></td>
                <td>{s.buyer_name}</td>
                <td className="num">{money(s.price)}</td>
                <td>{s.status === "completed" ? <span className="badge positive">Completed</span>
                  : <><span className="badge neutral">Fell through</span> <span className="muted">{REASON[s.fell_through_reason]}</span></>}</td>
                <td className="num">{fmtDay(jerseyToday(new Date(s.closed_at)))}</td>
              </tr>)}</tbody>
            </table></div>
            : <p className="empty card">No sales closed in the last 12 months.</p>}
        </details>
      </section>
    </>}
    {dialog?.action === "record" && <RecordOffer buyerId={buyer} onClose={() => setDialog(null)} onDone={done} />}
    {dialog && dialog.action !== "record" && <OfferDialog {...dialog} onClose={() => setDialog(null)} onDone={done} onAccepted={onChange} onRefused={load} />}
  </section>;
}

// V1, V17: a buyer (an active To Buy search) and a listing for sale, not archived; under offer takes backup offers.
function RecordOffer({ buyerId, onClose, onDone }) {
  const [listings, setListings] = useState(null), [listErr, setListErr] = useState(null);
  const [f, setF] = useState({ listing_id: "", amount: "", conditions: "" }), [buyer, setBuyer] = useState(null);
  const [q, setQ] = useState(""), [found, setFound] = useState(null), [findErr, setFindErr] = useState(null);
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false), form = useRef(null);
  const { errors, setErrors, invalid, error } = useFieldErrors("ro");
  useEffect(() => { api("/admin/listings").then(d => setListings(d.listings.filter(forSale)), e => setListErr(e.message)); }, []);
  // Opened from a buyer's record: that buyer is chosen (the server still says if they can't make an offer).
  useEffect(() => {
    if (buyerId) api(`/admin/applicants/${buyerId}`).then(({ applicant: a, contact: c }) => setBuyer(b => b ?? { id: a.id, name: c.name,
      email: c.email, phone: c.phone, stage: a.stage }), () => {});
  }, []);
  // The search runs a moment after typing stops; only the latest one shows.
  useEffect(() => {
    if (!q.trim()) { setFound(null); setFindErr(null); return; }
    let live = true;
    const t = setTimeout(() => api(`/admin/applicants?operation=buy&q=${encodeURIComponent(q.trim())}`)
      .then(d => { if (live) { setFound(d.applicants); setFindErr(null); } }, e => { if (live) setFindErr(e.message); }), 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  useEffect(() => { form.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);

  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const shown = found && buyer && !found.some(a => a.id === buyer.id) ? [buyer, ...found] : found ?? (buyer ? [buyer] : []);
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const local = {};
    if (!f.listing_id) local.listing_id = "Choose a listing";
    if (!buyer) local.applicant_id = "Search for the buyer, then choose them";
    setErr(null); setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api("/admin/offers", { method: "POST", body: { listing_id: f.listing_id, applicant_id: buyer.id,
        amount: pounds(f.amount), conditions: f.conditions.trim() || null } });
      const l = listings.find(x => x.id === f.listing_id);
      onDone(`Offer recorded: ${money(Number(pounds(f.amount)))} from ${buyer.name} on ${l.title}.`);
    } catch (x) { setErrors(x.data?.fields || {}); setErr(x.message); setBusy(false); }
  };

  return <Modal title="Record offer" onClose={onClose}>
    <form ref={form} className="sheet-form" onSubmit={submit} noValidate>
      <label>Listing<select value={f.listing_id} onChange={set("listing_id")} disabled={listings?.length === 0} {...invalid("listing_id")}>
        <option value="">{listings ? "Choose a listing for sale" : listErr ? "The listings couldn't be loaded" : "Loading listings…"}</option>
        {listings?.map(l => <option key={l.id} value={l.id}>{l.title} ({l.id}){l.availability === "under_offer" ? " · under offer" : ""}
          {l.published ? "" : " · draft"}</option>)}</select>{error("listing_id")}</label>
      {listErr && <p role="alert" className="err">{listErr}</p>}
      {listings && !listings.length && <p className="muted">No listing is for sale. A listing takes offers when its operation is Sale and
        it is For sale or Under offer.</p>}
      <label>Buyer<input type="search" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" aria-invalid={errors.applicant_id ? true : undefined}
        aria-describedby={errors.applicant_id ? "d-ro-buyer e-ro-applicant_id" : "d-ro-buyer"} /></label>
      <small id="d-ro-buyer" className="muted">Search by name, email or phone. Only To Buy searches are listed.</small>
      {findErr && <p role="alert" className="err">{findErr}</p>}
      {shown.length > 0 && <fieldset className="choices-set"><legend>Matching buyers</legend><div className="buyers">
        {shown.map(a => <label key={a.id} className="check"><input type="radio" name="ro-buyer" checked={buyer?.id === a.id}
          onChange={() => { setBuyer(a); setErrors(({ applicant_id, ...x }) => x); }} />
          <span>{a.name} <span className="muted">{[a.email || a.phone, show("stage", a.stage)].filter(Boolean).join(" · ")}</span></span></label>)}
      </div></fieldset>}
      {found && !found.length && <p className="muted" role="status">No To Buy search matches “{q.trim()}”.</p>}
      {error("applicant_id")}
      <label>Amount (£)<input value={f.amount} onChange={set("amount")} inputMode="numeric" autoComplete="off" {...invalid("amount")} />
        {error("amount")}</label>
      <label>Conditions (optional)<textarea className="short" value={f.conditions} maxLength={1000} onChange={set("conditions")}
        placeholder="e.g. Subject to mortgage" {...invalid("conditions")} />{error("conditions")}</label>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="inline"><button className="btn">{busy ? "Recording…" : "Record offer"}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>;
}

const ACTION = {
  accept: ["Accept offer", "Accept offer"], counter: ["Counter offer", "Save counter"], edit: ["Edit offer", "Save changes"],
  reject: ["Reject offer", "Reject offer"], withdraw: ["Withdraw offer", "Withdraw offer"],
};

// V4: the seller counters (again, if they like), the team corrects the amount or conditions, or the offer closes.
// Accepting opens the sale file.
function OfferDialog({ action, offer: o, onClose, onDone, onAccepted, onRefused }) {
  const [f, setF] = useState({ counter_amount: o.counter_amount?.toLocaleString("en-GB") ?? "", amount: o.amount.toLocaleString("en-GB"),
    conditions: o.conditions ?? "", note: "" });
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false), form = useRef(null);
  const { errors, setErrors, invalid, error } = useFieldErrors("od");
  useEffect(() => { form.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const [title, button] = ACTION[action];
  const price = o.counter_amount ?? o.amount;
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null); setErrors({});
    try {
      if (action === "edit") {
        await api(`/admin/offers/${o.id}`, { method: "PUT", body: { amount: pounds(f.amount), conditions: f.conditions.trim() || null } });
        return onDone(`Offer from ${o.buyer_name} updated.`);
      }
      const r = await api(`/admin/offers/${o.id}/${action}`, { method: "POST",
        body: action === "counter" ? { counter_amount: pounds(f.counter_amount) } : action === "accept" ? undefined : { note: f.note } });
      if (action === "accept") { onAccepted(); location.hash = `#/sales/${r.sale_id}`; return; }
      onDone({ counter: `Counter of ${money(r.offer.counter_amount)} saved.`, reject: `Offer from ${o.buyer_name} rejected.`,
        withdraw: `Offer from ${o.buyer_name} withdrawn.` }[action]);
    } catch (x) {
      setErrors(x.data?.fields || {}); setErr(x.message); setBusy(false);
      if (x.status === 409) onRefused(); // someone else changed the offer: the list behind shows how it is now
    }
  };
  return <Modal title={title} onClose={onClose}>
    <form ref={form} className="sheet-form" onSubmit={submit} noValidate>
      <p>{o.buyer_name} · {money(o.amount)}{o.counter_amount != null && `, countered at ${money(o.counter_amount)}`} · {o.listing_title}</p>
      {action === "accept" && <p>A sale file opens at {money(price)}. The website shows the listing as Under offer and {o.buyer_name} moves
        to Agreed. Other open offers on this listing stay as backups.</p>}
      {action === "counter" && <label>Seller's counter (£)<input value={f.counter_amount} onChange={set("counter_amount")} inputMode="numeric"
        autoComplete="off" {...invalid("counter_amount")} />{error("counter_amount")}</label>}
      {action === "edit" && <>
        <label>Amount (£)<input value={f.amount} onChange={set("amount")} inputMode="numeric" autoComplete="off" {...invalid("amount")} />{error("amount")}</label>
        <label>Conditions (optional)<textarea className="short" value={f.conditions} maxLength={1000} onChange={set("conditions")}
          {...invalid("conditions")} />{error("conditions")}</label>
        <p className="muted">If the buyer raises their offer, record a new one instead.</p></>}
      {(action === "reject" || action === "withdraw") && <>
        <p>{action === "reject" ? "The seller turns it down." : "The buyer takes it back, or it was recorded in error."} It can't be reopened.</p>
        <label>Note (optional)<textarea className="short" value={f.note} maxLength={300} onChange={set("note")}
          placeholder={action === "withdraw" ? "e.g. Recorded in error" : undefined} {...invalid("note")} />{error("note")}</label></>}
      {err && <p role="alert" className="err">{err}</p>}
      <div className="inline"><button className={`btn${action === "reject" || action === "withdraw" ? " ghost danger" : ""}`}>{busy ? "Saving…" : button}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>;
}
