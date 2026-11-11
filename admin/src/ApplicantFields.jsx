import RequirementSwitch from "./RequirementSwitch.jsx";
import { CRITERIA, hasAnswer, hasHouseholdPets, notApplicable, prioritiesFor, budgetLimitNote } from "../../site/requirements.js";
import { OPTIONS } from "../../server/applicants.js";
import ViewingAvailability from "./ViewingAvailability.jsx";

// The form value: API field names, inputs as strings, lists as arrays, pets as [{kind, count}].
const TEXT = ["name", "email", "phone", "preferred_channel", "best_time", "operation", "furnished", "near", "move_in_date",
  "buyer_position", "mortgage_aip", "housing_status", "requirements", "search_category", "commercial_kind", "commercial_use",
  "area_unit", "commercial_rent_period", "preferred_language", "household_children_status", "area_answer", "preferred_parish"];
const NUM = ["budget_min", "budget_max", "budget_stretch", "bedrooms_min", "bedrooms_max", "bedrooms_ideal", "bathrooms_min", "parking_spaces",
  "lease_term_months", "household_adults", "household_children", "area_min", "area_max", "commercial_purchase", "commercial_rent",
  "commercial_premium", "commercial_expenses"];
const LIST = ["property_types", "outdoor", "parishes_wanted", "parishes_excluded", "pets", "viewing_availability"];

// From the stored applicant and contact (detail API) to the form value; with no arguments, an empty form.
export const toForm = (applicant = {}, contact = {}) => {
  const src = { ...applicant, operation: applicant.search_operation ?? applicant.operation, name: contact.name, email: contact.email, phone: contact.phone,
    preferred_channel: contact.preferred_channel, best_time: contact.best_time };
  return {requirement_priorities:applicant.requirement_priorities ?? (applicant.id == null ? {version:1,values:Object.fromEntries(Object.keys(CRITERIA).map(k=>[k,'preferred'])),unknown:[]} : null), household_children_ages:applicant.household_children_ages ?? null, ...Object.fromEntries([...TEXT.map(k => [k, src[k] ?? ""]), ...NUM.map(k => [k, src[k] == null ? "" : String(src[k])]),
    ...LIST.map(k => [k, src[k] ?? []])])};
};

// "2,000" and "£ 2000" become 2000; text that isn't a number goes as typed, so the server's message lands on the field.
const number = s => {
  const t = String(s).replace(/[\s,£]/g, "");
  return t === "" ? null : /^\d+(\.\d+)?$/.test(t) ? Number(t) : t;
};
// From the form value to the API body: blank is null, never 0.
export const toBody = f => ({ requirement_priorities:prioritiesFor(f.requirement_priorities,f),
  household_children_ages:f.search_category === "commercial" ? null : f.household_children_ages, ...Object.fromEntries([
  ...TEXT.map(k => [k, f[k].trim() === "" ? null : f[k]]),
  ...NUM.map(k => [k, number(f[k])]),
  ...LIST.map(k => [k, !f[k].length ? null : k === "pets"
    ? f.pets.map(p => (p.kind === "none" ? { kind: "none" } : { kind: p.kind, count: number(p.count) })) : f[k]]),
])});

const HOUSING_WHY = "It decides which homes they can rent or buy in Jersey.";

