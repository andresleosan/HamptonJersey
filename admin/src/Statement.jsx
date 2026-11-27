import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDay } from "./format.js";
import { pence } from "./Rentals.jsx";
import { useFieldErrors } from "./Sales.jsx";
import { addMonths } from "../../server/rentals.js";
import { jerseyToday } from "../../server/viewings.js";

// Spec §4 Statement (#/rentals/statements?landlord=<id>&month=YYYY-MM), R15, R26, R29: a full-management landlord's
// month, the previous Jersey month by default, printed from the browser (styles.css @media print leaves out the bar,
// the buttons and the selectors). Amounts in pence; deductions shown as minus.
const less = p => pence(-p || 0);
const monthName = m => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default function Statement({ landlord, month }) {
  const [landlords, setLandlords] = useState(null), [data, setData] = useState(null), [err, setErr] = useState(null), [tick, setTick] = useState(0);
  const now = `${jerseyToday().slice(0, 7)}-01`, months = Array.from({ length: 24 }, (_, i) => addMonths(now, -i).slice(0, 7));
  const m = month || months[1];
  if (!months.includes(m)) months.push(m);
  // The landlords with a full-management property not archived (P26: their own small query, not the Rentals overview).
  useEffect(() => { api("/admin/landlords?service=full").then(d => setLandlords(d.landlords), e => setErr(e.message)); }, []);
  useEffect(() => {
    let live = true; // only the latest choice's answer shows
    setData(null); setErr(null);
    if (landlord) api(`/admin/statements?landlord=${encodeURIComponent(landlord)}&month=${encodeURIComponent(m)}`)
      .then(d => live && setData(d), e => live && setErr(e.message));
    return () => { live = false; };
  }, [landlord, m, tick]);

  const [note, setNote] = useState(null), reload = n => { setNote(n); setTick(x => x + 1); };
  const go = (l, mm) => { setNote(null); location.hash = `#/rentals/statements?${new URLSearchParams(Object.entries({ landlord: l, month: mm }).filter(([, v]) => v))}`; };
  // ADM-10: once closed, the page shows the latest closed revision as it was closed (data.closed), not the live figures.
  const doc = data?.closed?.statement ?? data, t = doc?.totals, options = landlords && data && !landlords.some(l => l.id === data.landlord.id) ? [...landlords, data.landlord] : landlords;
  return <section className="statement" aria-labelledby="t-statement">
    <div className="head"><h1 id="t-statement">Statement</h1>
      <div className="ctl"><a className="btn ghost" href="#/rentals">Back to rentals</a>
        {data?.digest && <button type="button" className="btn ghost" onClick={() => download(doc)}>Download CSV</button>}
        <button type="button" className="btn" onClick={() => print()} disabled={!data}>Print</button></div></div>
    <form id="statement-form" className="filters" onSubmit={e => e.preventDefault()}>
      <label>Landlord<select value={landlord ?? ""} onChange={e => go(e.target.value, m)} disabled={!options}>
        <option value="">{options ? (options.length ? "Choose a landlord" : "No full management landlords yet") : "Loading…"}</option>
        {options?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      <label>Month<select value={m} onChange={e => go(landlord, e.target.value)}>
        {months.map(x => <option key={x} value={x}>{monthName(x)}</option>)}</select></label>
    </form>
    <Gst onSaved={() => setTick(n => n + 1)} />
    {err && <p role="alert" className="err">{err}</p>}
    {data?.digest && <Closing data={data} onDone={reload} />}
    {note && <p role={note.ok ? "status" : "alert"} className={note.ok ? "ok" : "err"}>{note.text}</p>}
    {!landlord ? <p className="empty card">Choose a landlord to see their statement.</p> : !data ? !err && <p>Loading statement…</p>
    : <article id="statement" className="card">
      <header className="statement-head"><h2>{doc.landlord.name}</h2>
        <p>Statement for {monthName(doc.month)}{data.closed && ` · revision ${data.closed.revision}`}</p><p>Hampton Estates</p>
        {(data.landlord.email || data.landlord.phone) && <p className="muted">{[data.landlord.email, data.landlord.phone].filter(Boolean).join(" · ")}</p>}
      </header>
      {doc.rentals.length ? doc.rentals.map(r => <section key={r.id} className="statement-property" aria-labelledby={`sp-${r.id}`}>
        <h3 id={`sp-${r.id}`}>{r.address}</h3>
        <table className="lines"><tbody>
          <tr><th scope="row">Rent received</th><td className="num">{pence(r.rent_received)}</td></tr>
          <tr><th scope="row">Management fee ({r.fee_percent}%)</th><td className="num">{less(r.fee)}</td></tr>
          {r.repairs.map(x => <tr key={x.id}><th scope="row">{x.title}<span className="muted cell-note">Repair
            {x.contractor && ` by ${x.contractor}`}, done {fmtDay(x.done_on)}</span></th><td className="num">{less(x.cost)}</td></tr>)}
        </tbody></table>
        {r.other_received > 0 && <p className="muted">Deposits and other money received: {pence(r.other_received)}. Held apart: no fee and
          not in the totals.</p>}
        {r.written_off > 0 && <p className="muted">Rent written off this month: {pence(r.written_off)}. Never received: no fee and
          not in the totals.</p>}
      </section>) : <p className="muted">No full management properties for this landlord.</p>}
      <table className="lines totals" id="statement-totals"><caption>Totals for {monthName(doc.month)}</caption><tbody>
        <tr><th scope="row">Rent received</th><td className="num">{pence(t.rent)}</td></tr>
        <tr><th scope="row">Fees</th><td className="num">{less(t.fee)}</td></tr>
        {t.gst != null ? <tr><th scope="row">GST on fees ({doc.gst_percent}%)</th><td className="num">{less(t.gst)}</td></tr>
          : data.digest && <tr><th scope="row">GST on fees<span className="muted cell-note">GST not configured</span></th>
            <td className="num">{pence(0)}</td></tr>}
        <tr><th scope="row">Repairs</th><td className="num">{less(t.repairs)}</td></tr>
        <tr className="net"><th scope="row">Net to landlord</th><td className="num">{pence(t.net)}</td></tr>
      </tbody></table>
    </article>}
  </section>;
}

// ADM-10: close the month as shown (a frozen revision), then mark it sent and paid to the landlord by hand. Sending
// by email is AUT-17's. A revision whose figures changed afterwards stays as it was: the team closes the next one.
function Closing({ data, onDone }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), c = data.closed;
  const ended = data.month < jerseyToday().slice(0, 7), changed = c && c.source_digest !== data.digest;
  const send = async (path, method, body, text) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await api(path, { method, body }); onDone({ ok: true, text }); }
    catch (x) { if (x.status === 409) onDone({ text: x.message }); else setMsg({ text: x.message }); }
    finally { setBusy(false); }
  };
  const closeIt = () => send("/admin/statements", "POST", { landlord: data.landlord.id, month: data.month, digest: data.digest },
    "Statement closed.");
  const mark = what => send(`/admin/statement-runs/${c.id}/${what}`, "PUT", {}, `Marked ${what}.`);
  return <section className="card statement-close" aria-labelledby="t-closing"><h2 id="t-closing">Month end</h2>
    {!c ? <div className="inline"><p>{ended ? "Not closed yet." : "You can close this month once it has ended."}</p>
      {ended && <button type="button" className="btn" onClick={closeIt} disabled={busy}>{busy ? "Closing…" : "Close statement"}</button>}</div>
    : <>
      <p>Closed {fmtDay(c.closed_at.slice(0, 10))} by {c.closed_by}: revision {c.revision}, net {pence(c.net_pence)}.</p>
      {changed && <div className="warn to-confirm"><p>The figures changed after this statement was closed. The statement below
        stays as it was closed.</p><button type="button" className="btn" onClick={closeIt} disabled={busy}>Close revision {c.revision + 1}</button></div>}
      {data.email_ready && !c.sent_on && !changed && <StatementEmail run={c} onDone={onDone} />}
      {["sent", "paid"].map(w => <div key={w} className="inline">{c[`${w}_on`]
        ? <p>{w === "sent" ? "Sent to" : "Paid to"} the landlord on {fmtDay(c[`${w}_on`])} ({c[`${w}_by`]}).</p>
        : <><p>{w === "sent" ? "Not sent yet." : c.paid_before ? paidBefore(c) : "Not paid yet."}</p>
          <button type="button" className="btn ghost" onClick={() => mark(w)} disabled={busy}>Mark as {w}</button></>}</div>)}
      {data.runs.length > 1 && <ul className="plain-list">{data.runs.slice(1).map(r => <li key={r.id}>Revision {r.revision}: closed
        {" "}{fmtDay(r.closed_at.slice(0, 10))}, net {pence(r.net_pence)}{r.sent_on && `, sent ${fmtDay(r.sent_on)}`}
        {r.paid_on && `, paid ${fmtDay(r.paid_on)}`}</li>)}</ul>}
    </>}
    {msg && <p role="alert" className="err">{msg.text}</p>}
  </section>;
}

