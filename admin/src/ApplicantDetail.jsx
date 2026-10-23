import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtAgo, fmtDate } from "./format.js";
import { setUnsaved } from "./unsaved.js";
import { OPTIONS, normalizePhone } from "../../server/applicants.js";
import ApplicantFields, { toForm, toBody } from "./ApplicantFields.jsx";
import MatchCard, { REASON_LABEL } from "./MatchCard.jsx";

const CONTACT = ["name", "email", "phone", "preferred_channel", "best_time"];
// Every form field that belongs to the search (the rest of the form is the contact).
const SEARCH = Object.keys(toForm()).filter(k => !CONTACT.includes(k));
// §3.3 Copy fields: the search's requirements (never its operation: that is a second search) and, from the contact,
// only these two.
const COPY = [...SEARCH.filter(k => k !== "operation"), "preferred_channel", "best_time"];
const TABS = [["requirements", "Requirements"], ["matches", "Matches"], ["timeline", "Timeline"]];
const GROUPS = [["found", "Found"], ["shortlisted", "Shortlisted"], ["rejected", "Rejected"]];

const LABEL = { operation: "To Let or To Buy", stage: "Stage", lost_reason: "Why it was lost", assigned_to: "Assigned to",
  source: "Source", budget_max: "Maximum budget", budget_min: "Minimum budget", budget_stretch: "Can stretch to",
  property_types: "Type", bedrooms_min: "Bedrooms, at least", bedrooms_ideal: "Bedrooms, ideally", bathrooms_min: "Bathrooms, at least",
  parking_spaces: "Parking", furnished: "Furnished", outdoor: "Outdoor space", pets: "Pets", parishes_wanted: "Parishes they want",
  parishes_excluded: "Parishes they don't want", near: "Near", move_in_date: "Move-in date", lease_term_months: "Lease length (months)",
  buyer_position: "Buying position", mortgage_aip: "Mortgage agreed in principle", housing_status: "Housing status",
  household_adults: "Adults", household_children: "Children", requirements: "Anything else that matters?", name: "Name",
  email: "Email", phone: "Phone", preferred_channel: "Preferred channel", best_time: "Best time to contact",
  privacy_ack_at: "Privacy notice accepted", marketing_opt_in_at: "Agreed to marketing" };
const CHOICES = { operation: OPTIONS.operation, stage: OPTIONS.stages, source: OPTIONS.sources, furnished: OPTIONS.furnished,
  property_types: OPTIONS.property_types, outdoor: OPTIONS.outdoor, parishes_wanted: OPTIONS.parishes, parishes_excluded: OPTIONS.parishes,
  buyer_position: OPTIONS.buyer_position, mortgage_aip: OPTIONS.mortgage_aip, housing_status: OPTIONS.housing_status,
  preferred_channel: OPTIONS.channels, parking_spaces: OPTIONS.parking };
const MONEY = ["budget_min", "budget_max", "budget_stretch"];
const EVENT = { "applicant.created": "Search added", "applicant.updated": "Requirements changed", "applicant.stage_changed": "Stage changed",
  "applicant.archived": "Archived", "applicant.restored": "Restored", "contact.updated": "Contact details changed",
  "contact.consent_changed": "Consent changed", "applicant.duplicate_submitted": "Registered again on the website",
  "applicant.matched": "New matches found" };
const VIEWING_STATUS = Object.fromEntries([["new", "New"], ["contacted", "Contacted"], ["closed", "Closed"]]);
const OPERATION_LABEL = Object.fromEntries(OPTIONS.operation), SOURCE_LABEL = Object.fromEntries(OPTIONS.sources);

