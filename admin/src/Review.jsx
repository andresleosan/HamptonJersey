import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { REJECT_REASONS } from "../../server/applicants.js";
import MatchCard, { REASON_LABEL } from "./MatchCard.jsx";
import { show, firstSentence } from "./format.js";

const GONE = "This match is no longer proposed, so it has left the queue.";
// DESIGN.md: a single-key shortcut never fires while typing (WCAG 2.1.4).
const typing = el => el.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])");
const money = v => show("budget_max", v);

// Spec §5 Review: the found matches of every active search, one at a time, the oldest search first. A shortlists, R
// rejects (then 1-5 for why, Escape cancels), S skips; each is also a button, and the keys work only while the focus
// is inside the queue. The last action can be undone until the next one.
export default function Review() {
  const [q, setQ] = useState(null); // { match (its listing inside), applicant, remaining }; null while loading
  const [failed, setFailed] = useState(null); // { after, left, text }: the next match didn't load
  const [msg, setMsg] = useState(null), [undo, setUndo] = useState(null);
  const [busy, setBusy] = useState(false), [rejecting, setRejecting] = useState(false);
  const working = useRef(false), refocus = useRef(true), headRef = useRef(null), againRef = useRef(null), retryRef = useRef(null);
  const regionRef = useRef(null), reloadAfter = useRef(false); // reloadAfter: Recalculate all ended mid-review

  // The next match after `after` (a match id; null = from the top). The server counts the queue from the top and at
  // its end; in between, `left` is the page's own count. Returns what is left, or null when it failed.
  const load = async (after, left) => {
    refocus.current = true; setRejecting(false);
    try {
      const d = await api(`/admin/review${after == null ? "" : `?after=${after}`}`);
      const remaining = d.remaining ?? left;
      setQ({ match: d.match && { ...d.match, listing: d.listing }, applicant: d.applicant ?? null, remaining });
      setFailed(null);
      return remaining;
    } catch (e) { setFailed({ after, left, text: e.message }); return null; }
  };
  useEffect(() => { load(null); }, []);
  // After each step the focus goes to the card now shown (or what replaced it), so the next key works at once.
  useEffect(() => {
    if (!refocus.current || (!q && !failed)) return;
    refocus.current = false;
    (failed ? retryRef.current : q.match ? document.getElementById(`match-${q.match.id}`) : againRef.current ?? headRef.current)?.focus();
  }, [q, failed]);

  // When a step ends with the focus outside the queue (a removed Undo button leaves it on the page), it goes back to
  // what the queue shows, so the keys keep working.
  const keepFocus = () => {
    if (regionRef.current?.contains(document.activeElement)) return;
    (document.getElementById(`match-${q?.match?.id}`) ?? retryRef.current ?? againRef.current ?? headRef.current)?.focus();
  };
  // One step at a time; a new action (clear) ends the last one's Undo and message.
  const run = async (step, clear = true) => {
    if (working.current) return;
    working.current = true; setBusy(true);
    if (clear) { setMsg(null); setUndo(null); }
    try { await step(); } finally {
      working.current = false; setBusy(false);
      if (reloadAfter.current) { reloadAfter.current = false; restart(); }
    }
  };

  const act = (status, reason) => run(async () => {
    const { match, applicant } = q;
    let text, ok = true, done = null;
    if (status === "skip") { text = "Skipped."; done = { skip: true, match, applicant }; }
    else try {
      const r = await api(`/admin/matches/${match.id}`, { method: "PUT",
        body: { status, from: "found", ...(reason && { reject_reason: reason }) } });
      if (r.match) {
        text = status === "shortlisted" ? "Shortlisted." : `Rejected · ${REASON_LABEL[reason]}.`;
        done = { status, match: r.match, applicant };
      } else text = GONE;
    } catch (e) {
      // 409: someone else reviewed it (or archived the search) first; 404: a recompute removed it. Either way, move on.
      if (e.status === 404) text = GONE;
      else if (e.status === 409) { text = firstSentence(e.message); ok = false; }
      else { setMsg({ text: e.message }); keepFocus(); return; } // nothing changed: stay on this match
    }
    // Reviewed, gone or reviewed by someone else, it has left the queue; a skipped one is still in it.
    const n = await load(match.id, status === "skip" ? q.remaining : Math.max(0, q.remaining - 1));
    setMsg({ ok, text: n == null ? text : `${text} ${n} left.` });
    setUndo(done);
  });

  const undoLast = () => run(async () => {
    const u = undo, gone = { ok: true, text: "That match no longer fits its search, so it has left the queue." };
    // The undone match is shown again; the one that was next comes after it.
    const back = (match, remaining, text) => {
      refocus.current = true; setRejecting(false); setFailed(null);
      setQ({ match, applicant: u.applicant, remaining });
      setMsg({ ok: true, text: `${text} ${remaining} left.` });
    };
    // A skipped match never left the count; an undone review is one more to review.
    if (u.skip) return back(u.match, q.remaining, "Back to the skipped match.");
    try {
      const r = await api(`/admin/matches/${u.match.id}`, { method: "PUT", body: { status: "found", from: u.status } });
      if (!r.match) { setMsg(gone); keepFocus(); return; }
      back(r.match, q.remaining + 1, "Back in Found.");
    } catch (e) {
      setMsg(e.status === 404 ? gone : { text: e.status === 409 ? firstSentence(e.message) : e.message });
      keepFocus();
    }
  });

  // From the top; asked while a review is saving (Recalculate all ending), it runs once that review is done.
  const restart = () => { if (working.current) reloadAfter.current = true; else run(async () => { await load(null); }); };

  const onKey = e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat || typing(e.target)) return;
    if (working.current || failed || !q?.match) return;
    const k = e.key.toLowerCase(), reason = rejecting ? REJECT_REASONS[Number(e.key) - 1]?.[0] : undefined;
    if (reason) act("rejected", reason);
    else if (k === "escape" && rejecting) setRejecting(false);
    else if (k === "a") act("shortlisted");
    else if (k === "r") setRejecting(true);
    else if (k === "s") act("skip");
    else return;
    e.preventDefault();
  };

  const m = q?.match;
  return <section aria-labelledby="t-review">
    <div className="head">
      <div><h1 id="t-review" ref={headRef} tabIndex={-1}>Review</h1>
        <p className="muted">{q && <span className="num">{q.remaining} left · </span>}One match at a time, the oldest search first.</p></div>
      <Recalculate onDone={restart} />
    </div>
    <div ref={regionRef} className="review-queue" role="region" aria-label="Review queue" onKeyDown={onKey}>
      <p className="muted">While the focus is in the queue: <kbd>A</kbd> Shortlist · <kbd>R</kbd> Reject, then <kbd>1</kbd>–<kbd>5</kbd> for
        why · <kbd>S</kbd> Skip · <kbd>Esc</kbd> cancels.</p>
      <p role="status" className="ok review-msg">{msg?.ok && msg.text}
        {undo && <button type="button" className="btn ghost sm" onClick={undoLast}>Undo</button>}</p>
      {msg && !msg.ok && <p role="alert" className="err">{msg.text}</p>}
      {failed ? <p role="alert" className="err">{failed.text}{" "}
        <button type="button" ref={retryRef} className="btn ghost sm" onClick={() => run(() => load(failed.after, failed.left), false)}>Try again</button></p>
        : !q ? <p>Loading the queue…</p>
        : m ? <div className="review">
          <Summary a={q.applicant} />
          <MatchCard key={m.id} match={m} busy={busy} shortcuts rejecting={rejecting} onRejecting={setRejecting}
            onReview={r => act(r.status, r.reject_reason)}>
            <button type="button" className="btn ghost sm" aria-keyshortcuts="S" onClick={() => act("skip")}>
              Skip<span className="sr"> {m.listing.title}</span><kbd aria-hidden="true">S</kbd></button>
          </MatchCard>
        </div>
        : q.remaining > 0 ? <div className="empty card">
          <p>You reached the end of the queue. <span className="num">{q.remaining}</span> left to review, the skipped ones included.</p>
          <button type="button" ref={againRef} className="btn" onClick={restart}>Start again</button>
        </div>
        : <p className="empty card">Nothing to review. A match appears here when a listing fits an active search; after an
          import, Recalculate all looks again.</p>}
    </div>
  </section>;
}

