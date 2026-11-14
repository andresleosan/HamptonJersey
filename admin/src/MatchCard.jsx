import { CRITERIA } from "../../site/requirements.js";
import { useEffect, useRef, useState } from "react";
import { AVAILABILITY, fmtDate, priceText } from "./format.js";
import { REJECT_REASONS } from "../../server/applicants.js";
import { unknownMusts } from "../../server/candidate-state.js";

// The checks of server/matching.js evaluate(), by key.
const CHECK_LABEL = { ...Object.fromEntries(Object.entries(CRITERIA).map(([k,[label]])=>[k,label])), budget: "Budget", bedrooms: "Bedrooms", bathrooms: "Bathrooms", area: "Area", housing: "Housing",
  pets: "Pets", parking: "Parking", furnished: "Furnished", outdoor: "Outdoor", type: "Type",
  kind: "Property or business", use: "Use", floor_area: "Floor area", purchase: "Purchase price", rent: "Rent", premium: "Premium", expenses: "Running costs" };
const RESULT = { meets: "Meets", fails: "Fails", unknown: "Unknown" };
export const REASON_LABEL = Object.fromEntries(REJECT_REASONS);
export const hasPetRefusal = match => match.pets_refused === true;
// BUS-15 (M04): what a Shortlist approves, said wherever one can be given.
export const APPROVAL_SCOPE = "Shortlisting approves a first availability enquiry about the property, nothing else: "
  + "no must-have is waived, no client details are shared and the search stays as it is.";
const OFFERED = ["for_sale", "to_let", "lease"];
// DESIGN.md "Badges de estado": a listing that is no longer offered.
const AVAILABILITY_TONE = { under_offer: "attention", sold: "closed" };
const many = (n, word) => (n == null ? null : `${n} ${word}${n === 1 ? "" : "s"}`);
// EST-13 (M06): the candidate's states (server/candidate-state.js), each on its own row with its own words and action.
const EVALUATION = { meets: "Stated must-haves met", pending: "Requirements to confirm", alternative: "Alternative · requirements not met",
  excluded: "Outside search criteria" };
const CONFIRMED = { not_confirmed: ["neutral", "Not confirmed"], confirmed: ["positive", "Confirmed"] };