// The search's requirements and the person's contact details, grouped like the website's steps (§5).
// operation: the search's operation; it decides the rent-only and buy-only fields and the budget wording.
// contact: a saved contact the search is for; its details are shown, not edited.
export default function ApplicantFields({ value, onChange, errors = {}, operation, contact, lockedCategory = false, areaRequired = false }) {
  const set = (k, v) => onChange({ ...value, [k]: v, ...(k==='household_children' && value.household_children_ages && /^\d+$/.test(v) && Number(v)<=20
    ? {household_children_ages:Array.from({length:Number(v)},(_,i)=>value.household_children_ages[i]??null)} : {}) });
  const keyFor={area_answer:'area',property_types:'type',bedrooms_min:'bedrooms',bathrooms_min:'bathrooms',parking_spaces:'parking',furnished:'furnished',budget_max:'budget',move_in_date:'move_in_date',lease_term_months:'lease_term_months',near:'near',requirements:'requirements',household_children_status:'children'};
  const changeArea = (k, v, checked) => {
    if (k === "area_answer") {
      if (v !== "selected" && (value.parishes_wanted.length || value.preferred_parish)) {
        if (!window.confirm("Changing this answer will remove the selected and preferred parishes. Continue?")) return;
        onChange({ ...value, area_answer: v, parishes_wanted: [], preferred_parish: "" });
      } else set(k, v);
      return;
    }
    const other = k === "parishes_wanted" ? "parishes_excluded" : "parishes_wanted";
    const moving = checked && value[other].includes(v);
    const removingSelected = k === "parishes_wanted" && !checked;
    const removingPreferred = value.preferred_parish === v && (removingSelected || (k === "parishes_excluded" && checked));
    if ((moving || removingSelected) && !window.confirm(`This will remove ${v} from ${moving ? "the other parish list" : "the selected parishes"}${removingPreferred ? " and clear the preferred parish" : ""}. Continue?`)) return;
    onChange({ ...value, [k]: checked ? [...value[k], v] : value[k].filter(x => x !== v),
      ...(moving ? { [other]: value[other].filter(x => x !== v) } : {}),
      ...(removingPreferred ? { preferred_parish: "" } : {}) });
  };
  const changePriority=(key,p)=>{
    const old=value.requirement_priorities ?? {version:1,values:{},unknown:[]};
    const unknown=old.unknown.filter(k=>k!==key);
    if (p==='must' && !hasAnswer(key,value)) unknown.push(key);
    set('requirement_priorities',{version:1,values:{...old.values,[key]:p},unknown});
  };
  const prioritySwitch = key => value.search_category==='commercial' ? null : <RequirementSwitch criterion={key}
    priority={value.requirement_priorities?.values[key]} disabled={notApplicable(key,value)} invalid={!!errors.requirement_priorities}
    onChange={p=>changePriority(key,p)}/>;
  const heading=(k,label)=><div className="req-heading"><label htmlFor={`a-${k}`}>{label}</label>{keyFor[k] && prioritySwitch(keyFor[k])}</div>;
  const err = k => errors[k] && <small id={`ae-${k}`} className="err">{errors[k]}</small>;
  const aria = k => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `ae-${k}` : undefined });
  const input = (k, label, extra = {}) => <div className="field">
    {heading(k,label)}
    <input id={`a-${k}`} value={value[k]} onChange={e => set(k, e.target.value)} {...aria(k)} {...extra} />{err(k)}</div>;
  const count = (k, label, max = 20) => input(k, label, { type: "number", min: 0, max, step: 1, inputMode: "numeric" });
  const money = (k, label) => input(k, label, { inputMode: "decimal", autoComplete: "off" });
  const select = (k, label, list, blank = "Not said") => <div className="field">
    {heading(k,label)}
    <select id={`a-${k}`} value={value[k]} onChange={e => {
      if (k === "preferred_parish" && value[k] && value[k] !== e.target.value
        && !window.confirm("Change or remove the preferred parish?")) return;
      set(k, e.target.value);
    }} {...aria(k)}>
      <option value="">{blank}</option>{list.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>{err(k)}</div>;
  // A list of real checkboxes (or radios) inside its own fieldset, the error under it.
  const choices = (k, legend, list, type = "checkbox") => <fieldset className="choices-set" aria-describedby={aria(k)["aria-describedby"]}>
    <legend className="req-heading"><span className="req-label">{legend}</span>{keyFor[k] && prioritySwitch(keyFor[k])}</legend>
    <div className="choices">{list.map(([v, t]) => <label key={v} className="check">
      <input type={type} name={`a-${k}`} value={v} required={k === "area_answer" && areaRequired || undefined} checked={type === "radio" ? value[k] === v : value[k].includes(v)} {...aria(k)}
        onChange={e => ["area_answer", "parishes_wanted", "parishes_excluded"].includes(k)
          ? changeArea(k, v, e.target.checked)
          : set(k, type === "radio" ? v : e.target.checked ? [...value[k], v] : value[k].filter(x => x !== v))} />{t}</label>)}</div>
    {err(k)}</fieldset>;

  const rent = operation === "rent", buy = operation === "buy", commercial = value.search_category === "commercial";
  const per = rent ? " (£ per month)" : " (£)";
  return <>
    <p className="req-note">Turn on Must-have for essential requirements. Unanswered priorities on older searches stay unconfirmed.</p>
    {errors.requirement_priorities && <p className="err" role="alert">{errors.requirement_priorities}</p>}
    <ViewingAvailability value={value.viewing_availability} onChange={v => set("viewing_availability", v)} error={errors.viewing_availability} />
    <section className="card fields-group" aria-labelledby="g-search"><h2 id="g-search">What they're looking for</h2>
      {lockedCategory ? <p>Search type: {commercial ? "Commercial or business" : "Home"}</p>
        : choices("search_category", "Search type", [["residential", "Home"], ["commercial", "Commercial or business"]], "radio")}
      {choices("operation", "Operation", commercial ? [...OPTIONS.operation, ["transfer", "Business transfer"]] : OPTIONS.operation, "radio")}
      {commercial && choices("commercial_kind", "Looking for", [["property", "Commercial property"], ["business", "Business"], ["both", "Both"]], "radio")}
    </section>

    <section className="card fields-group" aria-labelledby="g-where"><h2 id="g-where">Where</h2>
      {choices("area_answer", `Where are they looking?${areaRequired ? " (required)" : ""}`, [["selected", "Selected parishes"], ["any", "Anywhere in Jersey"], ["unknown", "Not sure yet"]], "radio")}
      {!value.area_answer && <p className="muted">The area answer has not been confirmed.</p>}
      {(value.area_answer === "selected" || (!value.area_answer && value.parishes_wanted.length > 0)) && <>
        {choices("parishes_wanted", "Parishes they want", OPTIONS.parishes)}
        {value.area_answer === "selected" && (value.parishes_wanted.length > 1 || value.preferred_parish) && select("preferred_parish", "Preferred parish (optional)",
          OPTIONS.parishes.filter(([v]) => value.parishes_wanted.includes(v)), "No preference")}
      </>}
      {choices("parishes_excluded", "Parishes they don't want", OPTIONS.parishes)}
      <div className="grid2">{input("near", "Near (work, school…)", { maxLength: 200 })}</div>
    </section>

    {commercial ? <section className="card fields-group" aria-labelledby="g-commercial"><h2 id="g-commercial">Commercial requirements</h2>
      <p className="muted">Leave unknown answers blank so the team can confirm them.</p>
      <div className="grid2">
        {input("commercial_use", "Intended use", { maxLength: 200 })}
        {money("area_min", "Minimum area")}{money("area_max", "Maximum area")}
        {select("area_unit", "Area unit", [["sqm", "Square metres"], ["sqft", "Square feet"]], "Unknown")}
        {money("commercial_purchase", "Maximum purchase price (£)")}
        {money("commercial_rent", "Maximum rent (£)")}
        {select("commercial_rent_period", "Rent period", [["month", "Per month"], ["year", "Per year"]], "Unknown")}
        {money("commercial_premium", "Maximum business transfer (£)")}
        {money("commercial_expenses", "Maximum expenses (£)")}
        {input("move_in_date", "Available from", { type: "date" })}
      </div>
    </section> : <>
    <section className="card fields-group" aria-labelledby="g-home"><h2 id="g-home">What kind of home</h2>
      {choices("property_types", "Type", OPTIONS.property_types)}
      <div className="grid2">
        {count("bedrooms_min", "Bedrooms, at least")}
        {count("bedrooms_max", "Bedrooms, at most")}
        {count("bedrooms_ideal", "Bedrooms, ideally")}
        {count("bathrooms_min", "Bathrooms, at least")}
        {select("parking_spaces", "Parking", OPTIONS.parking)}
        {rent && select("furnished", "Furnished", OPTIONS.furnished)}
      </div>
      <fieldset className="choices-set"><legend>Outdoor space</legend><div className="req-outdoor">{OPTIONS.outdoor.map(([k,label])=><div className="req-heading" key={k}><label><input type="checkbox" checked={value.outdoor.includes(k)} onChange={e=>set('outdoor',e.target.checked?[...value.outdoor,k]:value.outdoor.filter(v=>v!==k))}/>{label}</label>{prioritySwitch(k)}</div>)}</div></fieldset>
      <Pets value={value.pets} onChange={v => set("pets", v)} error={errors.pets} />
    </section>

    <section className="card fields-group" aria-labelledby="g-budget"><h2 id="g-budget">Budget and timing</h2>
      {!commercial && <p id="a-budget-limit" className="req-note" hidden={!budgetLimitNote(value)}>{budgetLimitNote(value)}</p>}
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
        {count("household_adults", "Adults (18 or over)")}
        <div className="field">{heading("household_children_status","Children")}
          <select id="a-household_children_status" value={value.household_children_status} onChange={e => onChange({ ...value,
            household_children_status: e.target.value, ...(e.target.value !== "known" ? { household_children: "", household_children_ages:null } : {}) })}>
            <option value="">Not said</option><option value="known">Number known</option><option value="unknown">Don't know</option>
            <option value="not_applicable">Not applicable</option></select></div>
        {(value.household_children_status === "known" || (!value.household_children_status && value.household_children !== "") || errors.household_children)
          && count("household_children", "Number of children (enter 0 if none)")}
      </div>
      {value.household_children_status !== 'unknown' && value.household_children_status !== 'not_applicable' && Number(value.household_children)>0 && Number(value.household_children)<=20 && <div className="children-ages">{Array.from({length:Number(value.household_children)},(_,i)=><div className="field" key={i}>
        <label htmlFor={`a-child-age-${i}`}>Child {i+1} age</label><select id={`a-child-age-${i}`} value={value.household_children_ages?.[i] ?? ''} {...aria('household_children_ages')}
          onChange={e=>set('household_children_ages',Array.from({length:Number(value.household_children)},(_,j)=>i===j ? (e.target.value===''?null:Number(e.target.value)) : value.household_children_ages?.[j]??null))}>
          <option value="">To confirm</option>{Array.from({length:18},(_,n)=><option key={n} value={n}>{n===0?'Under 1':n}</option>)}</select></div>)}</div>}
      {err('household_children_ages')}
      <p className="req-note">Children’s ages are as declared. A must-have here asks the team to confirm household suitability.</p>
      <p className="muted">Total occupants: {!["unknown", "not_applicable"].includes(value.household_children_status)
        && value.household_adults !== "" && value.household_children !== ""
        && Number.isInteger(Number(value.household_adults)) && Number.isInteger(Number(value.household_children))
        ? Number(value.household_adults) + Number(value.household_children) : "Not yet confirmed"}</p>
    </section>
    </>}

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
      {input("preferred_language", "Preferred language (if known)", { maxLength: 80 })}
      <div className="field">{heading("requirements","Anything else that matters?")}
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
    {hasHouseholdPets({pets:value}) && <p className="req-note">Pets must be accommodated.</p>}
    <div className="choices">{OPTIONS.pet_kinds.map(([k, t]) => <span key={k} className="pet">
      <label className="check"><input type="checkbox" checked={!!has(k)} onChange={e => toggle(k, e.target.checked)} {...aria} />{t}</label>
      {k !== "none" && has(k) && <input type="number" min={1} max={20} step={1} inputMode="numeric" className="pet-count"
        aria-label={`How many: ${t}`} value={has(k).count} {...aria}
        onChange={e => onChange(value.map(p => (p.kind === k ? { ...p, count: e.target.value } : p)))} />}
    </span>)}</div>
    {error && <small id="ae-pets" className="err">{error}</small>}</fieldset>;
}
