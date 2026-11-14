import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate, OPERATION, safeHref } from "./format.js";

// What a channel has contributed to this batch. A channel that was not read says so: it is never shown as empty.
const reading = s => s.status === "complete" ? `Fully read, ${s.listings} listings`
  : s.listings != null ? `${s.listings} ${s.listings === 1 ? "listing" : "listings"} recorded, not a full pass`
  : s.access_status === "denied" ? "Not permitted, not read"
  : s.access_status === "paused" ? "Paused, not read"
  : s.method === "manual" ? "Waiting for a manual upload, not read"
  : s.method === "http" ? "Waiting for its reader, not read"
  : "Waiting for access review, not read";
const EXAMPLE = JSON.stringify([{ external_key: "REF-123", source_at: "2026-11-14T10:15:00.000Z",
  listing_url: "https://www.example.je/properties/ref-123", observation: { country_code: "JE",
    territory_evidence: "Address on the listing: St Helier, Jersey", operation: "rent", observed_at: "2026-11-14T10:15:00.000Z",
    title: "Two bedroom flat", parish: "St Helier", bedrooms: 2, bathrooms: 1,
    financial_terms: [{ kind: "rent", amount_minor: 150000, currency: "GBP", period: "month", raw_text: "£1,500 pcm" }] } }], null, 1);

const label = value => ({ own_pilot: "Internal pilot", initial: "Initial", daily: "Daily", open: "Open", paused: "Paused",
  completed: "Completed", partial: "Partial", cancelled: "Cancelled", pending: "Pending", running: "Running",
  manual_pending: "Manual review pending", blocked: "Blocked", complete: "Complete", failed: "Failed",
  allowed: "Allowed", manual_only: "Manual only", denied: "Denied", internal: "Internal", manual: "Manual", http: "Automatic" }[value] || "Unknown");

