import { fmtAgo, fmtDate } from "./format.js";

// EST-01 / SAP-01: what a search's last full run against Hampton's saved listings did (GET /admin/applicants search_run).
// none: the search has no match at all, so the line also says so. Never a statement about the wider market: what the
// search covered is searchScope's.
const When = ({ at }) => <time dateTime={at} title={fmtDate(at)}>{fmtAgo(at)}</time>;

// BUS-01: what the last search covered. Without market matching (no scope), Hampton's saved listings only; with it,
// what the market part of its last completed search did. No open source is said as such, never as an empty market.
const MARKET = { searched: "Hampton's listings and the market inventory",
  incomplete: "Hampton's listings and the best-fitting part of the market inventory: more homes than one search compares",
  no_source: "Hampton's saved listings: no market source was open", failed: "Hampton's saved listings: the market inventory could not be read" };
export const searchScope = run => run.scope !== "listings_and_market" ? "Hampton's saved listings only"
  : MARKET[run.market?.state] ?? "Hampton's listings and the market inventory";

export default function SearchRun({ run, none }) {
  if (run.state === "queued") return <><span className="badge neutral">Waiting for investigation</span> <span className="muted">First search queued</span></>;
  if (run.state === "searching") return <span className="muted">Searching now…</span>;
  if (run.state === "failed") return <span className="muted"><span className="err">Last search failed · <When at={run.at} /></span>{run.last_success_at
    && <span> · last completed <When at={run.last_success_at} /></span>}</span>;
  return <span className="muted">{none ? "No matches yet · last search " : "Last search "}{run.state === "searched"
    ? <When at={run.at} /> : "not recorded"}</span>;
}
