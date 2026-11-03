import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, OPERATION, USE, KIND, TENURE, HOUSING, RESTRICTION, priceText } from "./format.js";
import { uploadPhoto } from "./image.js";
import { setUnsaved } from "./unsaved.js";
import { decodeText, readPropertyText, draftBody, planFolder, pickCover, readDrop } from "../../server/listing-import.js";

// PUB-01 (spec 2026-11-03): a draft typed by hand, as before, or read from a folder: its property.txt and its own photos.
const START = { title: "", use: "residential", operation: "sale", availability: "for_sale", country: "Jersey" };
const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
const clip = s => { const t = s.replace(/\n/g, " · "); return t.length > 120 ? `${t.slice(0, 119)}…` : t; };
const subfolders = plan => (plan.subfolders.length ? [`Subfolders not read: ${plan.subfolders.join(", ")}.`] : []);
// What the summary lists from the file, in the template's order (the five above show in the form itself).
const SHOWN = [["property_type", "Type"], ["parish", "Parish"], ["location", "Location"], ["road_name", "Road"], ["bedrooms", "Bedrooms"],
  ["bathrooms", "Bathrooms"], ["tenure_type", "Tenure", v => TENURE[v]], ["housing_category", "Housing category", v => HOUSING[v]],
  ["restriction", "Restriction", v => RESTRICTION[v]], ["price", "Price"], ["tour_url", "Tour URL"], ["summary", "Summary", clip],
  ["description", "Description", clip]];

