import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { KIND, safeHref } from "./format.js";
import { resizeImage } from "./image.js";

const pick = m => ({ id: m.id, public: !!m.public, kind: m.kind, label: m.label ?? "" });

// The editor's action bar saves photos together with the fields: `register` hands it { dirty, save, discard }.
export default function MediaManager({ listingId, media, coverId, updatedAt, onChange, register }) {
  const [saved, setSaved] = useState(media);         // last state the server confirmed
  const [items, setItems] = useState(media), [cover, setCover] = useState(coverId);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [drag, setDrag] = useState(null), [over, setOver] = useState(false);
  const visual = items.filter(m => m.r2_key), links = items.filter(m => !m.r2_key);
  const latest = useRef(); latest.current = { saved, coverId }; // read after awaits, so uploads/deletes never use stale lists
  const dirty = JSON.stringify(items.map(pick)) !== JSON.stringify(saved.map(pick)) || cover !== coverId;

  const move = (from, to) => {
    if (from == null || to < 0 || to >= visual.length || from === to) return;
    const v = [...visual]; const [x] = v.splice(from, 1); v.splice(to, 0, x);
    setItems([...v, ...links]);
  };
  const patch = (id, p) => setItems(list => list.map(m => (m.id === id ? { ...m, ...p } : m)));
  const commit = (list, c, listing) => { setSaved(list); setItems(list); onChange(list, c, listing); };

  // Returns true when saved; `at` is the listing's updated_at when the fields were saved just before.
  const save = async (at = updatedAt) => {
    setBusy(true); setMsg(null);
    try {
      const body = { items: items.map((m, i) => ({ id: m.id, position: i, public: !!m.public, kind: m.kind, label: m.label ?? "" })),
        cover_media_id: cover ?? null, updated_at: at };
      const r = await api(`/admin/listings/${listingId}/media`, { method: "PUT", body });
      commit(r.media, cover ?? null, r.listing);
      return true;
    } catch (e) { setMsg({ text: `Photos: ${e.message}` }); return false; } finally { setBusy(false); }
  };
  const discard = () => { setItems(saved); setCover(coverId); setMsg(null); };
  useEffect(() => { register?.({ dirty, save, discard }); }, [dirty, items, cover, updatedAt, saved]);

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
      // New uploads are saved server-side (last position, as here); any unsaved local reorder is kept.
      const next = [...latest.current.saved, ...added];
      setItems(list => [...list, ...added]); setSaved(next);
      onChange(next, latest.current.coverId);
    }
    setMsg(failed.length ? { text: `Not uploaded: ${failed.join(" · ")}` } : { ok: true, text: `${added.length} photo(s) uploaded.` });
    setBusy(false);
  };

  const remove = async m => {
    if (!confirm(`Delete "${m.label || m.id}"? This can't be undone.`)) return;
    try {
      await api(`/admin/media/${m.id}`, { method: "DELETE" });
      const { saved: s, coverId: c } = latest.current, keep = s.filter(x => x.id !== m.id);
      setItems(list => list.filter(x => x.id !== m.id)); setSaved(keep);
      if (cover === m.id) setCover(null);
      onChange(keep, c === m.id ? null : c); // an unsaved cover pick stays unsaved
    } catch (e) { setMsg({ text: e.message }); }
  };

  return <div className="media">
    <p className="muted">Drag to reorder (or use ↑ ↓). Only Hampton photos and photos uploaded here can appear on the website; external ones are a private reference.</p>
    <ol className="media-grid">{visual.map((m, i) => <li key={m.id} draggable
      onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) { if (!busy) upload([...e.dataTransfer.files]); } else move(drag, i); setDrag(null); }}
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
      </div>
      <div className="ctl">
        {m.origin !== "external" && <label className="check"><input type="checkbox" checked={!!m.public} onChange={e => patch(m.id, { public: e.target.checked ? 1 : 0 })} /> Visible on the website</label>}
        {m.origin !== "external" && m.kind === "photo" && <label className="check"><input type="radio" name="cover" checked={m.id === cover} onChange={() => setCover(m.id)} /> Cover</label>}
      </div>
      <details className="more"><summary>More<span className="sr"> for photo {i + 1}</span></summary><div className="ctl">
        <select aria-label={`Type of photo ${i + 1}`} value={m.kind} onChange={e => patch(m.id, { kind: e.target.value })}>
          {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {m.origin === "upload" && <button type="button" className="btn ghost sm danger" disabled={busy} onClick={() => remove(m)}>Delete</button>}
      </div></details>
    </li>)}</ol>

    {links.length > 0 && <details><summary>{links.length} reference link(s), not downloaded</summary>
      <ul>{links.map(m => <li key={m.id}><a href={safeHref(m.source_url)} target="_blank" rel="noopener noreferrer">{m.label || m.source_url}</a> · {m.provider}</li>)}</ul></details>}
    <label className={`dropzone upload${over ? " over" : ""}`}
      onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); if (!busy) upload([...e.dataTransfer.files]); }}>
      <b>{visual.length ? "Add more photos" : "No photos yet"}</b>
      <span>Drop JPG, PNG or WebP files here, or <u>browse your computer</u>. They upload straight away.</span>
      <input className="sr" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy}
        onChange={e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) upload(f); }} />
      {busy && <span className="muted">Working…</span>}
    </label>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </div>;
}
