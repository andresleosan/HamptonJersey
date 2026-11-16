import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, fmtDay } from "./format.js";
import { jerseyToday, addMinutes, SLOT_MINUTES } from "../../server/viewings.js";
import { clientFit } from "../../server/viewing-coordination.js";
import SlotPicker from "./SlotPicker.jsx";
import { NoticeConfirm, noticeShort } from "./HouseRules.jsx";

// VIS-17: agree one time with everyone a viewing needs (client always; advertiser or agency and the negotiator when
// chosen). Staff record each answer by hand with how and when; the viewing is confirmed only once all have accepted.
// Nothing is sent from here. Shown on an active viewing once the server reports coordination on.
const WHO = { client: "Client", advertiser: "Advertiser or agency", staff: "Negotiator (attending)" };
const STATE = { proposed: ["Time proposed", "attention"], awaiting_confirmations: ["Waiting for answers", "attention"],
  blocked: ["Time no longer free", "attention"], confirmed: ["Agreed by everyone", "positive"], declined: ["Declined", "neutral"],
  withdrawn: ["Proposal closed", "neutral"] };
const CHANNEL = { phone: "Phone", email: "Email", whatsapp: "WhatsApp", in_person: "In person", other: "Other" };
const FIT = { fits: "Inside the client's preferred times", outside: "Outside the client's preferred times",
  unknown: "The client's preferred times are not known" };
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const windowsText = w => (w?.length ? w.map(x => `${DAY[x.day]} ${x.start}-${x.end}`).join(", ") : "Not given");
// The browser's own clock as a datetime-local value.
const localNow = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const errorsOf = e => ({ text: e.message, fields: e.data?.fields ?? {} });

// v: the open viewing; house: its house rules (VIS-10); saved(text): reload the list and show this message;
// onOpen(bool): whether a proposal is open (the old Confirm is then hidden).
export default function ViewingCoordination({ v, house, saved, onOpen }) {
  const [state, setState] = useState(null), [loadErr, setLoadErr] = useState(null), [form, setForm] = useState(null); // form: "propose" | participant
  const opener = useRef(null);
  const load = () => api(`/admin/viewings/${v.id}/coordination`).then(d => { setState(d); setLoadErr(null); }, e => setLoadErr(e.message));
  useEffect(() => { load(); }, [v.id, v.updated_at]);
  const open = state?.proposal?.state === "open";
  useEffect(() => { onOpen(open); }, [open]);
  const toggle = (k, e) => { opener.current = e.currentTarget; setForm(f => (f === k ? null : k)); };
  const close = () => { setForm(null); opener.current?.focus(); };
  const done = async text => { setForm(null); await load(); return saved(text); };

  if (loadErr) return <p role="alert" className="err">{loadErr} <button type="button" className="linkish" onClick={load}>Try again</button></p>;
  if (!state) return null;
  const p = state.proposal, [label, tone] = STATE[state.coordination_state] ?? [];
  const answers = Object.fromEntries(state.acceptances.map(a => [a.participant, a]));
  return <section className="view-form coord" aria-labelledby={`h-coord-${v.id}`}>
    <h3 id={`h-coord-${v.id}`}>Agree a time with everyone</h3>
    {!p ? <p className="muted">When the client, the advertiser or the negotiator must each agree first, propose a time and record
      their answers here. Nothing is sent from here.</p>
      : <>
        <p><span className={`badge ${tone}`}>{label}</span>{" "}
          <span className="num">{fmtDay(p.date, true)} · {p.time}-{p.end_time}</span>{p.negotiator_name ? ` with ${p.negotiator_name}` : ""}</p>
        {open && <p className="muted">{FIT[p.client_fit]}.{state.coordination_state === "blocked"
          ? " Everyone accepted, but this time was booked meanwhile: propose another time." : " The viewing keeps its current time until everyone accepts."}</p>}
        <ul className="coord-people" aria-label="Who must accept">{p.required.map(k => {
          const a = answers[k];
          return <li key={k}><span className="who">{WHO[k]}</span>{" "}
            {a ? <span>{a.response === "accepted" ? "Accepted" : "Declined"} · {CHANNEL[a.channel]} · {fmtDate(a.answered_at)}
              {a.answered_by ? ` · ${a.answered_by}` : ""} <span className="muted">· recorded by {a.recorded_by}</span></span>
              : <span className="muted">{open ? "Waiting for their answer" : "No answer"}</span>}
            {open && !a && <> <button type="button" className="btn ghost sm" aria-expanded={form === k}
              onClick={e => toggle(k, e)}>Record answer</button></>}
            {open && form === k && <AnswerForm v={v} p={p} who={k} onDone={done} onClose={close} />}
          </li>;
        })}</ul>
      </>}
    <div className="inline"><button type="button" className="btn ghost sm" aria-expanded={form === "propose"} onClick={e => toggle("propose", e)}>
      {open ? "Propose another time" : "Propose a time"}</button></div>
    {form === "propose" && <ProposeForm v={v} house={house} state={state} onDone={done} onClose={close} />}
  </section>;
}

