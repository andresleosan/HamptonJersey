import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate, safeHref } from "./format.js";
import { CONFIRMATION } from "./ConfirmedAvailability.jsx";
import { zipBlob, entryName } from "./capture-zip.js";

// SPR-03: the property's shared record, captured when it was confirmed available (Confirmed availability, or an
// enquiry's answer), with each file's state and the private downloads. Staff only. Hidden until the server reports
// enabled (SPR03_CAPTURE_READY and migration 0084). Correcting the property is done in the editor: the record keeps
// what was captured. The state is the one of its last check (checked_at); a ZIP is made here, in the browser, from the
// stored files downloaded one by one, and leaves out, names and marks incomplete any that could not be downloaded.
const STATE = { complete: ["positive", "Complete"], partial: ["attention", "Partial"], queued: ["neutral", "Checking files"] };
const FILE = { stored: ["positive", "Stored"], failed: ["attention", "Not found"], blocked: ["attention", "Link only"], pending: ["neutral", "Checking"] };
const ROLE = { photo: "Photo", floorplan: "Floor plan" };
const FIELD = { property_type: "Property type", location: "Location", road_name: "Road", bedrooms: "Bedrooms", bathrooms: "Bathrooms",
  summary: "Summary", description: "Description" };
const ZIP_MAX = 25, ZIP_BYTES = 50 * 1024 * 1024;
// The browser saves a file it made.
function save(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function PropertyCapture({ listingId }) {
  const [data, setData] = useState(null), [picked, setPicked] = useState([]), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null); setPicked([]); setMsg(null);
    // A failed read hides the card, as when it is switched off.
    api(`/admin/listings/${encodeURIComponent(listingId)}/captures`).then(d => { if (live) setData(d); }, () => {});
    return () => { live = false; };
  }, [listingId]);
  if (!data?.enabled) return null;
  const c = data?.latest, base = c && `/api/admin/property-captures/${c.id}`;
  const check = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const { latest } = await api(`/admin/property-captures/${c.id}/check`, { method: "POST", body: {} });
      setData(d => ({ ...d, latest })); setMsg({ ok: true, text: "Files checked again." });
    }
    catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  const photos = c ? c.assets.filter(a => a.role === "photo") : [], stored = photos.filter(a => a.state === "stored");
  const fits = list => list.length > 0 && list.length <= ZIP_MAX && list.reduce((s, a) => s + (a.bytes ?? 0), 0) <= ZIP_BYTES;
  // Each stored photo by the private file route; one refused (gone, or changed since it was checked) or of another size
  // is left out and named, and the ZIP is then marked incomplete.
  const zip = async list => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const got = [], missing = [];
      for (const a of list) {
        const r = await fetch(`${base}/files/${a.id}`, { credentials: "same-origin" }).catch(() => null);
        const bytes = r?.ok ? new Uint8Array(await r.arrayBuffer()) : null;
        if (bytes && bytes.length === a.bytes) got.push({ name: entryName(a), bytes }); else missing.push(a.label || `Photo ${a.n}`);
      }
      if (!got.length) return setMsg({ text: `No photo could be downloaded (${missing.join(", ")}). Check files again.` });
      const complete = got.length === photos.length && c.state === "complete";
      save(zipBlob(got), `${c.data.property.id}-capture-${c.id}-photos${complete ? "" : "-incomplete"}.zip`);
      setMsg({ ok: complete, text: complete ? `ZIP saved with all ${got.length} photos.` : `ZIP saved, incomplete: ${got.length} of ${photos.length} photos.`
        + (missing.length ? ` Could not be downloaded: ${missing.join(", ")}. Check files again.` : "") });
    } finally { setBusy(false); }
  };
  const toggle = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const conf = c?.data.confirmation, adverts = c ? [...(c.data.market_adverts ?? []), ...(c.data.adverts ?? [])].filter(a => safeHref(a.url)) : [];
  return <section id="s-capture" className="card fields-group" aria-labelledby="h-capture">
    <h2 id="h-capture">Captured record <span className="muted">(staff only)</span></h2>
    {!c && <p className="muted">Nothing captured yet. The property is captured once it is confirmed available, here in
      Confirmed availability or from an enquiry's answer.</p>}
    {c && <>
      <p><span className={`badge ${STATE[c.state][0]}`}>{STATE[c.state][1]}</span>{" "}
        {c.counts.stored} of {c.counts.files} {c.counts.files === 1 ? "file" : "files"} stored{c.counts.waiting ? ` · ${c.counts.waiting} still to check` : ""}
        {" "}· captured {fmtDate(c.created_at)}{c.checked_at && ` · checked ${fmtDate(c.checked_at)}`}</p>
      <p className="muted">One record for every client of this property, as it stood when it was confirmed. Correct the property in
        the editor; this record keeps what was captured. Which photos a client may see is decided separately.</p>
      <dl className="kv">
        <div><dt>Confirmed</dt><dd><span className={`badge ${CONFIRMATION[conf.status]?.[0] ?? "neutral"}`}>{CONFIRMATION[conf.status]?.[1] ?? conf.status}</span>
          {" "}{fmtDate(conf.confirmed_at)} · recorded by {conf.recorded_by}</dd></div>
        <div><dt>Evidence</dt><dd>{conf.evidence_ref}</dd></div>
        <div><dt>Data to complete</dt><dd>{c.missing.length ? c.missing.map(f => FIELD[f] ?? f).join(", ") : "None"}</dd></div>
        <div><dt>Source</dt><dd>{adverts.length ? adverts.map((a, i) => <span key={i}>{i > 0 && " · "}
          <a href={safeHref(a.url)} target="_blank" rel="noopener noreferrer">Open source{adverts.length > 1 ? ` ${i + 1}` : ""}</a></span>)
          : "No advert recorded"}</dd></div>
      </dl>
      <h3 id="h-capture-files">Files</h3>
      {c.assets.length ? <ul className="confirmations" aria-labelledby="h-capture-files">{c.assets.map(a => <li key={a.id}>
        {a.role === "photo" && a.state === "stored" && <><input type="checkbox" checked={picked.includes(a.id)}
          onChange={() => toggle(a.id)} aria-label={`Select ${a.label || `photo ${a.n}`}`} />{" "}</>}
        <strong>{a.label || `${ROLE[a.role]} ${a.n}`}</strong> <span className="muted">· {ROLE[a.role]}</span>{" "}
        <span className={`badge ${FILE[a.state][0]}`}>{FILE[a.state][1]}</span>
        {a.state === "stored" && <> · <a href={`${base}/files/${a.id}`} download>Download</a></>}
        {a.state === "blocked" && safeHref(a.source_url) && <> · <a href={safeHref(a.source_url)} target="_blank" rel="noopener noreferrer">Open source</a></>}
        {a.problem && <><br /><span className="muted">{a.problem}</span></>}
      </li>)}</ul> : <p className="muted">The property had no photo or floor plan when it was captured.</p>}
      <div className="inline">
        {fits(stored) && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => zip(stored)}>Download all stored photos (ZIP)</button>}
        {fits(stored.filter(a => picked.includes(a.id))) && <button type="button" className="btn ghost sm" disabled={busy}
          onClick={() => zip(stored.filter(a => picked.includes(a.id)))}>Download {picked.length} selected (ZIP)</button>}
        <a className="btn ghost sm" href={`${base}/data.json`} download>Data (JSON)</a>
        <a className="btn ghost sm" href={`${base}/data.csv`} download>Data (CSV)</a>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={check}>Check files again</button>
      </div>
      {c.state !== "complete" && <p className="muted">Not complete: {c.counts.files ? `${c.counts.files - c.counts.stored} of ${c.counts.files} files are not stored`
        : "no file was captured"}, so a ZIP or the data is marked incomplete.</p>}
      {(!fits(stored) && stored.length > 0 || picked.length > ZIP_MAX) && <p className="muted">One ZIP holds {ZIP_MAX} photos and 50 MB at most: select fewer.</p>}
      {data.earlier.length > 0 && <p className="muted">Earlier captures: {data.earlier.map((e, i) => <span key={e.id}>{i > 0 && " · "}
        {fmtDate(e.created_at)} ({STATE[e.state][1].toLowerCase()}, <a href={`/api/admin/property-captures/${e.id}/data.json`} download>data</a>)</span>)}</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    </>}
  </section>;
}