// Refresh only while the page is visible; invalidate stale responses when page or selection changes.
function usePage(path, validate, every = 30000) {
  const [result, setResult] = useState({ loading: true }), [retry, setRetry] = useState(0), shown = useRef(null);
  useEffect(() => {
    let alive = true, sequence = 0;
    // A reload of the same page keeps what is on screen (and any form inside it) until the answer arrives.
    if (shown.current !== path) setResult({ loading: true });
    shown.current = path;
    const load = () => {
      const request = ++sequence;
      api(path).then(data => {
        if (!validate(data)) throw new Error("Unexpected response");
        if (alive && request === sequence) setResult({ data });
      }).catch(error => {
        // A failed refresh keeps the page already shown, so a form being filled in is not lost.
        if (alive && request === sequence) setResult(old => old.data ? old : { error });
      });
    };
    const refresh = () => { if (!document.hidden) load(); };
    load();
    const timer = every && setInterval(refresh, every);
    document.addEventListener("visibilitychange", refresh);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [path, retry, validate, every]);
  return [result, () => setRetry(n => n + 1)];
}
const runsValid = data => data && Array.isArray(data.runs) && (data.next === null || typeof data.next === "string");
const coverageValid = data => data && data.run && Array.isArray(data.sources) && data.overall &&
  (data.next === null || typeof data.next === "string");
const manifestsValid = data => data && Array.isArray(data.manifests);
const pathAfter = (path, after) => after ? `${path}?after=${encodeURIComponent(after)}` : path;

function PageControls({ previous, next, onPrevious, onNext, noun }) {
  return <div className="inline" role="group" aria-label={`${noun} pages`}>
    <button type="button" className="btn ghost sm" disabled={!previous} onClick={onPrevious}>Previous page</button>
    <button type="button" className="btn ghost sm" disabled={!next} onClick={onNext}>Next page</button>
  </div>;
}
function LoadState({ state, retry, unavailable = false }) {
  if (state.loading) return <p role="status">Loading…</p>;
  if (!state.error) return null;
  if (unavailable && state.error.status === 404) return <p>Market inventory is not available yet.</p>;
  return <div role="alert"><p>Couldn't load market inventory. Please try again.</p>
    <button type="button" className="btn ghost sm" onClick={retry}>Try again</button></div>;
}

export default function MarketInventory() {
  const [pages, setPages] = useState([null]), [selected, setSelected] = useState(null);
  const after = pages.at(-1), [state, retry] = usePage(pathAfter("/admin/market/runs", after), runsValid);
  const changePage = next => { setSelected(null); setPages(p => next ? [...p, next] : p.slice(0, -1)); };
  const [busy, setBusy] = useState(false), [note, setNote] = useState(null);
  // Pause, resume or close one batch. The version makes a stale button a refusal, never a second change.
  const act = async (run, action) => {
    if (action === "close" && !confirm("Close this batch? Uploads to it stop and its history is kept. You can then start the next batch.")) return;
    setBusy(true); setNote(null);
    try { await api(`/admin/market/runs/${encodeURIComponent(run.id)}/${action}`, { method: "POST", body: { version: run.version, operation_id: crypto.randomUUID() } }); }
    catch (error) { setNote(error.status === 409 ? "That batch had already changed. The list is up to date now." : "Couldn't change the batch. Please try again."); }
    finally { setBusy(false); retry(); }
  };
  return <article className="card" aria-labelledby="a-market" style={{ overflowWrap: "anywhere" }}>
    <h2 id="a-market">Market inventory</h2>
    <p className="muted">Review recorded inventory runs and their source coverage. An unknown coverage does not mean there are no listings.</p>
    <LoadState state={state} retry={retry} unavailable />
    {state.data && <>
      <Directory onStarted={retry} />
      <h3>Batches</h3>
      {note && <p role="alert" className="err">{note}</p>}
      {state.data.runs.length ? <ul>{state.data.runs.map(run => <li key={run.id}>
        {label(run.kind)} · {label(run.status)} · Created {fmtDate(run.created_at)}{" "}
        <button type="button" className="btn ghost sm" aria-expanded={selected === run.id}
          onClick={() => setSelected(selected === run.id ? null : run.id)}>
          {selected === run.id ? "Hide coverage" : "Show coverage"}</button>{" "}
        {["open", "paused"].includes(run.status) && <>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => act(run, run.status === "open" ? "pause" : "resume")}>
            {run.status === "open" ? "Pause" : "Resume"}</button>{" "}
          <button type="button" className="btn ghost sm" disabled={busy} onClick={() => act(run, "close")}>Close batch</button></>}
        {selected === run.id && <Coverage key={run.id} runId={run.id} open={run.status === "open"} />}
      </li>)}</ul> : <p>No inventory runs recorded on this page. External coverage is unknown.</p>}
      <PageControls previous={pages.length > 1} next={state.data.next} onPrevious={() => changePage(null)}
        onNext={() => changePage(state.data.next)} noun="Inventory run" />
      <Duplicates />
    </>}
  </article>;
}

// BUS-10: listings that may be one home. The panel only proposes; a person links them or keeps them apart, and can
// take either back. Linking keeps every listing as it was captured.
const identityValid = data => data && Array.isArray(data.candidates) && Array.isArray(data.homes) && Array.isArray(data.separated);
const count = (n, noun) => n == null ? `${noun}s not recorded` : `${n} ${noun}${n === 1 ? "" : "s"}`;
const money = p => p ? new Intl.NumberFormat("en-GB", { style: "currency", currency: p.currency }).format(p.amount_minor / 100) +
  ({ week: " per week", month: " per month", quarter: " per quarter", year: " per year" }[p.period] || "") : "Price not recorded";
