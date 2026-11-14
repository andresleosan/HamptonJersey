import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { safeHref } from './format.js';
import { confirmLeave, setUnsaved } from './unsaved.js';

const empty = () => ({ name: '', kind: 'agency', contacts: [], channels: [], source_ids: [], listing_ids: [], commission: '', photo_permission: '' });
const copy = a => ({ ...a, contacts: a.contacts.map(c => ({ ...c, phones: c.phones.map(p => ({ ...p })) })), channels: a.channels.map(c => ({ ...c })) });
export default function Advertisers({ session }) {
  const [rows, setRows] = useState(null), [offset, setOffset] = useState(0), [more, setMore] = useState(false);
  useSyncExternalStore(session.subscribe, session.snapshot);
  const busy = session.busy;
  const begin = () => session.begin(), end = token => session.end(token);
  const heading = useRef(null), errorSummary = useRef(null), addContact = useRef(null), addChannel = useRef(null);
  const [ready, setReady] = useState(false), [checking, setChecking] = useState(false), [removal, setRemoval] = useState(null), [removalReason, setRemovalReason] = useState(''), removalHeading = useRef(null);
  const [baseline, setBaseline] = useState(''), [form, setForm] = useState(null), [reviews, setReviews] = useState([]), [error, setError] = useState(''), [message, setMessage] = useState(''), [reason, setReason] = useState(''), [fieldErrors, setFieldErrors] = useState({});
  const load = async n => { try { const d = await api(`/admin/advertisers?offset=${n}`); setRows(d.advertisers); setReady(!!d.suppression); setMore(d.more); setOffset(n); return true; } catch(e) { setError(previous => previous ? `${previous} ${e.message}` : e.message); return false; } };
  useEffect(() => { load(0); return () => setUnsaved(false); }, []);
  useEffect(() => { setUnsaved(!!form && (JSON.stringify(form) !== baseline || reason.length > 0)); }, [form, baseline, reason]);
  const formKey = form ? form.id ?? 'new' : null;
  useEffect(() => { if (formKey !== null) heading.current?.focus(); }, [formKey]);
  const open = async (id, note = '') => { const token = begin(); if (!token) return; try { const d = await api(`/admin/advertisers/${id}`);
    // AGE-14: a response that predates a removal this session knows about is discarded, never shown.
    if (!session.fresh(d.advertiser)) { setError('That response was out of date and was discarded. Open the record again.'); return; }
    setForm(copy(d.advertiser)); setBaseline(JSON.stringify(d.advertiser)); setReviews(d.reviews); setError(''); setFieldErrors({}); setMessage(note); setReason(''); setRemoval(null); setRemovalReason(''); requestAnimationFrame(() => heading.current?.focus()); } catch(e) { setError(e.message); } finally { end(token); } };
  // Removed in another tab: hide the open record at once and reload it from the server.
  const formStale = !!form?.id && !session.fresh(form);
  useEffect(() => { if (formStale) open(form.id, 'Personal data was removed from this record in another tab.'); }, [formStale]);
  // A missed message (suspended tab, offline, back navigation): hide until the server confirms what is current.
  const revalidate = async () => {
    setChecking(true); setError('');
    try { if (form?.id) { const d = await api(`/admin/advertisers/${form.id}`); if (d.advertiser.suppressed_at) session.removed(form.id); } }
    catch(e) { setError(`Could not check for changes: ${e.message}`); return; }
    if (await load(offset)) setChecking(false);
  };
  useEffect(() => {
    if (!ready) return;
    const hide = () => setChecking(true), check = () => { if (document.visibilityState !== 'hidden') revalidate(); };
    const visibility = () => document.visibilityState === 'hidden' ? hide() : check(), show = e => { if (e.persisted) { hide(); check(); } };
    document.addEventListener('visibilitychange', visibility); addEventListener('pagehide', hide); addEventListener('pageshow', show); addEventListener('offline', hide); addEventListener('online', check);
    return () => { document.removeEventListener('visibilitychange', visibility); removeEventListener('pagehide', hide); removeEventListener('pageshow', show); removeEventListener('offline', hide); removeEventListener('online', check); };
  }, [ready, form?.id, offset]);
  const change = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const contact = (i, key, value) => setForm(f => ({ ...f, contacts: f.contacts.map((c, n) => n === i ? { ...c, [key]: value } : c) }));
  const save = async e => {
    e.preventDefault(); const token = begin(); if (!token) return; setError(''); setFieldErrors({}); setMessage('');
    try { const d = await api(form.id ? `/admin/advertisers/${form.id}` : '/admin/advertisers', { method: form.id ? 'PUT' : 'POST', body: form }); if (!session.fresh(d.advertiser)) return; setForm(copy(d.advertiser)); setBaseline(JSON.stringify(d.advertiser)); setMessage('Advertiser saved.'); await load(offset); }
    catch(e) {
      const fields = e.data?.fields || {}; setFieldErrors(fields); setError(e.message);
      const match = Object.keys(fields)[0];
      const id = match?.replaceAll('.', '-');
      requestAnimationFrame(() => (id && document.getElementById(`advertiser-${id}`) || errorSummary.current)?.focus());
    } finally { end(token); }
  };
  const action = async (name) => {
    if (session.busy) return;
    if (name === 'retain' ? (JSON.stringify(form) !== baseline && !confirm('You have unsaved changes. Leave without saving them?')) : !confirmLeave()) return;
    const token = begin(); if (!token) return; setError(''); setFieldErrors({}); setMessage('');
    try {
      const d = await api(`/admin/advertisers/${form.id}/${name}`, { method: 'POST', body: { version: form.version, reason } });
      setRows(rows => rows?.map(row => row.id === d.advertiser.id ? d.advertiser : row) ?? rows);
      setForm(copy(d.advertiser)); setBaseline(JSON.stringify(d.advertiser)); setReason(''); setReviews([]);
      setMessage(name === 'retain' ? 'Reason recorded.' : 'Activity recorded.');
      try { const refreshed = await api(`/admin/advertisers/${form.id}`); setReviews(refreshed.reviews); }
      catch(e) { setError(`Could not refresh review history: ${e.message}`); requestAnimationFrame(() => errorSummary.current?.focus()); }
      await load(offset);
    } catch(e) { setError(e.message); requestAnimationFrame(() => errorSummary.current?.focus()); } finally { end(token); }
  };
  const previewShown = !!removal && !removal.loading;
  useEffect(() => { if (previewShown) removalHeading.current?.focus(); }, [previewShown]);
  const review = async () => {
    if (!confirmLeave()) return;
    const token = begin(); if (!token) return; setError(''); setMessage(''); setRemovalReason(''); setRemoval({ loading: true });
    try { setRemoval(await api(`/admin/advertisers/${form.id}/suppression`)); }
    catch(e) { setRemoval(null); setError(e.message); requestAnimationFrame(() => errorSummary.current?.focus()); } finally { end(token); }
  };
  const remove = async () => {
    const token = begin(); if (!token) return; setError(''); setMessage('');
    try {
      const d = await api(`/admin/advertisers/${form.id}/suppression`, { method: 'POST', body: { version: removal.version, preview_hash: removal.preview_hash, reason: removalReason } });
      session.removed(form.id); // first: tells other tabs and discards older responses here
      setRows(rows => rows?.map(row => row.id === d.advertiser.id ? d.advertiser : row) ?? rows);
      setForm(copy(d.advertiser)); setBaseline(JSON.stringify(d.advertiser)); setReason(''); setRemoval(null); setRemovalReason('');
      requestAnimationFrame(() => heading.current?.focus());
      setMessage(d.already ? 'Personal data had already been removed.' : d.complete ? 'Personal data removed.' : 'Personal data removed from the directory. The copies listed in the review stay where they are.');
      try { const refreshed = await api(`/admin/advertisers/${form.id}`); if (session.fresh(refreshed.advertiser)) setReviews(refreshed.reviews); }
      catch(e) { setError(`Could not refresh review history: ${e.message}`); }
      await load(offset);
    } catch(e) { if (e.status === 409) setRemoval(null); setError(e.message); requestAnimationFrame(() => errorSummary.current?.focus()); } finally { end(token); }
  };
  const listText = (key, text) => change(key, text.split('\n'));
  const locked = !!form?.suppressed_at, shown = rows?.filter(session.fresh);
  return <section className="advertiser-directory" aria-labelledby="advertisers-title">
    <h1 id="advertisers-title">Advertisers</h1>
    <p>Agencies, organisations and individuals who advertise properties.</p>
    <button type="button" disabled={busy || checking} className="btn" onClick={() => { if (!confirmLeave()) return; const fresh = empty(); setForm(fresh); setBaseline(JSON.stringify(fresh)); setReviews([]); setReason(''); setFieldErrors({}); setError(''); setMessage(''); }}>Add advertiser</button>
    {error && <div><p role="alert" tabIndex={-1} ref={errorSummary} className="err">{error}</p>{rows === null && <button className="btn ghost sm" type="button" onClick={() => { setError(''); load(0); }}>Retry loading</button>}{checking && <button className="btn ghost sm" type="button" onClick={revalidate}>Check again</button>}{form?.id && !checking && <button className="btn ghost sm" type="button" disabled={busy} onClick={() => { if (confirmLeave()) open(form.id); }}>Reload record</button>}</div>}{checking && !error && <p role="status">Checking for changes…</p>}{message && <p role="status" className="ok">{message}</p>}
    {checking ? null : !rows ? (!error && <p>Loading advertisers…</p>) : shown.length === 0 ? <p className="empty">No advertisers on this page.</p> : <table className="list advertisers"><caption>Advertisers</caption><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Personal data review</th><th scope="col">Action</th></tr></thead><tbody>{shown.map(a => <tr key={a.id}><td>{a.name}</td><td data-label="Type">{a.kind}</td><td data-label="Personal data review">{a.suppressed_at ? 'Personal data removed' : a.today >= a.due_on ? (a.last_review_action === 'retained' && a.last_review_on >= a.due_on ? 'Reason recorded' : 'Due for decision') : a.today >= a.review_on ? 'Review due' : `Review from ${a.review_on}`}</td><td><button className="btn ghost sm" type="button" disabled={busy} onClick={() => { if (confirmLeave()) open(a.id); }}>Open</button></td></tr>)}</tbody></table>}
    <p><button type="button" className="btn ghost sm" disabled={busy || offset === 0} onClick={() => load(Math.max(0, offset - 50))}>Previous</button>{' '}<button type="button" className="btn ghost sm" disabled={busy || !more} onClick={() => load(offset + 50)}>Next</button></p>
    {form && !formStale && !checking && <div className="card"><h2 ref={heading} tabIndex={-1}>{form.id ? 'Advertiser details' : 'New advertiser'}</h2>
      {locked && <p>Personal data was removed on <time dateTime={form.suppressed_at}>{form.suppressed_at.slice(0, 10)}</time>. Listings, sources and the review history are kept; the record can no longer be changed.</p>}
      <form onSubmit={save}><fieldset disabled={busy || locked}>
        <label>Name <input required maxLength={200} value={form.name} onChange={e => change('name',e.target.value)} /></label>
        <label>Type <select value={form.kind} onChange={e => change('kind',e.target.value)}><option value="agency">Agency</option><option value="entity">Organisation</option><option value="individual">Individual</option></select></label>
        <h3>Contacts and phones</h3>{form.contacts.map((c,i) => <fieldset key={i}><legend>Contact {i+1}</legend>
          <label>Name <input required maxLength={200} value={c.name} onChange={e => contact(i,'name',e.target.value)} /></label>
          <label>Email <input id={`advertiser-contacts-${i}-email`} aria-invalid={fieldErrors[`contacts.${i}.email`] ? "true" : undefined} aria-describedby={fieldErrors[`contacts.${i}.email`] ? `advertiser-contact-error-${i}` : undefined} type="email" maxLength={254} value={c.email} onChange={e => contact(i,'email',e.target.value)} /></label>{fieldErrors[`contacts.${i}.email`] && <small id={`advertiser-contact-error-${i}`} className="err">{fieldErrors[`contacts.${i}.email`]}</small>}
          {c.phones.map((p,j) => <div key={j}><label>Phone {j+1} label <input required value={p.label} maxLength={80} onChange={e => contact(i,'phones',c.phones.map((x,k) => j===k ? {...x,label:e.target.value} : x))} /></label><label>Number <input required type="tel" maxLength={80} value={p.number} onChange={e => contact(i,'phones',c.phones.map((x,k) => j===k ? {...x,number:e.target.value} : x))} /></label><button type="button" className="btn ghost sm" onClick={e => { const group = e.currentTarget.closest('fieldset'); contact(i,'phones',c.phones.filter((_,k)=>k!==j)); requestAnimationFrame(() => group?.querySelector('[data-add-phone]')?.focus()); }}>Remove phone {j+1}</button></div>)}
          <button type="button" className="btn ghost sm" data-add-phone onClick={() => contact(i,'phones',[...c.phones,{label:'',number:''}])}>Add phone</button>{' '}
          <button type="button" className="btn ghost sm" onClick={() => { change('contacts',form.contacts.filter((_,n)=>n!==i)); requestAnimationFrame(() => addContact.current?.focus()); }}>Remove contact {i+1}</button></fieldset>)}
        <button type="button" ref={addContact} className="btn ghost sm" onClick={() => change('contacts',[...form.contacts,{name:'',email:'',phones:[]}])}>Add contact</button>
        <h3>Websites and channels</h3>{form.channels.map((c,i) => <div key={i}><label>Channel {i+1} label <input required maxLength={100} value={c.label} onChange={e => change('channels',form.channels.map((x,n)=>n===i ? {...x,label:e.target.value}:x))} /></label><label>URL <input id={`advertiser-channels-${i}-url`} required type="url" maxLength={2048} aria-invalid={fieldErrors[`channels.${i}.url`] ? "true" : undefined} aria-describedby={fieldErrors[`channels.${i}.url`] ? `advertiser-channel-error-${i}` : undefined} value={c.url} onChange={e => change('channels',form.channels.map((x,n)=>n===i ? {...x,url:e.target.value}:x))} /></label>{fieldErrors[`channels.${i}.url`] && <small id={`advertiser-channel-error-${i}`} className="err">{fieldErrors[`channels.${i}.url`]}</small>}{safeHref(c.url) && <a href={safeHref(c.url)} target="_blank" rel="noopener noreferrer">Open channel</a>}{' '}<button type="button" className="btn ghost sm" onClick={() => { change('channels',form.channels.filter((_,n)=>n!==i)); requestAnimationFrame(() => addChannel.current?.focus()); }}>Remove channel {i+1}</button></div>)}
        <button type="button" ref={addChannel} className="btn ghost sm" onClick={() => change('channels',[...form.channels,{label:'',url:''}])}>Add channel</button>
        <label>Research source IDs, one per line <textarea id="advertiser-source_ids" aria-invalid={fieldErrors.source_ids ? "true" : undefined} aria-describedby={fieldErrors.source_ids ? "advertiser-source-error" : undefined} value={form.source_ids.join('\n')} onChange={e => listText('source_ids',e.target.value)} /></label>{fieldErrors.source_ids && <small id="advertiser-source-error" className="err">{fieldErrors.source_ids}</small>}
        <label>Listing IDs, one per line <textarea id="advertiser-listing_ids" aria-invalid={fieldErrors.listing_ids ? "true" : undefined} aria-describedby={fieldErrors.listing_ids ? "advertiser-listing-error" : undefined} value={form.listing_ids.join('\n')} onChange={e => listText('listing_ids',e.target.value)} /></label>{fieldErrors.listing_ids && <small id="advertiser-listing-error" className="err">{fieldErrors.listing_ids}</small>}{form.deleted_listing_ids?.length > 0 && <p className="muted">Deleted listings retained as history: {form.deleted_listing_ids.join(', ')}</p>}
        <label>Commission discussion <textarea maxLength={2000} value={form.commission} onChange={e => change('commission',e.target.value)} /></label>
        <label>Photo permission notes <textarea maxLength={2000} value={form.photo_permission} onChange={e => change('photo_permission',e.target.value)} /></label>
        <p className="muted">Notes do not establish permission to publish individual photos.</p>{!locked && <button className="btn" disabled={busy}>Save advertiser</button>}
      </fieldset></form>
      {form.id && !locked && <section aria-labelledby="retention-heading"><fieldset disabled={busy}><h3 id="retention-heading">Personal data review</h3><p>Last activity: {form.activity_on}. Review from {form.review_on}; decision due {form.due_on}. {ready ? 'When a decision is due, record why the details are still needed or remove them.' : 'Record why details are needed when a decision is due. Deletion is not available in this app.'}</p><button type="button" className="btn ghost sm" disabled={busy} onClick={() => action('activity')}>Record activity today</button><label>Why are the personal details still needed for an open relationship or case? <textarea maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label><button type="button" className="btn ghost sm" disabled={busy || !reason.trim()} onClick={() => action('retain')}>Record reason</button>{ready && !removal && <>{' '}<button type="button" id="advertiser-review-removal" className="btn ghost sm" disabled={busy} onClick={review}>Review removal of personal data</button></>}</fieldset>
        {removal?.loading && <p role="status">Checking where these details are held…</p>}
        {removal && !removal.loading && <Removal preview={removal} heading={removalHeading} busy={busy} reason={removalReason} setReason={setRemovalReason} onRemove={remove} onCancel={() => { setRemoval(null); requestAnimationFrame(() => document.getElementById('advertiser-review-removal')?.focus()); }} />}</section>}
      {reviews.length > 0 && <><h3>Review history</h3><ul className="advertiser-review-history">{reviews.map((r,i) => <li key={i}><div className="advertiser-review-meta"><time dateTime={r.created_at}>{r.created_at}</time><span>{r.action}</span><span>{r.actor}</span></div>{r.reason && <p>{r.reason}</p>}</li>)}</ul></>}
    </div>}
  </section>;
}

