import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay, firstSentence, VIEWING_STATUS, OUTCOME } from "./format.js";
import { setUnsaved } from "./unsaved.js";
import { KINDS, OUTCOMES, jerseyToday } from "../../server/viewings.js";
import SlotPicker from "./SlotPicker.jsx";

// Spec §5: a viewing from the request to its outcome, and the team's own bookings (C14).
const TABS = { requests: "Requests", upcoming: "Upcoming", outcome: "Needs outcome", past: "Past" };
const EMPTY = {
  requests: "No requests waiting. Requests from the website appear here until they are confirmed or cancelled.",
  upcoming: "No confirmed viewings coming up. Confirm a request, or use New viewing for a booking by phone.",
  outcome: "Nothing to close. Confirmed viewings appear here once their time has passed, to record how they went.",
  past: "No past viewings yet. Completed, no-show and cancelled viewings appear here.",
};
const listingOf = v => v.listing_title || v.listing_ref || "General enquiry / valuation";
const tel = p => p.replace(/[^\d+]/g, "");
const Msg = ({ m }) => m && <p role={m.ok ? "status" : "alert"} className={m.ok ? "ok" : "err"}>{m.text}</p>;
const Badge = ({ status }) => { const [t, tone] = VIEWING_STATUS[status] ?? [status, "neutral"]; return <span className={`badge ${tone}`}>{t}</span>; };
// A refusal once the list has been reloaded: a stale save's "Reload to see them" has been done already.
const refusal = e => (/Reload to see/.test(e.message)
  ? `${firstSentence(e.message)} This is the latest version; your change was not saved.` : e.message);
const stillThere = (d, id) => !!d?.viewings.some(x => x.id === id);

