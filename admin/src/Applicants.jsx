import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { fmtDate } from "./format.js";
import { OPTIONS } from "../../server/applicants.js";

const OPERATIONS = [["", "All"], ...OPTIONS.operation];
const OPERATION_LABEL = Object.fromEntries(OPTIONS.operation);
const STAGE_LABEL = Object.fromEntries(OPTIONS.stages);
// DESIGN.md "Badges de estado": the tone of each stage.
const TONE = { new: "attention", searching: "active", viewing: "active", offer: "active", agreed: "positive", completed: "positive",
  paused: "neutral", lost: "neutral" };
const StageBadge = ({ stage }) => <span className={`badge ${TONE[stage]}`}>{STAGE_LABEL[stage]}</span>;
// B13: the queue labels GET /admin/applicants returns and filters by (?queue=), in their order, with their tone.
const QUEUE_TONE = { "New properties found": "attention", "Waiting for review": "attention", "In process": "active",
  "No matches": "neutral" };
const matchCounts = a => (a.found || a.shortlisted ? `${a.found} found · ${a.shortlisted} shortlisted` : null);

export default function Applicants() {
  const [rows, setRows] = useState(null), [error, setError] = useState(null), [users, setUsers] = useState([]);
  const [archived, setArchived] = useState(false), [op, setOp] = useState(""), [sort, setSort] = useState("newest");
  const [q, setQ] = useState(""), [stage, setStage] = useState(""), [assigned, setAssigned] = useState(""), [queue, setQueue] = useState("");
  useEffect(() => { api("/admin/users").then(d => setUsers(d.users), () => {}); }, []);
  // The server filters and sorts; To Let / To Buy is split here so each tab can show its count.
  useEffect(() => {
    let stale = false;
    const p = new URLSearchParams({ sort, ...(stage && { stage }), ...(assigned && { assigned }), ...(queue && { queue }),
      ...(q.trim() && { q: q.trim() }), ...(archived && { archived: "1" }) });
    const t = setTimeout(() => api(`/admin/applicants?${p}`).then(d => { if (!stale) { setRows(d.applicants); setError(null); } },
      e => { if (!stale) setError(e.message); }), 200);
    return () => { stale = true; clearTimeout(t); };
  }, [archived, sort, stage, assigned, queue, q]);
  const counts = useMemo(() => Object.fromEntries(OPERATIONS.map(([k]) =>
    [k, (rows || []).filter(a => !k || a.operation === k).length])), [rows]);

  const head = <div className="head"><h1 id="t-applicants">Applicants</h1><a className="btn" href="#/applicants/new">New applicant</a></div>;
  if (!rows) return <section aria-labelledby="t-applicants">{head}
    {error ? <p role="alert" className="err">{error}</p> : <p>Loading applicants…</p>}</section>;
  const shown = rows.filter(a => !op || a.operation === op);
  const filtered = !!(q.trim() || stage || assigned || queue);
  const clear = () => { setQ(""); setStage(""); setAssigned(""); setQueue(""); };
  const toggleSort = () => setSort(s => (s === "newest" ? "oldest" : "newest"));

  return <section aria-labelledby="t-applicants">{head}
    <div className="seg-row">
      <div className="seg" role="group" aria-label="Operation">{OPERATIONS.map(([k, t]) =>
        <button key={k} type="button" aria-pressed={op === k} onClick={() => setOp(k)}>{t}<span className="count">{counts[k]}</span></button>)}</div>
      <div className="seg" role="group" aria-label="List">{[[false, "Current"], [true, "Archived"]].map(([k, t]) =>
        <button key={t} type="button" aria-pressed={archived === k} onClick={() => setArchived(k)}>{t}</button>)}</div>
    </div>
    <div className="filters">
      <label>Search<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, email or phone" /></label>
      <label>Stage<select value={stage} onChange={e => setStage(e.target.value)}><option value="">All</option>
        {OPTIONS.stages.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Queue<select value={queue} onChange={e => setQueue(e.target.value)}><option value="">All</option>
        {Object.keys(QUEUE_TONE).map(k => <option key={k} value={k}>{k}</option>)}</select></label>
      <label>Assigned to<select value={assigned} onChange={e => setAssigned(e.target.value)}><option value="">Anyone</option>
        {users.map(u => <option key={u.email} value={u.email}>{u.name || u.email}</option>)}</select></label>
      <label>Order<select value={sort} onChange={e => setSort(e.target.value)}>
        <option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </div>
    <p className="muted" aria-live="polite">{shown.length} {shown.length === 1 ? "applicant" : "applicants"}</p>
    {error && <p role="alert" className="err">{error}</p>}
    {shown.length ? <table className="list applicants">
      <thead><tr><th scope="col">Name</th><th scope="col">Phone</th>
        <th scope="col" aria-sort={sort === "newest" ? "descending" : "ascending"}>
          <button type="button" className="sort" onClick={toggleSort}>Applied<span aria-hidden="true">{sort === "newest" ? " ↓" : " ↑"}</span></button></th>
        <th scope="col">Stage</th><th scope="col">Queue</th><th scope="col">Matches</th><th scope="col">Assigned to</th></tr></thead>
      <tbody>{shown.map(a => <tr key={a.id}>
        <td><a href={`#/applicants/${a.id}`}>{a.name}</a><div className="muted">{OPERATION_LABEL[a.operation]}{a.email && ` · ${a.email}`}</div></td>
        <td className="num" data-label="Phone">{a.phone || "—"}</td>
        <td className="muted" data-label="Applied"><time dateTime={a.created_at}>{fmtDate(a.created_at)}</time></td>
        {/* On phones a lost reason takes its own row, so it never squeezes the name. */}
        <td className={a.stage === "lost" && a.lost_reason ? "stage lost" : "stage"}><StageBadge stage={a.stage} />{a.stage === "lost"
          && a.lost_reason && <span className="muted"> {a.lost_reason}</span>}</td>
        <td data-label="Queue"><span className={`badge ${QUEUE_TONE[a.queue] ?? "neutral"}`}>{a.queue}</span></td>
        <td className="num" data-label="Matches">{matchCounts(a)
          ? <a href={`#/applicants/${a.id}/matches`}>{matchCounts(a)}<span className="sr"> for {a.name}</span></a> : <span className="muted">—</span>}</td>
        <td data-label="Assigned to">{a.assigned_to ? a.assigned_name || a.assigned_to : <span className="muted">Unassigned</span>}</td>
      </tr>)}</tbody>
    </table> : <div className="empty card">{filtered
      ? <><p>No applicants match these filters.</p><button type="button" className="btn ghost sm" onClick={clear}>Clear filters</button></>
      : archived ? <p>No archived {op ? `${OPERATION_LABEL[op]} ` : ""}applicants.</p>
      : <><p>{rows.length ? `No ${OPERATION_LABEL[op]} applicants yet.` : "No applicants yet. Add the first one when someone calls, writes or comes in."}</p>
        <a className="btn sm" href="#/applicants/new">New applicant</a></>}</div>}
  </section>;
}
