import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";

const choices = { pending: "Pending review", allowed: "Allowed", manual_only: "Manual only", denied: "Denied", paused: "Paused" };
const date = value => value ? fmtDate(value) : "Not recorded";
const lines = value => value.split("\n").map(s => s.trim()).filter(Boolean);
const toForm = d => ({ status: d.status, method: d.method || "", evidence_ref: d.evidence_ref || "", retention_ref: d.retention_ref || "", review_due_at: d.review_due_at || "", min_interval_s: String(d.min_interval_s ?? 60), allowed_hosts: (d.allowed_hosts || []).join("\n"), allowed_paths: (d.allowed_paths || []).join("\n"), allowed_redirect_hosts: (d.allowed_redirect_hosts || []).join("\n") });

export default function SourceAccessReview() {
  const [pages, setPages] = useState([null]), [page, setPage] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true), [selected, setSelected] = useState(null), [refresh, setRefresh] = useState(0), [listStale, setListStale] = useState(false);
  const after = pages.at(-1), selectedRef = useRef(null), pageRef = useRef(null);
  selectedRef.current = selected;
  useEffect(() => { let active = true, sequence = 0; setLoading(true); setError(null); setPage(null); setSelected(null); selectedRef.current = null; pageRef.current = null; setListStale(false);
    const load = (initial = false) => { const n = ++sequence;
      api(`/admin/market/sources${after ? `?after=${encodeURIComponent(after)}` : ""}`).then(d => {
        if (!Array.isArray(d.sources) || !(d.next === null || typeof d.next === "string")) throw new Error("Invalid response");
        if (active && n === sequence) { pageRef.current = d; setPage(d); setListStale(!!selectedRef.current && !d.sources.some(s => s.source_ref === selectedRef.current.source_ref && s.channel_id === selectedRef.current.channel_id)); setError(null); }
      }).catch(e => { if (active && n === sequence) { if (!pageRef.current) setError(e); else setListStale(true); } }).finally(() => { if (active && n === sequence) setLoading(false); });
    };
    const check = () => { if (!document.hidden) load(); }; load(true);
    const timer = setInterval(check, 30000); document.addEventListener("visibilitychange", check);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [after, refresh]);
  const rows = page && selected && !page.sources.some(s => s.source_ref === selected.source_ref && s.channel_id === selected.channel_id) ? [...page.sources, selected] : page?.sources;
  return <article className="card" aria-labelledby="source-access-title">
    <h2 id="source-access-title">Market source access</h2>
    <p className="muted">Review each source and channel separately. Pending or unknown does not mean access is permitted or that there are no listings.</p>
    {loading && <p role="status">Loading sources…</p>}
    {error && (error.status === 404 ? <p>Source review is not available yet.</p> : <div role="alert"><p>Could not load sources.</p><button className="btn ghost sm" onClick={() => setRefresh(n => n + 1)}>Try again</button></div>)}
    {listStale && <p role="alert">The source list changed or could not be refreshed; displayed decisions may be out of date.</p>}
    {page && <>{rows.length ? <ul>{rows.map(s => <li key={JSON.stringify([s.source_ref,s.channel_id])}>
      <strong>{s.source_ref}</strong> · {s.channel_id} · {choices[s.status] || "Unknown"} · Method: {s.method || "Unknown"} · Reviewed: {date(s.checked_at)} · Review due: {date(s.review_due_at)}{" "}
      <button type="button" className="btn ghost sm" aria-expanded={selected?.source_ref === s.source_ref && selected?.channel_id === s.channel_id} aria-label={`${selected?.source_ref === s.source_ref && selected?.channel_id === s.channel_id ? "Close" : "Review"} ${s.source_ref} ${s.channel_id}`} onClick={() => setSelected(old => old?.source_ref === s.source_ref && old?.channel_id === s.channel_id ? null : s)}>{selected?.source_ref === s.source_ref && selected?.channel_id === s.channel_id ? "Close review" : "Review channel"}</button>
      {selected?.source_ref === s.source_ref && selected?.channel_id === s.channel_id && <ChannelReview key={JSON.stringify([s.source_ref,s.channel_id])} source={s} onChanged={() => setRefresh(n => n + 1)} />}
    </li>)}</ul> : <p>No source channels recorded on this page.</p>}
      <div role="group" aria-label="Source pages" className="inline"><button type="button" className="btn ghost sm" disabled={pages.length < 2} onClick={() => setPages(p => p.slice(0,-1))}>Previous page</button><button type="button" className="btn ghost sm" disabled={!page.next} onClick={() => setPages(p => [...p,page.next])}>Next page</button></div>
    </>}
  </article>;
}

