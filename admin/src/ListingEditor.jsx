import { ECONOMIC_FIELDS, economicValue } from '../../server/listing-economics.js';
import { priceOperation } from "../../server/listing-pricing.js";
import { derivePricePerArea, formatPricePerArea, formatPremiumPerArea } from "../../server/listing-price-area.js";
import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { AVAILABILITY, OPERATION, USE, STATUS_LABEL, stateOf, fmtDate, fmtDayMonth, safeHref, show, TENURE, HOUSING, RESTRICTION } from "./format.js";
import MediaManager from "./MediaManager.jsx";
import ListingDocuments from "./ListingDocuments.jsx";
import { listingCriteria, listingCompleteness } from "./listing-completeness.js";
import Research from "./Research.jsx";
import { setUnsaved } from "./unsaved.js";
import { OPTIONS, isActive } from "../../server/applicants.js";
import { ON_MARKET } from "../../server/listing.js";
import { jerseyToday } from "../../server/viewings.js";
import { BuyerOffers } from "./Sales.jsx";
import HermesDraft from "./HermesDraft.jsx";
import ViewingAvailability from "./ViewingAvailability.jsx";
import ListingReview from './ListingReview.jsx';
import RentalMarketing from './RentalMarketing.jsx';
import ListingHistory from './ListingHistory.jsx';
import WithdrawalDialog, { WithdrawalHistory } from './WithdrawalDialog.jsx';
import {isRentalMarketing} from '../../server/listing-editorial.js';
import { normalizePostcode, PROPERTY_CONDITION_LABELS } from '../../server/listing-details.js';
import { squareMetres } from '../../server/listing-physical.js';
import ListingContentFields from './ListingContentFields.jsx';
import ResearchDuplicateReview from './ResearchDuplicateReview.jsx';
import { listingGuideSteps, guideStepForSection } from "./listing-guide.js";
import { CONTENT_TAGS } from '../../server/listing-content.js';

const FIELDS = ["title", "use", "property_type", "operation", "availability", "country", "location", "road_name", "bedrooms",
  "bathrooms", "tenure", "tenure_type", "housing_category", "restriction", "sale_price", "rent", "rent_period", "premium",
  "currency", "price_text", "price_per_sqft", "rental_deposit", "parish_rates", "service_charge", "utilities_included", "available_on", "summary", "description", "tour_url", "specs", "viewings_enabled", "viewing_hours",
  "interior_area_sqft", "separate_wcs", "reception_rooms", "has_garage", "has_storage", "has_lift", "double_glazing",
  "floor_level", "building_floors", "year_built", "heating_types", "amenities", "feature_overrides"];
const NUMERIC = ["bedrooms", "bathrooms", "sale_price", "rent", "premium", "interior_area_sqft", "separate_wcs",
  "reception_rooms", "has_garage", "has_storage", "has_lift", "double_glazing", "floor_level", "building_floors", "year_built",
  "rental_deposit_amount", "parish_rates_amount", "service_charge_amount"];
// Keep custom hours while the form temporarily uses general availability. This draft-only key is not sent by toBody,
// and toForm resets it on load, a successful save and Discard.
const toForm = (l, structured = false) => ({ ...Object.fromEntries([...FIELDS, ...(structured ? ECONOMIC_FIELDS : [])].map(k => [k, k === "specs" ? l.specs
  : k === "viewings_enabled" ? l[k] ?? 1 : k === "viewing_hours" ? l[k] ?? null : k === 'feature_overrides' ? structuredClone(l[k] ?? {}) : l[k] ?? ""])),
  viewing_hours_draft: l.viewing_hours ?? [] });
const DETAIL_FIELDS = ["building_name_or_number", "postcode", "property_condition", "developer_name"];
const toDetailsForm = d => Object.fromEntries(DETAIL_FIELDS.map(k => [k, d?.[k] ?? ""]));
const toDetailsBody = d => Object.fromEntries(DETAIL_FIELDS.map(k => [k, d[k] === "" ? null : d[k]]));
const toContentForm = c => ({tags:Array.isArray(c?.tags) ? [...c.tags] : [],video_url:c?.video_url ?? ''});
const toContentBody = c => ({tags:Object.keys(CONTENT_TAGS).filter(tag=>c.tags.includes(tag)),video_url:c.video_url || null});
const toBody = f => Object.fromEntries([...FIELDS, ...ECONOMIC_FIELDS.filter(k => Object.hasOwn(f, k))].map(k => [k,
  NUMERIC.includes(k) ? (f[k] === "" ? null : Number(f[k]))
    : k === "specs" ? f.specs.filter(s => s.label.trim() || s.value.trim())
    : f[k] === "" ? null : f[k]]));
// Sent only when changed in this edit: the server fills an unknown parish from the listing text only when a save leaves
// parish out (B3), so sending the unchanged null on every save would stop that for good.
const IF_CHANGED = ["parish", "matchable"];
const toMatchForm = l => ({ parish: l.parish ?? "", matchable: l.matchable });
const changedMatchForm = (f, l) => Object.fromEntries(IF_CHANGED.filter(k => f[k] !== toMatchForm(l)[k])
  .map(k => [k, k === "parish" ? f.parish || null : f.matchable]));
const SECTIONS = [["details", "Details"], ["internal-address", "Internal property details"], ["physical", "Physical details"], ["price", "Price"], ["description", "Description"], ["photos", "Photos"],
  ["tour", "Tour and specification"], ["viewings", "Viewings"], ["offers", "Offers"], ["applicants", "Matched applicants"], ["research", "Research"], ["history", "History"]];
const OPERATION_LABEL = Object.fromEntries(OPTIONS.operation);
// Match status, with its badge tone (DESIGN.md "Badges de estado": Found and Rejected neutral, Shortlisted active).
const MATCH_STATUS = { found: ["Found", "neutral"], shortlisted: ["Shortlisted", "active"], rejected: ["Rejected", "neutral"] };
// J2: the Jersey fields (server/listing.js ENUMS, labels in format.js); blank = not set (for restriction, none).
// Housing category and restriction concern homes in Jersey (Control of Housing and Work Law).
const jerseyHome = f => f.use === "residential" && f.country === "Jersey";
const DONE = { publish: "Published: now on the website (may take a minute).", unpublish: "Unpublished: no longer on the website.",
  archive: "Archived. You can restore it from Archived.", restore: "Restored as a draft." };

