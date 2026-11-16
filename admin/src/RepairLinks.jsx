import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { jerseyToday, plusDays } from "../../server/viewings.js";

// ADM-12 (server/routes/repair-reports.js, ADM12_CASE_ACCESS_READY and migration 0110): in a running tenancy's card, a
// private link for the tenant to report a repair. The team chooses the last day it works (no default), copies it (shown
// once) and sends it themselves; it works once "I have sent it" is pressed and until it is revoked. The tenant opens it
// with a code sent to the tenancy's email; each report arrives in Repairs as Reported: nothing is approved or ordered,
// and no photos come through it. Hidden while the server does not answer (switched off, or not set up).
const state = g => g.status === "revoked" ? ["attention", "Revoked", `Revoked by ${g.revoked_by}, ${fmtDate(g.revoked_at)}.`]
  : g.expired ? ["neutral", "Expired", `It worked until the end of ${fmtDay(g.expires_on)}.`]
  : g.email_changed ? ["attention", "Stopped", "The tenant's email changed after the link was created: revoke it and create another."]
  : g.status === "active" ? ["positive", "Working", `Sent by ${g.sent_by}, ${fmtDate(g.sent_at)}. Works until the end of ${fmtDay(g.expires_on)}.`]
  : ["neutral", "Not sent yet", `It does not work until you record sending it. Would work until the end of ${fmtDay(g.expires_on)}.`];

function NewLink({ link }) {
  const box = useRef(null), [said, setSaid] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setSaid("Link copied."); }
    catch { box.current?.select(); setSaid("Link selected: copy it with your keyboard."); }
  };
  return <div className="warn">
    <label>New repair link · shown only now<input ref={box} readOnly value={link} onFocus={e => e.target.select()} /></label>
    <div className="inline"><button type="button" className="btn ghost sm" onClick={copy}>Copy link</button>
      <span role="status" className="muted">{said}</span></div>
    <p className="muted">Send it to the tenant yourself, then press "I have sent it" below. If you lose it, revoke it and create another.</p>
  </div>;
}

export function RepairLinks({ id }) {
  const [data, setData] = useState(null), [link, setLink] = useState(null), [until, setUntil] = useState("");
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), today = jerseyToday(), h = `h-repair-links-${id}`;
  useEffect(() => {
    let live = true;
    setData(null); setLink(null);
    api(`/admin/tenancies/${id}/repair-links`).then(d => { if (live) setData(d); }, () => {});
    return () => { live = false; };
  }, [id]);
  if (!data?.enabled) return null;
  const act = async (path, body, done) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const d = await api(path, { method: "POST", body }); setData(d); done?.(d); }
    catch (err) { setMsg(err.message); }
    finally { setBusy(false); }
  };
  const create = e => {
    e.preventDefault();
    if (!until) return setMsg("Choose the last day the link works.");
    act(`/admin/tenancies/${id}/repair-links`, { expires_on: until }, d => { setLink(d.link); setUntil(""); });
  };
  return <section aria-labelledby={h} id={`repair-links-${id}`}>
    <h3 id={h}>Tenant repair link</h3>
    <p className="muted">A private link where the tenant reports a repair. To open it they enter a code sent to the tenancy's email. Each
      report arrives in Repairs as Reported: nothing is approved or ordered, and no photos are sent through it.</p>
    <form onSubmit={create} className="inline" aria-label="Create a tenant repair link" noValidate>
      <label>Works until (last day)<input type="date" min={today} max={plusDays(today, 366)} value={until}
        onChange={e => setUntil(e.target.value)} /></label>
      <button className="btn ghost sm" disabled={busy}>{busy ? "Creating…" : "Create repair link"}</button>
    </form>
    {link && <NewLink link={link} />}
    {msg && <p role="alert" className="err">{msg}</p>}
    {data.links.length > 0 && <ul className="confirmations">{data.links.map(g => { const [kind, badge, text] = state(g);
      const open = g.status !== "revoked" && !g.expired;
      return <li key={g.id}>
        <p><strong>Link created by {g.created_by}, {fmtDate(g.created_at)}</strong> <span className={`badge ${kind}`}>{badge}</span>
          <br /><span className="muted">{text} {g.reports === 1 ? "1 report" : `${g.reports} reports`} through it.</span></p>
        {open && <div className="inline">
          {g.status === "dormant" && !g.email_changed && <button type="button" className="btn ghost sm" disabled={busy}
            onClick={() => act(`/admin/case-grants/${g.id}/sent`, {})}>I have sent it</button>}
          <button type="button" className="btn ghost sm danger" disabled={busy} onClick={() => act(`/admin/case-grants/${g.id}/revoke`, {})}>
            Revoke link</button>
        </div>}
      </li>; })}</ul>}
  </section>;
}
