import { useEffect, useId, useRef, useState } from "react";
import { fmtDate, fmtDay, OUTCOME, show } from "./format.js";
import { REJECT_REASONS } from "../../server/applicants.js";

// EST-14: a match's journey (server/match-journey.js), each step from the fact that proves it, and what the client said
// recorded by a person with its reason. It changes no criteria, match decision or availability and sends nothing.
// The client's word, the candidate's fifth state; without one it is "No answer recorded", never "No".
export const INTEREST = { no_answer: ["neutral", "No answer recorded"], waiting: ["attention", "Waiting for client"],
  interested: ["positive", "Interested"], wants_viewing: ["positive", "Wants a viewing"], call_me: ["attention", "Asked for a call"],
  more_info: ["attention", "Needs more information"], not_interested: ["neutral", "Not interested"] };
const STAGE = { none: ["neutral", "Not started"], interested: ["active", "Interested"], viewing_requested: ["attention", "Viewing being arranged"],
  viewing_booked: ["active", "Viewing booked"], viewed: ["active", "Viewed"], offer: ["active", "Offer"], agreed: ["positive", "Agreed"],
  completed: ["positive", "Completed"], not_interested: ["neutral", "Not interested"] };
const REASON = Object.fromEntries(REJECT_REASONS);
const ANSWER = { interested: "Interested", request_viewing: "Wants a viewing", not_for_me: "Not for me", call_me: "Call me" };
const VIEWING = { requested: "requested", confirmed: "confirmed, not by everyone at this time", completed: "completed", no_show: "no-show",
  cancelled: "cancelled" };
const OFFER = { pending: "pending", countered: "countered", accepted: "accepted", rejected: "rejected", withdrawn: "withdrawn" };
const SALE = { in_progress: "in progress", completed: "completed", fallen_through: "fallen through" };
const money = v => show("budget_max", v);
const badge = ([tone, text]) => <span className={`badge ${tone}`}>{text}</span>;

// One fact of the history: what happened, and a link to the record it comes from.
function fact(h, listingId) {
  if (h.kind === "step") return [h.value === "interested" ? "Client interested" : `Client not interested · ${REASON[h.reason_code] ?? h.reason_code}`,
    `recorded by ${h.by}`, h.note];
  if (h.kind === "answer") return [`Client answered on the private link: ${ANSWER[h.value] ?? h.value}`, null, h.note];
  if (h.kind === "sent") return ["Sent to the client on a private link"];
  if (h.kind === "viewing") return [`Viewing ${fmtDay(h.date)} at ${h.time} ${h.status === "confirmed" && h.booked ? "booked: everyone accepted"
    : VIEWING[h.status] ?? h.status}${h.outcome ? ` · ${OUTCOME[h.outcome] ?? h.outcome}` : ""}`, null, h.note,
    [`#/viewings?listing=${encodeURIComponent(listingId)}&viewing=${h.id}`, "Open viewing"]];
  if (h.kind === "offer") return [`Offer ${money(h.amount)} ${OFFER[h.status] ?? h.status}${h.counter_amount ? ` · counter ${money(h.counter_amount)}` : ""}`,
    null, null, [`#/sales?offer=${h.id}`, "Open offer"]];
  if (h.kind === "sale") return [`Sale ${SALE[h.status] ?? h.status}`, null, null, [`#/sales/${h.id}`, "Open sale"]];
  if (h.kind === "tenancy") return ["Tenancy entered from this property", null, null, [`#/rentals/${h.rental_id}`, "Open rental"]];
  return [h.kind];
}

// The two rows of the card's states (inside its <dl>): the client's word and the journey's step.
export function JourneyStates({ journey: j }) {
  return <>
    <div><dt>Client</dt><dd>{badge(INTEREST[j.interest] ?? ["neutral", j.interest])}{j.interest_at && j.interest !== "waiting" && ` · ${fmtDate(j.interest_at)}`}</dd></div>
    <div><dt>Journey</dt><dd>{badge(STAGE[j.stage] ?? ["neutral", j.stage])}</dd></div>
  </>;
}

// The history and, on a search that can still be worked, what the client said. onRecord(body) records it; disabled:
// why the card is read only.
export default function MatchJourney({ match, onRecord, disabled, busy }) {
  const j = match.journey, title = match.listing.title, id = useId();
  const [open, setOpen] = useState(false), [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState(""), [note, setNote] = useState(""), [error, setError] = useState(null);
  const declineRef = useRef(null), reasonRef = useRef(null), noteRef = useRef(null);
  useEffect(() => { if (declining) reasonRef.current?.focus(); }, [declining]);
  const cancel = () => { setDeclining(false); setError(null); declineRef.current?.focus(); };
  const save = e => {
    e.preventDefault();
    if (busy) return;
    if (reason === "other" && !note.trim()) { setError("Say why in a few words"); noteRef.current?.focus(); return; }
    setDeclining(false); setError(null);
    onRecord({ action: "not_interested", reason_code: reason, ...(note.trim() ? { note: note.trim() } : {}) });
    setReason(""); setNote("");
  };
  return <div className="journey">
    <div className="inline match-actions">
      <button type="button" className="linkish" aria-expanded={open} aria-controls={`${id}-history`} onClick={() => setOpen(v => !v)}>
        Journey history ({j.history.length})<span className="sr"> of {title}</span></button>
      {onRecord && !disabled && <>
        <button type="button" className="btn ghost sm" onClick={() => { if (!busy) onRecord({ action: "interested" }); }}>
          Client interested<span className="sr"> in {title}</span></button>
        <button type="button" ref={declineRef} className="btn ghost sm" aria-expanded={declining}
          onClick={() => (declining ? cancel() : setDeclining(true))}>Client not interested<span className="sr"> in {title}</span></button>
      </>}
    </div>
    {declining && <form className="journey-decline" aria-label={`Why is the client not interested in ${title}?`} onSubmit={save}
      onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); cancel(); } }}>
      <label htmlFor={`${id}-reason`}>Why</label>
      <select id={`${id}-reason`} ref={reasonRef} required value={reason} onChange={e => setReason(e.target.value)}>
        <option value="">Choose a reason</option>
        {REJECT_REASONS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      <label htmlFor={`${id}-note`}>Note <span className="muted">(private; needed for Other)</span></label>
      <input id={`${id}-note`} ref={noteRef} value={note} maxLength={300} onChange={e => setNote(e.target.value)}
        aria-invalid={!!error} aria-describedby={error ? `${id}-error` : `${id}-scope`} />
      {error && <p id={`${id}-error`} role="alert" className="err">{error}</p>}
      <p id={`${id}-scope`} className="muted">The match, the search's requirements and the property stay as they are.</p>
      <div className="inline"><button className="btn sm">Save<span className="sr"> not interested in {title}</span></button>
        <button type="button" className="linkish" onClick={cancel}>Cancel</button></div>
    </form>}
    {open && <div id={`${id}-history`}>{j.history.length ? <ol className="journey-history">{j.history.map((h, i) => {
      const [what, by, said, link] = fact(h, match.listing.id);
      return <li key={i}><span>{what}</span>
        <span className="meta"><span>{fmtDate(h.at)}</span>{by && <span>{by}</span>}{link && <span><a href={link[0]}>{link[1]}</a></span>}</span>
        {said && <span className="muted">{said}</span>}</li>; })}</ol>
      : <p className="muted">Nothing yet: no answer, viewing, offer or agreement is linked to this search and property.</p>}</div>}
  </div>;
}
