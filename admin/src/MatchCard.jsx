import { useEffect, useRef, useState } from "react";
import { AVAILABILITY, priceText } from "./format.js";
import { REJECT_REASONS } from "../../server/applicants.js";

// The checks of server/matching.js evaluate(), by key.
const CHECK_LABEL = { budget: "Budget", bedrooms: "Bedrooms", bathrooms: "Bathrooms", area: "Area", pets: "Pets",
  parking: "Parking", furnished: "Furnished", outdoor: "Outdoor", type: "Type" };
const RESULT = { meets: "Meets", fails: "Fails", unknown: "Unknown" };
export const REASON_LABEL = Object.fromEntries(REJECT_REASONS);
const OFFERED = ["for_sale", "to_let", "lease"];
// DESIGN.md "Badges de estado": a listing that is no longer offered.
const AVAILABILITY_TONE = { under_offer: "attention", sold: "closed" };
const many = (n, word) => (n == null ? null : `${n} ${word}${n === 1 ? "" : "s"}`);

// One match as spec §5 shows it: the listing, its score, each check with what the listing says, and the reviews its
// status allows. onReview({ status, reject_reason }) gets the review chosen. busy: input is ignored, never disabled,
// so the focus stays where it is. disabled: why the card is read only (a closed search), shown on its buttons; none =
// reviews allowed. The heading (id match-<id>) takes the focus.
// The Review queue also passes: shortcuts (shows each button's key, which the queue itself listens for), rejecting and
// onRejecting (it opens the reasons on R), and children (more actions, after Reject).
export default function MatchCard({ match, onReview, busy, disabled = null, shortcuts = false, rejecting: shown, onRejecting,
  children }) {
  const l = match.listing, title = l.title;
  const [own, setOwn] = useState(false);
  const rejecting = shown ?? own, setRejecting = onRejecting ?? setOwn;
  const hint = k => shortcuts && <kbd aria-hidden="true">{k}</kbd>;
  const rejectRef = useRef(null), firstReason = useRef(null);
  useEffect(() => { if (rejecting) firstReason.current?.focus(); }, [rejecting]);
  const review = (status, reject_reason) => { if (!busy) onReview({ status, ...(reject_reason && { reject_reason }) }); };
  const cancel = () => { setRejecting(false); rejectRef.current?.focus(); };
  const meta = [l.id, l.parish ?? "Parish unknown", many(l.bedrooms, "bedroom"), many(l.bathrooms, "bathroom")].filter(Boolean);
  const why = disabled || undefined, off = !!disabled;
  // On the website only when published, not archived and with a photo it shows (as the Listings page says).
  const offSite = !l.published || l.archived_at || !l.has_public_photo;

  return <article className="card match" aria-labelledby={`match-${match.id}`}>
    <div className="match-photo">{l.cover_id ? <img src={`/media/${l.cover_id}?thumb`} alt="" loading="lazy" />
      : <span className="muted">No photo</span>}</div>
    <div className="match-body">
      <div className="match-head">
        <h3 id={`match-${match.id}`} tabIndex={-1}><a href={`#/p/${l.id}`}>{title}</a></h3>
        <span className="score num">Score {match.score}</span>
      </div>
      <p className="muted">{meta.join(" · ")}</p>
      <p className="match-price"><span className="num">{priceText(l)}</span>
        {offSite && <span className="badge neutral">Not on website</span>}
        {!OFFERED.includes(l.availability) && <span className={`badge ${AVAILABILITY_TONE[l.availability] ?? "neutral"}`}>{AVAILABILITY[l.availability] ?? l.availability}</span>}</p>
      <dl className="checks">{match.checks.map(c => <div key={c.key}>
        <dt>{CHECK_LABEL[c.key] ?? c.key}</dt>
        <dd><span className={`result ${c.result}`}>{RESULT[c.result] ?? c.result}</span>{c.evidence && <span className="muted"> · {c.evidence}</span>}</dd>
      </div>)}</dl>
      {match.status === "rejected" && <p className="muted">Rejected · {REASON_LABEL[match.reject_reason] ?? match.reject_reason}</p>}
      <div className="inline match-actions">
        {match.status === "found" ? <>
          <button type="button" className="btn sm" disabled={off} title={why} aria-keyshortcuts={shortcuts ? "A" : undefined}
            onClick={() => review("shortlisted")}>Shortlist<span className="sr"> {title}</span>{hint("A")}</button>
          <button type="button" ref={rejectRef} className="btn ghost sm" disabled={off} title={why} aria-expanded={rejecting}
            aria-keyshortcuts={shortcuts ? "R" : undefined}
            onClick={() => (rejecting ? cancel() : setRejecting(true))}>Reject<span className="sr"> {title}</span>{hint("R")}</button>
          {children}
        </> : <button type="button" className="btn ghost sm" disabled={off} title={why} onClick={() => review("found")}>
          Undo<span className="sr"> · move {title} back to Found</span></button>}
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