// One match as spec §5 shows it: the listing, its score, each check with what the listing says, and the reviews its
// status allows. onReview({ status, reject_reason }) gets the review chosen. busy: input is ignored, never disabled,
// so the focus stays where it is. disabled: why the card is read only (a closed search), shown on its buttons; none =
// reviews allowed. The heading (id match-<id>) takes the focus.
// The Review queue also passes: shortcuts (shows each button's key, which the queue itself listens for), rejecting and
// onRejecting (it opens the reasons on R), and children (more actions, after Reject).
// onClarify(approved): approves or withdraws a clarification enquiry about the must-haves the property does not answer.
export default function MatchCard({ match, onReview, onClarify, busy, disabled = null, shortcuts = false, rejecting: shown, onRejecting,
  children, legacy = false }) {
  const l = match.listing, title = l.title;
  const states = match.states, asked = match.clarification, outdated = states.decision === "approved_outdated";
  const labels = keys => keys.map(k => CHECK_LABEL[k] ?? k).join(", "), unknown = labels(unknownMusts(match.checks));
  const by = `${match.reviewed_by ? ` by ${match.reviewed_by}` : ""}${match.reviewed_at ? ` · ${fmtDate(match.reviewed_at)}` : ""}`;
  const [own, setOwn] = useState(false);
  const rejecting = shown ?? own, setRejecting = onRejecting ?? setOwn;
  const hint = k => shortcuts && <kbd aria-hidden="true">{k}</kbd>;
  const rejectRef = useRef(null), firstReason = useRef(null);
  useEffect(() => { if (rejecting) firstReason.current?.focus(); }, [rejecting]);
  const review = (status, reject_reason) => { if (!busy) onReview({ status, ...(reject_reason && { reject_reason }) }); };
  const cancel = () => { setRejecting(false); rejectRef.current?.focus(); };
  const meta = [l.id, l.parish ?? "Parish unknown", many(l.bedrooms, "bedroom"), many(l.bathrooms, "bathroom")].filter(Boolean);
  const why = disabled || undefined, off = !!disabled, petsRefused = hasPetRefusal(match);
  // On the website only when published, not archived and with a photo it shows (as the Listings page says).
  const offSite = !l.published || l.archived_at || !l.has_public_photo;

  return <article className="card match" aria-labelledby={`match-${match.id}`}>
    <div className="match-photo">{l.cover_id ? <img src={`/media/${l.cover_id}?thumb`} alt="" loading="lazy" />
      : <span className="muted">No photo</span>}</div>
    <div className="match-body">
      <div className="match-head">
        <h3 id={`match-${match.id}`} tabIndex={-1}><a href={`#/p/${l.id}`}>{title}</a></h3>
        <span className="score num">{match.status==='rejected'?'Historical score':legacy||match.ranking_version===0?'Previous score':'Score'} {match.score}</span>
      </div>
      <p className="meta">{meta.map((fact, i) => <span key={i}>{fact}</span>)}</p>
      <p className="match-price"><span className="num">{priceText(l)}</span>
        {offSite && <span className="badge neutral">Not on website</span>}
        {!OFFERED.includes(l.availability) && <span className={`badge ${AVAILABILITY_TONE[l.availability] ?? "neutral"}`}>{AVAILABILITY[l.availability] ?? l.availability}</span>}</p>
      <dl className="match-states">
        <div><dt>Evaluation</dt>
          <dd className="criteria-summary"><span className={`badge ${match.requirements_status==='meets'?'positive':'attention'}`}>{EVALUATION[match.requirements_status] ?? EVALUATION.pending}</span></dd></div>
        <div><dt>Decision</dt>
          <dd>{match.status === "found" ? <span className="badge neutral">Not decided</span>
            : match.status === "rejected" ? <><span className="badge neutral">Rejected</span>{` · ${REASON_LABEL[match.reject_reason] ?? match.reject_reason}${by}`}</>
            : <>{outdated && <><span className="badge attention">Approval out of date</span>{" "}</>}
              <span className={`badge ${outdated ? "neutral" : "active"}`}>Shortlisted</span>{by}</>}</dd></div>
        <div><dt>Availability</dt>
          <dd><span className={`badge ${CONFIRMED[states.availability][0]}`}>{CONFIRMED[states.availability][1]}</span>
            <span className="muted"> · {l.archived_at ? "Listing archived" : `Listed as ${AVAILABILITY[l.availability] ?? l.availability ?? "not stated"}`}</span></dd></div>
        <div><dt>Enquiry</dt>
          <dd>{asked ? <><span className="badge attention">Clarification approved</span>{` · ${labels(asked.keys ?? [])} by ${asked.by} · ${fmtDate(asked.at)}`}
              <span className="muted"> · Not sent yet</span></>
            : <><span className="badge neutral">Not sent</span>
              {unknown && match.status !== "rejected" && <span className="muted"> · {unknown} to clarify: asking needs its own approval and shortlists nothing</span>}</>}</dd></div>
      </dl>
      {outdated && <p id={`outdated-${match.id}`} className="req-note">This approval does not cover the search and the property as they are now, so it
        approves no enquiry. Review again moves the match back to Found, to decide on today's details.</p>}
      {match.requirements_status === "meets" && match.checks.some(c => c.key === "budget" && c.result === "unknown") &&
        <p className="muted">Budget needs confirmation.</p>}
      {match.requirements_refresh_needed && <p className="muted">Details have changed. Recalculate matches to refresh the list and its order.</p>}
      {petsRefused && match.status === "found" && <p id={`pets-refused-${match.id}`} className="req-note">Pets are not allowed at this property. Recalculate matches.</p>}
      <dl className="checks">{match.checks.map(c => <div key={c.key}>
        <dt>{CHECK_LABEL[c.key] ?? c.key}{c.priority && <small className="muted"> · {c.priority === "must" ? "Must-have" : c.priority === "preferred" ? "Preferred" : "Priority to confirm"}</small>}</dt>
        <dd><span className={`result ${c.result}`}>{RESULT[c.result] ?? c.result}</span>{c.reason && <span className="muted"> · {c.reason}</span>}{c.evidence && <span className="muted"> · {c.evidence}</span>}</dd>
      </div>)}</dl>
      <p className="muted">Found {fmtDate(match.created_at)} · Property updated {fmtDate(l.updated_at)}</p>
      <div className="inline match-actions">
        {match.status === "found" ? <>
          <button type="button" className="btn sm" disabled={off || petsRefused} title={petsRefused ? "Pets are not allowed at this property." : why}
            aria-describedby={petsRefused ? `pets-refused-${match.id}` : undefined} aria-keyshortcuts={shortcuts && !petsRefused ? "A" : undefined}
            onClick={() => review("shortlisted")}>Shortlist<span className="sr"> {title}</span>{!petsRefused && hint("A")}</button>
          <button type="button" ref={rejectRef} className="btn ghost sm" disabled={off} title={why} aria-expanded={rejecting}
            aria-keyshortcuts={shortcuts ? "R" : undefined}
            onClick={() => (rejecting ? cancel() : setRejecting(true))}>Reject<span className="sr"> {title}</span>{hint("R")}</button>
          {children}
        </> : <button type="button" className="btn ghost sm" disabled={off} title={why}
          aria-describedby={outdated ? `outdated-${match.id}` : undefined} onClick={() => review("found")}>
          {outdated ? "Review again" : "Undo"}<span className="sr">, move {title} back to Found</span></button>}
        {onClarify && match.status !== "rejected" && (asked || unknown) && <button type="button" className="btn ghost sm" disabled={off}
          title={why} onClick={() => { if (!busy) onClarify(!asked); }}>
          {asked ? "Withdraw clarification" : "Approve clarification"}<span className="sr"> for {title}</span></button>}
      </div>
      {rejecting && match.status === "found" && <div className="inline reasons" role="group" aria-label={`Why reject ${title}?`}
        onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); cancel(); } }}>
        <span className="muted" aria-hidden="true">Why?</span>
        {REJECT_REASONS.map(([k, t], i) => <button key={k} type="button" ref={i ? undefined : firstReason} className="btn ghost sm"
          aria-keyshortcuts={shortcuts ? String(i + 1) : undefined} onClick={() => review("rejected", k)}>{t}{hint(i + 1)}</button>)}
        <button type="button" className="linkish" aria-keyshortcuts={shortcuts ? "Escape" : undefined} onClick={cancel}>
          Cancel{hint("Esc")}</button>
      </div>}
    </div>
  </article>;
}
