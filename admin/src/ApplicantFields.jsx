import { OPTIONS } from "../../server/applicants.js";

// The form value: API field names, inputs as strings, lists as arrays, pets as [{kind, count}].
const TEXT = ["name", "email", "phone", "preferred_channel", "best_time", "operation", "furnished", "near", "move_in_date",
  "buyer_position", "mortgage_aip", "housing_status", "requirements"];
const NUM = ["budget_min", "budget_max", "budget_stretch", "bedrooms_min", "bedrooms_ideal", "bathrooms_min", "parking_spaces",
  "lease_term_months", "household_adults", "household_children"];
const LIST = ["property_types", "outdoor", "parishes_wanted", "parishes_excluded", "pets"];

// From the stored applicant and contact (detail API) to the form value; with no arguments, an empty form.
export const toForm = (applicant = {}, contact = {}) => {
  const src = { ...applicant, name: contact.name, email: contact.email, phone: contact.phone,
    preferred_channel: contact.preferred_channel, best_time: contact.best_time };
  return Object.fromEntries([...TEXT.map(k => [k, src[k] ?? ""]), ...NUM.map(k => [k, src[k] == null ? "" : String(src[k])]),
    ...LIST.map(k => [k, src[k] ?? []])]);
};

// "2,000" and "£ 2000" become 2000; text that isn't a number goes as typed, so the server's message lands on the field.
const number = s => {
  const t = String(s).replace(/[\s,£]/g, "");
  return t === "" ? null : /^\d+(\.\d+)?$/.test(t) ? Number(t) : t;
};
// From the form value to the API body: blank is null, never 0.
export const toBody = f => Object.fromEntries([
  ...TEXT.map(k => [k, f[k].trim() === "" ? null : f[k]]),
  ...NUM.map(k => [k, number(f[k])]),
  ...LIST.map(k => [k, !f[k].length ? null : k === "pets"
    ? f.pets.map(p => (p.kind === "none" ? { kind: "none" } : { kind: p.kind, count: number(p.count) })) : f[k]]),
]);

const HOUSING_WHY = "It decides which homes they can rent or buy in Jersey.";

