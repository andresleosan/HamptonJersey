import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay, VIEWING_STATUS, OUTCOME, INTEREST_REASON } from "./format.js";

// VIS-02 (spec R1): who counts in a listing's interest, with the team's corrections, above the listing's viewings.
// data: GET /admin/listings/:id/interest (null while it loads); reload(): reads it and the viewings again.
const contactOf = p => p.email ?? p.phone;
const people = n => `${n} ${n === 1 ? "person" : "people"}`;
// The viewing a person counts by: "Confirmed · Sat 2 Nov", or "Viewed Sat 25 Oct · Proceed".
const visit = p => (p.status === "completed" ? `Viewed ${fmtDay(p.date)} · ${OUTCOME[p.outcome]}`
  : `${VIEWING_STATUS[p.status][0]} · ${fmtDay(p.date)}`);
const why = p => [INTEREST_REASON[p.reason], p.note, fmtDate(p.removed_at)].filter(Boolean).join(" · ");
// R2, in the spec's order: "Counted twice" joins the person to another one instead of removing them (R14).
const CHOICES = [["no_longer_interested", INTEREST_REASON.no_longer_interested], ["counted_twice", "Counted twice"],
  ["not_buyer", INTEREST_REASON.not_buyer], ["other", INTEREST_REASON.other]];

export default function Interest({ data, error, reload, onDirty }) {
  const [open, setOpen] = useState(null), [msg, setMsg] = useState(null); // open: the viewing_id whose form is open
  // mine: the next read of the card is this card's own (see correct).
  const head = useRef(null), opener = useRef(null), busy = useRef(false), mine = useRef(false);
  // Each read of the card: a form whose person has left the list goes with them, and a message about an earlier change
  // goes unless the read is this card's own (a change made in a viewing below, or a tab, reads it too).
  useEffect(() => {
    if (open != null && data && !data.people.some(p => p.viewing_id === open)) setOpen(null);
    if (!mine.current) setMsg(null);
    mine.current = false;
  }, [data]);

  // One correction to person p, then the card and the viewings again. Its message shows under the heading, which takes
  // the focus; a refusal keeps an open form and what it holds.
  const correct = async (p, body, done) => {
    if (busy.current) return;
    busy.current = true; setMsg(null);
    let m;
    try {
      await api(`/admin/viewings/${p.viewing_id}/interest`, { method: "PUT", body });
      setOpen(null);
      m = { ok: true, text: done };
    } catch (e) {
      // A field the server refused says more than "Please check the highlighted fields."
      m = { text: Object.values(e.data?.fields ?? {})[0] ?? e.message };
    }
    try {
      mine.current = true;
      await reload();
      setMsg(m);
      head.current?.focus();
    } finally { busy.current = false; }
  };
  const toggle = (id, e) => { opener.current = e.currentTarget; setOpen(o => (o === id ? null : id)); setMsg(null); };
  const close = () => { setOpen(null); setMsg(null); opener.current?.focus(); };

  if (!data) return <section className="card interest" aria-label="Interest in this listing">
    {error ? <p role="alert" className="err">{error} <button type="button" className="linkish" onClick={() => reload()}>Try again</button></p>
      : <p>Loading interest…</p>}</section>;
  return <section className="card interest" aria-labelledby="h-interest">
    <h2 id="h-interest" ref={head} tabIndex={-1}>Interested now: {people(data.active_interest)}</h2>
    <p className="muted">Upcoming viewings, and those of the last 30 days that went well. Each person counts once; the website shows the number from 2 people.</p>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
    {error && <p role="alert" className="err">{error} <button type="button" className="linkish" onClick={() => reload()}>Try again</button></p>}
    {data.people.length ? <ul aria-label="People counted">{data.people.map(p => <li key={p.viewing_id}>
      <div>
        <p><span id={`who-${p.viewing_id}`} className="who">{p.name}</span> · {contactOf(p)}</p>
        <p className="muted">{visit(p)}</p>
        {p.also.length > 0 && <p className="muted">Also booked as {p.also.map(contactOf).join(", ")}</p>}
      </div>
      {/* Every row has the same buttons: each one is described by its person's name. */}
      <div className="inline">
        {p.joined && p.also.length > 0 && <button type="button" className="btn ghost sm" aria-describedby={`who-${p.viewing_id}`}
          onClick={() => correct(p, { action: "separate" }, `The bookings joined to ${p.name} count separately again.`)}>Count separately</button>}
        <button type="button" className="btn ghost sm" aria-describedby={`who-${p.viewing_id}`} aria-expanded={open === p.viewing_id}
          onClick={e => toggle(p.viewing_id, e)}>Remove from count</button>
      </div>
      {open === p.viewing_id && <RemoveForm person={p} others={data.people.filter(o => o.viewing_id !== p.viewing_id)}
        onSave={(body, done) => correct(p, body, done)} onClose={close} onDirty={onDirty} />}
    </li>)}</ul>
      : <p className="muted">No one counts yet. People count from the moment they book a viewing, and for 30 days after one that went well.</p>}
    {data.removed.length > 0 && <>
      <h3 id="h-uncounted">Not counted</h3>
      <ul aria-labelledby="h-uncounted">{data.removed.map(p => <li key={p.viewing_id}>
        <div>
          <p><span id={`who-${p.viewing_id}`} className="who">{p.name}</span> · {contactOf(p)}</p>
          <p className="muted">{why(p)}</p>
        </div>
        <div className="inline"><button type="button" className="btn ghost sm" aria-describedby={`who-${p.viewing_id}`}
          onClick={() => correct(p, { action: "restore" }, `${p.name} counts again.`)}>Count again</button></div>
      </li>)}</ul></>}
  </section>;
}