const blank = v => v == null || v === "" || (Array.isArray(v) && !v.length);
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
// A stored or submitted value as text: option labels, £ amounts, lists in the form's order. Never HTML.
function show(k, v, nameOf) {
  if (k === "assigned_to") return v ? nameOf(v) : "Unassigned";
  if (blank(v)) return "—";
  if (k === "pets") return OPTIONS.pet_kinds.filter(([p]) => v.some(x => x.kind === p)).map(([p, t]) => {
    const n = v.find(x => x.kind === p).count;
    return p === "none" || blank(n) ? t : `${t} (${n})`;
  }).join(", ");
  const list = CHOICES[k], text = x => list?.find(([o]) => String(o) === String(x))?.[1] ?? String(x);
  if (Array.isArray(v)) return (list ? [...v].sort((a, b) => list.findIndex(([o]) => o === a) - list.findIndex(([o]) => o === b)) : v)
    .map(text).join(", ");
  if (MONEY.includes(k) && Number.isFinite(Number(v))) return `£${Number(v).toLocaleString("en-GB")}`;
  if (k.endsWith("_at")) return fmtDate(v);
  return text(v);
}
// What the duplicate strip compares: an email or phone written another way is the same one.
const same = (k, a, b) => {
  const norm = v => (k === "email" && typeof v === "string" ? v.trim().toLowerCase()
    : k === "phone" && typeof v === "string" ? normalizePhone(v) ?? v : show(k, v, String));
  return norm(a) === norm(b);
};