// The search the match is for, as text.
function Summary({ a }) {
  const { budget_min: lo, budget_max: hi, budget_stretch: up } = a;
  const range = lo != null && hi != null ? `${money(lo)}–${money(hi)}` : hi != null ? `Up to ${money(hi)}`
    : lo != null ? `From ${money(lo)}` : null;
  const budget = range ? `${range}${a.operation === "rent" ? " a month" : ""}${up != null ? `, can stretch to ${money(up)}` : ""}` : "—";
  const rows = [["Looking", show("operation", a.operation)], ["Budget", budget], ["Type", show("property_types", a.property_types)],
    ["Bedrooms, at least", show("bedrooms_min", a.bedrooms_min)], ["Bedrooms, ideally", show("bedrooms_ideal", a.bedrooms_ideal)],
    ["Bathrooms, at least", show("bathrooms_min", a.bathrooms_min)], ["Parking", show("parking_spaces", a.parking_spaces)],
    ["Furnished", show("furnished", a.furnished)], ["Outdoor space", show("outdoor", a.outdoor)],
    ["Parishes they want", a.parishes_wanted?.length ? show("parishes_wanted", a.parishes_wanted) : "Any"],
    ["Parishes they don't want", a.parishes_excluded?.length ? show("parishes_excluded", a.parishes_excluded) : "None"],
    ["Pets", show("pets", a.pets)]];
  return <aside className="card review-who" aria-labelledby="review-who">
    <p className="muted">For</p>
    <h2 id="review-who"><a href={`#/applicants/${a.id}/matches`}>{a.name}</a></h2>
    <dl className="kv">{rows.map(([t, v]) => <div key={t}><dt>{t}</dt><dd>{v}</dd></div>)}</dl>
  </aside>;
}

