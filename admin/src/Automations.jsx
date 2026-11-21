import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import MarketInventory from "./MarketInventory.jsx";
import SourceAccessReview from "./SourceAccessReview.jsx";
import EmailSettings from "./EmailSettings.jsx";
import AutomationModes from "./AutomationModes.jsx";
import { ReviewSchedule } from "./SaleFollowup.jsx";

// AUT-01 (spec 2026-11-01): what runs on its own, when it last ran and whether it has stopped. The bar's counts poll
// carries the stopped count and the pause (stalled and outbound, from App); the screen loads again when stalled changes,
// so its cards and the Settings number agree.
const JOB = { queued: ["Queued", "neutral"], working: ["Working", "active"], draft: ["Waiting for approval", "attention"],
  used: ["Used", "positive"], discarded: ["Discarded", "neutral"], failed: ["Failed", "neutral"] };
// The clock's other passes: name, what it does, and whether it keeps a run of its own (else it runs with each tick).
const PASS = {
  inbox: ["Inbox tasks", "Keeps Inbox tasks and compliance deadlines up to date with the records.", true],
  weekly: ["Weekly Insights", "Every Monday from 08:00, saves last week's numbers and leaves a note in the Inbox.", true],
  calls: ["Call-back tasks", "An Inbox task to call the advertiser two working days after an enquiry with no useful answer.", false],
  withdrawals: ["Let rentals leave the website", "A rental recorded as let shows Let agreed for 24 hours, then leaves the website; its other viewings get Inbox tasks.", true],
  demand: ["Demand clean-up", "Once a day, deletes expired private demand records.", true],
  enquiries: ["Enquiry emails", "Emails enquiries to advertisers. Held while sending is paused.", false],
};

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
      <p className="muted">Once a day, deletes applicants and viewing requests inactive for 12 months, Hermes jobs closed or untouched for 90 days, and website chats 30 days after their last message.</p>
      <p>{!r ? "No run yet."
        : r.ok ? `Last run ${fmtDay(r.date)}: ${r.contacts} applicants, ${r.viewings} viewing requests, ${r.jobs} Hermes jobs, ${r.chats} chats deleted.`
        : <span className="err">Last run {fmtDay(r.date)} failed (attempt {r.attempts} of 3). {r.attempts < 3 ? "It tries again in a few minutes."
          : "It tries again tomorrow; if that fails too, tell Optimyze."}</span>}</p>
    </article>

    {d.passes && <article className="card" aria-labelledby="a-passes">
      <h2 id="a-passes">Clock tasks</h2>
      <p className="muted">Run by the clock. Optimyze switches each one on or off in the app's settings; this screen shows them.</p>
      {d.passes.map(p => { const [name, what, kept] = PASS[p.id]; return <div key={p.id}>
        <h3>{name} <span className={`badge ${p.on ? "positive" : "neutral"}`}>{p.on ? "On" : "Off"}</span></h3>
        <p className="muted">{what}</p>
        {p.on && <p>{p.ok === false ? <span className="err">Last run {fmtDate(p.at)} did not finish; it tries again later.</span>
          : p.at ? `Last run ${fmtDate(p.at)}` : kept ? "No run yet." : "Runs with each clock tick."}</p>}
      </div>; })}
    </article>}

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
      </table> : <p className="muted">No jobs yet.</p>}
    </article>

    {d.modes && <AutomationModes initial={d.modes} />}
    <ReviewSchedule />
    <WebChat initial={d.webchat} />
    {d.hermes_mail && <HermesMail initial={d.hermes_mail} />}
    <EmailSettings />
    <MarketInventory />
    <SourceAccessReview />
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
    <p className="muted">This switch stops all outbound sending, including the daily team email summary.</p>
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

