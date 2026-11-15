import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

// AGE-12: a private link to some of this client's homes (approved now, still offered and confirmed available), on which
// they answer for each one without filling in their search again. The link is shown once, to copy and send yourself;
// it only works once you record that you sent it, and until you revoke it. Hidden until the server reports enabled
// (AGE12_PRESENTATIONS_READY and migration 0086). Nothing here sends anything or books a viewing.
const ANSWER = { interested: "Interested", request_viewing: "Would like to view it", not_for_me: "Not for me", call_me: "Asked for a call" };
const state = g => g.revoked_at ? ["attention", "Revoked", `Revoked by ${g.revoked_by}, ${fmtDate(g.revoked_at)}.`]
  : g.sent_at ? ["positive", "Working", `Sent by ${g.sent_by}, ${fmtDate(g.sent_at)}.`] : ["neutral", "Not sent yet", "The link does not work until you record sending it."];

function NewLink({ link }) {
  const box = useRef(null), [said, setSaid] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setSaid("Link copied."); }
    catch { box.current?.select(); setSaid("Link selected: copy it with your keyboard."); }
  };
  return <div className="warn">
    <label>New private link · shown only now<input ref={box} readOnly value={link} onFocus={e => e.target.select()} /></label>
    <div className="inline"><button type="button" className="btn ghost sm" onClick={copy}>Copy link</button>
      <span role="status" className="muted">{said}</span></div>
    <p className="muted">Send it to the client yourself, then press "I have sent it" below. If you lose it, revoke it and create another.</p>
  </div>;
}

export default function PresentationLinks({ applicantId }) {
  const [data, setData] = useState(null), [picked, setPicked] = useState(() => new Set()), [link, setLink] = useState(null);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null); setLink(null); setPicked(new Set());
    // A failed read hides the card, as when it is switched off.
    api(`/admin/applicants/${applicantId}/presentations`).then(d => { if (live) setData(d); }, () => {});
    return () => { live = false; };
  }, [applicantId]);
  if (!data?.enabled) return null;
  const act = async (path, body, done) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const d = await api(path, { method: "POST", body }); setData(d); done?.(d); }
    catch (err) { setMsg({ text: err.message }); }
    finally { setBusy(false); }
  };
  const create = e => {
    e.preventDefault();
    if (!picked.size) return setMsg({ text: "Choose at least one home." });
    act(`/admin/applicants/${applicantId}/presentations`, { match_ids: [...picked] }, d => { setLink(d.link); setPicked(new Set()); });
  };
  const toggle = id => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return <section id="s-presentations" className="card fields-group" aria-labelledby="h-presentations">
    <h2 id="h-presentations">Private presentation</h2>
    <p className="muted">A private link to some of these homes, where the client says for each one whether they are interested, would like to
      view it, or it is not for them, without filling in their search again. Their answers change no match or requirement and book nothing:
      each one becomes a task for you.</p>
    {data.presentable.length ? <form onSubmit={create} aria-label="Create a private link" noValidate>
      <fieldset className="pick-set"><legend>Homes to present (approved, still offered and confirmed available; up to {data.max_homes})</legend>
        {data.presentable.map(h => <label key={h.match_id} className="inline"><input type="checkbox" checked={picked.has(h.match_id)}
          disabled={!picked.has(h.match_id) && picked.size >= data.max_homes} onChange={() => toggle(h.match_id)} /> {h.listing_id} · {h.title}</label>)}
      </fieldset>
      <div className="inline"><button className="btn ghost sm" disabled={busy}>{busy ? "Creating…" : "Create private link"}</button></div>
    </form> : <p>No home can be presented yet: one must be shortlisted, still offered and confirmed available.</p>}
    {link && <NewLink link={link} />}
    {msg && <p role="alert" className="err">{msg.text}</p>}
    {data.grants.length > 0 && <ul className="confirmations">{data.grants.map(g => { const [kind, badge, text] = state(g);
      return <li key={g.id}>
        <p><strong>Link created by {g.created_by}, {fmtDate(g.created_at)}</strong> <span className={`badge ${kind}`}>{badge}</span>
          <br /><span className="muted">{text}</span></p>
        <ul>{g.options.map(o => <li key={o.match_id}>{o.listing_id} · {o.title}: {o.choice ? <><strong>{ANSWER[o.choice]}</strong>
          <span className="muted">, {fmtDate(o.answered_at)}</span>{o.reason && <> · “{o.reason}”</>}</> : <span className="muted">no answer yet</span>}</li>)}</ul>
        {!g.revoked_at && <div className="inline">
          {!g.sent_at && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => act(`/admin/presentations/${g.id}/sent`, {})}>I have sent it</button>}
          <button type="button" className="btn ghost sm danger" disabled={busy} onClick={() => act(`/admin/presentations/${g.id}/revoke`, {})}>Revoke link</button>
        </div>}
      </li>; })}</ul>}
  </section>;
}