// The reason, and for "Counted twice" who they are; a note for the others, required with Other (spec §3).
function RemoveForm({ person, others, onSave, onClose, onDirty }) {
  const [reason, setReason] = useState(null), [note, setNote] = useState(""), [same, setSame] = useState("");
  const [errors, setErrors] = useState({});
  const first = useRef(null), form = useRef(null);
  const twice = reason === "counted_twice";
  useEffect(() => { first.current?.focus(); }, []);
  // The open form's choice counts as unsaved, as an open outcome does in Viewings.
  const dirty = !!reason || !!note.trim() || !!same;
  useEffect(() => { onDirty("interest", dirty); }, [dirty]);
  useEffect(() => () => onDirty("interest", false), []);
  // After a refused submit, the first highlighted field takes the focus.
  useEffect(() => { form.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);
  // The choices follow the list as it is read again: "Counted twice" needs someone else, and the person chosen as "Same
  // person as" must still be in it.
  const ids = others.map(o => String(o.viewing_id)), other = others.find(o => String(o.viewing_id) === same);
  useEffect(() => { if (twice && !ids.length) setReason(null); if (same && !other) setSame(""); }, [ids.join()]);

  const invalid = k => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `e-int-${k}` : undefined });
  const error = k => errors[k] && <small id={`e-int-${k}`} className="err">{errors[k]}</small>;
  const submit = e => {
    e.preventDefault();
    const found = !reason || (twice && !ids.length) ? { reason: "Choose a reason" } : twice && !other ? { same_as: "Choose who they are" }
      : reason === "other" && !note.trim() ? { note: "Add a note for Other" } : {};
    setErrors(found);
    if (Object.keys(found).length) return;
    onSave(twice ? { action: "join", same_as: other.viewing_id } : { action: "remove", reason, note: note.trim() || null },
      twice ? `${person.name} now counts as the same person as ${other.name}.`
        : `${person.name} no longer counts. The website shows the new number within a minute.`);
  };
  return <form ref={form} className="view-form" onSubmit={submit} noValidate aria-label={`Remove ${person.name} from the count`}>
    <fieldset className="choices-set" aria-describedby={errors.reason ? "e-int-reason" : undefined}>
      <legend>Why remove {person.name} from the count?</legend>
      <div className="choices">{CHOICES.filter(([k]) => k !== "counted_twice" || ids.length).map(([k, label], i) =>
        <label key={k} className="check"><input type="radio" name="int-reason" ref={i ? undefined : first} value={k}
          checked={reason === k} onChange={() => { setReason(k); setErrors({}); }} {...(i ? {} : invalid("reason"))} />{label}</label>)}</div>
      {error("reason")}
    </fieldset>
    {twice ? <div className="field"><label htmlFor="i-int-same">Same person as</label>
      <select id="i-int-same" value={same} onChange={e => { setSame(e.target.value); setErrors({}); }} {...invalid("same_as")}>
        <option value="">Choose who they are</option>
        {others.map(o => <option key={o.viewing_id} value={o.viewing_id}>{o.name} · {contactOf(o)}</option>)}
      </select>{error("same_as")}</div>
      : <div className="field"><label htmlFor="i-int-note">{reason === "other" ? "Note" : "Note (optional)"}</label>
        <textarea id="i-int-note" className="short" maxLength={200} value={note} onChange={e => { setNote(e.target.value); setErrors({}); }}
          placeholder="e.g. Bought elsewhere" {...invalid("note")} />{error("note")}</div>}
    {/* Not "Remove from count": that names the button above that opened this form. */}
    <div className="inline"><button className="btn">{twice ? "Count as one person" : "Save"}</button>
      <button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
  </form>;
}
