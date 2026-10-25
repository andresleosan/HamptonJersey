import { useEffect, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, priceText, fmtDayMonth } from "./format.js";
import { money, OfferBadge } from "./Sales.jsx";
import { jerseyToday } from "../../server/viewings.js";

// Spec O1-O9, O11, O12 (#/listings/<id>/report?days=7|30|90): one listing's report for its owner, printed from the
// browser and saved as PDF like the Statement (styles.css @media print leaves out the bar, the buttons and the form).
// Counts, dates, amounts and the team's notes only, never who. Prepared for and Notes from Hampton are not saved.
const PERIODS = [7, 30, 90];
// O5: the owner's words for a viewing's outcome.
const OUTCOME = { proceed: "Wants to proceed", more_info: "Wants more information", not_interested: "Not interested" };
const n = v => v.toLocaleString("en-GB");
const plural = (k, one, many = `${one}s`) => `${n(k)} ${k === 1 ? one : many}`;
const day = d => fmtDayMonth(d); // "18 Oct 2026"
const longDay = d => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function OwnerReport({ id, days }) {
  const period = PERIODS.includes(Number(days)) ? Number(days) : 30;
  const [data, setData] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0); // Retry reads the same period again
  const [preparedFor, setPreparedFor] = useState(""), [notes, setNotes] = useState(""), [withNotes, setWithNotes] = useState(true);
  useEffect(() => {
    let stale = false; // the previous report stays, dimmed, while another period loads
    setBusy(true); setError(null);
    api(`/admin/listings/${encodeURIComponent(id)}/report?days=${period}`).then(d => { if (!stale) { setData(d); setBusy(false); } },
      e => { if (!stale) { setError(e.message); setBusy(false); } });
    return () => { stale = true; };
  }, [id, period, attempt]);
  const go = p => { location.hash = `#/listings/${encodeURIComponent(id)}/report?days=${p}`; };

  return <section className="owner-report" aria-labelledby="t-report">
    <div className="head"><h1 id="t-report">Owner report</h1>
      <div className="ctl"><a className="btn ghost" href={`#/p/${encodeURIComponent(id)}`}>Back to listing</a>
        <button type="button" className="btn" onClick={() => print()} disabled={!data || busy}>Print</button></div></div>
    <p className="muted screen-note">Print it and choose Save as PDF to send it to the owner. Nothing typed here is saved.</p>
    <div className="seg" role="group" aria-label="Period">{PERIODS.map(p =>
      <button key={p} type="button" aria-pressed={period === p} onClick={() => go(p)}>{p} days</button>)}</div>
    <form id="report-form" className="report-form" onSubmit={e => e.preventDefault()}>
      <label>Prepared for (optional)<input value={preparedFor} onChange={e => setPreparedFor(e.target.value)} maxLength={120}
        autoComplete="off" /></label>
      <label>Notes from Hampton (optional)<textarea className="short" value={notes} onChange={e => setNotes(e.target.value)}
        maxLength={2000} placeholder="e.g. Most feedback mentions the price. We suggest a review." /></label>
      <div className="notes-choice"><label className="check"><input type="checkbox" checked={withNotes}
        onChange={e => setWithNotes(e.target.checked)} aria-describedby="d-notes" />Include feedback notes</label>
        <p id="d-notes" className="warn" role="note">Notes print as written. Keep names out of them.</p></div>
    </form>
    {error ? <p role="alert" className="err">{error}{" "}
      <button type="button" className="btn ghost sm" onClick={() => setAttempt(a => a + 1)}>Retry</button></p>
      : !data ? <p>Loading report…</p>
      : <article id="owner-report" className="card" aria-busy={busy}>
        <Report d={data} preparedFor={preparedFor.trim()} notes={notes.trim()} withNotes={withNotes} /></article>}
  </section>;
}