// MSG-02 (C3): the website's chat. Off, the website offers no new chats; chats already open go on.
function WebChat({ initial }) {
  const [w, setW] = useState(initial), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), said = useRef(null);
  useEffect(() => { if (msg) said.current.focus(); }, [msg]);
  const flip = async () => {
    if (!w.on && !confirm("Turn the web chat on? The button appears on the website within 5 minutes.")) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api("/admin/webchat", { method: "POST", body: { on: !w.on } });
      setW(r.webchat);
      setMsg({ ok: true, text: r.webchat.on ? "Web chat on." : "Web chat off. The button leaves the website within 5 minutes; open chats go on." });
    } catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  return <article className="card" aria-labelledby="a-chat">
    <h2 id="a-chat">Web chat</h2>
    <p className="muted">A "Message us" button on the website. A person replies from Messages; nothing answers on its own.</p>
    <div className="inline">
      <button type="button" role="switch" aria-checked={w.on} aria-labelledby="a-chat" className="switch" disabled={busy}
        onClick={flip}><span className="knob" aria-hidden="true" />{w.on ? "On" : "Off"}</button>
      {w.at && <span className="muted">Turned {w.on ? "on" : "off"} by {w.by} on {fmtDate(w.at)}</span>}
    </div>
    {msg && <p ref={said} tabIndex={-1} role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </article>;
}

// AUT-17: email Hermes writes from Hampton's Gmail. Off, it leaves each email as a draft in Gmail for a person to send;
// on, it sends it with no review one by one. Pause all outbound stops both.
const MAIL_TYPES = [["availability", "Confirm availability", "Enquiries waiting to be sent, to the agency or advertiser."],
  ["viewings", "Coordinate viewings", "Proposed viewing times to the agency, and to the client when their search has no viewing days."]];
const MAIL_KIND = { availability: "Availability", viewing_agency: "Viewing · agency", viewing_client: "Viewing · client" };
const MAIL_STATUS = { claimed: ["Writing", "active"], drafted: ["Draft in Gmail", "neutral"], sent: ["Sent", "positive"],
  failed: ["Failed", "neutral"], unknown: ["Check in Gmail", "attention"], cancelled: ["Cancelled", "neutral"] };
function HermesMail({ initial }) {
  const [sw, setSw] = useState(initial.switches), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), said = useRef(null);
  useEffect(() => { if (msg) said.current.focus(); }, [msg]);
  const flip = async (type, label) => {
    if (!sw[type] && !confirm(`Let Hermes send "${label}" emails on its own, with no review one by one?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api("/admin/hermes-mail", { method: "POST", body: { type, on: !sw[type] } });
      setSw(r.switches);
      setMsg({ ok: true, text: r.switches[type] ? `${label}: Hermes sends them.` : `${label}: Hermes leaves them as drafts in Gmail.` });
    } catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  return <article className="card" aria-labelledby="a-mail">
    <h2 id="a-mail">Email through Hermes</h2>
    <p className="muted">Hermes writes these emails from Hampton's Gmail. Off: it leaves a draft in Gmail for you to send. On: it sends them.</p>
    {MAIL_TYPES.map(([type, label, hint]) => <div className="inline" key={type}>
      <button type="button" role="switch" aria-checked={sw[type]} aria-label={label} className="switch" disabled={busy}
        onClick={() => flip(type, label)}><span className="knob" aria-hidden="true" />{sw[type] ? "Sends" : "Drafts"}</button>
      <span><strong>{label}</strong> <span className="muted">{hint}</span></span>
    </div>)}
    {sw.at && <p className="muted">Last changed by {sw.by} on {fmtDate(sw.at)}</p>}
    {initial.unknown > 0 && <p className="err">{initial.unknown} {initial.unknown === 1 ? "email" : "emails"} may or may not have left:
      check Gmail's Sent folder. They are never sent again on their own.</p>}
    {initial.recent.length ? <table className="list jobs">
      <thead><tr><th>Email</th><th>Property</th><th>Status</th><th>Since</th></tr></thead>
      <tbody>{initial.recent.map(t => <tr key={t.id}>
        <td>{MAIL_KIND[t.kind]}</td>
        <td data-label="Property"><a href={`#/p/${encodeURIComponent(t.listing_id)}`}>{t.listing_id}</a></td>
        <td data-label="Status"><span className={`badge ${MAIL_STATUS[t.status][1]}`}>{MAIL_STATUS[t.status][0]}</span></td>
        <td data-label="Since">{fmtDate(t.result_at ?? t.claimed_at ?? t.created_at)}</td></tr>)}</tbody>
    </table> : <p className="muted">Hermes has not written any email yet.</p>}
    {msg && <p ref={said} tabIndex={-1} role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </article>;
}