// listing: the #/viewings?listing=<id> filter (the listing editor's "Active interest" link).
export default function Viewings({ listing }) {
  const [tab, setTab] = useState("requests"), [data, setData] = useState(null), [loadErr, setLoadErr] = useState(null);
  const [sel, setSel] = useState(null), [msg, setMsg] = useState(null), [creating, setCreating] = useState(false);
  const [title, setTitle] = useState(null), [focusTo, setFocusTo] = useState(null), [counts, setCounts] = useState({});
  const [dirty, setDirty] = useState({ notes: false, form: false });
  const seq = useRef(0), headRef = useRef(null), listRef = useRef(null), detailRef = useRef(null), newBtn = useRef(null);
  // A viewing that a refused action moved out of this tab while its notes were still unsaved: it stays open (as last
  // read) so the notes can be saved, instead of being dropped with it.
  const pinned = useRef(null);
  const filter = listing ? `&listing_id=${encodeURIComponent(listing)}` : "";

  // Resolves to the list read (undefined when it failed or a newer read superseded it).
  const load = (t = tab) => {
    const n = ++seq.current;
    return api(`/admin/viewings?tab=${t}${filter}`).then(d => {
      if (n !== seq.current) return;
      setData(d); setCounts(d.counts); setLoadErr(null);
      setSel(id => (stillThere(d, id) || id === pinned.current?.id ? id : d.viewings[0]?.id ?? null));
      return d;
    }, e => { if (n === seq.current) setLoadErr(e.message); });
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (listing) api(`/admin/listings/${encodeURIComponent(listing)}/interest`).then(d => setTitle(d.title), () => {});
  }, [listing]);
  const onDirty = useCallback((k, b) => setDirty(d => (d[k] === b ? d : { ...d, [k]: b })), []);
  useEffect(() => { setUnsaved(dirty.notes || dirty.form); }, [dirty]);
  useEffect(() => () => setUnsaved(false), []);
  // Typed notes go with the open viewing: switching to another one asks first (the New viewing form stays open).
  const leaveDetail = () => !dirty.notes || confirm("You have unsaved notes. Leave without saving them?");
  // focusTo: {to: "detail" | "list" | "heading"}, a new object each time, once the list it applies to is shown.
  useEffect(() => {
    if (!focusTo) return;
    (focusTo.to === "detail" ? detailRef.current : focusTo.to === "list"
      ? listRef.current?.querySelector("[aria-current=true]") ?? headRef.current : headRef.current)?.focus();
  }, [focusTo]);

  const show = t => {
    if (t === tab || !leaveDetail()) return;
    pinned.current = null; setTab(t); setData(null); setSel(null); setMsg(null); setLoadErr(null); load(t);
  };
  const pick = id => { if (id !== sel && leaveDetail()) { pinned.current = null; setSel(id); } };

  // One change to viewing v (an action, notes or the delete), then the list again. The focus follows the viewing when it
  // is still in this tab, else the next one in the list. Resolves to the error text, or null.
  // A refusal that leaves v out of the reloaded tab (someone else confirmed or cancelled it meanwhile) keeps v open when
  // it has unsaved notes (the detail says why); otherwise the message shows above the list, which takes the focus.
  const send = async (v, call, { done, notes, refocus = true }) => {
    const list = data.viewings, i = list.findIndex(x => x.id === v.id), next = (list[i + 1] ?? list[i - 1])?.id ?? null;
    setMsg(null);
    try { await call(); }
    catch (e) {
      const text = refusal(e);
      if (notes !== undefined) pinned.current = v;
      const d = await load();
      if (d && !stillThere(d, v.id)) {
        if (notes !== undefined) { setSel(v.id); setFocusTo({ to: "detail" }); }
        else { pinned.current = null; setMsg({ text }); setFocusTo({ to: "list" }); }
      } else pinned.current = null;
      return text;
    }
    pinned.current = null;
    // The typed notes, saved after the action (the action itself would drop them).
    let m = { ok: true, text: done };
    if (notes !== undefined) await api(`/admin/viewings/${v.id}`, { method: "PUT", body: { notes } })
      .catch(e => { m = { text: `${done} The notes weren't saved: ${e.message}` }; });
    const d = await load();
    if (d) {
      const stays = stillThere(d, v.id);
      setSel(stays ? v.id : stillThere(d, next) ? next : d.viewings[0]?.id ?? null);
      if (refocus || !stays) setFocusTo({ to: stays ? "detail" : "list" });
    }
    setMsg(m);
    return null;
  };
  const put = (v, body) => () => api(`/admin/viewings/${v.id}`, { method: "PUT", body });
  const act = (v, action, extra, opts) => send(v, put(v, { action, updated_at: v.updated_at, ...extra }), opts);
  const saveNotes = (v, notes) => send(v, put(v, { notes }), { done: "Notes saved.", refocus: false });
  const remove = v => confirm(`Delete the viewing of ${v.name}? This can't be undone.`)
    && send(v, () => api(`/admin/viewings/${v.id}`, { method: "DELETE" }), { done: "Viewing deleted." });

  const booked = async (id, text) => {
    setCreating(false);
    // Unsaved notes on the open viewing stay unless the person lets them go; the booking is in Upcoming either way.
    // Kept: the open viewing stays (a reload keeps it selected) and the list and counters take in the booking.
    if (!leaveDetail()) {
      await load();
      setMsg({ ok: true, text: `${text} It's in Upcoming.` });
      requestAnimationFrame(() => newBtn.current?.focus());
      return;
    }
    pinned.current = null; setTab("upcoming"); setData(null); setSel(id); setLoadErr(null);
    const d = await load("upcoming");
    if (d && stillThere(d, id)) { setSel(id); setFocusTo({ to: "detail" }); } else setFocusTo({ to: "heading" });
    setMsg({ ok: true, text });
  };
  const closeForm = () => { setCreating(false); setFocusTo(null); requestAnimationFrame(() => newBtn.current?.focus()); };
  const v = data?.viewings.find(x => x.id === sel) ?? (data && pinned.current?.id === sel ? pinned.current : null);
  const groups = !data ? [] : tab !== "upcoming" ? [[null, data.viewings]]
    : Object.entries(data.viewings.reduce((a, x) => ((a[x.date] ||= []).push(x), a), {}));

  return <section aria-labelledby="t-views">
    <div className="head"><h1 id="t-views" ref={headRef} tabIndex={-1}>Viewings</h1>
      {!creating && <button type="button" ref={newBtn} className="btn" onClick={() => { setCreating(true); setMsg(null); }}>New viewing</button>}</div>
    {listing && <p className="view-filter">Only the viewings of <a href={`#/p/${encodeURIComponent(listing)}`}>{title ? `${title} (${listing})` : listing}</a>.{" "}
      <a href="#/viewings">Show all viewings</a></p>}
    {creating && <NewViewing listing={listing} onBooked={booked} onClose={closeForm} onDirty={onDirty} />}
    <div className="seg" role="group" aria-label="Viewings">{Object.entries(TABS).map(([k, t]) =>
      <button key={k} type="button" aria-pressed={tab === k} onClick={() => show(k)}>{t}<span className="count">{counts[k] ?? ""}</span></button>)}</div>
    <Msg m={msg} />
    {loadErr && <p role="alert" className="err">{loadErr} <button type="button" className="linkish" onClick={() => load()}>Try again</button></p>}
    {!data ? !loadErr && <p>Loading viewings…</p>
      : !data.viewings.length && !v ? <p className="empty card">{listing ? `No viewings of this listing in ${TABS[tab]}.` : EMPTY[tab]}</p>
      : <div className="inbox">
        <div ref={listRef} className="inbox-list">{groups.map(([date, rows]) => <div key={date ?? "all"}>
          {date && <h2 className="day-head" id={`d-${date}`}>{fmtDay(date, true)}</h2>}
          <ul {...(date ? { "aria-labelledby": `d-${date}` } : { "aria-label": `${TABS[tab]} viewings` })}>{rows.map(x => <li key={x.id}>
            <button type="button" aria-current={x.id === sel ? "true" : undefined} onClick={() => pick(x.id)}>
              <span className="who">{x.name}</span>
              <span className="muted num">{tab === "upcoming" ? `${x.time}–${x.end_time}` : `${fmtDay(x.date)} · ${x.time}`}</span>
              <span className="what">{listingOf(x)}</span>
              {tab === "past" ? <Badge status={x.status} /> : <span className="muted">{x.negotiator_name ?? "No negotiator"}</span>}
            </button></li>)}</ul>
        </div>)}</div>
        {v && <Detail key={v.id} v={v} gone={!stillThere(data, v.id) ? TABS[tab] : null} ended={tab === "outcome"} filtered={listing === v.listing_id} headRef={detailRef}
          act={act} saveNotes={saveNotes} remove={remove} onDirty={onDirty} />}
      </div>}
  </section>;
}