const both = new Intl.ListFormat("en-GB", { type: "conjunction" });
// Two listings side by side when there is room, one under the other on a phone or at 200% zoom.
const sideBySide = { gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))" };
function Listing({ p }) {
  const title = p.title || "Untitled listing";
  return <div><dt>{p.source_ref} · Channel {p.channel_id} · Ref {p.external_key}</dt>
    <dd>{safeHref(p.listing_url) ? <a href={p.listing_url} target="_blank" rel="noreferrer">{title}</a> : title}
      <br />{[OPERATION[p.operation] || "Unknown operation", p.parish || "Parish not recorded", count(p.bedrooms, "bedroom"),
        count(p.bathrooms, "bathroom"), money(p.price)].join(" · ")}
      <br /><span className="muted">{p.location} · Seen {fmtDate(p.observed_at)}</span></dd></div>;
}
function Duplicates() {
  // No timer: this reading compares the whole inventory, so it reloads on return to the tab and after each decision.
  const [state, retry] = usePage("/admin/market/identity", identityValid, 0);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const send = async (path, body, done) => {
    setBusy(true); setMsg(null);
    try { await api(path, { method: "POST", body: { ...body, operation_id: crypto.randomUUID() } }); setMsg({ ok: done }); }
    catch (error) {
      setMsg({ err: error.status === 409 ? "No decision was recorded: these listings, their source access or an earlier decision had changed. The list is up to date now."
        : "Couldn't record the decision. Please try again." });
    } finally { setBusy(false); retry(); }
  };
  const decide = (c, action, done) => send("/admin/market/identity/decisions",
    { action, left_observation_id: c.left.observation_id, right_observation_id: c.right.observation_id }, done);
  const undo = (decision_id, done) => send("/admin/market/identity/undo", { decision_id }, done);
  // Off in this deployment: the section is not shown at all.
  if (state.loading || state.error?.status === 404) return null;
  const pair = c => `${c.left.source_ref} ${c.left.external_key} and ${c.right.source_ref} ${c.right.external_key}`;
  return <section aria-labelledby="a-market-duplicates">
    <h3 id="a-market-duplicates">Possible duplicate homes</h3>
    <p className="muted">Listings that may be the same home on different sources. Nothing is linked until someone decides here. Linking keeps every listing and does not confirm that the home is available.</p>
    <LoadState state={state} retry={retry} />
    {msg && <p role={msg.err ? "alert" : "status"} className={msg.err ? "err" : "ok"}>{msg.err || msg.ok}</p>}
    {state.data && <>
      {state.data.candidates.length ? <ul aria-label="Possible duplicates">{state.data.candidates.map(c => <li key={c.left.observation_id + c.right.observation_id}>
        Same {both.format(c.same)}
        <dl className="kv" style={sideBySide}><Listing p={c.left} /><Listing p={c.right} /></dl>
        <div className="inline">
          <button type="button" className="btn sm" disabled={busy} aria-label={`Same home: ${pair(c)}`}
            onClick={() => decide(c, "same_property", "Linked as one home. Both listings are kept. You can undo it under Linked homes.")}>Same home</button>
          <button type="button" className="btn ghost sm" disabled={busy} aria-label={`Different homes: ${pair(c)}`}
            onClick={() => decide(c, "different_properties", "Kept as different homes. You can reopen it under Kept apart.")}>Different homes</button>
        </div>
      </li>)}</ul> : <p>No possible duplicates to review.</p>}
      {state.data.truncated && <p className="muted">Not every possible duplicate is shown. More appear as these are decided.</p>}
      {state.data.homes.length > 0 && <><h4>Linked homes</h4>
        <ul aria-label="Linked homes">{state.data.homes.map(h => <li key={h.property_id}>
          One home · {count(h.publications.length, "listing")}
          {h.linked > h.publications.length && ` · ${h.linked - h.publications.length} more not shown, their source is not open now`}
          {" "}· Last linked {fmtDate(h.last_decision.decided_at)}
          <dl className="kv" style={sideBySide}>{h.publications.map(p => <Listing key={p.observation_id} p={p} />)}</dl>
          <button type="button" className="btn ghost sm" disabled={busy}
            aria-label={`Undo last link: ${h.publications.map(p => `${p.source_ref} ${p.external_key}`).join(", ")}`}
            onClick={() => undo(h.last_decision.id, "Last link undone. The homes it joined are separate again.")}>Undo last link</button>
        </li>)}</ul></>}
      {state.data.separated.length > 0 && <><h4>Kept apart</h4>
        <ul aria-label="Kept apart">{state.data.separated.map(s => <li key={s.id}>
          Different homes · Decided {fmtDate(s.decided_at)}
          <dl className="kv" style={sideBySide}><Listing p={s.left} /><Listing p={s.right} /></dl>
          <button type="button" className="btn ghost sm" disabled={busy} aria-label={`Reopen: ${pair(s)}`}
            onClick={() => undo(s.id, "Reopened. The pair is back under possible duplicates.")}>Reopen</button>
        </li>)}</ul></>}
    </>}
  </section>;
}

