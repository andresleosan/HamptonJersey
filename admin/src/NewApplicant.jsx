import { useEffect, useRef, useState } from "react";
import { setUnsaved } from "./unsaved.js";
import { api } from "./api.js";
import { OPTIONS } from "../../server/applicants.js";
import ApplicantFields, { toForm, toBody } from "./ApplicantFields.jsx";

// The team never enters a "web" source: that one is the website's own form.
const SOURCES = OPTIONS.sources.filter(([v]) => v !== "web");
const EXTRA = { source: "", privacy: false, marketing: false };
const BLANK = JSON.stringify([toForm(), EXTRA]);

// contactId: from #/applicants/new?contact=<id>, a new search for a saved contact.
export default function NewApplicant({ contactId }) {
  const [form, setForm] = useState(toForm), [extra, setExtra] = useState(EXTRA);
  const [contact, setContact] = useState(null), [loadErr, setLoadErr] = useState(null);
  const [errors, setErrors] = useState({}), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  // A 409: the email or phone is a saved contact ({contact_id}) or that contact already has this search ({applicant_id}).
  const [found, setFound] = useState(null);
  const formRef = useRef(null);
  // Editing the form after a 409 takes back the offer: the email or phone may no longer be that contact's.
  const change = f => { setForm(f); setFound(null); };
  useEffect(() => {
    if (contactId) api(`/admin/contacts/${contactId}`).then(d => setContact(d.contact), e => setLoadErr(e.message));
  }, [contactId]);
  // Anything typed or ticked: leaving asks first (header links, the links below, closing the tab).
  const dirty = JSON.stringify([form, extra]) !== BLANK;
  useEffect(() => { setUnsaved(dirty); return () => setUnsaved(false); }, [dirty]);
  // After a refused save, the first highlighted field gets the focus.
  useEffect(() => { formRef.current?.querySelector("[aria-invalid=true]")?.focus(); }, [errors]);

  const submit = async withContact => {
    setBusy(true); setMsg(null); setFound(null);
    const body = { ...toBody(form), source: extra.source || null, ...(withContact
      ? { contact_id: withContact } : { privacy: extra.privacy, marketing: extra.marketing }) };
    try { const { id } = await api("/admin/applicants", { method: "POST", body }); setUnsaved(false); location.hash = `#/applicants/${id}`; }
    catch (x) {
      setErrors(x.data?.fields || {});
      if (x.status === 409 && (x.data?.contact_id || x.data?.applicant_id)) setFound({ text: x.message, ...x.data });
      else setMsg(x.message);
      setBusy(false);
    }
  };

  if (contactId && loadErr) return <p role="alert" className="err">{loadErr} · <a href="#/applicants/new">Start a new applicant instead</a></p>;
  if (contactId && !contact) return <p>Loading contact…</p>;
  const radio = (k, v, t) => <label key={v} className="check"><input type="radio" name={`n-${k}`} value={v} checked={extra[k] === v}
    aria-invalid={errors[k] ? true : undefined} aria-describedby={errors[k] ? `ae-${k}` : undefined}
    onChange={() => setExtra(x => ({ ...x, [k]: v }))} />{t}</label>;
  const tick = (k, label) => <label className="check"><input type="checkbox" checked={extra[k]}
    onChange={e => setExtra(x => ({ ...x, [k]: e.target.checked }))} />{label}</label>;

  // A div, not a section: the entrance animation of `.page>section` would make it the box the fixed action bar sits in.
  return <div>
    <div className="head"><h1 id="t-new-app">{contact ? `New search for ${contact.name}` : "New applicant"}</h1>
      <a href="#/applicants">← Back to applicants</a></div>
    <p className="muted">Required: {contact ? "" : "a name, an email or phone number, "}To Let or To Buy, and how they contacted us. Leave anything unknown blank.</p>
    <form ref={formRef} className="sections" noValidate onSubmit={e => { e.preventDefault(); submit(contact?.id); }}>
      <section className="card fields-group" aria-labelledby="g-source"><h2 id="g-source">How they contacted us</h2>
        <fieldset className="choices-set" aria-describedby={errors.source ? "ae-source" : undefined}><legend className="sr">Source</legend>
          <div className="choices">{SOURCES.map(([v, t]) => radio("source", v, t))}</div>
          {errors.source && <small id="ae-source" className="err">{errors.source}</small>}</fieldset>
      </section>
      <ApplicantFields value={form} onChange={change} errors={errors} operation={form.operation} contact={contact} />
      {!contact && <section className="card fields-group" aria-labelledby="g-consent"><h2 id="g-consent">Consent</h2>
        <p className="muted">Tick only what they agreed to. A box left unticked records nothing.</p>
        <div className="choices">
          {tick("privacy", "They were told how we use their details and accept the privacy notice")}
          {tick("marketing", "They agree to hear about new homes and news from Hampton Estates (optional)")}</div>
      </section>}

      <div className="actionbar" role="region" aria-label="Actions">
        {msg && <p role="alert" className="err">{msg}</p>}
        {found && <p role="alert" className="err">{found.text}</p>}
        {found?.contact_id && <>
          <button type="button" className="btn" disabled={busy} onClick={() => submit(found.contact_id)}>Add a new search for this contact</button>
          <span className="muted">Their saved contact details stay as they are.</span></>}
        {found?.applicant_id && <a className="btn ghost" href={`#/applicants/${found.applicant_id}`}>Open that search</a>}
        {!found?.contact_id && <button className="btn" disabled={busy}>{busy ? "Saving…" : contact ? "Add search" : "Add applicant"}</button>}
        <a className="btn ghost" href="#/applicants">Cancel</a>
      </div>
    </form>
  </div>;
}
