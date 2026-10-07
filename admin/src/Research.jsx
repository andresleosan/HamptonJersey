import { safeHref } from "./format.js";

const Table = ({ rows, cols, caption }) => rows.length ? <table className="list small">
  <caption>{caption}</caption>
  <thead><tr>{cols.map(([k, t]) => <th key={k} scope="col">{t}</th>)}</tr></thead>
  <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([k]) => <td key={k}>{k === "title"
    ? (safeHref(r.url) ? <a href={safeHref(r.url)} target="_blank" rel="noopener noreferrer">{r.title || r.url}</a> : r.title)
    : r[k] ?? "—"}</td>)}</tr>)}</tbody>
</table> : null;

export default function Research({ data }) {
  const r = data.research;
  if (!r) return <p className="muted">This listing has no research record.</p>;
  const facts = [["Match", r.match_status], ["Confidence", r.match_confidence], ["Reason", r.match_reason],
    ["Advertising evidence", r.advertising_evidence_class], ["Missing", r.missing_information], ["Next action", r.next_action],
    ["Evidence basis", r.evidence_basis], ["Research date", r.research_date]].filter(([, v]) => v);
  return <div className="research">
    <dl className="kv">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {data.issues.length > 0 && <><h3>Issues ({data.issues.length})</h3><ul className="issues">{data.issues.map(i =>
      <li key={i.issue_id}><b>{i.severity}</b> · {i.field}: {i.issue}{i.proposed_action && <div className="muted">→ {i.proposed_action}</div>}</li>)}</ul></>}
    <Table caption="Sources" rows={data.sources} cols={[["title", "Source"], ["origin", "Origin"], ["source_type", "Type"], ["observed_status", "Status seen"], ["price_text", "Price seen"], ["source_date", "Date"]]} />
    <Table caption="Facts" rows={data.facts} cols={[["field", "Field"], ["value", "Value"], ["confidence", "Confidence"], ["origin", "Origin"]]} />
    <Table caption="Financial terms" rows={data.terms} cols={[["term_type", "Type"], ["amount", "Amount"], ["currency", "Currency"], ["period", "Period"], ["qualifier", "Qualifier"]]} />
    <details><summary>Searches made ({data.searches.length})</summary>
      <Table caption="Searches" rows={data.searches} cols={[["date", "Date"], ["query", "Query"], ["outcome", "Outcome"]]} /></details>
  </div>;
}
