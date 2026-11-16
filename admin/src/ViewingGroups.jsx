import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDay } from "./format.js";
import SlotPicker from "./SlotPicker.jsx";
import { useHouseRules, NoticeConfirm, noticeShort } from "./HouseRules.jsx";

// VIS-14: houses with two or more open requests, shown above Requests once the server reports it on (VIS14_BLOCK_READY).
// Staff plan them as back-to-back times of one negotiator or as one open viewing with places. Nothing is sent: the
// team tells each person their time and confirms each viewing, as today.
const Msg = ({ m }) => m && <p role={m.ok ? "status" : "alert"} className={m.ok ? "ok" : "err"}>{m.text}</p>;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const refs = list => list.map(r => ({ id: r.id, updated_at: r.updated_at }));
const notMoved = refused => (refused.length ? ` ${plural(refused.length, "request")} not changed: ${refused[0].error}` : "");

// listing: the page's property filter, when there is one. onChanged: the viewings list reads again after a change.
export default function ViewingGroups({ listing, onChanged }) {
  const [data, setData] = useState(null), [err, setErr] = useState(null), [msg, setMsg] = useState(null);
  const [plan, setPlan] = useState(null), [busy, setBusy] = useState(false);
  const head = useRef(null), seq = useRef(0);
  const load = () => {
    const n = ++seq.current;
    return api("/admin/viewing-groups").then(d => { if (n === seq.current) { setData(d); setErr(null); } },
      e => { if (n === seq.current) setErr(e.message); });
  };
  useEffect(() => { load(); }, []);
  const done = async m => {
    setPlan(null); setMsg(m);
    await Promise.all([load(), onChanged?.()]);
    head.current?.focus();
  };
  // One change from the house cards (not the plan form): its answer, or its refusal, in the card's message.
  const run = async (call, text) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await done({ ok: true, text: text(await call()) }); }
    catch (e) { await done({ text: e.data?.refused?.length > 1 ? `${e.message}${notMoved(e.data.refused.slice(1))}` : e.message }); }
    finally { setBusy(false); }
  };
  const add = (g, list) => run(() => api(`/admin/viewing-groups/${g.id}/places`, { method: "POST", body: { viewings: refs(list) } }),
    r => `Gave ${plural(r.placed.length, "place")} in the open viewing of ${fmtDay(g.date, true)} at ${g.time}.${notMoved(r.refused)}`);
  const cancel = g => confirm(`Cancel the open viewing of ${fmtDay(g.date, true)} at ${g.time}? Its ${plural(g.pending + g.confirmed, "viewing")} are cancelled too. Nothing is sent: tell each person yourself.`)
    && run(() => api(`/admin/viewing-groups/${g.id}/cancel`, { method: "POST", body: {} }),
      r => `Open viewing cancelled, with ${plural(r.cancelled.length, "viewing")}. Nothing was sent: tell each person yourself.`);

  if (err) return <p role="alert" className="err">{err} <button type="button" className="linkish" onClick={load}>Try again</button></p>;
  if (!data) return null;
  const mine = x => !listing || x.listing_id === listing;
  const requests = data.requests.filter(mine), groups = data.groups.filter(mine);
  const houses = [...new Set([...requests, ...groups].map(x => x.listing_id))];
  if (!houses.length) return msg && <div className="block-plan"><Msg m={msg} /></div>;
  return <section className="card block-plan" aria-labelledby="h-block">
    <h2 id="h-block" ref={head} tabIndex={-1}>Several people want the same house</h2>
    <p className="muted">Plan their requests together: back-to-back times with one negotiator, or one open viewing with places.
      Nothing is sent: tell each person their time and confirm each viewing, as today.</p>
    <Msg m={msg} />
    {houses.map(id => {
      const asked = requests.filter(r => r.listing_id === id), open = groups.filter(g => g.listing_id === id), n = asked.length;
      const title = (asked[0] ?? open[0]).listing_title;
      return <article key={id} className="block-house" aria-labelledby={`h-block-${id}`}>
        <h3 id={`h-block-${id}`}>{title} <span className="muted">{id}</span></h3>
        {n >= 2 && <p className="warn">{plural(n, "open request")} for this house.</p>}
        {n > 0 && <ul className="block-people">{asked.map(r => <li key={r.id}>{r.name}
          <span className="muted num"> asked for {fmtDay(r.date)} · {r.time}</span></li>)}</ul>}
        {open.map(g => {
          const taken = g.pending + g.confirmed;
          return <div key={g.id} className="block-group">
            <p><strong>Open viewing {fmtDay(g.date, true)} · <span className="num">{g.time}–{g.end_time}</span></strong> with {g.negotiator_name}.{" "}
              {taken} of {g.capacity} places taken: {g.confirmed} confirmed, {g.pending} pending.</p>
            <div className="inline">
              {n > 0 && taken < g.capacity && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => add(g, asked)}>
                {n === 1 ? "Give this request a place" : `Give these ${n} requests a place`}</button>}
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => cancel(g)}>Cancel open viewing</button>
            </div>
          </div>;
        })}
        {n >= 2 && (plan?.listing === id
          ? <PlanForm key={plan.mode} listing={id} mode={plan.mode} requests={asked} onDone={done} onClose={() => setPlan(null)} />
          : <div className="inline">
            <button type="button" className="btn sm" onClick={() => { setMsg(null); setPlan({ listing: id, mode: "consecutive" }); }}>Propose back-to-back times</button>
            <button type="button" className="btn ghost sm" onClick={() => { setMsg(null); setPlan({ listing: id, mode: "open" }); }}>Create open viewing</button>
          </div>)}
      </article>;
    })}
  </section>;
}

