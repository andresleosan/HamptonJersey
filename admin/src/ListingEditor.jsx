import { useEffect, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, OPERATION, USE, STATUS_LABEL, stateOf, fmtDate, safeHref } from "./format.js";
import MediaManager from "./MediaManager.jsx";
import Research from "./Research.jsx";
import { setUnsaved } from "./unsaved.js";

const FIELDS = ["title", "use", "property_type", "operation", "availability", "country", "location", "road_name", "bedrooms",
  "bathrooms", "tenure", "sale_price", "rent", "rent_period", "premium", "currency", "price_text", "summary", "description",
  "tour_url", "featured_rank", "specs"];
const NUMERIC = ["bedrooms", "bathrooms", "sale_price", "rent", "premium", "featured_rank"];
const toForm = l => Object.fromEntries(FIELDS.map(k => [k, k === "specs" ? l.specs : l[k] ?? ""]));
const toBody = f => Object.fromEntries(FIELDS.map(k => [k,
  NUMERIC.includes(k) ? (f[k] === "" ? null : Number(f[k]))
    : k === "specs" ? f.specs.filter(s => s.label.trim() || s.value.trim())
    : f[k] === "" ? null : f[k]]));
const SECTIONS = [["details", "Details"], ["price", "Price"], ["description", "Description"], ["photos", "Photos"],
  ["tour", "Tour and specification"], ["research", "Research"]];
const DONE = { publish: "Published: now on the website (may take a minute).", unpublish: "Unpublished: no longer on the website.",
  archive: "Archived. You can restore it from Archived.", restore: "Restored as a draft." };

