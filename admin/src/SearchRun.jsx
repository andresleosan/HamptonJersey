import { fmtAgo, fmtDate } from "./format.js";

// EST-01 / SAP-01: what a search's last full run against Hampton's saved listings did (GET /admin/applicants search_run).
// none: the search has no match at all, so the line also says so. Never a statement about the wider market.
const When = ({ at }) => <time dateTime={at} title={fmtDate(at)}>{fmtAgo(at)}</time>;

export default function SearchRun({ run, none }) {
  if (run.state === "queued") return <><span className="badge neutral">Waiting for investigation</span> <span className="muted">First search queued</span></>;
  if (run.state === "searching") return <span className="muted">Searching now…</span>;
  if (run.state === "failed") return <span className="muted"><span className="err">Last search failed · <When at={run.at} /></span>{run.last_success_at
    && <span> · last completed <When at={run.last_success_at} /></span>}</span>;
  return <span className="muted">{none ? "No matches yet · last search " : "Last search "}{run.state === "searched"
    ? <When at={run.at} /> : "not recorded"}</span>;
}
