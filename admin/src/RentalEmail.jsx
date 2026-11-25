import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Modal } from "./Sales.jsx";
import { fmtDate } from "./format.js";

// AUT-24: a rental email (server/rental-emails.js): the tenant's licence copy, EICR copy or deposit information, the rent
// change notice, or the landlord's arrears notice. The text is proposed from what it is about; the team may edit it and
// approves exactly what is shown. Any later change to what it is about is a new version nobody approved. The carrier sends
// text only, so the email says how the tenant gets the document; once Gmail takes it, the delivery is recorded here.
const STATUS = { draft: "Not sent", queued: "Approved and queued to send", sent: "Sent", needs_review: "Not known whether it was sent" };

export default function RentalEmail({ url, title, onClose, onDone }) {
  const [d, setD] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false), [text, setText] = useState("");
  const load = () => api(url).then(x => { setD(x); setText(x.email && !x.email.stale ? x.email.text : x.proposed_text ?? ""); }, x => setErr(x.message));
  useEffect(() => { load(); }, [url]);
  const e = d?.email, rev = e?.revision ?? 0;
  const dirty = !e || e.stale || text.trim() !== e.text;
  const act = async run => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await run(); } catch (x) { setErr(x.data?.fields?.text ?? x.message); if (x.status === 409) load(); }
    setBusy(false);
  };
  const save = ev => { ev.preventDefault(); act(async () => {
    const r = await api(url, { method: "PUT", body: { revision: rev, source_version: d.source_version, text } });
    setD(x => ({ ...x, email: r.email }));
  }); };
  const approve = () => act(async () => {
    await api(`${url}/approve`, { method: "POST", body: { revision: rev } });
    onDone(`${d.title}: approved and queued to ${d.recipient.email}.`);
  });
  const checked = sent => act(async () => {
    const r = await api(`${url}/outcome`, { method: "POST", body: { revision: rev, sent } });
    setD(x => ({ ...x, email: r.email }));
  });
  const editable = d && !d.blocked && (!e || ["draft", "sent", "queued"].includes(e.status));

  return <Modal title={d?.title ?? title} onClose={onClose}>
    <form className="sheet-form" onSubmit={save} noValidate>
      {!d ? !err && <p role="status">Loading…</p> : <>
        {d.recipient && <p className="meta"><span>To the {d.recipient.party}: {d.recipient.name} · {d.recipient.email}</span>
          <span>Subject: {d.subject}</span></p>}
        {e && <p role="status"><strong>{STATUS[e.status]}</strong>{e.approval && <> · approved by {e.approval.by}, {fmtDate(e.approval.at)}</>}
          {e.sent_at && <> · sent {fmtDate(e.sent_at)}</>}</p>}
        {d.blocked && <p className="warn" role="note">{d.blocked}</p>}
        {e?.status === "needs_review" && <div className="card"><p>The email service did not confirm whether it went out, and the app never sends it
          again by itself. Look in Hampton's Gmail, Sent folder, then say which.</p>
          <div className="inline"><button type="button" className="btn sm" onClick={() => checked(true)}>It was sent</button>
            <button type="button" className="btn ghost sm" onClick={() => checked(false)}>It was not sent</button></div></div>}
        {editable && <>
          {d.warnings.map(w => <p key={w} className="warn" role="note">{w}</p>)}
          <label>Text<textarea value={text} rows={14} maxLength={4000} onChange={ev => setText(ev.target.value)} /></label>
          <p className="muted">Text only: no attachment goes with it. Say how the {d.recipient?.party ?? "recipient"} gets any document (reply,
            the office, or paste a link). No bank account details. The delivery is recorded once Gmail has taken it.</p>
          {e?.blocked && !dirty && <p className="err">{e.blocked}</p>}
          {d.email_stop && <p className="muted">{d.email_stop}</p>}
        </>}
      </>}
      {err && <p role="alert" className="err">{err}</p>}
      <div className="inline">
        {editable && <button className="btn ghost" disabled={busy || !dirty || !text.trim()}>{busy ? "Saving…" : "Save"}</button>}
        {editable && e?.status === "draft" && <button type="button" className="btn" disabled={busy || dirty || !!e.blocked || !!d.email_stop}
          onClick={approve}>Approve and send</button>}
        <button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
    </form>
  </Modal>;
}
