import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { safeHref } from './format.js';
import { confirmLeave, setUnsaved } from './unsaved.js';

const empty = () => ({ name: '', kind: 'agency', contacts: [], channels: [], source_ids: [], listing_ids: [], commission: '', photo_permission: '', commission_personal: true, photo_permission_personal: true, name_personal: true });
const copy = a => ({ ...a, contacts: a.contacts.map(c => ({ ...c, phones: c.phones.map(p => ({ ...p })) })), channels: a.channels.map(c => ({ ...c })) });
export default function Advertisers() {
  const [rows, setRows] = useState(null), [offset, setOffset] = useState(0), [more, setMore] = useState(false);
  const heading = useRef(null), errorSummary = useRef(null), addContact = useRef(null), addChannel = useRef(null);
  const [baseline, setBaseline] = useState(''), [form, setForm] = useState(null), [reviews, setReviews] = useState([]), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState(''), [fieldErrors, setFieldErrors] = useState({});
  const load = async n => { try { const d = await api(`/admin/advertisers?offset=${n}`); setRows(d.advertisers); setMore(d.more); setOffset(n); } catch(e) { setError(previous => previous ? `${previous} ${e.message}` : e.message); } };
  useEffect(() => { load(0); return () => setUnsaved(false); }, []);
  useEffect(() => { setUnsaved(!!form && (JSON.stringify(form) !== baseline || reason.length > 0)); }, [form, baseline, reason]);
  const formKey = form ? form.id ?? 'new' : null;
  useEffect(() => { if (formKey !== null) heading.current?.focus(); }, [formKey]);
  const open = async id => { setBusy(true); try { const d = await api(`/admin/advertisers/${id}`); setForm(copy(d.advertiser)); setBaseline(JSON.stringify(d.advertiser)); setReviews(d.reviews); setError(''); setFieldErrors({}); setMessage(''); setReason(''); requestAnimationFrame(() => heading.current?.focus()); } catch(e) { setError(e.message); } finally { setBusy(false); } };
  const change = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const contact = (i, key, value) => setForm(f => ({ ...f, contacts: f.contacts.map((c, n) => n === i ? { ...c, [key]: value } : c) }));
  const save = async e => {
    e.preventDefault(); setBusy(true); setError(''); setFieldErrors({}); setMessage('');
    try { const d = await api(form.id ? `/admin/advertisers/${form.id}` : '/admin/advertisers', { method: form.id ? 'PUT' : 'POST', body: form }); setForm(copy(d.advertiser)); setBaseline(JSON.stringify(d.advertiser)); setMessage('Advertiser saved.'); await load(offset); }
    catch(e) {
      const fields = e.data?.fields || {}; setFieldErrors(fields); setError(e.message); setBusy(false);
      const match = Object.keys(fields)[0];
      const id = match?.replaceAll('.', '-');
      requestAnimationFrame(() => (id && document.getElementById(`advertiser-${id}`) || errorSummary.current)?.focus());
    } finally { setBusy(false); }
  };
  const action = async (name) => {
    if (name === 'retain' ? (JSON.stringify(form) !== baseline && !confirm('You have unsaved changes. Leave without saving them?')) : !confirmLeave()) return;
    if (name === 'erase' && !confirm('Permanently remove personal information from this advertiser?')) return;
    setBusy(true); setError(''); setFieldErrors({}); setMessage('');
    try {
      const d = await api(`/admin/advertisers/${form.id}/${name}`, { method: 'POST', body: { version: form.version, reason } });
      setForm(copy(d.advertiser)); setBaseline(JSON.stringify(d.advertiser)); setReason(''); setReviews([]);
      setMessage(name === 'erase' ? 'Personal information removed.' : name === 'retain' ? 'Reason recorded.' : 'Activity recorded.');
      try { const refreshed = await api(`/admin/advertisers/${form.id}`); setReviews(refreshed.reviews); }
      catch(e) { setError(`Could not refresh review history: ${e.message}`); requestAnimationFrame(() => errorSummary.current?.focus()); }
      await load(offset);
    } catch(e) { setError(e.message); requestAnimationFrame(() => errorSummary.current?.focus()); } finally { setBusy(false); }
  };
  const listText = (key, text) => change(key, text.split('\n'));
  return <section className="advertiser-directory" aria-labelledby="advertisers-title">
    <h1 id="advertisers-title">Advertisers</h1>
    <p>Agencies, organisations and individuals who advertise properties.</p>
    <button type="button" disabled={busy} className="btn" onClick={() => { if (!confirmLeave()) return; const fresh = empty(); setForm(fresh); setBaseline(JSON.stringify(fresh)); setReviews([]); setReason(''); setFieldErrors({}); setError(''); setMessage(''); }}>Add advertiser</button>
    {error && <div><p role="alert" tabIndex={-1} ref={errorSummary} className="err">{error}</p>{rows === null && <button className="btn ghost sm" type="button" onClick={() => { setError(''); load(0); }}>Retry loading</button>}{form?.id && <button className="btn ghost sm" type="button" onClick={() => { if (confirmLeave()) open(form.id); }}>Reload record</button>}</div>}{message && <p role="status" className="ok">{message}</p>}
    {!rows ? (!error && <p>Loading advertisers…</p>) : rows.length === 0 ? <p className="empty">No advertisers on this page.</p> : <table className="list advertisers"><caption>Advertisers</caption><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Personal data review</th><th scope="col">Action</th></tr></thead><tbody>{rows.map(a => <tr key={a.id}><td>{a.name}</td><td data-label="Type">{a.kind}</td><td data-label="Personal data review">{a.erased ? 'Removed' : a.today >= a.due_on ? (a.last_review_action === 'retained' && a.last_review_on >= a.due_on ? 'Reason recorded' : 'Due for decision') : a.today >= a.review_on ? 'Review due' : `Review from ${a.review_on}`}</td><td><button className="btn ghost sm" type="button" disabled={busy} onClick={() => { if (confirmLeave()) open(a.id); }}>Open</button></td></tr>)}</tbody></table>}
    <p><button type="button" className="btn ghost sm" disabled={busy || offset === 0} onClick={() => load(Math.max(0, offset - 50))}>Previous</button>{' '}<button type="button" className="btn ghost sm" disabled={busy || !more} onClick={() => load(offset + 50)}>Next</button></p>
    {form && <div className="card"><h2 ref={heading} tabIndex={-1}>{form.id ? 'Advertiser details' : 'New advertiser'}</h2>
      {form.erased ? <><p>Personal information was removed. This record cannot be edited.</p>
        <dl><dt>Name</dt><dd>{form.name}</dd><dt>Commission discussion</dt><dd>{form.commission || 'None retained'}</dd><dt>Photo permission notes</dt><dd>{form.photo_permission || 'None retained'}</dd><dt>Research source IDs</dt><dd>{form.source_ids.join(', ') || 'None'}</dd><dt>Listing IDs</dt><dd>{form.listing_ids.join(', ') || 'None'}</dd></dl>
        {form.channels.map((c,i) => <p key={i}>{c.label}: {safeHref(c.url) ? <a href={safeHref(c.url)} target="_blank" rel="noopener noreferrer">{c.url}</a> : c.url}</p>)}</> : <form onSubmit={save}><fieldset disabled={busy}>
        <label>Name <input required maxLength={200} value={form.name} onChange={e => change('name',e.target.value)} /></label>
        <label><input type="checkbox" checked={form.kind === 'individual' || form.name_personal} disabled={form.kind === 'individual'} onChange={e => change('name_personal',e.target.checked)} /> Name identifies a person</label>
        <label>Type <select value={form.kind} onChange={e => change('kind',e.target.value)}><option value="agency">Agency</option><option value="entity">Organisation</option><option value="individual">Individual</option></select></label>
        <h3>Contacts and phones</h3>{form.contacts.map((c,i) => <fieldset key={i}><legend>Contact {i+1}</legend>
          <label>Name <input required maxLength={200} value={c.name} onChange={e => contact(i,'name',e.target.value)} /></label>
          <label>Email <input id={`advertiser-contacts-${i}-email`} aria-invalid={fieldErrors[`contacts.${i}.email`] ? "true" : undefined} aria-describedby={fieldErrors[`contacts.${i}.email`] ? `advertiser-contact-error-${i}` : undefined} type="email" maxLength={254} value={c.email} onChange={e => contact(i,'email',e.target.value)} /></label>{fieldErrors[`contacts.${i}.email`] && <small id={`advertiser-contact-error-${i}`} className="err">{fieldErrors[`contacts.${i}.email`]}</small>}
          {c.phones.map((p,j) => <div key={j}><label>Phone {j+1} label <input required value={p.label} maxLength={80} onChange={e => contact(i,'phones',c.phones.map((x,k) => j===k ? {...x,label:e.target.value} : x))} /></label><label>Number <input required type="tel" maxLength={80} value={p.number} onChange={e => contact(i,'phones',c.phones.map((x,k) => j===k ? {...x,number:e.target.value} : x))} /></label><button type="button" className="btn ghost sm" onClick={e => { const group = e.currentTarget.closest('fieldset'); contact(i,'phones',c.phones.filter((_,k)=>k!==j)); requestAnimationFrame(() => group?.querySelector('[data-add-phone]')?.focus()); }}>Remove phone {j+1}</button></div>)}
          <button type="button" className="btn ghost sm" data-add-phone onClick={() => contact(i,'phones',[...c.phones,{label:'',number:''}])}>Add phone</button>{' '}
          <button type="button" className="btn ghost sm" onClick={() => { change('contacts',form.contacts.filter((_,n)=>n!==i)); requestAnimationFrame(() => addContact.current?.focus()); }}>Remove contact {i+1}</button></fieldset>)}
        <button type="button" ref={addContact} className="btn ghost sm" onClick={() => change('contacts',[...form.contacts,{name:'',email:'',phones:[]}])}>Add contact</button>
        <h3>Websites and channels</h3>{form.channels.map((c,i) => <div key={i}><label>Channel {i+1} label <input required maxLength={100} value={c.label} onChange={e => change('channels',form.channels.map((x,n)=>n===i ? {...x,label:e.target.value}:x))} /></label><label>URL <input id={`advertiser-channels-${i}-url`} required type="url" maxLength={2048} aria-invalid={fieldErrors[`channels.${i}.url`] ? "true" : undefined} aria-describedby={fieldErrors[`channels.${i}.url`] ? `advertiser-channel-error-${i}` : undefined} value={c.url} onChange={e => change('channels',form.channels.map((x,n)=>n===i ? {...x,url:e.target.value}:x))} /></label>{fieldErrors[`channels.${i}.url`] && <small id={`advertiser-channel-error-${i}`} className="err">{fieldErrors[`channels.${i}.url`]}</small>}<label><input type="checkbox" checked={c.personal !== false} onChange={e => change('channels',form.channels.map((x,n)=>n===i ? {...x,personal:e.target.checked}:x))} /> Channel contains personal data</label>{safeHref(c.url) && <a href={safeHref(c.url)} target="_blank" rel="noopener noreferrer">Open channel</a>}{' '}<button type="button" className="btn ghost sm" onClick={() => { change('channels',form.channels.filter((_,n)=>n!==i)); requestAnimationFrame(() => addChannel.current?.focus()); }}>Remove channel {i+1}</button></div>)}
        <button type="button" ref={addChannel} className="btn ghost sm" onClick={() => change('channels',[...form.channels,{label:'',url:'',personal:true}])}>Add channel</button>
        <label>Research source IDs, one per line <textarea id="advertiser-source_ids" aria-invalid={fieldErrors.source_ids ? "true" : undefined} aria-describedby={fieldErrors.source_ids ? "advertiser-source-error" : undefined} value={form.source_ids.join('\n')} onChange={e => listText('source_ids',e.target.value)} /></label>{fieldErrors.source_ids && <small id="advertiser-source-error" className="err">{fieldErrors.source_ids}</small>}
        <label>Listing IDs, one per line <textarea id="advertiser-listing_ids" aria-invalid={fieldErrors.listing_ids ? "true" : undefined} aria-describedby={fieldErrors.listing_ids ? "advertiser-listing-error" : undefined} value={form.listing_ids.join('\n')} onChange={e => listText('listing_ids',e.target.value)} /></label>{fieldErrors.listing_ids && <small id="advertiser-listing-error" className="err">{fieldErrors.listing_ids}</small>}{form.deleted_listing_ids?.length > 0 && <p className="muted">Deleted listings retained as history: {form.deleted_listing_ids.join(', ')}</p>}
        <label>Commission discussion <textarea maxLength={2000} value={form.commission} onChange={e => change('commission',e.target.value)} /></label>
        <label><input type="checkbox" checked={form.commission_personal !== false} onChange={e => change('commission_personal',e.target.checked)} /> Commission notes contain personal data</label>
        <label>Photo permission notes <textarea maxLength={2000} value={form.photo_permission} onChange={e => change('photo_permission',e.target.value)} /></label>
        <label><input type="checkbox" checked={form.photo_permission_personal !== false} onChange={e => change('photo_permission_personal',e.target.checked)} /> Photo permission notes contain personal data</label>
        <p className="muted">Keep the personal-data boxes checked unless the text contains no personal information. Removal clears contacts and fields marked personal. Notes do not establish permission to publish individual photos.</p><button className="btn" disabled={busy}>Save advertiser</button>
      </fieldset></form>}
      {form.id && !form.erased && <section aria-labelledby="retention-heading"><fieldset disabled={busy}><h3 id="retention-heading">Personal data review</h3><p>Last activity: {form.activity_on}. Review from {form.review_on}; decision due {form.due_on}. No automatic deletion.</p><button type="button" className="btn ghost sm" disabled={busy} onClick={() => action('activity')}>Record activity today</button><label>Why are the personal details still needed for an open relationship or case? <textarea maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label><button type="button" className="btn ghost sm" disabled={busy || !reason.trim()} onClick={() => action('retain')}>Record reason</button>{' '}<button type="button" className="btn ghost sm danger" disabled={busy} onClick={() => action('erase')}>Remove personal data</button></fieldset></section>}
      {reviews.length > 0 && <><h3>Review history</h3><ul>{reviews.map((r,i) => <li key={i}>{r.created_at} · {r.action} · {r.actor}{r.reason && `: ${r.reason}`}</li>)}</ul></>}
    </div>}
  </section>;
}
