// BUS-09: squid allowlist lines for the market's automatic channels, for Hermes's proxy and the custodian's.
// One ".domain" per line (the domain, www. and its other subdomains), sorted, without repeats or lines another covers.
//   npx wrangler d1 execute hampton --remote --json --command \
//     "SELECT allowed_hosts FROM market_sources WHERE access_status='allowed' AND method='http'" > hosts.json
//   node scripts/market-hermes-allowlist.mjs < hosts.json
import { readFileSync } from "node:fs";

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/; // the app's own host rule

export function allowlist(wranglerJson) {
  const rows = JSON.parse(wranglerJson).flatMap(r => r.results ?? []);
  const domains = new Set();
  for (const row of rows) for (const h of JSON.parse(row.allowed_hosts ?? "[]")) {
    const d = String(h).toLowerCase().replace(/^www\./, "");
    if (!HOST.test(d) || /(^|\.)(localhost|local|internal)$/.test(d)) throw new Error(`Not a public host: ${h}`);
    domains.add(d);
  }
  return [...domains].filter(d => ![...domains].some(o => o !== d && d.endsWith(`.${o}`))).sort().map(d => `.${d}`);
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(allowlist(readFileSync(0, "utf8")).join("\n"));
