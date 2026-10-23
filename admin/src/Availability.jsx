import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { setUnsaved, unsaved, confirmLeave } from "./unsaved.js";
import { fmtDay } from "./format.js";
import { WEEKDAYS, DEFAULT_HOURS, SLOT_MINUTES, jerseyToday } from "../../server/viewings.js";

const DAY = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const exceptionText = e => (e.kind === "open" ? `Open ${e.start_time}–${e.end_time}`
  : e.start_time ? `Blocked ${e.start_time}–${e.end_time}` : "Blocked all day");
// A day off keeps the times it had (else the office's usual ones), so turning it back on doesn't start from blank.
const usual = d => DEFAULT_HOURS[d] ?? DEFAULT_HOURS.mon;
const toWeek = hours => Object.fromEntries(WEEKDAYS.map(d => [d,
  { off: !hours[d], from: hours[d]?.[0] ?? usual(d)[0], to: hours[d]?.[1] ?? usual(d)[1] }]));
const toHours = week => Object.fromEntries(WEEKDAYS.map(d => [d, week[d].off ? null : [week[d].from, week[d].to]]));
const weekErrors = week => Object.fromEntries(WEEKDAYS.filter(d => !week[d].off && !(week[d].from && week[d].to
  && week[d].from < week[d].to)).map(d => [d, "Choose a day off, or opening before closing"]));
// id: set when the message can take the focus (after a save whose button goes disabled).
const Msg = ({ m, id }) => m && <p id={id} tabIndex={id ? -1 : undefined} role={m.ok ? "status" : "alert"}
  className={m.ok ? "ok" : "err"}>{m.text}</p>;

// Spec §5: who shows homes, their week and the dates that differ from it. Negotiators are deactivated, never deleted (D9).
export default function Availability() {
  const [list, setList] = useState(null), [loadErr, setLoadErr] = useState(null), [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false), [msg, setMsg] = useState(null);
  // Set when the person picks a negotiator: the record's heading then takes the focus (below the list on phones).
  const focusRecord = useRef(false), addBtn = useRef(null), focusAdd = useRef(false);
  const load = () => api("/admin/negotiators").then(d => {
    setList(d.negotiators); setLoadErr(null);
    setSel(id => (d.negotiators.some(n => n.id === id) ? id : d.negotiators[0]?.id ?? null));
  }, e => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  const pick = id => {
    if (id === sel || !confirmLeave()) return;
    focusRecord.current = true; setSel(id); setMsg(null);
  };
  // The Add form goes: its trigger comes back and takes the focus (a new record's heading takes it next, see added).
  const closeAdd = () => { focusAdd.current = true; setAdding(false); };
  useEffect(() => { if (!adding && focusAdd.current) { focusAdd.current = false; addBtn.current?.focus(); } }, [adding]);
  const added = async (id, name) => {
    closeAdd();
    // Unsaved changes on the open record stay where they are; the new one waits in the list.
    const keep = unsaved;
    setMsg({ ok: true, text: keep ? `${name} added. Save your changes, then pick them in the list to set their hours.`
      : `${name} added with the office's usual hours. Change them below if needed.` });
    await load();
    if (!keep) { focusRecord.current = true; setSel(id); }
  };
  const n = list?.find(x => x.id === sel);

  return <section aria-labelledby="t-avail">
    <div className="head"><h1 id="t-avail">Availability</h1>
      {!adding && <button type="button" ref={addBtn} className="btn" onClick={() => { setAdding(true); setMsg(null); }}>Add negotiator</button>}</div>
    <p className="muted avail-intro">Who shows homes and when. The website offers {SLOT_MINUTES}-minute viewings inside these hours.</p>
    {adding && <AddNegotiator onAdded={added} onCancel={closeAdd} />}
    <Msg m={msg} />
    {loadErr && <p role="alert" className="err">{loadErr} <button type="button" className="linkish" onClick={load}>Try again</button></p>}
    {!list ? !loadErr && <p>Loading negotiators…</p>
      : !list.length ? <p className="empty card">No negotiators yet. Use Add negotiator for each person who shows homes, so the website can offer their free times.</p>
      : <div className="inbox">
        <ul className="inbox-list" aria-label="Negotiators">{list.map(x => <li key={x.id}>
          <button type="button" aria-current={x.id === sel ? "true" : undefined} onClick={() => pick(x.id)}>
            <span className="who">{x.name}</span>
            <span className={`badge ${x.active ? "positive" : "neutral"}`}>{x.active ? "Active" : "Inactive"}</span>
            <span className="what muted">{x.role || "No role set"}</span>
          </button></li>)}</ul>
        {n && <Negotiator key={n.id} n={n} reload={load} focus={focusRecord} />}
      </div>}
  </section>;
}

function AddNegotiator({ onAdded, onCancel }) {
  const [name, setName] = useState(""), [role, setRole] = useState(""), [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  // Presses while adding are ignored (the button stays enabled, so it keeps the focus).
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const { id } = await api("/admin/negotiators", { method: "POST", body: { name, role: role.trim() || null } });
      onAdded(id, name.trim());
    } catch (err) { setErrors(err.data?.fields || {}); setMsg({ text: err.message }); }
    finally { setBusy(false); }
  };
  return <form className="card avail-add" onSubmit={submit} aria-labelledby="h-add">
    <h2 id="h-add">Add negotiator</h2>
    <div className="inline">
      <label>Name<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)}
        aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? "e-add-name" : undefined} /></label>
      <label>Role (optional)<input maxLength={80} value={role} onChange={e => setRole(e.target.value)} placeholder="Negotiator" /></label>
      <button className="btn">{busy ? "Adding…" : "Add"}</button>
      <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
    </div>
    {errors.name && <small id="e-add-name" className="err">{errors.name}</small>}
    <Msg m={msg} />
  </form>;
}

