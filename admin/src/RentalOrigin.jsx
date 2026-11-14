import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";
import { useFieldErrors } from "./Sales.jsx";
import { NewTenancy } from "./RentalDialogs.jsx";

// ADM-06 (server/tenancy-origins.js, flag ADM06_TENANCY_ORIGIN_READY): a tenancy from a Let agreed listing and an
// applicant staff pick by hand, and each tenancy's signed-contract reference and entry inventory. With the flag off the
// routes answer 404 and none of this shows. References are text about where a document is kept: never a file or a link.

let probe = null; // asked once per page load; a failure other than 404 is asked again next time
export function useOriginReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    probe ??= api("/admin/tenancy-origins").then(() => true, e => { if (e.status !== 404) probe = null; return false; });
    probe.then(ok => live && setReady(ok));
    return () => { live = false; };
  }, []);
  return ready;
}

const REF_HINT = "A folder or file name you checked. The app does not receive, store or open the document.";
// A control's aria-describedby: its hint and, when there is one, its error.
const described = (fe, k, hint) => [hint, fe.invalid(k)["aria-describedby"]].filter(Boolean).join(" ") || undefined;

export function FromLetAgreed({ rental, onClose, onDone, onDirty, onRefused }) {
  const [lists, setLists] = useState(null), [loadErr, setLoadErr] = useState(null), [preview, setPreview] = useState(null);
  const [pick, setPick] = useState({ listing_id: "", applicant_id: "", ref: "" }), [busy, setBusy] = useState(false), [err, setErr] = useState(null);
  const op = useRef(null), form = useRef(null), fe = useFieldErrors("lo");
  useEffect(() => { form.current?.querySelector("[aria-invalid=true]")?.focus(); }, [fe.errors]);
  const load = () => { setLoadErr(null); api("/admin/tenancy-origins/candidates").then(setLists, e => setLoadErr(e.message)); };
  useEffect(load, []);
  useEffect(() => { onDirty(!!(pick.listing_id || pick.applicant_id || pick.ref)); }, [pick]);
  useEffect(() => () => onDirty(false), []);
  const set = k => e => setPick(p => ({ ...p, [k]: e.target.value }));
  const show = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null); fe.setErrors({});
    try {
      const p = await api("/admin/tenancy-origins/preview", { method: "POST", body: { rental_id: rental.id,
        listing_id: pick.listing_id || null, applicant_id: pick.applicant_id ? Number(pick.applicant_id) : null,
        signed_contract_ref: pick.ref.trim() || null } });
      op.current = crypto.randomUUID(); // one confirmation per preview: a retry of it never makes a second tenancy
      setPreview(p);
    } catch (x) { fe.setErrors(x.data?.fields || {}); setErr(x.message); }
    finally { setBusy(false); }
  };

  if (!lists) return loadErr ? <p role="alert" className="err">{loadErr}{" "}
    <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p> : <p>Loading Let agreed listings…</p>;
  if (!lists.listings.length || !lists.applicants.length) return <div className="inline"><p className="muted">{!lists.listings.length
    ? "No listing to rent is Let agreed. Mark it Let agreed on the listing first, or use New tenancy."
    : "No applicant is looking to rent. Add the applicant first, or use New tenancy."}</p>
    <button type="button" className="btn ghost sm" onClick={onClose}>Back</button></div>;

  if (preview) {
    const v = preview.preview;
    const lead = <div className="fields-group">
      <h3>Before you confirm</h3>
      <dl className="kv">
        <div><dt>Property</dt><dd>{v.rental.address}, {v.rental.parish}</dd></div>
        <div><dt>From listing</dt><dd>{v.listing.id}: {v.listing.title}{v.listing.published ? "" : " (not published)"}</dd></div>
        <div><dt>Applicant</dt><dd>{v.applicant.name}</dd></div>
        <div><dt>Signed contract</dt><dd>{v.signed_contract_ref ? `Reference: ${v.signed_contract_ref}` : "No reference yet. Record it once the signed copy is checked."}</dd></div>
      </dl>
      <p className="muted">The listing and the applicant stay as they are. The terms below are suggestions from their records: check each one.</p>
      <div className="inline"><button type="button" className="btn ghost sm" onClick={() => setPreview(null)}>Change the selection</button></div>
    </div>;
    if (!preview.eligible) return <div className="view-form">{lead}<p role="alert" className="err">{preview.reasons.join(". ")}.</p></div>;
    return <NewTenancy rental={rental} initial={v.draft} lead={lead} button="Confirm tenancy" onClose={onClose} onDirty={onDirty}
      onRefused={onRefused} onDone={onDone} send={async tenancy_draft => (await api("/admin/tenancy-origins/commit", { method: "POST",
        body: { rental_id: rental.id, source_versions: preview.source_versions, tenancy_draft, operation_id: op.current,
          signed_contract_ref: v.signed_contract_ref } })).tenancy} />;
  }

  return <form ref={form} className="view-form" onSubmit={show} noValidate aria-labelledby="h-new-tenancy">
    <p className="muted">Choose the listing and the applicant yourself: nothing is matched by address or name, and the tenancy is for this property.</p>
    <div className="grid2">
      <label>Let agreed listing<select id="lo-listing_id" value={pick.listing_id} onChange={set("listing_id")} {...fe.invalid("listing_id")}>
        <option value="">Choose a listing</option>
        {lists.listings.map(l => <option key={l.id} value={l.id}>{[l.id, l.title, l.location].filter(Boolean).join(", ")}</option>)}</select>
        {fe.error("listing_id")}</label>
      <label>Applicant<select id="lo-applicant_id" value={pick.applicant_id} onChange={set("applicant_id")} {...fe.invalid("applicant_id")}>
        <option value="">Choose an applicant</option>
        {lists.applicants.map(a => <option key={a.id} value={a.id}>{a.name}{a.stage === "agreed" ? ", agreed" : ""}</option>)}</select>
        {fe.error("applicant_id")}</label>
    </div>
    <div className="field"><label>Signed contract reference (optional)<input id="lo-signed_contract_ref" value={pick.ref} maxLength={120}
      onChange={set("ref")} autoComplete="off" {...fe.invalid("signed_contract_ref")} aria-describedby={described(fe, "signed_contract_ref", "d-lo-ref")} />
      {fe.error("signed_contract_ref")}</label><small id="d-lo-ref" className="muted">{REF_HINT}</small></div>
    {err && <p role="alert" className="err">{err}</p>}
    <div className="inline"><button className="btn sm" disabled={busy}>{busy ? "Checking…" : "Preview"}</button>
      <button type="button" className="btn ghost sm" onClick={onClose}>Cancel</button></div>
  </form>;
}

