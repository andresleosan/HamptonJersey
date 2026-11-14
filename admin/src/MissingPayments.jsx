import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDay } from "./format.js";
import { usePoll } from "./poll.js";
import { pence } from "./Rentals.jsx";
import "./missing-payments.css";

// NOT-05 (server/missing-payments.js, flag NOT05_MISSING_PAYMENTS_READY): the Inbox's Missing payments tab. Rent not paid
// in full once the grace period has passed, from the same balances as Rentals › To do › Arrears, ended tenancies too.
// Read only: arrears steps are marked in Rentals; the one thing saved here is the grace period.
const days = n => (n === 1 ? "1 day" : `${n} days`);
const step = p => p.ended_on ? <>Tenancy ended<span className="muted cell-note">Moved out {fmtDay(p.ended_on)}. No arrears steps after
  move-out</span></>
  : p.next_step ? <>{p.next_step.label}<span className="muted cell-note">Due from day {p.next_step.days}. Mark it done in Rentals</span></>
  : p.done_step ? <>{p.done_step.label}: done<span className="muted cell-note">Marking a step done does not record a payment</span></>
  : <>None yet<span className="muted cell-note">The first reminder is due a day after the due date</span></>;

export default function MissingPayments({ paused, onCount }) {
  const [data, setData] = useState(null), [err, setErr] = useState(null);
  const seq = useRef(0);
  // Only the latest answer shows; each resolves to the data it brought (the grace form's reload reads its revision).
  const load = useCallback(() => {
    const n = ++seq.current;
    return api("/admin/missing-payments").then(d => {
      if (n !== seq.current) return null;
      setData(d); setErr(null); onCount(d.count);
      return d;
    }, e => { if (n === seq.current) setErr(e.message); return null; });
  }, [onCount]);
  // Every 30 s while the tab is visible, like the Inbox; stopped while the session has expired.
  usePoll(load, paused ? null : 30000);

  return <section className="missing-payments-tab" aria-labelledby="h-missing">
    <h2 id="h-missing" className="sr">Missing payments</h2>
    {err && <p role="alert" className="err">{err} <button type="button" className="linkish" onClick={load}>Try again</button></p>}
    {!data ? !err && <p role="status">Loading missing payments…</p> : <>
      <p className="muted summary" aria-live="polite">{data.count ? `${data.count} ${data.count === 1 ? "tenancy owes" : "tenancies owe"} ${pence(data.owed)}`
        : "Nothing missing"} · Rent shows here {days(data.grace_days)} after it falls due</p>
      <Grace policy={data} onSaved={load} />
      {!data.payments.length ? <p className="empty card">No rent payments are missing. Rent that is not paid in full shows here
        {" "}{days(data.grace_days)} after it falls due, until it is paid.</p> : <>
        {data.count > data.payments.length && <p className="muted">Showing the {data.payments.length} longest overdue.</p>}
        <table className="list missing-payments" aria-labelledby="h-missing">
          <thead><tr><th scope="col">Tenancy</th><th scope="col">Owed</th><th scope="col">Late</th><th scope="col">Next step</th></tr></thead>
          <tbody>{data.payments.map(p => <tr key={p.tenancy_id} className="overdue">
            <td><a href={`#/rentals/${p.rental_id}?tenancy=${p.tenancy_id}`}>{p.address}</a>
              <span className="muted cell-note">{p.tenant_name} · {p.payment_ref}</span></td>
            <td className="num" data-label="Owed">{pence(p.balance)}</td>
            <td className="num" data-label="Late">{days(p.days_late)}<span className="muted cell-note">Since {fmtDay(p.oldest_unpaid_on)}</span></td>
            <td data-label="Next step">{step(p)}</td>
          </tr>)}</tbody>
        </table>
      </>}
    </>}
  </section>;
}

// The grace period, 0 to 30 days. A save made on an older revision is a 409: the entry stays, Reload fetches the new
// revision, and saving again applies it.
function Grace({ policy, onSaved }) {
  const [value, setValue] = useState(String(policy.grace_days)), [revision, setRevision] = useState(policy.revision);
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [msg, setMsg] = useState(null);
  const [stale, setStale] = useState(false);
  const field = useRef(null), synced = useRef(policy);
  // A newer policy from the poll replaces an untouched entry; a changed entry keeps its old revision (and gets the 409).
  useEffect(() => {
    if (policy.revision === synced.current.revision) return;
    if (value === String(synced.current.grace_days)) { setValue(String(policy.grace_days)); setRevision(policy.revision); }
    synced.current = policy;
  }, [policy, value]);
  const submit = async e => {
    e.preventDefault();
    if (!/^\s*\d{1,2}\s*$/.test(value) || Number(value) > 30) {
      setError("Enter a whole number of days from 0 to 30"); setMsg(null); field.current?.focus(); return;
    }
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await api("/admin/missing-payments/grace", { method: "PUT", body: { grace_days: Number(value), expectedRevision: revision } });
      setRevision(r.revision); setValue(String(r.grace_days)); setStale(false); synced.current = r;
      setMsg({ ok: true, text: `Saved. Rent now shows here ${days(r.grace_days)} after it falls due.` });
      await onSaved();
    } catch (x) {
      if (x.status === 409) { setStale(true); setMsg({ ok: false, text: x.message }); }
      else if (x.data?.fields?.grace_days) { setError(x.data.fields.grace_days); field.current?.focus(); }
      else setMsg({ ok: false, text: x.message });
    } finally { setBusy(false); }
  };
  const reload = async () => {
    const d = await onSaved();
    if (!d) return;
    synced.current = d; setRevision(d.revision); setStale(false);
    setMsg({ ok: true, text: `Reloaded: the grace period is ${days(d.grace_days)}. Your entry is kept; save it to use it.` });
  };
  return <details className="grace">
    <summary>Grace period: {days(policy.grace_days)}</summary>
    <form onSubmit={submit} aria-label="Grace period" noValidate>
      <label>Days after the due date before rent shows here
        <input ref={field} type="number" inputMode="numeric" min="0" max="30" step="1" value={value} required
          aria-invalid={error ? "true" : undefined} aria-describedby={error ? "e-grace" : "h-grace"}
          onChange={e => { setValue(e.target.value); setError(null); }} /></label>
      <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : "Save grace period"}</button>
      {error ? <small id="e-grace" className="err">{error}</small>
        : <small id="h-grace" className="muted">From 0 to 30. It changes only when rent shows here, never the due date or the arrears steps.</small>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}
        {stale && <> <button type="button" className="btn ghost sm" onClick={reload}>Reload</button></>}</p>}
    </form>
  </details>;
}
