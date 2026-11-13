import { useEffect, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

const label = value => ({ own_pilot: "Internal pilot", initial: "Initial", daily: "Daily", open: "Open", paused: "Paused",
  completed: "Completed", partial: "Partial", cancelled: "Cancelled", pending: "Pending", running: "Running",
  manual_pending: "Manual review pending", blocked: "Blocked", complete: "Complete", failed: "Failed",
  allowed: "Allowed", manual_only: "Manual only", denied: "Denied" }[value] || "Unknown");

// Refresh only while the page is visible; invalidate stale responses when page or selection changes.
function usePage(path, validate) {
  const [result, setResult] = useState({ loading: true }), [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true, sequence = 0;
    setResult({ loading: true });
    const load = () => {
      const request = ++sequence;
      api(path).then(data => {
        if (!validate(data)) throw new Error("Unexpected response");
        if (alive && request === sequence) setResult({ data });
      }).catch(error => {
        if (alive && request === sequence) setResult({ error });
      });
    };
    const refresh = () => { if (!document.hidden) load(); };
    load();
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [path, retry, validate]);
  return [result, () => setRetry(n => n + 1)];
}
const runsValid = data => data && Array.isArray(data.runs) && (data.next === null || typeof data.next === "string");
const coverageValid = data => data && data.run && Array.isArray(data.sources) && data.overall &&
  (data.next === null || typeof data.next === "string");
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
  return <article className="card" aria-labelledby="a-market">
    <h2 id="a-market">Market inventory</h2>
    <p className="muted">Review recorded inventory runs and their source coverage. An unknown coverage does not mean there are no listings.</p>
    <LoadState state={state} retry={retry} unavailable />
    {state.data && <>
      {state.data.runs.length ? <ul>{state.data.runs.map(run => <li key={run.id}>
        {label(run.kind)} · {label(run.status)} · Created {fmtDate(run.created_at)}{" "}
        <button type="button" className="btn ghost sm" aria-expanded={selected === run.id}
          onClick={() => setSelected(selected === run.id ? null : run.id)}>
          {selected === run.id ? "Hide coverage" : "Show coverage"}</button>
        {selected === run.id && <Coverage key={run.id} runId={run.id} />}
      </li>)}</ul> : <p>No inventory runs recorded on this page. External coverage is unknown.</p>}
      <PageControls previous={pages.length > 1} next={state.data.next} onPrevious={() => changePage(null)}
        onNext={() => changePage(state.data.next)} noun="Inventory run" />
    </>}
  </article>;
}

function Coverage({ runId }) {
  const [pages, setPages] = useState([null]), after = pages.at(-1);
  const [state, retry] = usePage(pathAfter(`/admin/market/runs/${encodeURIComponent(runId)}/coverage`, after), coverageValid);
  return <section aria-label="Source coverage">
    <LoadState state={state} retry={retry} />
    {state.data && <>
      <p>External coverage: <strong>{state.data.overall.external_coverage === "complete" ? "Complete for this run" : "Unknown"}</strong>.</p>
      {state.data.sources.length ? <ul>{state.data.sources.map(source => <li key={`${source.source_ref}:${source.channel_id}`}>
        <strong>{source.source_ref}</strong> · Channel {source.channel_id} · {label(source.status)} · Access {label(source.access_status)}
        <br />Last capture: {source.last_capture_at ? fmtDate(source.last_capture_at) : "Not recorded"} · Last full pass: {source.last_full_pass_at ? fmtDate(source.last_full_pass_at) : "Not recorded"}
      </li>)}</ul> : <p>No sources recorded on this page.</p>}
      <PageControls previous={pages.length > 1} next={state.data.next} onPrevious={() => setPages(p => p.slice(0, -1))}
        onNext={() => setPages(p => [...p, state.data.next])} noun="Source coverage" />
    </>}
  </section>;
}
