import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, safeHref } from "./format.js";
import { provenance } from "./ConfirmedAvailability.jsx";

// AGE-03: the shared enquiry about a property (server/consultations.js). For staff only. The app sends nothing: the
// panel gives the recipient and the text to copy, and a person records having sent it. Everything here stays empty
// until the server reports enabled (AGE03_ENQUIRIES_READY and migration 0077).
export const ENQUIRY = { manual_pending: ["attention", "To send manually"], sent: ["positive", "Sent manually"] };
export const VIA = { phone: "Phone", email: "Email", in_person: "In person", message: "Message" };
export const KIND = { general: "Availability enquiry", clarification: "Clarification enquiry" };
const many = n => `${n} approved ${n === 1 ? "match" : "matches"}`;
const people = n => `${n} ${n === 1 ? "person" : "people"}`;
// This minute in the browser's own time zone, as a datetime-local input takes it.
const localNow = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

const Options = ({ advertisers }) => advertisers.map(a => <option key={a.id} value={a.id}>{a.name}</option>);
const NoRecipient = () => <p className="req-note">No advertiser of this property is in the directory with its contact details. Add it in{" "}
  <a href="#/advertisers">Advertisers</a> and link this property, then come back.</p>;
// The text to copy. The clipboard needs the browser's permission: without it the text is selected instead.
function EnquiryText({ id, text, label = "Text to send" }) {
  const box = useRef(null), [said, setSaid] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setSaid("Text copied."); }
    catch { box.current?.select(); setSaid("Text selected: copy it with your keyboard."); }
  };
  return <>
    <label>{label}<textarea ref={box} id={id} readOnly value={text} /></label>
    <div className="inline"><button type="button" className="btn ghost sm" onClick={copy}>Copy text</button>
      <span role="status" className="muted">{said}</span></div>
  </>;
}

