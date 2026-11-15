import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, safeHref } from "./format.js";
import { provenance } from "./ConfirmedAvailability.jsx";

// AGE-03: the shared enquiry about a property (server/consultations.js). For staff only. The app sends nothing: the
// panel gives the recipient and the text to copy, and a person records having sent it. Everything here stays empty
// until the server reports enabled (AGE03_ENQUIRIES_READY and migration 0077).
// AGE-05: when the server also reports send (AGE05_SEND_READY and migration 0080), a person chooses the advertiser's
// contact and may approve and queue one email for exactly that version. Without it, nothing below changes.
export const ENQUIRY = { manual_pending: ["attention", "To send manually"], sent: ["positive", "Sent manually"],
  queued: ["attention", "Queued by email"], needs_review: ["attention", "Awaiting email check"],
  awaiting_response: ["attention", "Awaiting a useful answer"], answered: ["positive", "Answered"], cancelled: ["neutral", "Cancelled"] };
// AGE-06: what the advertiser answered. answered: a clarification answered, which confirms no availability.
export const OUTCOME = { available: "Available", unavailable: "Not available", answered: "Clarification answered",
  more_info: "Needs more information from us", no_answer: "No useful answer (automatic reply, unclear or no reply)" };
const REASON = { sold: "Sold", let: "Let", under_offer: "Under offer", withdrawn: "Withdrawn by the owner", other: "Other" };
export const VIA = { phone: "Phone", email: "Email", in_person: "In person", message: "Message" };
export const KIND = { general: "Availability enquiry", clarification: "Clarification enquiry" };
const many = n => `${n} approved ${n === 1 ? "match" : "matches"}`;
const people = n => `${n} ${n === 1 ? "person" : "people"}`;
// This minute in the browser's own time zone, as a datetime-local input takes it.
const localNow = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

