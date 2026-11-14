import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api.js";
import { fmtDate } from "./format.js";

// PUB-11: private PDFs for staff. Shown only when the server reports documents_enabled.
const MAX_BYTES = 20 * 1024 * 1024;
const size = n => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// The PDF goes as the raw body so the server can stream it with a hard limit; its name goes in a header, not the URL.
async function send(listingId, file) {
  let res;
  try {
    res = await fetch(`/api/admin/listings/${listingId}/documents`, { method: "POST", credentials: "same-origin", body: file,
      headers: { "content-type": "application/pdf", "x-document-label": encodeURIComponent(file.name.replace(/\.pdf$/i, "")) } });
  } catch { throw new ApiError(0, "Can't reach the server. Check your connection and try again."); }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("hs:signed-out"));
    throw new ApiError(res.status, data?.error || `Error ${res.status}`);
  }
  return data.document;
}

export default function ListingDocuments({ listingId }) {
  const [docs, setDocs] = useState(null), [loadError, setLoadError] = useState(null);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const current = useRef(listingId); current.current = listingId;
  const load = () => {
    setDocs(null); setLoadError(null);
    api(`/admin/listings/${listingId}/documents`).then(r => { if (current.current === listingId) setDocs(r.documents); },
      e => { if (current.current === listingId) setLoadError(e.message); });
  };
  useEffect(() => { setMsg(null); load(); }, [listingId]);

  const upload = async files => {
    setBusy(true); setMsg(null);
    const added = [], failed = [];
    for (const file of files) {
      if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { failed.push(`${file.name}: only PDF files can be added`); continue; }
      if (file.size > MAX_BYTES) { failed.push(`${file.name}: larger than 20 MB`); continue; }
      try { added.push(await send(listingId, file)); } catch (e) { failed.push(`${file.name}: ${e.message}`); }
    }
    if (current.current !== listingId) return;
    if (added.length) setDocs(list => [...added.reverse(), ...(list ?? [])]);
    setMsg(failed.length ? { text: `Not uploaded: ${failed.join("; ")}` } : { ok: true, text: `${added.length} document(s) uploaded.` });
    setBusy(false);
  };

  const remove = async d => {
    if (!confirm(`Delete "${d.label || d.id}"? This can't be undone.`)) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/admin/listings/${listingId}/documents/${d.id}`, { method: "DELETE" });
      setDocs(list => list.filter(x => x.id !== d.id));
      setMsg({ ok: true, text: `"${d.label || d.id}" deleted.` });
    } catch (e) { setMsg({ text: e.message }); } finally { setBusy(false); }
  };

  return <section id="s-documents" className="card" aria-labelledby="h-documents">
    <h2 id="h-documents" tabIndex={-1}>Private documents</h2>
    <p className="muted">PDF only, up to 20 MB each. Only signed-in staff can see or download them; they never appear on the website.</p>
    {loadError ? <p role="alert" className="err">Couldn't load the documents: {loadError}{" "}
      <button type="button" className="btn ghost sm" onClick={load}>Try again</button></p>
      : docs === null ? <p className="muted">Loading documents…</p>
      : docs.length === 0 ? <p className="muted">No private documents yet. Add a PDF below.</p>
      : <ul className="tour-list" aria-label="Private documents">{docs.map(d => <li key={d.id}>
        <div><b style={{ overflowWrap: "anywhere" }}>{d.label || d.id}</b>
          <div className="meta"><span>{size(d.bytes)}</span><span>Added {fmtDate(d.created_at)}</span></div></div>
        <div className="ctl">
          <a className="btn ghost" href={`/api/admin/listings/${listingId}/documents/${d.id}`} download
            aria-label={`Download ${d.label || d.id}`}>Download</a>
          <button type="button" className="btn ghost danger" disabled={busy} onClick={() => remove(d)}
            aria-label={`Delete ${d.label || d.id}`}>Delete</button>
        </div>
      </li>)}</ul>}
    <label className="dropzone upload">
      <b>Add PDF documents</b>
      <span>Choose PDF files from your computer. They upload straight away and stay private.</span>
      <input className="sr" type="file" accept="application/pdf,.pdf" multiple disabled={busy || docs === null}
        onChange={e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) upload(f); }} />
      {busy && <span className="muted">Working…</span>}
    </label>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </section>;
}
