import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";
import { usePoll } from "./poll.js";

// AUT-13 / PUB-13 (spec 2026-10-31, H10): Hermes drafts the listing's texts from its saved details. The draft only
// reaches the form with "Use this text", and the listing only changes when the person saves it. Hidden until Hermes
// has asked the app for work at least once. replacing: the form's title, summary or description differ from the saved
// ones, so using the draft would overwrite what was typed.
const OPEN = ["queued", "working"];
const QUIET_MS = 15 * 60e3;
const LABEL = { title: "Title", summary: "Summary", description: "Description" };

export default function HermesDraft({ listingId, replacing, onUse }) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), head = useRef(null);
  const load = useCallback(() => api(`/admin/jobs?listing=${encodeURIComponent(listingId)}`).then(setState, () => {}), [listingId]);
  useEffect(() => { load(); }, [load]);
  // While Hermes is on it, look again every 15 s (only while the tab is visible).
  usePoll(load, OPEN.includes(state?.job?.status) ? 15000 : null);
  if (!state?.hermes_at) return null;

  const job = state.job, status = job?.status;
  const act = async (path, body, done) => {
    setBusy(true); setMsg(null);
    try { const r = await api(path, { method: "POST", body }); done?.(r); await load(); }
    catch (e) { setMsg({ text: e.message }); await load(); }
    finally { setBusy(false); head.current?.focus(); } // the button pressed is gone: the focus goes to the heading
  };
  const ask = () => act("/admin/jobs", { kind: "listing_text", listing: listingId });
  const use = () => {
    if (replacing && !confirm("Replace the title, summary and description you are editing with Hermes's draft?")) return;
    act(`/admin/jobs/${job.id}/use`, undefined, r => {
      onUse(r.job.result); setMsg({ ok: true, text: "Draft copied into the title, summary and description. Check them, then Save." });
    });
  };
  const discard = () => act(`/admin/jobs/${job.id}/discard`);
  const quiet = Date.now() - Date.parse(state.hermes_at) > QUIET_MS;

  return <div className="hermes-draft" role="group" aria-labelledby="h-hermes">
    <h3 id="h-hermes" ref={head} tabIndex={-1}>{status === "draft" ? "Draft from Hermes" : "Draft with Hermes"}</h3>
    {quiet && <p className="muted">Hermes last checked in {fmtDate(state.hermes_at)}.</p>}
    {OPEN.includes(status) ? <div className="row">
      <p>Hermes is writing a draft (asked {fmtDate(job.created_at)}).</p>
      <button type="button" className="btn ghost sm" onClick={discard} disabled={busy}>Cancel</button></div>
    : status === "draft" ? <div className="draft">
      <dl>{Object.entries(LABEL).filter(([k]) => job.result[k]).map(([k, t]) => <div key={k}><dt>{t}</dt>
        <dd>{job.result[k].split("\n").map((line, i) => <p key={i}>{line}</p>)}</dd></div>)}</dl>
      <div className="row">
        <button type="button" className="btn sm" onClick={use} disabled={busy}>Use this text</button>
        <button type="button" className="btn ghost sm" onClick={discard} disabled={busy}>Discard</button></div></div>
    : <div className="row">
      {status === "failed" && <p>Hermes couldn't write the last draft.</p>}
      <button type="button" className="btn ghost sm" onClick={ask} disabled={busy}>Ask Hermes for a draft</button>
      <p className="muted">Hermes drafts the title, summary and description from this listing's saved details. Nothing changes until you use the text and save.</p></div>}
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </div>;
}
