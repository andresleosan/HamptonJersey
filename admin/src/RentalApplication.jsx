import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { OPTIONS } from "../../server/applicants.js";
import { jerseyToday, plusDays } from "../../server/viewings.js";

// ADM-18 (server/routes/rental-applications.js, ADM18_APPLICATION_READY and migration 0117): in a property, its rental
// applications. The team opens one for a rent applicant with the monthly rent asked, creates the applicant's private link
// (last day required, shown once, sent by the team, revocable) and, once it is sent back, reads the answers and the
// affordability rule's explained result and decides with a reason. Accepting creates no tenancy: New tenancy or From Let
// agreed do that. Reading the answers needs the per-case permission; the list shows only names and statuses. Hidden while
// the server does not answer (switched off).
export const APP_STATUS = { draft: ["neutral", "Waiting for the applicant"], submitted: ["attention", "Sent: to review"],
  under_review: ["attention", "Under review"], accepted: ["positive", "Accepted"], declined: ["neutral", "Declined"], withdrawn: ["neutral", "Withdrawn"] };
const WORK = { employed: "Employed", self_employed: "Self-employed", not_working: "Not working", retired: "Retired", student: "Student" };
const PERIOD = { weekly: "a week", monthly: "a month", annual: "a year" };
const REFEREE = { landlord: "Landlord", employer: "Employer", personal: "Personal" };
const HOUSING = Object.fromEntries(OPTIONS.housing_status);
const RESULT = { within_policy: ["positive", "Within the rule"], outside_policy: ["attention", "Outside the rule"],
  needs_human_review: ["neutral", "Needs a person's review"] };
const REASON = { income_unknown: "An income amount is missing: it is unknown, not counted as zero.",
  currency: "An income is not in pounds: it is not converted.", basis_mixed: "Incomes before and after tax are not added together.",
  basis_policy: "The incomes are on a different basis (before or after tax) from the rule.",
  no_policy: "Hampton has not approved its affordability rule yet: no threshold is applied." };
const DECIDE = [["under_review", "Under review"], ["accepted", "Accept"], ["declined", "Decline"], ["withdrawn", "Withdrawn"]];
const pounds = v => `£${Math.round(v).toLocaleString("en-GB")}`;