function Report({ d, preparedFor, notes, withNotes }) {
  const { listing: l, period, web, viewings: v, demand, offers, sale } = d;
  const these = `these ${period.days} days`, missed = v.cancelled + v.no_show;
  return <>
    <header className="report-head">
      <div className="firm"><p className="firm-name">Hampton Estates</p>
        <address>42 Bath Street, St Helier, Jersey JE2 4ST<br /><span className="num">01534 727582</span></address></div>
      <p className="eyebrow">Report for the owner</p>
      <h2 id="h-report">{l.title}</h2>
      <p className="report-sub"><span className="price">{priceText(l)}</span> · {AVAILABILITY[l.availability] ?? "—"} · Ref. {l.id}</p>
      <dl className="report-facts">
        <div><dt>Period</dt><dd>{day(period.from)} to {day(period.to)} ({period.days} days)</dd></div>
        <div><dt>Prepared</dt><dd>{longDay(period.to)}</dd></div>
        {preparedFor && <div><dt>Prepared for</dt><dd>{preparedFor}</dd></div>}
      </dl>
    </header>

    <section className="report-block" aria-labelledby="h-web">
      <h3 id="h-web">On the website</h3>
      <p className="muted">Times the listing's page, its full-screen gallery and its 3D tour were opened on Hampton's website
        in {these}. Opens, not people.</p>
      {web.views + web.photos + web.tour ? <>
        <dl className="report-figures">{[["Page views", web.views], ["Gallery opens", web.photos], ["3D tour opens", web.tour]]
          .map(([t, x]) => <div key={t}><dt>{t}</dt><dd className="num">{n(x)}</dd></div>)}</dl>
        {web.views > 0 && <ViewsChart byDay={web.by_day} days={period.days} />}
      </> : <p className="report-empty">{web.since.first_day ? `No visits to this listing's page in ${these}.`
        : "The website hasn't counted any visits to this listing yet."}</p>}
      {/* Counting started before the period: the totals since then; inside it: from when the figures count. */}
      {web.since.first_day && (web.since.first_day < period.from
        ? <p className="muted">Since counting began on {day(web.since.first_day)}: {plural(web.since.views, "page view")},
          {" "}{plural(web.since.photos, "gallery open")} and {plural(web.since.tour, "3D tour open")}.</p>
        : web.since.first_day > period.from && <p className="muted">The website began counting on {day(web.since.first_day)}.</p>)}
    </section>

    <section className="report-block" aria-labelledby="h-viewings">
      <h3 id="h-viewings">Viewings</h3>
      <p className="muted">By the day of the viewing: those that took place in {these}, and those booked from today on.</p>
      {v.completed + v.upcoming + missed ? <dl className="report-figures">{[["Viewings held", v.completed], ["Booked from today", v.upcoming],
        ["Cancelled or missed", missed]].map(([t, x]) => <div key={t}><dt>{t}</dt><dd className="num">{n(x)}</dd></div>)}</dl>
        : <p className="report-empty">No viewings took place in {these}, and none are booked yet.</p>}
      {v.feedback.length > 0 && <>
        <h4>Feedback from viewings</h4>
        <ol className="feedback">{v.feedback.map((f, i) => <li key={i}>
          <span className="when">{day(f.date)}</span>
          <span className="outcome">{f.outcome ? OUTCOME[f.outcome] : "No feedback recorded"}</span>
          {withNotes && f.note && <p className="note">{f.note}</p>}</li>)}</ol>
      </>}
    </section>

    <section className="report-block" aria-labelledby="h-demand">
      <h3 id="h-demand">Applicants looking</h3>
      <p className="muted">Active applicants on Hampton's register whose search fits this property today.</p>
      <p className={demand.matched ? "report-lead" : "report-empty"}>{demand.matched
        ? <>{plural(demand.matched, "active applicant")} on our register {demand.matched === 1 ? "is" : "are"} looking for a
          property like this{demand.shortlisted > 0 && `; ${n(demand.shortlisted)} of them shortlisted for it by our team`}.</>
        : "No active applicant on our register matches this property yet. New ones are matched as they register."}</p>
    </section>

    {offers && <section className="report-block" aria-labelledby="h-offers">
      <h3 id="h-offers">Offers</h3>
      <p className="muted">Offers still open, and any made in {these}. Numbered in the order they arrived; buyers stay private.</p>
      {offers.length ? <table className="lines report-offers" aria-labelledby="h-offers">
        <thead><tr><th scope="col">Offer</th><th scope="col">Received</th><th scope="col" className="num">Amount</th>
          <th scope="col">Status</th></tr></thead>
        <tbody>{offers.map(o => <tr key={o.n}><th scope="row">Offer {o.n}</th><td>{day(jerseyToday(new Date(o.created_at)))}</td>
          <td className="num">{money(o.amount)}</td>
          <td><OfferBadge status={o.status} />{o.counter_amount != null && <span className="counter">Countered at {money(o.counter_amount)}</span>}</td>
        </tr>)}</tbody></table>
        : <p className="report-empty">No open offers, and none made in {these}.</p>}
    </section>}

    {offers && <section className="report-block" aria-labelledby="h-sale">
      <h3 id="h-sale">Sale</h3>
      {!sale ? <p className="report-empty">No sale agreed yet.</p>
        : sale.status === "completed" ? <p className="report-lead">Sold · agreed {money(sale.agreed_price)} · completed {day(sale.completed_on)}</p>
        : <>
          <p className="report-lead">Sale agreed at {money(sale.agreed_price)}, in progress.</p>
          {sale.milestones.length ? <ol className="steps">{sale.milestones.map(m =>
            <li key={m.key}><span>{m.label}</span><span className="when">{day(m.done_on)}</span></li>)}</ol>
            : <p className="muted">No steps completed yet.</p>}
          {sale.next && <p>Next step: {sale.next.label}.</p>}
        </>}
    </section>}

    {notes && <section className="report-block" aria-labelledby="h-notes">
      <h3 id="h-notes">Notes from Hampton</h3>
      <p className="report-notes">{notes}</p>
    </section>}

    <p className="muted report-foot">Prepared by Hampton Estates from its own records. Figures cover the period shown unless
      stated otherwise.</p>
  </>;
}

