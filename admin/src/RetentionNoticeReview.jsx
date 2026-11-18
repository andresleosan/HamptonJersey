import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDayMonth } from "./format.js";
import { useFieldErrors } from "./Sales.jsx";
import { jerseyToday } from "../../server/viewings.js";

// PRE-12 (Q05, with PRE12_RETENTION_NOTICE_READY and migration 0119): the review of a retention notice the email service
// did not deliver. A manual notice (the day the person was told another way and what shows it) lets the retention pass
// delete the contact a month after that day if nothing else keeps them; Keep for review keeps them. Neither deletes
// anything now, and new activity starts over.
const MANUAL = "manual_notice_documented";
const WHY = { failed: "could not be delivered", unknown: "has an unknown result", not_sent: "was not sent" };

export default function RetentionNoticeReview({ notice, contactId, nameOf, onSaved, onReload }) {
  const empty = { notice_given_on: "", evidence: "" };
  const [f, setF] = useState(empty), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const fe = useFieldErrors("rn"), form = useRef(null), said = useRef(null);
  useEffect(() => { if (msg?.focus) said.current?.focus(); }, [msg]);
  const { review, reviewable } = notice;
  if (!reviewable && !review) return null;
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const send = async code => {
    if (busy) return;
    setBusy(true); setMsg(null); fe.setErrors({});
    try {
      const d = await api(`/admin/contacts/${contactId}/retention-notice-review`, { method: "POST", body: { activity_at: notice.activity_at,
        resolution_code: code, evidence: f.evidence, ...(code === MANUAL && { notice_given_on: f.notice_given_on }) } });
      setF(empty);
      setMsg({ ok: true, focus: true, text: code === MANUAL
        ? "Manual notice recorded. Nothing has been deleted: the retention pass may delete this contact a month after that day if nothing else keeps them."
        : "Kept for review. Nothing will be deleted for this notice." });
      await onSaved(d.retention_notice);
    } catch (x) {
      const fields = x.data?.fields || {}, some = Object.keys(fields).length > 0;
      fe.setErrors(fields);
      setMsg({ text: some ? "Please check the highlighted fields." : x.message, stale: x.status === 409, focus: !some });
      if (some) requestAnimationFrame(() => form.current?.querySelector('[aria-invalid="true"]')?.focus());
    } finally { setBusy(false); }
  };
  const hint = ["d-rn-evidence", fe.invalid("evidence")["aria-describedby"]].filter(Boolean).join(" ");
  return <section className="card" aria-labelledby="h-retention-notice">
    <div className="inline"><h2 id="h-retention-notice">Retention notice</h2>
      {review && <span className={`badge ${review.resolution_code === MANUAL ? "positive" : "attention"}`}>
        {review.resolution_code === MANUAL ? "Manual notice recorded" : "Kept for review"}</span>}</div>
    {review ? <p className="muted">{review.resolution_code === MANUAL
      ? `Told another way on ${fmtDayMonth(review.notice_given_on)}. Recorded by ${nameOf(review.actor)} · ${fmtDate(review.created_at)}.`
      : `Kept for review by ${nameOf(review.actor)} · ${fmtDate(review.created_at)}.`} {review.evidence}</p>
      : <p className="muted">The email telling this contact their details will be deleted {WHY[notice.state] ?? "was not sent"}, so the
        retention pass keeps them. If they were told another way, record when and what shows it.</p>}
    {reviewable && <form ref={form} noValidate onSubmit={e => { e.preventDefault(); send(MANUAL); }}>
      <div className="grid2">
        <label>Day they were told<input type="date" min={notice.activity_at.slice(0, 10)} max={jerseyToday()} value={f.notice_given_on}
          onChange={set("notice_given_on")} disabled={busy} {...fe.invalid("notice_given_on")} />{fe.error("notice_given_on")}</label>
        <div className="field"><label>Evidence<textarea value={f.evidence} onChange={set("evidence")} maxLength={1000} disabled={busy}
          {...fe.invalid("evidence")} aria-describedby={hint} />{fe.error("evidence")}</label>
          <small id="d-rn-evidence" className="muted">How they were told and where the proof is kept. To keep the contact instead, say why.</small></div>
      </div>
      <div className="inline">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Record manual notice"}</button>
        {!review && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => send("keep_for_review")}>Keep for review</button>}
      </div>
    </form>}
    {msg && <p ref={said} tabIndex={-1} role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}
      {msg.stale && <> <button type="button" className="btn ghost sm" onClick={onReload}>Reload</button></>}</p>}
  </section>;
}