// The plan of one house: a negotiator, day and time (the first of the back-to-back times, or the open viewing's), and
// for an open viewing its places. VIS-10's notice is asked as for a booking.
function PlanForm({ listing, mode, requests, onDone, onClose }) {
  const n = requests.length, open = mode === "open";
  const [slot, setSlot] = useState({ negotiator_id: null, date: null, time: null }), [capacity, setCapacity] = useState(String(Math.max(n, 6)));
  const [errors, setErrors] = useState({}), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const house = useHouseRules(listing, refresh), [agreed, setAgreed] = useState(false), short = noticeShort(house, slot);
  const head = useRef(null), form = useRef(null), focusErr = useRef(false), uid = `pf-${listing}`;
  useEffect(() => { head.current?.focus(); }, []);
  useEffect(() => { if (focusErr.current) { focusErr.current = false; form.current?.querySelector("[aria-invalid=true]")?.focus(); } }, [errors]);
  const error = k => errors[k] && <small id={`${uid}-${k}`} className="err">{errors[k]}</small>;
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    const local = {}, places = Number(capacity);
    if (!slot.time) local.time = "Choose a negotiator, a day and a time";
    if (open && !(Number.isInteger(places) && places >= 1 && places <= 50)) local.capacity = "Choose 1 to 50 places";
    else if (open && places < n) local.capacity = `Choose at least ${n} places, one per request`;
    if (short && !agreed) local.notice_confirmed = "Confirm that access is agreed with the tenant, or choose a later time";
    if (Object.keys(local).length) { focusErr.current = true; setErrors(local); setMsg({ text: "Please check the highlighted fields." }); return; }
    setBusy(true); setMsg(null);
    const body = { listing_id: listing, negotiator_id: slot.negotiator_id, date: slot.date, time: slot.time, viewings: refs(requests),
      ...(open ? { capacity: places } : {}), ...(short ? { notice_confirmed: true } : {}) };
    try {
      const r = await api(open ? "/admin/viewing-groups" : "/admin/viewing-groups/consecutive", { method: "POST", body });
      await onDone({ ok: true, text: open
        ? `Open viewing created for ${fmtDay(slot.date, true)} at ${slot.time}: ${r.placed.length} of ${places} places given. Each stays pending until you confirm that viewing.${notMoved(r.refused)}`
        : `Moved ${plural(r.moved.length, "request")} to ${r.moved.map(m => m.time).join(", ")} on ${fmtDay(slot.date, true)}. They stay as requests: tell each person their time, then confirm it.${notMoved(r.refused)}` });
    } catch (err) {
      focusErr.current = true; setErrors(err.data?.fields || {}); setMsg({ text: err.message });
      if (err.status === 409 || err.data?.fields?.time || err.data?.fields?.notice_confirmed) setRefresh(x => x + 1);
      setBusy(false);
    }
  };
  return <form ref={form} className="block-form" onSubmit={submit} aria-labelledby={`${uid}-h`} noValidate>
    <h4 id={`${uid}-h`} ref={head} tabIndex={-1}>{open ? "Create open viewing" : "Propose back-to-back times"}</h4>
    <p className="muted">{open
      ? `One time for everyone. Each of the ${n} requests gets a place and stays pending until you confirm it.`
      : `The ${n} requests move to back-to-back free times of one negotiator, from the time you choose. They stay as requests until you confirm each one.`}</p>
    <SlotPicker value={slot} onChange={s => { setSlot(s); setAgreed(false); setErrors(({ negotiator_id, date, time, notice_confirmed, ...x }) => x); }}
      listingId={listing} refresh={refresh} errors={errors} />
    {open && <label className="block-places">Places
      <input type="number" inputMode="numeric" min={n} max={50} value={capacity} onChange={e => { setCapacity(e.target.value); setErrors(({ capacity, ...x }) => x); }}
        aria-invalid={errors.capacity ? true : undefined} aria-describedby={errors.capacity ? `${uid}-capacity` : undefined} />
      {error("capacity")}</label>}
    {short ? <NoticeConfirm house={house} checked={agreed} error={errors.notice_confirmed} id={`${uid}-notice_confirmed`}
      onChange={b => { setAgreed(b); setErrors(({ notice_confirmed, ...x }) => x); }} /> : error("notice_confirmed")}
    {error("viewings")}
    <div className="inline"><button className="btn">{busy ? "Saving…" : open ? "Create open viewing" : `Move ${n} requests`}</button>
      <button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
    <Msg m={msg} />
  </form>;
}