export default function NewProperty({ rows, onClose }) {
  const [f, setF] = useState(START), [imp, setImp] = useState(null), [over, setOver] = useState(false);
  const [err, setErr] = useState(null), [status, setStatus] = useState(null), [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null), [done, setDone] = useState(null);
  const running = useRef(false), alive = useRef(true), folderInput = useRef(null), photosInput = useRef(null);
  useEffect(() => () => { alive.current = false; setUnsaved(false); }, []);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  // Every pick, refusal and Remove starts again from START, so one house's details never meet another's photos.
  const reset = (error = null) => { setImp(null); setF(START); setErr(error); setStatus(null); };

  const choose = async (items, dropped) => {
    const plan = planFolder(items, dropped);
    if (plan.error) return reset([plan.error, ...plan.skipped, ...subfolders(plan)].join(" "));
    let read = { fields: {}, notes: [], warnings: [] };
    if (plan.text) {
      try { read = readPropertyText(decodeText(new Uint8Array(await plan.text.arrayBuffer()))); }
      catch { read = { fields: {}, notes: [`${plan.text.name} couldn't be read.`], warnings: [] }; }
    }
    const five = Object.fromEntries(Object.keys(START).filter(k => k in read.fields).map(k => [k, read.fields[k]]));
    setF({ ...START, ...five, title: read.fields.title ?? plan.folder ?? "" });
    setImp({ plan, ...read }); setErr(null);
    setStatus(`Read ${plan.folder ?? "the photos"}: ${plural(plan.photos.length, "file")} to upload${plan.text ? `, details from ${plan.text.name}` : ""}.`);
  };
  const pick = (e, folder) => {
    const files = [...e.target.files];
    e.target.value = ""; // so the same folder can be chosen again
    if (folder || files.length) choose(files.map(file => ({ file, path: folder ? file.webkitRelativePath : file.name })));
  };
  const drop = e => {
    e.preventDefault(); setOver(false);
    if (busy) return;
    const entries = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean); // only readable inside the handler
    readDrop(entries).then(r => (r.error ? reset(r.error) : choose(r.items, r.subfolders)),
      () => reset("Couldn't read what was dropped. Use Choose folder instead."));
  };

  const submit = async e => {
    e.preventDefault();
    if (running.current) return; // a double click must not create two listings
    running.current = true; setBusy(true); setErr(null); setStatus("Creating the draft…"); setUnsaved(true);
    let id;
    try { ({ id } = await api("/admin/listings", { method: "POST", body: draftBody(imp?.fields ?? {}, f).body })); }
    catch (x) {
      if (!alive.current) return; // the unmount already cleared the flag: never touch another page's
      setUnsaved(false); setStatus(null); setBusy(false); running.current = false;
      setErr(x.data?.fields ? Object.entries(x.data.fields).map(([k, v]) => `${k}: ${v}`).join(". ") : x.message);
      return;
    }
    // One at a time and in order: the server gives each photo the next position as it arrives.
    const photos = imp?.plan.photos ?? [], uploaded = [], failed = [];
    for (const [i, p] of photos.entries()) {
      if (!alive.current) break; // left the page: stop, and never pull them back to the editor
      setStatus(`Uploading photo ${i + 1} of ${photos.length}…`); setProgress({ value: i, max: photos.length });
      try { uploaded.push({ ...p, media: await uploadPhoto(id, p.file, { kind: p.kind, label: p.label }) }); }
      catch (x) { failed.push(`${p.name}: ${x.message}`); }
    }
    let coverFailed = false;
    const c = pickCover(uploaded);
    if (alive.current && c !== null) {
      try {
        const { listing } = await api(`/admin/listings/${id}`);
        await api(`/admin/listings/${id}/media`, { method: "PUT",
          body: { items: [], cover_media_id: uploaded[c].media.id, updated_at: listing.updated_at } });
      } catch { coverFailed = true; }
    }
    if (!alive.current) return;
    setUnsaved(false);
    if (!failed.length && !coverFailed) { location.hash = `#/p/${id}`; return; }
    setDone({ id, uploaded: uploaded.length, total: photos.length, failed, coverFailed });
    setStatus(null); setProgress(null); setBusy(false);
  };

  if (done) return <section className="card new add-property" aria-labelledby="t-new">
    <h2 id="t-new">Add new property</h2>
    <div className="warn" role="alert">
      <p>Draft {done.id} created. {done.uploaded} of {done.total} photos uploaded.</p>
      {done.failed.length > 0 && <ul>{done.failed.map(x => <li key={x}>{x}</li>)}</ul>}
      {done.coverFailed && <p>Choose the cover in the editor.</p>}
    </div>
    <div className="inline"><a className="btn" href={`#/p/${done.id}`}>Open the listing</a>
      <button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
  </section>;

  const { plan, fields = {}, notes = [], warnings = [] } = imp ?? {};
  const draft = draftBody(fields, f); // its notes follow the operation chosen below
  const count = kind => plan.photos.filter(p => p.kind === kind).length;
  const counts = plan && [plural(count("photo"), "photo"), plural(count("floorplan"), "floor plan"), plural(count("aerial"), "aerial view")]
    .filter(s => !s.startsWith("0 "));
  const head = plan ? [counts.join(", "), plan.text && `details from ${plan.text.name}`].filter(Boolean) : [];
  const values = { ...fields, price: ["sale_price", "rent", "premium", "price_text"].some(k => draft.body[k] != null) ? priceText(draft.body) : null };
  const read = SHOWN.filter(([k]) => values[k] != null).map(([k, label, show]) => [label, show ? show(values[k]) : values[k]]);
  const left = [...notes, ...draft.notes, ...(plan?.skipped ?? []), ...(plan ? subfolders(plan) : [])];
  const same = f.title.trim() && (rows ?? []).find(l => l.title.trim().toLowerCase() === f.title.trim().toLowerCase());

  return <form className="card new add-property" onSubmit={submit} aria-labelledby="t-new">
    <h2 id="t-new">Add new property</h2>
    <p className="muted">It's saved as a draft: nothing goes on the website until you publish it.</p>
    {/* While it works every field and button is locked: what is typed then would never reach the listing. */}
    <fieldset disabled={busy}>
      <div className={`dropzone import${over ? " over" : ""}`} onDrop={drop} onDragLeave={() => setOver(false)}
        onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}>
        <b>Import a folder (optional)</b>
        <span>Drop the property's folder here, with its photos and property.txt. Only the files directly inside it are read.</span>
        <div className="inline">
          <button type="button" className="btn ghost sm" onClick={() => folderInput.current.click()}>Choose folder</button>
          <button type="button" className="btn ghost sm" onClick={() => photosInput.current.click()}>Choose photos</button>
        </div>
        <a href="property.txt" download>Download the template (property.txt)</a>
        <input ref={folderInput} type="file" webkitdirectory="" hidden onChange={e => pick(e, true)} />
        <input ref={photosInput} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={e => pick(e, false)} />
      </div>
      {plan && <div className="import-summary">
        <div className="inline">
          <p><b>{plan.folder ?? "Photos"}</b>{head.length ? ` · ${head.join(" · ")}` : ""}</p>
          <button type="button" className="btn ghost sm" onClick={() => reset()}>Remove</button>
        </div>
        {plan.photos.length > 0 && <details className="files" open={plan.photos.length <= 12}>
          <summary>{plural(plan.photos.length, "file")} to upload, in this order</summary>
          <ol>{plan.photos.map((p, i) => <li key={p.name}>{p.name} <span className="muted">· {KIND[p.kind]}{i === plan.cover ? " · cover" : ""}</span></li>)}</ol>
        </details>}
        {read.length > 0 && <dl>{read.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        {warnings.length > 0 && <div className="warn before-publish"><p>Check before you publish:</p><ul>{warnings.map(x => <li key={x}>{x}</li>)}</ul></div>}
        {left.length > 0 && <div className="warn skipped"><p>Not imported:</p><ul>{left.map(x => <li key={x}>{x}</li>)}</ul></div>}
      </div>}
      <label>Title<input required maxLength={200} value={f.title} onChange={set("title")} autoFocus
        aria-describedby={same ? "d-same" : undefined} /></label>
      {same && <p id="d-same" className="warn">A listing with this title already exists: {same.id}.</p>}
      <div className="filters">
        <label>Use<select value={f.use} onChange={set("use")}>{Object.entries(USE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Operation<select value={f.operation} onChange={set("operation")}>{Object.entries(OPERATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Availability<select value={f.availability} onChange={set("availability")}>{Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Country<input value={f.country} onChange={set("country")} maxLength={100} /></label>
      </div>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="inline actions"><button className="btn">{busy ? "Creating…" : "Create draft"}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        {progress && <progress value={progress.value} max={progress.max} aria-label="Upload progress" />}
        <span role="status" className="muted">{status}</span></div>
    </fieldset>
  </form>;
}