function ChannelReview({ source, onChanged }) {
  const [decision, setDecision] = useState(null), [form, setForm] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [reload, setReload] = useState(0), [uncertain, setUncertain] = useState(false), [stale, setStale] = useState(false);
  const operation = useRef(null), current = useRef(null), busyRef = useRef(false);
  useEffect(() => { let active = true, sequence = 0; setDecision(null); setForm(null); setError(null); setUncertain(false); setStale(false); current.current = null; operation.current = null;
    const params = new URLSearchParams({ source_ref: source.source_ref, channel_id: source.channel_id });
    const signature = d => JSON.stringify([d.version, d.status, d.method, d.recorded_status, d.review_due_at]);
    const load = (initial = false) => { if (busyRef.current) return; const n = ++sequence;
      api(`/admin/market/sources/detail?${params}`).then(({ decision: d }) => {
        if (!d || d.source_ref !== source.source_ref || d.channel_id !== source.channel_id || !Number.isSafeInteger(d.version)) throw new Error("Invalid response");
        if (!active || n !== sequence || busyRef.current) return;
        if (!current.current) { current.current = d; setDecision(d); setForm(toForm(d)); }
        else if (!current.current || signature(current.current) !== signature(d)) setStale(true);
      }).catch(e => { if (active && n === sequence) { if (!current.current) setError(e); else setStale(true); } });
    };
    const check = () => { if (!document.hidden) load(); }; load(true);
    const timer = setInterval(check, 30000); document.addEventListener("visibilitychange", check);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [source.source_ref, source.channel_id, reload]);
  const edit = e => { const { name, value } = e.target; setForm(f => ({ ...f, [name]: value })); operation.current = null; };
  const save = async e => { e.preventDefault(); if (busy || stale) return;
    let due = null;
    if (form.review_due_at) { const d = new Date(form.review_due_at); if (!Number.isFinite(d.getTime())) { setError(new Error("Enter a valid review date.")); return; } due = d.toISOString(); }
    const body = { source_ref: source.source_ref, channel_id: source.channel_id, version: decision.version, operation_id: operation.current || crypto.randomUUID(), status: form.status, method: form.method || null, evidence_ref: form.evidence_ref || null, retention_ref: form.retention_ref || null, review_due_at: due, min_interval_s: Number(form.min_interval_s), allowed_hosts: lines(form.allowed_hosts), allowed_paths: lines(form.allowed_paths), allowed_redirect_hosts: lines(form.allowed_redirect_hosts) };
    operation.current = body.operation_id; busyRef.current = true; setBusy(true); setError(null);
    try { await api("/admin/market/sources/review", { method: "POST", body }); onChanged(); }
    catch (err) { setError(err); if (err.status === 0 || err.status >= 500) setUncertain(true); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <section aria-label={`Review ${source.source_ref} ${source.channel_id}`}>
    {stale && <div role="alert"><p>This review may have changed or could not be refreshed. Your edits are preserved; reload the review to check the current decision.</p><button type="button" className="btn ghost sm" onClick={() => setReload(n => n + 1)}>Reload current decision</button></div>}
    {error && <div role="alert"><p>{error.status === 409 ? "This review changed or cannot be enabled. Reload it before continuing." : uncertain ? "The save result is unknown. Retry the same request or reload to check the current decision." : "Could not load or save the review. Check the fields and try again."}</p><button type="button" className="btn ghost sm" onClick={() => setReload(n => n + 1)}>Reload review</button></div>}
    {!decision && !error && <p role="status">Loading review…</p>}
    {decision && form && <><p>{stale || error?.status === 409 ? "Last loaded (may be out of date)" : "Current"}: {choices[decision.status] || "Unknown"}; method: {decision.method || "Unknown"}; reviewed: {date(decision.checked_at)}; review due: {date(decision.review_due_at)}.</p>
      {decision.recorded_status && <p>Recorded decision: {choices[decision.recorded_status] || "Unknown"}. The effective decision is pending.</p>}
      <p>Evidence reference: {decision.evidence_ref || "Not recorded"}; retention reference: {decision.retention_ref || "Not recorded"}.</p>
      <form onSubmit={save}>
        <label>Decision <select name="status" value={form.status} onChange={edit} disabled={busy || uncertain}><option value="pending">Pending review</option><option value="allowed">Allowed</option><option value="manual_only">Manual only</option><option value="denied">Denied</option><option value="paused">Paused</option></select></label>{" "}
        <label>Method <select name="method" value={form.method} onChange={edit} disabled={busy || uncertain}><option value="">Unknown</option><option value="internal">Internal</option><option value="manual">Manual</option><option value="http">HTTP</option></select></label>
        <p><label>Evidence reference <input name="evidence_ref" value={form.evidence_ref} onChange={edit} disabled={busy || uncertain} maxLength={200} /></label></p>
        <p><label>Retention reference <input name="retention_ref" value={form.retention_ref} onChange={edit} disabled={busy || uncertain} maxLength={200} /></label></p>
        <p><label>Review due (ISO UTC) <input name="review_due_at" value={form.review_due_at} onChange={edit} disabled={busy || uncertain} placeholder="2027-01-01T00:00:00.000Z" /></label></p>
        <p><label>Minimum interval in seconds <input type="number" name="min_interval_s" min="60" max="31536000" required value={form.min_interval_s} onChange={edit} disabled={busy || uncertain} /></label></p>
        <p><label>Allowed hosts, one per line <textarea name="allowed_hosts" value={form.allowed_hosts} onChange={edit} disabled={busy || uncertain} /></label></p>
        <p><label>Allowed paths, one per line <textarea name="allowed_paths" value={form.allowed_paths} onChange={edit} disabled={busy || uncertain} /></label></p>
        <p><label>Allowed redirect hosts, one per line <textarea name="allowed_redirect_hosts" value={form.allowed_redirect_hosts} onChange={edit} disabled={busy || uncertain} /></label></p>
        <button className="btn sm" type="submit" disabled={busy || stale || error?.status === 409}>{uncertain ? "Retry same save" : "Save review"}</button>
      </form></>}
  </section>;
}
