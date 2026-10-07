import { useEffect, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, OPERATION, USE, STATUS_LABEL, stateOf, fmtDate, safeHref } from "./format.js";
import MediaManager from "./MediaManager.jsx";
import Research from "./Research.jsx";

const FIELDS = ["title", "use", "property_type", "operation", "availability", "country", "location", "road_name", "bedrooms",
  "bathrooms", "tenure", "sale_price", "rent", "rent_period", "premium", "currency", "price_text", "summary", "description",
  "tour_url", "specs"];
const NUMERIC = ["bedrooms", "bathrooms", "sale_price", "rent", "premium"];
const toForm = l => Object.fromEntries(FIELDS.map(k => [k, k === "specs" ? l.specs : l[k] ?? ""]));
const toBody = f => Object.fromEntries(FIELDS.map(k => [k,
  NUMERIC.includes(k) ? (f[k] === "" ? null : Number(f[k]))
    : k === "specs" ? f.specs.filter(s => s.label.trim() || s.value.trim())
    : f[k] === "" ? null : f[k]]));
const SECTIONS = [["datos", "Datos"], ["precio", "Precio"], ["descripcion", "Descripción"], ["fotos", "Fotos"],
  ["tour", "Tour y especificación"], ["investigacion", "Investigación"]];
const DONE = { publish: "Publicada: ya se ve en la web (puede tardar 1 minuto).", unpublish: "Despublicada: ya no se ve en la web.",
  archive: "Archivada. Puedes restaurarla desde Archivadas.", restore: "Restaurada como borrador." };

