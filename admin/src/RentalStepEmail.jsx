import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Modal } from "./Sales.jsx";
import { fmtDate } from "./format.js";

// AUT-23: an arrears reminder or letter (ADM-09) or a renewal message (ADM-14) emailed from the tenancy page
// (server/rental-step-emails.js). The text starts as the draft's; the team may edit it and approves exactly what is shown.
// Every change after that, to the text or to the tenancy, is a new version nobody approved. Sending never marks the
// step done nor records a payment: those stay by hand.
export const STEP_EMAIL_STATUS = { draft: "Email not sent", queued: "Email approved and queued", sent: "Email sent",
  needs_review: "Not known whether the email was sent" };

export function RentalStepEmail({ d: { tenancy: t }, which, onClose, onDone }) {
  const [x, setX] = useState(null), [text, setText] = useState(""), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const url = `/admin/tenancies/${t.id}/step-email/${which}`;
  const load = () => api(url).then(r => { setX(r); setText(r.email && !r.email.stale ? r.email.text : r.proposed_text); }, r => setErr(r.message));
  useEffect(() => { load(); }, []);
  const e = x?.email, rev = e?.revision ?? 0, dirty = !e || e.stale || text.trim() !== e.text;
  const editable = !e || ["draft", "sent", "queued"].includes(e.status);
  const act = async run => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await run(); } catch (r) { setErr(r.data?.fields?.text ?? r.message); if (r.status === 409) load(); }
    setBusy(false);
  };
  const save = ev => { ev.preventDefault(); act(async () => {
    const r = await api(url, { method: "PUT", body: { revision: rev, text, source: x.source } });
    setX(y => ({ ...y, email: r.email }));
  }); };
  const approve = () => act(async () => {
    await api(`${url}/approve`, { method: "POST", body: { revision: rev } });
    onDone(`${x.label} to ${x.name} approved and queued.`);
  });
  const checked = sent => act(async () => {
    await api(`${url}/outcome`, { method: "POST", body: { revision: rev, sent } });
    onDone(sent ? `${x.label} to ${x.name} recorded as sent.` : `${x.label} to ${x.name} recorded as not sent.`);
  });

  return <Modal title={x ? `Email: ${x.label}` : "Email"} onClose={onClose}>
    <form className="sheet-form" onSubmit={save} noValidate>
      {!x ? !err && <p role="status">Loading…</p> : <>
        <p className="meta"><span>To the {x.party}: {x.name}</span><span>{x.recipient ?? "no email"}</span></p>
        {x.no_address && <p className="warn" role="note">{x.no_address}</p>}
        {e && <p role="status"><strong>{STEP_EMAIL_STATUS[e.status]}</strong>{e.approval && <> · approved by {e.approval.by}, {fmtDate(e.approval.at)}</>}
          {e.sent_at && <> · sent {fmtDate(e.sent_at)}</>}</p>}
        {e?.status === "needs_review" && <div className="card"><p>The email service did not confirm whether it went out, and the app never sends it
          again by itself. Look in Hampton's Gmail, Sent folder, then say which.</p>
          <div className="inline"><button type="button" className="btn sm" onClick={() => checked(true)}>It was sent</button>
            <button type="button" className="btn ghost sm" onClick={() => checked(false)}>It was not sent</button></div></div>}
        {editable && <>
          <p className="muted">Subject: {x.subject}</p>
          <label>Text<textarea value={text} rows={14} maxLength={4000} onChange={ev => setText(ev.target.value)} /></label>
          {x.step === "letter" && <p className="warn" role="note">No letter template validated by a Jersey lawyer exists yet: check this text before you approve it.</p>}
          <p className="muted">No bank account details: the tenant pays quoting the payment reference. Sending does not mark the step done
            or record a payment; answers are still recorded here by hand.</p>
          {e?.blocked && !dirty && <p className="err">{e.blocked}</p>}
          {x.email_stop && <p className="muted">{x.email_stop}</p>}
        </>}
      </>}
      {err && <p role="alert" className="err">{err}</p>}
      <div className="inline">
        {x && editable && x.recipient && <button className="btn ghost" disabled={busy || !dirty}>{busy ? "Saving…" : "Save"}</button>}
        {e?.status === "draft" && <button type="button" className="btn" disabled={busy || dirty || !!e.blocked || !!x.email_stop}
          onClick={approve}>Approve and send</button>}
        <button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
    </form>
  </Modal>;
}