function ProposeForm({ v, house, state, onDone, onClose }) {
  const [slot, setSlot] = useState({ negotiator_id: v.negotiator_id, date: v.date >= jerseyToday() ? v.date : null, time: null });
  const [others, setOthers] = useState({ advertiser: !!v.listing_id, staff: false }), [search, setSearch] = useState(state.proposal?.applicant_id ?? "");
  const [agreed, setAgreed] = useState(false), [err, setErr] = useState(null), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const head = useRef(null);
  useEffect(() => { head.current?.focus(); }, []);
  const short = noticeShort(house, slot), chosen = state.searches.find(s => s.id === Number(search));
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    if (!slot.time) return setErr({ text: "Choose a negotiator, a day and a time", fields: { time: "Choose a day and a time" } });
    if (short && !agreed) return setErr({ text: "Confirm that access is agreed with the tenant, or choose a later time", fields: {} });
    setBusy(true); setErr(null);
    try {
      await api(`/admin/viewings/${v.id}/proposals`, { method: "POST", body: { expected_revision: state.revision, ...slot,
        required: ["client", ...Object.keys(others).filter(k => others[k])], applicant_id: search ? Number(search) : null,
        ...(short ? { notice_confirmed: true } : {}) } });
      await onDone(`Time proposed for ${fmtDay(slot.date, true)} at ${slot.time}. Record each answer as it comes in.`);
    } catch (e) { setErr(errorsOf(e)); setRefresh(x => x + 1); } finally { setBusy(false); }
  };
  return <form className="coord-form" onSubmit={submit} aria-labelledby={`h-prop-${v.id}`} noValidate>
    <h4 id={`h-prop-${v.id}`} ref={head} tabIndex={-1}>Propose a time</h4>
    <SlotPicker value={slot} onChange={s => { setSlot(s); setErr(null); setAgreed(false); }} own={v} listingId={v.listing_id}
      refresh={refresh} errors={err?.fields ?? {}} />
    {short && <NoticeConfirm house={house} checked={agreed} onChange={b => { setAgreed(b); setErr(null); }} />}
    <fieldset className="choices-set"><legend>Who must accept</legend>
      <div className="choices">
        <label className="check"><input type="checkbox" checked disabled /> {WHO.client} (always)</label>
        {["advertiser", "staff"].map(k => <label key={k} className="check"><input type="checkbox" checked={others[k]}
          onChange={e => setOthers(o => ({ ...o, [k]: e.target.checked }))} /> {WHO[k]}</label>)}
      </div></fieldset>
    {state.searches.length > 0 && <label>Their search<select value={search} onChange={e => { setSearch(e.target.value); setErr(null); }}
      aria-invalid={err?.fields.applicant_id ? true : undefined}>
      <option value="">Not linked</option>
      {state.searches.map(s => <option key={s.id} value={s.id}>Search {s.id} · to {s.operation}</option>)}</select>
      {err?.fields.applicant_id && <small className="err">{err.fields.applicant_id}</small>}</label>}
    {chosen && <p className="muted">Preferred viewing times: {windowsText(chosen.windows)}.{slot.time && slot.date
      ? ` ${FIT[clientFit(chosen.windows, { date: slot.date, time: slot.time, end_time: addMinutes(slot.time, SLOT_MINUTES) })]}.` : ""}</p>}
    {err && <p role="alert" className="err">{err.fields.notice_confirmed ?? err.fields.required ?? err.text}</p>}
    <div className="inline"><button className="btn">{busy ? "Proposing…" : "Propose this time"}</button>
      <button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
  </form>;
}

