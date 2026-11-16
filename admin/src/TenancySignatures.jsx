import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { described } from "./RentalOrigin.jsx";
import { Note, useSave } from "./TenancyExit.jsx";
import { jerseyToday } from "../../server/viewings.js";

// ADM-19 (server/tenancy-signatures.js, flag ADM19_SIGNATURE_READY): in each tenancy card, the agreement's signatures as
// checked outside Hampton: who signed (the landlord, each tenant), the day, where it is recorded, and who on the team
// reviewed it. With the flag off the routes answer 404 and none of this shows. Nothing is signed, sent or uploaded here.

let probe = null; // asked once per page load, like useOriginReady
function useSignatureReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    probe ??= api("/admin/tenancy-signatures").then(() => true, e => { if (e.status !== 404) probe = null; return false; });
    probe.then(ok => live && setReady(ok));
    return () => { live = false; };
  }, []);
  return ready;
}

// Same order as server/tenancy-signatures.js (the server checks it): the landlord, then each tenant.
const partiesFor = n => ["landlord", ...Array.from({ length: n }, (_, i) => `tenant_${i + 1}`)];
const label = (party, tenants) => (party === "landlord" ? "Landlord" : tenants === 1 ? "Tenant" : `Tenant ${party.slice(7)}`);
const toForm = d => ({ tenants: String(d.tenants), rows: Object.fromEntries(d.signatures.map(s => [s.party,
  { signed_on: s.signed_on, evidence_ref: s.evidence_ref }])) });

export function TenancySignatures({ id, tick }) {
  const ready = useSignatureReady(), [d, setD] = useState(null), [err, setErr] = useState(null), [form, setForm] = useState(null);
  const p = `sg${id}`, h = `h-${p}`, s = useSave(p), { fe } = s, sent = useRef([]), today = jerseyToday();
  const load = () => api(`/admin/tenancies/${id}/signatures`).then(x => { setD(x); setErr(null); }, e => setErr(e.message));
  useEffect(() => { if (ready) load(); }, [ready, id, tick]);
  if (!ready) return null;
  if (!d) return <section aria-labelledby={h}><h3 id={h}>Signatures</h3>
    {err ? <p role="alert" className="err">{err} <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>
      : <p className="muted">Loading the signatures…</p>}</section>;

  const st = d.status, names = list => list.map(x => label(x, d.tenants)).join(", ");
  const n = Number(form?.tenants), parties = partiesFor(Number.isInteger(n) && n >= 1 && n <= 10 ? n : d.tenants);
  const row = party => form.rows[party] ?? { signed_on: "", evidence_ref: "" };
  const edit = (party, k) => e => setForm(f => ({ ...f, rows: { ...f.rows, [party]: { ...row(party), [k]: e.target.value } } }));
  const save = async e => {
    e.preventDefault();
    const given = parties.filter(x => row(x).signed_on || row(x).evidence_ref.trim());
    sent.current = given;
    const ok = await s.run(() => api(`/admin/tenancies/${id}/signatures`, { method: "PUT", body: { tenancy_id: id,
      expectedRevision: d.revision, contract_revision: d.contract_revision, tenants: Number(form.tenants),
      signatures: given.map(x => ({ party: x, signed_on: row(x).signed_on || null, evidence_ref: row(x).evidence_ref })) } }),
    "Signatures recorded.");
    if (ok) { setForm(null); load(); }
  };
  // The server names a signature by its place in what was sent; each control asks for its party's.
  const key = (party, k, i = sent.current.indexOf(party)) => (i < 0 ? `${party}.${k}` : `signatures.${i}.${k}`);

  return <section aria-labelledby={h} className="signatures">
    <h3 id={h}>Signatures</h3>
    {st.state === "complete" ? <p>Signed externally, reviewed by {st.reviewed_by} on {fmtDate(st.reviewed_at)}.</p>
      : st.state === "out_of_date" ? <p className="warn" role="note">Out of date: the signed contract reference changed after this review.
        Check the signatures against it and save them again.</p>
      : st.state === "incomplete" ? <p className="warn" role="note">Still to sign or to check: {names(st.missing)}.</p>
      : <p className="warn" role="note">Not recorded. The agreement is signed outside Hampton: record here what you checked there.
        Still to check: {names(st.missing)}.</p>}
    {d.signatures.length > 0 && <ul className="plain-list" aria-label="Signatures checked">{d.signatures.map(x => <li key={x.party}>
      <span><strong>{label(x.party, d.tenants)}</strong> signed {fmtDay(x.signed_on)}<span className="cell-note">{x.evidence_ref}</span>
        <span className="muted cell-note">Checked by {x.reviewed_by} on {fmtDate(x.reviewed_at)}</span></span></li>)}</ul>}
    {!form && <Note msg={s.msg} />}
    {!form ? <div className="inline"><button type="button" className="btn ghost sm" onClick={() => { s.setMsg(null); setForm(toForm(d)); }}>
      {d.revision ? "Update signatures" : "Record signatures"}</button></div>
      : <form ref={s.ref} className="view-form" onSubmit={save} noValidate aria-label="Signatures">
        <p className="muted">Enter only what you checked in the signed agreement. Leave a party empty until they have signed.</p>
        <div className="field"><label>Tenants who sign<input id={`${p}-tenants`} type="number" inputMode="numeric" min={1} max={10}
          value={form.tenants} onChange={e => setForm(f => ({ ...f, tenants: e.target.value }))} {...fe.invalid("tenants")} />
          {fe.error("tenants")}</label></div>
        {fe.error("signatures")}
        {parties.map(x => <fieldset key={x} className="choices-set"><legend>{label(x, parties.length - 1)}</legend><div className="grid2">
          <label>Signed on<input id={`${p}-${key(x, "signed_on")}`} type="date" max={today} value={row(x).signed_on}
            onChange={edit(x, "signed_on")} {...fe.invalid(key(x, "signed_on"))} />{fe.error(key(x, "signed_on"))}{fe.error(key(x, "party"))}</label>
          <label>Where it is recorded<input id={`${p}-${key(x, "evidence_ref")}`} value={row(x).evidence_ref} maxLength={120} autoComplete="off"
            onChange={edit(x, "evidence_ref")} {...fe.invalid(key(x, "evidence_ref"))}
            aria-describedby={described(fe, key(x, "evidence_ref"), `d-${p}-ref`)} />{fe.error(key(x, "evidence_ref"))}</label>
        </div></fieldset>)}
        <small id={`d-${p}-ref`} className="muted">The signing service's envelope or the office file you checked. The app does not receive, store or open the document.</small>
        <Note msg={s.msg} onReload={s.reload(load)} />
        <div className="inline"><button className="btn sm" disabled={s.busy}>{s.busy ? "Saving…" : "Save signatures"}</button>
          <button type="button" className="btn ghost sm" onClick={() => { setForm(null); s.setMsg(null); fe.setErrors({}); }}>Cancel</button></div>
      </form>}
  </section>;
}