// ADM-10 (ADM10_STATEMENT_EMAIL_READY): the closed statement emailed to the landlord (server/statement-emails.js). The team reads
// the text and approves exactly it; Gmail taking it marks the statement sent. Mark as sent by hand stays for any other way.
function StatementEmail({ run, onDone }) {
  const [d, setD] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false), url = `/admin/statement-runs/${run.id}/email`;
  const load = () => api(url).then(setD, x => setErr(x.message));
  useEffect(() => { load(); }, [run.id]);
  const act = async (path, body, text) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await api(`${url}/${path}`, { method: "POST", body }); onDone({ ok: true, text }); await load(); }
    catch (x) { setErr(x.message); if (x.status === 409) load(); }
    setBusy(false);
  };
  const e = d?.email, waiting = e && ["queued", "sending", "accepted"].includes(e.status);
  return <div className="card"><h3>Email to the landlord</h3>
    {!d ? !err && <p role="status">Loading…</p> : <>
      {d.recipient && <p>To {d.recipient.name}, {d.recipient.email}. Subject: {d.subject}</p>}
      {e && <p role="status"><strong>{waiting ? "Approved and queued to send" : e.status === "unknown" ? "Not known whether it was sent" : "The last email did not leave"}</strong>
        {" "}(approved by {e.approved_by})</p>}
      {e?.status === "unknown" && <div className="inline"><p>The email service did not confirm it. Look in Hampton's Gmail, Sent folder, then say which.</p>
        <button type="button" className="btn sm" disabled={busy} onClick={() => act("outcome", { sent: true, ref: e.ref }, "Marked sent.")}>It was sent</button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => act("outcome", { sent: false, ref: e.ref }, "Not sent.")}>It was not sent</button></div>}
      {d.blocked ? <p className="err">{d.blocked}</p> : !e || !["queued", "sending", "accepted", "unknown"].includes(e.status) ? <>
        <pre className="statement-email-text">{d.text}</pre>
        {d.email_stop && <p className="muted">{d.email_stop}</p>}
        <button type="button" className="btn" disabled={busy || !!d.email_stop}
          onClick={() => act("approve", { revision: d.revision, digest: d.digest }, "Email approved and queued.")}>Approve and send</button></> : null}
    </>}
    {err && <p role="alert" className="err">{err}</p>}
  </div>;
}