function AnswerForm({ v, p, who, onDone, onClose }) {
  const [f, setF] = useState({ response: "", channel: "", at: localNow(), by: "" }), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const head = useRef(null), id = `${v.id}-${who}`;
  useEffect(() => { head.current?.focus(); }, []);
  const set = k => e => { setF(x => ({ ...x, [k]: e.target.value })); setErr(null); };
  const bad = k => err?.fields[k];
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const local = {};
    if (!f.response) local.response = "Choose accepted or declined";
    if (!f.channel) local.channel = "Choose how they answered";
    if (!f.at || Number.isNaN(Date.parse(f.at))) local.answered_at = "Enter when they answered";
    if (Object.keys(local).length) return setErr({ text: "Please check the highlighted fields.", fields: local });
    setBusy(true);
    try {
      const r = await api(`/admin/viewings/${v.id}/proposals/${p.id}/responses`, { method: "POST", body: { revision: p.revision,
        participant: who, response: f.response, channel: f.channel, answered_at: new Date(f.at).toISOString(), answered_by: f.by.trim() || null } });
      await onDone(r.confirmed ? `Everyone accepted. The viewing is confirmed for ${fmtDay(p.date, true)} at ${p.time}.`
        : f.response === "declined" ? `${WHO[who]} declined. Propose another time.` : `${WHO[who]}'s answer saved.`);
    } catch (e) { setErr(errorsOf(e)); } finally { setBusy(false); }
  };
  return <form className="coord-form" onSubmit={submit} aria-labelledby={`h-ans-${id}`} noValidate>
    <h4 id={`h-ans-${id}`} ref={head} tabIndex={-1}>{WHO[who]}'s answer</h4>
    <fieldset className="choices-set" aria-describedby={bad("response") ? `e-res-${id}` : undefined}><legend>Their answer</legend>
      <div className="choices">{[["accepted", "Accepted"], ["declined", "Declined"]].map(([k, t]) => <label key={k} className="check">
        <input type="radio" name={`res-${id}`} value={k} checked={f.response === k} onChange={set("response")} /> {t}</label>)}</div>
      {bad("response") && <small id={`e-res-${id}`} className="err">{bad("response")}</small>}</fieldset>
    <div className="grid2">
      <label>How they answered<select value={f.channel} onChange={set("channel")} aria-invalid={bad("channel") ? true : undefined}>
        <option value="">Choose…</option>{Object.entries(CHANNEL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        {bad("channel") && <small className="err">{bad("channel")}</small>}</label>
      <label>When they answered<input type="datetime-local" value={f.at} max={localNow()} onChange={set("at")}
        aria-invalid={bad("answered_at") ? true : undefined} />{bad("answered_at") && <small className="err">{bad("answered_at")}</small>}</label>
    </div>
    <label>Who answered (optional)<input value={f.by} maxLength={120} autoComplete="off" onChange={set("by")}
      placeholder={who === "advertiser" ? "e.g. Agency front desk" : ""} /></label>
    {err && <p role="alert" className="err">{err.text}</p>}
    <div className="inline"><button className="btn">{busy ? "Saving…" : "Save answer"}</button>
      <button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
  </form>;
}