// gone: the tab v has just left (see send); only its notes can still be saved.
function Detail({ v, gone, ended, filtered, headRef, act, saveNotes, remove, onDirty }) {
  const [notes, setNotes] = useState(v.notes ?? ""), [open, setOpen] = useState(null); // open: "complete" | "reschedule"
  const [err, setErr] = useState(null), [interest, setInterest] = useState(null), [refresh, setRefresh] = useState(0);
  const busy = useRef(false), notesRef = useRef(null), opener = useRef(null);
  const notesDirty = notes.trim() !== (v.notes ?? "");
  useEffect(() => { onDirty("notes", notesDirty); }, [notesDirty]);
  useEffect(() => () => onDirty("notes", false), []);
  // C10's count for the listing: read with the listing, and again after each change to this viewing.
  useEffect(() => {
    if (!v.listing_id) return;
    let live = true;
    api(`/admin/listings/${v.listing_id}/interest`).then(d => live && setInterest(d.active_interest), () => {});
    return () => { live = false; };
  }, [v.listing_id, v.updated_at, v.status]);

  // Presses while a request is under way are ignored (the buttons stay enabled, so they keep the focus).
  const run = async (fn, after) => {
    if (busy.current) return;
    busy.current = true; setErr(null);
    const e = await fn();
    busy.current = false;
    if (e) { setErr(e); setRefresh(x => x + 1); } else after?.();
  };
  const withNotes = done => ({ done, notes: notesDirty ? notes : undefined });
  const confirmIt = () => run(() => act(v, "confirm", {}, withNotes("Confirmed. It's in Upcoming now.")));
  const noShow = () => run(() => act(v, "no_show", {}, withNotes("Marked as a no-show. It's in Past now.")));
  const cancel = () => confirm(`Cancel the viewing with ${v.name} on ${fmtDay(v.date, true)} at ${v.time}? Its time becomes free again.`)
    && run(() => act(v, "cancel", {}, withNotes("Viewing cancelled. Its time is free again.")));
  const complete = body => run(() => act(v, "complete", body, withNotes("Outcome saved. It's in Past now.")));
  const reschedule = slot => run(() => act(v, "reschedule", slot,
    withNotes(`Moved to ${fmtDay(slot.date, true)} at ${slot.time}.`)), () => setOpen(null));
  const toggle = (k, e) => { opener.current = e.currentTarget; setOpen(o => (o === k ? null : k)); setErr(null); };
  const close = () => { setOpen(null); setErr(null); opener.current?.focus(); };

  const subject = encodeURIComponent(`Your viewing: ${listingOf(v)}`);
  const n = interest;
  const active = !gone && (v.status === "requested" || v.status === "confirmed");
  return <article className="card inbox-detail" aria-labelledby="v-name">
    <div className="head"><div>
      <h2 id="v-name" ref={headRef} tabIndex={-1}>{v.name} <Badge status={v.status} /></h2>
      <p className="muted">Added {fmtDate(v.created_at)}</p></div>
      <div className="inline">
        {active && v.status === "requested" && <button type="button" className="btn" onClick={confirmIt}>Confirm</button>}
        {active && v.status === "confirmed" && ended && <>
          <button type="button" className="btn" aria-expanded={open === "complete"} onClick={e => toggle("complete", e)}>Mark completed</button>
          <button type="button" className="btn ghost" onClick={noShow}>No-show</button></>}
        {active && <button type="button" className="btn ghost" aria-expanded={open === "reschedule"} onClick={e => toggle("reschedule", e)}>Reschedule</button>}
      </div></div>
    {err && <p role="alert" className="err">{err}</p>}
    {gone && <p className="warn" role="note">This viewing has changed and is no longer in {gone}. Your notes aren't saved yet:
      save them below, then choose another viewing.</p>}
    {active && open === "complete" && <OutcomeForm onSave={complete} onClose={close} />}
    {active && open === "reschedule" && <RescheduleForm v={v} refresh={refresh} onSave={reschedule} onClose={close} />}
    <dl className="kv">
      <div><dt>Listing</dt><dd>{v.listing_id ? <a href={`#/p/${v.listing_id}`}>{listingOf(v)}</a>
        : v.listing_ref ? <>{listingOf(v)} <span className="muted">({v.listing_ref}, listing deleted)</span></> : listingOf(v)}</dd></div>
      <div><dt>When</dt><dd className="num">{fmtDay(v.date, true)} · {v.time}–{v.end_time}</dd></div>
      <div><dt>Negotiator</dt><dd>{v.negotiator_name ?? "No negotiator"}</dd></div>
      <div><dt>Viewing</dt><dd>{v.kind}</dd></div>
      {v.email && <div><dt>Email</dt><dd><a href={`mailto:${v.email}?subject=${subject}`}>{v.email}</a></dd></div>}
      {v.phone && <div><dt>Phone</dt><dd><a href={`tel:${tel(v.phone)}`}>{v.phone}</a></dd></div>}
      {v.listing_id && n != null && <div><dt>Interest in this listing</dt><dd>{filtered ? `${n} ${n === 1 ? "person" : "people"} interested`
        : <a href={`#/viewings?listing=${v.listing_id}`}>{n} {n === 1 ? "person" : "people"} interested</a>}</dd></div>}
      {v.status === "completed" && <div><dt>Outcome</dt><dd>{OUTCOME[v.outcome] ?? "Not recorded"}
        {v.outcome_note && <span className="muted"> · {v.outcome_note}</span>}</dd></div>}
    </dl>
    <div className="inline">{v.email && <a className="btn ghost sm" href={`mailto:${v.email}?subject=${subject}`}>Reply by email</a>}
      {v.phone && <a className="btn ghost sm" href={`tel:${tel(v.phone)}`}>Call</a>}</div>
    <div className="field"><label htmlFor="v-notes">Internal notes (only staff see these)</label>
      <textarea id="v-notes" ref={notesRef} value={notes} maxLength={4000} onChange={e => setNotes(e.target.value)} placeholder="e.g. Called on Tuesday, prefers Saturday morning" />
      <div className="inline"><button type="button" className="btn sm" disabled={!notesDirty}
        onClick={() => run(() => saveNotes(v, notes), () => notesRef.current?.focus())}>Save notes</button></div></div>
    {!gone && <details className="more"><summary>More</summary><div className="inline">
      {active && v.status === "confirmed" && !ended && <>
        <button type="button" className="btn ghost sm" aria-expanded={open === "complete"} onClick={e => toggle("complete", e)}>Mark completed</button>
        <button type="button" className="btn ghost sm" onClick={noShow}>No-show</button></>}
      {active && <button type="button" className="btn ghost sm danger" onClick={cancel}>Cancel viewing</button>}
      <button type="button" className="btn ghost sm danger" onClick={() => run(() => remove(v) || null)}>Delete viewing</button>
    </div></details>}
  </article>;
}