// O4: page views by day (7 days) or by week (30 and 90). Weeks end on the period's last day, so only the first may be
// shorter. One colour, the value over each bar, the same figures in a table for screen readers; the bars' heights are
// set through the CSSOM, not a style attribute (DESIGN.md).
function ViewsChart({ byDay, days }) {
  const weekly = days > 7, bars = [];
  if (!weekly) for (const x of byDay) bars.push({ from: x.day, to: x.day, days: 1, views: x.views });
  else for (let end = byDay.length; end > 0; end -= 7) {
    const part = byDay.slice(Math.max(0, end - 7), end);
    bars.unshift({ from: part[0].day, to: part.at(-1).day, days: part.length, views: part.reduce((s, x) => s + x.views, 0) });
  }
  const max = Math.max(...bars.map(b => b.views)), short = bars[0].days < 7 && weekly;
  const tick = b => weekly ? fmtDayMonth(b.from, false)
    : new Date(`${b.from}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });
  const title = `Page views by ${weekly ? "week" : "day"}`;
  return <figure className="views-chart">
    <figcaption>{title}{weekly && <span className="muted"> · each bar is a week, labelled by its first day
      {short && `; the first covers ${plural(bars[0].days, "day")}`}</span>}</figcaption>
    <div aria-hidden="true">
      <div className={`cols${bars.length > 7 ? " many" : ""}`}>{bars.map(b => <div key={b.from} className="col">
        <span className="num">{n(b.views)}</span>
        <span className="colbar" ref={el => { el?.style.setProperty("--h", max ? b.views / max : 0); }} /></div>)}</div>
      <div className={`ticks${bars.length > 7 ? " many" : ""}`}>{bars.map(b => <span key={b.from}>{tick(b)}</span>)}</div>
    </div>
    <table className="sr"><caption>{title}</caption>
      <thead><tr><th scope="col">{weekly ? "Week" : "Day"}</th><th scope="col">Page views</th></tr></thead>
      <tbody>{bars.map(b => <tr key={b.from}><th scope="row">{b.days > 1 ? `${day(b.from)} to ${day(b.to)}` : day(b.from)}</th>
        <td>{n(b.views)}</td></tr>)}</tbody></table>
  </figure>;
}