// In each tenancy card: where it came from, the signed contract's reference and the entry inventory.
export function TenancyRecords({ id, tick }) {
  const ready = useOriginReady(), [d, setD] = useState(null), [err, setErr] = useState(null);
  const load = () => api(`/admin/tenancies/${id}/records`).then(x => { setD(x); setErr(null); }, e => setErr(e.message));
  useEffect(() => { if (ready) load(); }, [ready, id, tick]);
  if (!ready) return null;
  if (!d) return err ? <p role="alert" className="err">{err} <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>
    : <p className="muted">Loading the contract and the inventory…</p>;
  const o = d.origin;
  return <>
    <h3>Origin</h3>
    <p>{o ? <>Started from Let agreed listing <a href={`#/p/${encodeURIComponent(o.listing_id)}`}>{o.listing_id}</a>
      {o.listing_title && `, ${o.listing_title}`}, with applicant <a href={`#/applicants/${o.applicant_id}`}>{o.applicant_name ?? `#${o.applicant_id}`}</a>.</>
      : "Entered with New tenancy, not from a Let agreed listing."}</p>
    <SignedContract id={id} current={d.signed_contract} onSaved={load} />
    <EntryInventory id={id} current={d.entry_inventory} onSaved={load} />
  </>;
}

// The typed text is kept through a conflict: after Reload the saved reference shows above it, to review before saving.
function SignedContract({ id, current, onSaved }) {
  const [value, setValue] = useState(current?.evidence_ref ?? ""), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const p = `sc${id}`, fe = useFieldErrors(p);
  const save = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); fe.setErrors({});
    try {
      await api(`/admin/tenancies/${id}/signed-contract`, { method: "PUT", body: { tenancy_id: id, evidence_ref: value,
        expectedRevision: current?.revision ?? 0 } });
      setMsg({ ok: true, text: "Signed contract reference recorded." }); await onSaved();
    } catch (x) { fe.setErrors(x.data?.fields || {}); setMsg({ text: x.message, stale: x.status === 409 }); }
    finally { setBusy(false); }
  };
  return <form className="view-form" onSubmit={save} noValidate aria-labelledby={`h-${p}`}>
    <h3 id={`h-${p}`}>Signed contract</h3>
    {current ? <p>Reference: <strong>{current.evidence_ref}</strong><span className="muted cell-note">Checked by {current.reviewed_by}
      {" "}on {fmtDate(current.reviewed_at)} (revision {current.revision})</span></p>
      : <p className="warn" role="note">Not recorded. A start date or a check-in date does not record a signed contract.</p>}
    <div className="field"><label>Where the signed copy is kept<input id={`${p}-evidence_ref`} value={value} maxLength={120}
      onChange={e => setValue(e.target.value)} autoComplete="off" {...fe.invalid("evidence_ref")} aria-describedby={described(fe, "evidence_ref", `d-${p}`)} />
      {fe.error("evidence_ref")}</label><small id={`d-${p}`} className="muted">{REF_HINT}</small></div>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}
      {msg.stale && <> <button type="button" className="btn ghost sm" onClick={() => { setMsg({ ok: true,
        text: "The saved reference is shown above. Save again to replace it with yours." }); onSaved(); }}>Reload</button></>}</p>}
    <div className="inline"><button className="btn ghost sm" disabled={busy}>{busy ? "Saving…" : current ? "Update reference" : "Record reference"}</button></div>
  </form>;
}