// One enquiry: who it goes to, what it says, and what a person may still do with it. advertisers: the recipients to
// choose from. match and household: the card it is shown on and the size of that search's household, if it has one.
// onChange(consultation, match): after a change saved here.
export function EnquiryView({ c, advertisers, match, household, onChange }) {
  const id = `enq-${c.id}${match ? `-${match.id}` : ""}`, pending = c.status === "manual_pending", r = c.recipient;
  const [to, setTo] = useState(""), [stated, setStated] = useState(false);
  const [sent, setSent] = useState(() => ({ sent_at: localNow(), via: "", evidence_ref: "" }));
  const [errors, setErrors] = useState({}), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const operation = useRef(crypto.randomUUID()); // one id for this record of sending, retries included
  useEffect(() => { setTo(r.removed ? "" : String(r.id)); setStated(!!c.occupants_from_this_match); setErrors({}); }, [c.id, c.revision, c.status]);
  const run = async (action, done) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const d = await action(); setErrors({}); setMsg({ ok: true, text: done }); onChange?.(d.consultation, d.match); }
    catch (e) { setErrors(e.data?.fields ?? {}); setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  // The household stated stays as it is unless this card's own tick changes it.
  const keeps = c.occupants != null && !c.occupants_from_this_match;
  const save = e => { e.preventDefault(); run(() => api(`/admin/consultations/${c.id}`, { method: "PUT", body: { revision: c.revision, advertiser_id: Number(to),
    occupants_match_id: stated ? match.id : keeps ? undefined : null } }), "Enquiry updated. Nothing has been sent."); };
  const drop = () => run(() => api(`/admin/consultations/${c.id}`, { method: "PUT", body: { revision: c.revision, advertiser_id: Number(to), occupants_match_id: null } }),
    "Household size removed from the text.");
  const record = e => {
    e.preventDefault();
    const at = new Date(sent.sent_at);
    run(() => api(`/admin/consultations/${c.id}/manual-send`, { method: "POST", body: { operation_id: operation.current, revision: c.revision,
      sent_at: Number.isFinite(at.getTime()) ? at.toISOString() : "", via: sent.via, evidence_ref: sent.evidence_ref } }), "Recorded as sent by you.");
  };
  const field = k => ({ value: sent[k], onChange: e => { setSent(s => ({ ...s, [k]: e.target.value })); setErrors(({ [k]: _, ...x }) => x); },
    "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `${id}-e-${k}` : undefined });
  const error = k => errors[k] && <small id={`${id}-e-${k}`} className="err">{errors[k]}</small>;

  return <div className="enquiry" role="group" aria-labelledby={`${id}-h`}>
    <p id={`${id}-h`}><strong>{KIND[c.kind] ?? c.kind}</strong> <span className={`badge ${ENQUIRY[c.status]?.[0] ?? "neutral"}`}>{ENQUIRY[c.status]?.[1] ?? c.status}</span></p>
    <p className="muted">{c.kind === "general" ? `One enquiry for this property, shared by ${many(c.matches)}.` : "Asks only about the must-have this property does not answer; it approves nothing."}
      {` Version ${c.revision} · prepared by ${c.prepared_by} · ${fmtDate(c.prepared_at)}.`}
      {c.occupants != null && ` It states one household of ${people(c.occupants)}${c.occupants_from_this_match ? ", this search's" : ""}.`}</p>
    {c.sent_at && <p>Sent {fmtDate(c.sent_at)} by {(VIA[c.sent_via] ?? c.sent_via).toLowerCase()} · recorded by {c.sent_by}
      <span className="muted"> · Evidence: {c.sent_evidence_ref}</span></p>}
    {c.blocked && <p className="req-note" role="alert">{c.blocked}</p>}
    <div><strong>Recipient</strong>
      {r.removed ? <p className="muted">Personal data removed from the directory.</p> : <address>{r.name}
        {r.contacts.map((p, i) => <span key={i}><br />{[p.name, p.email, ...p.phones.map(t => `${t.label} ${t.number}`)].filter(Boolean).join(" · ")}</span>)}
        {r.channels.map((ch, i) => safeHref(ch.url) && <span key={i}><br /><a href={safeHref(ch.url)} target="_blank" rel="noopener noreferrer">{ch.label}</a></span>)}
        {!r.contacts.length && !r.channels.length && <span className="muted"><br />No contact details in the directory yet.</span>}</address>}</div>
    <EnquiryText id={`${id}-text`} text={c.text} label={c.sent_at ? "Text sent" : "Text to send"} />
    {pending && <>
      <p className="muted">The app sends nothing. Copy the text, send it yourself, then record it below.</p>
      {advertisers.length ? <form className="fields-group" onSubmit={save} aria-label={`Change enquiry ${c.id}`}>
        <div className="grid2"><label>Recipient<select value={to} onChange={e => setTo(e.target.value)} required>
          {r.removed && <option value="">Choose…</option>}<Options advertisers={advertisers} /></select></label></div>
        {c.kind === "general" && household != null && <label className="check"><input type="checkbox" checked={stated} onChange={e => setStated(e.target.checked)} />
          State this search's household size ({people(household)}); nothing else about the client is included</label>}
        <div className="inline"><button className="btn ghost sm" disabled={!to}>Save changes</button>
          {keeps && <button type="button" className="btn ghost sm" onClick={drop} disabled={!to}>Remove household size</button>}</div>
      </form> : r.removed && <NoRecipient />}
      <form className="fields-group" onSubmit={record} aria-label={`Record enquiry ${c.id} as sent`} noValidate>
        <div className="grid2">
          <label>Sent on (your time zone)<input type="datetime-local" max={localNow()} {...field("sent_at")} />{error("sent_at")}</label>
          <label>How it was sent<select {...field("via")}><option value="">Choose…</option>
            {Object.entries(VIA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{error("via")}</label>
        </div>
        <label>Evidence reference<input maxLength={300} autoComplete="off" placeholder="e.g. Sent items, 14 Nov, 10:20" {...field("evidence_ref")} />{error("evidence_ref")}</label>
        <div className="inline"><button className="btn sm" disabled={!!c.blocked}>Record as sent by me</button>
          <span className="muted">Only after you have sent it. Say where the proof is kept; do not paste the message.</span></div>
      </form>
    </>}
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </div>;
}

// On a match card, once its button opens it: start the enquiry of this property, join the one already open, or show
// the one this match is part of. onChange(match): the card as it is after a change.
export function MatchEnquiry({ match, onChange }) {
  const id = `enq-new-${match.id}`, [d, setD] = useState(null), [failed, setFailed] = useState(null);
  const [to, setTo] = useState(""), [stated, setStated] = useState(false), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const operation = useRef(crypto.randomUUID());
  // notify: after a change saved here, the card is told how the match is now.
  const load = notify => api(`/admin/matches/${match.id}/consultation`).then(x => {
    setD(x); setFailed(null); setTo(v => v || String(x.advertisers?.[0]?.id ?? ""));
    if (notify) onChange?.(x.match);
  }, e => setFailed(e.message));
  // Again whenever the match's own state moves: an approval, a clarification or its enquiry.
  useEffect(() => { load(); }, [match.id, match.states.decision, match.states.enquiry, match.enquiry?.id]);
  if (failed) return <div className="enquiry"><p role="alert" className="err">{failed} <button type="button" className="btn ghost sm" onClick={() => load()}>Try again</button></p></div>;
  if (!d) return <div className="enquiry"><p role="status">Loading the enquiry…</p></div>;
  if (!d.enabled) return null;
  const c = d.consultation;
  if (c?.joined) return <EnquiryView c={c} advertisers={d.advertisers} match={match} household={d.occupants} onChange={() => load(true)} />;
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const made = await api(`/admin/matches/${match.id}/consultation`, { method: "POST", body: { operation_id: operation.current, kind: d.can,
        advertiser_id: Number(to) || undefined, include_occupants: stated || undefined } });
      setD(x => ({ ...x, consultation: made.consultation })); onChange?.(made.match);
    } catch (err) { setMsg(err.message); load(); }
    finally { setBusy(false); }
  };
  if (!d.can) return <div className="enquiry"><p className="muted">No enquiry can start from this match now: it needs a shortlist that covers the search and the
    property as they are today, or an approved clarification, on a property still offered.</p></div>;
  return <form className="enquiry" onSubmit={submit} aria-labelledby={`${id}-h`}>
    <p id={`${id}-h`}><strong>{KIND[d.can]}</strong></p>
    {d.availability?.status === "unavailable" ? <p className="req-note">This property was confirmed as not available ({provenance(d.availability)}), so no enquiry goes out.</p>
      : !c && d.availability?.status === "available" && d.can === "general" && <p className="muted">Availability already confirmed ({provenance(d.availability)}):
        the text asks only for viewing times. Each client's own conditions are not confirmed by it.</p>}
    {c ? <>
      <p>An enquiry about this property is already {ENQUIRY[c.status]?.[1].toLowerCase() ?? c.status}, shared by {many(c.matches)}. Joining adds this match to it: no second
        enquiry is made and its text does not change.</p>
      <EnquiryText id={`${id}-text`} text={c.text} label="Text of the shared enquiry" />
    </> : <>
      {d.advertisers.length ? <div className="grid2"><label>Recipient<select value={to} onChange={e => setTo(e.target.value)} required>
        <Options advertisers={d.advertisers} /></select></label></div> : <NoRecipient />}
      {d.occupants != null && <label className="check"><input type="checkbox" checked={stated} onChange={e => setStated(e.target.checked)} />
        State this search's household size ({people(d.occupants)}); nothing else about the client is included</label>}
      <EnquiryText id={`${id}-text`} text={stated ? d.preview.text_with_occupants : d.preview.text} label="Proposed text" />
      <p className="muted">It names the property and no client. Preparing it sends nothing: it waits in the Inbox to be sent by a person.</p>
    </>}
    <div className="inline"><button className="btn sm" disabled={d.availability?.status === "unavailable" || (!c && !d.advertisers.length)}>
      {c ? "Join enquiry" : "Create enquiry"}<span className="sr"> for {match.listing.title}</span></button></div>
    {msg && <p role="alert" className="err">{msg}</p>}
  </form>;
}

// The listing editor's card: every enquiry about this property, newest first. Where the Inbox task leads.
export default function ListingEnquiries({ listingId }) {
  const [d, setD] = useState(null);
  const load = () => api(`/admin/listings/${encodeURIComponent(listingId)}/consultations`).then(x => setD(x.enabled ? x : null), () => {});
  useEffect(() => { setD(null); load(); }, [listingId]);
  if (!d) return null;
  return <section id="s-enquiries" className="card fields-group" aria-labelledby="h-enquiries">
    <h2 id="h-enquiries">Enquiries <span className="muted">(internal)</span></h2>
    <p className="muted">For staff only. One enquiry per property is shared by every approved match of it, and names no client. It is prepared from an
      approved match, in a search's Matches; the app sends nothing.</p>
    {d.consultations.length ? d.consultations.map(c => <EnquiryView key={c.id} c={c} advertisers={d.advertisers} onChange={load} />)
      : <p className="muted">No enquiry has been prepared about this property yet.</p>}
  </section>;
}
