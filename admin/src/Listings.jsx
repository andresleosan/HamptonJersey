import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, OPERATION, USE, STATUS_LABEL, stateOf, priceText, fmtDate } from "./format.js";

const TABS = [["published", "Published"], ["draft", "Drafts"], ["archived", "Archived"], ["all", "All"]];
const REGIONS = { jersey: "Jersey", uk: "United Kingdom", international: "International" };
const regionOf = c => (c === "Jersey" ? "jersey" : c === "United Kingdom" ? "uk" : "international");

export default function Listings() {
  const [rows, setRows] = useState(null), [error, setError] = useState(null), [creating, setCreating] = useState(false);
  const [tab, setTab] = useState("published"), [q, setQ] = useState(""), [use, setUse] = useState(""),
    [region, setRegion] = useState(""), [avail, setAvail] = useState("");
  const [msg, setMsg] = useState(null);
  const load = () => api("/admin/listings").then(d => setRows(d.listings), e => setError(e.message));
  useEffect(() => { load(); }, []);
  const act = async (e, l, action, done) => {
    e.currentTarget.closest("details")?.removeAttribute("open");
    if (action === "archive" && !confirm(`Archive "${l.title}"? It will leave the website; you can restore it later.`)) return;
    setMsg(null);
    try { await api(`/admin/listings/${l.id}/${action}`, { method: "POST" }); setMsg({ ok: true, text: `${l.title}: ${done}` }); await load(); }
    catch (e) { setMsg({ text: e.message }); }
  };
  // Star = shown in the home page's Featured section, in the order stars were given (a new star goes last).
  const star = async l => {
    setMsg(null);
    try {
      await api(`/admin/listings/${l.id}/featured`, { method: "PUT", body: { featured: l.featured_rank == null } });
      setMsg({ ok: true, text: `${l.title}: ${l.featured_rank == null ? "now in the Featured section of the home page." : "removed from the Featured section."}` });
    } catch (e) { setMsg({ text: e.message }); }
    await load();
  };
  // Home page order: drag rows (or use ↑ ↓) in Published with no filters; saved at once, the site follows within a minute.
  const [dragId, setDragId] = useState(null);
  const reorder = async ids => {
    setRows(rs => rs.map(r => (ids.includes(r.id) ? { ...r, home_order: ids.indexOf(r.id) + 1 } : r)));
    setMsg(null);
    try { await api("/admin/listings/order", { method: "PUT", body: { ids } }); setMsg({ ok: true, text: "Order saved. The home page shows it within a minute." }); }
    catch (e) { setMsg({ text: e.message }); }
    await load();
  };
  const moveTo = (list, id, to) => { const ids = list.map(l => l.id).filter(x => x !== id); ids.splice(to, 0, id); return ids; };
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) =>
    [k, (rows || []).filter(l => k === "all" || stateOf(l) === k).length])), [rows]);
  if (error) return <p role="alert" className="err">{error}</p>;
  if (!rows) return <p>Loading listings…</p>;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(l => (tab === "all" || stateOf(l) === tab) && (!use || l.use === use)
    && (!region || regionOf(l.country) === region) && (!avail || l.availability === avail)
    && (!needle || `${l.id} ${l.title} ${l.location ?? ""}`.toLowerCase().includes(needle)))
    .sort((a, b) => (tab === "published" ? ((a.home_order ?? Infinity) - (b.home_order ?? Infinity) || 0) : 0) || a.id.localeCompare(b.id));
  // Position of each starred listing in the home page's Featured section: published ones with a public photo, in star order.
  const featNo = Object.fromEntries((rows || []).filter(l => stateOf(l) === "published" && l.has_public_photo && l.featured_rank != null)
    .sort((a, b) => a.featured_rank - b.featured_rank).map((l, i) => [l.id, i + 1]));
  const canDrag = tab === "published" && !needle && !use && !region && !avail && shown.length > 1;

  return <section aria-labelledby="t-props">
    <div className="head"><h1 id="t-props">Listings</h1>
      <button type="button" className="btn" onClick={() => setCreating(true)}>New listing</button></div>
    {creating && <NewListing onClose={() => setCreating(false)} />}
    <div className="seg" role="group" aria-label="Status">{TABS.map(([k, t]) =>
      <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{t}<span className="count">{counts[k]}</span></button>)}</div>
    <div className="filters">
      <label>Search<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Title, HE-R001 or location" /></label>
      <label>Use<select value={use} onChange={e => setUse(e.target.value)}><option value="">All</option>
        {Object.entries(USE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Region<select value={region} onChange={e => setRegion(e.target.value)}><option value="">All</option>
        {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Availability<select value={avail} onChange={e => setAvail(e.target.value)}><option value="">All</option>
        {Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    </div>
    <p className="muted" aria-live="polite">{shown.length} {shown.length === 1 ? "listing" : "listings"}
      {canDrag ? " · drag ⠿ to set the order on the home page" : tab === "published" && shown.length > 1 ? " · clear the filters to change the order" : ""}</p>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {shown.length ? <table className="list">
      <thead><tr>{canDrag && <th scope="col"><span className="sr">Order</span></th>}<th scope="col"><span className="sr">Photo</span></th><th scope="col">Listing</th><th scope="col">Location</th>
        <th scope="col">Price</th><th scope="col">Availability</th><th scope="col">Visibility</th><th scope="col">Last edited</th>
        <th scope="col"><span className="sr">Actions</span></th></tr></thead>
      <tbody>{shown.map((l, i) => <tr key={l.id} draggable={canDrag} className={dragId === l.id ? "dragging" : undefined}
        onDragStart={e => { if (!canDrag) return; setDragId(l.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragOver={e => { if (canDrag && dragId) e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); if (dragId && dragId !== l.id) reorder(moveTo(shown, dragId, i)); setDragId(null); }}
        onDragEnd={() => setDragId(null)}>
        {canDrag && <td className="order"><span className="handle" aria-hidden="true" title="Drag to reorder">⠿</span>
          <button type="button" className="nudge" disabled={i === 0} aria-label={`Move ${l.title} up`} onClick={() => reorder(moveTo(shown, l.id, i - 1))}>↑</button>
          <button type="button" className="nudge" disabled={i === shown.length - 1} aria-label={`Move ${l.title} down`} onClick={() => reorder(moveTo(shown, l.id, i + 1))}>↓</button></td>}
        <td>{l.cover_id ? <img className="thumb" src={`/media/${l.cover_id}?thumb`} alt="" loading="lazy" /> : <span className="thumb" />}</td>
        <td><div className="title-cell"><button type="button" className="star" aria-pressed={l.featured_rank != null} disabled={stateOf(l) === "archived"}
          title={l.featured_rank != null ? "In the Featured section of the home page. Click to remove." : "Click to show in the Featured section of the home page."}
          aria-label={`Featured on the home page: ${l.title}${featNo[l.id] ? `, number ${featNo[l.id]}` : ""}`} onClick={() => star(l)}>{l.featured_rank != null ? "★" : "☆"}
          {featNo[l.id] && <sup className="star-no" aria-hidden="true">{featNo[l.id]}</sup>}</button>
          <div><a href={`#/p/${l.id}`}>{l.title}</a><div className="muted">{l.id} · {OPERATION[l.operation]}</div></div></div></td>
        <td>{l.location || l.country || "—"}</td>
        <td className="num">{priceText(l)}</td>
        <td>{AVAILABILITY[l.availability]}</td>
        <td>{stateOf(l) === "archived" ? <span className="badge archived">{STATUS_LABEL.archived}</span>
          : <button type="button" role="switch" className="switch" aria-checked={stateOf(l) === "published"} aria-label={`Visible on the website: ${l.title}`}
            onClick={e => act(e, l, l.published ? "unpublish" : "publish", l.published ? "hidden from the website." : l.has_public_photo ? "now visible on the website." : "published, but it needs a visible photo to appear.")}>
            <span className="knob" aria-hidden="true" />{stateOf(l) === "published" ? "Visible" : "Hidden"}</button>}
          {stateOf(l) === "published" && !l.has_public_photo && <div className="muted" title="Not shown on the website until it has a visible photo">no photo · not visible</div>}</td>
        <td className="muted">{fmtDate(l.updated_at)}</td>
        <td><details className="more row-menu"><summary aria-label={`Actions for ${l.title}`}>…</summary><div className="menu">
          <a href={`#/p/${l.id}`}>Edit</a>
          {stateOf(l) === "published" && l.has_public_photo ? <a href={`/#/p/${l.id}`} target="_blank" rel="noopener">View on the website ↗</a> : null}
          {stateOf(l) !== "archived" ? <button type="button" onClick={e => act(e, l, "archive", "archived.")}>Archive</button>
            : <button type="button" onClick={e => act(e, l, "restore", "restored as a draft.")}>Restore</button>}
        </div></details></td>
      </tr>)}</tbody>
    </table> : <div className="empty card">{rows.length && (needle || use || region || avail)
      ? <><p>No listings match these filters.</p><button type="button" className="btn ghost sm" onClick={() => { setQ(""); setUse(""); setRegion(""); setAvail(""); }}>Clear filters</button></>
      : <><p>No {TABS.find(([k]) => k === tab)[1].toLowerCase()} listings.</p>
        {tab !== "archived" && <button type="button" className="btn sm" onClick={() => setCreating(true)}>New listing</button>}</>}</div>}
  </section>;
}

function NewListing({ onClose }) {
  const [f, setF] = useState({ title: "", use: "residential", operation: "sale", availability: "for_sale", country: "Jersey" });
  const [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const { id } = await api("/admin/listings", { method: "POST", body: f }); location.hash = `#/p/${id}`; }
    catch (x) { setErr(x.data?.fields ? Object.entries(x.data.fields).map(([k, v]) => `${k}: ${v}`).join(". ") : x.message); setBusy(false); }
  };
  return <form className="card new" onSubmit={submit} aria-labelledby="t-new">
    <h2 id="t-new">New listing (draft)</h2>
    <label>Title<input required maxLength={200} value={f.title} onChange={set("title")} autoFocus /></label>
    <div className="filters">
      <label>Use<select value={f.use} onChange={set("use")}>{Object.entries(USE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Operation<select value={f.operation} onChange={set("operation")}>{Object.entries(OPERATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Availability<select value={f.availability} onChange={set("availability")}>{Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Country<input value={f.country} onChange={set("country")} maxLength={100} /></label>
    </div>
    {err && <p role="alert" className="err">{err}</p>}
    <div className="filters"><button className="btn" disabled={busy}>{busy ? "Creating…" : "Create draft"}</button>
      <button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
  </form>;
}