// The search's requirements and the person's contact details, grouped like the website's steps (§5).
// operation: the search's operation; it decides the rent-only and buy-only fields and the budget wording.
// contact: a saved contact the search is for; its details are shown, not edited.
export default function ApplicantFields({ value, onChange, errors = {}, operation, contact }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const err = k => errors[k] && <small id={`ae-${k}`} className="err">{errors[k]}</small>;
  const aria = k => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `ae-${k}` : undefined });
  const input = (k, label, extra = {}) => <div className="field">
    <label htmlFor={`a-${k}`}>{label}</label>
    <input id={`a-${k}`} value={value[k]} onChange={e => set(k, e.target.value)} {...aria(k)} {...extra} />{err(k)}</div>;
  const count = (k, label, max = 20) => input(k, label, { type: "number", min: 0, max, step: 1, inputMode: "numeric" });
  const money = (k, label) => input(k, label, { inputMode: "decimal", autoComplete: "off" });
  const select = (k, label, list, blank = "Not said") => <div className="field">
    <label htmlFor={`a-${k}`}>{label}</label>
    <select id={`a-${k}`} value={value[k]} onChange={e => set(k, e.target.value)} {...aria(k)}>
      <option value="">{blank}</option>{list.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>{err(k)}</div>;
  // A list of real checkboxes (or radios) inside its own fieldset, the error under it.
  const choices = (k, legend, list, type = "checkbox") => <fieldset className="choices-set" aria-describedby={aria(k)["aria-describedby"]}>
    <legend>{legend}</legend>
    <div className="choices">{list.map(([v, t]) => <label key={v} className="check">
      <input type={type} name={`a-${k}`} value={v} checked={type === "radio" ? value[k] === v : value[k].includes(v)} {...aria(k)}
        onChange={e => set(k, type === "radio" ? v : e.target.checked ? [...value[k], v] : value[k].filter(x => x !== v))} />{t}</label>)}</div>
    {err(k)}</fieldset>;

  const rent = operation === "rent", buy = operation === "buy";
  const per = rent ? " (£ per month)" : " (£)";
  return <>
    <section className="card fields-group" aria-labelledby="g-search"><h2 id="g-search">What they're looking for</h2>
      {choices("operation", "To Let or To Buy", OPTIONS.operation, "radio")}
    </section>

    <section className="card fields-group" aria-labelledby="g-where"><h2 id="g-where">Where</h2>
      {choices("parishes_wanted", "Parishes they want", OPTIONS.parishes)}
      {choices("parishes_excluded", "Parishes they don't want", OPTIONS.parishes)}
      <div className="grid2">{input("near", "Near (work, school…)", { maxLength: 200 })}</div>
    </section>

    <section className="card fields-group" aria-labelledby="g-home"><h2 id="g-home">What kind of home</h2>
      {choices("property_types", "Type", OPTIONS.property_types)}
      <div className="grid2">
        {count("bedrooms_min", "Bedrooms, at least")}
        {count("bedrooms_ideal", "Bedrooms, ideally")}
        {count("bathrooms_min", "Bathrooms, at least")}
        {select("parking_spaces", "Parking", OPTIONS.parking)}
        {rent && select("furnished", "Furnished", OPTIONS.furnished)}
      </div>
      {choices("outdoor", "Outdoor space", OPTIONS.outdoor)}
      <Pets value={value.pets} onChange={v => set("pets", v)} error={errors.pets} />
    </section>

    <section className="card fields-group" aria-labelledby="g-budget"><h2 id="g-budget">Budget and timing</h2>
      <div className="grid2">
        {money("budget_max", `Maximum budget${per}`)}
        {money("budget_min", `Minimum budget${per}`)}
        {money("budget_stretch", `Can stretch to${per}`)}
        {input("move_in_date", "Move-in date", { type: "date" })}
        {rent && count("lease_term_months", "Lease length (months)", 120)}
        {buy && select("buyer_position", "Buying position", OPTIONS.buyer_position)}
        {buy && select("mortgage_aip", "Mortgage agreed in principle", OPTIONS.mortgage_aip)}
      </div>
    </section>

    <section className="card fields-group" aria-labelledby="g-jersey"><h2 id="g-jersey">Living in Jersey</h2>
      <div className="grid2">
        <div className="field"><label htmlFor="a-housing_status">Housing status</label>
          <select id="a-housing_status" value={value.housing_status} onChange={e => set("housing_status", e.target.value)}
            aria-invalid={errors.housing_status ? true : undefined}
            aria-describedby={`ah-housing_status${errors.housing_status ? " ae-housing_status" : ""}`}>
            <option value="">Not said</option>{OPTIONS.housing_status.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          <small id="ah-housing_status" className="muted">{HOUSING_WHY}</small>{err("housing_status")}</div>
        {count("household_adults", "Adults")}
        {count("household_children", "Children")}
      </div>
    </section>

    <section className="card fields-group" aria-labelledby="g-about"><h2 id="g-about">About them</h2>
      {contact ? <>
        <dl className="kv">
          <div><dt>Name</dt><dd>{contact.name}</dd></div>
          <div><dt>Email</dt><dd>{contact.email || "—"}</dd></div>
          <div><dt>Phone</dt><dd className="num">{contact.phone || "—"}</dd></div>
          <div><dt>Preferred channel</dt><dd>{OPTIONS.channels.find(([v]) => v === contact.preferred_channel)?.[1] ?? "—"}</dd></div>
          <div><dt>Best time</dt><dd>{contact.best_time || "—"}</dd></div>
        </dl>
        <p className="muted">Saved contact details. This new search keeps them as they are.</p>
      </> : <div className="grid2">
        {input("name", "Name", { maxLength: 120, autoComplete: "off" })}
        {input("email", "Email", { type: "email", maxLength: 254, autoComplete: "off" })}
        {input("phone", "Phone", { type: "tel", maxLength: 30, autoComplete: "off" })}
        {select("preferred_channel", "Preferred channel", OPTIONS.channels)}
        {input("best_time", "Best time to contact", { maxLength: 200 })}
      </div>}
      <div className="field"><label htmlFor="a-requirements">Anything else that matters?</label>
        <textarea id="a-requirements" value={value.requirements} onChange={e => set("requirements", e.target.value)} maxLength={2000}
          {...aria("requirements")} />{err("requirements")}</div>
    </section>
  </>;
}

// "No pets" on its own, or each kind once with how many.
function Pets({ value, onChange, error }) {
  const has = k => value.find(p => p.kind === k);
  const toggle = (k, on) => onChange(!on ? value.filter(p => p.kind !== k)
    : k === "none" ? [{ kind: "none" }] : [...value.filter(p => p.kind !== "none"), { kind: k, count: "1" }]);
  const aria = { "aria-invalid": error ? true : undefined, "aria-describedby": error ? "ae-pets" : undefined };
  return <fieldset className="choices-set" aria-describedby={aria["aria-describedby"]}>
    <legend>Pets</legend>
    <div className="choices">{OPTIONS.pet_kinds.map(([k, t]) => <span key={k} className="pet">
      <label className="check"><input type="checkbox" checked={!!has(k)} onChange={e => toggle(k, e.target.checked)} {...aria} />{t}</label>
      {k !== "none" && has(k) && <input type="number" min={1} max={20} step={1} inputMode="numeric" className="pet-count"
        aria-label={`How many: ${t}`} value={has(k).count} {...aria}
        onChange={e => onChange(value.map(p => (p.kind === k ? { ...p, count: e.target.value } : p)))} />}
    </span>)}</div>
    {error && <small id="ae-pets" className="err">{error}</small>}</fieldset>;
}