// Same lists as server/tenancy-origins.js (the server checks them): every reading names its unit, none is assumed.
const METER = { electricity: "Electricity", gas: "Gas", water: "Water", oil: "Oil", other: "Other" };
const UNIT = { kWh: "kWh", m3: "m³", ft3: "ft³", litres: "litres" };
const toForm = c => ({ rooms: c?.rooms.length ? c.rooms.map(r => ({ ...r })) : [{ name: "", observations: "" }],
  meter_readings: (c?.meter_readings ?? []).map(m => ({ ...m })), refs: (c?.evidence_refs ?? []).map(r => r.evidence_ref).join("\n") });

function EntryInventory({ id, current, onSaved }) {
  const [form, setForm] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const p = `ei${id}`, fe = useFieldErrors(p), ref = useRef(null);
  useEffect(() => { ref.current?.querySelector("[aria-invalid=true]")?.focus(); }, [fe.errors]);
  const edit = (list, i, k) => e => setForm(f => ({ ...f, [list]: f[list].map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }));
  const add = (list, row) => setForm(f => ({ ...f, [list]: [...f[list], row] }));
  const drop = (list, i) => setForm(f => ({ ...f, [list]: f[list].filter((_, j) => j !== i) }));
  const save = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null); fe.setErrors({});
    try {
      await api(`/admin/tenancies/${id}/entry-inventory`, { method: "PUT", body: { tenancy_id: id, expectedRevision: current?.revision ?? 0,
        rooms: form.rooms, meter_readings: form.meter_readings, evidence_refs: form.refs.split("\n").map(s => s.trim()).filter(Boolean) } });
      setForm(null); setMsg({ ok: true, text: "Entry inventory saved." }); await onSaved();
    } catch (x) { fe.setErrors(x.data?.fields || {}); setMsg({ text: x.message, stale: x.status === 409 }); }
    finally { setBusy(false); }
  };
  const input = (k, label, props) => <label>{label}<input id={`${p}-${k}`} autoComplete="off" {...fe.invalid(k)} {...props} />{fe.error(k)}</label>;
  const refErrors = Object.entries(fe.errors).filter(([k]) => k.startsWith("evidence_refs."))
    .map(([k, m]) => `Line ${Number(k.split(".")[1]) + 1}: ${m}`);
  const h = `h-${p}`;
  return <section aria-labelledby={h}>
    <h3 id={h}>Entry inventory</h3>
    {current ? <>
      <p className="muted">Revision {current.revision}, saved {fmtDate(current.updated_at)} by {current.updated_by}.</p>
      <ul className="plain-list">{current.rooms.map((r, i) => <li key={i}><span><strong>{r.name}</strong>
        {r.observations && <span className="muted cell-note">{r.observations}</span>}</span></li>)}</ul>
      {current.meter_readings.length > 0 && <p>{current.meter_readings.map(m => `${METER[m.meter]} ${m.reading} ${UNIT[m.unit]}`).join("; ")}</p>}
      {current.evidence_refs.length > 0 && <ul className="plain-list">{current.evidence_refs.map(r => <li key={r.evidence_ref}><span>{r.evidence_ref}
        <span className="muted cell-note">Checked by {r.reviewed_by} on {fmtDate(r.reviewed_at)}</span></span></li>)}</ul>}
    </> : <p className="muted">No entry inventory recorded yet.</p>}
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}
      {msg.stale && <> <button type="button" className="btn ghost sm" onClick={() => { setMsg({ ok: true,
        text: "The saved inventory is shown above; your entries are still in the form. Save again to replace it." }); onSaved(); }}>Reload</button></>}</p>}
    {!form ? <div className="inline"><button type="button" className="btn ghost sm" onClick={() => { setMsg(null); setForm(toForm(current)); }}>
      {current ? "Edit entry inventory" : "Record entry inventory"}</button></div>
      : <form ref={ref} className="view-form" onSubmit={save} noValidate aria-label="Entry inventory">
        {fe.error("rooms")}
        {form.rooms.map((r, i) => <fieldset key={i} className="choices-set"><legend>Room {i + 1}</legend><div className="grid2">
          {input(`rooms.${i}.name`, "Room", { value: r.name, maxLength: 80, onChange: edit("rooms", i, "name") })}
          <label>Observations (optional)<textarea id={`${p}-rooms.${i}.observations`} className="short" value={r.observations} maxLength={2000}
            onChange={edit("rooms", i, "observations")} {...fe.invalid(`rooms.${i}.observations`)} />{fe.error(`rooms.${i}.observations`)}</label></div>
          {form.rooms.length > 1 && <button type="button" className="btn ghost sm" onClick={() => drop("rooms", i)}>Remove<span className="sr"> room {i + 1}</span></button>}
        </fieldset>)}
        <div className="inline"><button type="button" className="btn ghost sm" onClick={() => add("rooms", { name: "", observations: "" })}>Add room</button></div>
        {fe.error("meter_readings")}
        {form.meter_readings.map((m, i) => <fieldset key={i} className="choices-set"><legend>Meter reading {i + 1}</legend><div className="grid2">
          <label>Meter<select id={`${p}-meter_readings.${i}.meter`} value={m.meter ?? ""} onChange={edit("meter_readings", i, "meter")}
            {...fe.invalid(`meter_readings.${i}.meter`)}><option value="">Choose the meter</option>
            {Object.entries(METER).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{fe.error(`meter_readings.${i}.meter`)}</label>
          {input(`meter_readings.${i}.reading`, "Reading", { value: m.reading ?? "", inputMode: "decimal", onChange: edit("meter_readings", i, "reading") })}
          <label>Unit<select id={`${p}-meter_readings.${i}.unit`} value={m.unit ?? ""} onChange={edit("meter_readings", i, "unit")}
            {...fe.invalid(`meter_readings.${i}.unit`)}><option value="">Choose the unit</option>
            {Object.entries(UNIT).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{fe.error(`meter_readings.${i}.unit`)}</label></div>
          <button type="button" className="btn ghost sm" onClick={() => drop("meter_readings", i)}>Remove<span className="sr"> meter reading {i + 1}</span></button>
        </fieldset>)}
        <div className="inline"><button type="button" className="btn ghost sm" onClick={() => add("meter_readings", { meter: "", reading: "", unit: "" })}>Add meter reading</button></div>
        <div className="field"><label>Evidence references (optional, one per line, up to 20)<textarea id={`${p}-evidence_refs`} className="short"
          value={form.refs} onChange={e => setForm(f => ({ ...f, refs: e.target.value }))} {...fe.invalid("evidence_refs")}
          aria-invalid={fe.errors.evidence_refs || refErrors.length ? true : undefined}
          aria-describedby={[`d-${p}-refs`, (fe.errors.evidence_refs || refErrors.length) && `e-${p}-refs`].filter(Boolean).join(" ")} />
          {(fe.errors.evidence_refs || refErrors.length > 0) && <small id={`e-${p}-refs`} className="err">{[fe.errors.evidence_refs, ...refErrors].filter(Boolean).join(" ")}</small>}</label>
          <small id={`d-${p}-refs`} className="muted">Where checked photos or documents are kept, like a folder name. The app does not receive, store or open them.</small></div>
        <div className="inline"><button className="btn sm" disabled={busy}>{busy ? "Saving…" : "Save entry inventory"}</button>
          <button type="button" className="btn ghost sm" onClick={() => { setForm(null); setMsg(null); fe.setErrors({}); }}>Cancel</button></div>
      </form>}
  </section>;
}