export default function ListingEditor({ id }) {
  const [data, setData] = useState(null), [form, setForm] = useState(null), [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [loadErr, setLoadErr] = useState(null), [confirmDel, setConfirmDel] = useState("");
  const load = () => api(`/admin/listings/${id}`).then(d => { setData(d); setForm(toForm(d.listing)); setErrors({}); }, e => setLoadErr(e.message));
  useEffect(() => { load(); }, [id]);
  const dirty = !!data && !!form && JSON.stringify(toBody(form)) !== JSON.stringify(toBody(toForm(data.listing)));
  useEffect(() => {
    const f = e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", f);
    return () => removeEventListener("beforeunload", f);
  }, [dirty]);

  if (loadErr) return <p role="alert" className="err">{loadErr} · <a href="#/">Volver al listado</a></p>;
  if (!data) return <p>Cargando ficha…</p>;
  const l = data.listing, state = stateOf(l);
  const setListing = listing => { setData(d => ({ ...d, listing })); setForm(toForm(listing)); setErrors({}); };

  const save = async () => {
    setBusy(true); setMsg(null);
    try { setListing((await api(`/admin/listings/${id}`, { method: "PUT", body: { ...toBody(form), updated_at: l.updated_at } })).listing); setMsg({ ok: true, text: "Cambios guardados." }); }
    catch (e) { setErrors(e.data?.fields || {}); setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  const act = async action => {
    if (action === "archive" && !confirm("¿Archivar esta ficha? Saldrá de la web; podrás restaurarla.")) return;
    setBusy(true); setMsg(null);
    try { setListing((await api(`/admin/listings/${id}/${action}`, { method: "POST" })).listing); setMsg({ ok: true, text: DONE[action] }); }
    catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  const destroy = async e => {
    e.preventDefault(); setBusy(true);
    try { await api(`/admin/listings/${id}`, { method: "DELETE", body: { confirm: confirmDel } }); location.hash = "#/"; }
    catch (x) { setMsg({ text: x.message }); setBusy(false); }
  };

  const ctl = (k, extra = {}) => ({
    id: `f-${k}`, value: form[k], "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `e-${k}` : undefined,
    onChange: e => setForm(f => ({ ...f, [k]: e.target.value })), ...extra });
  const field = (k, label, input) => <div className="field" key={k}><label htmlFor={`f-${k}`}>{label}</label>{input}
    {errors[k] && <small id={`e-${k}`} className="err">{errors[k]}</small>}</div>;
  const options = obj => Object.entries(obj).map(([k, v]) => <option key={k} value={k}>{v}</option>);
  const publicPhoto = data.media.some(m => m.public && m.kind === "photo" && m.r2_key && m.origin !== "external");
  const cover = data.media.find(m => m.id === l.cover_media_id) || data.media.find(m => m.kind === "photo" && m.r2_key);

  return <div className="editor">
    <aside className="side card">
      {cover ? <img src={`/media/${cover.id}?thumb`} alt="" /> : <div className="thumb big" />}
      <h1>{l.title}</h1>
      <p className="muted">{l.id} · <span className={`badge ${state}`}>{STATUS_LABEL[state]}</span></p>
      <p className="muted">Editada {fmtDate(l.updated_at)} por {l.updated_by}</p>
      {l.published === 1 && !publicPhoto && <p className="warn" role="note">Publicada, pero sin foto pública: no aparece en la web hasta que tenga una.</p>}
      {data.duplicates.length > 0 && <p className="warn" role="note">Posible duplicado de {data.duplicates.map((d, i) =>
        <span key={d}>{i ? ", " : ""}<a href={`#/p/${d}`}>{d}</a></span>)} según la investigación.</p>}
      <nav aria-label="Secciones de la ficha">{SECTIONS.map(([k, t]) =>
        <button key={k} type="button" className="linkish" onClick={() => document.getElementById(`s-${k}`).scrollIntoView({ behavior: "smooth" })}>{t}</button>)}</nav>
      <a href="#/">← Volver al listado</a>
    </aside>

    <div className="sections">
      <section id="s-datos" className="card" aria-labelledby="h-datos"><h2 id="h-datos">Datos</h2><div className="grid2">
        {field("title", "Título", <input {...ctl("title")} maxLength={200} required />)}
        {field("property_type", "Tipo (casa, piso, restaurante…)", <input {...ctl("property_type")} maxLength={100} />)}
        {field("use", "Uso", <select {...ctl("use")}>{options(USE)}</select>)}
        {field("operation", "Operación", <select {...ctl("operation")}>{options(OPERATION)}</select>)}
        {field("availability", "Disponibilidad", <select {...ctl("availability")}>{options(AVAILABILITY)}</select>)}
        {field("tenure", "Tenencia", <input {...ctl("tenure")} maxLength={100} />)}
        {field("country", "País", <input {...ctl("country")} maxLength={100} />)}
        {field("location", "Localidad", <input {...ctl("location")} maxLength={200} />)}
        {field("road_name", "Calle", <input {...ctl("road_name")} maxLength={200} />)}
        {field("bedrooms", "Dormitorios", <input {...ctl("bedrooms")} type="number" min="0" max="100" step="1" inputMode="numeric" />)}
        {field("bathrooms", "Baños", <input {...ctl("bathrooms")} type="number" min="0" max="100" step="1" inputMode="numeric" />)}
      </div></section>

      <section id="s-precio" className="card" aria-labelledby="h-precio"><h2 id="h-precio">Precio</h2>
        <p className="muted">Deja vacío lo que no se conozca: nunca se muestra 0. Venta, alquiler y premium no se mezclan.</p><div className="grid2">
        {form.operation === "sale" && field("sale_price", "Precio de venta", <input {...ctl("sale_price")} type="number" min="1" step="any" />)}
        {form.operation === "rent" && field("rent", "Alquiler", <input {...ctl("rent")} type="number" min="1" step="any" />)}
        {form.operation === "rent" && field("rent_period", "Periodo", <select {...ctl("rent_period")}><option value="">—</option><option value="month">Al mes</option><option value="year">Al año</option></select>)}
        {form.operation === "business" && field("premium", "Premium del negocio", <input {...ctl("premium")} type="number" min="1" step="any" />)}
        {field("currency", "Moneda", <select {...ctl("currency")}><option value="">—</option><option value="GBP">GBP £</option><option value="EUR">EUR €</option></select>)}
        {field("price_text", "Texto mostrado (si no hay importe)", <input {...ctl("price_text")} maxLength={200} placeholder="p. ej. Negotiable" />)}
      </div></section>

      <section id="s-descripcion" className="card" aria-labelledby="h-desc"><h2 id="h-desc">Descripción</h2>
        {field("summary", "Resumen (una viñeta por línea)", <textarea {...ctl("summary")} maxLength={5000} />)}
        {field("description", "Descripción larga (un párrafo por línea)", <textarea {...ctl("description")} maxLength={20000} rows={10} />)}
      </section>

      <section id="s-fotos" className="card" aria-labelledby="h-fotos"><h2 id="h-fotos">Fotos</h2>
        <MediaManager listingId={id} media={data.media} coverId={l.cover_media_id} updatedAt={l.updated_at}
          onChange={(media, coverId, saved) => setData(d => ({ ...d, media, listing: saved
            ? { ...d.listing, cover_media_id: saved.cover_media_id, updated_at: saved.updated_at, updated_by: saved.updated_by }
            : { ...d.listing, cover_media_id: coverId } }))} />
      </section>

      <section id="s-tour" className="card" aria-labelledby="h-tour"><h2 id="h-tour">Tour y especificación</h2>
        {field("tour_url", "URL del tour 3D o vídeo (https://)", <input {...ctl("tour_url")} type="url" maxLength={500} placeholder="https://my.matterport.com/show/?m=…" />)}
        <p className="muted">Se incrusta si es de Matterport, Vimeo (player.vimeo.com) o YouTube (youtube-nocookie.com); otros se muestran como enlace. Usa solo tours vuestros o con permiso.</p>
        <h3>Especificación</h3>
        <Specs value={form.specs} onChange={specs => setForm(f => ({ ...f, specs }))} />
        {errors.specs && <p className="err">{errors.specs}</p>}
        {data.media.some(m => !m.r2_key && m.source_url) && <details><summary>Enlaces de referencia de la investigación (no publicables sin permiso)</summary>
          <ul>{data.media.filter(m => !m.r2_key && m.source_url).map(m => <li key={m.id}>
            <a href={safeHref(m.source_url)} target="_blank" rel="noopener noreferrer">{m.label || m.source_url}</a> · {m.provider}</li>)}</ul></details>}
      </section>

      <section id="s-investigacion" className="card" aria-labelledby="h-inv"><h2 id="h-inv">Investigación <span className="muted">(solo lectura)</span></h2>
        <Research data={data} />
      </section>
    </div>

    <div className="actionbar" role="region" aria-label="Acciones">
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
      <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>{busy ? "Guardando…" : "Guardar"}</button>
      {state !== "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} title={dirty ? "Guarda primero" : undefined}
        onClick={() => act(l.published ? "unpublish" : "publish")}>{l.published ? "Despublicar" : "Publicar"}</button>}
      {state !== "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} onClick={() => act("archive")}>Archivar</button>}
      {state === "archived" && <button type="button" className="btn ghost" disabled={busy} onClick={() => act("restore")}>Restaurar</button>}
      {state === "archived" && <form className="inline" onSubmit={destroy}>
        <label htmlFor="del-confirm">Para borrar para siempre, escribe {l.id}</label>
        <input id="del-confirm" value={confirmDel} onChange={e => setConfirmDel(e.target.value)} autoComplete="off" />
        <button className="btn ghost danger" disabled={confirmDel !== l.id || busy}>Borrar definitivamente</button></form>}
      {dirty && <span className="muted">Cambios sin guardar</span>}
    </div>
  </div>;
}

function Specs({ value, onChange }) {
  const upd = (i, k, v) => onChange(value.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return <div className="specs-ed">
    {value.map((s, i) => <div className="spec-row" key={i}>
      <input aria-label={`Grupo, fila ${i + 1}`} placeholder="Grupo (Interior…)" value={s.group} maxLength={60} onChange={e => upd(i, "group", e.target.value)} />
      <input aria-label={`Dato, fila ${i + 1}`} placeholder="Dato (Calefacción…)" value={s.label} maxLength={100} onChange={e => upd(i, "label", e.target.value)} />
      <input aria-label={`Valor, fila ${i + 1}`} placeholder="Valor" value={s.value} maxLength={300} onChange={e => upd(i, "value", e.target.value)} />
      <button type="button" className="btn ghost sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>Quitar<span className="sr"> fila {i + 1}</span></button>
    </div>)}
    <button type="button" className="btn ghost sm" onClick={() => onChange([...value, { group: "", label: "", value: "" }])}>Añadir fila</button>
  </div>;
}
