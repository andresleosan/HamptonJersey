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
  if (!r) return <p className="muted">Esta ficha no viene de la investigación.</p>;
  const facts = [["Coincidencia", r.match_status], ["Confianza", r.match_confidence], ["Motivo", r.match_reason],
    ["Evidencia publicitaria", r.advertising_evidence_class], ["Qué falta", r.missing_information], ["Siguiente acción", r.next_action],
    ["Base de la evidencia", r.evidence_basis], ["Fecha de investigación", r.research_date]].filter(([, v]) => v);
  return <div className="research">
    <dl className="kv">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    {data.issues.length > 0 && <><h3>Issues ({data.issues.length})</h3><ul className="issues">{data.issues.map(i =>
      <li key={i.issue_id}><b>{i.severity}</b> · {i.field}: {i.issue}{i.proposed_action && <div className="muted">→ {i.proposed_action}</div>}</li>)}</ul></>}
    <Table caption="Fuentes" rows={data.sources} cols={[["title", "Fuente"], ["origin", "Origen"], ["source_type", "Tipo"], ["observed_status", "Estado visto"], ["price_text", "Precio visto"], ["source_date", "Fecha"]]} />
    <Table caption="Datos (facts)" rows={data.facts} cols={[["field", "Campo"], ["value", "Valor"], ["confidence", "Confianza"], ["origin", "Origen"]]} />
    <Table caption="Términos financieros" rows={data.terms} cols={[["term_type", "Tipo"], ["amount", "Importe"], ["currency", "Moneda"], ["period", "Periodo"], ["qualifier", "Matiz"]]} />
    <details><summary>Búsquedas realizadas ({data.searches.length})</summary>
      <Table caption="Búsquedas" rows={data.searches} cols={[["date", "Fecha"], ["query", "Consulta"], ["outcome", "Resultado"]]} /></details>
  </div>;
}