export default function ListingEditor({ id, onChange, guide = false }) {
  const [guideEnabled, setGuideEnabled] = useState(guide), [guideStep, setGuideStep] = useState(0);
  useEffect(() => { setGuideEnabled(guide); setGuideStep(0); }, [id, guide]);
  const [data, setData] = useState(null), [form, setForm] = useState(null), [errors, setErrors] = useState({});
  const [detailsForm, setDetailsForm] = useState(null);
  const [contentForm,setContentForm] = useState(null);
  const [addressReview, setAddressReview] = useState(null), [addressReviewError, setAddressReviewError] = useState(null);
  const [addressEvidenceRef, setAddressEvidenceRef] = useState(""), [addressReviewAuthorized, setAddressReviewAuthorized] = useState(false);
  const [matchForm, setMatchForm] = useState(null), [matchesErr, setMatchesErr] = useState(null);
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [loadErr, setLoadErr] = useState(null), [confirmDel, setConfirmDel] = useState("");
  const [costCurrencyReview, setCostCurrencyReview] = useState(null);
  const [confirming, setConfirming] = useState(false); // ADM-04: its own flag, so Save never reads "Saving…" meanwhile
  const [withdrawalOpen,setWithdrawalOpen]=useState(false);
  const marketingFocus=useRef(false);
  const guideToggle=useRef(null);
  const errorFocus=useRef(null);
  const [historyKey,setHistoryKey]=useState(0),[deleted,setDeleted]=useState(false);
  const historyChanged=()=>setHistoryKey(k=>k+1);
  const loadRequest=useRef(0);
  useEffect(()=>{if(marketingFocus.current){document.getElementById('h-rental-marketing')?.focus();marketingFocus.current=false;}},[data?.listing.updated_at]);
  useEffect(()=>{
    if(!errorFocus.current) return;
    const element=document.getElementById(`f-${errorFocus.current}`);errorFocus.current=null;
    if(!element) return;
    if (guideEnabled) { const step = guideStepForSection(element.closest("section[id]")?.id); if (step !== null) setGuideStep(step); }
    element.focus({preventScroll:true});
    (element.closest('.field') || element).scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
  },[errors]);
  const load = async () => {
    const n=++loadRequest.current;
    setLoadErr(null);
    try {const d=await api(`/admin/listings/${id}`);if(n!==loadRequest.current)return;
      if (!Array.isArray(d.media)) throw new Error("Listing photos could not be loaded. Reload and try again.");
      setData(d);setForm(toForm(d.listing, d.structured_economics));setDetailsForm(toDetailsForm(d.details));setContentForm(d.content_tracking ? toContentForm(d.content) : null);setAddressReview(null);setAddressReviewError(null);
      setAddressEvidenceRef("");setAddressReviewAuthorized(false);setMatchForm(toMatchForm(d.listing));setErrors({});setDeleted(false);historyChanged();
    } catch(e) {
      if(n!==loadRequest.current)return;
      if(e.status===404)try {
        const h=await api(`/admin/listings/${id}/history`);if(n!==loadRequest.current)return;
        if(h.listing.state==='deleted'){
          // Same-ID Reload does not unmount this editor. Discard its obsolete draft and unsaved-photo registration.
          matchesReq.current++;marketingFocus.current=false;photos.current={dirty:false};
          setData(null);setForm(null);setDetailsForm(null);setContentForm(null);setAddressReview(null);setAddressReviewError(null);setAddressEvidenceRef("");
          setAddressReviewAuthorized(false);setMatchForm(null);setPhotosDirty(false);setOffers(null);
          setErrors({});setMatchesErr(null);setMsg(null);setConfirmDel('');setDeleted(true);return;
        }
      } catch(historyError) {if(n===loadRequest.current)setLoadErr(historyError.message);return;}
      setLoadErr(e.message);
    }
  };
  useEffect(() => { load();return ()=>{loadRequest.current++;}; }, [id]);
  // F3-C: a listing for sale's open offers, sale in progress and every offer ({open, sale, offers}, or {failed}), once the
  // listing is loaded.
  const [offers, setOffers] = useState(null), forSale = data?.listing.operation === "sale";
  useEffect(() => { if (forSale) api(`/admin/listings/${id}/offers`).then(setOffers, () => setOffers({ failed: true })); }, [forSale]);
  const matchesReq = useRef(0);
  const photos = useRef({ dirty: false }), [photosDirty, setPhotosDirty] = useState(false);
  const fieldsDirty = !!data && !!form && (JSON.stringify(toBody(form)) !== JSON.stringify(toBody(toForm(data.listing, data.structured_economics)))
    || Object.keys(changedMatchForm(matchForm, data.listing)).length > 0);
  const detailsDirty = !!data && !!detailsForm && JSON.stringify(toDetailsBody(detailsForm)) !== JSON.stringify(toDetailsBody(toDetailsForm(data.details)));
  const contentDirty = !!data?.content_tracking && !!contentForm && JSON.stringify(toContentBody(contentForm)) !== JSON.stringify(toContentBody(toContentForm(data.content)));
  const saveDirty = fieldsDirty || detailsDirty || contentDirty || photosDirty;
  const addressReviewDirty = !!addressReview && (!!addressReviewAuthorized || !!addressEvidenceRef.trim());
  const dirty = saveDirty || addressReviewDirty;
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);

  if (loadErr) return <p role="alert" className="err">{loadErr}<br /><a href="#/listings">Back to listings</a></p>;
  if (deleted) return <div><h1>{id}</h1><p>Property deleted. Its recorded history is kept.</p>
    <p><a href="#/listings">Back to listings</a></p><ListingHistory key={id} id={id}/></div>;
  if (!data) return <p>Loading listing…</p>;
  const l = data.listing, state = stateOf(l);
  const needsCostCurrencyReview = data.structured_economics && (form.currency || null) !== (l.currency || null) &&
    ['rental_deposit_amount', 'parish_rates_amount', 'service_charge_amount'].some(key => l[key] != null);
  const costCurrencyReviewKey = JSON.stringify([l.updated_at, form.currency, ...ECONOMIC_FIELDS.map(key => form[key])]);
  const setListing = (listing, details, content) => { setData(d => ({ ...d, listing, ...(details ? { details } : {}), ...(content ? {content} : {}) }));
    setForm(toForm(listing, data.structured_economics)); if (content) setContentForm(toContentForm(content));
    if (details) { setDetailsForm(toDetailsForm(details)); setAddressReview(null); setAddressReviewError(null);
      setAddressEvidenceRef(""); setAddressReviewAuthorized(false); }
    setMatchForm(toMatchForm(listing)); setErrors({}); historyChanged(); };
  // A save or a state change recomputes the listing's matches; only the detail read returns them.
  // Only the latest read counts, so two quick saves can't leave the older list showing.
  const reloadMatches = () => {
    const req = ++matchesReq.current, latest = () => req === matchesReq.current;
    api(`/admin/listings/${id}`).then(d => { if (latest()) { setData(x => ({ ...x, matched_applicants: d.matched_applicants })); setMatchesErr(null); } },
      e => { if (latest()) setMatchesErr(`Couldn't reload the matched applicants: ${e.message}`); });
  };

  // One Save for fields and photos: fields first, then photos with the updated_at the fields save returned.
  const save = async () => {
    const draftErrors = {};
    if (needsCostCurrencyReview && costCurrencyReview !== costCurrencyReviewKey)
      draftErrors.currency = 'Review all staff-only costs and confirm the currency change';
    if (data.structured_economics) for (const key of ['rental_deposit_amount', 'parish_rates_amount', 'service_charge_amount']) {
      const raw = form[key];
      if (raw === '') continue;
      // Keep decimal text exact until it has passed validation; do not let an
      // exponent underflow or Infinity serialize to a fictitious zero/null.
      if (!/^\d+(?:\.\d{1,2})?$/.test(String(raw))) { draftErrors[key] = 'Enter an amount with up to 2 decimal places'; continue; }
      try { economicValue(key, Number(raw)); } catch (error) { draftErrors[key] = error.message; }
    }
    for (const key of ['heating_types', 'amenities']) if (Array.isArray(form[key]) && form[key].includes(''))
      draftErrors[key] = 'Choose at least one value, or choose None or Unknown';
    for (const key of ['pets', 'parking', 'furnished']) if (form.feature_overrides[key] === '')
      draftErrors[`manual_${key}`] = 'Choose a manual value or another mode';
    if (typeof form.feature_overrides.parking === 'number' && (!Number.isInteger(form.feature_overrides.parking)
      || form.feature_overrides.parking < 0 || form.feature_overrides.parking > 10000))
      draftErrors.manual_parking = 'Enter a whole number from 0 to 10000';
    if (Object.keys(draftErrors).length) {
      errorFocus.current = Object.keys(draftErrors)[0]; setErrors(draftErrors); return;
    }
    setBusy(true); setMsg(null);
    try {
      let at = l.updated_at;
      if (fieldsDirty || detailsDirty || contentDirty) {
        const body = { ...(fieldsDirty ? { ...toBody(form), ...changedMatchForm(matchForm, l) } : {}),
          ...(detailsDirty ? { details: toDetailsBody(detailsForm) } : {}),
          ...(contentDirty ? {content:toContentBody(contentForm)} : {}),
          ...(needsCostCurrencyReview ? {confirm_structured_currency_change:true} : {}), updated_at: at };
        const saved = await api(`/admin/listings/${id}`, { method: "PUT", body });
        setListing(saved.listing, saved.details, saved.content); at = saved.listing.updated_at;
        if (fieldsDirty) reloadMatches(); onChange?.(); // a new price or availability confirms it
      }
      if (photos.current.dirty && !(await photos.current.save(at))) return setMsg({ text: "The photos weren't saved: see the message under Photos." });
      setMsg({ ok: true, text: "Changes saved." });
    }
    catch (e) { const fields=e.data?.fields || {};errorFocus.current=Object.keys(fields).find(k=>document.getElementById(`f-${k}`))??null;
      setErrors(fields); setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  const discard = () => { setForm(toForm(l, data.structured_economics)); setDetailsForm(toDetailsForm(data.details));
    setContentForm(data.content_tracking ? toContentForm(data.content) : null); setAddressReview(null); setAddressReviewError(null);
    setAddressEvidenceRef(""); setAddressReviewAuthorized(false);
    setMatchForm(toMatchForm(l)); setErrors({}); photos.current.discard?.(); setMsg(null); };
  const act = async action => {
    if (action === 'unpublish' && data.withdrawal_tracking) {setWithdrawalOpen(true);return;}
    if (action === "archive" && !confirm("Archive this listing? It will leave the website; you can restore it later.")) return;
    setBusy(true); setMsg(null);
    try {
      const result = await api(`/admin/listings/${id}/${action}`, { method: "POST",body:{updated_at:l.updated_at} });
      setListing(result.listing, result.details); reloadMatches(); onChange?.();
      setMsg({ ok: true, text: DONE[action] });
    }
    catch (e) { setMsg({ text: e.message,reload:e.status===409 }); }
    finally { setBusy(false); }
  };
  const review = async action => {
    setBusy(true);setMsg(null);
    try{setListing((await api(`/admin/listings/${id}/review`,{method:'POST',body:{action,updated_at:l.updated_at}})).listing);
      onChange?.();setMsg({ok:true,text:action==='submit_review'?'Ready for review. Still hidden from the website.':'Returned to draft.'});}
    catch(e){setMsg({text:e.message,reload:e.status===409});}
    finally{setBusy(false);}
  };
  const openAddressReview = async () => {
    if (busy || dirty || state !== "published" || !publicPhoto) return;
    setBusy(true); setAddressReviewError(null);
    try {
      const preview = await api(`/admin/listings/${id}/address-review`);
      setAddressReview(preview); setAddressEvidenceRef(""); setAddressReviewAuthorized(false);
    } catch (e) { setAddressReviewError(e.message); }
    finally { setBusy(false); }
  };
  const authorizeAddressReview = async () => {
    if (!addressReview || busy) return;
    setBusy(true); setAddressReviewError(null); setMsg(null);
    try {
      const result = await api(`/admin/listings/${id}/address-review`, { method: "POST", body: {
        action: "authorize", expected_at: addressReview.expected_at, public_snapshot_hash: addressReview.public_snapshot_hash,
        address_publication_authorized: addressReviewAuthorized, evidence_ref: addressEvidenceRef.trim(),
      } });
      setListing(result.listing, result.details); onChange?.();
      setMsg({ ok: true, text: "Public exact address reviewed and published." });
    } catch (e) { setAddressReviewError(e.message); }
    finally { setBusy(false); }
  };
  const revokeAddressReview = async () => {
    setBusy(true); setAddressReviewError(null); setMsg(null);
    try {
      const result = await api(`/admin/listings/${id}/address-review`, { method: "POST", body: {
        action: "revoke", expected_at: l.updated_at,
      } });
      setListing(result.listing, result.details); onChange?.();
      setMsg({ ok: true, text: "Public exact address removed." });
    } catch (e) { setAddressReviewError(e.message); }
    finally { setBusy(false); }
  };
  // PUB-21 (D11, C8): a draft from Properties Queue is published from here, with the queue's minimum.
  const approve = async () => {
    setBusy(true); setMsg(null);
    try {
      setListing((await api(`/admin/queue/${data.queue.id}/approve`, { method: "POST",body:{updated_at:l.updated_at} })).listing);
      setData(d => ({ ...d, queue: null })); reloadMatches(); onChange?.();
      setMsg({ ok: true, text: "Approved and published: now on the website (may take a minute)." });
    }
    catch (e) { setMsg({ text: e.data?.missing ? `Complete before publishing: ${e.data.missing.join(", ")}.` : e.message,reload:e.status===409 }); }
    finally { setBusy(false); }
  };
  // ADM-04: after a call to the owner. Only confirmed_at changes, so whatever is being typed stays (T11).
  const stillAvailable = async () => {
    setConfirming(true); setMsg(null);
    try {
      const { confirmed_at } = await api(`/admin/listings/${id}/confirm`, { method: "POST" });
      setData(d => ({ ...d, listing: { ...d.listing, confirmed_at, to_confirm: 0 } }));
      historyChanged();
      setMsg({ ok: true, text: `${l.title}: confirmed as still available.` }); onChange?.();
    }
    catch (e) { setMsg({ text: e.message }); }
    finally { setConfirming(false); }
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
  const detailCtl = (k, extra = {}) => ({ id: `f-${k}`, value: detailsForm[k], "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `e-${k}` : undefined,
    onChange: e => setDetailsForm(f => ({ ...f, [k]: e.target.value })), ...extra });
  const detailField = (k, label, input) => <div className="field" key={k}><label htmlFor={`f-${k}`}>{label}</label>{input}
    {errors[k] && <small id={`e-${k}`} className="err">{errors[k]}</small>}</div>;
  const options = obj => Object.entries(obj).map(([k, v]) => <option key={k} value={k}>{v}</option>);
  const publicPhotos = data.media.filter(m => m.public && m.kind === "photo" && m.r2_key && m.origin !== "external");
  const publicPhoto = publicPhotos.length > 0;
  const criteria = listingCriteria(form, matchForm.parish, data.media, l.cover_media_id);
  const completeness = listingCompleteness(criteria);
  const todo = criteria.filter(c => c.met === false);
  const goTo = id => {
    const el = document.getElementById(id), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
  };
  // The housing fields and the first-time buyers option also show while they hold a value, so it can be cleared.
  const home = jerseyHome(form), was = !form.tenure_type && form.tenure;
  const ftb = form.operation === "sale" || form.restriction === "first_time_buyer";
  const salesOnly = form.restriction === "first_time_buyer" && form.operation !== "sale";
  const cover = data.media.find(m => m.id === l.cover_media_id) || data.media.find(m => m.kind === "photo" && m.r2_key);
  // ADM-04: the Jersey day of the last confirmation, shown on a published listing still on the market (T12).
  const checked = l.confirmed_at && fmtDayMonth(jerseyToday(new Date(l.confirmed_at)));
  const onMarket = state === "published" && ON_MARKET.includes(l.availability) && checked;
  const parishLabel = OPTIONS.parishes.find(([key]) => key === matchForm.parish)?.[1];
  const internalParts = [detailsForm.building_name_or_number, form.road_name, form.location, parishLabel,
    detailsForm.postcode, form.country].map(value => String(value ?? "").trim()).filter(Boolean);
  const internalAddress = internalParts.filter((part, index) =>
    internalParts.findIndex(value => value.toLowerCase() === part.toLowerCase()) === index).join(", ");
  const savedPublicAddress = data.details.public_address_snapshot;
  let postcodeHint = null;
  if (form.country === "Jersey" && detailsForm.postcode.trim()) {
    try { if (normalizePostcode(detailsForm.postcode, "Jersey")) postcodeHint = "Format checked only. The address has not been verified."; }
    catch { /* Invalid codes are reported by the server on Save. */ }
  }

  return <div className="editor">
    <aside className="side card">
      {cover ? <img src={`/media/${cover.id}?thumb`} alt="" /> : <div className="thumb big" />}
      <h1 id="h-editor" tabIndex={-1}>{l.title}</h1>
      <p className="meta"><span>{l.id}</span><span><span className={`badge ${state}`}>{STATUS_LABEL[state]}</span></span>
        {l.to_confirm === 1 && <span><span className="badge attention">To confirm</span></span>}</p>
      <p className="muted">Edited {fmtDate(l.updated_at)}</p>
      {l.to_confirm !== 1 && onMarket && <p className="muted">Availability confirmed {checked}</p>}
      {/* C10: people with a viewing coming up, or one in the last 30 days that went well; the link lists them. */}
      <p className="muted">Active interest: <a href={`#/viewings?listing=${l.id}`}>{data.active_interest} {data.active_interest === 1 ? "person" : "people"}</a></p>
      {forSale && offers?.failed && <p className="muted">Offers couldn't be loaded</p>}
      {forSale && offers && !offers.failed && <p className="muted">Offers: <a href="#/sales">{offers.open} open {offers.open === 1 ? "offer" : "offers"}</a>
        {offers.sale && <> · <a href={`#/sales/${offers.sale.id}`}>Sale in progress</a></>}</p>}
      {l.published === 1 && !publicPhoto && <p className="warn" role="note">Published, but with no public photo: it won't appear on the website until it has one.</p>}
      <ResearchDuplicateReview review={data.duplicate_review} legacyIds={data.duplicates}/>
      <button ref={guideToggle} type="button" className="btn ghost sm" onClick={() => { setGuideEnabled(v => !v); setGuideStep(0); }}>{guideEnabled ? "Close property guide" : "Open property guide"}</button>
      <nav aria-label="Listing sections">{SECTIONS.filter(([k]) => forSale || k !== "offers").map(([k, t]) =>
        <button key={k} type="button" className="linkish" onClick={() => k==='history'?goTo('h-history'):
          document.getElementById(`s-${k}`).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth' })}>{t}</button>)}</nav>
      <a href="#/listings">Back to listings</a>
    </aside>

    <div className="sections">
      {guideEnabled && <section className="card" aria-labelledby="h-guide">
        <h2 id="h-guide">Property guide</h2>
        <p role="status" aria-live="polite">Step {guideStep + 1} of 6: {listingGuideSteps({ review: state !== "archived" })[guideStep].label}</p>
        <p className="muted">Navigate the existing fields below. Changes are saved only when you choose Save; finishing this guide does not publish.</p>
        <nav aria-label="Property guide steps" style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {listingGuideSteps({ review: state !== "archived" }).map((step, index) => <button key={step.label} type="button" className="btn ghost sm"
            aria-current={guideStep === index ? "step" : undefined} onClick={() => { setGuideStep(index); goTo(step.targets[0][1]); }}>{step.label}</button>)}
        </nav>
        {listingGuideSteps({ review: state !== "archived" })[guideStep].unavailable && <p className="muted">{listingGuideSteps({ review: state !== "archived" })[guideStep].unavailable}</p>}
        <div className="inline">{listingGuideSteps({ review: state !== "archived" })[guideStep].targets.map(([label, target]) =>
          <button key={target} type="button" className="btn ghost sm" onClick={() => goTo(target)}>Go to {label}</button>)}
          <button type="button" className="btn ghost sm" disabled={guideStep === 0} onClick={() => { const n = guideStep - 1; setGuideStep(n); goTo(listingGuideSteps({ review: state !== "archived" })[n].targets[0][1]); }}>Previous step</button>
          <button type="button" className="btn ghost sm" disabled={guideStep === 5} onClick={() => { const n = guideStep + 1; setGuideStep(n); goTo(listingGuideSteps({ review: state !== "archived" })[n].targets[0][1]); }}>Next step</button>
          {guideStep === 5 && <button type="button" className="btn ghost sm" onClick={() => { setGuideEnabled(false); requestAnimationFrame(() => guideToggle.current?.focus()); }}>Finish guide</button>}
        </div>
      </section>}
      <ListingReview listing={l} disabled={dirty||busy} onTransition={review}/>
      {l.operation==='rent'&&!l.archived_at&&['to_let','lease','not_stated','let_agreed','let'].includes(l.availability)&&
        <RentalMarketing key={l.updated_at} listing={l} media={data.media} sources={data.sources} disabled={dirty||busy}
          onReload={load} onSaved={listing=>{marketingFocus.current=true;setListing(listing);reloadMatches();onChange?.();setMsg({ok:true,text:'Rental marketing state recorded.'});}}/>}
      {l.to_confirm === 1 && <div className="warn to-confirm" role="note">
        <p>Last confirmed {checked}: call the owner to check it is still available.</p>
        <button type="button" className="btn ghost sm" onClick={stillAvailable} disabled={confirming}>Still available</button></div>}
      {state !== "archived" && <section className={`card prepub${todo.length ? "" : " done"}`} aria-labelledby="h-prepub">
        <h2 id="h-prepub" tabIndex={-1}>Missing from this listing</h2>
        {completeness ? <p><strong>{completeness.percentage}% complete</strong> ({completeness.met} of {completeness.total})</p>
          : <p role="status">Completeness is unavailable while photos are not loaded.</p>}
        <p className="muted">Based on current edits and saved photos. You do not need 100% to publish. Save your changes before publishing.</p>
        {todo.length ? <ul>{todo.map(({id, target, label}) => <li key={id}>
          <button type="button" className="linkish" onClick={() => goTo(target)}>{label}</button></li>)}</ul>
          : completeness && <p className="muted">Nothing missing.</p>}
      </section>}
      <section id="s-details" className="card" aria-labelledby="h-details"><h2 id="h-details" tabIndex={-1}>Details</h2><div className="grid2">
        {field("title", "Title", <input {...ctl("title")} maxLength={200} required />)}
        {field("use", "Use", <select {...ctl("use")}>{options(USE)}</select>)}
        {field("operation", "Operation", <select {...ctl("operation")} disabled={isRentalMarketing(l.availability)}>{options(OPERATION)}</select>)}
        {field("availability", "Availability", <select {...ctl("availability")} disabled={isRentalMarketing(l.availability)}>
          {options(Object.fromEntries(Object.entries(AVAILABILITY).filter(([k])=>!isRentalMarketing(k)||k===l.availability)))}</select>)}
        {field("tenure_type", "Tenure", <><select {...ctl("tenure_type", was ? { "aria-describedby": `d-tenure${errors.tenure_type ? " e-tenure_type" : ""}` } : {})}>
          <option value="">Not set</option>{options(TENURE)}</select>
          {was && <small id="d-tenure" className="muted">Was: {form.tenure}</small>}</>)}
        {(home || form.housing_category) && field("housing_category", "Housing category", <><select {...ctl("housing_category", { "aria-describedby": `d-housing${errors.housing_category ? " e-housing_category" : ""}` })}>
          <option value="">Not set</option>{options(HOUSING)}</select>
          <small id="d-housing" className="muted">Qualified homes are only open to some residential statuses; Registered homes are open to all statuses to rent or occupy.</small></>)}
        {(home || form.restriction) && field("restriction", "Restriction", <><select {...ctl("restriction", salesOnly ? { "aria-describedby": `d-restriction${errors.restriction ? " e-restriction" : ""}` } : {})}><option value="">None</option>
          {ftb && <option value="first_time_buyer">{RESTRICTION.first_time_buyer}</option>}
          <option value="over_55">{RESTRICTION.over_55}</option></select>
          {salesOnly && <small id="d-restriction" className="muted">Applies to sales only.</small>}</>)}
        {field("country", "Country", <input {...ctl("country")} maxLength={100} />)}
        {field("location", "Public location", <><input {...ctl("location")} maxLength={200} />
          <small className="muted">Shown on the website. Enter only the location you want to publish.</small></>)}
        {field("road_name", "Road (internal)", <input {...ctl("road_name")} maxLength={200} />)}
        {field("parish", "Parish", <select id="f-parish" value={matchForm.parish} aria-invalid={errors.parish ? true : undefined}
          aria-describedby={errors.parish ? "e-parish" : undefined} onChange={e => setMatchForm(x => ({ ...x, parish: e.target.value }))}>
          <option value="">Unknown</option>{OPTIONS.parishes.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>)}
      </div></section>

      <section id="s-internal-address" className="card" aria-labelledby="h-internal-address">
        <h2 id="h-internal-address">Internal property details</h2>
        <p className="muted">For staff only. These fields are not shown on the website.</p>
        <div className="grid2">
          {detailField("building_name_or_number", "Building name or number (internal)",
            <input {...detailCtl("building_name_or_number")} maxLength={200} />)}
          {detailField("postcode", "Postcode (internal)", <><input {...detailCtl("postcode")} maxLength={32} />
            {postcodeHint && <small className="muted">{postcodeHint}</small>}
            {form.country === "Jersey" && <small><a href="https://www.jerseypost.com/tools/address-finder/" target="_blank"
              rel="noopener noreferrer" referrerPolicy="no-referrer">Check with Jersey Post</a></small>}</>)}
          {detailField("property_condition", "Property condition", <select {...detailCtl("property_condition")}>
            <option value="">Not known</option>{Object.entries(PROPERTY_CONDITION_LABELS).map(([key, label]) =>
              <option key={key} value={key}>{label}</option>)}</select>)}
          {(detailsForm.property_condition === "new_build" || detailsForm.developer_name) &&
            detailField("developer_name", "Developer (internal)", <><input {...detailCtl("developer_name")} maxLength={200} />
              {detailsForm.property_condition !== "new_build" && <small className="muted">Only applies to new builds. Clear this value if it no longer applies.</small>}</>)}
        </div>
        <div className="field">
          {savedPublicAddress
            ? <p className="muted"><strong>Public exact address:</strong> {savedPublicAddress}</p>
            : <p className="muted">The exact address stays internal until you review the full public preview and record the owner's agreement.</p>}
          <button type="button" className="btn ghost sm" onClick={openAddressReview}
            disabled={busy || dirty || state !== "published" || !publicPhoto}>
            {savedPublicAddress ? "Review updated public snapshot" : "Review public snapshot"}
          </button>
          {saveDirty && <small className="muted">Save or discard your edits before reviewing the public snapshot.</small>}
          {addressReviewDirty && <small className="muted">Complete or close this address review before changing the listing.</small>}
          {state !== "published" && <small className="muted">Publish this listing before reviewing its exact address.</small>}
          {state === "published" && !publicPhoto && <small className="muted">Add a public photo before reviewing its exact address.</small>}
          {savedPublicAddress && <button type="button" className="btn ghost sm" onClick={revokeAddressReview} disabled={busy || dirty}>
            Remove public exact address
          </button>}
          {addressReviewError && <p role="alert" className="err">{addressReviewError}</p>}
        </div>
        {addressReview && <section className="card" aria-labelledby="h-address-review">
          <h3 id="h-address-review">Review the public snapshot</h3>
          <p className="muted">This review includes the listing, search and social metadata, structured data and linked Drive folder title.</p>
          {addressReview.existing_review && <p className="muted" role="status">
            {addressReview.existing_review.valid_for_current_content
              ? "The current public content already has an approval."
              : "Public content changed since the previous approval."}
          </p>}
          <dl>
            <dt>Exact address</dt><dd>{addressReview.preview.listing.exactAddress}</dd>
            <dt>Public title</dt><dd>{addressReview.preview.listing.title}</dd>
            <dt>Public location</dt><dd>{addressReview.preview.listing.place}</dd>
            <dt>Public summary</dt><dd>{addressReview.preview.listing.summary.join("\n") || "None"}</dd>
            <dt>Public description</dt><dd>{addressReview.preview.listing.description.join("\n") || "None"}</dd>
            <dt>Search and social title</dt><dd>{addressReview.preview.seo.title}</dd>
            <dt>Search and social description</dt><dd>{addressReview.preview.seo.description}</dd>
            <dt>Canonical URL</dt><dd>{addressReview.preview.seo.canonical}</dd>
            <dt>Drive folder title</dt><dd>{addressReview.preview.drive_folder_name || "None"}</dd>
          </dl>
          <h4>Public media labels</h4>
          <ul>{[...addressReview.preview.listing.photos, ...addressReview.preview.listing.floorplans,
            ...(addressReview.preview.listing.aerial ? [addressReview.preview.listing.aerial] : [])]
            .map((media, index) => <li key={`${media.src}-${index}`}>{media.alt || "No label"}</li>)}</ul>
          <details open><summary>Review all public listing data and JSON-LD</summary>
            <pre>{JSON.stringify({ listing: addressReview.preview.listing, seo: addressReview.preview.seo }, null, 2)}</pre>
          </details>
          <div className="field">
            <label htmlFor="address-evidence-ref">Consent evidence reference</label>
            <input id="address-evidence-ref" value={addressEvidenceRef} maxLength={128} autoComplete="off"
              onChange={e => setAddressEvidenceRef(e.target.value)} />
            <small className="muted">Reference ID only. Do not enter names, phone numbers or email addresses.</small>
          </div>
          <div className="field">
            <label className="check"><input id="address-review-authorized" type="checkbox" checked={addressReviewAuthorized}
              onChange={e => setAddressReviewAuthorized(e.target.checked)} />
              I reviewed this snapshot and have the owner's agreement to publish the exact address
            </label>
          </div>
          <button type="button" className="btn" onClick={authorizeAddressReview}
            disabled={busy || !addressEvidenceRef.trim() || !addressReviewAuthorized}>Authorize and publish exact address</button>
          <button type="button" className="btn ghost" onClick={() => { setAddressReview(null); setAddressReviewError(null);
            setAddressEvidenceRef(""); setAddressReviewAuthorized(false); }}>Close preview</button>
        </section>}
        <p className="muted"><strong>Current address preview:</strong> {internalAddress || "Not known"}</p>
      </section>

      <section id="s-physical" className="card" aria-labelledby="h-physical"><h2 id="h-physical" tabIndex={-1}>Physical details</h2>
        <p className="muted">Leave a field unknown when it has not been confirmed.</p>
        <h3>Size and rooms</h3><div className="grid2">
          {field("property_type", "Type (house, flat, restaurant…)", <input {...ctl("property_type")} maxLength={100} />)}
          {field("bedrooms", "Bedrooms", <input {...ctl("bedrooms")} type="number" min="0" max="100" step="1" inputMode="numeric" />)}
          {field("bathrooms", "Bathrooms", <input {...ctl("bathrooms")} type="number" min="0" max="100" step="1" inputMode="numeric" />)}
          {field('interior_area_sqft', 'Interior area (sq ft)', <input {...ctl('interior_area_sqft')} type="number" min="0.01" step="0.01" inputMode="decimal" />)}
          <div className="field"><span>Interior area (m²)</span><output>{squareMetres(Number(form.interior_area_sqft))?.toFixed(2) ?? 'Not known'}</output></div>
          {field('separate_wcs', 'Separate toilets', <input {...ctl('separate_wcs')} type="number" min="0" max="100" step="1" />)}
          {field('reception_rooms', 'Reception rooms', <input {...ctl('reception_rooms')} type="number" min="0" max="100" step="1" />)}
        </div><h3>Building</h3><div className="grid2">
          {field('floor_level', 'Floor level (ground floor is 0)', <input {...ctl('floor_level')} type="number" min="-20" max="200" step="1" />)}
          {field('building_floors', 'Above-ground floors', <input {...ctl('building_floors')} type="number" min="1" max="200" step="1" />)}
          {field('year_built', 'Year built', <input {...ctl('year_built')} type="number" min="1" max="9999" step="1" />)}
          {['has_garage', 'has_storage', 'has_lift', 'double_glazing'].map((key, i) => field(key,
            ['Garage', 'Storage', 'Lift', 'Double glazing'][i], <select {...ctl(key)}><option value="">Unknown</option><option value="1">Yes</option><option value="0">No</option></select>))}
        </div><h3>Features</h3>
        {[['heating_types', 'Heating', [['oil','Oil'],['gas','Gas'],['electric','Electric'],['heat_pump','Heat pump'],['lpg','LPG']]],
          ['amenities', 'Amenities', [['pool','Pool'],['gym','Gym'],['communal_areas','Communal areas']]]].map(([key,label,choices]) => {
          const values = form[key], mode = values === '' ? 'unknown' : values.length === 0 ? 'none' : 'values';
          return <fieldset className="field" key={key}><legend>{label}</legend>
            <label htmlFor={`f-${key}`}>Selection</label><select id={`f-${key}`} value={mode} aria-invalid={errors[key] ? true : undefined}
              aria-describedby={errors[key] ? `e-${key}` : undefined} onChange={e => setForm(f => ({...f, [key]: e.target.value === 'unknown' ? '' : e.target.value === 'none' ? [] : ['']}))}>
              <option value="unknown">Unknown</option><option value="none">None</option><option value="values">Select values</option></select>
            {mode === 'values' && choices.map(([value,text]) => <label key={value}><input type="checkbox" checked={values.includes(value)}
              onChange={e => setForm(f => { const selected = f[key].filter(x => x && x !== value); if (e.target.checked) selected.push(value);
                return {...f, [key]: selected.length ? selected : ['']}; })} /> {text}</label>)}
            {errors[key] && <small id={`e-${key}`} className="err">{errors[key]}</small>}</fieldset>;
        })}
        <h3 id="f-feature_overrides" tabIndex={-1}>Matching facts</h3><p className="muted">Manual values are kept when the text changes or matches are recalculated.</p>
        {errors.feature_overrides && <p className="err" role="alert">{errors.feature_overrides}</p>}
        {['pets','parking','furnished','outdoor'].map(key => {
          const overrides = form.feature_overrides, present = Object.hasOwn(overrides, key), value = overrides[key];
          const mode = !present ? 'auto' : value === null ? 'unknown' : 'manual';
          let lastEvidence = null;
          try { lastEvidence = JSON.parse(l.feat_evidence || '{}')[key] || null; } catch { /* Existing malformed evidence is not displayed. */ }
          const lastValue = l[`feat_${key}`];
          const update = next => setForm(f => { const facts = {...f.feature_overrides}; if (next === undefined) delete facts[key]; else facts[key] = next;
            return {...f, feature_overrides: facts}; });
          return <fieldset className="field" key={key}><legend>{key[0].toUpperCase() + key.slice(1)}</legend>
            <label htmlFor={`f-manual_${key}`}>Source</label><select id={`f-manual_${key}`} value={mode} aria-invalid={errors[`manual_${key}`] ? true : undefined}
              onChange={e => update(e.target.value === 'auto' ? undefined : e.target.value === 'unknown' ? null : key === 'outdoor' ?
                {garden:'unknown',terrace:'unknown',balcony:'unknown',patio:'unknown'} : '')}>
              <option value="auto">From text</option><option value="unknown">Unknown</option><option value="manual">Set manually</option></select>
            {mode === 'auto' && <p className="muted">Last saved value: {lastValue == null ? 'Not known' : String(lastValue)}
              {lastEvidence ? ` — ${lastEvidence}` : ''}</p>}
            {mode === 'manual' && key === 'parking' && <label>Included spaces <input type="number" min="0" max="10000" step="1" value={value}
              onChange={e => update(e.target.value === '' ? '' : Number(e.target.value))} /></label>}
            {mode === 'manual' && ['pets','furnished'].includes(key) && <label>Value <select value={value} onChange={e => update(e.target.value)}>
              <option value="">Choose a value</option><option value="yes">Yes</option><option value="no">No</option></select></label>}
            {mode === 'manual' && key === 'outdoor' && ['garden','terrace','balcony','patio'].map(part => <label key={part}>{part[0].toUpperCase()+part.slice(1)}
              <select value={value[part]} onChange={e => update({...value, [part]:e.target.value})}><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>)}
            {errors[`manual_${key}`] && <small className="err" role="alert">{errors[`manual_${key}`]}</small>}</fieldset>;
        })}
      </section>
      <section id="s-price" className="card" aria-labelledby="h-price"><h2 id="h-price" tabIndex={-1}>Price</h2>
        <p className="muted">These details appear on the public listing. Leave unknown values blank; include the currency and period for charges. Sale price, rent and business premium are kept separate.</p><div className="grid2">
        {priceOperation(form) === "sale" && field("sale_price", "Sale price", <input {...ctl("sale_price")} type="number" min="1" step="any" />)}
        {(priceOperation(form) === "rent" || form.operation === "business") && field("rent", "Rent", <input {...ctl("rent")} type="number" min="1" step="any" />)}
        {(priceOperation(form) === "rent" || form.operation === "business") && field("rent_period", "Period", <select {...ctl("rent_period")}><option value="">—</option><option value="month">Per month</option><option value="year">Per year</option></select>)}
        {form.operation === "business" && field("premium", "Business premium", <input {...ctl("premium")} type="number" min="1" step="any" />)}
        {field("currency", "Currency", <select {...ctl("currency")}><option value="">—</option><option value="GBP">GBP £</option><option value="EUR">EUR €</option></select>)}
        {field("price_text", "Displayed text (when there is no amount)", <input {...ctl("price_text")} maxLength={200} placeholder="e.g. Negotiable" />)}
        {field("price_per_sqft", "Price per sq ft", <input {...ctl("price_per_sqft")} maxLength={200} placeholder="e.g. £25 per sq ft per year" />)}
        {form.operation === "business" && priceOperation(form) === "sale" && <div className="field"><span id="rent-price-area-label">Calculated rent per sq ft</span><output aria-labelledby="rent-price-area-label">{formatPricePerArea(derivePricePerArea({ ...form, operation: "rent" })) ?? "Not available with the current details"}</output></div>}
        {form.operation === "business" && <div className="field"><span id="premium-price-area-label">Calculated premium per sq ft</span><output aria-labelledby="premium-price-area-label">{formatPremiumPerArea(form) ?? "Not available with the current details"}</output></div>}
        <div className="field"><span id="calculated-price-area-label">Calculated price per sq ft</span><output aria-labelledby="calculated-price-area-label">{formatPricePerArea(derivePricePerArea(form.operation === "business" && priceOperation(form) === "rent" ? { ...form, operation: "rent" } : form)) ?? "Not available with the current details"}</output>
          <small className="muted">Calculated from the entered price and interior area. This does not change the text field.</small></div>
        {field("rental_deposit", "Rental deposit", <input {...ctl("rental_deposit")} maxLength={200} placeholder="e.g. £2,000" />)}
        {field("parish_rates", "Parish rates", <input {...ctl("parish_rates")} maxLength={200} placeholder="e.g. £500 per year" />)}
        {field("service_charge", "Service charge", <input {...ctl("service_charge")} maxLength={200} placeholder="e.g. £100 per month" />)}
        {field("utilities_included", "Utilities included", <input {...ctl("utilities_included")} maxLength={300} placeholder="e.g. Water and heating" />)}
        {field("available_on", "Available from", <><input {...ctl("available_on", { "aria-describedby": `hint-available-on${errors.available_on ? " e-available_on" : ""}` })} type="date" />
          <small id="hint-available-on" className="muted">Leave blank if unknown. This does not confirm availability.</small></>)}
      </div>
        {data.structured_economics && <div><h3>Staff-only costs</h3>
          <p className="muted">These amounts are for staff. The public listing uses the text fields above and does not update from these amounts. Leave unknown amounts blank; 0 means none.</p>
          <div className="grid2">
            {(['rent', 'business'].includes(form.operation) || form.rental_deposit_amount !== '') && field('rental_deposit_amount', 'Rental deposit amount',
              <input {...ctl('rental_deposit_amount')} type="number" min="0" max="9999999999.99" step="0.01" inputMode="decimal" />)}
            {field('parish_rates_amount', 'Parish rates amount', <input {...ctl('parish_rates_amount')} type="number" min="0" max="9999999999.99" step="0.01" inputMode="decimal" />)}
            {field('parish_rates_period', 'Parish rates period', <select {...ctl('parish_rates_period')}><option value="">Unknown</option><option value="month">Per month</option><option value="year">Per year</option></select>)}
            {field('service_charge_amount', 'Service charge amount', <input {...ctl('service_charge_amount')} type="number" min="0" max="9999999999.99" step="0.01" inputMode="decimal" />)}
            {field('service_charge_period', 'Service charge period', <select {...ctl('service_charge_period')}><option value="">Unknown</option><option value="month">Per month</option><option value="year">Per year</option></select>)}
          </div>
          {needsCostCurrencyReview && <label><input type="checkbox" checked={costCurrencyReview === costCurrencyReviewKey}
            onChange={event => setCostCurrencyReview(event.target.checked ? costCurrencyReviewKey : null)} />
            I have reviewed all staff-only costs in the new currency. Changing currency does not convert amounts.</label>}
        </div>}
      </section>

      <section id="s-description" className="card" aria-labelledby="h-desc"><h2 id="h-desc" tabIndex={-1}>Description</h2>
        {/* AUT-13: on a listing on the website only (H9). A used draft fills the form like typing; Save is the approval (H10). */}
        {state === "published" && <HermesDraft listingId={id} onUse={text => setForm(f => ({ ...f, ...text }))}
          replacing={["title", "summary", "description"].some(k => form[k] !== toForm(l, data.structured_economics)[k])} />}
        {field("summary", "Summary (one bullet per line)", <textarea {...ctl("summary")} maxLength={5000} />)}
        {field("description", "Full description (one paragraph per line)", <textarea {...ctl("description")} maxLength={20000} rows={10} />)}
        {data.content_tracking && contentForm && <ListingContentFields value={contentForm} onChange={setContentForm} errors={errors} busy={busy}/>}
      </section>

      <section id="s-photos" className="card" aria-labelledby="h-photos"><h2 id="h-photos" tabIndex={-1}>Photos</h2>
        <MediaManager listingId={id} media={data.media} coverId={l.cover_media_id} updatedAt={l.updated_at}
          register={p => { photos.current = p; setPhotosDirty(p.dirty); }}
          onChange={(media, coverId, saved) => { historyChanged();setData(d => ({ ...d, media, listing: saved
            ? { ...d.listing, cover_media_id: saved.cover_media_id, updated_at: saved.updated_at, updated_by: saved.updated_by }
            : { ...d.listing, cover_media_id: coverId } })); }} />
      </section>
      {data.documents_enabled && <ListingDocuments listingId={id} />}

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

      <section id="s-viewings" className="card fields-group" aria-labelledby="h-viewings">
        <h2 id="h-viewings">Viewings</h2>
        <div className="inline">
          <span className={`badge ${form.viewings_enabled === 1 ? "positive" : "neutral"}`} role="status">
            {form.viewings_enabled === 1 ? "Enabled" : "Disabled"}</span>
          <button type="button" className="btn ghost" disabled={busy}
            aria-describedby={`d-viewings${errors.viewings_enabled ? " e-viewings_enabled" : ""}`}
            aria-invalid={errors.viewings_enabled ? true : undefined}
            onClick={() => setForm(f => ({ ...f, viewings_enabled: f.viewings_enabled === 1 ? 0 : 1 }))}>
            {form.viewings_enabled === 1 ? "Deactivate" : "Activate"}</button>
        </div>
        <p id="d-viewings" className="muted">Disabling viewings stops new bookings and rescheduling. Existing appointments and saved viewing hours are kept. Use Save to apply changes.</p>
        {errors.viewings_enabled && <small id="e-viewings_enabled" className="err" role="alert">{errors.viewings_enabled}</small>}
        <label>Viewing hours<select value={form.viewing_hours === null ? "general" : "custom"} disabled={busy}
          aria-describedby="d-viewing-hours"
          onChange={e => setForm(f => ({ ...f, viewing_hours: e.target.value === "general" ? null : f.viewing_hours_draft }))}>
          <option value="general">General availability</option><option value="custom">Custom hours</option>
        </select></label>
        <p id="d-viewing-hours" className="muted">General availability uses the negotiators' free times. Custom hours limit this property to the weekly times below, when a negotiator is also free.</p>
        {form.viewing_hours !== null && <ViewingAvailability id="property-viewing-hours" title="Custom viewing hours"
          heading="h3" className="fields-group" description="Choose at least one time option in Jersey local time. Each viewing must fit fully within an option."
          value={form.viewing_hours} disabled={busy}
          onChange={viewing_hours => setForm(f => ({ ...f, viewing_hours, viewing_hours_draft: viewing_hours }))} error={errors.viewing_hours} />}
        {form.viewing_hours === null && errors.viewing_hours && <small className="err" role="alert">{errors.viewing_hours}</small>}
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
      <ListingHistory key={id} id={id} refreshKey={historyKey}/>
      {data.withdrawal_tracking&&<WithdrawalHistory listing={l} refreshKey={historyKey}/>}
    </div>

    <div className="actionbar" role="region" aria-label="Actions">
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}
        {msg.reload&&<button type="button" className="btn ghost sm" onClick={load}>Reload listing</button>}</p>}
      {dirty && <span className="unsaved">Unsaved changes</span>}
      <button type="button" className="btn" onClick={save} disabled={!saveDirty || busy}>{busy ? "Saving…" : "Save"}</button>
      {dirty && <button type="button" className="btn ghost" onClick={discard} disabled={busy}>Discard</button>}
      {state !== "archived" && (data.queue ? <button type="button" className="btn ghost" disabled={dirty || busy} title={dirty ? "Save first" : undefined}
        onClick={approve}>Approve and publish</button> : <button type="button" className="btn ghost" disabled={dirty || busy}
        title={dirty ? "Save first" : undefined} onClick={() => act(l.published ? "unpublish" : "publish")}>{l.published ? "Unpublish" : "Publish"}</button>)}
      {state !== "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} onClick={() => act("archive")}>Archive</button>}
      {state === "archived" && <button type="button" className="btn ghost" disabled={dirty || busy} title={dirty ? "Save first" : undefined} onClick={() => act("restore")}>Restore</button>}
      {state === "archived" && <form className="inline" onSubmit={destroy}>
        <label htmlFor="del-confirm">To delete permanently, type {l.id}</label>
        <input id="del-confirm" value={confirmDel} onChange={e => setConfirmDel(e.target.value)} autoComplete="off" />
        <button className="btn ghost danger" disabled={confirmDel !== l.id || busy}>Delete permanently</button></form>}
    </div>
    {withdrawalOpen&&<WithdrawalDialog listing={l} onClose={()=>setWithdrawalOpen(false)} onSaved={result=>{
      setWithdrawalOpen(false);setListing(result.listing,result.details);reloadMatches();onChange?.();
      setMsg({ok:true,text:result.listing.published?'This listing is currently visible on the website. Review its latest state.':DONE.unpublish});
    }}/>}
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
            {!isActive(m) && <span className="muted"> · {m.archived_at ? "Archived" : m.search_state === "resolved" ? "Resolved" : "Needs review"}</span>}</td>
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