// BUS-06: the accepted source directory. The file is private and never leaves the browser except to this
// panel; its fingerprint is shown so the admin accepts exactly the file that was prepared.
function Directory({ onStarted }) {
  const [state, retry] = usePage("/admin/market/manifests", manifestsValid);
  const [file, setFile] = useState(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const pick = async event => {
    setMsg(null);
    const chosen = event.target.files[0];
    if (!chosen) return setFile(null);
    try {
      const bytes = await chosen.arrayBuffer(), text = new TextDecoder().decode(bytes), parsed = JSON.parse(text);
      if (typeof parsed.revision !== "string" || !Array.isArray(parsed.channels) || !parsed.channels.length) throw new Error("format");
      const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
      setFile({ text, sha256, revision: parsed.revision, channels: parsed.channels.length,
        sources: new Set(parsed.channels.map(c => c?.source_ref)).size });
    } catch { setFile(null); setMsg({ err: "That file is not a source directory. Choose the directory file prepared for Hampton." }); }
  };
  const send = async (path, body, done, refused) => {
    setBusy(true); setMsg(null);
    try { await api(path, { method: "POST", body }); setMsg({ ok: done }); return true; }
    catch (error) { setMsg({ err: error.status === 409 || error.status === 400 ? refused : "Couldn't save. Please try again." }); return false; }
    finally { setBusy(false); }
  };
  const accept = async () => {
    if (await send("/admin/market/manifests", { manifest: file.text, sha256: file.sha256 },
      `Directory accepted. New channels are pending review; channels already reviewed keep their decision.`,
      "The directory was not accepted: the file is not valid, or this revision was already accepted with other contents.")) { setFile(null); retry(); }
  };
  const begin = async revision => {
    if (await send("/admin/market/runs", { kind: "initial", manifest_revision: revision, operation_id: crypto.randomUUID() },
      "Batch started. Open its coverage to add listings for the channels that allow a manual upload.",
      "A batch is already open. Close it before starting another.")) onStarted();
  };
  return <section aria-labelledby="a-market-directory">
    <h3 id="a-market-directory">Source directory</h3>
    <LoadState state={state} retry={retry} />
    {state.data && (state.data.manifests.length ? <ul>{state.data.manifests.map(m => <li key={m.revision}>
      Revision {m.revision} · {m.channels} channels · {m.status === "accepted" ? `Accepted ${fmtDate(m.accepted_at)}` : "Revoked"}{" "}
      {m.status === "accepted" && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => begin(m.revision)}>Start a batch</button>}
    </li>)}</ul> : <p>No directory accepted yet. Without one, no external source can be reviewed or read.</p>)}
    <p><label>Directory file <input type="file" accept=".json,application/json" onChange={pick} disabled={busy} /></label></p>
    {file && <div>
      <p>Revision {file.revision} · {file.channels} channels from {file.sources} sources
        <br />Fingerprint (SHA-256): <code>{file.sha256}</code></p>
      <p className="muted">Check the fingerprint against the one given with the file. Accepting adds new channels as pending review and keeps decisions already reviewed. It does not allow reading any new source.</p>
      <button type="button" className="btn sm" disabled={busy} onClick={accept}>Accept directory</button>
    </div>}
    {msg && <p role={msg.err ? "alert" : "status"} className={msg.err ? "err" : "ok"}>{msg.err || msg.ok}</p>}
  </section>;
}

