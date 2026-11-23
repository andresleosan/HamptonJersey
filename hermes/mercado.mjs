// BUS-09 (contract 23-nov-2026, plan docs/roadmap/work/BUS-09/plan-directorio-hermes.md): the market custodian. It runs
// on the VPS in its own container, outside Hermes's, and alone holds the market door's key (HERMES_MARKET_KEY). Hermes
// reaches it on a private network with its own key (CUSTODIO_KEY_FILE) and two calls:
//   GET  /mercado/trabajo   today's channels for Hermes (hosts and paths), minus the ones already queued here;
//   POST /mercado/entregar  a whole channel: {run_id, source_ref, channel_id, pages:[urls read], adverts:[…≤400]}
//                           or {run_id, source_ref, channel_id, fail:"<reason>"}.
// Every advert is checked against the live pages without AI: kept only if its link (or path) and its price text appear
// literally in a page the custodian fetched itself. The verified channel waits in a durable queue (ESTADO_DIR) and a loop
// drip-feeds it to the app in slices of ≤10, one claim per slice, honouring 409 retry_after_s and min_interval_s. A slice
// is kept with its lease before it is posted: after a stop it is posted again identically (the app replays it by page
// key), never as a new slice. Logs carry ids, counts and reason codes only. Node 24, no dependencies.
//
// APP_ORIGIN=https://<app host> HERMES_MARKET_KEY_FILE=<file> CUSTODIO_KEY_FILE=<Hermes's key to call it> \
//   ESTADO_DIR=<private dir> LISTEN_HOST=<private address> LISTEN_PORT=8789 node hermes/mercado.mjs
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, rmSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const UA = "HamptonEstatesBot/1.0 (+market review; reads allowed pages only)";
const REASONS = ["access_denied", "unavailable", "invalid_response", "rate_limited"];
const PARISHES = ["Grouville", "St Brelade", "St Clement", "St Helier", "St John", "St Lawrence", "St Martin", "St Mary",
  "St Ouen", "St Peter", "St Saviour", "Trinity"];
const MAX_BODY = 1048576, MAX_PAGE = 5242880, MAX_PAGES = 20, MAX_ADVERTS = 400, SLICE = 10, DAY_MS = 86400000;

const read = f => JSON.parse(readFileSync(f, "utf8"));
const keep = (f, v) => { writeFileSync(`${f}.tmp`, JSON.stringify(v), { mode: 0o600 }); renameSync(`${f}.tmp`, f); };
const sha = v => createHash("sha256").update(String(v)).digest();
const queueFile = (cfg, i) => join(cfg.estado, `${sha([i.run_id, i.source_ref, i.channel_id].join("\0")).toString("hex").slice(0, 32)}.json`);
const err = (status, message) => Object.assign(new Error(message), { status });
const log = (cfg, line) => (cfg.log ?? console.log)(`mercado: ${line}`);

