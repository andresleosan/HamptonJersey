import { useLayoutEffect, useRef } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ViewingAvailability({ value, onChange, error }) {
  const sectionRef = useRef(null), addRef = useRef(null), pendingFocus = useRef(null);
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const index = pendingFocus.current;
    pendingFocus.current = null;
    const fields = sectionRef.current?.querySelectorAll("fieldset select");
    (fields?.[index] ?? addRef.current)?.focus();
  }, [value.length]);
  const remove = i => {
    pendingFocus.current = value.length === 1 ? -1 : Math.min(i, value.length - 2);
    onChange(value.filter((_, j) => j !== i));
  };
  const add = () => {
    if (value.length === 20) pendingFocus.current = 20;
    onChange([...value, { day: 1, start: "", end: "" }]);
  };
  const change = (i, key, v) => onChange(value.map((slot, j) => i === j ? { ...slot, [key]: v } : slot));
  return <section ref={sectionRef} className="card fields-group" aria-labelledby="viewing-availability-title">
    <h2 id="viewing-availability-title">Usual viewing availability</h2>
    <p>Give realistic, flexible times in Jersey to help arrange viewings. These do not book an appointment.</p>
    {value.length === 0 && <p>Not provided yet.</p>}
    {value.map((slot, i) => <fieldset className="field" key={i}>
      <legend>Time option {i + 1}</legend>
      <div className="grid2">
        <label>Day<select value={slot.day} onChange={e => change(i, "day", Number(e.target.value))} aria-invalid={error ? true : undefined} aria-describedby={error ? "availability-error" : undefined}>
          {DAYS.map((day, n) => <option key={day} value={n}>{day}</option>)}</select></label>
        <label>From<input type="time" aria-invalid={error ? true : undefined} aria-describedby={error ? "availability-error" : undefined} value={slot.start} onChange={e => change(i, "start", e.target.value)} /></label>
        <label>Until<input type="time" aria-invalid={error ? true : undefined} aria-describedby={error ? "availability-error" : undefined} value={slot.end} onChange={e => change(i, "end", e.target.value)} /></label>
      </div>
      <button type="button" className="btn ghost" onClick={() => remove(i)}>Remove option {i + 1}</button>
    </fieldset>)}
    {error && <small id="availability-error" className="err" role="alert">{error}</small>}
    <button ref={addRef} type="button" className="btn ghost" disabled={value.length >= 21} onClick={add}>Add time option</button>
  </section>;
}