// The record of one search (#/applicants/<id>, #/applicants/<id>/matches, #/applicants/<id>/timeline): its contact,
// stage and owner, the requirements form, its matches and the history. tab: the part of the hash after the id.
export default function ApplicantDetail({ id, tab }) {
  const [data, setData] = useState(null), [loadErr, setLoadErr] = useState(null), [users, setUsers] = useState([]);
  const [form, setForm] = useState(null), [errors, setErrors] = useState({}), [busy, setBusy] = useState(false);
  // msg: Save, Copy fields, archive and delete (in the action bar). note: stage, owner and Dismiss (next to them).
  const [msg, setMsg] = useState(null), [note, setNote] = useState(null);
  const [lost, setLost] = useState(null), [confirmDel, setConfirmDel] = useState(""); // lost: the reason being typed
  // Stage and Assigned to as chosen but not yet applied (null = as stored): a select saves only on Apply or Enter,
  // so moving through its options with the arrow keys saves nothing.
  const [choice, setChoice] = useState({ stage: null, assigned_to: null });
  const tabs = useRef({}), formRef = useRef(null), lostRef = useRef(null), focusError = useRef(false);
  const stageRef = useRef(null), ownerRef = useRef(null);
  // matchMsg: the last review, in the Matches tab. refocusMatch: the id to focus once the reviewed matches are shown.
  const [matchMsg, setMatchMsg] = useState(null), [reviewing, setReviewing] = useState(false), refocusMatch = useRef(null);
  const cur = TABS.some(([k]) => k === tab) ? tab : "requirements";

  const fetchDetail = () => api(`/admin/applicants/${id}`).then(d => { setData(d); return d; });
  const load = () => fetchDetail().then(d => {
    setForm(toForm(d.applicant, d.contact)); setErrors({}); setMsg(null); setNote(null); setLost(null); setLoadErr(null);
  }, e => { setLoadErr(e.message); setNote({ text: e.message }); }); // a failed Reload keeps the page and says why
  useEffect(() => { load(); api("/admin/users").then(d => setUsers(d.users), () => {}); }, []);

  const body = form && toBody(form), saved = data && toBody(toForm(data.applicant, data.contact));
  const changed = keys => (data && form ? keys.filter(k => JSON.stringify(body[k]) !== JSON.stringify(saved[k])) : []);
  const searchChanged = changed(SEARCH), contactChanged = changed(CONTACT);
  const dirty = searchChanged.length + contactChanged.length > 0;
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);
  // After a refused save, the first highlighted field gets the focus (once its tab is showing).
  useEffect(() => {
    const el = focusError.current && cur === "requirements" && formRef.current?.querySelector("[aria-invalid=true]");
    if (el) { el.focus(); focusError.current = false; }
  }, [errors, cur]);
  useEffect(() => { if (lost === "") lostRef.current?.focus(); }, [lost]);
  useEffect(() => {
    if (refocusMatch.current) { document.getElementById(refocusMatch.current)?.focus(); refocusMatch.current = null; }
  }, [data]);

  if (loadErr && !data) return <p role="alert" className="err">{loadErr} · <a href="#/applicants">Back to applicants</a></p>;
  if (!data || !form) return <p>Loading applicant…</p>;
  const a = data.applicant, c = data.contact, archived = !!a.archived_at;
  const nameOf = email => users.find(u => u.email === email)?.name || email;
  const by = actor => (actor === "public" ? "Website" : actor === "system" ? "System" : nameOf(actor));
  const stale = e => e.status === 409 && !e.data?.contact_id;
  const go = (k, focus) => {
    location.hash = `#/applicants/${id}${k === "requirements" ? "" : `/${k}`}`;
    if (focus) tabs.current[k].focus();
  };
  const onTabKey = e => {
    const i = TABS.findIndex(([k]) => k === cur), j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (j == null) return;
    e.preventDefault(); go(TABS[(j + TABS.length) % TABS.length][0], true);
  };

  // Requirements and contact are saved apart (two records); whatever is still unsaved stays in the form.
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      if (searchChanged.length) {
        const { applicant } = await api(`/admin/applicants/${id}`, { method: "PUT",
          body: { ...pick(body, searchChanged), updated_at: a.updated_at } });
        setData(d => ({ ...d, applicant })); setForm(f => ({ ...f, ...pick(toForm(applicant), SEARCH) }));
      }
      if (contactChanged.length) {
        const { contact } = await api(`/admin/contacts/${c.id}`, { method: "PUT",
          body: { ...pick(body, contactChanged), updated_at: c.updated_at } });
        setData(d => ({ ...d, contact })); setForm(f => ({ ...f, ...pick(toForm({}, contact), CONTACT) }));
      }
      const d = await fetchDetail();
      setForm(toForm(d.applicant, d.contact)); setErrors({}); setMsg({ ok: true, text: "Changes saved." });
    } catch (e) {
      const fields = e.data?.fields || {};
      setErrors(fields); setMsg({ text: e.message, stale: stale(e) });
      if (Object.keys(fields).length) { focusError.current = true; if (cur !== "requirements") go("requirements"); }
    } finally { setBusy(false); }
  };
  const discard = () => { setForm(toForm(a, c)); setErrors({}); setMsg(null); };

  // After Apply or Confirm: the record just saved ({applicant} or {contact}) and the fresh history. The other record
  // keeps the version the form started from, so an edit someone else made there never shows up as this user's
  // unsaved change (and a later Save cannot revert it); Save or Reload brings it in.
  const refresh = async saved => {
    setData(x => ({ ...x, ...saved }));
    const d = await api(`/admin/applicants/${id}`);
    setData(x => ({ ...x, events: d.events, viewings: d.viewings, duplicates: d.duplicates }));
  };
  // Stage and Assigned to save on their own; unsaved requirements stay in the form. Input while saving is ignored,
  // never disabled, so the focus stays where it is.
  const putApplicant = async (key, patch, done, focus) => {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      const { applicant } = await api(`/admin/applicants/${id}`, { method: "PUT", body: { ...patch, updated_at: a.updated_at } });
      await refresh({ applicant });
      focus?.current?.focus(); setChoice(x => ({ ...x, [key]: null })); setLost(null); setNote({ ok: true, text: done });
    } catch (e) {
      setNote({ text: Object.values(e.data?.fields || {}).join(" ") || e.message, stale: stale(e) });
    } finally { setBusy(false); }
  };
  const stage = choice.stage ?? a.stage, owner = choice.assigned_to ?? a.assigned_to ?? "";
  const applyStage = () => {
    if (busy || stage === a.stage) return;
    if (stage === "lost") setLost("");
    else putApplicant("stage", { stage }, `Stage changed to ${show("stage", stage)}.`, stageRef);
  };
  const applyOwner = () => {
    if (busy || owner === (a.assigned_to ?? "")) return;
    putApplicant("assigned_to", { assigned_to: owner || null }, owner ? `Assigned to ${nameOf(owner)}.` : "Now unassigned.", ownerRef);
  };
  const onEnter = apply => e => { if (e.key === "Enter") { e.preventDefault(); apply(); } };
  const cancelLost = () => { setLost(null); setChoice(x => ({ ...x, stage: null })); stageRef.current?.focus(); };

  const copy = sent => {
    const from = toForm(sent, sent), keys = COPY.filter(k => !blank(sent[k]));
    setForm(f => ({ ...f, ...pick(from, keys) })); setErrors({});
    setMsg({ ok: true, text: "What they sent is in the form. Check it, then save." });
    if (cur !== "requirements") go("requirements");
  };
  // §3.3: a marketing opt-in sent again from the website waits for the team to confirm it. Its button goes away, so
  // the focus goes to the heading of the strip it was in.
  const confirmMarketing = async dup => {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      const { contact } = await api(`/admin/contacts/${c.id}`, { method: "PUT", body: { marketing: true, updated_at: c.updated_at } });
      await refresh({ contact });
      document.getElementById(`dup-${dup.id}`)?.focus(); setNote({ ok: true, text: "Marketing opt-in confirmed." });
    } catch (e) { setNote({ text: e.message, stale: stale(e) }); }
    finally { setBusy(false); }
  };
  // The strip goes away: the focus goes to the next strip's heading (the one before when it was the last), or the
  // record's current tab when none is left. Those elements stay mounted, so they can take the focus at once.
  const dismiss = async dup => {
    setNote(null);
    try {
      await api(`/admin/notifications/${dup.id}`, { method: "PUT", body: { resolved: true } });
      const list = data.duplicates, i = list.findIndex(x => x.id === dup.id), next = list[i + 1] ?? list[i - 1];
      (next ? document.getElementById(`dup-${next.id}`) : tabs.current[cur])?.focus();
      setData(d => ({ ...d, duplicates: d.duplicates.filter(x => x.id !== dup.id) }));
      setNote({ ok: true, text: "Dismissed. The notice is in the Inbox Feed." });
    } catch (e) { setNote({ text: e.message }); }
  };

  // A review moves the match to another group; the focus goes to the next card of the group it left (the one before
  // when it was the last), or that group's heading when none is left. A 409 (someone else reviewed it, or the search
  // is archived) or a 400 says why; either way the matches are loaded again.
  const reviewMatch = async (m, { status, reject_reason }) => {
    if (reviewing) return;
    const group = data.matches.filter(x => x.status === m.status), i = group.findIndex(x => x.id === m.id);
    const next = group[i + 1] ?? group[i - 1], title = m.listing.title;
    setReviewing(true); setMatchMsg(null);
    // A 404 is a match a recompute removed meanwhile: gone, like match null.
    const gone = { ok: true, text: `${title} no longer fits this search, so it has left the list.` };
    let msg;
    try {
      const { match } = await api(`/admin/matches/${m.id}`, { method: "PUT",
        body: { status, from: m.status, ...(reject_reason && { reject_reason }) } });
      msg = !match ? gone : { ok: true, text: status === "shortlisted" ? `Shortlisted ${title}.`
        : status === "rejected" ? `Rejected ${title} · ${REASON_LABEL[reject_reason]}.` : `${title} is back in Found.` };
    } catch (e) { msg = e.status === 404 ? gone : { text: e.message, refused: e.status === 409 || e.status === 400 }; }
    // The message shows with the reloaded matches; a refused review's "Reload to see it" is done already.
    try {
      const d = await api(`/admin/applicants/${id}`);
      if (msg.refused) msg = { text: `${msg.text.split(". ")[0].replace(/\.?$/, ".")} The matches below are up to date.` };
      const left = !d.matches.some(x => x.id === m.id && x.status === m.status);
      if (msg.ok || left)
        refocusMatch.current = next && d.matches.some(x => x.id === next.id && x.status === m.status) ? `match-${next.id}` : `group-${m.status}`;
      setData(x => ({ ...x, events: d.events, matches: d.matches }));
    } catch (e) { msg = { text: `${msg.text} ${e.message}` }; } // shown as an error even when the review was saved
    finally { setMatchMsg(msg); setReviewing(false); }
  };

  const act = async action => {
    if (action === "archive" && !confirm(`Archive this search for ${c.name}? You can restore it from Archived.`)) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/admin/applicants/${id}/${action}`, { method: "POST" });
      const d = await fetchDetail(); setForm(toForm(d.applicant, d.contact));
      setMsg({ ok: true, text: action === "archive" ? "Archived. You can restore it from Archived." : "Restored." });
    } catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  const destroy = async e => {
    e.preventDefault(); setBusy(true);
    try { await api(`/admin/applicants/${id}`, { method: "DELETE", body: { confirm: confirmDel } }); setUnsaved(false); location.hash = "#/applicants"; }
    catch (x) { setMsg({ text: x.message }); setBusy(false); }
  };

  const tel = /^\+\d{8,15}$/.test(c.phone ?? "") ? c.phone : null;
  const owners = users.some(u => u.email === a.assigned_to) || !a.assigned_to ? users : [...users, { email: a.assigned_to }];

  // A div, not a section: the entrance animation of `.page>section` would make it the box the fixed action bar sits in.
  return <div className="record">
    <div className="head">
      <div><h1 id="t-applicant">{c.name}</h1>
        <p className="muted">{OPERATION_LABEL[a.operation]} · {SOURCE_LABEL[a.source]} · Applied {fmtDate(a.created_at)}</p></div>
      <div className="inline">
        {tel && <a className="btn ghost sm" href={`tel:${tel}`}>Call</a>}
        {tel && <a className="btn ghost sm" href={`https://wa.me/${tel.slice(1)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        {c.email && <a className="btn ghost sm" href={`mailto:${c.email}`}>Email</a>}
        <a href="#/applicants">← Back to applicants</a>
      </div>
    </div>
    {archived && <p className="warn" role="note">Archived {fmtDate(a.archived_at)}. Restore it to work on it again, or delete it permanently from the bar below.</p>}

    <div className="filters">
      <div className="apply"><label>Stage<select ref={stageRef} value={stage} disabled={archived} onKeyDown={onEnter(applyStage)}
        onChange={e => { setChoice(x => ({ ...x, stage: e.target.value })); if (e.target.value !== "lost") setLost(null); }}>
        {OPTIONS.stages.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        {!archived && <button type="button" className="btn ghost sm" disabled={stage === a.stage} onClick={applyStage}>
          Apply<span className="sr"> stage</span></button>}</div>
      <div className="apply"><label>Assigned to<select ref={ownerRef} value={owner} disabled={archived} onKeyDown={onEnter(applyOwner)}
        onChange={e => setChoice(x => ({ ...x, assigned_to: e.target.value }))}>
        <option value="">Unassigned</option>{owners.map(u => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}</select></label>
        {!archived && <button type="button" className="btn ghost sm" disabled={owner === (a.assigned_to ?? "")} onClick={applyOwner}>
          Apply<span className="sr"> assigned to</span></button>}</div>
      {a.stage === "lost" && lost === null && a.lost_reason && <p className="muted lost-reason">Lost: {a.lost_reason}</p>}
    </div>
    {lost !== null && <form className="inline" onSubmit={e => { e.preventDefault(); if (lost.trim()) putApplicant("stage", { stage: "lost", lost_reason: lost.trim() }, "Marked as lost.", stageRef); }}>
      <label htmlFor="lost-reason">Why was it lost?</label>
      <input id="lost-reason" ref={lostRef} value={lost} maxLength={200} onChange={e => setLost(e.target.value)} placeholder="Bought privately, stopped answering…" />
      <button className="btn sm" disabled={!lost.trim()}>Save as lost</button>
      <button type="button" className="btn ghost sm" onClick={cancelLost}>Cancel</button>
    </form>}
    <Message m={note} onReload={load} />

    {data.duplicates.map(d => <Duplicate key={d.id} dup={d} stored={{ ...a, ...c }} contactId={c.id} nameOf={nameOf}
      archived={archived} onCopy={copy} onConfirmMarketing={confirmMarketing} onDismiss={dismiss} />)}

    <div className="seg" role="tablist" aria-label="Applicant record" onKeyDown={onTabKey}>{TABS.map(([k, t]) =>
      <button key={k} ref={el => { tabs.current[k] = el; }} type="button" role="tab" id={`tab-${k}`} aria-selected={cur === k}
        aria-controls={`panel-${k}`} tabIndex={cur === k ? 0 : -1} onClick={() => go(k)}>{t}</button>)}</div>

    <div role="tabpanel" id="panel-requirements" aria-labelledby="tab-requirements" hidden={cur !== "requirements"}>
      <form ref={formRef} noValidate onSubmit={e => { e.preventDefault(); if (dirty && !busy) save(); }}>
        {/* Archived: read only until restored. */}
        <fieldset className="sections plain" disabled={archived}>
          <ApplicantFields value={form} onChange={setForm} errors={errors} operation={form.operation} />
        </fieldset>
      </form>
    </div>
    <div role="tabpanel" id="panel-matches" aria-labelledby="tab-matches" hidden={cur !== "matches"} tabIndex={0}>
      <Matches matches={data.matches} applicant={a} msg={matchMsg} busy={reviewing} onReview={reviewMatch} />
    </div>
    <div role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline" hidden={cur !== "timeline"} tabIndex={0}>
      <Timeline events={data.events} viewings={data.viewings} matches={data.matches} by={by} nameOf={nameOf} />
    </div>

    <div className="actionbar" role="region" aria-label="Actions">
      <Message m={msg} onReload={load} />
      {dirty && <span className="unsaved">Unsaved changes</span>}
      <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</button>
      {dirty && <button type="button" className="btn ghost" onClick={discard} disabled={busy}>Discard</button>}
      {!archived && <button type="button" className="btn ghost" disabled={dirty || busy} title={dirty ? "Save first" : undefined}
        onClick={() => act("archive")}>Archive</button>}
      {archived && <button type="button" className="btn ghost" disabled={dirty || busy} title={dirty ? "Save first" : undefined}
        onClick={() => act("restore")}>Restore</button>}
      {archived && <form className="inline" onSubmit={destroy}>
        <label htmlFor="del-confirm">To delete permanently, type {c.name}</label>
        <input id="del-confirm" value={confirmDel} onChange={e => setConfirmDel(e.target.value)} autoComplete="off" />
        <button className="btn ghost danger" disabled={confirmDel !== c.name || busy}>Delete permanently</button></form>}
    </div>
  </div>;
}

// A save refused because someone else saved first (409) offers to load their version.
const Message = ({ m, onReload }) => m && <p role={m.ok ? "status" : "alert"} className={m.ok ? "ok" : "err"}>{m.text}
  {m.stale && <> <button type="button" className="btn ghost sm" onClick={onReload}>Reload</button></>}</p>;

// §3.3: a pending "registered again" from the website. Shows what they sent that differs from what is saved.
function Duplicate({ dup, stored, contactId, nameOf, archived, onCopy, onConfirmMarketing, onDismiss }) {
  const sent = dup.data ?? {};
  const differs = k => !blank(sent[k]) && !same(k, sent[k], stored[k]);
  // Sent for the other operation: that is a second search, not changes to this one.
  const keys = [...CONTACT, ...SEARCH].filter(differs);
  const copyable = (sent.operation == null || sent.operation === stored.operation) && COPY.some(differs);
  const optIn = sent.marketing === true && stored.marketing_opt_in_at == null;
  return <section className="warn dup" aria-labelledby={`dup-${dup.id}`}>
    <h2 id={`dup-${dup.id}`} tabIndex={-1}>{dup.title}</h2>
    <p className="muted">{fmtAgo(dup.created_at)} · {keys.length ? "What they sent that differs from what is saved:" : "What they sent matches what is saved."}</p>
    {sent.other_contact_id != null && <p>Their email and their phone number belong to two different contacts.</p>}
    {keys.length > 0 && <dl className="changes">{keys.map(k => <div key={k}><dt>{LABEL[k]}</dt>
      <dd><span className="muted">Saved:</span> {show(k, stored[k], nameOf)} <span className="muted">· Sent:</span> {show(k, sent[k], nameOf)}</dd></div>)}</dl>}
    {optIn && <p>They agreed to marketing this time. The website doesn't check who sent this. Confirm with them before you record it.</p>}
    <div className="inline">
      {copyable && <button type="button" className="btn sm" disabled={archived} onClick={() => onCopy(sent)}>Copy fields</button>}
      {optIn && <button type="button" className="btn ghost sm" disabled={archived} onClick={() => onConfirmMarketing(dup)}>Confirm marketing opt-in</button>}
      {dup.active_search_id == null && <a className="btn ghost sm" href={`#/applicants/new?contact=${contactId}`}>Create second search</a>}
      <button type="button" className="btn ghost sm" onClick={() => onDismiss(dup)}>Dismiss</button>
    </div>
  </section>;
}

// Spec §5: Found, Shortlisted and Rejected, each best first (as the API orders them). Each empty group says why.
function Matches({ matches, applicant: a, msg, busy, onReview }) {
  const archived = !!a.archived_at, closed = ["lost", "completed"].includes(a.stage);
  const reviewed = matches.some(m => m.status !== "found");
  const empty = {
    found: archived ? "Archived searches get no new matches. Restore it to look again."
      : closed ? `Searches marked ${show("stage", a.stage)} get no new matches.`
      : reviewed ? "Nothing left to review. Listings that fit this search appear here when they are added or change."
      : "No listing fits this search right now. Listings that fit appear here when they are added or change. Check the requirements if you expected some.",
    shortlisted: "Nothing shortlisted yet.",
    rejected: "Nothing rejected.",
  };
  return <div className="matches">
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {GROUPS.map(([k, t]) => {
      const list = matches.filter(m => m.status === k);
      return <section key={k} className="match-group" aria-labelledby={`group-${k}`}>
        <h2 id={`group-${k}`} tabIndex={-1}>{t} <span className="count">{list.length}</span></h2>
        {list.length ? <ul className="match-list">{list.map(m => <li key={m.id}>
          <MatchCard match={m} busy={busy} disabled={archived} onReview={r => onReview(m, r)} /></li>)}</ul>
          : <p className="empty card">{empty[k]}</p>}
      </section>;
    })}
  </div>;
}

// What a match.reviewed event did, with the listing's title when its match is still stored.
function reviewed(e, matches) {
  const d = e.data ?? {}, title = matches.find(m => m.listing.id === d.listing_id)?.listing.title ?? d.listing_id;
  if (d.to === "shortlisted") return [`Shortlisted ${title}`];
  if (d.to === "rejected") return [`Rejected ${title} · ${REASON_LABEL[d.reason] ?? d.reason}`];
  return ["Moved back to Found", title];
}
const headline = (e, matches) => (e.type === "match.reviewed" ? reviewed(e, matches)
  : e.type === "applicant.matched" && e.data?.new != null ? [`${e.data.new} new ${e.data.new === 1 ? "match" : "matches"} found`]
  : [EVENT[e.type] ?? e.type]);

// The history, newest first: events with who and what changed, and the website's viewing requests from the same
// email or phone (G4).
function Timeline({ events, viewings, matches, by, nameOf }) {
  const items = [...events.map(e => ({ at: e.at, e, h: headline(e, matches) })), ...viewings.map(v => ({ at: v.created_at, v }))]
    .sort((x, y) => y.at.localeCompare(x.at));
  if (!items.length) return <p className="empty card">Nothing has happened yet.</p>;
  const when = at => <time dateTime={at} title={fmtDate(at)}>{fmtAgo(at)}</time>;
  return <ol className="timeline card">{items.map(({ e, h, v }) => e ? <li key={`e${e.id}`}>
    <p><strong>{h[0]}</strong> <span className="muted">{by(e.actor)} · {when(e.at)}</span></p>
    {h[1] && <p>{h[1]}</p>}
    {e.type === "applicant.created" && e.data && <p className="muted">{show("operation", e.data.operation)} · {show("source", e.data.source)}</p>}
    {e.data?.after && <dl className="changes">{Object.keys(e.data.after).map(k => <div key={k}><dt>{LABEL[k] ?? k}</dt>
      <dd><span className="sr">from </span>{show(k, e.data.before?.[k], nameOf)} <span aria-hidden="true">→</span><span className="sr"> to</span> {show(k, e.data.after[k], nameOf)}</dd></div>)}</dl>}
  </li> : <li key={`v${v.id}`}>
    <p><strong>Viewing request</strong> <span className="muted">Website · {when(v.created_at)}</span></p>
    <p>{v.listing_title || v.listing_ref || "General enquiry / valuation"} · {v.date} at {v.time} · {VIEWING_STATUS[v.status] ?? v.status} · <a href="#/viewings">Open viewing requests</a></p>
  </li>)}</ol>;
}
