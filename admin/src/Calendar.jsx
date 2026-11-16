// VIS-12: each negotiator's Google Calendar in the panel. Switched off (VIS12_CALENDAR_READY), the server answers
// { enabled: false } and none of this shows: Availability and Viewings read as before.
import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

// Read once per page load; Connect and Disconnect read it again.
let status = null;
export const calendarStatus = (fresh = false) => {
  if (!status || fresh) status = api("/admin/calendar/google").catch(() => { status = null; return { enabled: false }; });
  return status;
};
function useCalendar() {
  const [s, setS] = useState(null);
  useEffect(() => { let live = true; calendarStatus().then(d => live && setS(d)); return () => { live = false; }; }, []);
  return [s, async () => setS(await calendarStatus(true))];
}

// The answers Google's sign-in comes back with (server/viewing-calendar.js, callback), shown once on Availability.
const RETURN = {
  connected: [true, "Google Calendar connected. Confirmed viewings now go into that negotiator's calendar."],
  denied: [false, "Google Calendar was not connected: access was refused at Google. Viewings stay in Hampton's calendar."],
  scopes: [false, "Google Calendar was not connected: both calendar permissions are needed. Please connect again and allow both."],
  failed: [false, "Google Calendar was not connected: the sign-in expired or was finished in another browser. Please connect again."],
};
export function CalendarReturn() {
  const [m] = useState(() => RETURN[new URLSearchParams(location.search).get("calendar")] ?? null);
  useEffect(() => {
    if (!m) return;
    const q = new URLSearchParams(location.search); q.delete("calendar");
    history.replaceState(history.state, "", location.pathname + (q.size ? `?${q}` : "") + location.hash);
  }, []);
  return m && <p role={m[0] ? "status" : "alert"} className={m[0] ? "ok" : "err"}>{m[1]}</p>;
}

// The negotiator's record in Availability: connected or not, and the button that changes it.
export function CalendarConnection({ n }) {
  const [s, reload] = useCalendar(), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  if (!s?.enabled) return null;
  const c = s.connections.find(x => x.negotiator_id === n.id && x.state === "active");
  const connect = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { location.assign((await api("/admin/calendar/google/start", { method: "POST", body: { negotiator_id: n.id } })).url); }
    catch (e) { setMsg({ text: e.message }); setBusy(false); }
  };
  const disconnect = async () => {
    if (busy || !confirm(`Disconnect ${n.name}'s Google Calendar? Events already there stay; new changes to viewings are not written to it.`)) return;
    setBusy(true); setMsg(null);
    try {
      await api("/admin/calendar/google/disconnect", { method: "POST", body: { negotiator_id: n.id } });
      await reload(); setMsg({ ok: true, text: `${n.name}'s Google Calendar is disconnected.` });
    } catch (e) { setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  return <section aria-labelledby="h-gcal">
    <h3 id="h-gcal">Google Calendar</h3>
    {c ? <>
      <p>Connected. Confirmed viewings go into {n.name}'s Google Calendar, and their busy times there are checked before a viewing is confirmed or moved.</p>
      <p className="muted">Since {fmtDate(c.connected_at)} · by {c.connected_by}</p>
      <div className="inline"><button type="button" className="btn ghost" onClick={disconnect}>{busy ? "Disconnecting…" : "Disconnect Google Calendar"}</button></div>
    </> : <>
      <p>Not connected. {n.name}'s viewings stay in Hampton's calendar only.</p>
      {s.configured
        ? <div className="inline"><button type="button" className="btn" onClick={connect}>{busy ? "Opening Google…" : "Connect Google Calendar"}</button>
          <span className="muted">{n.name} signs in with their own Google account.</span></div>
        : <p className="muted">Google Calendar is not set up for Hampton yet.</p>}
    </>}
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </section>;
}

// A viewing's event in its negotiator's calendar, beside its other facts. Nothing while off or never written.
const STATE = { synced: "In the calendar", pending: "Waiting to be written", unknown: "Not confirmed by Google yet",
  conflict: "Changed in Google. Check the negotiator's calendar, then check again." };
export function CalendarFact({ v }) {
  const [s] = useCalendar(), [l, setL] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState(null);
  useEffect(() => {
    if (!s?.enabled) return;
    let live = true;
    api(`/admin/calendar/viewings/${v.id}`).then(d => live && setL(d), () => {});
    return () => { live = false; };
  }, [s?.enabled, v.id, v.updated_at, v.status]);
  if (!s?.enabled || !l || !STATE[l.state]) return null;
  const again = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { await api(`/admin/calendar/viewings/${v.id}/sync`, { method: "POST" }); setL(await api(`/admin/calendar/viewings/${v.id}`)); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const text = l.wanted === "cancelled" && l.state === "synced" ? "Cancelled in the calendar" : STATE[l.state];
  return <div><dt>Google Calendar</dt><dd><span role="status">{text}</span>
    {l.state !== "synced" && <> <button type="button" className="btn ghost sm" onClick={again}>{busy ? "Checking…" : "Check again"}</button></>}
    {err && <small className="err"> {err}</small>}</dd></div>;
}

// After a 409 that staff can answer for: Google could not be checked, or the viewing's own event is at that time.
// A busy time is never overridden (server/viewing-calendar.js), so it gets no box.
export const REVIEWABLE = ["calendar_unchecked", "calendar_self_overlap"];
export function CalendarReviewed({ checked, onChange }) {
  return <div className="warn" role="note">
    <label className="check"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      I checked the calendar myself: this time is free in the negotiator's Google Calendar</label>
  </div>;
}
