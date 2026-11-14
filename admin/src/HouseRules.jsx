import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";
import { noticeShort } from "../../server/house-rules.js";

// VIS-10: what a house asks of a viewing: notice while it is tenanted, who shows it, where its keys are. For staff
// only. Everything here stays empty until the server reports enabled (VIS10_HOUSE_RULES_READY and migration 0066).
const WHO = { owner: "Owner accompanies", tenant: "Tenant accompanies" };
const OCCUPANCY = { unknown: "Unknown", vacant: "Vacant", tenanted: "Tenanted" };
const path = id => `/admin/listings/${encodeURIComponent(id)}/viewing-rules`;

// The rules of listingId as the server holds them, or null (none asked for, switched off, still loading, or the read
// failed: the server applies them either way). refresh: change it to read them again.
export function useHouseRules(listingId, refresh = 0) {
  const [house, setHouse] = useState(null);
  useEffect(() => {
    setHouse(null);
    if (!listingId) return;
    let live = true;
    api(path(listingId)).then(d => { if (live) setHouse(d.enabled ? d : null); }, () => {});
    return () => { live = false; };
  }, [listingId, refresh]);
  return house;
}

// What the team needs to know before going, as rows of a <dl className="kv"> (own: in a list of its own). Nothing
// when there is nothing to say.
export function HouseRulesFacts({ house, own = false }) {
  if (!house) return null;
  const who = house.shown_by === "negotiator" ? `${house.negotiator_name}${house.negotiator_active ? "" : " (inactive)"}` : WHO[house.shown_by];
  const rows = [
    house.occupancy === "tenanted" && ["Notice", house.notice_hours > 0 ? `Tenanted · ${house.notice_hours} hours' notice`
      : "Tenanted · no notice saved, check access with the tenant"],
    who && ["Shown by", who], house.keys && ["Keys (staff only)", house.keys], house.access_note && ["Access note (staff only)", house.access_note],
  ].filter(Boolean).map(([k, text]) => <div key={k}><dt>{k}</dt><dd className="house-note">{text}</dd></div>);
  return !rows.length ? null : own ? <dl className="kv" aria-label="House rules">{rows}</dl> : rows;
}

// A time sooner than a tenanted house's notice (noticeShort) is booked only once staff say access is agreed.
export { noticeShort };
export function NoticeConfirm({ house, checked, onChange, error, id }) {
  return <div className="warn" role="note">
    <label className="check"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
      aria-invalid={error ? true : undefined} aria-describedby={error ? id : undefined} />
      Access is agreed with the tenant (this time is sooner than the {house.notice_hours} hours' notice)</label>
    {error && <small id={id} className="err">{error}</small>}
  </div>;
}

const toForm = h => ({ notice_hours: String(h.notice_hours ?? 0), who: h.shown_by === "negotiator" ? `n:${h.negotiator_id}` : h.shown_by ?? "",
  keys: h.keys ?? "", access_note: h.access_note ?? "" });

// The listing editor's card. occupancy: the listing's saved one (Legal and compliance), which decides whether notice applies.
export default function HouseRules({ listingId, occupancy }) {
  const [house, setHouse] = useState(null), [form, setForm] = useState(null), [people, setPeople] = useState([]);
  const [errors, setErrors] = useState({}), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const take = d => { setHouse(d.enabled ? d : null); setForm(d.enabled ? toForm(d) : null); };
  useEffect(() => {
    let live = true;
    setHouse(null); setForm(null); setErrors({}); setMsg(null);
    api(path(listingId)).then(d => {
      if (!live) return;
      take(d);
      if (d.enabled) api("/admin/negotiators").then(n => { if (live) setPeople(n.negotiators.filter(p => p.active)); }, () => {});
    }, () => {});
    return () => { live = false; };
  }, [listingId]);
  if (!house || !form) return null;

  const set = k => e => { setForm(f => ({ ...f, [k]: e.target.value })); setErrors(({ [k]: _, ...x }) => x); setMsg(null); };
  const invalid = k => ({ "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `e-hr-${k}` : undefined });
  const error = k => errors[k] && <small id={`e-hr-${k}`} className="err">{errors[k]}</small>;
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    const person = form.who.startsWith("n:");
    try {
      take(await api(path(listingId), { method: "PUT", body: { notice_hours: Number(form.notice_hours), shown_by: person ? "negotiator" : form.who || null,
        negotiator_id: person ? Number(form.who.slice(2)) : null, keys: form.keys, access_note: form.access_note, updated_at: house.updated_at } }));
      setErrors({}); setMsg({ ok: true, text: "House rules saved." });
    } catch (err) {
      const f = err.data?.fields ?? {};
      setErrors({ ...f, ...(f.shown_by || f.negotiator_id ? { who: f.shown_by ?? f.negotiator_id } : {}) }); setMsg({ text: err.message });
    } finally { setBusy(false); }
  };
  const now = occupancy ?? house.occupancy, assigned = house.shown_by === "negotiator" && !people.some(p => p.id === house.negotiator_id);

  return <form id="s-house-rules" className="card fields-group" onSubmit={submit} aria-labelledby="h-house-rules" noValidate>
    <h2 id="h-house-rules">House rules for viewings <span className="muted">(internal)</span></h2>
    <p className="muted">For staff only: never shown on the website. The team sees them when booking a viewing and on the viewing itself.</p>
    <div className="grid2">
      <label>Notice when tenanted (hours)<input type="number" inputMode="numeric" min={0} max={168} step={1} value={form.notice_hours}
        onChange={set("notice_hours")} {...invalid("notice_hours")} />{error("notice_hours")}</label>
      <label>Who shows it<select value={form.who} onChange={set("who")} {...invalid("who")}>
        <option value="">Not set</option>
        {assigned && <option value={`n:${house.negotiator_id}`}>{house.negotiator_name} (inactive)</option>}
        {people.map(p => <option key={p.id} value={`n:${p.id}`}>{p.name}</option>)}
        {Object.entries(WHO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>{error("who")}</label>
      <label>Keys<input value={form.keys} maxLength={200} autoComplete="off" placeholder="e.g. Office key cabinet, tag 14"
        onChange={set("keys")} {...invalid("keys")} />{error("keys")}</label>
    </div>
    <p className="muted">{now === "tenanted"
      ? "This property is marked Tenanted: the website does not offer times sooner than the notice, and staff confirm access to book one."
      : `The notice applies only while Occupancy (Legal and compliance) is Tenanted. It is ${OCCUPANCY[now] ?? "Unknown"} now.`}</p>
    <label>Access note<textarea className="short" value={form.access_note} maxLength={2000} placeholder="e.g. Ring the bell twice; the dog is friendly"
      onChange={set("access_note")} {...invalid("access_note")} />{error("access_note")}</label>
    <div className="inline"><button className="btn">{busy ? "Saving…" : "Save house rules"}</button>
      {house.updated_at && <span className="muted">Last changed by {house.updated_by} · {fmtDate(house.updated_at)}</span>}</div>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </form>;
}
