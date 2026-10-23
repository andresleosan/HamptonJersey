import { useEffect, useState } from "react";
import { api } from "./api.js";
import { show, fmtDay } from "./format.js";

// Spec §5 Insights (I5-I11): what people look at, what applicants ask for that the listings don't cover, and how fast the
// team answers. Counts and medians only, never who.
const PERIODS = [7, 30, 90];
const OPERATIONS = [["rent", "Rent", "to let"], ["buy", "Buy", "for sale"]];
const STAGES = [["registered", "Registered"], ["viewing", "Viewing"], ["offer", "Offer"], ["agreed", "Agreed"], ["completed", "Completed"]];
const TIMES = [
  ["attend", "New website applicant to the team's first attention", "A change of stage or details by the team, or the first review of their matches."],
  ["viewing_reply", "Website viewing request to its first reply", "Confirmed, cancelled or moved to another time."],
  ["first_review", "New applicant to the first review of their matches",
    "Applicants from any source. Waiting: still active, with found matches on available listings to review."],
];
const n = v => (v == null ? "—" : v.toLocaleString("en-GB"));
const plural = (k, one) => `${n(k)} ${k === 1 ? one : `${one}s`}`;
// Ruling R2: amounts as the rest of the panel shows them, "a month" for rent (Review.jsx).
const budget = (v, op) => (v == null ? "—" : `${show("budget_max", v)}${op === "rent" ? " a month" : ""}`);
// I11: hours under 48, then days with one decimal.
const duration = h => (h == null ? "—" : h < 48 ? plural(h, "hour") : `${(h / 24).toFixed(1)} days`);

export default function Insights() {
  const [days, setDays] = useState(30), [data, setData] = useState(null), [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0); // Retry reads the same period again
  const [busy, setBusy] = useState(true); // the previous report stays, dimmed, while another period loads
  useEffect(() => {
    let stale = false;
    setBusy(true); setError(null);
    api(`/admin/insights?days=${days}`).then(d => { if (!stale) { setData(d); setBusy(false); } },
      e => { if (!stale) { setError(e.message); setBusy(false); } });
    return () => { stale = true; };
  }, [days, attempt]);

  return <section className="insights" aria-labelledby="t-insights">
    <div className="head"><div><h1 id="t-insights">Insights</h1>
      <p className="muted">Counts and medians only, never who.</p></div></div>
    <div className="seg" role="group" aria-label="Period">{PERIODS.map(p =>
      <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)}>{p} days</button>)}</div>
    {error ? <p role="alert" className="err">{error}{" "}
      <button type="button" className="btn ghost sm" onClick={() => setAttempt(a => a + 1)}>Retry</button></p>
      : !data ? <p>Loading insights…</p> : <div className="report" aria-busy={busy}><Report d={data} /></div>}
  </section>;
}