// C9: the team's outcome of a completed viewing, with an optional reason.
function OutcomeForm({ onSave, onClose }) {
  const [outcome, setOutcome] = useState(null), [note, setNote] = useState(""), [err, setErr] = useState(null);
  const head = useRef(null), first = useRef(null);
  useEffect(() => { head.current?.focus(); }, []);
  const submit = e => {
    e.preventDefault();
    if (!outcome) { setErr("Choose an outcome"); first.current?.focus(); return; }
    onSave({ outcome, outcome_note: note.trim() || null });
  };
  return <form className="view-form" onSubmit={submit} aria-labelledby="h-outcome">
    <h3 id="h-outcome" ref={head} tabIndex={-1}>Mark completed</h3>
    <fieldset className="choices-set" aria-describedby={err ? "e-outcome" : undefined}><legend>How did it go?</legend>
      <div className="choices">{OUTCOMES.map((k, i) => <label key={k} className="check">
        <input type="radio" name="outcome" ref={i ? undefined : first} value={k} checked={outcome === k} onChange={() => { setOutcome(k); setErr(null); }} />
        {OUTCOME[k]}</label>)}</div>
      {err && <small id="e-outcome" className="err">{err}</small>}</fieldset>
    <label>Reason (optional)<textarea className="short" maxLength={500} value={note} onChange={e => setNote(e.target.value)}
      placeholder="e.g. Wants a second viewing with their partner" /></label>
    <div className="inline"><button className="btn">Save outcome</button><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
  </form>;
}