function Negotiator({ n, reload, focus }) {
  const [name, setName] = useState(n.name), [role, setRole] = useState(n.role ?? "");
  const [week, setWeek] = useState(() => toWeek(n.hours)), [shown, setShown] = useState({});
  const [exc, setExc] = useState({ date: "", kind: "block", allDay: true, from: "10:00", to: "11:00", note: "" });
  const [msgs, setMsgs] = useState({}), [errors, setErrors] = useState({}), [busy, setBusy] = useState(null);
  const heading = useRef(null), excHeading = useRef(null), focusMsg = useRef(null);
  useEffect(() => { if (focus.current) { focus.current = false; heading.current?.focus(); } }, []);
  // A save whose button goes disabled (the form is clean again) hands the focus to its message.
  useEffect(() => { if (focusMsg.current) { document.getElementById(focusMsg.current)?.focus(); focusMsg.current = null; } }, [msgs]);

  const detailsDirty = name.trim() !== n.name || role.trim() !== (n.role ?? "");
  const hoursDirty = JSON.stringify(toHours(week)) !== JSON.stringify(toHours(toWeek(n.hours)));
  const excDirty = exc.date !== "" || exc.note.trim() !== "";
  const dirty = detailsDirty || hoursDirty || excDirty;
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);

  // One request at a time (presses meanwhile are ignored; the buttons stay enabled so they keep the focus); its message
  // replaces that section's previous one. focusOk: the message takes the focus once saved.
  const run = async (key, call, ok, focusOk = false) => {
    if (busy) return false;
    setBusy(key); setMsgs(m => ({ ...m, [key]: null }));
    try {
      await call(); await reload(); setErrors(e => ({ ...e, [key]: {} }));
      if (focusOk) focusMsg.current = `m-${key}`;
      setMsgs(m => ({ ...m, [key]: { ok: true, text: ok } })); return true;
    }
    catch (err) { setErrors(e => ({ ...e, [key]: err.data?.fields || {} })); setMsgs(m => ({ ...m, [key]: { text: err.message } })); return false; }
    finally { setBusy(null); }
  };
  const put = body => api(`/admin/negotiators/${n.id}`, { method: "PUT", body });

  const saveDetails = e => {
    e.preventDefault();
    run("details", () => put({ name, role: role.trim() || null }), "Details saved.", true);
  };
  // Never disabled: it keeps the focus while saving, so Space can toggle it back.
  const toggleActive = () => {
    if (busy) return;
    if (n.active && !confirm(`Make ${n.name} inactive? The website stops offering their times; viewings already booked with them stay.`)) return;
    run("active", () => put({ active: !n.active }), n.active ? `${n.name} is now inactive.` : `${n.name} is active again.`);
  };
  const saveHours = e => {
    e.preventDefault();
    const local = weekErrors(week);
    setShown(local);
    if (Object.keys(local).length) return setMsgs(m => ({ ...m, hours: { text: "Please check the highlighted days." } }));
    run("hours", () => put({ hours: toHours(week) }), "Hours saved. The website offers the new times straight away.", true);
  };
  const addException = async e => {
    e.preventDefault();
    const timed = exc.kind === "open" || !exc.allDay;
    const body = { date: exc.date, kind: exc.kind, note: exc.note.trim() || null,
      ...(timed ? { start_time: exc.from, end_time: exc.to } : {}) };
    if (await run("exc", () => api(`/admin/negotiators/${n.id}/exceptions`, { method: "POST", body }), `Added for ${fmtDay(exc.date)}.`))
      setExc(x => ({ ...x, date: "", note: "" }));
  };
  const removeException = async x => {
    if (busy || !confirm(`Remove "${exceptionText(x)}" on ${fmtDay(x.date)}?`)) return;
    // Its row (and the focused button) goes: the focus moves to the section heading.
    if (await run("list", () => api(`/admin/negotiators/${n.id}/exceptions/${x.id}`, { method: "DELETE" }), `Removed the exception on ${fmtDay(x.date)}.`))
      excHeading.current?.focus();
  };

  const setDay = (d, k, v) => setWeek(w => ({ ...w, [d]: { ...w[d], [k]: v } }));
  const dayErr = d => shown[d] || errors.hours?.[d];
  const ef = errors.exc || {}, df = errors.details || {};
  const invalid = (err, id) => ({ "aria-invalid": err ? true : undefined, "aria-describedby": err ? id : undefined });

  return <article className="card avail-detail" aria-labelledby="n-name">
    <div className="head"><h2 id="n-name" ref={heading} tabIndex={-1}>{n.name}</h2>
      <div className="offer"><span id="l-active" className="lbl-like">Takes viewings</span>
        <button type="button" role="switch" className="switch" aria-checked={!!n.active} aria-labelledby="l-active"
          aria-describedby="d-active" onClick={toggleActive}>
          <span className="knob" aria-hidden="true" />{n.active ? "Active" : "Inactive"}</button>
        <span id="d-active" className="muted">Inactive negotiators aren't offered on the website. Their booked viewings stay.</span></div>
    </div>
    <Msg m={msgs.active} />

    <form onSubmit={saveDetails} aria-label="Details">
      <div className="inline">
        <label>Name<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} {...invalid(df.name, "e-name")} /></label>
        <label>Role<input maxLength={80} value={role} onChange={e => setRole(e.target.value)} {...invalid(df.role, "e-role")} /></label>
        <button className="btn ghost" disabled={!detailsDirty}>Save details</button>
      </div>
      {df.name && <small id="e-name" className="err">{df.name}</small>}
      {df.role && <small id="e-role" className="err">{df.role}</small>}
      <Msg m={msgs.details} id="m-details" />
    </form>

    <form onSubmit={saveHours} aria-labelledby="h-hours">
      <h3 id="h-hours">Weekly hours</h3>
      <table className="hours">
        <thead><tr><th scope="col">Day</th><th scope="col">Hours</th><th scope="col"><span className="sr">Day off</span></th></tr></thead>
        <tbody>{WEEKDAYS.map(d => { const w = week[d], err = dayErr(d);
          return <tr key={d}>
            <th scope="row">{DAY[d]}</th>
            <td className="span">{w.off ? <span className="muted">Not working</span> : <>
              <input type="time" step="1800" required aria-label={`${DAY[d]}, from`} value={w.from} onChange={e => setDay(d, "from", e.target.value)} {...invalid(err, `e-${d}`)} />
              <span aria-hidden="true">to</span>
              <input type="time" step="1800" required aria-label={`${DAY[d]}, until`} value={w.to} onChange={e => setDay(d, "to", e.target.value)} {...invalid(err, `e-${d}`)} />
            </>}
              {err && <small id={`e-${d}`} className="err">{err}</small>}</td>
            <td className="off"><label className="check"><input type="checkbox" checked={w.off} onChange={e => setDay(d, "off", e.target.checked)} />
              Day off<span className="sr"> on {DAY[d]}</span></label></td>
          </tr>; })}</tbody>
      </table>
      <div className="inline"><button className="btn" disabled={!hoursDirty}>{busy === "hours" ? "Saving…" : "Save hours"}</button>
        {hoursDirty && <span className="unsaved">Unsaved changes</span>}</div>
      <Msg m={msgs.hours} id="m-hours" />
    </form>

    <section aria-labelledby="h-exc">
      <h3 id="h-exc" ref={excHeading} tabIndex={-1}>Exceptions</h3>
      <p className="muted">Dates that differ from the week: a holiday or an appointment (blocked), or extra hours that replace that day's (open).</p>
      <Msg m={msgs.list} />
      {!n.exceptions.length ? <p className="empty exc-empty">No exceptions coming up.</p>
        : <ul className="exc-list" aria-label={`Upcoming exceptions for ${n.name}`}>{n.exceptions.map(x => <li key={x.id}>
          <span className="num exc-date">{fmtDay(x.date)}</span>
          <span>{exceptionText(x)}{x.note && <span className="muted"> · {x.note}</span>}</span>
          <button type="button" className="btn ghost sm" onClick={() => removeException(x)}>Remove
            <span className="sr"> the exception on {fmtDay(x.date)}</span></button>
        </li>)}</ul>}

      <form className="exc-form" onSubmit={addException} aria-labelledby="h-exc-add">
        <h4 id="h-exc-add">Add an exception</h4>
        <div className="inline">
          <label>Date<input type="date" required min={jerseyToday()} value={exc.date} onChange={e => setExc(x => ({ ...x, date: e.target.value }))}
            {...invalid(ef.date, "e-exc-date")} /></label>
          <label>Type<select value={exc.kind} onChange={e => setExc(x => ({ ...x, kind: e.target.value }))} {...invalid(ef.kind, "e-exc-kind")}>
            <option value="block">Blocked</option><option value="open">Open (replaces that day's hours)</option></select></label>
          {exc.kind === "block" && <label className="check"><input type="checkbox" checked={exc.allDay}
            onChange={e => setExc(x => ({ ...x, allDay: e.target.checked }))} />All day</label>}
          {(exc.kind === "open" || !exc.allDay) && <>
            <label>From<input type="time" step="1800" required value={exc.from} onChange={e => setExc(x => ({ ...x, from: e.target.value }))}
              {...invalid(ef.start_time, "e-exc-start")} /></label>
            <label>Until<input type="time" step="1800" required value={exc.to} onChange={e => setExc(x => ({ ...x, to: e.target.value }))}
              {...invalid(ef.end_time, "e-exc-end")} /></label>
          </>}
          <label className="exc-note">Note (optional)<input maxLength={200} value={exc.note} onChange={e => setExc(x => ({ ...x, note: e.target.value }))}
            placeholder="e.g. Holiday" {...invalid(ef.note, "e-exc-note")} /></label>
          <button className="btn">{busy === "exc" ? "Adding…" : "Add exception"}</button>
        </div>
        {[["date", "e-exc-date"], ["kind", "e-exc-kind"], ["start_time", "e-exc-start"], ["end_time", "e-exc-end"], ["note", "e-exc-note"]]
          .map(([k, id]) => ef[k] && <small key={k} id={id} className="err">{ef[k]}</small>)}
        <Msg m={msgs.exc} />
      </form>
    </section>
  </article>;
}
