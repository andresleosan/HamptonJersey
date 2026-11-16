import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";
import { adminMediaUrl } from "./admin-media-url.js";

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

// AGE-11: the client's view of each home as the page shows it (site/presentation.js), to review before sending.
const money = (amount, currency = "GBP") => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0,
  ...(/^[A-Z]{3}$/.test(currency ?? "GBP") && { style: "currency", currency: currency ?? "GBP" }) }).format(amount);
const price = h => h.operation === "rent" && h.rent != null ? `${money(h.rent, h.currency)}${h.rent_period ? ` per ${h.rent_period}` : ""}`
  : h.sale_price != null ? money(h.sale_price, h.currency) : null;
const facts = h => [h.location, h.bedrooms != null && `${h.bedrooms} ${h.bedrooms === 1 ? "bedroom" : "bedrooms"}`,
  h.bathrooms != null && `${h.bathrooms} ${h.bathrooms === 1 ? "bathroom" : "bathrooms"}`].filter(Boolean).join(" · ");
const confirmedOn = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

// AGE-11 (AGE11_REVIEW_READY, migration 0115): the snapshot the client will see, approved by a person before sending.
// Any change after the approval (a price, a photo, a confirmation) has to be approved again before "I have sent it".
function Review({ id, onApproved }) {
  const [r, setR] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const load = () => api(`/admin/presentations/${id}/review`).then(setR, err => setMsg({ text: err.message }));
  useEffect(() => {
    let live = true;
    api(`/admin/presentations/${id}/review`).then(d => { if (live) setR(d); }, err => { if (live) setMsg({ text: err.message }); });
    return () => { live = false; };
  }, [id]);
  if (!r) return msg ? <p role="alert" className="err">{msg.text}</p> : <p role="status" className="muted">Loading the review…</p>;
  const approve = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { setR(await api(`/admin/presentations/${id}/approve`, { method: "POST", body: { snapshot_hash: r.snapshot_hash,
      version: r.approval?.version ?? 0 } })); onApproved(); }
    catch (err) { setMsg({ text: err.message }); load(); }
    finally { setBusy(false); }
  };
  const blocked = new Map(r.blockers.map(b => [b.match_id, b.message]));
  return <div className="fields-group" role="group" aria-label={`Review of link ${id}`}>
    <p className="muted">What the client will see once you send the link: only these homes, with these details and photos.</p>
    <ol>{r.snapshot.homes.map(h => <li key={h.match_id}>
      <strong>{h.title || "Home"}</strong> <span className="muted">· {h.listing_id}</span>
      <br /><span className="muted">{facts(h)}</span>{price(h) && <> · <strong>{price(h)}</strong></>}
      <br />{h.availability_confirmed_at ? <span>Availability confirmed on {confirmedOn(h.availability_confirmed_at)}</span>
        : <span className="err">Not confirmed available now</span>}
      {h.summary && <><br /><span>{h.summary}</span></>}
      {h.photos.length > 0 && <div className="inline">{h.photos.map(p => p.media_id
        ? <img key={p.asset_id} className="thumb" src={adminMediaUrl(p.media_id, { thumb: true })} alt={p.label || "Photo"} loading="lazy" />
        : <span key={p.asset_id} className="muted">{p.label || "Photo"}</span>)}</div>}
      {blocked.has(h.match_id) && <p className="err">{blocked.get(h.match_id)}</p>}
    </li>)}</ol>
    {r.approved_current ? <p><span className="badge positive">Approved</span> <span className="muted">as it stands, by {r.approval.approved_by},
      {" "}{fmtDate(r.approval.approved_at)}. Send the link yourself, then press "I have sent it".</span></p>
      : r.approval && <p className="warn">Changed since it was approved (version {r.approval.version}): approve it again before you send it.</p>}
    {!r.approved_current && !r.blockers.length && !r.grant.sent_at && !r.grant.revoked_at && <div className="inline">
      <button type="button" className="btn ghost sm" disabled={busy} onClick={approve}>{busy ? "Approving…" : "Approve this presentation"}</button></div>}
    {r.blockers.length > 0 && <p className="muted">It cannot be approved until each home is confirmed available, still approved and has a
      suitable photo. To change the homes, revoke this link and create another.</p>}
    {msg && <p role="alert" className="err">{msg.text}</p>}
  </div>;
}

export default function PresentationLinks({ applicantId }) {
  const [data, setData] = useState(null), [picked, setPicked] = useState(() => new Set()), [link, setLink] = useState(null);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [open, setOpen] = useState(null);
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
  const reload = () => api(`/admin/applicants/${applicantId}/presentations`).then(setData, () => {});
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
          <br /><span className="muted">{text}</span>
          {data.review && !g.sent_at && !g.revoked_at && <><br /><span className="muted">{g.approval
            ? `Presentation approved by ${g.approval.approved_by}, ${fmtDate(g.approval.approved_at)} (version ${g.approval.version}).`
            : "Not reviewed yet: review and approve the presentation before you send the link."}</span></>}</p>
        <ul>{g.options.map(o => <li key={o.match_id}>{o.listing_id} · {o.title}: {o.choice ? <><strong>{ANSWER[o.choice]}</strong>
          <span className="muted">, {fmtDate(o.answered_at)}</span>{o.reason && <> · “{o.reason}”</>}</> : <span className="muted">no answer yet</span>}</li>)}</ul>
        {data.review && !g.sent_at && !g.revoked_at && (open === g.id ? <Review id={g.id} onApproved={reload} />
          : <div className="inline"><button type="button" className="btn ghost sm" onClick={() => setOpen(g.id)}>Review before sending</button></div>)}
        {!g.revoked_at && <div className="inline">
          {!g.sent_at && (!data.review || g.approval) && <button type="button" className="btn ghost sm" disabled={busy}
            onClick={() => act(`/admin/presentations/${g.id}/sent`, {})}>I have sent it</button>}
          <button type="button" className="btn ghost sm danger" disabled={busy} onClick={() => act(`/admin/presentations/${g.id}/revoke`, {})}>Revoke link</button>
        </div>}
      </li>; })}</ul>}
  </section>;
}