export function RentalApplications({ rental }) {
  const [data, setData] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [openId, setOpenId] = useState(null);
  const [applicant, setApplicant] = useState(""), [rent, setRent] = useState("");
  const load = () => api(`/admin/rentals/${rental.id}/applications`).then(setData, () => {});
  useEffect(() => { setData(null); load(); }, [rental.id]);
  if (!data?.enabled) return null;
  const create = async e => {
    e.preventDefault();
    if (busy) return;
    if (!applicant || !/^\d+$/.test(rent)) return setMsg("Choose the applicant and enter the monthly rent in whole pounds.");
    setBusy(true); setMsg(null);
    try {
      const d = await api(`/admin/rentals/${rental.id}/applications`, { method: "POST", body: { applicant_id: Number(applicant), rent: Number(rent) } });
      setData(d); setApplicant(""); setRent(""); setOpenId(d.id);
    } catch (err) { setMsg(err.data?.fields ? Object.values(err.data.fields).join(" ") : err.message); }
    finally { setBusy(false); }
  };
  return <section className="card" aria-labelledby="h-applications">
    <h2 id="h-applications">Rental applications</h2>
    <p className="muted">The applicant fills in their work, income, referees and guarantor through a private link. A person decides; accepting
      does not create the tenancy.</p>
    {!rental.archived_at && <form onSubmit={create} className="inline" aria-label="Open a rental application" noValidate>
      <label>Applicant<select value={applicant} onChange={e => setApplicant(e.target.value)}>
        <option value="">Choose…</option>{data.candidates.map(c => <option key={c.id} value={c.id}>{c.name} (#{c.id})</option>)}</select></label>
      <label>Rent a month (£)<input inputMode="numeric" value={rent} onChange={e => setRent(e.target.value)} size={8} /></label>
      <button className="btn ghost sm" disabled={busy}>{busy ? "Opening…" : "Open application"}</button>
    </form>}
    {msg && <p role="alert" className="err">{msg}</p>}
    {data.applications.length > 0 ? <ul className="confirmations">{data.applications.map(a => { const [kind, label] = APP_STATUS[a.status];
      return <li key={a.id}>
        <p><strong>{a.applicant_name}</strong> · {pounds(a.rent)} a month <span className={`badge ${kind}`}>{label}</span><br />
          <span className="muted">Opened by {a.created_by}, {fmtDate(a.created_at)}{a.submitted_at && `; sent ${fmtDate(a.submitted_at)}`}</span></p>
        <button type="button" className="btn ghost sm" aria-expanded={openId === a.id} onClick={() => setOpenId(openId === a.id ? null : a.id)}>
          {openId === a.id ? "Close" : "Open"}</button>
        {openId === a.id && <Application id={a.id} onChange={load} />}
      </li>; })}</ul> : <p className="muted">No applications for this property.</p>}
  </section>;
}

function Application({ id, onChange }) {
  const [d, setD] = useState(null), [err, setErr] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const [until, setUntil] = useState(""), [link, setLink] = useState(null), [decision, setDecision] = useState(""), [reason, setReason] = useState("");
  const today = jerseyToday();
  useEffect(() => { api(`/admin/rental-applications/${id}`).then(setD, e => setErr(e.message)); }, [id]);
  if (err) return <p role="alert" className="err">{err}</p>;
  if (!d) return <p>Loading application…</p>;
  const act = async (path, body, done) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const r = await api(path, { method: "POST", body }); setD(r); done?.(r); onChange(); }
    catch (e) { setMsg(e.data?.fields ? Object.values(e.data.fields).join(" ") : e.message); }
    finally { setBusy(false); }
  };
  const a = d.application, x = d.answers, ev = d.evaluation, final = ["accepted", "declined", "withdrawn"].includes(a.status);
  const options = DECIDE.filter(([v]) => v === "withdrawn" || (v === "under_review" ? a.status === "submitted" : ["submitted", "under_review"].includes(a.status)));
  return <div className="sub">
    <p>{a.address} · {a.applicant_name}{a.housing_status && ` · housing status on their search: ${HOUSING[a.housing_status]}`}</p>
    {a.status === "draft" && <>
      <form className="inline" aria-label="Create the applicant's link" noValidate onSubmit={e => { e.preventDefault();
        if (!until) return setMsg("Choose the last day the link works.");
        act(`/admin/rental-applications/${id}/links`, { expires_on: until }, r => { setLink(r.link); setUntil(""); }); }}>
        <label>Link works until (last day)<input type="date" min={today} max={plusDays(today, 366)} value={until} onChange={e => setUntil(e.target.value)} /></label>
        <button className="btn ghost sm" disabled={busy}>Create applicant link</button>
      </form>
      {link && <div className="warn"><label>Applicant link · shown only now<input readOnly value={link} onFocus={e => e.target.select()} /></label>
        <p className="muted">Send it to the applicant yourself, then press "I have sent it". If you lose it, revoke it and create another.</p></div>}
    </>}
    {d.links.length > 0 && <ul className="plain-list">{d.links.map(g => { const open = ["dormant", "active"].includes(g.status) && !g.expired;
      return <li key={g.id}><span className="muted">Link by {g.created_by}, {fmtDate(g.created_at)}: {g.status === "active" && !g.expired
        ? `sent, works until the end of ${fmtDay(g.expires_on)}` : g.status === "dormant" && !g.expired ? "not sent yet" : g.expired ? "expired" : g.status}</span>
        {open && <span className="inline">{g.status === "dormant" && <button type="button" className="btn ghost sm" disabled={busy}
          onClick={() => act(`/admin/rental-applications/${id}/links/${g.id}/sent`, {})}>I have sent it</button>}
          <button type="button" className="btn ghost sm danger" disabled={busy} onClick={() => act(`/admin/rental-applications/${id}/links/${g.id}/revoke`, {})}>
            Revoke link</button></span>}</li>; })}</ul>}
    {x && <dl className="facts">
      <dt>Work</dt><dd>{WORK[x.employment.status]}{x.employment.employer && `, ${x.employment.employer}`}{x.employment.role && ` (${x.employment.role})`}</dd>
      <dt>Income</dt><dd>{x.incomes.map((i, n) => <span key={n}>{i.amount == null ? "Amount not given" : pounds(i.amount)} {PERIOD[i.period]},{" "}
        {i.basis === "gross" ? "before tax" : "after tax"}{i.currency !== "GBP" && ", another currency"}<br /></span>)}</dd>
      <dt>Dependants</dt><dd>{x.dependants ?? "Not given"}</dd>
      <dt>Referees</dt><dd>{x.references.length ? x.references.map((r, n) => <span key={n}>{REFEREE[r.kind]}: {r.name}, {r.email}<br /></span>) : "None given"}</dd>
      <dt>Guarantor</dt><dd>{x.guarantor ? `${x.guarantor.name}, ${x.guarantor.email}` : "None"}</dd>
    </dl>}
    {ev && <div className="note">
      <p><strong>Affordability</strong> <span className={`badge ${RESULT[ev.status][0]}`}>{RESULT[ev.status][1]}</span></p>
      {ev.reason && <p className="muted">{REASON[ev.reason]}</p>}
      <p className="muted">{ev.inputs.incomes.filter(i => i.annual != null).map(i => `${pounds(i.amount)} ${PERIOD[i.period]} × ${i.factor} = ${pounds(i.annual)}`).join("; ")}
        {ev.inputs.annual_income != null && `. A year's income ${pounds(ev.inputs.annual_income)}`}; a year's rent {pounds(ev.inputs.annual_rent)} ({pounds(ev.inputs.rent_monthly)} × 12)
        {ev.inputs.rent_share != null && `: ${(ev.inputs.rent_share * 100).toFixed(1)}% of income`}
        {d.policy ? `. Rule ${d.policy.version}: rent up to ${(d.policy.max_rent_share * 100).toFixed(1)}% of ${d.policy.basis} income (${d.policy.sources}).` : "."}</p>
    </div>}
    {final ? <p><span className={`badge ${APP_STATUS[a.status][0]}`}>{APP_STATUS[a.status][1]}</span> by {a.decided_by}, {fmtDate(a.decided_at)}: {a.decision_reason}
      {a.affordability_status && <span className="muted"> (rule result then: {RESULT[a.affordability_status][1].toLowerCase()}{a.policy_version && `, rule ${a.policy_version}`})</span>}</p>
      : <form aria-label="Decide on the application" noValidate onSubmit={e => { e.preventDefault();
        if (!decision) return setMsg("Choose a decision.");
        act(`/admin/rental-applications/${id}/review`, { revision: a.revision, decision, reason, policy_version: ev?.policy_version ?? null },
          () => { setDecision(""); setReason(""); }); }}>
        <fieldset className="choices-set"><legend>Decision</legend><div className="choices">{options.map(([v, t]) =>
          <label key={v} className="check"><input type="radio" name={`decision-${id}`} value={v} checked={decision === v} onChange={() => setDecision(v)} />{t}</label>)}</div></fieldset>
        <label>Reason (required to accept, decline or withdraw)<textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label>
        <p className="muted">Accepting records the team's decision only: the tenancy is entered with New tenancy or From Let agreed.</p>
        <button className="btn sm" disabled={busy}>{busy ? "Saving…" : "Save decision"}</button>
      </form>}
    {msg && <p role="alert" className="err">{msg}</p>}
  </div>;
}
