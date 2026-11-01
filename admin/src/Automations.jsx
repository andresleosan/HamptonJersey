import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";

// AUT-01 (spec 2026-11-01): what runs on its own, when it last ran and whether it has stopped. The bar's counts poll
// carries the stopped count and the pause (stalled and outbound, from App); the screen loads again when stalled changes,
// so its cards and the Settings number agree.
const JOB = { queued: ["Queued", "neutral"], working: ["Working", "active"], draft: ["Waiting for approval", "attention"],
  used: ["Used", "positive"], discarded: ["Discarded", "neutral"], failed: ["Failed", "neutral"] };

export default function Automations({ stalled, outbound, onChange }) {
  const [d, setD] = useState(null), [err, setErr] = useState(null), seen = useRef(null);
  // On arrival, then when the bar's poll changes stalled; its first answer on a direct visit (from undefined) is not a change.
  useEffect(() => {
    if (seen.current !== undefined) api("/admin/automations").then(x => { setD(x); setErr(null); }, e => setErr(e.message));
    seen.current = stalled;
  }, [stalled]);
  if (!d) return err ? <p role="alert" className="err">{err}</p> : <p>Loading automations…</p>;
  const { clock, retention: r, hermes: h } = d, m = h.month, closed = m.used + m.discarded + m.failed;

  return <section aria-labelledby="t-auto" className="automations">
    <div className="head"><div><h1 id="t-auto">Automations</h1>
      <p className="muted">What runs on its own, and when it last ran.</p></div></div>
    {err && <p role="alert" className="err">Couldn't refresh; what you see may be out of date. {err}</p>}

    <article className="card" aria-labelledby="a-clock">
      <h2 id="a-clock">Clock</h2>
      <p className="muted">Wakes every 10 minutes to run what is due.</p>
      {clock.at && <p>Last run {fmtDate(clock.at)}</p>}
      {clock.stopped && <p className="err">{clock.at ? "Stopped: no run for over 30 minutes." : "Stopped: no run recorded."} Tell Optimyze; while the panel is open, it keeps the daily clean-up going.</p>}
    </article>

    <article className="card" aria-labelledby="a-clean">
      <h2 id="a-clean">12-month clean-up</h2>
      <p className="muted">Once a day, deletes applicants and viewing requests inactive for 12 months, and Hermes jobs closed or untouched for 90 days.</p>
      <p>{!r ? "No run yet."
        : r.ok ? `Last run ${fmtDay(r.date)}: ${r.contacts} applicants, ${r.viewings} viewing requests, ${r.jobs} Hermes jobs deleted.`
        : <span className="err">Last run {fmtDay(r.date)} failed (attempt {r.attempts} of 3). {r.attempts < 3 ? "It tries again in a few minutes."
          : "It tries again tomorrow; if that fails too, tell Optimyze."}</span>}</p>
    </article>

    <article className="card" aria-labelledby="a-hermes">
      <h2 id="a-hermes">Hermes text drafts</h2>
      <p className="muted">Writes listing texts for a person to approve.</p>
      {h.at ? <p>Last asked for work {fmtDate(h.at)}</p> : <p><span className="badge neutral">Not connected yet</span></p>}
      {h.stopped && <p className="err">Stopped: no request for over 15 minutes. Requests wait in the queue until it is back; tell Optimyze.</p>}
      <p>Last 30 days: {m.used} used, {m.discarded} discarded, {m.failed} failed ({closed ? `${Math.round(100 * m.used / closed)}% used` : "—"})</p>
      {h.waiting.length > 0 && <><h3>Waiting for approval</h3>
        <ul>{h.waiting.map(j => <li key={j.id}><a href={`#/p/${encodeURIComponent(j.listing_id)}`}>{j.listing_id} {j.title}</a>
          <span className="muted"> · drafted {fmtDate(j.drafted_at)}</span></li>)}</ul></>}
      <h3>Recent jobs</h3>
      {h.recent.length ? <table className="list jobs">
        <thead><tr><th>Listing</th><th>Status</th><th>Asked by</th><th>Asked</th><th>Closed</th></tr></thead>
        <tbody>{h.recent.map(j => <tr key={j.id}>
          <td><a href={`#/p/${encodeURIComponent(j.listing_id)}`}>{j.listing_id} {j.title}</a></td>
          <td><span className={`badge ${JOB[j.status][1]}`}>{JOB[j.status][0]}</span></td>
          <td data-label="Asked by">{j.by}</td><td data-label="Asked">{fmtDate(j.created_at)}</td>
          <td data-label="Closed">{fmtDate(j.closed_at)}</td></tr>)}</tbody>
      </table> : <p className="muted">No jobs yet. Once Hermes is connected, ask for a draft in a listing's editor.</p>}
    </article>

    <Sending outbound={outbound} onChange={onChange} />
  </section>;
}

// A6: anyone signed in pauses or resumes; the bar on every screen follows through onChange (the counts poll). The pressed
// button is swapped for the other one, so the focus goes to the message that says what happened.
function Sending({ outbound, onChange }) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), said = useRef(null);
  useEffect(() => { if (msg) said.current.focus(); }, [msg]);
  // A pause or resume from elsewhere (the bar, Hermes) makes the card's own message stale: it goes.
  if (msg?.ok && msg.paused !== !!outbound) setMsg(null);
  const act = async (ask, path, done, paused) => {
    if (!confirm(ask)) return;
    setBusy(true); setMsg(null);
    try { await api(path, { method: "POST" }); await onChange(); setMsg({ ok: true, text: done, paused }); }
    catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  return <article className="card" aria-labelledby="a-send">
    <h2 id="a-send">Sending to clients and agencies</h2>
    <p className="muted">Nothing is sent automatically yet; this switch stops any future sending.</p>
    {outbound === undefined ? <p>Checking…</p> : <div className="inline">
      {outbound ? <><span className="badge attention">Paused</span>
        <span>Paused since {fmtDate(outbound.at)} (asked by {outbound.by === "hermes" ? "Hermes" : outbound.by})</span>
        <button type="button" className="btn ghost sm" disabled={busy}
          onClick={() => act("Resume sending to clients and agencies?", "/admin/outbound/resume", "Sending resumed.", false)}>Resume sending</button></>
        : <><span className="badge positive">Active</span>
          <button type="button" className="btn sm" disabled={busy}
            onClick={() => act("Pause all sending to clients and agencies?", "/admin/outbound/pause", "Sending paused.", true)}>Pause all outbound</button></>}
    </div>}
    {msg && <p ref={said} tabIndex={-1} role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </article>;
}