const SOURCES = { outbound_pending: 'Emails waiting to be sent to these addresses', outbound_sent: 'Sent or failed emails to these addresses',
  email_inbound: 'Received emails from or to these addresses', research_sources: 'Linked research sources naming this person',
  market_observations: 'Market observations containing these emails or phones' };
const HANDLING = { cancelled_on_removal: 'cancelled with the removal', kept_by_email_retention: 'kept until email retention removes them',
  kept_with_source: 'kept with their source', could_not_check: 'could not be checked' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// AGE-14 confirmation step: says what goes, what stays and which copies elsewhere are not removed.
function Removal({ preview: p, heading, busy, reason, setReason, onRemove, onCancel }) {
  const count = re => p.affected_fields.filter(f => re.test(f)).length;
  const parts = [p.affected_fields.includes('name') && "the individual's name", count(/^contacts\.\d+\.name$/) && plural(count(/^contacts\.\d+\.name$/), 'contact name'),
    count(/\.email$/) && plural(count(/\.email$/), 'email'), count(/\.phones\./) && plural(count(/\.phones\./), 'phone number')].filter(Boolean);
  const copies = p.related_materializations.filter(m => m.handling === 'could_not_check' || m.count > 0);
  return <div className="advertiser-removal" role="group" aria-labelledby="removal-heading">
    <h3 id="removal-heading" ref={heading} tabIndex={-1}>Remove personal data</h3>
    <p>{parts.length ? `This removes ${parts.join(', ')}. It cannot be undone.` : 'There are no personal details left to remove.'}</p>
    <p>Kept: type, channels, research sources, listings, commission and photo notes, and the review history. Edit the notes and channels first if they contain personal details.</p>
    {copies.length > 0 && <><p>Other copies in this app:</p><ul>{copies.map(m => <li key={m.source}>{SOURCES[m.source]}: {m.count ?? 'unknown'}, {HANDLING[m.handling]}.</li>)}</ul></>}
    <p className={p.complete ? undefined : 'warn'}>{p.complete ? 'No other copies were found in this app.' : 'This is not a complete removal: the copies above stay where they are.'} Backups and copies outside this app are not covered.</p>
    <fieldset disabled={busy}><legend>Reason for removal</legend>
      <label><input type="radio" name="removal-reason" value="no_longer_needed" checked={reason === 'no_longer_needed'} onChange={e => setReason(e.target.value)} /> No longer needed after review</label>
      <label><input type="radio" name="removal-reason" value="person_request" checked={reason === 'person_request'} onChange={e => setReason(e.target.value)} /> The person asked for removal</label>
    </fieldset>
    <button type="button" className="btn" disabled={busy || !reason} onClick={onRemove}>Remove personal data permanently</button>{' '}
    <button type="button" className="btn ghost sm" disabled={busy} onClick={onCancel}>Cancel</button>
  </div>;
}