// B12 "Recalculate all": every listing read again (listings phase), then every active search recomputed (applicants
// phase), one batch per call until next is null. A failure stops it; Retry resumes from the last batch that worked.
function Recalculate({ onDone }) {
  const [running, setRunning] = useState(false), [progress, setProgress] = useState("");
  const [resume, setResume] = useState(null), [note, setNote] = useState(null);
  const retryRef = useRef(null), boxRef = useRef(null), mine = useRef(false); // mine: the focus was on these controls
  // A failure takes the focus to Retry only from here (the button, disabled while running, leaves it on the page);
  // someone reviewing meanwhile keeps their place.
  useEffect(() => { if (note && !note.ok && mine.current) retryRef.current?.focus(); }, [note]);
  const go = async from => {
    let { phase, after, done } = from;
    setRunning(true); setNote(null); setResume(null); setProgress("Starting…");
    try {
      for (;;) {
        const r = await api("/admin/matches/recalculate", { method: "POST", body: { phase, after } });
        done += r.count;
        setProgress(`${phase === "listings" ? "Listings" : "Applicants"} ${done} of ${r.total}…`);
        if (r.next != null) after = r.next;
        else if (phase === "listings") { phase = "applicants"; after = null; done = 0; }
        else break;
      }
      setProgress("");
      setNote({ ok: true, text: "Done: every listing read again and every active search recomputed." });
      onDone();
    } catch (e) {
      const at = document.activeElement;
      mine.current = !at || at === document.body || !!boxRef.current?.contains(at);
      setResume({ phase, after, done });
      setNote({ text: `Stopped after ${done} ${done === 1 ? phase.slice(0, -1) : phase}. ${e.message}` });
    } finally { setRunning(false); }
  };
  const start = () => {
    if (confirm("Recalculate all? This reads every listing again (its parish and features) and then recomputes the matches "
      + "of every active search. Parishes set by hand stay. Keep this page open until it finishes.")) go({ phase: "listings", after: null, done: 0 });
  };
  return <div className="recalc" ref={boxRef}>
    <button type="button" className="btn ghost" disabled={running} onClick={start}>{running ? "Recalculating…" : "Recalculate all"}</button>
    <p role="status" className="muted num">{running ? progress : note?.ok ? note.text : ""}</p>
    {note && !note.ok && <p role="alert" className="err">{note.text}{" "}
      <button type="button" ref={retryRef} className="btn ghost sm" onClick={() => go(resume)}>Retry</button></p>}
  </div>;
}