function Report({ d }) {
  const { period, totals, demand, unmet, views, funnel, times } = d;
  const these = `these ${period.days} days`;
  // I9: counting started inside the period, so its first days have no views.
  const counted = views.first_day && `Views are counted from ${fmtDay(views.first_day)}.`;
  return <>
    <p className="muted">{fmtDay(period.from)} to {fmtDay(period.to)}, today included.</p>
    <dl className="figures">{[["Listing views", totals.views], ["Viewing requests", totals.viewing_requests],
      ["New applicants", totals.new_applicants], ["Viewings completed", totals.viewings_completed]].map(([t, v]) =>
      <div key={t} className="card"><dt>{t}</dt><dd className="num">{n(v)}</dd></div>)}</dl>
    <p className="muted">Listing pages opened on the website; viewing requests created, from any origin; applicants registered and
      not archived; viewings completed, by the day of the viewing.</p>

    <section className="block" aria-labelledby="h-demand">
      <h2 id="h-demand">Unmet demand</h2>
      <p className="muted">Today's active applicants, whatever the period, and the listings available to match them. Without a
        match: no found or shortlisted match on an available listing. Someone who wants several parishes counts in each.</p>
      {OPERATIONS.map(([op, t, offered]) => <div key={op}><h3 id={`h-${op}`}>{t}</h3>{demand[op].length
        ? <div className="table-scroll" role="region" aria-label={`${t} demand`} tabIndex={0}>
          <table className="list" aria-labelledby={`h-${op}`}>
            <thead><tr><th scope="col">Parish</th><th scope="col" className="num">Active applicants</th>
              <th scope="col" className="num">Without a match</th><th scope="col" className="num">Median budget</th>
              <th scope="col" className="num">Available listings</th></tr></thead>
            <tbody>{demand[op].map(r => <tr key={r.parish}><th scope="row">{r.parish}</th>
              <td className="num">{n(r.applicants)}</td><td className="num">{n(r.unmatched)}</td>
              <td className="num">{budget(r.median_budget, op)}</td><td className="num">{n(r.listings)}</td></tr>)}</tbody>
          </table></div>
        : <p className="empty card">No active {t.toLowerCase()} applicants and no listings {offered} to match them.</p>}</div>)}
      <h3>Top unmet requests</h3>
      <p className="muted">Active applicants without a match, by what they ask for, most asked first. The rows don't add up:
        someone who wants several parishes is in each.</p>
      {unmet.length ? <ol className="unmet">{unmet.map(u =>
        <li key={`${u.operation} ${u.parish} ${u.bedrooms_min}`}><strong>{plural(u.applicants, "applicant")}</strong>
          {" · "}{u.operation === "rent" ? "Rent" : "Buy"} · {u.parish} · {u.bedrooms_min == null ? "Any bedrooms" : `${u.bedrooms_min}+ bedrooms`}
          {" · "}{u.median_budget == null ? "no budget given" : `median budget ${budget(u.median_budget, u.operation)}`}</li>)}</ol>
        : <p className="empty card">{[...demand.rent, ...demand.buy].some(r => r.applicants > 0)
          ? "Every active applicant has a found or shortlisted match on an available listing." : "No active applicants."}</p>}
    </section>

    <section className="block" aria-labelledby="h-views">
      <h2 id="h-views">Most viewed listings</h2>
      <p className="muted">Opens on the website, not people: a listing's page, its full-screen gallery and its 3D tour, once per
        page load. Viewing requests: created in the period for that listing, from any origin.
        {counted && views.first_day > period.from && ` ${counted}`}</p>
      <p><strong className="num">{plural(totals.views, "view")}</strong> in {these}.</p>
      {views.rows.length ? <div className="table-scroll" role="region" aria-label="Views by listing" tabIndex={0}>
        <table className="list">
          <thead><tr><th scope="col">Listing</th><th scope="col" className="num">Views</th><th scope="col" className="num">Gallery</th>
            <th scope="col" className="num">3D tour</th><th scope="col" className="num">Viewing requests</th></tr></thead>
          <tbody>{views.rows.map(r => <tr key={r.listing_id}>
            <th scope="row"><a href={`#/p/${encodeURIComponent(r.listing_id)}`}>{r.title || r.listing_id}</a>{" "}
              <span className="muted">{r.listing_id}</span></th>
            <td className="num">{n(r.views)}</td><td className="num">{n(r.photos)}</td><td className="num">{n(r.tour)}</td>
            <td className="num">{n(r.viewings)}</td></tr>)}</tbody>
        </table></div>
        : <p className="empty card">{counted ? `No views in ${these}. ${counted}`
          : "No views counted yet. The website counts them from the next release."}</p>}
    </section>

    <section className="block" aria-labelledby="h-funnel">
      <h2 id="h-funnel">Funnel</h2>
      <p className="muted">Applicants registered in the period and not archived. A stage counts everyone who reached it, now or
        before: someone at Offer is also in Viewing. Lost: those whose stage is Lost today.</p>
      {funnel.registered ? <div className="card funnel">
        <ol>{STAGES.map(([k, t]) => <Bar key={k} label={t} value={funnel[k]} of={funnel.registered} />)}</ol>
        <ul><Bar label="Lost" value={funnel.lost} of={funnel.registered} /></ul>
      </div> : <p className="empty card">No applicants registered in {these}.</p>}
    </section>

    <section className="block" aria-labelledby="h-times">
      <h2 id="h-times">Team response times</h2>
      <p className="muted">Median clock time (not working hours) of the cases that started in the period. Waiting: started in
        the period and not answered yet; they are not in the median.</p>
      <dl className="figures times">{TIMES.map(([k, t, what]) => {
        const x = times[k];
        return <div key={k} className="card"><dt>{t}</dt><dd className="num">{duration(x.median_hours)}</dd>
          <dd className="muted">{x.cases ? `Median of ${plural(x.cases, "case")}` : `No cases in ${these}`}
            {x.waiting > 0 && ` · ${n(x.waiting)} waiting`}</dd>
          <dd className="muted">{what}</dd></div>;
      })}</dl>
    </section>
  </>;
}

// A funnel row: the bar's length is its share of Registered, set through the CSSOM rather than a style attribute
// (DESIGN.md, CSP); the number is always there as text.
function Bar({ label, value, of }) {
  return <li><span>{label}</span>
    <span className="track" aria-hidden="true"><span className="fill" ref={el => { el?.style.setProperty("--share", value / of); }} /></span>
    <span className="num">{n(value)}</span></li>;
}
