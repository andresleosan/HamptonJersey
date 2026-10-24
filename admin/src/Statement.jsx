import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDay } from "./format.js";
import { pence } from "./Rentals.jsx";
import { addMonths } from "../../server/rentals.js";
import { jerseyToday } from "../../server/viewings.js";

// Spec §4 Statement (#/rentals/statements?landlord=<id>&month=YYYY-MM), R15, R26, R29: a full-management landlord's
// month, the previous Jersey month by default, printed from the browser (styles.css @media print leaves out the bar,
// the buttons and the selectors). Amounts in pence; deductions shown as minus.
const less = p => pence(-p || 0);
const monthName = m => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default function Statement({ landlord, month }) {
  const [landlords, setLandlords] = useState(null), [data, setData] = useState(null), [err, setErr] = useState(null);
  const now = `${jerseyToday().slice(0, 7)}-01`, months = Array.from({ length: 24 }, (_, i) => addMonths(now, -i).slice(0, 7));
  const m = month || months[1];
  if (!months.includes(m)) months.push(m);
  // The landlords with a full-management property: those the Rentals list shows under that service.
  useEffect(() => {
    api("/admin/rentals?service=full").then(d => setLandlords([...new Map(d.rentals.map(r => [r.landlord_id, { id: r.landlord_id, name: r.landlord_name }]))
      .values()].sort((a, b) => a.name.localeCompare(b.name))), e => setErr(e.message));
  }, []);
  useEffect(() => {
    let live = true; // only the latest choice's answer shows
    setData(null); setErr(null);
    if (landlord) api(`/admin/statements?landlord=${encodeURIComponent(landlord)}&month=${encodeURIComponent(m)}`)
      .then(d => live && setData(d), e => live && setErr(e.message));
    return () => { live = false; };
  }, [landlord, m]);

  const go = (l, mm) => { location.hash = `#/rentals/statements?${new URLSearchParams(Object.entries({ landlord: l, month: mm }).filter(([, v]) => v))}`; };
  const t = data?.totals, options = landlords && data && !landlords.some(l => l.id === data.landlord.id) ? [...landlords, data.landlord] : landlords;
  return <section className="statement" aria-labelledby="t-statement">
    <div className="head"><h1 id="t-statement">Statement</h1>
      <div className="ctl"><a className="btn ghost" href="#/rentals">Back to rentals</a>
        <button type="button" className="btn" onClick={() => print()} disabled={!data}>Print</button></div></div>
    <form id="statement-form" className="filters" onSubmit={e => e.preventDefault()}>
      <label>Landlord<select value={landlord ?? ""} onChange={e => go(e.target.value, m)} disabled={!options}>
        <option value="">{options ? (options.length ? "Choose a landlord" : "No full management landlords yet") : "Loading…"}</option>
        {options?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Month<select value={m} onChange={e => go(landlord, e.target.value)}>
        {months.map(x => <option key={x} value={x}>{monthName(x)}</option>)}</select></label>
    </form>
    {err && <p role="alert" className="err">{err}</p>}
    {!landlord ? <p className="empty card">Choose a landlord to see their statement.</p> : !data ? !err && <p>Loading statement…</p>
    : <article id="statement" className="card">
      <header className="statement-head"><h2>{data.landlord.name}</h2>
        <p>Statement for {monthName(data.month)} · Hampton Estates</p>
        {(data.landlord.email || data.landlord.phone) && <p className="muted">{[data.landlord.email, data.landlord.phone].filter(Boolean).join(" · ")}</p>}
      </header>
      {data.rentals.length ? data.rentals.map(r => <section key={r.id} className="statement-property" aria-labelledby={`sp-${r.id}`}>
        <h3 id={`sp-${r.id}`}>{r.address}</h3>
        <table className="lines"><tbody>
          <tr><th scope="row">Rent received</th><td className="num">{pence(r.rent_received)}</td></tr>
          <tr><th scope="row">Management fee ({r.fee_percent}%)</th><td className="num">{less(r.fee)}</td></tr>
          {r.repairs.map(x => <tr key={x.id}><th scope="row">{x.title}<span className="muted cell-note">Repair
            {x.contractor && ` by ${x.contractor}`}, done {fmtDay(x.done_on)}</span></th><td className="num">{less(x.cost)}</td></tr>)}
        </tbody></table>
        {r.other_received > 0 && <p className="muted">Deposits and other money received: {pence(r.other_received)}. Held apart: no fee and
          not in the totals.</p>}
      </section>) : <p className="muted">No full management properties for this landlord.</p>}
      <table className="lines totals" id="statement-totals"><caption>Totals for {monthName(data.month)}</caption><tbody>
        <tr><th scope="row">Rent received</th><td className="num">{pence(t.rent)}</td></tr>
        <tr><th scope="row">Fees</th><td className="num">{less(t.fee)}</td></tr>
        {t.gst != null && <tr><th scope="row">GST on fees ({data.gst_percent}%)</th><td className="num">{less(t.gst)}</td></tr>}
        <tr><th scope="row">Repairs</th><td className="num">{less(t.repairs)}</td></tr>
        <tr className="net"><th scope="row">Net to landlord</th><td className="num">{pence(t.net)}</td></tr>
      </tbody></table>
    </article>}
  </section>;
}
