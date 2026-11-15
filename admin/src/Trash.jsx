import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";
import ConfirmedAvailability from "./ConfirmedAvailability.jsx";

// EST-19: the properties confirmed not available (EST-15/EST-16), from when and why, and what the six-month purge
// would delete from each and when. Staff only; nothing shows until the server reports enabled (EST19_TRASH_READY).
// Restoring is a new confirmation that it is available, with its evidence. Deleting is a person's click, only when the
// server allows it (EST19_PURGE_READY), a batch at a time.
const REASON = { sold: "Sold", let: "Let", under_offer: "Under offer", withdrawn: "Withdrawn by the owner", other: "Other" };
const HELD = { published: "it is still on the website", sale: "a sale is in progress", offer: "an offer is open",
  tenancy: "a tenancy is in progress", closure: "its rental closure is not resolved" };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function Trash() {
  const [data, setData] = useState(null), [open, setOpen] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const load = () => api("/admin/trash").then(setData, () => {});
  useEffect(() => { load(); }, []);
  if (!data?.enabled) return null;

  const purge = async () => {
    if (busy || !confirm(`Delete ${plural(data.due_photos, "photo")} and their thumbnails? This cannot be undone.`)) return;
    setBusy(true); setMsg(null);
    try {
      const d = await api("/admin/trash/purge", { method: "POST" });
      setData(d);
      setMsg({ ok: true, text: `${plural(d.deleted, "photo")} deleted.${d.due_photos ? ` ${d.due_photos} more due: delete the next batch.` : ""}` });
    } catch (e) { setMsg({ text: e.message }); }
    setBusy(false);
  };
  return <section className="card" aria-labelledby="h-trash">
    <h2 id="h-trash">Not available <span className="muted">({data.listings.length})</span></h2>
    <p className="muted">Properties confirmed not available, oldest first. Six calendar months after that, their external
      reference photos can be deleted. Documents, floor plans, Hampton's own photos, the cover, captured or reviewed photos,
      shared files and the property's history are always kept.</p>
    {data.listings.length ? <ul className="confirmations">{data.listings.map(t => <li key={t.id}>
      <a href={`#/p/${t.id}`}>{t.title}</a> <span className="muted">{t.id}</span>
      <div>Not available since {fmtDate(t.entered_at)}{t.reason ? ` · ${REASON[t.reason] ?? t.reason}` : ""}
        {t.scope === "operation" ? " · this operation only" : ""}</div>
      <div className="muted">{t.held ? `Files kept while ${HELD[t.held] ?? "they are in use"}.`
        : !t.photos ? "No photo to delete."
        : `${plural(t.photos, "photo")} ${t.due ? "due for deletion" : `to delete from ${t.due_at ? fmtDate(t.due_at) : "a date that could not be worked out"}`}.`}
        {t.kept ? ` ${plural(t.kept, "file")} kept.` : ""}</div>
      {open === t.id ? <>
        <p className="muted">To restore it, record that it is available again, with the evidence.</p>
        <ConfirmedAvailability listingId={t.id} listing={t} />
        <button type="button" className="btn ghost sm" onClick={() => { setOpen(null); load(); }}>Close</button></>
        : <button type="button" className="btn ghost sm" onClick={() => setOpen(t.id)}>Restore…</button>}
    </li>)}</ul> : <p>No property is confirmed not available.</p>}
    {data.purge && data.due_photos > 0 && <button type="button" className="btn ghost danger" disabled={busy} onClick={purge}>
      {busy ? "Deleting…" : `Delete ${plural(data.due_photos, "due photo")}`}</button>}
    {!data.purge && data.due_photos > 0 && <p className="muted">{plural(data.due_photos, "photo")} due. Deleting them is switched off.</p>}
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </section>;
}
