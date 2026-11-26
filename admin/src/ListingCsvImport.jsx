import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { LISTING_CSV_LIMIT, readListingCsv } from './listing-csv.js';

const APPLY_LIMIT = 10;
const LABEL = { ready: 'Ready', existing: 'Already in Listings', review: 'Needs review', created: 'Draft created' };

async function send(mode, rows) {
  const data = await api('/admin/listings/import', { method: 'POST', body: { mode, rows } });
  const ordered = data?.results?.slice().sort((a, b) => a.index - b.index);
  if (!ordered || ordered.length !== rows.length || ordered.some((result, index) =>
    result.index !== index || !Object.hasOwn(LABEL, result.status))) {
    throw new Error('The server did not return a complete receipt. Preview the file again to check the rows.');
  }
  return ordered;
}

export default function ListingCsvImport({ onClose, onImported }) {
  const [file, setFile] = useState(null), [results, setResults] = useState(null);
  const [showPaste, setShowPaste] = useState(false), [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState('');
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const counts = { ready: 0, existing: 0, review: 0, created: 0 };
  for (const result of results ?? []) counts[result.status]++;

  async function read(event) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected || running.current) return;
    running.current = true;
    setBusy(true); setError(''); setProgress(''); setFile(null); setResults(null);
    try {
      setFile({ name: selected.name, rows: readListingCsv(await selected.arrayBuffer()) });
    } catch (failure) {
      setError(failure.message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function usePastedCsv() {
    setError(''); setProgress(''); setFile(null); setResults(null);
    try {
      setFile({ name: 'Pasted CSV', rows: readListingCsv(new TextEncoder().encode(csvText)) });
      setCsvText(''); setShowPaste(false);
    } catch (failure) { setError(failure.message); }
  }

  async function preview() {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError(''); setProgress('Checking listings…');
    try {
      setResults(await send('preview', file.rows));
      setProgress('Preview complete.');
    } catch (failure) {
      setError(failure.message);
      setProgress('');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function apply() {
    if (running.current) return;
    const ready = results.filter(result => result.status === 'ready');
    if (!ready.length) return;
    running.current = true;
    setBusy(true); setError('');
    let saved = false;
    try {
      for (let offset = 0; offset < ready.length; offset += APPLY_LIMIT) {
        const chunk = ready.slice(offset, offset + APPLY_LIMIT);
        setProgress(`Checking and importing ${offset + 1}–${offset + chunk.length} of ${ready.length}…`);
        const receipt = await send('apply', chunk.map(result => file.rows[result.index]));
        if (!mounted.current) return;
        const byIndex = new Map(receipt.map((result, i) => {
          const index = chunk[i].index;
          return [index, { ...result, index }];
        }));
        setResults(current => current.map(result => byIndex.get(result.index) ?? result));
        saved ||= receipt.some(result => result.status === 'created');
      }
      setProgress('Import complete.');
    } catch (failure) {
      setProgress('Import stopped.');
      setError(`${failure.message} Preview again to check any rows whose receipt was lost, or retry the remaining ready rows.`);
    } finally {
      running.current = false;
      setBusy(false);
      if (saved && mounted.current) onImported?.();
    }
  }

  return <section id="listing-csv-panel" className="card fields-group" aria-labelledby="t-listing-import">
    <h2 id="t-listing-import">Import listings from CSV</h2>
    <p className="muted" id="listing-import-help">Choose up to {LISTING_CSV_LIMIT} rows. Preview checks existing listings and flags missing verified addresses. Ready rows are rechecked before they are saved as private drafts.</p>
    <label>Listings CSV<input type="file" accept=".csv,text/csv" aria-describedby="listing-import-help"
      autoFocus disabled={busy} onChange={read} /></label>
    <button type="button" className="btn ghost" disabled={busy} aria-expanded={showPaste}
      aria-controls="listing-import-paste" onClick={() => setShowPaste(!showPaste)}>Paste CSV</button>
    {showPaste && <div id="listing-import-paste">
      <label>CSV text<textarea rows={5} maxLength={1024 * 1024} value={csvText}
        disabled={busy} onChange={event => setCsvText(event.target.value)} /></label>
      <button type="button" className="btn ghost" disabled={!csvText.trim() || busy} onClick={usePastedCsv}>Use pasted CSV</button>
    </div>}
    {file && <p>{file.name} · {file.rows.length} rows</p>}
    <p className="inline actions">
      {file && <button type="button" className="btn ghost" disabled={busy} onClick={preview}>Preview import</button>}
      {counts.ready > 0 && <button type="button" className="btn" disabled={busy} onClick={apply}>Import {counts.ready} {counts.ready === 1 ? 'draft' : 'drafts'}</button>}
      <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Close</button>
    </p>
    {error && <p role="alert" className="err">{error}</p>}
    <p role="status" className="muted">{progress}</p>
    {results && <>
      <p>{counts.ready} ready · {counts.created} created · {counts.existing} already in Listings · {counts.review} to review</p>
      <div className="table-scroll import-rows" role="region" aria-label="Listing import results" tabIndex={0}>
        <table className="list small">
          <thead><tr><th scope="col">CSV row</th><th scope="col">Listing</th><th scope="col">Result</th><th scope="col">Details</th></tr></thead>
          <tbody>{results.map(result => {
            const row = file.rows[result.index];
            return <tr key={result.index}>
              <td>{result.index + 2}</td><td>{row.title || row.url || 'Unnamed listing'}</td>
              <td>{LABEL[result.status]}</td>
              <td>{result.listingId && <><a href={`#/p/${encodeURIComponent(result.listingId)}`}>{result.listingId}</a>{' '}</>}{result.reason}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
