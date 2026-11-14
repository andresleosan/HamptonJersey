import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtAgo, OPERATION, priceText } from "./format.js";
import { setUnsaved } from "./unsaved.js";
import { createDraft } from "./createDraft.js";
import PhotoQualitySuggestions from "./PhotoQualitySuggestions.jsx";
import { readPropertyText, draftBody, labelFromName, kindsOf, pickCover } from "../../server/listing-import.js";

// PUB-21 (spec 2026-11-05): Properties Queue. A Drive folder and a note go to Hermes; its proposal becomes a draft here
// (the photos of the Edited folder, reduced in the browser like Add new property) and the editor approves it (D11).
const STATUS = { queued: ["Waiting for Hermes", "neutral"], working: ["Waiting for Hermes", "neutral"], ready: ["Ready to review", "attention"],
  review: ["In review", "active"], published: ["Published", "published"], discarded: ["Discarded", "draft"], failed: ["Failed", "attention"] };
const MAX_NOTE = 2000; // as server/routes/queue.js
// Errors about the link itself, shown under its field; the rest go above the list.
const LINK_ERROR = /^(Paste the link|The app can't open|This is a Records)/;
const SHOWN = [["operation", "Sale or rent", v => OPERATION[v] ?? v], ["property_type", "Type"], ["parish", "Parish"], ["location", "Location"],
  ["road_name", "Road"], ["bedrooms", "Bedrooms"], ["bathrooms", "Bathrooms"], ["price", "Price"], ["summary", "Summary"], ["description", "Description"]];

const LABEL = Object.fromEntries(SHOWN.map(([k, l]) => [k, l]));

export default function Queue({ onChange }) {
  const [items, setItems] = useState(null), [hermesAt, setHermesAt] = useState(null), [err, setErr] = useState(null);
  const [link, setLink] = useState(""), [note, setNote] = useState(""), [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null), [formErr, setFormErr] = useState(null), [open, setOpenRaw] = useState(null);
  const [paused, setPaused] = useState(false); // master plan: Drive imports off until PUB21_DRIVE_READY is on
  // The view changes under the keyboard: its heading takes the focus (DESIGN.md, as the booking confirmation).
  const setOpen = item => { setOpenRaw(item); requestAnimationFrame(() => document.querySelector(item ? "#t-review" : "#t-queue")?.focus()); };
  const load = async () => {
    try { const r = await api("/admin/queue"); setItems(r.items); setHermesAt(r.hermes_at); setPaused(r.paused === true); setErr(null); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const send = async e => {
    e.preventDefault();
    setSending(true); setFormErr(null); setErr(null); setSent(null);
    try {
      const r = await api("/admin/queue", { method: "POST", body: { link, note } });
      setSent(r); setLink(""); setNote(""); await load(); onChange?.();
    }
    catch (x) { if (LINK_ERROR.test(x.message)) setFormErr(x.message); else setErr(x.message); }
    finally { setSending(false); }
  };
  const act = async (item, action, ask) => {
    if (ask && !confirm(ask)) return;
    try { await api(`/admin/queue/${item.id}/${action}`, { method: "POST" }); await load(); onChange?.(); }
    catch (x) { setErr(x.message); }
  };

  if (open) return <Proposal item={open} onClose={() => { setOpen(null); load(); }} />;
  const silent = !hermesAt || Date.now() - Date.parse(hermesAt) > 30 * 60e3;
  const waiting = items?.some(i => ["queued", "working"].includes(i.status));
  return <section className="queue" aria-labelledby="t-queue">
    <h1 id="t-queue" tabIndex={-1}>Properties Queue</h1>
    <form className="card" onSubmit={send}>
      <h2>Send a property</h2>
      <p className="muted">Paste the link of the property's Google Drive folder. Hermes reads its documents; the photos come from its
        "Edited" folder, and "Records" is never read.</p>
      <label>Drive folder link<input required value={link} onChange={e => setLink(e.target.value)} inputMode="url" autoComplete="off"
        placeholder="https://drive.google.com/drive/folders/…" aria-invalid={formErr ? true : undefined}
        aria-describedby={formErr ? "e-link" : undefined} /></label>
      {formErr && <small id="e-link" className="err" role="alert">{formErr}</small>}
      <label>Note for Hermes (optional)<textarea rows={3} maxLength={MAX_NOTE} value={note} onChange={e => setNote(e.target.value)}
        aria-describedby="d-note" placeholder="e.g. The price is the one in the Word document. 4 bedrooms, not 3." /></label>
      <small id="d-note" className="muted">{note.length} / {MAX_NOTE}</small>
      {paused && <p className="warn" role="note">Paused: sending folders to Hermes is switched off for now. Add the property by hand in Listings. The imports already in the queue can still be reviewed.</p>}
      <div className="inline"><button className="btn" disabled={sending || paused}>{sending ? "Sending…" : "Send to Hermes"}</button>
        <span role="status" className="muted">{sent && `${sent.item.folder_name} is in the queue.`}</span></div>
      {sent?.duplicate && <p className="warn" role="note">{sent.duplicate.listing_id
        ? <>This folder was already imported as <a href={`#/p/${sent.duplicate.listing_id}`}>{sent.duplicate.listing_id}</a>.</>
        : "This folder is already in the queue."}</p>}
    </form>
    {err && <p role="alert" className="err">{err}</p>}
    {waiting && <p className={silent ? "warn" : "muted"} role="note">{silent ? "Hermes isn't responding. Properties stay in the queue until it's back."
      : `Hermes last checked ${fmtAgo(hermesAt)}.`}</p>}
    {items && !items.length && <p className="muted">Nothing in the queue.</p>}
    {items?.length > 0 && <table className="list queue-list">
      <thead><tr><th>Property</th><th>Sent by</th><th>Sent</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
      <tbody>{items.map(i => <tr key={i.id}>
        <td className="name"><b>{i.folder_name}</b>{i.note && <div className="muted note">{i.note}</div>}
          {i.status === "failed" && i.error && <div className="err">{i.error}</div>}</td>
        <td data-label="Sent by">{i.requested_by}</td>
        <td data-label="Sent"><time dateTime={i.created_at}>{fmtDate(i.created_at)}</time></td>
        <td data-label="Status"><span className={`badge ${STATUS[i.status][1]}`}>{STATUS[i.status][0]}</span></td>
        <td className="actions"><div className="inline">
          {i.status === "ready" && <button type="button" className="btn sm" onClick={() => setOpen(i)}>Review</button>}
          {i.status === "review" && i.listing_id && <a className="btn sm" href={`#/p/${i.listing_id}`}>Open</a>}
          {i.status === "published" && i.listing_id && <a className="btn ghost sm" href={`#/p/${i.listing_id}`}>Open</a>}
          {i.status === "failed" && <button type="button" className="btn ghost sm" onClick={() => act(i, "retry")}>Try again</button>}
          {!["published", "discarded", "failed"].includes(i.status) && <button type="button" className="btn ghost sm danger" onClick={() => act(i, "discard",
            i.listing_id ? `Discard ${i.folder_name}? Its draft ${i.listing_id} and its photos will be deleted.` : `Discard ${i.folder_name}?`)}>Discard</button>}
        </div></td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

// The proposal, before the draft exists: what was read, where from, what disagrees, and which photos go up.
function Proposal({ item, onClose }) {
  const r = item.result;
  const read = readPropertyText(r.property_txt);
  const fields = { ...read.fields, title: item.folder_name }; // D14: the folder's name, as it is
  const operation = fields.operation ?? "sale";
  const five = { title: item.folder_name, use: fields.use ?? "residential", operation,
    availability: fields.availability ?? (operation === "rent" ? "to_let" : "for_sale"), country: fields.country ?? "Jersey" };
  const draft = draftBody(fields, five);
  const values = { ...fields, operation, price: ["sale_price", "rent", "price_text"].some(k => draft.body[k] != null) ? priceText(draft.body) : null };
  const [out, setOut] = useState(() => new Set()), [busy, setBusy] = useState(false), [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null), [err, setErr] = useState(null), [done, setDone] = useState(null);
  const alive = useRef(true), running = useRef(false);
  useEffect(() => () => { alive.current = false; setUnsaved(false); }, []);
  const kept = r.photos.filter(p => !out.has(p.id)), kind = kindsOf(kept.map(p => p.name));
  const photos = kept.map((p, i) => ({ name: p.name, kind: kind[i], label: labelFromName(p.name),
    load: async () => {
      const res = await fetch(`/api/admin/queue/${item.id}/photo/${p.id}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Google Drive didn't send it");
      return res.blob();
    } }));
  const toggle = id => setOut(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const create = async () => {
    if (running.current) return; // a double click must not start two drafts
    running.current = true; setBusy(true); setErr(null); setStatus("Creating the draft…"); setUnsaved(true);
    try {
      const res = await createDraft(draft.body, photos, { alive: () => alive.current, path: `/admin/queue/${item.id}/draft`,
        onProgress: (i, n) => { setStatus(`Uploading photo ${i + 1} of ${n}…`); setProgress({ value: i, max: n }); } });
      if (!alive.current) return;
      setUnsaved(false);
      if (!res.failed.length && !res.coverFailed && !res.qualityWarnings.length) { location.hash = `#/p/${res.id}`; return; }
      setDone(res);
    }
    catch (x) {
      if (!alive.current) return;
      setUnsaved(false);
      if (x.data?.listing_id) { location.hash = `#/p/${x.data.listing_id}`; return; } // someone else already made it
      setErr(x.data?.fields ? Object.entries(x.data.fields).map(([k, v]) => `${k}: ${v}`).join(". ") : x.message);
    }
    finally { running.current = false; if (alive.current) { setBusy(false); setStatus(null); setProgress(null); } }
  };

  if (done) return <section className="card queue-review" aria-labelledby="t-review">
    <h1 id="t-review">{item.folder_name}</h1>
    <div className="warn" role={done.failed.length || done.coverFailed ? "alert" : "status"}><p>Draft {done.id} created. {done.uploaded} of {done.total} photos uploaded.</p>
      {done.failed.length > 0 && <ul>{done.failed.map(x => <li key={x}>{x}</li>)}</ul>}
      {done.coverFailed && <p>Choose the cover in the editor.</p>}</div>
    <PhotoQualitySuggestions items={done.qualityWarnings} />
    <div className="inline"><a className="btn" href={`#/p/${done.id}`}>Open the listing</a></div>
  </section>;

  const shown = SHOWN.filter(([k]) => values[k] != null);
  const warnings = [...r.warnings, ...read.warnings, ...read.notes, ...draft.notes];
  const cover = pickCover(photos);
  return <section className="card queue-review" aria-labelledby="t-review">
    <h1 id="t-review" tabIndex={-1}>{item.folder_name}</h1>
    <p className="muted">Hermes's proposal. Check it here, then create the draft: you can change anything in the editor before you
      approve and publish it.</p>
    {item.note && <p><b>Note sent:</b> {item.note}</p>}
    <fieldset disabled={busy}>
      {shown.length > 0 ? <dl>{shown.map(([k, label, show]) => <div key={k}><dt>{label}</dt>
        <dd>{show ? show(values[k]) : values[k]}{r.sources?.[k] && <small className="muted"> · from {r.sources[k]}</small>}</dd></div>)}</dl>
        : <p className="warn">Hermes found no details. The draft gets the title only.</p>}
      {r.conflicts?.length > 0 && <div className="warn" role="note"><p>The documents disagree:</p><ul>{r.conflicts.map(c => <li key={c.field}>
        {LABEL[c.field] ?? c.field}: <span className="meta">{c.values.map((v, i) => <span key={i}>{v.value} ({v.document})</span>)}</span></li>)}</ul></div>}
      {warnings.length > 0 && <div className="warn"><p>Check:</p><ul>{warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}
      <h2>Photos{r.photos_folder ? ` from "${r.photos_folder}"` : ""}</h2>
      {r.photos.length ? <ol className="queue-photos">{r.photos.map(p => <li key={p.id}>
        <label className="check"><input type="checkbox" checked={out.has(p.id)} onChange={() => toggle(p.id)}
          aria-label={`Leave out ${p.name}`} /> Leave out</label>
        <span>{p.name}</span>{!out.has(p.id) && photos[cover]?.name === p.name && <span className="badge neutral">Cover</span>}
      </li>)}</ol> : <p className="muted">No photos: add them in the editor.</p>}
      <div className="inline actions"><button type="button" className="btn" onClick={create}>{busy ? "Creating…" : "Create draft"}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Back to the queue</button>
        {progress && <progress value={progress.value} max={progress.max} aria-label="Upload progress" />}</div>
      <p role="status" className="muted">{status}</p>
      {err && <p role="alert" className="err">{err}</p>}
    </fieldset>
  </section>;
}
