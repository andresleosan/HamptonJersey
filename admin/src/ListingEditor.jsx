import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, OPERATION, USE, STATUS_LABEL, stateOf, fmtDate, safeHref, show } from "./format.js";
import MediaManager from "./MediaManager.jsx";
import Research from "./Research.jsx";
import { setUnsaved } from "./unsaved.js";
import { OPTIONS, isActive } from "../../server/applicants.js";
import { BuyerOffers } from "./Sales.jsx";

const FIELDS = ["title", "use", "property_type", "operation", "availability", "country", "location", "road_name", "bedrooms",
  "bathrooms", "tenure", "tenure_type", "housing_category", "restriction", "sale_price", "rent", "rent_period", "premium",
  "currency", "price_text", "summary", "description", "tour_url", "specs"];
const NUMERIC = ["bedrooms", "bathrooms", "sale_price", "rent", "premium"];
const toForm = l => Object.fromEntries(FIELDS.map(k => [k, k === "specs" ? l.specs : l[k] ?? ""]));
const toBody = f => Object.fromEntries(FIELDS.map(k => [k,
  NUMERIC.includes(k) ? (f[k] === "" ? null : Number(f[k]))
    : k === "specs" ? f.specs.filter(s => s.label.trim() || s.value.trim())
    : f[k] === "" ? null : f[k]]));
// Sent only when changed in this edit: the server fills an unknown parish from the listing text only when a save leaves
// parish out (B3), so sending the unchanged null on every save would stop that for good.
const IF_CHANGED = ["parish", "matchable"];
const toMatchForm = l => ({ parish: l.parish ?? "", matchable: l.matchable });
const changedMatchForm = (f, l) => Object.fromEntries(IF_CHANGED.filter(k => f[k] !== toMatchForm(l)[k])
  .map(k => [k, k === "parish" ? f.parish || null : f.matchable]));
const SECTIONS = [["details", "Details"], ["price", "Price"], ["description", "Description"], ["photos", "Photos"],
  ["tour", "Tour and specification"], ["offers", "Offers"], ["applicants", "Matched applicants"], ["research", "Research"]];
const OPERATION_LABEL = Object.fromEntries(OPTIONS.operation);
// Match status, with its badge tone (DESIGN.md "Badges de estado": Found and Rejected neutral, Shortlisted active).
const MATCH_STATUS = { found: ["Found", "neutral"], shortlisted: ["Shortlisted", "active"], rejected: ["Rejected", "neutral"] };
// J2: the Jersey fields (server/listing.js ENUMS); blank = not set (for restriction, none).
const TENURE = { freehold: "Freehold", flying_freehold: "Flying freehold", share_transfer: "Share transfer", leasehold: "Leasehold" };
const HOUSING = { qualified: "Qualified", registered: "Registered" };
const RESTRICTION = { first_time_buyer: "First-time buyers only", over_55: "Over 55s only" };
// Housing category and restriction concern homes in Jersey (Control of Housing and Work Law).
const jerseyHome = f => f.use === "residential" && f.country === "Jersey";
const AMOUNT = { sale: ["sale_price", "Add the sale price"], rent: ["rent", "Add the rent"], business: ["premium", "Add the business premium"] };
const MIN_PHOTOS = 5;
// J6 Before you publish: what the listing still lacks, from the form as typed and the photos as saved. [target id, text]:
// a field's id (focused when clicked) or a section's.
function missing(form, parish, photos, coverId) {
  const out = [], blank = v => String(v ?? "").trim() === "";
  const [price, addPrice] = AMOUNT[form.operation] ?? [];
  if (price && blank(form[price])) out.push([`f-${price}`, addPrice]);
  if (form.country === "Jersey" && !parish) out.push(["f-parish", "Choose the parish"]);
  if (form.use === "residential" && blank(form.bedrooms)) out.push(["f-bedrooms", "Add the bedrooms"]);
  if (form.operation === "sale" && !form.tenure_type) out.push(["f-tenure_type", "Choose the tenure"]);
  if (jerseyHome(form) && !form.housing_category) out.push(["f-housing_category", "Choose the housing category"]);
  if (photos.length < MIN_PHOTOS) out.push(["h-photos", `Add photos for the website (${photos.length} of ${MIN_PHOTOS})`]);
  if (!photos.some(m => m.id === coverId)) out.push(["h-photos", "Choose a cover photo"]);
  if (blank(form.summary)) out.push(["f-summary", "Add a summary"]);
  return out;
}
const DONE = { publish: "Published: now on the website (may take a minute).", unpublish: "Unpublished: no longer on the website.",
  archive: "Archived. You can restore it from Archived.", restore: "Restored as a draft." };

