import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, OPERATION, USE, STATUS_LABEL, stateOf, priceText, fmtDate, fmtDayMonth } from "./format.js";
import { OPTIONS } from "../../server/applicants.js";
import { ON_MARKET } from "../../server/listing.js";
import NewProperty from "./NewProperty.jsx";
import WithdrawalDialog from './WithdrawalDialog.jsx';
import { OPERATION_FILTER, bedsRange, passesExtra, bedsLabel, bathsLabel, daysAgo } from "./listing-filters.js";

// ADM-04: To confirm is the published listings on the market that nobody has confirmed lately (the server's to_confirm).
const TABS = [["published", "Published"], ["to_confirm", "To confirm"], ["ready_for_review","Ready for review"], ["draft", "Drafts"], ["archived", "Archived"], ["all", "All"]];
const inTab = (l, tab) => tab === "all" || (tab === "to_confirm" ? l.to_confirm === 1 : stateOf(l) === tab);
const REGIONS = { jersey: "Jersey", uk: "United Kingdom", international: "International" };
// The Parish filter's value for listings whose parish is not known (no parish is called this).
const UNKNOWN = "unknown";
const regionOf = c => (c === "Jersey" ? "jersey" : c === "United Kingdom" ? "uk" : "international");
// SPR-06 / SPR-07: the filters beyond Use, Region, Availability and Parish ("" = Any; see listing-filters.js).
const NO_EXTRA = { op: "", bedsFrom: "", bedsTo: "", min: "", max: "", recent: false };
const BEDS = [["0", "Studio"], ...[1, 2, 3, 4, 5, 6].map(n => [String(n), String(n)])];

