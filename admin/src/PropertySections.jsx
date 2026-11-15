import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay, fmtDayMonth, firstSentence, safeHref, VIEWING_STATUS, OUTCOME } from "./format.js";
import { stageOf } from "../../server/viewing-cycle.js";
import { CONFIRMATION } from "./ConfirmedAvailability.jsx";

// SPR-08: the property's viewings, the team's notes about it and its adverts, for staff only. The editor shows these
// cards only once the server reports sections_enabled (SPR08_SECTIONS_READY and migration 0079). Viewings and adverts
// are read with what already exists (the Viewings lists, the imported research and EST-16's confirmation); only the
// notes are saved here, each on its own.
const SHOWN = 50;
const failed = message => <p role="alert" className="err">{message}</p>;

// VIS-08's two stages that are dates beside the status, named only when the server reports the cycle on.
const STAGE = { reminded: ["Reminded", "positive"], feedback: ["Feedback received", "positive"] };
const TABS = ["requests", "upcoming", "outcome", "past"];
const slot = v => `${v.date} ${v.time}`;

// Read only: every viewing of the property as the Viewings lists give them, each linked to its detail there.
function PropertyViewings({ listingId }) {
  const [data, setData] = useState(null), [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    setData(null); setError(null);
    Promise.all(TABS.map(tab => api(`/admin/viewings?tab=${tab}&listing_id=${encodeURIComponent(listingId)}`))).then(([requests, upcoming, outcome, past]) => {
      if (!live) return;
      setData({ cycle: [requests, upcoming, outcome, past].some(d => d.cycle), unrecorded: new Set(outcome.viewings.map(v => v.id)),
        upcoming: [...requests.viewings, ...upcoming.viewings].sort((a, b) => slot(a).localeCompare(slot(b))),
        past: [...outcome.viewings, ...past.viewings].sort((a, b) => slot(b).localeCompare(slot(a))) });
    }, e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [listingId]);
  const all = `#/viewings?listing=${encodeURIComponent(listingId)}`;
  const group = (id, title, rows, empty) => <>
    <h3 id={id}>{title} <span className="muted">({rows.length})</span></h3>
    {rows.length ? <ul className="confirmations" aria-labelledby={id}>{rows.slice(0, SHOWN).map(v => {
      const stage = data.cycle ? stageOf(v) : v.status, [label, tone] = STAGE[stage] ?? VIEWING_STATUS[stage] ?? [stage, "neutral"];
      const facts = [v.name, v.kind, v.negotiator_name ? `Shown by ${v.negotiator_name}` : "No negotiator",
        data.cycle && v.reminded_at && `Reminded ${fmtDate(v.reminded_at)}`,
        data.unrecorded.has(v.id) && "Outcome not recorded yet",
        v.outcome && `Outcome: ${OUTCOME[v.outcome] ?? v.outcome}`,
        data.cycle && v.feedback_at && `Feedback received ${fmtDate(v.feedback_at)}`].filter(Boolean);
      return <li key={v.id}><a href={`${all}&viewing=${v.id}`}>{fmtDay(v.date, true)} · {v.time}{v.end_time ? `-${v.end_time}` : ""}</a>{" "}
        <span className={`badge ${tone}`}>{label}</span><br /><span className="muted">{facts.join(" · ")}</span></li>;
    })}</ul> : <p className="muted">{empty}</p>}
    {rows.length > SHOWN && <p className="muted">Showing {SHOWN} of {rows.length}. The rest are in Viewings.</p>}
  </>;
  return <section id="s-property-viewings" className="card fields-group" aria-labelledby="h-property-viewings">
    <h2 id="h-property-viewings">Viewings of this property <span className="muted">(read only)</span></h2>
    <p className="muted">Requests, bookings and how each one went. Open a viewing to confirm it, move it or record its outcome
      in <a href={all}>Viewings</a>.</p>
    {error ? failed(`The viewings couldn't be loaded: ${error}`) : !data ? <p>Loading viewings…</p> : <>
      {group("h-viewings-upcoming", "Upcoming", data.upcoming, "No viewing requested or booked.")}
      {group("h-viewings-past", "Past", data.past, "No past viewings yet.")}
    </>}
  </section>;
}

// The team's notes about the property, newest first. Each note, correction and withdrawal is added to a history that
// is never rewritten; the server gives the versions in force, and a withdrawn note without its text.
function PropertyNotes({ listingId }) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [text, setText] = useState("");
  const [edit, setEdit] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [invalid, setInvalid] = useState(null);
  const path = `/admin/listings/${encodeURIComponent(listingId)}/notes`;
  const load = () => api(path).then(d => { setData(d); setError(null); }, e => setError(e.message));
  useEffect(() => { setData(null); setText(""); setEdit(null); setMsg(null); setInvalid(null); load(); }, [listingId]);
  // One write, then the list as the server holds it. A refusal because the note changed meanwhile reloads the list.
  const send = async (call, done, field) => {
    if (busy) return;
    setBusy(true); setMsg(null); setInvalid(null);
    try {
      setData(await call()); setMsg({ ok: true, text: done });
      if (field !== "new") document.getElementById("h-notes-list")?.focus(); // the note's own buttons are gone
      return true;
    }
    catch (e) {
      if (e.data?.fields?.text) setInvalid({ field, text: e.data.fields.text });
      // A stale version: the list is read again here, so the server's "Reload to see it" is already done.
      setMsg({ text: e.status === 409 ? `${firstSentence(e.message)} This is its latest version; your change was not saved.` : e.message });
      if (e.status === 409) { setEdit(null); await load(); }
    } finally { setBusy(false); }
  };
  const add = async e => {
    e.preventDefault();
    if (await send(() => api(path, { method: "POST", body: { text } }), "Note added.", "new")) setText("");
  };
  const correct = async e => {
    e.preventDefault();
    if (await send(() => api(`${path}/${edit.id}`, { method: "PUT", body: { text: edit.text } }), "Note corrected.", "edit")) setEdit(null);
  };
  const withdraw = n => confirm("Withdraw this note? Its text is no longer shown; who withdrew it and when stay in the list.")
    && send(() => api(`${path}/${n.id}`, { method: "DELETE" }), "Note withdrawn.");
  const wrong = field => invalid?.field === field && <small id={`e-note-${field}`} className="err">{invalid.text}</small>;
  const flagged = field => (invalid?.field === field ? { "aria-invalid": true, "aria-describedby": `e-note-${field}` } : {});

  return <section id="s-notes" className="card fields-group" aria-labelledby="h-notes">
    <h2 id="h-notes">Notes <span className="muted">(internal)</span></h2>
    <p className="muted">For staff only: never shown on the website and never sent to anyone. Do not paste a client's personal
      details or a message here. Only the person who wrote a note can correct or withdraw it, and every version is kept.</p>
    <form className="fields-group" onSubmit={add} noValidate>
      <label>New note<textarea className="short" value={text} maxLength={4000} onChange={e => { setText(e.target.value); setInvalid(null); }}
        {...flagged("new")} />{wrong("new")}</label>
      <div className="inline"><button className="btn" disabled={busy || !data}>Add note</button></div>
    </form>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {error ? failed(`The notes couldn't be loaded: ${error}`) : !data ? <p>Loading notes…</p> : <>
      <h3 id="h-notes-list" tabIndex={-1}>Notes on this property <span className="muted">({data.notes.length})</span></h3>
      {data.notes.length ? <ul className="confirmations" aria-labelledby="h-notes-list">{data.notes.map(n => <li key={n.id}>
        {n.text === null ? <span className="muted">Note withdrawn by {n.author} · {fmtDate(n.changed_at)} · written {fmtDate(n.written_at)}</span>
          : edit?.id === n.id ? <form className="fields-group" onSubmit={correct} noValidate>
            <label>Correct this note<textarea className="short" value={edit.text} maxLength={4000} autoFocus
              onChange={e => { setEdit({ id: n.id, text: e.target.value }); setInvalid(null); }} {...flagged("edit")} />{wrong("edit")}</label>
            <div className="inline"><button className="btn" disabled={busy || edit.text.trim() === n.text}>Save correction</button>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => { setEdit(null); setInvalid(null); }}>Cancel</button></div>
          </form>
          : <><span className="house-note">{n.text}</span><br />
            <span className="muted">{n.author} · {fmtDate(n.written_at)}{n.changed_at ? ` · corrected ${fmtDate(n.changed_at)}` : ""}</span>
            {n.own && <div className="inline">
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => { setEdit({ id: n.id, text: n.text }); setMsg(null); setInvalid(null); }}>Correct</button>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => withdraw(n)}>Withdraw</button></div>}</>}
      </li>)}</ul> : <p className="muted">No notes yet.</p>}
      {data.more && <p className="muted">Showing the latest {SHOWN} notes.</p>}
    </>}
  </section>;
}