async function door(cfg, method, path, body) {
  const r = await cfg.fetchFn(`${cfg.origin}/api/hermes/market/${path}`, { method, redirect: "manual",
    headers: { authorization: `Bearer ${cfg.key}`, ...(body && { "content-type": "application/json" }) },
    body: body && JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

async function work(cfg) {
  const { status, json } = await door(cfg, "GET", "work");
  if (status !== 200) throw err(502, `Hampton App answered ${status} to market/work`);
  return json;
}

// The same scope rule as the app's manualScopeAllows: https, exact host, a path under an allowed prefix.
export function inScope(value, item) {
  let u;
  try { u = new URL(value); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && !u.port && item.hosts.includes(u.hostname)
    && item.paths.some(p => p === "/" || u.pathname === p || u.pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", pound: "£", euro: "€", ndash: "–", mdash: "—" };
const code = e => { try { return String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)); } catch { return " "; } };
// What is compared: HTML entities decoded, JSON's "\/" undone, whitespace collapsed. Same for page and advert.
export const plain = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? code(e) : ENT[e.toLowerCase()] ?? m)
  .replaceAll("\\/", "/").replace(/\s+/g, " ").trim();
// A whole token only: "/property/12" is not found in "/property/123", nor "1,950" in "11,950".
const has = (hay, needle) => {
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1))
    if (!/[A-Za-z0-9_%-]/.test(hay[i + needle.length] ?? "") && !(/^[0-9]/.test(needle) && /[0-9,.]/.test(hay[i - 1] ?? ""))) return true;
  return false;
};

async function fetchPage(cfg, url, item) {
  for (let hop = 0; hop < 5; hop++) {
    const r = await cfg.fetchFn(url, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html,*/*" },
      signal: AbortSignal.timeout(15000) });
    if (r.status >= 300 && r.status < 400) {
      const next = r.headers.get("location") && new URL(r.headers.get("location"), url).href;
      await r.body?.cancel();
      if (!next || !inScope(next, { ...item, paths: ["/"] })) return null; // redirects stay on the channel's hosts
      url = next; continue;
    }
    if (!r.ok || !r.body) { await r.body?.cancel(); return null; }
    const chunks = []; let size = 0;
    for await (const c of r.body) { if ((size += c.length) > MAX_PAGE) break; chunks.push(c); }
    return plain(Buffer.concat(chunks).toString("utf8"));
  }
  return null;
}

// Only the contract's fields go on, each type- and length-checked; anything else (descriptions, names…) is dropped.
const intOrNull = v => v === null || v === undefined ? null : Number.isInteger(v) && v >= 0 && v <= 50 ? v : undefined;
function advert(a, item) {
  if (!a || typeof a !== "object" || typeof a.listing_url !== "string" || a.listing_url.length > 2048
    || !inScope(a.listing_url, item)) return { reason: "off_channel" };
  const price = a.price_text ?? null, title = a.title ?? null, area = a.area_sqft ?? null;
  const out = { listing_url: a.listing_url, operation: a.operation, use: a.use,
    price_text: typeof price === "string" ? plain(price) : price, parish: a.parish ?? null,
    bedrooms: intOrNull(a.bedrooms), bathrooms: intOrNull(a.bathrooms), parking: a.parking === true ? true : null,
    area_sqft: area, title: typeof title === "string" ? title.replace(/\s+/g, " ").trim() : title };
  if (!["rent", "sale"].includes(out.operation) || !["residential", "commercial"].includes(out.use)
    || !(out.price_text === null || (typeof out.price_text === "string" && out.price_text && out.price_text.length <= 100))
    || !(out.parish === null || PARISHES.includes(out.parish)) || out.bedrooms === undefined || out.bathrooms === undefined
    || !(a.parking === undefined || a.parking === null || typeof a.parking === "boolean")
    || !(area === null || (typeof area === "number" && area > 0 && area < 1e7))
    || !(out.title === null || (typeof out.title === "string" && out.title.length <= 120))) return { reason: "invalid" };
  return { out };
}

const urlKey = v => { const u = new URL(v); return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`; };

export async function entregar(cfg, body) {
  const ids = ["run_id", "source_ref", "channel_id"];
  if (!body || ids.some(k => typeof body[k] !== "string" || !body[k] || body[k].length > 160)) throw err(400, "Send run_id, source_ref and channel_id");
  const { run_id, items = [] } = await work(cfg);
  const item = run_id === body.run_id && items.find(i => i.source_ref === body.source_ref && i.channel_id === body.channel_id);
  if (!item) throw err(409, "Not in today's work");
  const f = queueFile(cfg, body);
  if (cfg.busy.has(f) || existsSync(f)) throw err(409, "Already delivered");
  cfg.busy.add(f);
  try {
    const q = { run_id: body.run_id, source_ref: body.source_ref, channel_id: body.channel_id, at: cfg.now(),
      min_interval_s: Math.max(60, Number(item.min_interval_s) || 60), next_at: 0, sent: 0, posting: null };
    const name = `${body.source_ref}/${body.channel_id}`;
    if (body.fail !== undefined) {
      if (!REASONS.includes(body.fail)) throw err(400, `fail is one of ${REASONS.join(", ")}`);
      keep(f, { ...q, fail: body.fail });
      log(cfg, `${name} fail ${body.fail} queued`);
      return { queued: 0, rejected: 0, reasons: {}, fail: body.fail };
    }
    const pages = body.pages, adverts = body.adverts;
    if (!Array.isArray(pages) || !pages.length || pages.length > MAX_PAGES || !pages.every(p => typeof p === "string" && inScope(p, item)))
      throw err(400, `pages: 1 to ${MAX_PAGES} https links on the channel's hosts and paths`);
    if (!Array.isArray(adverts) || adverts.length > MAX_ADVERTS) throw err(400, `adverts: a list of at most ${MAX_ADVERTS}`);
    const bodies = [];
    for (const p of [...new Set(pages)]) bodies.push(await fetchPage(cfg, p, item).catch(() => null));
    const fetched = bodies.filter(b => b !== null);
    const reasons = {}, records = [], seen = new Set();
    const reject = r => { reasons[r] = (reasons[r] ?? 0) + 1; };
    for (const a of adverts) {
      const { out, reason } = advert(a, item);
      if (reason) { reject(reason); continue; }
      const key = urlKey(out.listing_url);
      if (seen.has(key)) continue; // the same advert twice (a featured box): kept once, not a rejection
      const path = new URL(out.listing_url).pathname;
      const linkFound = fetched.some(b => has(b, out.listing_url) || (path.length > 1 && !item.paths.includes(path)
        && !item.paths.includes(`${path}/`) && has(b, path)));
      if (!linkFound) { reject("link_not_on_page"); continue; }
      if (out.price_text !== null && !fetched.some(b => has(b, out.price_text))) { reject("price_not_on_page"); continue; }
      seen.add(key);
      records.push(out);
    }
    const rejected = Object.values(reasons).reduce((s, n) => s + n, 0);
    let fail = null;
    if (!fetched.length) fail = "unavailable";
    else if (rejected * 2 > adverts.length || (adverts.length && !records.length)) fail = "invalid_response";
    keep(f, fail ? { ...q, fail } : { ...q, records });
    log(cfg, `${name} delivered ${adverts.length}, queued ${fail ? 0 : records.length}, rejected ${rejected}`
      + `${fail ? `, reported as ${fail}` : ""} ${JSON.stringify(reasons)}`);
    return { queued: fail ? 0 : records.length, rejected, reasons, ...(fail && { fail }) };
  } finally { cfg.busy.delete(f); }
}

// One step for one queued channel: a fail, or one slice (claim, keep the lease, post). Never two at once per channel.
async function step(cfg, f) {
  const q = read(f), name = `${q.source_ref}/${q.channel_id}`, now = cfg.now();
  const later = (s, why) => { keep(f, { ...q, next_at: now + s * 1000 }); log(cfg, `${name} waits ${s}s (${why})`); };
  if (now - q.at > DAY_MS) { rmSync(f); return log(cfg, `${name} dropped after a day undelivered`); }
  const ids = { run_id: q.run_id, source_ref: q.source_ref, channel_id: q.channel_id };
  if (q.fail) {
    const r = await door(cfg, "POST", "fail", { lease: null, ...ids, reason: q.fail });
    if (r.status === 200) { rmSync(f); return log(cfg, `${name} reported ${q.fail}`); }
    return later(r.status === 409 ? Number(r.json.retry_after_s) || 60 : 60, `fail answered ${r.status}`);
  }
  if (!q.posting) {
    const r = await door(cfg, "POST", "claim", ids);
    if (r.status === 409) return later(Math.max(1, Number(r.json.retry_after_s) || 60), "claim 409");
    if (r.status !== 200 || !r.json.lease) return later(r.status === 404 ? 300 : 60, `claim answered ${r.status}`);
    const records = (q.records ?? []).slice(q.sent, q.sent + SLICE);
    q.posting = { lease: r.json.lease, records, exhausted: q.sent + SLICE >= (q.records ?? []).length };
    keep(f, q); // from here a stop posts this same slice again, never a new one
  }
  const { lease, records, exhausted } = q.posting;
  const r = await door(cfg, "POST", "page", { lease, records, exhausted });
  if (r.status === 200) {
    q.sent += records.length; q.posting = null;
    if (exhausted) { rmSync(f); return log(cfg, `${name} done, ${q.sent} adverts`); }
    keep(f, { ...q, next_at: now + q.min_interval_s * 1000 });
    return log(cfg, `${name} slice posted, ${q.sent}/${q.records.length}`);
  }
  if (r.status === 400) { keep(f, { ...q, posting: null, records: [], fail: "invalid_response" }); return log(cfg, `${name} page refused (400)`); }
  // No answer or a 5xx: the same lease and slice again later. A lost lease (409): the same slice under a new claim.
  if (r.status === 409) { q.posting = null; return later(Math.max(1, Number(r.json.retry_after_s) || 60), "page 409"); }
  return later(30, `page answered ${r.status}`);
}

export async function pump(cfg) {
  mkdirSync(cfg.estado, { recursive: true, mode: 0o700 });
  const due = readdirSync(cfg.estado).filter(n => /^[0-9a-f]{32}\.json$/.test(n)).map(n => join(cfg.estado, n))
    .filter(f => !cfg.busy.has(f) && read(f).next_at <= cfg.now());
  await Promise.all(due.map(async f => {
    cfg.busy.add(f);
    try { await step(cfg, f); } catch { log(cfg, "Hampton App did not answer; retried next round"); }
    finally { cfg.busy.delete(f); }
  }));
}

export async function trabajo(cfg) {
  const w = await work(cfg);
  return { day: w.day ?? null, run_id: w.run_id ?? null,
    items: (w.items ?? []).filter(i => !existsSync(queueFile(cfg, { run_id: w.run_id, ...i }))) };
}

const digest = v => sha(v);
export const callerOk = (header, key) => typeof key === "string" && key.length >= 32
  && timingSafeEqual(digest(/^Bearer (\S+)$/.exec(header ?? "")?.[1] ?? ""), digest(key));
export const privateHost = h => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}(\.\d{1,3})?$/.test(h ?? "")
  || /^(::1|f[cd][0-9a-f]{2}:[0-9a-f:]+)$/i.test(h ?? "");

export function makeServer(cfg) {
  cfg.busy ??= new Set(); cfg.now ??= Date.now;
  mkdirSync(cfg.estado, { recursive: true, mode: 0o700 });
  return createServer(async (req, res) => {
    const reply = (status, v) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(v));
    if (!callerOk(req.headers.authorization, cfg.callerKey)) return reply(401, { error: "Unauthorized" });
    const route = `${req.method} ${req.url}`;
    if (route !== "GET /mercado/trabajo" && route !== "POST /mercado/entregar") return reply(404, { error: "Not found" });
    const tooBig = () => res.writeHead(413, { "content-type": "application/json", connection: "close" })
      .end(JSON.stringify({ error: "Too large" }), () => req.destroy());
    if (Number(req.headers["content-length"]) > MAX_BODY) return tooBig();
    let raw = "";
    try { for await (const c of req) { raw += c; if (raw.length > MAX_BODY) return tooBig(); } } catch { return res.destroy(); }
    try {
      if (req.method === "GET") return reply(200, await trabajo(cfg));
      let body;
      try { body = JSON.parse(raw || "null"); } catch { throw err(400, "Send JSON"); }
      reply(202, await entregar(cfg, body));
    } catch (e) { reply(e.status ?? 502, { error: e.status ? e.message : "Hampton App did not answer" }); }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { APP_ORIGIN: origin, HERMES_MARKET_KEY_FILE: keyFile, CUSTODIO_KEY_FILE: callerFile, ESTADO_DIR: estado,
    LISTEN_HOST: host, LISTEN_PORT: port = "8789" } = process.env;
  const key = keyFile ? readFileSync(keyFile, "utf8").trim() : "", callerKey = callerFile ? readFileSync(callerFile, "utf8").trim() : "";
  if (!/^https:\/\/[^/]+$/.test(origin ?? "") || key.length < 32 || callerKey.length < 32 || callerKey === key || !estado || !privateHost(host)) {
    console.error("Set APP_ORIGIN, HERMES_MARKET_KEY_FILE, CUSTODIO_KEY_FILE (another key of 32+), ESTADO_DIR"
      + " and LISTEN_HOST (a loopback or private address)");
    process.exit(1);
  }
  const cfg = { origin, key, callerKey, estado, fetchFn: fetch };
  makeServer(cfg).on("error", e => { console.error(e.message); process.exit(1); })
    .listen(Number(port), host, () => console.log(`Market custodian on ${host}:${port}`));
  let pumping = false;
  setInterval(() => { if (pumping) return; pumping = true; pump(cfg).finally(() => { pumping = false; }); }, 5000);
}
