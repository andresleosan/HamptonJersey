import { useState } from "react";
import { api } from "./api.js";
import { KIND, safeHref } from "./format.js";
import { resizeImage } from "./image.js";

const pick = m => ({ id: m.id, public: !!m.public, kind: m.kind, label: m.label ?? "" });

export default function MediaManager({ listingId, media, coverId, updatedAt, onChange }) {
  const [saved, setSaved] = useState(media);         // last state the server confirmed
  const [items, setItems] = useState(media), [cover, setCover] = useState(coverId);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [drag, setDrag] = useState(null);
  const visual = items.filter(m => m.r2_key), links = items.filter(m => !m.r2_key);
  const dirty = JSON.stringify(items.map(pick)) !== JSON.stringify(saved.map(pick)) || cover !== coverId;

  const move = (from, to) => {
    if (from == null || to < 0 || to >= visual.length || from === to) return;
    const v = [...visual]; const [x] = v.splice(from, 1); v.splice(to, 0, x);
    setItems([...v, ...links]);
  };
  const patch = (id, p) => setItems(list => list.map(m => (m.id === id ? { ...m, ...p } : m)));
  const commit = (list, c, listing) => { setSaved(list); setItems(list); onChange(list, c, listing); };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const body = { items: items.map((m, i) => ({ id: m.id, position: i, public: !!m.public, kind: m.kind, label: m.label ?? "" })),
        cover_media_id: cover ?? null, updated_at: updatedAt };
      const r = await api(`/admin/listings/${listingId}/media`, { method: "PUT", body });
      commit(r.media, cover ?? null, r.listing);
      setMsg({ ok: true, text: "Photos saved." });
    } catch (e) { setMsg({ text: e.message }); } finally { setBusy(false); }
  };

  const upload = async files => {
    setBusy(true); setMsg(null);
    const added = [], failed = [];
    for (const file of files) {
      try {
        if (file.size > 40 * 1024 * 1024) throw new Error("is larger than 40 MB");
        const [big, small] = await Promise.all([resizeImage(file, 1600), resizeImage(file, 640, 0.8)]);
        const form = new FormData();
        form.append("file", big.blob, "photo.jpg"); form.append("thumb", small.blob, "thumb.jpg");
        form.append("label", file.name.replace(/\.[^.]+$/, "")); form.append("kind", "photo");
        form.append("width", big.width); form.append("height", big.height);
        added.push((await api(`/admin/listings/${listingId}/media`, { method: "POST", form })).media);
      } catch (e) { failed.push(`${file.name}: ${e.message}`); }
    }
    if (added.length) {
      // New uploads are saved server-side; keep any unsaved local reorder on top of them.
      setItems(list => [...list.filter(m => m.r2_key), ...added, ...list.filter(m => !m.r2_key)]);
      setSaved(list => [...list, ...added]);
      onChange([...saved, ...added], coverId);
    }
    setMsg(failed.length ? { text: `Not uploaded: ${failed.join(" · ")}` } : { ok: true, text: `${added.length} photo(s) uploaded.` });
    setBusy(false);
  };

  const remove = async m => {
    if (!confirm(`Delete "${m.label || m.id}"? This can't be undone.`)) return;
    try {
      await api(`/admin/media/${m.id}`, { method: "DELETE" });
      const keep = saved.filter(x => x.id !== m.id);
      setItems(list => list.filter(x => x.id !== m.id)); setSaved(keep);
      const c = cover === m.id ? null : cover; setCover(c); onChange(keep, c);
    } catch (e) { setMsg({ text: e.message }); }
  };

  return <div className="media">
    <p className="muted">Drag to reorder (or use ↑ ↓). Only Hampton photos and photos uploaded here can appear on the website; external ones are a private reference.</p>
    <ol className="media-grid">{visual.map((m, i) => <li key={m.id} draggable
      onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()} onDrop={() => { move(drag, i); setDrag(null); }}
      className={m.id === cover ? "is-cover" : undefined}>
      <div className="ph">
        {m.content_type === "application/pdf"
          ? <a className="doc" href={`/media/${m.id}`} target="_blank" rel="noopener noreferrer">PDF · open</a>
          : <img src={`/media/${m.id}?thumb`} alt={m.label || ""} loading="lazy" />}
        {m.id === cover && <span className="tag">Cover</span>}
        {m.origin === "external" && <span className="tag priv">Private · reference</span>}
      </div>
      <input aria-label={`Caption for photo ${i + 1}`} value={m.label ?? ""} maxLength={200} onChange={e => patch(m.id, { label: e.target.value })} />
      <div className="ctl">
        <button type="button" className="btn ghost sm" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`}>↑</button>
        <button type="button" className="btn ghost sm" onClick={() => move(i, i + 1)} disabled={i === visual.length - 1} aria-label={`Move photo ${i + 1} later`}>↓</button>
        <select aria-label={`Type of photo ${i + 1}`} value={m.kind} onChange={e => patch(m.id, { kind: e.target.value })}>
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="ctl">
        {m.origin !== "external" && <label className="check"><input type="checkbox" checked={!!m.public} onChange={e => patch(m.id, { public: e.target.checked ? 1 : 0 })} /> Visible on the website</label>}
        {m.origin !== "external" && m.kind === "photo" && <label className="check"><input type="radio" name="cover" checked={m.id === cover} onChange={() => setCover(m.id)} /> Cover</label>}
        {m.origin === "upload" && <button type="button" className="btn ghost sm danger" onClick={() => remove(m)}>Delete</button>}
      </div>
    </li>)}</ol>
    {!visual.length && <p className="empty">No photos yet.</p>}
    {links.length > 0 && <details><summary>{links.length} reference link(s), not downloaded</summary>
      <ul>{links.map(m => <li key={m.id}><a href={safeHref(m.source_url)} target="_blank" rel="noopener noreferrer">{m.label || m.source_url}</a> · {m.provider}</li>)}</ul></details>}
    <div className="filters">
      <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>Save photos</button>
      <label className="btn ghost upload">Upload photos
        <input className="sr" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy}
          onChange={e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) upload(f); }} /></label>
      {busy && <span className="muted">Working…</span>}
      {dirty && <span className="muted">Unsaved order or visibility</span>}
    </div>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </div>;
}