// A date the research wrote: "5 Oct 2026" when it starts with a day (YYYY-MM-DD), else its own words ("Undated").
const day = d => (/^\d{4}-\d{2}-\d{2}/.test(d) ? fmtDayMonth(d.slice(0, 10)) : d);

// Read only: where the property is advertised, as the imported research saw it (sources: research_sources rows), newest
// sighting first, with the price each one showed. Beside each, what was last confirmed about the property (EST-16).
// The research is frozen; the market inventory's live adverts join this list once a listing is linked to its market
// home (BUS-07), which nothing does yet.
function PropertyAdverts({ listingId, listing, sources }) {
  const [confirmed, setConfirmed] = useState(null);
  useEffect(() => {
    let live = true;
    setConfirmed(null);
    api(`/admin/listings/${encodeURIComponent(listingId)}/availability`).then(d => {
      if (live) setConfirmed(d.enabled && d.current && !d.current.needs_review ? d.current : null);
    }, () => {});
    return () => { live = false; };
  }, [listingId, listing.operation]);
  const rows = [...sources].sort((a, b) => (b.accessed_on ?? "").localeCompare(a.accessed_on ?? "")
    || (a.agent_or_site ?? "").localeCompare(b.agent_or_site ?? "") || a.source_id.localeCompare(b.source_id));
  const prices = [...new Set(rows.map(s => s.price_text?.trim()).filter(Boolean))];
  return <section id="s-adverts" className="card fields-group" aria-labelledby="h-adverts">
    <h2 id="h-adverts">Adverts <span className="muted">({rows.length} · read only)</span></h2>
    <p className="muted">Where this property is advertised, as the imported research saw each advert on the date shown. They are not
      refreshed. Adverts read by the market inventory will be listed here once this property is linked to its market record.</p>
    {prices.length > 1 && <p><strong>Different prices seen:</strong> {prices.join(" · ")}</p>}
    {rows.length ? <ul className="confirmations" aria-label="Adverts">{rows.map(s => <li key={s.source_id}>
      {safeHref(s.url) ? <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a> : s.title || "Untitled source"}
      <span className="muted"> · {[s.agent_or_site, s.origin, s.source_type, s.source_id].filter(Boolean).join(" · ")}</span><br />
      Price seen: <strong>{s.price_text || "Not stated"}</strong> · Status seen: {s.observed_status || "Not stated"}<br />
      <span className="muted">{[s.accessed_on && `Seen ${day(s.accessed_on)}`, s.source_date && `Source date: ${day(s.source_date)}`].filter(Boolean).join(" · ") || "No date recorded"}</span>
      {confirmed && <><br /><span className="muted">Property confirmed: </span>
        <span className={`badge ${CONFIRMATION[confirmed.status]?.[0] ?? "neutral"}`}>{CONFIRMATION[confirmed.status]?.[1] ?? confirmed.status}</span>
        <span className="muted"> · {fmtDate(confirmed.confirmed_at)}</span></>}
    </li>)}</ul> : <p className="muted">The imported research recorded no advert for this property.</p>}
  </section>;
}

export default function PropertySections({ listingId, listing, sources }) {
  return <>
    <PropertyViewings listingId={listingId} />
    <PropertyNotes listingId={listingId} />
    <PropertyAdverts listingId={listingId} listing={listing} sources={sources} />
  </>;
}
