import { useEffect, useId, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDay } from "./format.js";
import { jerseyToday, plusDays, MAX_DAYS } from "../../server/viewings.js";

// Negotiator, then day, then time, from GET /admin/availability (active negotiators; today's times still to come; the
// panel books up to a year ahead, C11). value = {negotiator_id, date, time}; onChange receives the next value.
// own: the viewing being rescheduled. It is excluded from the availability (exclude=<id>), so it never blocks its own
// slot or the ones next to it (Review Focus 3); its current time shows as "Current time".
// refresh: change it to read the times again (after a 409), keeping the choice while it is still free.
export default function SlotPicker({ value, onChange, own, refresh = 0, errors = {} }) {
  const uid = useId(), today = jerseyToday(), last = plusDays(today, 365);
  const [from, setFrom] = useState(() => (value.date > plusDays(today, MAX_DAYS - 1) ? value.date : today));
  const [data, setData] = useState(null), [err, setErr] = useState(null), [retry, setRetry] = useState(0);
  const earlier = useRef(null), later = useRef(null);
  useEffect(() => {
    let live = true;
    setErr(null);
    api(`/admin/availability?from=${from}&days=${MAX_DAYS}${own ? `&exclude=${own.id}` : ""}`)
      .then(d => live && setData(d), e => live && setErr(e.message));
    return () => { live = false; };
  }, [from, refresh, retry]);

  const nid = value.negotiator_id;
  // While another window of days loads, the last one stays read but isn't offered (the pager keeps its focus).
  const paging = !!data && data.days[0]?.date !== from;
  const slotsOf = date => data?.days.find(d => d.date === date)?.slots[nid] ?? [];
  const stateOf = (date, s) => (own && own.negotiator_id === nid && own.date === date && own.time === s.time ? "current"
    : s.booked ? "booked" : "free");
  const freeCount = date => (date > last ? 0 : slotsOf(date).filter(s => stateOf(date, s) === "free").length);

  // Fresh times: a chosen time someone else has just taken is dropped (the day stays).
  useEffect(() => {
    if (data && !paging && value.time && !slotsOf(value.date).some(s => s.time === value.time && stateOf(value.date, s) === "free"))
      onChange({ ...value, time: null });
  }, [data]);

  const page = n => {
    const next = n < 0 && plusDays(from, n) < today ? today : plusDays(from, n);
    setFrom(next); onChange({ ...value, date: null, time: null });
    // The button pressed is disabled at either end: the focus moves to the other one.
    if (next === today) later.current?.focus();
    else if (plusDays(next, MAX_DAYS) > last) earlier.current?.focus();
  };
  const known = data?.negotiators.some(n => n.id === nid);
  const error = k => errors[k] && <small id={`${uid}-e-${k}`} className="err">{errors[k]}</small>;
  const described = k => (errors[k] ? { "aria-describedby": `${uid}-e-${k}` } : {});

  return <div className="slot-picker">
    <label className="slot-who">Negotiator
      <select value={known ? nid : ""} aria-invalid={errors.negotiator_id ? true : undefined} {...described("negotiator_id")}
        onChange={e => onChange({ negotiator_id: e.target.value ? Number(e.target.value) : null, date: value.date, time: null })}>
        <option value="">Choose a negotiator</option>
        {data?.negotiators.map(n => <option key={n.id} value={n.id}>{n.name}{n.role ? ` · ${n.role}` : ""}</option>)}
      </select></label>
    {error("negotiator_id")}
    {err && <p role="alert" className="err">{err} <button type="button" className="linkish" onClick={() => setRetry(x => x + 1)}>Try again</button></p>}
    {!data ? !err && <p className="muted">Loading free times…</p>
      : !known ? <p className="muted">Choose a negotiator to see their free times.</p>
      : <>
        <fieldset className="pick-set" {...described("date")}>
          <legend>Day</legend>
          {paging ? <p className="muted">Loading free times…</p> : <div className="pick">{data.days.map(d => {
            const free = freeCount(d.date), any = slotsOf(d.date).length > 0 && d.date <= last;
            return <label key={d.date}>
              <input type="radio" name={`${uid}-day`} value={d.date} checked={value.date === d.date} disabled={!free}
                onChange={() => onChange({ ...value, date: d.date, time: null })} />
              <span>{fmtDay(d.date)}<small>{free ? `${free} free` : any ? "Fully booked" : "No times"}</small></span>
            </label>;
          })}</div>}
          <div className="pager">
            <button type="button" ref={earlier} className="btn ghost sm" disabled={from <= today} onClick={() => page(-MAX_DAYS)}>Earlier days</button>
            <button type="button" ref={later} className="btn ghost sm" disabled={plusDays(from, MAX_DAYS) > last} onClick={() => page(MAX_DAYS)}>Later days</button>
          </div>
        </fieldset>
        {error("date")}
        {!paging && data.days.some(d => d.date === value.date) && <fieldset className="pick-set" {...described("time")}>
          <legend>Time on {fmtDay(value.date, true)}</legend>
          <div className="pick">{slotsOf(value.date).map(s => {
            const st = stateOf(value.date, s);
            return <label key={s.time}>
              <input type="radio" name={`${uid}-time`} value={s.time} checked={value.time === s.time} disabled={st !== "free"}
                onChange={() => onChange({ ...value, time: s.time })} />
              <span className="num">{s.time}{st !== "free" && <small>{st === "current" ? "Current time" : "Booked"}</small>}</span>
            </label>;
          })}</div>
        </fieldset>}
      </>}
    {error("time")}
  </div>;
}