function Coverage({ runId, open }) {
  const [pages, setPages] = useState([null]), after = pages.at(-1);
  const [state, retry] = usePage(pathAfter(`/admin/market/runs/${encodeURIComponent(runId)}/coverage`, after), coverageValid);
  return <section aria-label="Source coverage">
    <LoadState state={state} retry={retry} />
    {state.data && <>
      <p>External coverage: <strong>{state.data.overall.external_coverage === "complete" ? "Complete for this run" : "Unknown"}</strong>.</p>
      {state.data.sources.length ? <ul>{state.data.sources.map(source => <li key={`${source.source_ref}:${source.channel_id}`}>
        <strong>{source.source_ref}</strong> · Channel {source.channel_id} · {reading(source)} · Access {label(source.access_status)}
        <br />Method: {label(source.method)} · Review due: {source.review_due_at ? fmtDate(source.review_due_at) : "Not recorded"}
        <br />Last capture: {source.last_capture_at ? fmtDate(source.last_capture_at) : "Not recorded"} · Last full pass: {source.last_full_pass_at ? fmtDate(source.last_full_pass_at) : "Not recorded"}
        {open && source.method === "manual" && ["allowed", "manual_only"].includes(source.access_status) &&
          <ManualUpload runId={runId} source={source} onSaved={retry} />}
      </li>)}</ul> : <p>No sources recorded on this page.</p>}
      <PageControls previous={pages.length > 1} next={state.data.next} onPrevious={() => setPages(p => p.slice(0, -1))}
        onNext={() => setPages(p => [...p, state.data.next])} noun="Source coverage" />
    </>}
  </section>;
}

// BUS-06: listings typed in by staff for a channel reviewed as manual. Up to 10 per upload; the server
// checks every one again and saves all or none.
function ManualUpload({ runId, source, onSaved }) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const pageKey = useRef(null), name = `${source.source_ref} ${source.channel_id}`;
  const save = async event => {
    event.preventDefault();
    let records = null;
    try { const parsed = JSON.parse(text); records = Array.isArray(parsed) ? parsed : parsed?.records; } catch {}
    const missing = r => ["external_key", "source_at", "listing_url"].find(k => typeof r?.[k] !== "string") ||
      (typeof r.observation?.observed_at !== "string" ? "observation.observed_at" : null);
    const incomplete = Array.isArray(records) ? records.findIndex(missing) : -1;
    const problem = !Array.isArray(records) || !records.length ? "Paste a list of 1 to 10 listings in the format shown."
      : records.length > 10 ? "An upload takes up to 10 listings. Split the list and send the rest in the next upload."
      : incomplete >= 0 ? `Listing ${incomplete + 1} is missing ${missing(records[incomplete])}.` : null;
    if (problem) return setMsg({ err: problem });
    pageKey.current ||= `manual-${Date.now()}`;
    setBusy(true); setMsg(null);
    try {
      await api("/admin/market/manual-pages", { method: "POST", body: { schema_version: 1, run_id: runId, source_ref: source.source_ref,
        channel_id: source.channel_id, policy_version: source.policy_version, page_key: pageKey.current,
        // The batch is dated by the latest moment one of its listings was seen.
        observed_at: records.map(r => r.observation.observed_at).sort().at(-1), records } });
      pageKey.current = null; setText(""); setMsg({ ok: `Saved ${records.length} ${records.length === 1 ? "listing" : "listings"}.` }); onSaved();
    } catch (error) {
      setMsg({ err: error.status === 400 ? `Nothing was saved. ${error.message}. Check every listing against the format; links must be on the hosts reviewed for this channel.`
        : error.status === 409 ? "Nothing was saved. The channel is not open for manual upload, the batch is not open, or the channel was used within its minimum interval. Wait two minutes, reload and try again."
        : error.status === 404 || error.status === 413 ? `Nothing was saved. ${error.message}.`
        : "The result is unknown. Reload the coverage and check the listing count before sending this again." });
    } finally { setBusy(false); }
  };
  return <form onSubmit={save}>
    <p><label>Listings for {name} <textarea value={text} onChange={e => { setText(e.target.value); pageKey.current = null; }} disabled={busy} spellCheck={false} /></label></p>
    <details><summary>Show the format</summary>
      <p className="muted">A list of up to 10 listings. Dates are when the listing was seen, in UTC. Amounts are in pence. Territory evidence says why this is a Jersey property.</p>
      <textarea readOnly value={EXAMPLE} aria-label="Example of one listing" /></details>
    <button type="submit" className="btn sm" disabled={busy || !text.trim()}>Save listings</button>
    {msg && <p role={msg.err ? "alert" : "status"} className={msg.err ? "err" : "ok"}>{msg.err || msg.ok}</p>}
  </form>;
}