function RescheduleForm({ v, refresh, onSave, onClose }) {
  const [slot, setSlot] = useState({ negotiator_id: v.negotiator_id, date: v.date >= jerseyToday() ? v.date : null, time: null });
  const [err, setErr] = useState(null);
  const head = useRef(null);
  useEffect(() => { head.current?.focus(); }, []);
  const submit = e => {
    e.preventDefault();
    if (!slot.time) return setErr("Choose a day and a time");
    onSave({ negotiator_id: slot.negotiator_id, date: slot.date, time: slot.time });
  };
  return <form className="view-form" onSubmit={submit} aria-labelledby="h-resched">
    <h3 id="h-resched" ref={head} tabIndex={-1}>Reschedule</h3>
    <p className="muted">Now {fmtDay(v.date, true)} at {v.time}{v.negotiator_name ? ` with ${v.negotiator_name}` : ""}. Choose the new time.</p>
    <SlotPicker value={slot} onChange={s => { setSlot(s); setErr(null); }} own={v} refresh={refresh} errors={err ? { time: err } : {}} />
    <div className="inline"><button className="btn">Save new time</button><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
  </form>;
}

// C14: a booking taken by phone or in the office, confirmed at once. Email or phone is enough.
function NewViewing({ listing, onBooked, onClose, onDirty }) {
  const [f, setF] = useState({ listing_id: listing ?? "", kind: KINDS[0], name: "", email: "", phone: "", notes: "" });
  const [slot, setSlot] = useState({ negotiator_id: null, date: null, time: null }), [listings, setListings] = useState(null);
  const [errors, setErrors] = useState({}), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const head = useRef(null), form = useRef(null), focusErr = useRef(false);
  useEffect(() => { head.current?.focus(); api("/admin/listings?slim=1").then(d => setListings(d.listings), e => setMsg({ text: e.message })); }, []);
  const dirty = !!(f.name.trim() || f.email.trim() || f.phone.trim() || f.notes.trim() || slot.time);
  useEffect(() => { onDirty("form", dirty); }, [dirty]);
  useEffect(() => () => onDirty("form", false), []);
  // After a refused submit, the first highlighted field takes the focus.
  useEffect(() => { if (focusErr.current) { focusErr.current = false; form.current?.querySelector("[aria-invalid=true]")?.focus(); } }, [errors]);

  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const invalid = k => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `e-nv-${k}` : undefined });
  const error = k => errors[k] && <small id={`e-nv-${k}`} className="err">{errors[k]}</small>;
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const local = {};
    if (!f.name.trim()) local.name = "Enter their name";
    if (!f.email.trim() && !f.phone.trim()) local.email = "Enter an email address or a phone number";
    if (!slot.time) local.time = "Choose a negotiator, a day and a time";
    if (Object.keys(local).length) { focusErr.current = true; setErrors(local); setMsg({ text: "Please check the highlighted fields." }); return; }
    setBusy(true); setMsg(null);
    try {
      const { id } = await api("/admin/viewings", { method: "POST", body: { listing_id: f.listing_id || null, kind: f.kind,
        negotiator_id: slot.negotiator_id, date: slot.date, time: slot.time, name: f.name, email: f.email.trim() || null,
        phone: f.phone.trim() || null, notes: f.notes.trim() || null } });
      onBooked(id, `Viewing booked for ${fmtDay(slot.date, true)} at ${slot.time}.`);
    } catch (err) {
      focusErr.current = true; setErrors(err.data?.fields || {}); setMsg({ text: err.message });
      if (err.status === 409) setRefresh(x => x + 1); // the times again; what was typed stays
    } finally { setBusy(false); }
  };
  const state = l => (l.archived_at ? " · archived" : l.published ? "" : " · draft");

  return <form ref={form} className="card view-new" onSubmit={submit} aria-labelledby="h-new" noValidate>
    <h2 id="h-new" ref={head} tabIndex={-1}>New viewing</h2>
    <p className="muted">For a booking by phone or in the office. It is confirmed straight away.</p>
    <div className="grid2">
      <label>Property<select value={f.listing_id} onChange={set("listing_id")} {...invalid("listing_id")}>
        <option value="">General enquiry / valuation</option>
        {listings?.map(l => <option key={l.id} value={l.id}>{l.title} ({l.id}){state(l)}</option>)}
        {!listings && f.listing_id && <option value={f.listing_id}>{f.listing_id}</option>}
      </select>{error("listing_id")}</label>
      <label>Viewing type<select value={f.kind} onChange={set("kind")} {...invalid("kind")}>
        {KINDS.map(k => <option key={k}>{k}</option>)}</select>{error("kind")}</label>
    </div>
    <SlotPicker value={slot} onChange={s => { setSlot(s); setErrors(({ negotiator_id, date, time, ...x }) => x); }}
      refresh={refresh} errors={errors} />
    <div className="grid2">
      <label>Name<input value={f.name} maxLength={120} autoComplete="off" onChange={set("name")} {...invalid("name")} />{error("name")}</label>
      <label>Email<input type="email" value={f.email} maxLength={254} autoComplete="off" onChange={set("email")} {...invalid("email")} />{error("email")}</label>
      <label>Phone<input type="tel" value={f.phone} maxLength={40} autoComplete="off" onChange={set("phone")} {...invalid("phone")} />{error("phone")}</label>
    </div>
    <p className="muted">An email address or a phone number is enough.</p>
    <label>Internal notes (optional)<textarea className="short" value={f.notes} maxLength={4000} onChange={set("notes")} /></label>
    <div className="inline"><button className="btn">{busy ? "Booking…" : "Book viewing"}</button>
      <button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
    <Msg m={msg} />
  </form>;
}