export default function ListingEditor({ id }) {
  const [data, setData] = useState(null), [form, setForm] = useState(null), [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [loadErr, setLoadErr] = useState(null), [confirmDel, setConfirmDel] = useState("");
  const load = () => api(`/admin/listings/${id}`).then(d => { setData(d); setForm(toForm(d.listing)); setErrors({}); }, e => setLoadErr(e.message));
  useEffect(() => { load(); }, [id]);
  const dirty = !!data && !!form && JSON.stringify(toBody(form)) !== JSON.stringify(toBody(toForm(data.listing)));
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);
  useEffect(() => {
    const f = e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    addEventListener("beforeunload", f);
    return () => removeEventListener("beforeunload", f);
  }, [dirty]);

  if (loadErr) return <p role="alert" className="err">{loadErr} · <a href="#/">Back to listings</a></p>;
  if (!data) return <p>Loading listing…</p>;
  const l = data.listing, state = stateOf(l);
  const setListing = listing => { setData(d => ({ ...d, listing })); setForm(toForm(listing)); setErrors({}); };

  const save = async () => {
    setBusy(true); setMsg(null);
    try { setListing((await api(`/admin/listings/${id}`, { method: "PUT", body: { ...toBody(form), updated_at: l.updated_at } })).listing); setMsg({ ok: true, text: "Changes saved." }); }
    catch (e) { setErrors(e.data?.fields || {}); setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  const act = async action => {
    if (action === "archive" && !confirm("Archive this listing? It will leave the website; you can restore it later.")) return;
    setBusy(true); setMsg(null);
    try {
      setListing((await api(`/admin/listings/${id}/${action}`, { method: "POST" })).listing);
      setMsg({ ok: true, text: action === "publish" && !publicPhoto
        ? "Published, but it won't appear on the website until it has a visible photo." : DONE[action] });
    }
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
      <p className="muted">Edited {fmtDate(l.updated_at)} by {l.updated_by}</p>
      {l.published === 1 && !publicPhoto && <p className="warn" role="note">Published, but with no public photo: it won't appear on the website until it has one.</p>}
      {data.duplicates.length > 0 && <p className="warn" role="note">Possible duplicate of {data.duplicates.map((d, i) =>
        <span key={d}>{i ? ", " : ""}<a href={`#/p/${d}`}>{d}</a></span>)} according to the research.</p>}
      <nav aria-label="Listing sections">{SECTIONS.map(([k, t]) =>
        <button key={k} type="button" className="linkish" onClick={() => document.getElementById(`s-${k}`).scrollIntoView({ behavior: "smooth" })}>{t}</button>)}</nav>
      <a href="#/">← Back to listings</a>
    </aside>

    <div className="sections">
      <section id="s-details" className="card" aria-labelledby="h-details"><h2 id="h-details">Details</h2><div className="grid2">
        {field("title", "Title", <input {...ctl("title")} maxLength={200} required />)}
        {field("property_type", "Type (house, flat, restaurant…)", <input {...ctl("property_type")} maxLength={100} />)}
        {field("use", "Use", <select {...ctl("use")}>{options(USE)}</select>)}
        {field("operation", "Operation", <select {...ctl("operation")}>{options(OPERATION)}</select>)}
        {field("availability", "Availability", <select {...ctl("availability")}>{options(AVAILABILITY)}</select>)}
        {field("tenure", "Tenure", <input {...ctl("tenure")} maxLength={100} />)}
        {field("country", "Country", <input {...ctl("country")} maxLength={100} />)}
        {field("location", "Location", <input {...ctl("location")} maxLength={200} />)}
        {field("road_name", "Road", <input {...ctl("road_name")} maxLength={200} />)}
        {field("bedrooms", "Bedrooms", <input {...ctl("bedrooms")} type="number" min="0" max="100" step="1" inputMode="numeric" />)}
        {field("bathrooms", "Bathrooms", <input {...ctl("bathrooms")} type="number" min="0" max="100" step="1" inputMode="numeric" />)}
        {field("featured_rank", "Featured on the homepage (1 = first and in the hero; blank = not featured)",
          <input {...ctl("featured_rank")} type="number" min="1" max="99" step="1" inputMode="numeric" />)}
      </div></section>

      <section id="s-price" className="card" aria-labelledby="h-price"><h2 id="h-price">Price</h2>
        <p className="muted">Leave unknown values blank: 0 is never shown. Sale price, rent and business premium are kept separate.</p><div className="grid2">
        {form.operation === "sale" && field("sale_price", "Sale price", <input {...ctl("sale_price")} type="number" min="1" step="any" />)}
        {form.operation === "rent" && field("rent", "Rent", <input {...ctl("rent")} type="number" min="1" step="any" />)}
        {form.operation === "rent" && field("rent_period", "Period", <select {...ctl("rent_period")}><option value="">—</option><option value="month">Per month</option><option value="year">Per year</option></select>)}
        {form.operation === "business" && field("premium", "Business premium", <input {...ctl("premium")} type="number" min="1" step="any" />)}
        {field("currency", "Currency", <select {...ctl("currency")}><option value="">—</option><option value="GBP">GBP £</option><option value="EUR">EUR €</option></select>)}
        {field("price_text", "Displayed text (when there is no amount)", <input {...ctl("price_text")} maxLength={200} placeholder="e.g. Negotiable" />)}
      </div></section>

      <section id="s-description" className="card" aria-labelledby="h-desc"><h2 id="h-desc">Description</h2>
        {field("summary", "Summary (one bullet per line)", <textarea {...ctl("summary")} maxLength={5000} />)}
        {field("description", "Full description (one paragraph per line)", <textarea {...ctl("description")} maxLength={20000} rows={10} />)}
      </section>

      <section id="s-photos" className="card" aria-labelledby="h-photos"><h2 id="h-photos">Photos</h2>
        <MediaManager listingId={id} media={data.media} coverId={l.cover_media_id} updatedAt={l.updated_at}
          onChange={(media, coverId, saved) => setData(d => ({ ...d, media, listing: saved
            ? { ...d.listing, cover_media_id: saved.cover_media_id, updated_at: saved.updated_at, updated_by: saved.updated_by }
            : { ...d.listing, cover_media_id: coverId } }))} />
      </section>

      <section id="s-tour" className="card" aria-labelledby="h-tour"><h2 id="h-tour">Tour and specification</h2>
        {field("tour_url", "3D tour or video URL (https://)", <input {...ctl("tour_url")} type="url" maxLength={500} placeholder="https://my.matterport.com/show/?m=…" />)}
        <p className="muted">Embedded when it is Matterport, Vimeo (player.vimeo.com) or YouTube (youtube-nocookie.com); others are shown as a link. Only use your own tours or ones you have permission for.</p>
        <h3>Specification</h3>
        <Specs value={form.specs} onChange={specs => setForm(f => ({ ...f, specs }))} />
        {errors.specs && <p className="err">{errors.specs}</p>}
        {data.media.some(m => !m.r2_key && m.source_url) && <details><summary>Reference links from the research (not publishable without permission)</summary>
          <ul>{data.media.filter(m => !m.r2_key && m.source_url).map(m => <li key={m.id}>
            <a href={safeHref(m.source_url)} target="_blank" rel="noopener noreferrer">{m.label || m.source_url}</a> · {m.provider}</li>)}</ul></details>}
      </section>

      <section id="s-research" className="card" aria-labelledby="h-inv"><h2 id="h-inv">Research <span className="muted">(read only)</span></h2>
        <Research data={data} />
      </section>
    </div>

    <div className="actionbar" role="region" aria-label="Actions">
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
      <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</button>
      {state !== "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} title={dirty ? "Save first" : undefined}
        onClick={() => act(l.published ? "unpublish" : "publish")}>{l.published ? "Unpublish" : "Publish"}</button>}
      {state !== "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} onClick={() => act("archive")}>Archive</button>}
      {state === "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} title={dirty ? "Save first" : undefined} onClick={() => act("restore")}>Restore</button>}
      {state === "archived" && <form className="inline" onSubmit={destroy}>
        <label htmlFor="del-confirm">To delete permanently, type {l.id}</label>
        <input id="del-confirm" value={confirmDel} onChange={e => setConfirmDel(e.target.value)} autoComplete="off" />
        <button className="btn ghost danger" disabled={confirmDel !== l.id || busy}>Delete permanently</button></form>}
      {dirty && <span className="muted">Unsaved changes</span>}
    </div>
  </div>;
}

function Specs({ value, onChange }) {
  const upd = (i, k, v) => onChange(value.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return <div className="specs-ed">
    {value.map((s, i) => <div className="spec-row" key={i}>
      <input aria-label={`Group, row ${i + 1}`} placeholder="Group (Interior…)" value={s.group} maxLength={60} onChange={e => upd(i, "group", e.target.value)} />
      <input aria-label={`Label, row ${i + 1}`} placeholder="Label (Heating…)" value={s.label} maxLength={100} onChange={e => upd(i, "label", e.target.value)} />
      <input aria-label={`Value, row ${i + 1}`} placeholder="Value" value={s.value} maxLength={300} onChange={e => upd(i, "value", e.target.value)} />
      <button type="button" className="btn ghost sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove<span className="sr"> row {i + 1}</span></button>
    </div>)}
    <button type="button" className="btn ghost sm" onClick={() => onChange([...value, { group: "", label: "", value: "" }])}>Add row</button>
  </div>;
}
