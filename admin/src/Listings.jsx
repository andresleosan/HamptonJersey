import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, OPERATION, USE, STATUS_LABEL, stateOf, priceText, fmtDate } from "./format.js";

const TABS = [["published", "Publicadas"], ["draft", "Borradores"], ["archived", "Archivadas"], ["all", "Todas"]];
const REGIONS = { jersey: "Jersey", uk: "Reino Unido", international: "Internacional" };
const regionOf = c => (c === "Jersey" ? "jersey" : c === "United Kingdom" ? "uk" : "international");

export default function Listings() {
  const [rows, setRows] = useState(null), [error, setError] = useState(null), [creating, setCreating] = useState(false);
  const [tab, setTab] = useState("published"), [q, setQ] = useState(""), [use, setUse] = useState(""),
    [region, setRegion] = useState(""), [avail, setAvail] = useState("");
  useEffect(() => { api("/admin/listings").then(d => setRows(d.listings), e => setError(e.message)); }, []);
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) =>
    [k, (rows || []).filter(l => k === "all" || stateOf(l) === k).length])), [rows]);
  if (error) return <p role="alert" className="err">{error}</p>;
  if (!rows) return <p>Cargando propiedades…</p>;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(l => (tab === "all" || stateOf(l) === tab) && (!use || l.use === use)
    && (!region || regionOf(l.country) === region) && (!avail || l.availability === avail)
    && (!needle || `${l.id} ${l.title} ${l.location ?? ""}`.toLowerCase().includes(needle)));

  return <section aria-labelledby="t-props">
    <div className="head"><h1 id="t-props">Propiedades</h1>
      <button type="button" className="btn" onClick={() => setCreating(true)}>Nueva propiedad</button></div>
    {creating && <NewListing onClose={() => setCreating(false)} />}
    <div className="seg" role="group" aria-label="Estado">{TABS.map(([k, t]) =>
      <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{t}<span className="count">{counts[k]}</span></button>)}</div>
    <div className="filters">
      <label>Buscar<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Título, HE-R001 o localidad" /></label>
      <label>Uso<select value={use} onChange={e => setUse(e.target.value)}><option value="">Todos</option>
        {Object.entries(USE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Región<select value={region} onChange={e => setRegion(e.target.value)}><option value="">Todas</option>
        {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Disponibilidad<select value={avail} onChange={e => setAvail(e.target.value)}><option value="">Todas</option>
        {Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    </div>
    <p className="muted" aria-live="polite">{shown.length} {shown.length === 1 ? "propiedad" : "propiedades"}</p>
    {shown.length ? <table className="list">
      <thead><tr><th scope="col"><span className="sr">Foto</span></th><th scope="col">Propiedad</th><th scope="col">Ubicación</th>
        <th scope="col">Precio</th><th scope="col">Disponibilidad</th><th scope="col">Visibilidad</th><th scope="col">Última edición</th></tr></thead>
      <tbody>{shown.map(l => <tr key={l.id}>
        <td>{l.cover_id ? <img className="thumb" src={`/media/${l.cover_id}?thumb`} alt="" loading="lazy" /> : <span className="thumb" />}</td>
        <td><a href={`#/p/${l.id}`}>{l.title}</a><div className="muted">{l.id} · {OPERATION[l.operation]}</div></td>
        <td>{l.location || l.country || "—"}</td>
        <td className="num">{priceText(l)}</td>
        <td>{AVAILABILITY[l.availability]}</td>
        <td><span className={`badge ${stateOf(l)}`}>{STATUS_LABEL[stateOf(l)]}</span></td>
        <td className="muted">{fmtDate(l.updated_at)}<br />{l.updated_by}</td>
      </tr>)}</tbody>
    </table> : <p className="empty">No hay propiedades con estos filtros.</p>}
  </section>;
}

function NewListing({ onClose }) {
  const [f, setF] = useState({ title: "", use: "residential", operation: "sale", availability: "for_sale", country: "Jersey" });
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const { id } = await api("/admin/listings", { method: "POST", body: f }); location.hash = `#/p/${id}`; }
    catch (x) { setErr(x.data?.fields ? Object.entries(x.data.fields).map(([k, v]) => `${k}: ${v}`).join(". ") : x.message); setBusy(false); }
  };
  return <form className="card new" onSubmit={submit} aria-labelledby="t-new">
    <h2 id="t-new">Nueva propiedad (borrador)</h2>
    <label>Título<input required maxLength={200} value={f.title} onChange={set("title")} autoFocus /></label>
    <div className="filters">
      <label>Uso<select value={f.use} onChange={set("use")}>{Object.entries(USE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Operación<select value={f.operation} onChange={set("operation")}>{Object.entries(OPERATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Disponibilidad<select value={f.availability} onChange={set("availability")}>{Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>País<input value={f.country} onChange={set("country")} maxLength={100} /></label>
    </div>
    {err && <p role="alert" className="err">{err}</p>}
    <div className="filters"><button className="btn" disabled={busy}>{busy ? "Creando…" : "Crear borrador"}</button>
      <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
  </form>;
}