// A revision after one already paid: what was paid and the difference, never the whole net again.
function paidBefore({ net_pence, paid_before: p }) {
  const left = net_pence - p.net_pence;
  return `Revision ${p.revision} was paid on ${fmtDay(p.paid_on)}: ${pence(p.net_pence)}. ${left > 0 ? `Still to pay: ${pence(left)}.`
    : left < 0 ? `${pence(-left)} more than this revision was paid.` : "Nothing more to pay."}`;
}

// The statement shown, as CSV (RFC 4180, amounts in pence). Text that could start a spreadsheet formula gets an apostrophe.
function download(doc) {
  const cell = v => typeof v === "number" ? v : `"${String(v ?? "").replace(/^[=+\-@\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const rows = [["property", "line", "amount_pence"]];
  for (const r of doc.rentals) {
    rows.push([r.address, "rent_received", r.rent_received], [r.address, "fee", -r.fee]);
    for (const x of r.repairs) rows.push([r.address, `repair: ${x.title}`, -x.cost]);
    rows.push([r.address, "other_received_apart", r.other_received]);
    if (r.written_off != null) rows.push([r.address, "written_off_apart", r.written_off]);
  }
  const t = doc.totals;
  rows.push(["", "total_rent", t.rent], ["", "total_fee", -t.fee], ["", "gst_on_fees", -(t.gst ?? 0)], ["", "total_repairs", -t.repairs],
    ["", "net_to_landlord", t.net]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" }));
  a.download = `statement-${doc.landlord.id}-${doc.month}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href));
}

// R29: GST on Hampton's fees, for every statement; 0 leaves the line out.
function Gst({ onSaved }) {
  const [saved, setSaved] = useState(null), [value, setValue] = useState(""), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const { errors, setErrors, invalid, error } = useFieldErrors("gst"), input = useRef(null);
  const show = p => { setSaved(p); setValue(String(p)); };
  useEffect(() => { api("/admin/settings/gst").then(r => show(r.percent), e => setMsg({ text: e.message })); }, []);
  useEffect(() => { if (errors.percent) input.current?.focus(); }, [errors]);
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); setErrors({});
    try {
      const r = await api("/admin/settings/gst", { method: "PUT", body: { percent: value.trim() || null } });
      show(r.percent); setMsg({ ok: true, text: `GST on fees saved: ${r.percent}%.` }); onSaved();
    } catch (x) { setErrors(x.data?.fields || {}); setMsg({ text: x.message }); }
    finally { setBusy(false); }
  };
  return <form id="gst-form" className="gst" onSubmit={submit} noValidate>
    <div className="inline"><label className="fee">GST on fees (%)<input ref={input} id="gst-percent" value={value}
      onChange={e => setValue(e.target.value)} inputMode="decimal" autoComplete="off" disabled={saved == null} {...invalid("percent")}
      aria-describedby={["d-gst", invalid("percent")["aria-describedby"]].filter(Boolean).join(" ")} />{error("percent")}</label>
      <button className="btn ghost" disabled={saved == null || value.trim() === String(saved) || busy}>{busy ? "Saving…" : "Save GST"}</button></div>
    <small id="d-gst" className="muted">Leave at 0 unless Hampton is GST registered.</small>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </form>;
}
