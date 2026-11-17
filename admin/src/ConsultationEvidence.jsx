import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";
import { OUTCOME, VIA } from "./Enquiries.jsx";

// AGE-09: what one enquiry shared with the advertiser, when and on whose approval, the matches it served and what came
// back (server/consultation-evidence.js). For staff only, opened from the enquiry; nothing here writes or sends. A
// general check names no client; a client's own case shows only what the text carried, never a name or a contact.
const STEP = { prepared: "Prepared", send_approved: "Sending approved", email_queued: "Email queued", sent_by_email: "Sent by email (the provider accepted it)",
  email_unknown: "Email outcome not confirmed", email_confirmed: "Recorded as sent by email", email_not_sent: "Email not sent",
  sent_manually: "Recorded as sent by the person who sent it" };
const EMAIL = { queued: "Queued", sending: "Sending", accepted: "Accepted by the provider", failed: "Failed", unknown: "Not confirmed",
  cancelled: "Cancelled", draft: "Draft" };
const how = v => (VIA[v] ?? v ?? "").toLowerCase();
const search = (applicant, match) => <>{applicant ? <a href={`#/applicants/${applicant}/matches`}>Search {applicant}</a> : "A deleted search"}
  {" "}<span className="muted">(match {match})</span></>;
const CASE = { household_size: p => `its household size (${p.household_size})`, must_haves: () => "the must-haves it asked to clarify" };

export default function ConsultationEvidence({ consultationId }) {
  const [d, setD] = useState(null), [failed, setFailed] = useState(null), [busy, setBusy] = useState(false);
  const path = `/admin/consultations/${consultationId}/evidence`;
  const load = () => { setFailed(null); return api(path).then(setD, e => setFailed(e.message)); };
  useEffect(() => { setD(null); load(); }, [consultationId]);
  // The next page of the matches it served; the rest of the evidence is already whole.
  const more = async () => {
    setBusy(true); setFailed(null);
    try { const x = await api(`${path}?cursor=${d.next_cursor}`); setD(v => ({ ...v, matches: [...v.matches, ...x.matches], next_cursor: x.next_cursor })); }
    catch (e) { setFailed(e.message); }
    finally { setBusy(false); }
  };
  const id = `evidence-${consultationId}`, alert = failed && <p role="alert" className="err">{failed}{" "}
    <button type="button" className="btn ghost sm" onClick={d ? more : load} disabled={busy}>Try again</button></p>;
  if (!d) return <div className="fields-group">{alert || <p role="status">Loading the evidence…</p>}</div>;
  const c = d.consultation, sent = d.shared, r = c.recipient, manual = d.attempts.find(a => a.type === "sent_manually");
  return <section className="fields-group" aria-labelledby={`${id}-h`}>
    <h3 id={`${id}-h`}>Evidence of what was shared</h3>
    <p className="muted">What this enquiry shared with {r.removed ? "the advertiser (personal data removed)" : r.name} and when, as recorded here. It records
      facts only: it does not establish any commission or fee.</p>
    {sent ? <>
      <p><strong>Sent {fmtDate(d.general_checks[0]?.sent_at ?? d.presentations[0]?.sent_at ?? manual?.sent_at)}</strong>
        {` by ${how(d.general_checks[0]?.via ?? d.presentations[0]?.via ?? manual?.via)}`}
        {manual && ` · recorded by ${manual.by}, who sent it`}{manual?.evidence_ref && <span className="muted"> · Evidence: {manual.evidence_ref}</span>}</p>
      {d.general_checks.map((g, i) => <p key={i}>General check: asked about {g.asked.includes("availability") ? "availability and viewing times" : "viewing times"}.
        It names no client. {g.matches_at_sending} approved {g.matches_at_sending === 1 ? "match" : "matches"} had joined it when it was sent.</p>)}
      {d.presentations.length ? <ul>{d.presentations.map(p => <li key={p.match_id}>{search(p.applicant_id, p.match_id)}: the text carried
        {" "}{p.shared.map(k => CASE[k]?.(p) ?? k).join(" and ")}, with no name or contact.</li>)}</ul>
        : <p>No client was presented: the text carried nothing about any one search.</p>}
      <label>Text sent<textarea readOnly value={sent.text} /></label>
    </> : <p role="status">Nothing has been shared with the advertiser yet: no sending was recorded and no email was accepted. No client was presented.</p>}

    {d.approvals.length > 0 && <ul>{d.approvals.map((a, i) => <li key={i}>Sending approved by {a.by} · {fmtDate(a.at)} · version {a.revision}</li>)}</ul>}

    <h4>Matches it served <span className="muted">({d.matches_total})</span></h4>
    {d.matches.length ? <ul>{d.matches.map(m => <li key={m.match_id}>{search(m.applicant_id, m.match_id)}
      {m.approval ? ` · approved by ${m.approval.by}, ${fmtDate(m.approval.at)}` : " · approval not found"}
      {` · joined by ${m.linked_by}, ${fmtDate(m.linked_at)}`}
      {sent && (m.before_sending ? " · had joined when it was sent" : " · joined after it was sent")}
      {m.response_note && <span className="muted"> · Said about this search: {m.response_note}</span>}</li>)}</ul>
      : <p className="muted">No match is linked to it now.</p>}
    {d.next_cursor != null && <div className="inline"><button type="button" className="btn ghost sm" onClick={more} disabled={busy}>Show more matches</button></div>}

    <h4>Sending</h4>
    <ol>{d.attempts.map((a, i) => <li key={i}>{STEP[a.type] ?? a.type} · {fmtDate(a.at)} · {a.by}
      {a.revision ? ` · version ${a.revision}` : ""}{a.reason ? ` · ${a.reason.replaceAll("_", " ")}` : ""}</li>)}</ol>
    {d.emails.map(m => <p key={m.ref} className="muted">Email HE-OUT-{m.ref} · version {m.version} · {EMAIL[m.status] ?? m.status} · {fmtDate(m.updated_at)}
      {m.approved_by && ` · approved by ${m.approved_by}`}</p>)}

    <h4>Answers</h4>
    {d.responses.length ? <ol>{d.responses.map((x, i) => <li key={i}>{x.type === "cancelled" ? "Enquiry cancelled"
      : `${OUTCOME[x.outcome] ?? x.outcome} · by ${how(x.via)}${x.scope ? ` · covers ${x.scope === "operation" ? "this operation" : "the whole property"}` : ""}`}
      {` · recorded by ${x.by}, ${fmtDate(x.at)}`}</li>)}</ol> : <p className="muted">No answer recorded.</p>}
    {d.latest_response && <p>Latest answer: {OUTCOME[d.latest_response.outcome] ?? d.latest_response.outcome} · {fmtDate(d.latest_response.at)} · from
      {" "}{d.latest_response.from}<span className="muted"> · Evidence: {d.latest_response.evidence_ref}</span></p>}

    <h4>Call</h4>
    {d.calls.task ? <p>Call due {fmtDate(d.calls.task.due_at ?? d.calls.task.created_at)}
      {d.calls.task.resolved_at ? ` · closed ${fmtDate(d.calls.task.resolved_at)} by ${d.calls.task.resolved_by}` : " · still open"}</p>
      : <p className="muted">No call was due.</p>}
    {alert}
  </section>;
}
