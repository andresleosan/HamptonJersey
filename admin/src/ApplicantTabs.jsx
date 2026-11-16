import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtAgo, fmtDate, fmtDay, VIEWING_STATUS, OUTCOME } from "./format.js";

// SAP-08: the applicant record's Viewings and Messages tabs. Each reads its list the first time its tab opens; Try again
// reads it again. A failed read says so: it is never shown as "none".
function useTabRead(path, active) {
  const [state, setState] = useState({ phase: "idle" }), generation = useRef(0);
  const read = () => {
    const g = ++generation.current;
    setState({ phase: "loading" });
    api(path).then(data => g === generation.current && setState({ phase: "ready", data }),
      e => g === generation.current && setState({ phase: "error", error: e.message }));
  };
  useEffect(() => { if (active && state.phase === "idle") read(); }, [active]);
  useEffect(() => () => { generation.current++; }, []);
  return [state, read];
}

const Pending = ({ state, read, what }) => state.phase === "error"
  ? <p role="alert" className="err">{state.error} <button type="button" className="btn ghost sm" onClick={read}>Try again</button></p>
  : <p role="status" className="muted">Loading {what}…</p>;

const SAME = { email: "Same email", phone: "Same phone", "email phone": "Same email and phone" };

// G4: viewings have no link to a person yet, so these are the ones with the contact's email or phone. Only the viewing
// itself shows, never the requester's details: a viewing matched this way may be someone else's.
export function ApplicantViewings({ id, active }) {
  const [state, read] = useTabRead(`/admin/applicants/${id}/viewings`, active);
  if (state.phase !== "ready") return <Pending state={state} read={read} what="viewings" />;
  const list = state.data.viewings;
  return <section aria-labelledby="h-a-viewings">
    <h2 id="h-a-viewings">Viewings</h2>
    <p><span className="badge neutral">Matched by email/phone</span> <span className="muted">Booked with this contact's email or phone.
      They are not linked to this search, so check each one is the same person.</span></p>
    {list.length ? <ol className="timeline card">{list.map(v => {
      const [status, tone] = VIEWING_STATUS[v.status] ?? [v.status, "neutral"];
      return <li key={v.id}>
        <p><strong>{v.listing_title || v.listing_ref || "General enquiry / valuation"}</strong> <span className={`badge ${tone}`}>{status}</span></p>
        <p className="meta"><span>{fmtDay(v.date, true)} at {v.time}{v.end_time ? `–${v.end_time}` : ""}</span>
          {v.status === "completed" && <span>{OUTCOME[v.outcome] ?? "No answer yet"}</span>}
          {v.feedback_at && <span>Feedback {fmtDate(v.feedback_at)}</span>}
          <span>{SAME[v.matched_by.join(" ")]}</span>
          <span><a href={v.listing_id ? `#/viewings?listing=${encodeURIComponent(v.listing_id)}` : "#/viewings"}>Open viewings</a></span></p>
      </li>;
    })}</ol> : <p className="empty card">No viewings with this contact's email or phone.</p>}
    {list.length >= 50 && <p className="muted">Showing the 50 most recent viewings.</p>}
  </section>;
}

const CHAT_STATUS = { waiting: "Waiting", answered: "Answered", handled: "Handled" };

// The website chats a person linked to this contact (MSG-03), which every search of the contact shares. Email is not
// linked to applicants yet, and says so.
export function ApplicantMessages({ id, active }) {
  const [state, read] = useTabRead(`/admin/applicants/${id}/messages`, active);
  return <>
    <section className="card" aria-labelledby="h-contact-chats">
      <h2 id="h-contact-chats">Website chats</h2>
      {state.phase !== "ready" ? <Pending state={state} read={read} what="website chats" />
        : !state.data.chats ? <p className="muted">Linking website chats to contacts is switched off.</p>
        : state.data.chats.length ? <ul className="plain-list">{state.data.chats.map(c => <li key={c.id}>
          <a href={`#/messages?chat=${c.id}`}>Chat started {fmtDate(c.created_at)}</a>
          <span className="muted">{CHAT_STATUS[c.status] ?? c.status} · last message {fmtAgo(c.last_at)}</span></li>)}</ul>
        : <p className="muted">No website chats linked. Link one from Messages.</p>}
      <p className="muted">Shared by all of this contact's searches. A chat is deleted 30 days after its last message.</p>
    </section>
    <section className="card" aria-labelledby="h-a-email">
      <h2 id="h-a-email">Email</h2>
      <p className="muted">Email conversations are not linked to applicants yet.</p>
    </section>
  </>;
}
