import { useEffect, useRef, useState } from "react";
import { setUnsaved } from "./unsaved.js";
import { api } from "./api.js";
import { OPTIONS } from "../../server/applicants.js";
import ApplicantFields, { toForm, toBody } from "./ApplicantFields.jsx";

// The team never enters a "web" source: that one is the website's own form.
const SOURCES = OPTIONS.sources.filter(([v]) => v !== "web");
const EXTRA = { source: "", privacy: false, marketing: false };
const BLANK = JSON.stringify([toForm(), EXTRA]);

// A chat opens a private proposal of its contact details. MSG-05 switched on (the draft says save_available), the form is
// editable and Save posts to the chat's own route with the chat's version and a key for this form, so a double click or
// a retry never creates a second applicant. Switched off, it stays read only.
export default function NewApplicant({ contactId, chatId }) {
  const fromChat = chatId != null;
  const validChat = fromChat && /^[1-9]\d*$/.test(chatId) && Number.isSafeInteger(Number(chatId)) && !contactId;
  const [form, setForm] = useState(toForm), [extra, setExtra] = useState(EXTRA);
  const [contact, setContact] = useState(null), [loadErr, setLoadErr] = useState(null), [draftLoaded, setDraftLoaded] = useState(false);
  // MSG-05: whether Save is on, the chat version the form was opened with, and why it can no longer save (chat changed).
  const [saveable, setSaveable] = useState(false), [chatVersion, setChatVersion] = useState(null), [chatChanged, setChatChanged] = useState(null);
  const opKey = useRef(null);
  const [errors, setErrors] = useState({}), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  // A 409: the email or phone is a saved contact ({contact_id}) or that contact already has this search ({applicant_id}).
  const [found, setFound] = useState(null);
  const formRef = useRef(null), baseline = useRef(BLANK);
  // PRE-10: switched on (the route answers), consent comes only from the website, so the marketing tick goes away.
  const [websiteConsentOnly, setWebsiteConsentOnly] = useState(false);
  useEffect(() => {
    let live = true;
    // Only an explicit 404 (switched off) keeps the tick: any other failure hides it, since the server ignores it when on.
    const websiteOnly = () => { if (live) { setWebsiteConsentOnly(true); setExtra(x => ({ ...x, marketing: false })); } };
    api("/admin/marketing/purposes").then(websiteOnly, e => { if (e?.status !== 404) websiteOnly(); });
    return () => { live = false; };
  }, []);
  // Editing the form after a 409 takes back the offer: the email or phone may no longer be that contact's.
  const change = f => { setForm(f); setFound(null); };
  useEffect(() => {
    if (contactId && !fromChat) api(`/admin/contacts/${contactId}`).then(d => setContact(d.contact), e => setLoadErr(e.message));
  }, [contactId, fromChat]);
  useEffect(() => {
    if (!validChat) return;
    let active = true, invalid = false, sequence = 0, initial = null;
    const clear = message => {
      invalid = true;
      const empty = toForm();
      baseline.current = JSON.stringify([empty, EXTRA]);
      setForm(empty); setExtra(EXTRA); setDraftLoaded(false); setLoadErr(message);
    };
    // With Save on, what was typed stays on screen; only saving stops.
    const changed = message => { invalid = true; setChatChanged(message); };
    const load = async () => {
      if (!active || invalid || document.visibilityState !== "visible") return;
      const request = ++sequence;
      try {
        const d = await api(`/admin/chats/${chatId}/applicant-draft`);
        if (!active || invalid) return;
        const c = d?.contact;
        if (d?.chat_id !== Number(chatId) || !c || typeof c.name !== "string" ||
            ![c.email, c.phone].every(v => v == null || typeof v === "string")) {
          clear("Couldn't load the chat details. Return to Messages and try again."); return;
        }
        const current = JSON.stringify([c.name, c.email, c.phone, d.chat_version]);
        if (initial !== null && initial !== current) {
          if (d.save_available === true) changed("This chat changed since you opened it (someone saved or linked its contact). Nothing was saved.");
          else clear("Chat details changed. Return to Messages and open them again.");
          return;
        }
        if (request !== sequence) return;
        if (initial === null) {
          initial = current;
          const proposal = toForm({}, { name: c.name, email: c.email, phone: c.phone });
          baseline.current = JSON.stringify([proposal, EXTRA]);
          const canSave = d.save_available === true && Number.isSafeInteger(d.chat_version);
          if (canSave) opKey.current = crypto.randomUUID();
          setSaveable(canSave); setChatVersion(d.chat_version);
          setForm(proposal); setDraftLoaded(true);
        }
      } catch (e) {
        if (!active || invalid) return;
        // Deletion is final for this never-reused chat ID, even if another request started later.
        if (e.status === 404) { clear("This chat is no longer available. Return to Messages."); return; }
        if (request !== sequence) return;
        clear("Couldn't refresh the chat details. Return to Messages and try again.");
      }
    };
    load();
    const timer = setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [chatId, validChat]);
  // Anything typed or ticked: leaving asks first (header links, the links below, closing the tab).
  const dirty = JSON.stringify([form, extra]) !== baseline.current;
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);
  // After a refused save, the first highlighted field gets the focus.
  useEffect(() => { formRef.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);

  const submit = async withContact => {
    if (fromChat && (!saveable || chatChanged)) return; // Never a fallback to the ordinary create route without the chat guard.
    if (!["selected", "any", "unknown"].includes(form.area_answer)) {
      setErrors({ area_answer: "Choose an area answer, or Not sure yet." });
      setMsg("Please check the highlighted field.");
      return;
    }
    setBusy(true); setMsg(null); setFound(null);
    const body = { ...toBody(form), source: extra.source || null, ...(withContact
      ? { contact_id: withContact } : { privacy: extra.privacy, marketing: extra.marketing }) };
    const [url, payload] = fromChat ? [`/admin/chats/${chatId}/applicant`, { ...body, version: chatVersion, operation_key: opKey.current }]
      : ["/admin/applicants", body];
    try { const { id } = await api(url, { method: "POST", body: payload }); setUnsaved(false); location.hash = `#/applicants/${id}`; }
    catch (x) {
      setErrors(x.data?.fields || {});
      if (x.status === 409 && (x.data?.contact_id || x.data?.applicant_id)) setFound({ text: x.message, ...x.data });
      else if (fromChat && (x.status === 409 || x.status === 404)) setChatChanged(x.message);
      else setMsg(x.message);
      setBusy(false);
    }
  };

  if (fromChat && !validChat) return <p role="alert" className="err">This chat link is invalid.<br /><a href="#/messages">Back to Messages</a></p>;
  if (fromChat && loadErr) return <p role="alert" className="err">{loadErr}<br /><a href="#/messages">Back to Messages</a></p>;
  if (fromChat && !draftLoaded) return <p>Loading chat details…</p>;
  if (contactId && loadErr) return <p role="alert" className="err">{loadErr}<br /><a href="#/applicants/new">Start a new applicant instead</a></p>;
  if (contactId && !contact) return <p>Loading contact…</p>;
  const radio = (k, v, t) => <label key={v} className="check"><input type="radio" name={`n-${k}`} value={v} checked={extra[k] === v}
    aria-invalid={errors[k] ? true : undefined} aria-describedby={errors[k] ? `ae-${k}` : undefined}
    onChange={() => setExtra(x => ({ ...x, [k]: v }))} />{t}</label>;
  const tick = (k, label) => <label className="check"><input type="checkbox" checked={extra[k]}
    onChange={e => setExtra(x => ({ ...x, [k]: e.target.checked }))} />{label}</label>;

  // A div, not a section: the entrance animation of `.page>section` would make it the box the fixed action bar sits in.
  return <div>
    <div className="head"><h1 id="t-new-app">{fromChat ? (saveable ? "Create applicant from chat" : "Review chat contact")
      : contact ? `New search for ${contact.name}` : "New applicant"}</h1>
      <a href="#/applicants">Back to applicants</a></div>
    {saveable && <p role="status" className="warn">The name, email and phone came from the chat. Check them and complete the search. Nothing is created until you press Save applicant.</p>}
    {fromChat && !saveable && <><p role="status" className="warn">These contact details came from the chat. Review only: creating an applicant from chat is not yet available. No applicant has been created.</p>
      <section className="card" aria-labelledby="g-chat-contact"><h2 id="g-chat-contact">Chat contact</h2>
        <p className="muted">Provided when the chat began; confirm these details before use.</p>
        <dl className="kv"><div><dt>Name</dt><dd>{form.name}</dd></div><div><dt>Email</dt><dd>{form.email || "Not provided"}</dd></div>
          <div><dt>Phone</dt><dd>{form.phone || "Not provided"}</dd></div></dl></section></>}
    <p className="muted">Required: {contact ? "" : "a name, an email or phone number, "}the operation, area answer and how they contacted us. Choose Not sure yet if the area is unknown.</p>
    <form ref={formRef} className="sections" noValidate onSubmit={e => { e.preventDefault(); submit(contact?.id); }}>
      <fieldset className="plain sections" disabled={fromChat && !saveable}><legend className="sr">Applicant details</legend>
      <section className="card fields-group" aria-labelledby="g-source"><h2 id="g-source">How they contacted us</h2>
        <fieldset className="choices-set" aria-describedby={errors.source ? "ae-source" : undefined}><legend className="sr">Source</legend>
          <div className="choices">{SOURCES.map(([v, t]) => radio("source", v, t))}</div>
          {errors.source && <small id="ae-source" className="err">{errors.source}</small>}</fieldset>
      </section>
      <ApplicantFields value={form} onChange={change} errors={errors} operation={form.operation} contact={contact} areaRequired />
      {!contact && <section className="card fields-group" aria-labelledby="g-consent"><h2 id="g-consent">Consent</h2>
        <p className="muted">Tick only what they agreed to. A box left unticked records nothing.</p>
        <div className="choices">
          {tick("privacy", "They were told how we use their details and accept the privacy notice")}
          {!websiteConsentOnly && tick("marketing", "They agree to hear about new homes and news from Hampton Estates (optional)")}</div>
      </section>}

      </fieldset>
      <div className="actionbar" role="region" aria-label="Actions">
        {msg && <p role="alert" className="err">{msg}</p>}
        {chatChanged && <p role="alert" className="err">{chatChanged} <a href="#/messages">Back to Messages</a></p>}
        {found && <p role="alert" className="err">{found.text}</p>}
        {found?.contact_id && <>
          <button type="button" className="btn" disabled={busy} onClick={() => submit(found.contact_id)}>Add a new search for this contact</button>
          <span className="muted">Their saved contact details stay as they are.</span></>}
        {found?.applicant_id && <a className="btn ghost" href={`#/applicants/${found.applicant_id}`}>Open that search</a>}
        {fromChat ? !found?.contact_id && <button className="btn" disabled={!saveable || busy || !!chatChanged}>{busy ? "Saving…" : "Save applicant"}</button>
          : !found?.contact_id && <button className="btn" disabled={busy}>{busy ? "Saving…" : contact ? "Add search" : "Add applicant"}</button>}
        <a className="btn ghost" href="#/applicants">Cancel</a>
      </div>
    </form>
  </div>;
}
