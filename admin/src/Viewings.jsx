import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

const TABS = { new: "Nuevas", contacted: "Contactadas", closed: "Cerradas" };
const ONE = { new: "Nueva", contacted: "Contactada", closed: "Cerrada" };

export default function Viewings() {
  const [status, setStatus] = useState("new"), [data, setData] = useState(null), [counts, setCounts] = useState({}), [msg, setMsg] = useState(null);
  const load = () => api(`/admin/viewings?status=${status}`).then(d => { setData(d); setCounts(d.counts); }, e => setMsg(e.message));
  useEffect(() => { setData(null); load(); }, [status]);
  const change = async (v, s) => { try { await api(`/admin/viewings/${v.id}`, { method: "PUT", body: { status: s } }); load(); } catch (e) { setMsg(e.message); } };
  const remove = async v => {
    if (!confirm(`¿Borrar la solicitud de ${v.name}? No se puede deshacer.`)) return;
    try { await api(`/admin/viewings/${v.id}`, { method: "DELETE" }); load(); } catch (e) { setMsg(e.message); }
  };
  return <section aria-labelledby="t-views">
    <h1 id="t-views">Solicitudes de visita</h1>
    <div className="seg" role="group" aria-label="Estado">{Object.entries(TABS).map(([k, t]) =>
      <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}>{t}<span className="count">{counts[k] ?? ""}</span></button>)}</div>
    {msg && <p role="alert" className="err">{msg}</p>}
    {!data ? <p>Cargando…</p> : !data.viewings.length ? <p className="empty">No hay solicitudes {TABS[status].toLowerCase()}.</p> :
      <table className="list">
        <thead><tr><th scope="col">Recibida</th><th scope="col">Propiedad</th><th scope="col">Visita</th><th scope="col">Contacto</th><th scope="col">Estado</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
        <tbody>{data.viewings.map(v => <tr key={v.id}>
          <td className="muted">{fmtDate(v.created_at)}</td>
          <td>{v.listing_id ? <a href={`#/p/${v.listing_id}`}>{v.listing_title || v.listing_id}</a> : "Consulta general / tasación"}</td>
          <td className="num">{v.date} · {v.time}<div className="muted">{v.kind}{v.agent ? ` · con ${v.agent}` : ""}</div></td>
          <td>{v.name}<div><a href={`mailto:${v.email}`}>{v.email}</a>{v.phone && <> · <a href={`tel:${v.phone.replace(/[^\d+]/g, "")}`}>{v.phone}</a></>}</div></td>
          <td><select aria-label={`Estado de la solicitud de ${v.name}`} value={v.status} onChange={e => change(v, e.target.value)}>
            {Object.entries(ONE).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
          <td><button type="button" className="btn ghost sm danger" onClick={() => remove(v)}>Borrar</button></td>
        </tr>)}</tbody>
      </table>}
  </section>;
}