const Options = ({ advertisers }) => advertisers.map(a => <option key={a.id} value={a.id}>{a.name}</option>);
// AGE-05: how a contact is reached, and the contacts of the recipient chosen (to) that can be: the one this enquiry is for.
const reach = p => [p.name, p.email || p.phones.map(t => `${t.label} ${t.number}`).join(", ")].filter(Boolean).join(" · ");
function Contact({ advertisers, to, value, onChange }) {
  const contacts = advertisers.find(a => String(a.id) === to)?.contacts.filter(p => p.key) ?? [];
  return <label>Contact<select value={value} onChange={e => onChange(e.target.value)}>
    <option value="">{contacts.length ? "Not chosen" : "No contact with an email or a phone"}</option>
    {contacts.map(p => <option key={p.key} value={p.key}>{reach(p)}</option>)}</select></label>;
}
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
// onChange(consultation, match): after a change saved here. send (AGE-05): { email_stop } once sending is switched on.
// AGE-06: record what the advertiser answered to an enquiry that was sent. On a match card (match), it may also keep a
// note of what was said about that search's own household only.
function Answer({ c, id, match, onChange }) {
  const blank = () => ({ outcome: "", answered_at: localNow(), via: "", answered_by: "", scope: "property", reason: "", evidence_ref: "", note: "" });
  const [f, setF] = useState(blank), [errors, setErrors] = useState({}), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const operation = useRef(crypto.randomUUID()); // one id for this answer, retries included
  useEffect(() => { operation.current = crypto.randomUUID(); }, [c.status, c.response?.recorded_at]);
  const confirms = f.outcome === "available" || f.outcome === "unavailable";
  const field = k => ({ id: `${id}-a-${k}`, value: f[k], onChange: e => { setF(x => ({ ...x, [k]: e.target.value })); setErrors(({ [k]: _, ...x }) => x); },
    "aria-invalid": errors[k] ? true : undefined, "aria-describedby": errors[k] ? `${id}-ae-${k}` : undefined });
  const error = k => errors[k] && <small id={`${id}-ae-${k}`} className="err">{errors[k]}</small>;
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    const at = new Date(f.answered_at), note = f.note.trim();
    try {
      const d = await api(`/admin/consultations/${c.id}/response`, { method: "POST", body: { operation_id: operation.current, revision: c.revision,
        outcome: f.outcome, answered_at: Number.isFinite(at.getTime()) ? at.toISOString() : "", via: f.via, answered_by: f.answered_by,
        evidence_ref: f.evidence_ref, ...(confirms && { scope: f.scope }), ...(f.outcome === "unavailable" && { reason: f.reason }),
        ...(match && note && { case_notes: [{ match_id: match.id, note }] }) } });
      setErrors({}); setF(blank()); onChange?.(d.consultation);
    } catch (err) {
      const fields = err.data?.fields ?? {};
      setErrors({ ...fields, ...(fields.case_notes && { note: fields.case_notes }) }); setMsg({ text: err.message });
    } finally { setBusy(false); }
  };
  const outcomes = Object.entries(OUTCOME).filter(([k]) => k !== "answered" || c.kind === "clarification");
  return <form className="fields-group" onSubmit={submit} aria-label={`Record the answer to enquiry ${c.id}`} noValidate>
    <p><strong>Record the answer</strong> <span className="muted">· by email, phone, in person or message, once you have it</span></p>
    <div className="grid2">
      <label>What they answered<select {...field("outcome")}><option value="">Choose…</option>
        {outcomes.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{error("outcome")}</label>
      {f.outcome === "unavailable" && <label>Why it is not available<select {...field("reason")}><option value="">Choose…</option>
        {Object.entries(REASON).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{error("reason")}</label>}
      {confirms && <label>It covers<select {...field("scope")}><option value="property">The whole property</option>
        <option value="operation">Only this operation</option></select>{error("scope")}</label>}
      <label>Answered on (your time zone)<input type="datetime-local" max={localNow()} {...field("answered_at")} />{error("answered_at")}</label>
      <label>How they answered<select {...field("via")}><option value="">Choose…</option>
        {Object.entries(VIA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>{error("via")}</label>
      <label>Who answered<input maxLength={120} autoComplete="off" placeholder="e.g. Lettings desk" {...field("answered_by")} />{error("answered_by")}</label>
    </div>
    <label>Evidence reference<input maxLength={300} autoComplete="off" placeholder="e.g. Inbox, 15 Nov, 11:05, or call log" {...field("evidence_ref")} />{error("evidence_ref")}</label>
    {match && <label>Said about this search only (optional)<textarea maxLength={300} rows={2} {...field("note")} />{error("note")}</label>}
    <p className="muted">{confirms ? "This records a confirmation from the advertiser for the property, as on its Availability card. It does not accept "
      + "any client's own conditions or confirm a viewing." : "Say where the proof is kept; do not paste the message."}
      {match && " A note about this search stays on this match and is not shown for the property or any other search."}</p>
    <div className="inline"><button className="btn sm" disabled={busy}>Record answer</button></div>
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </form>;
}

export function EnquiryView({ c, advertisers, match, household, onChange, send }) {
  const id = `enq-${c.id}${match ? `-${match.id}` : ""}`, pending = c.status === "manual_pending", r = c.recipient;
  const gone = r.removed || r.unlinked; // another recipient must be chosen
  const [to, setTo] = useState(""), [who, setWho] = useState(""), [stated, setStated] = useState(false);
  const mail = c.contact?.email, emailRef = `HE-OUT-${c.email_ref}`, emailed = c.status === "sent" && c.email_ref;
  const [sent, setSent] = useState(() => ({ sent_at: localNow(), via: "", evidence_ref: "" }));
  const [errors, setErrors] = useState({}), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const operation = useRef(crypto.randomUUID()); // one id for this record of sending, retries included
  const takeBack = useRef(null); // one id per queued version taken back to manual sending, retries included
  useEffect(() => { setTo(gone ? "" : String(r.id)); setWho(c.contact?.key ?? ""); setStated(!!c.occupants_from_this_match); setErrors({});
    takeBack.current = crypto.randomUUID(); }, [c.id, c.revision, c.status, gone]);
  const run = async (action, done) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { const d = await action(); setErrors({}); setMsg({ ok: true, text: done }); onChange?.(d.consultation, d.match); }
    catch (e) { setErrors(e.data?.fields ?? {}); setMsg({ text: e.message }); }
    finally { setBusy(false); }
  };
  // The household stated stays as it is unless this card's own tick changes it.
  const keeps = c.occupants != null && !c.occupants_from_this_match;
  const put = occupants_match_id => api(`/admin/consultations/${c.id}`, { method: "PUT", body: { revision: c.revision, advertiser_id: Number(to),
    occupants_match_id, ...(send && { contact_key: who || null }) } });
  const save = e => { e.preventDefault(); run(() => put(stated ? match.id : keeps ? undefined : null), "Enquiry updated. Nothing has been sent."); };
  const drop = () => run(() => put(null), "Household size removed from the text.");
  // AGE-05: approve this version, queue its one email, or say what became of an email the service did not confirm.
  const act = (action, body, done) => run(() => api(`/admin/consultations/${c.id}/${action}`, { method: "POST", body: { revision: c.revision, ...body } }), done);
  const checked = sent => confirm(sent ? "Record this email as sent? The wait for an answer starts from when it was tried."
    : "Record this email as not sent? The enquiry goes back to be sent again, by a person or after a new approval.")
    && act("email-outcome", { sent }, sent ? "Recorded as sent by email." : "Recorded as not sent. Nothing has been sent.");
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
    <p id={`${id}-h`}><strong>{KIND[c.kind] ?? c.kind}</strong> <span className={`badge ${ENQUIRY[c.status]?.[0] ?? "neutral"}`}>
      {emailed ? "Sent by email" : ENQUIRY[c.status]?.[1] ?? c.status}</span></p>
    <p className="muted">{c.kind === "general" ? `One enquiry for this property, shared by ${many(c.matches)}.` : "Asks only about the must-have this property does not answer; it approves nothing."}
      {` Version ${c.revision} · prepared by ${c.prepared_by} · ${fmtDate(c.prepared_at)}.`}
      {c.occupants != null && ` It states one household of ${people(c.occupants)}${c.occupants_from_this_match ? ", this search's" : ""}.`}</p>
    {emailed ? <p>Sent {fmtDate(c.sent_at)} by email from the app{mail && ` to ${mail}`}{c.approval && ` · approved by ${c.approval.by}`} · sent by {c.sent_by}
        <span className="muted"> · Reference: {emailRef}</span></p>
      : c.sent_at && <p>Sent {fmtDate(c.sent_at)} by {(VIA[c.sent_via] ?? c.sent_via).toLowerCase()} · recorded by {c.sent_by}
        <span className="muted"> · Evidence: {c.sent_evidence_ref}</span></p>}
    {c.response && <p>Answer: <strong>{OUTCOME[c.response.outcome] ?? c.response.outcome}</strong>
      {` · ${fmtDate(c.response.at)} by ${(VIA[c.response.via] ?? c.response.via).toLowerCase()} · from ${c.response.from}`}
      {c.response.scope && ` · covers ${c.response.scope === "operation" ? "this operation" : "the whole property"}`}
      {` · recorded by ${c.response.by}`}<span className="muted"> · Evidence: {c.response.evidence_ref}</span></p>}
    {c.status === "answered" && <p className="muted">Answered: it takes no new match. A match approved from now on starts a new enquiry,
      which reuses the availability confirmed.</p>}
    {c.status === "queued" && <div className="fields-group" role="group" aria-label={`Queued email of enquiry ${c.id}`}>
      <p role="status">Email queued{mail && ` for ${mail}`} by {c.sent_by}. It is checked again just before it leaves, and goes back to you if it has not
        left within a day. <span className="muted">Reference: {emailRef}</span></p>
      {c.held ? <p className="req-note">{c.held}</p> : <p className="muted">It leaves within about ten minutes.</p>}
      <div className="inline"><button type="button" className="btn ghost sm" disabled={busy} onClick={() => confirm("Return this enquiry to manual sending? "
        + "Its email is cancelled if it has not left yet, and sending it again needs a new approval.") && act("return-to-manual",
        { operation_id: takeBack.current }, "Returned to manual sending. Nothing has been sent.")}>Return to manual sending</button></div>
    </div>}
    {c.status === "needs_review" && <div className="fields-group" role="group" aria-label={`Check the email of enquiry ${c.id}`}>
      <p className="req-note" role="alert">The email service did not confirm whether this email went out{mail && ` to ${mail}`} (reference {emailRef}). It is
        never sent again automatically. Check with the recipient, or in <a href="#/email">Email</a>, then say what happened.</p>
      <div className="inline"><button type="button" className="btn ghost sm" disabled={busy} onClick={() => checked(true)}>It was sent</button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => checked(false)}>It was not sent</button></div>
    </div>}
    {c.blocked && <p className="req-note" role="alert">{c.blocked}</p>}
    <div><strong>Recipient</strong>
      {r.removed ? <p className="muted">Personal data removed from the directory.</p> : <address>{r.name}
        {r.contacts.map((p, i) => <span key={i}><br />{[p.name, p.email, ...p.phones.map(t => `${t.label} ${t.number}`)].filter(Boolean).join(" · ")}</span>)}
        {r.channels.map((ch, i) => safeHref(ch.url) && <span key={i}><br /><a href={safeHref(ch.url)} target="_blank" rel="noopener noreferrer">{ch.label}</a></span>)}
        {!r.contacts.length && !r.channels.length && <span className="muted"><br />No contact details in the directory yet.</span>}</address>}
      {send && !r.removed && <p>Contact for this enquiry: {!c.contact ? <span className="muted">not chosen</span>
        : c.contact.missing ? <span className="muted">no longer in the directory as it was chosen</span> : reach(c.contact)}</p>}</div>
    <EnquiryText id={`${id}-text`} text={c.text} label={c.sent_at ? "Text sent" : "Text to send"} />
    {pending && <>
      {!send && <p className="muted">The app sends nothing. Copy the text, send it yourself, then record it below.</p>}
      {advertisers.length ? <form className="fields-group" onSubmit={save} aria-label={`Change enquiry ${c.id}`}>
        <div className="grid2"><label>Recipient<select value={to} onChange={e => { setTo(e.target.value); setWho(""); }} required>
          {gone && <option value="">Choose…</option>}<Options advertisers={advertisers} /></select></label>
          {send && <Contact advertisers={advertisers} to={to} value={who} onChange={setWho} />}</div>
        {c.kind === "general" && household != null && <label className="check"><input type="checkbox" checked={stated} onChange={e => setStated(e.target.checked)} />
          State this search's household size ({people(household)}); nothing else about the client is included</label>}
        <div className="inline"><button className="btn ghost sm" disabled={!to}>Save changes</button>
          {keeps && <button type="button" className="btn ghost sm" onClick={drop} disabled={!to}>Remove household size</button>}</div>
      </form> : gone && <NoRecipient />}
      {send && <div className="fields-group" role="group" aria-label={`Send enquiry ${c.id} by email`}>
        {send.email_stop ? <p className="muted">{send.email_stop}</p>
          : !mail ? <p className="muted">To send it from the app, choose a contact with an email address and save. By phone or in person, send it
            yourself and record it below.</p>
          : <>
            <p>{c.approval ? `Sending approved by ${c.approval.by} · ${fmtDate(c.approval.at)}, for this version only.`
              : `Approving confirms this recipient, ${mail} and this exact text. Any change after it needs a new approval.`}</p>
            <div className="inline">
              {!c.approval && <button type="button" className="btn ghost sm" disabled={busy || !!c.blocked}
                onClick={() => act("approve-sending", {}, "Sending approved. Nothing has been sent yet.")}>Approve sending</button>}
              <button type="button" className="btn sm" disabled={busy || !c.approval || !!c.blocked}
                onClick={() => act("send-email", {}, "Email queued.")}>Send by email</button>
              <span className="muted">One email to {mail}, only after approval. Or send it yourself and record it below.</span></div>
          </>}
      </div>}
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
    {c.can_answer && <Answer c={c} id={id} match={c.joined ? match : null} onChange={d => { setMsg({ ok: true, text: "Answer recorded." }); onChange?.(d); }} />}
    {c.can_cancel && <div className="inline"><button type="button" className="btn ghost sm" disabled={busy} onClick={() => confirm("Cancel this "
      + "enquiry? No approved match counts for it now. Its Inbox tasks are closed and nothing is sent.") && run(() => api(`/admin/consultations/${c.id}/cancel`,
      { method: "POST", body: { revision: c.revision } }), "Enquiry cancelled.")}>Cancel enquiry</button>
      <span className="muted">No approved match counts for it now.</span></div>}
    {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
  </div>;
}

// On a match card, once its button opens it: start the enquiry of this property, join the one already open, or show
// the one this match is part of. onChange(match): the card as it is after a change.
export function MatchEnquiry({ match, onChange }) {
  const id = `enq-new-${match.id}`, [d, setD] = useState(null), [failed, setFailed] = useState(null);
  const [to, setTo] = useState(""), [who, setWho] = useState(""), [stated, setStated] = useState(false), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
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
  if (c?.joined) return <EnquiryView c={c} advertisers={d.advertisers} match={match} household={d.occupants} send={d.send} onChange={() => load(true)} />;
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const made = await api(`/admin/matches/${match.id}/consultation`, { method: "POST", body: { operation_id: operation.current, kind: d.can,
        advertiser_id: Number(to) || undefined, include_occupants: stated || undefined, contact_key: (d.send && who) || undefined } });
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
      {d.advertisers.length ? <div className="grid2"><label>Recipient<select value={to} onChange={e => { setTo(e.target.value); setWho(""); }} required>
        <Options advertisers={d.advertisers} /></select></label>
        {d.send && <Contact advertisers={d.advertisers} to={to} value={who} onChange={setWho} />}</div> : <NoRecipient />}
      {d.occupants != null && <label className="check"><input type="checkbox" checked={stated} onChange={e => setStated(e.target.checked)} />
        State this search's household size ({people(d.occupants)}); nothing else about the client is included</label>}
      <EnquiryText id={`${id}-text`} text={stated ? d.preview.text_with_occupants : d.preview.text} label="Proposed text" />
      <p className="muted">It names the property and no client. Preparing it sends nothing: it waits in the Inbox to be sent by a person
        {d.send && !d.send.email_stop ? " or, once approved, by email from the app." : "."}</p>
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
      approved match, in a search's Matches; {d.send && !d.send.email_stop ? "the app sends only the version a person approves." : "the app sends nothing."}</p>
    {d.consultations.length ? d.consultations.map(c => <EnquiryView key={c.id} c={c} advertisers={d.advertisers} send={d.send} onChange={load} />)
      : <p className="muted">No enquiry has been prepared about this property yet.</p>}
  </section>;
}
