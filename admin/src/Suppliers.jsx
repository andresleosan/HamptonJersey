import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Modal } from "./Sales.jsx";
import { useForm } from "./RentalDialogs.jsx";

// ADM-12 (its switch): the suppliers repairs go to, with their contact. An archived one is no longer offered for a
// repair but stays on the repairs that have it. Opened from a property's Repairs; closing reloads the page if anything
// was saved.
export function Suppliers({ onClose, onDone }) {
  const [list, setList] = useState(null), [loadErr, setLoadErr] = useState(null), [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null), [saved, setSaved] = useState(0); // saves so far: also a fresh form after each
  const load = () => api("/admin/suppliers").then(d => { setList(d.suppliers); setLoadErr(null); }, e => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  const close = () => (saved ? onDone("Suppliers saved.") : onClose());
  const done = text => { setMsg(text); setSaved(n => n + 1); setEdit(null); load(); };
  return <Modal title="Suppliers" onClose={close}>
    {msg && <p role="status" className="ok">{msg}</p>}
    {loadErr && <p role="alert" className="err">{loadErr}</p>}
    {!list ? !loadErr && <p>Loading suppliers…</p> : list.length ? <ul className="plain-list" id="suppliers">{list.map(s => <li key={s.id}>
      <span><strong>{s.name}</strong><span className="meta">{[s.trade, s.phone, s.email].filter(Boolean).map((x, i) => <span key={i}>{x}</span>)}</span></span>
      <span className="ctl">{s.archived_at && <span className="badge neutral">Archived</span>}
        <button type="button" className="btn ghost sm" onClick={() => { setMsg(null); setEdit(s); }}>Edit<span className="sr"> {s.name}</span></button></span>
    </li>)}</ul> : <p className="muted">No suppliers yet.</p>}
    <SupplierForm key={`${edit?.id ?? "new"}-${saved}`} supplier={edit} onDone={done} onRefused={load} onCancel={edit ? () => setEdit(null) : close} />
  </Modal>;
}

function SupplierForm({ supplier: s, onDone, onRefused, onCancel }) {
  const a = useForm("sp", { name: s?.name ?? "", trade: s?.trade ?? "", phone: s?.phone ?? "", email: s?.email ?? "",
    archived: !!s?.archived_at }, async f => {
    const body = { name: f.name.trim() || null, trade: f.trade.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null,
      ...(s ? { archived: f.archived, updated_at: s.updated_at } : {}) };
    await api(s ? `/admin/suppliers/${s.id}` : "/admin/suppliers", { method: s ? "PUT" : "POST", body });
    return s ? `Supplier saved: ${body.name}.` : `Supplier added: ${body.name}.`;
  }, onDone, onRefused);
  return <form ref={a.ref} className="sheet-form" onSubmit={a.submit} noValidate aria-labelledby="h-supplier-form">
    <h3 id="h-supplier-form">{s ? `Edit ${s.name}` : "New supplier"}</h3>
    <div className="grid2">{a.field("name", "Name", { maxLength: 120, placeholder: "e.g. Island Plumbing" })}
      {a.field("trade", "Trade (optional)", { maxLength: 60, placeholder: "e.g. Plumbing" })}</div>
    <div className="grid2">{a.field("phone", "Phone (optional)", { type: "tel", maxLength: 120 })}
      {a.field("email", "Email (optional)", { type: "email", maxLength: 120 })}</div>
    {s && <label className="check"><input type="checkbox" checked={a.f.archived} onChange={a.set("archived")} />Archived: no longer
      offered for new repairs</label>}
    {a.err && <p role="alert" className="err">{a.err}</p>}
    <div className="inline"><button className="btn">{a.busy ? "Saving…" : s ? "Save supplier" : "Add supplier"}</button>
      <button type="button" className="btn ghost" onClick={onCancel}>{s ? "Cancel" : "Close"}</button></div>
  </form>;
}