export default function ListingEditor({ id }) {
  const [data, setData] = useState(null), [form, setForm] = useState(null), [errors, setErrors] = useState({});
  const [matchForm, setMatchForm] = useState(null), [matchesErr, setMatchesErr] = useState(null);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [loadErr, setLoadErr] = useState(null), [confirmDel, setConfirmDel] = useState("");
  const load = () => api(`/admin/listings/${id}`).then(d => { setData(d); setForm(toForm(d.listing)); setMatchForm(toMatchForm(d.listing)); setErrors({}); },
    e => setLoadErr(e.message));
  useEffect(() => { load(); }, [id]);
  // F3-C: a listing for sale's open offers, sale in progress and every offer ({open, sale, offers}, or {failed}), once the
  // listing is loaded.
  const [offers, setOffers] = useState(null), forSale = data?.listing.operation === "sale";
  useEffect(() => { if (forSale) api(`/admin/listings/${id}/offers`).then(setOffers, () => setOffers({ failed: true })); }, [forSale]);
  const matchesReq = useRef(0);
  const photos = useRef({ dirty: false }), [photosDirty, setPhotosDirty] = useState(false);
  const fieldsDirty = !!data && !!form && (JSON.stringify(toBody(form)) !== JSON.stringify(toBody(toForm(data.listing)))
    || Object.keys(changedMatchForm(matchForm, data.listing)).length > 0);
  const dirty = fieldsDirty || photosDirty;
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);

  if (loadErr) return <p role="alert" className="err">{loadErr} · <a href="#/listings">Back to listings</a></p>;
  if (!data) return <p>Loading listing…</p>;
  const l = data.listing, state = stateOf(l);
  const setListing = listing => { setData(d => ({ ...d, listing })); setForm(toForm(listing)); setMatchForm(toMatchForm(listing)); setErrors({}); };
  // A save or a state change recomputes the listing's matches; only the detail read returns them.
  // Only the latest read counts, so two quick saves can't leave the older list showing.
  const reloadMatches = () => {
    const req = ++matchesReq.current, latest = () => req === matchesReq.current;
    api(`/admin/listings/${id}`).then(d => { if (latest()) { setData(x => ({ ...x, matched_applicants: d.matched_applicants })); setMatchesErr(null); } },
      e => { if (latest()) setMatchesErr(`Couldn't reload the matched applicants: ${e.message}`); });
  };

  // One Save for fields and photos: fields first, then photos with the updated_at the fields save returned.
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      let at = l.updated_at;
      if (fieldsDirty) {
        const body = { ...toBody(form), ...changedMatchForm(matchForm, l), updated_at: at };
        const saved = (await api(`/admin/listings/${id}`, { method: "PUT", body })).listing;
        setListing(saved); at = saved.updated_at; reloadMatches();
      }
      if (photos.current.dirty && !(await photos.current.save(at))) return setMsg({ text: "The photos weren't saved: see the message under Photos." });
      setMsg({ ok: true, text: "Changes saved." });
    }
    catch (e) { setErrors(e.data?.fields || {}); setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  const discard = () => { setForm(toForm(l)); setMatchForm(toMatchForm(l)); setErrors({}); photos.current.discard?.(); setMsg(null); };
  const act = async action => {
    if (action === "archive" && !confirm("Archive this listing? It will leave the website; you can restore it later.")) return;
    setBusy(true); setMsg(null);
    try {
      setListing((await api(`/admin/listings/${id}/${action}`, { method: "POST" })).listing); reloadMatches();
      setMsg({ ok: true, text: action === "publish" && !publicPhoto
        ? "Published, but it won't appear on the website until it has a visible photo." : DONE[action] });
    }
    catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  const destroy = async e => {
    e.preventDefault(); setBusy(true);
    try { await api(`/admin/listings/${id}`, { method: "DELETE", body: { confirm: confirmDel } }); location.hash = "#/listings"; }
    catch (x) { setMsg({ text: x.message }); setBusy(false); }
  };

  const ctl = (k, extra = {}) => ({
    id: `f-${k}`, value: form[k], "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `e-${k}` : undefined,
    onChange: e => setForm(f => ({ ...f, [k]: e.target.value })), ...extra });
  const field = (k, label, input) => <div className="field" key={k}><label htmlFor={`f-${k}`}>{label}</label>{input}
    {errors[k] && <small id={`e-${k}`} className="err">{errors[k]}</small>}</div>;
  const options = obj => Object.entries(obj).map(([k, v]) => <option key={k} value={k}>{v}</option>);
  const publicPhotos = data.media.filter(m => m.public && m.kind === "photo" && m.r2_key && m.origin !== "external");
  const publicPhoto = publicPhotos.length > 0;
  const todo = state === "archived" ? [] : missing(form, matchForm.parish, publicPhotos, l.cover_media_id);
  const goTo = id => { const el = document.getElementById(id); el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: "smooth", block: "center" }); };
  // The housing fields and the first-time buyers option also show while they hold a value, so it can be cleared.
  const home = jerseyHome(form), was = !form.tenure_type && form.tenure;
  const ftb = form.operation === "sale" || form.restriction === "first_time_buyer";
  const cover = data.media.find(m => m.id === l.cover_media_id) || data.media.find(m => m.kind === "photo" && m.r2_key);

  return <div className="editor">
    <aside className="side card">
      {cover ? <img src={`/media/${cover.id}?thumb`} alt="" /> : <div className="thumb big" />}
      <h1>{l.title}</h1>
      <p className="muted">{l.id} · <span className={`badge ${state}`}>{STATUS_LABEL[state]}</span></p>
      <p className="muted">Edited {fmtDate(l.updated_at)}</p>
      {/* C10: people with a viewing coming up, or one in the last 30 days that went well; the link lists them. */}
      <p className="muted">Active interest: <a href={`#/viewings?listing=${l.id}`}>{data.active_interest} {data.active_interest === 1 ? "person" : "people"}</a></p>
      {forSale && offers?.failed && <p className="muted">Offers couldn't be loaded</p>}
      {forSale && offers && !offers.failed && <p className="muted">Offers: <a href="#/sales">{offers.open} open {offers.open === 1 ? "offer" : "offers"}</a>
        {offers.sale && <> · <a href={`#/sales/${offers.sale.id}`}>Sale in progress</a></>}</p>}
      {l.published === 1 && !publicPhoto && <p className="warn" role="note">Published, but with no public photo: it won't appear on the website until it has one.</p>}
      {data.duplicates.length > 0 && <p className="warn" role="note">Possible duplicate of {data.duplicates.map((d, i) =>
        <span key={d}>{i ? ", " : ""}<a href={`#/p/${d}`}>{d}</a></span>)} according to the research.</p>}
      <nav aria-label="Listing sections">{SECTIONS.filter(([k]) => forSale || k !== "offers").map(([k, t]) =>
        <button key={k} type="button" className="linkish" onClick={() => document.getElementById(`s-${k}`).scrollIntoView({ behavior: "smooth" })}>{t}</button>)}</nav>
      {/* O1: the owner's printable report, 30 days by default. */}
      <a className="btn ghost sm" href={`#/listings/${encodeURIComponent(l.id)}/report?days=30`}>Owner report</a>
      <a href="#/listings">← Back to listings</a>
    </aside>

    <div className="sections">
      {todo.length > 0 && <section className="card prepub" aria-labelledby="h-prepub">
        <h2 id="h-prepub">Before you publish</h2>
        <p className="muted">Missing from this listing. You can still publish without them.</p>
        <ul>{todo.map(([target, text]) => <li key={text}>
          <button type="button" className="linkish" onClick={() => goTo(target)}>{text}</button></li>)}</ul>
      </section>}
      <section id="s-details" className="card" aria-labelledby="h-details"><h2 id="h-details">Details</h2><div className="grid2">
        {field("title", "Title", <input {...ctl("title")} maxLength={200} required />)}
        {field("property_type", "Type (house, flat, restaurant…)", <input {...ctl("property_type")} maxLength={100} />)}
        {field("use", "Use", <select {...ctl("use")}>{options(USE)}</select>)}
        {field("operation", "Operation", <select {...ctl("operation")}>{options(OPERATION)}</select>)}
        {field("availability", "Availability", <select {...ctl("availability")}>{options(AVAILABILITY)}</select>)}
        {field("tenure_type", "Tenure", <><select {...ctl("tenure_type", was ? { "aria-describedby": `d-tenure${errors.tenure_type ? " e-tenure_type" : ""}` } : {})}>
          <option value="">Not set</option>{options(TENURE)}</select>
          {was && <small id="d-tenure" className="muted">Was: {form.tenure}</small>}</>)}
        {(home || form.housing_category) && field("housing_category", "Housing category", <><select {...ctl("housing_category", { "aria-describedby": `d-housing${errors.housing_category ? " e-housing_category" : ""}` })}>
          <option value="">Not set</option>{options(HOUSING)}</select>
          <small id="d-housing" className="muted">Qualified homes are only open to some residential statuses; Registered homes are open to all.</small></>)}
        {(home || form.restriction) && field("restriction", "Restriction", <><select {...ctl("restriction")}><option value="">None</option>
          {ftb && <option value="first_time_buyer">{RESTRICTION.first_time_buyer}</option>}
          <option value="over_55">{RESTRICTION.over_55}</option></select>
          {form.restriction === "first_time_buyer" && form.operation !== "sale" && <small className="muted">Applies to sales only.</small>}</>)}
        {field("country", "Country", <input {...ctl("country")} maxLength={100} />)}
        {field("location", "Location", <input {...ctl("location")} maxLength={200} />)}
        {field("road_name", "Road", <input {...ctl("road_name")} maxLength={200} />)}
        {field("parish", "Parish", <select id="f-parish" value={matchForm.parish} aria-invalid={errors.parish ? true : undefined}
          aria-describedby={errors.parish ? "e-parish" : undefined} onChange={e => setMatchForm(x => ({ ...x, parish: e.target.value }))}>
          <option value="">Unknown</option>{OPTIONS.parishes.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>)}
        {field("bedrooms", "Bedrooms", <input {...ctl("bedrooms")} type="number" min="0" max="100" step="1" inputMode="numeric" />)}
        {field("bathrooms", "Bathrooms", <input {...ctl("bathrooms")} type="number" min="0" max="100" step="1" inputMode="numeric" />)}
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

      <section id="s-photos" className="card" aria-labelledby="h-photos"><h2 id="h-photos" tabIndex={-1}>Photos</h2>
        <MediaManager listingId={id} media={data.media} coverId={l.cover_media_id} updatedAt={l.updated_at}
          register={p => { photos.current = p; setPhotosDirty(p.dirty); }}
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

      {/* Spec §1: every offer on the listing with what became of it, newest first; they are answered in Sales. */}
      {forSale && <section id="s-offers" className="card" aria-labelledby="h-offers">
        <h2 id="h-offers">Offers {offers?.offers && <span className="muted">({offers.offers.length})</span>}</h2>
        {!offers ? <p>Loading offers…</p> : offers.failed ? <p className="muted">Offers couldn't be loaded</p>
          : offers.offers.length ? <BuyerOffers rows={offers.offers} labelledBy="h-offers" />
          : <p className="muted">No offers on this listing yet. Record one in <a href="#/sales">Sales</a>.</p>}
      </section>}

      <section id="s-applicants" className="card" aria-labelledby="h-applicants">
        <h2 id="h-applicants">Matched applicants <span className="muted">({data.matched_applicants.length})</span></h2>
        <div className="offer"><span id="l-offer" className="lbl-like">Offer to applicants</span>
          <button type="button" role="switch" className="switch" aria-checked={matchForm.matchable === 1} aria-labelledby="l-offer"
            aria-invalid={errors.matchable ? true : undefined} aria-describedby={errors.matchable ? "d-offer e-matchable" : "d-offer"}
            onClick={() => setMatchForm(x => ({ ...x, matchable: x.matchable === 1 ? 0 : 1 }))}>
            <span className="knob" aria-hidden="true" />{matchForm.matchable === 1 ? "Offered" : "Not offered"}</button>
          <span id="d-offer" className="muted">When on, active applicants' searches are matched with this listing. Turning it off removes its matches nobody has reviewed yet.</span></div>
        {errors.matchable && <p id="e-matchable" className="err">{errors.matchable}</p>}
        {matchesErr && <p role="alert" className="err">{matchesErr}</p>}
        <MatchedApplicants rows={data.matched_applicants} offered={l.matchable === 1} />
      </section>

      <section id="s-research" className="card" aria-labelledby="h-inv"><h2 id="h-inv">Research <span className="muted">(read only)</span></h2>
        <Research data={data} />
      </section>
    </div>

    <div className="actionbar" role="region" aria-label="Actions">
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
      {dirty && <span className="unsaved">Unsaved changes</span>}
      <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</button>
      {dirty && <button type="button" className="btn ghost" onClick={discard} disabled={busy}>Discard</button>}
      {state !== "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} title={dirty ? "Save first" : undefined}
        onClick={() => act(l.published ? "unpublish" : "publish")}>{l.published ? "Unpublish" : "Publish"}</button>}
      {state !== "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} onClick={() => act("archive")}>Archive</button>}
      {state === "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} title={dirty ? "Save first" : undefined} onClick={() => act("restore")}>Restore</button>}
      {state === "archived" && <form className="inline" onSubmit={destroy}>
        <label htmlFor="del-confirm">To delete permanently, type {l.id}</label>
        <input id="del-confirm" value={confirmDel} onChange={e => setConfirmDel(e.target.value)} autoComplete="off" />
        <button className="btn ghost danger" disabled={confirmDel !== l.id || busy}>Delete permanently</button></form>}
    </div>
  </div>;
}

// Spec §5: how many applicants match this listing and which, with their status. Best first, as the API orders them. A
// closed search says so: its matches are kept but no longer reviewed.
function MatchedApplicants({ rows, offered }) {
  const note = !offered && <p className="muted">This listing isn't offered to applicants.</p>;
  if (!rows.length) return note || <p className="muted">No applicants match this listing yet.</p>;
  return <>{note}
    <table className="list small matched">
      <thead><tr><th scope="col">Applicant</th><th scope="col">Looking</th><th scope="col">Status</th><th scope="col">Score</th></tr></thead>
      <tbody>{rows.map(m => { const [label, tone] = MATCH_STATUS[m.status] ?? [m.status, "neutral"];
        return <tr key={m.match_id}>
          <td><a href={`#/applicants/${m.applicant_id}/matches`}>{m.name}</a>
            {!isActive(m) && <span className="muted"> · {m.archived_at ? "Archived" : show("stage", m.stage)}</span>}</td>
          <td>{OPERATION_LABEL[m.operation] ?? m.operation ?? "—"}</td>
          <td><span className={`badge ${tone}`}>{label}</span></td>
          <td className="num">{m.score}</td>
        </tr>; })}</tbody>
    </table></>;
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
