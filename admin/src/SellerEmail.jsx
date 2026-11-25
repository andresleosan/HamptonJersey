import { useEffect, useId, useState } from "react";
import { api } from "./api.js";
import { Modal, money } from "./Sales.jsx";
import { fmtDate } from "./format.js";

// OFE-02: an open offer emailed to its seller (server/offer-emails.js). The seller is an owner of the listing in the
// Advertisers directory; the team chooses the contact, may edit the text, and approves exactly what is shown. Every
// change after that is a new version nobody approved. The seller's answer is still recorded here by hand.
const STATUS = { draft: "Not sent", queued: "Approved and queued to send", sent: "Sent", needs_review: "Not known whether it was sent" };

export default function SellerEmail({ offer: o, onClose, onDone }) {
  const id = useId();
  const [d, setD] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const [f, setF] = useState({ advertiser_id: "", contact_key: "", text: "" });
  const fill = x => setF({ advertiser_id: String(x.email?.advertiser_id ?? x.sellers[0]?.id ?? ""), contact_key: x.email?.contact?.key ?? "",
    text: x.email?.text ?? x.proposed_text });
  const load = () => api(`/admin/offers/${o.id}/seller-email`).then(x => { setD(x); fill(x); }, x => setErr(x.message));
  useEffect(() => { load(); }, []);
  const e = d?.email, rev = e?.revision ?? 0, seller = d?.sellers.find(s => String(s.id) === f.advertiser_id);
  const dirty = !e || f.advertiser_id !== String(e.advertiser_id) || f.contact_key !== (e.contact?.key ?? "") || f.text.trim() !== e.text;
  const act = async run => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await run(); } catch (x) { setErr(x.message); if (x.status === 409) load(); }
    setBusy(false);
  };
  const url = `/admin/offers/${o.id}/seller-email`;
  const save = ev => { ev.preventDefault(); act(async () => {
    const r = await api(url, { method: "PUT", body: { revision: rev, advertiser_id: Number(f.advertiser_id), contact_key: f.contact_key, text: f.text } });
    setD(x => ({ ...x, email: r.email }));
  }); };
  const approve = () => act(async () => {
    await api(`${url}/approve`, { method: "POST", body: { revision: rev } });
    onDone(`Email to the seller about the offer from ${o.buyer_name} approved and queued.`);
  });
  const checked = sent => act(async () => {
    const r = await api(`${url}/outcome`, { method: "POST", body: { revision: rev, sent } });
    setD(x => ({ ...x, email: r.email }));
  });
  const set = k => ev => setF(x => ({ ...x, [k]: ev.target.value, ...(k === "advertiser_id" ? { contact_key: "" } : {}) }));
  const editable = !e || ["draft", "sent", "queued"].includes(e.status);

  return <Modal title="Email the offer to the seller" onClose={onClose}>
    <form className="sheet-form" onSubmit={save} noValidate>
      <p className="meta"><span>{o.listing_title}</span><span>{money(o.amount)}{o.counter_amount != null && `, countered at ${money(o.counter_amount)}`}</span></p>
      {!d ? !err && <p role="status">Loading…</p> : !d.sellers.length && !e ? <p>No owner of this listing in Advertisers has an email.
        Add the owner there (type Individual or Entity, with this listing and an email), then come back.</p> : <>
        {e && <p role="status"><strong>{STATUS[e.status]}</strong>{e.approval && <> · approved by {e.approval.by}, {fmtDate(e.approval.at)}</>}
          {e.sent_at && <> · sent {fmtDate(e.sent_at)}</>}</p>}
        {e?.status === "needs_review" && <div className="card"><p>The email service did not confirm whether it went out, and the app never sends it
          again by itself. Look in Hampton's Gmail, Sent folder, then say which.</p>
          <div className="inline"><button type="button" className="btn sm" onClick={() => checked(true)}>It was sent</button>
            <button type="button" className="btn ghost sm" onClick={() => checked(false)}>It was not sent</button></div></div>}
        {editable && <>
          <label>Seller<select value={f.advertiser_id} onChange={set("advertiser_id")}>
            {!seller && <option value="">Choose the seller</option>}
            {d.sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <fieldset><legend>Send to</legend>
            {(seller?.contacts ?? []).map(c => <label key={c.key} className="check"><input type="radio" name={`${id}-to`} value={c.key}
              checked={f.contact_key === c.key} onChange={set("contact_key")} />{c.name} · {c.email}</label>)}</fieldset>
          <label>Text<textarea value={f.text} rows={12} maxLength={4000} onChange={set("text")} /></label>
          <p className="muted">It names no buyer: add only what the buyer agreed to share. The seller's answer is recorded here by hand
            (Counter, Accept or Reject); the email being sent never changes the offer.</p>
          {e?.blocked && !dirty && <p className="err">{e.blocked}</p>}
          {d.email_stop && <p className="muted">{d.email_stop}</p>}
        </>}
      </>}
      {err && <p role="alert" className="err">{err}</p>}
      <div className="inline">
        {d && editable && (d.sellers.length > 0) && <button className="btn ghost" disabled={busy || !dirty || !f.contact_key}>{busy ? "Saving…" : "Save"}</button>}
        {e?.status === "draft" && <button type="button" className="btn" disabled={busy || dirty || !!e.blocked || !!d.email_stop}
          onClick={approve}>Approve and send</button>}
        <button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
    </form>
  </Modal>;
}