export default function Listings({ onChange }) {
  const [rows, setRows] = useState(null), [error, setError] = useState(null), [creating, setCreating] = useState(false);
  const [withdrawalTracking,setWithdrawalTracking]=useState(false),[withdrawal,setWithdrawal]=useState(null);
  const [tab, setTab] = useState("published"), [q, setQ] = useState(""), [use, setUse] = useState(""),
    [region, setRegion] = useState(""), [avail, setAvail] = useState(""), [parish, setParish] = useState("");
  const [extra, setExtra] = useState(NO_EXTRA), [msg, setMsg] = useState(null);
  const setX = patch => setExtra(x => ({ ...x, ...patch }));
  const load = () => api("/admin/listings").then(d => {setRows(d.listings);setWithdrawalTracking(d.withdrawal_tracking===true);}, e => setError(e.message));
  useEffect(() => { load(); }, []);
  const act = async (e, l, action, done) => {
    e.currentTarget.closest("details")?.removeAttribute("open");
    if (action === 'unpublish' && withdrawalTracking) {setWithdrawal(l);return;}
    if (action === "archive" && !confirm(`Archive "${l.title}"? It will leave the website; you can restore it later.`)) return;
    setMsg(null);
    try {
      await api(`/admin/listings/${l.id}/${action}`, { method: "POST",body:{updated_at:l.updated_at} }); setMsg({ ok: true, text: `${l.title}: ${done}` });
      await load(); onChange?.(); // the bar's To confirm count
    }
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
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) =>
    [k, (rows || []).filter(l => inTab(l, k)).length])), [rows]);
  if (error) return <p role="alert" className="err">{error}</p>;
  if (!rows) return <p>Loading listings…</p>;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(l => inTab(l, tab) && (!use || l.use === use)
    && (!region || regionOf(l.country) === region) && (!avail || l.availability === avail)
    && (!parish || (parish === UNKNOWN ? l.parish == null : l.parish === parish))
    && (!needle || `${l.id} ${l.title} ${l.location ?? ""}`.toLowerCase().includes(needle)) && passesExtra(l, extra))
    .sort((a, b) => a.id.localeCompare(b.id));
  // Position of each starred listing in the home page's Featured section: published ones with a public photo, in star order.
  const featNo = Object.fromEntries((rows || []).filter(l => stateOf(l) === "published" && l.has_public_photo && l.featured_rank != null)
    .sort((a, b) => a.featured_rank - b.featured_rank).map((l, i) => [l.id, i + 1]));
  const filtered = needle || use || region || avail || parish || Object.entries(extra).some(([k, v]) => v !== NO_EXTRA[k]);
  const clear = () => { setQ(""); setUse(""); setRegion(""); setAvail(""); setParish(""); setExtra(NO_EXTRA); };

  return <section className="listings-screen" aria-labelledby="t-props">
    <div className="head"><h1 id="t-props">Listings</h1>
      <div className="inline"><a className="btn ghost" href="#/queue">Properties Queue</a>
        <button type="button" className="btn" onClick={() => setCreating(true)}>Add new property</button></div></div>
    {creating && <NewProperty rows={rows} onClose={() => { setCreating(false); load(); }} />}
    <div className="seg" role="group" aria-label="Status">{TABS.map(([k, t]) =>
      <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{t}<span className="count">{counts[k]}</span></button>)}</div>
    <div className="filters">
      <label>Search<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Title, HE-R001 or location" /></label>
      <label>Use<select value={use} onChange={e => setUse(e.target.value)}><option value="">All</option>
        {Object.entries(USE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Operation<select value={extra.op} onChange={e => setX({ op: e.target.value })}><option value="">All</option>
        {Object.entries(OPERATION_FILTER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Region<select value={region} onChange={e => setRegion(e.target.value)}><option value="">All</option>
        {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Availability<select value={avail} onChange={e => setAvail(e.target.value)}><option value="">All</option>
        {Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Parish<select value={parish} onChange={e => setParish(e.target.value)}><option value="">Any</option>
        {OPTIONS.parishes.map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value={UNKNOWN}>Unknown</option></select></label>
      <fieldset className="range"><legend>Bedrooms</legend><div>
        <label>From<select value={extra.bedsFrom} onChange={e => { const r = bedsRange(e.target.value, extra.bedsTo); setX({ bedsFrom: r.from, bedsTo: r.to }); }}>
          <option value="">Any</option>{BEDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>To<select value={extra.bedsTo} onChange={e => setX({ bedsTo: e.target.value, ...(extra.bedsFrom !== "" && e.target.value !== "" && +e.target.value < +extra.bedsFrom ? { bedsFrom: e.target.value } : {}) })}>
          <option value="">Any</option>{BEDS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div></fieldset>
      <fieldset className="range"><legend>Price £ <span className="muted">(rent per month)</span></legend><div>
        <label>Min<input type="number" min="0" step="1" inputMode="numeric" value={extra.min} onChange={e => setX({ min: e.target.value })} /></label>
        <label>Max<input type="number" min="0" step="1" inputMode="numeric" value={extra.max} onChange={e => setX({ max: e.target.value })} /></label></div></fieldset>
      <label className="check"><input type="checkbox" checked={extra.recent} onChange={e => setX({ recent: e.target.checked })} />Changed in the last 7 days</label>
    </div>
    <p className="muted" aria-live="polite">{shown.length} {shown.length === 1 ? "listing" : "listings"}</p>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {shown.length ? <table className="list listings">
      <thead><tr><th scope="col"><span className="sr">Photo</span></th><th scope="col">Listing</th><th scope="col">Location</th>
        <th scope="col">Parish</th><th scope="col">Price</th><th scope="col">Availability</th>
        <th scope="col">Checked</th><th scope="col">Matched</th><th scope="col">Interested</th><th scope="col">Visibility</th><th scope="col">Last edited</th>
        <th scope="col"><span className="sr">Actions</span></th></tr></thead>
      <tbody>{shown.map(l => <tr key={l.id}>
        <td>{l.cover_id ? <img className="thumb" src={`/media/${l.cover_id}?thumb`} alt="" loading="lazy" /> : <span className="thumb" />}</td>
        <td><div className="title-cell"><button type="button" className="star" aria-pressed={l.featured_rank != null} disabled={stateOf(l) === "archived"}
          title={l.featured_rank != null ? "In the Featured section of the home page. Click to remove." : "Click to show in the Featured section of the home page."}
          aria-label={`Featured on the home page: ${l.title}${featNo[l.id] ? `, number ${featNo[l.id]}` : ""}`} onClick={() => star(l)}>{l.featured_rank != null ? "★" : "☆"}
          {featNo[l.id] && <sup className="star-no" aria-hidden="true">{featNo[l.id]}</sup>}</button>
          <div><a href={`#/p/${l.id}`}>{l.title}</a>{stateOf(l)==='ready_for_review'&&<span className="badge attention">Ready for review</span>}<div className="meta"><span>{l.id}</span><span>{OPERATION[l.operation]}</span>{bedsLabel(l.bedrooms) && <span>{bedsLabel(l.bedrooms)}</span>}{bathsLabel(l.bathrooms) && <span>{bathsLabel(l.bathrooms)}</span>}</div></div></div></td>
        <td>{l.location || l.country || "—"}</td>
        <td className="parish" data-label="Parish">{l.parish ?? "—"}</td>
        <td className="num">{priceText(l)}</td>
        <td>{AVAILABILITY[l.availability]}{l.to_confirm === 1 && <> <span className="badge attention">To confirm</span></>}
          {l.available_on && l.archived_at == null && ON_MARKET.includes(l.availability) && <div className="muted">Available from {fmtDayMonth(l.available_on)}</div>}</td>
        <td className="stat" data-label="Checked">{daysAgo(l.confirmed_at)}</td>
        <td className="stat num" data-label="Matched">{l.matched}</td>
        <td className="stat num" data-label="Interested">{l.interested}</td>
        <td>{stateOf(l) === "archived" ? <span className="badge archived">{STATUS_LABEL.archived}</span>
          : <button type="button" role="switch" className="switch" aria-checked={stateOf(l) === "published"} aria-label={`Visible on the website: ${l.title}`}
            onClick={e => act(e, l, l.published ? "unpublish" : "publish", l.published ? "hidden from the website." : "now visible on the website (may take a minute).")}>
            <span className="knob" aria-hidden="true" />{stateOf(l) === "published" ? "Visible" : "Hidden"}</button>}
          {stateOf(l) === "published" && !l.has_public_photo && <div className="muted" title="Not shown on the website until it has a visible photo">no photo · not visible</div>}</td>
        <td className="muted">{fmtDate(l.updated_at)}</td>
        <td><details className="more row-menu"><summary aria-label={`Actions for ${l.title}`}>…</summary><div className="menu">
          <a href={`#/p/${l.id}`}>Edit</a>
          {stateOf(l) === "published" && l.has_public_photo ? <a href={`/p/${l.id}`} target="_blank" rel="noopener noreferrer">View on the website</a> : null}
          {l.to_confirm === 1 && <button type="button" onClick={e => act(e, l, "confirm", "confirmed as still available.")}>Still available</button>}
          {stateOf(l) !== "archived" ? <button type="button" onClick={e => act(e, l, "archive", "archived.")}>Archive</button>
            : <button type="button" onClick={e => act(e, l, "restore", "restored as a draft.")}>Restore</button>}
        </div></details></td>
      </tr>)}</tbody>
    </table> : <div className="empty card">{rows.length && filtered
      ? <><p>No listings match these filters.</p><button type="button" className="btn ghost sm" onClick={clear}>Clear filters</button></>
      : tab === "ready_for_review" ? <p>No listings are ready for review.</p>
      : tab === "to_confirm" ? <p>No listings to confirm. A listing on the website asks for a call to its owner 3 months after its last confirmation, or 1 month for a rental.</p>
      : <><p>No {TABS.find(([k]) => k === tab)[1].toLowerCase()} listings.</p>
        {tab !== "archived" && <button type="button" className="btn sm" onClick={() => setCreating(true)}>Add new property</button>}</>}</div>}
    {withdrawal&&<WithdrawalDialog listing={withdrawal} onClose={()=>setWithdrawal(null)} onSaved={async result=>{
      setWithdrawal(null);setMsg({ok:true,text:result.listing.published
        ?`${withdrawal.title}: currently visible on the website. Review its latest state.`:`${withdrawal.title}: hidden from the website.`});await load();onChange?.();
    }}/>}
  </section>;
}
