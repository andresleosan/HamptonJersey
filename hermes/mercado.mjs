// BUS-09 (contract 23-nov-2026, plan docs/roadmap/work/BUS-09/plan-directorio-hermes.md): the market custodian. It runs
// on the VPS in its own container, outside Hermes's, and alone holds the market door's key (HERMES_MARKET_KEY). Hermes
// reaches it on a private network with its own key (CUSTODIO_KEY_FILE) and two calls:
//   GET  /mercado/trabajo   today's channels for Hermes (hosts and paths), minus the ones already queued here;
//   POST /mercado/entregar  a whole channel: {run_id, source_ref, channel_id, pages:[urls read], adverts:[…≤400]}
//                           or {run_id, source_ref, channel_id, fail:"<reason>"}.
// Every advert is checked against the live pages without AI: kept only if its link (or path) and its price text appear
// literally in a page the custodian fetched itself or, when that page is JSON (a site's own feed), if its link and its
// amount are values of the same object. The verified channel waits in a durable queue (ESTADO_DIR) and a loop
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
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
// Where a needle sits as a whole token: "/property/12" is not in "/property/123", "1,950" not in "11,950", "£625" not
// in "£625,000".
const at = (hay, needle) => {
  const found = [];
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    const after = hay.slice(i + needle.length, i + needle.length + 2), before = hay[i - 1] ?? "";
    if (/^[A-Za-z0-9_%-]/.test(after) || (/[0-9]$/.test(needle) && /^[,.][0-9]/.test(after))
      || (/^[0-9]/.test(needle) && /[0-9,.]/.test(before))) continue;
    found.push(i);
  }
  return found;
};
// Spans [start, end] of an advert's link on a page: the whole link or its path.
const linkAt = (hay, url) => [url, new URL(url).pathname].flatMap(n => at(hay, n).map(i => [i, i + n.length]));

// A JSON page, as the advert objects in it under each link they hold; null when the page is not JSON (or too big to be
// a list of adverts: it then fails closed). An advert object is an element of a list, and its link sits under a
// link key (url, link, href…): a link in a filter echo, a section or a "similar" box is not that object's own.
const norm = k => k.replace(/[^a-z]/gi, "").toLowerCase();
const LINK_KEYS = new Set(["url", "link", "href", "permalink", "uri", "path", "detailurl", "propertyurl", "listingurl", "detailsurl"]);
const MAX_NODES = 200_000, MAX_KEYS = 500;
function feed(raw) {
  let json;
  try { json = JSON.parse(raw); } catch { return null; }
  if (!json || typeof json !== "object") return null;
  // inList: this object is an element of a list (a candidate advert). inAdvert: an ancestor already is one, so the lists
  // inside it ("similar homes", photos, history) are not lists of adverts and nothing in them is indexed.
  const by = new Map(), todo = [[json, false, false]];
  let nodes = 0;
  while (todo.length) {
    const [o, inList, inAdvert] = todo.pop();
    const entries = Object.entries(o);
    if ((nodes += entries.length) > MAX_NODES || (!Array.isArray(o) && entries.length > MAX_KEYS)) return null;
    const advertHere = inList && !inAdvert && !Array.isArray(o);
    for (const [k, v] of entries) {
      if (v && typeof v === "object") todo.push([v, Array.isArray(o), inAdvert || advertHere]);
      else if (advertHere && typeof v === "string" && LINK_KEYS.has(norm(k))) (by.get(v) ?? by.set(v, []).get(v)).push(o);
    }
  }
  return by;
}
// A feed has no "£" or "pcm": there a price is an amount, 2265 or "£2,265.50 pcm", read as pence and period.
const PRICE = /^£? ?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?: ?(pcm|pw|pa))?$/i;
function priced(v) {
  const m = (typeof v === "number" || typeof v === "string") && PRICE.exec(String(v).trim());
  const pence = m ? Number(m[1].replaceAll(",", "")) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : 0;
  return pence > 0 && Number.isSafeInteger(pence) ? { pence, period: m[3]?.toLowerCase() ?? null } : null;
}
// An object of a JSON page holds that price: the same pence under a price-like key (never an id, a bedroom count or any
// other number), and the same period when the feed gives one. Returns the feed's own reading, or null.
const PRICE_KEYS = new Set(["price", "rent", "amount", "askingprice", "saleprice", "rentalprice", "displayprice", "pricevalue"]);
const holds = (o, want) => {
  for (const [k, v] of Object.entries(o)) {
    if (!PRICE_KEYS.has(norm(k))) continue;
    const got = priced(v);
    if (got?.pence === want.pence && (!got.period || got.period === want.period)) return got;
  }
  return null;
};
// What the object says about the operation, from its own strings or its children's ("For let", "To let", "For sale");
// null when it says nothing. A feed that contradicts Hermes rejects the advert.
const LET = /\b(for\s+(let|rent)|to\s+let)\b/i, SALE = /\bfor\s+sale\b/i;
function saysOperation(o) {
  const todo = [o]; let rent = false, sale = false, n = 0;
  while (todo.length && n++ < 200) {
    for (const v of Object.values(todo.pop())) {
      if (v && typeof v === "object") todo.push(v);
      else if (typeof v === "string") { rent ||= LET.test(v); sale ||= SALE.test(v); }
    }
  }
  return rent === sale ? null : rent ? "rent" : "sale";
}
// The only price text that goes on from a JSON page, as the app's door reads it: "£2,265 pcm", "£625,000".
const priceText = ({ pence, period }) => `£${String(Math.floor(pence / 100)).replace(/\B(?=(\d{3})+$)/g, ",")}`
  + `${pence % 100 ? `.${String(pence % 100).padStart(2, "0")}` : ""}${period ? ` ${period}` : ""}`;

// Never a private, loopback, link-local or shared (CGNAT) address, checked on every hop before it is fetched.
const PRIVATE = /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|2[3-5]\d\.)/;
export const publicAddress = a => isIP(a) === 4 ? !PRIVATE.test(a)
  : isIP(a) === 6 && !/^(::1?$|f[cd]|fe[89ab]|ff|::ffff:)/i.test(a) && !/^(64:ff9b|2001:db8|100::)/i.test(a);
export async function _publicHostForTest(cfg, host) { return publicHost(cfg, host); }
async function publicHost(cfg, host) {
  if (isIP(host)) return publicAddress(host); // an IP literal is judged here, proxy or not
  const noProxy = (process.env.NO_PROXY ?? process.env.no_proxy ?? "").split(",").map(x => x.trim().replace(/^\*?\./, "")).filter(Boolean);
  const proxied = !cfg.lookupFn && process.env.NODE_USE_ENV_PROXY === "1" && /^http:\/\/172\.16\.46\.2:3128\/?$/.test(process.env.HTTPS_PROXY ?? "")
    && !noProxy.some(n => n === "*" || host === n || host.endsWith(`.${n}`));
  try {
    const all = await (cfg.lookupFn ?? lookup)(host, { all: true, verbatim: true });
    return all.length > 0 && all.every(r => publicAddress(r.address));
  } catch (e) {
    // ponytail: hampton-squid's internal network has no outside DNS. Only when this request goes through that squid,
    // whose global `http_access deny private` sits before every allow, is a failed lookup left to it.
    return proxied && ["ENOTFOUND", "EAI_AGAIN"].includes(e?.code);
  }
}

async function fetchPage(cfg, url, item) {
  for (let hop = 0; hop < 5; hop++) {
    if (!(await publicHost(cfg, new URL(url).hostname))) return null;
    const r = await cfg.fetchFn(url, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html,*/*" },
      signal: AbortSignal.timeout(15000) });
    if (r.status >= 300 && r.status < 400) {
      const next = r.headers.get("location") && new URL(r.headers.get("location"), url).href;
      await r.body?.cancel();
      if (!next || !onHost(next, item)) return null; // redirects stay on the channel's hosts, www. or not (gaudin.je → www.)
      url = next; continue;
    }
    if (!r.ok || !r.body) { await r.body?.cancel(); return null; }
    const chunks = []; let size = 0;
    for await (const c of r.body) { if ((size += c.length) > MAX_PAGE) break; chunks.push(c); }
    return Buffer.concat(chunks).toString("utf8");
  }
  return null;
}

// An advert's own link: https on one of the channel's hosts (www. or not), any path: agencies list under one path
// (/residential-for-rent) and publish each home under another (/property/<slug>/<id>).
const bare = h => h.replace(/^www\./, "");
export function onHost(value, item) {
  let u;
  try { u = new URL(value); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && !u.port && item.hosts.map(bare).includes(bare(u.hostname));
}

// Only the contract's fields go on, each type- and length-checked; anything else (descriptions, names…) is dropped.
const intOrNull = v => v === null || v === undefined ? null : Number.isInteger(v) && v >= 0 && v <= 50 ? v : undefined;
function advert(a, item) {
  if (!a || typeof a !== "object" || typeof a.listing_url !== "string" || a.listing_url.length > 2048
    || !onHost(a.listing_url, item)) return { reason: "off_channel" };
  const u = new URL(a.listing_url);
  if (u.search || u.hash || a.listing_url.includes("#")) return { reason: "query_or_fragment" }; // one advert = one clean link
  if (typeof a.price_text !== "string") return { reason: "no_price" }; // a price ties the advert to its card
  const price = a.price_text ?? null, title = a.title ?? null, area = a.area_sqft ?? null;
  const out = { listing_url: `${u.origin}${u.pathname}`, operation: a.operation, use: a.use,
    price_text: typeof price === "string" ? plain(price) : price, parish: a.parish ?? null,
    bedrooms: intOrNull(a.bedrooms), bathrooms: intOrNull(a.bathrooms), parking: a.parking === true ? true : null,
    area_sqft: area, title: typeof title === "string" ? title.replace(/\s+/g, " ").trim() : title };
  if (!["rent", "sale"].includes(out.operation) || !["residential", "commercial"].includes(out.use)
    || !(typeof out.price_text === "string" && out.price_text && out.price_text.length <= 100)
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
    // Hermes keeps the address its browser landed on: keys.je/ answers from www.keys.je/, so www. or not is the same host.
    const wide = { ...item, hosts: item.hosts.flatMap(h => [bare(h), `www.${bare(h)}`]) };
    if (!Array.isArray(pages) || !pages.length || pages.length > MAX_PAGES || !pages.every(p => typeof p === "string" && inScope(p, wide))) {
      log(cfg, `${name} refused: pages off the channel's hosts and paths`);
      throw err(400, `pages: 1 to ${MAX_PAGES} https links on the channel's hosts and paths`);
    }
    if (!Array.isArray(adverts) || adverts.length > MAX_ADVERTS) throw err(400, `adverts: a list of at most ${MAX_ADVERTS}`);
    const unique = [...new Set(pages)], bodies = [];
    for (const p of unique) bodies.push(await fetchPage(cfg, p, item).catch(() => null));
    const fetched = bodies.filter(b => b !== null).map(b => { const objects = feed(b); return objects ? { objects } : { text: plain(b) }; });
    // An advert's link on a page: its spans in the text, or on a JSON page the objects that hold it (whole or as a path).
    const textSpans = (p, url) => p.objects ? [] : linkAt(p.text, url);
    const holders = (p, url) => p.objects ? [url, new URL(url).pathname].flatMap(n => p.objects.get(n) ?? []) : [];
    const texts = fetched.filter(p => !p.objects), feeds = fetched.filter(p => p.objects); // navigation is per kind of page
    const reasons = {}, seen = new Set(), pageKeys = new Set(pages.map(urlKey)), kept = [];
    const reject = r => { reasons[r] = (reasons[r] ?? 0) + 1; };
    for (const a of adverts) {
      const { out, reason } = advert(a, item);
      if (reason) { reject(reason); continue; }
      const key = urlKey(out.listing_url);
      if (seen.has(key)) continue; // the same advert twice (a featured box): kept once, not a rejection
      seen.add(key);
      const path = new URL(out.listing_url).pathname;
      // Not an advert: the channel's own index, a page Hermes read, a next-page link, or a link on every page read
      // (the site's navigation).
      if (path === "/" || item.paths.some(p => path === p || path === `${p}/` || path === p.replace(/\/$/, ""))
        || pageKeys.has(key) || /\/(page|p)\/?\d+\/?$/i.test(path)
        || (texts.length > 1 && texts.every(p => textSpans(p, out.listing_url).length))
        || (feeds.length > 1 && feeds.every(p => holders(p, out.listing_url).length))) { reject("not_a_listing"); continue; }
      kept.push(out);
    }
    // Each kept advert's price must sit in its own card: an occurrence of the price whose nearest advert link (among all
    // delivered) is this advert's, at most 1,500 characters away. A swapped price is closer to the other advert's link.
    // On a JSON page nothing is literal: the advert's amount must be a value of an object that also holds its link, and
    // what goes on is "£", that amount and the period only when the feed gives it, never Hermes's own text.
    const links = fetched.map(p => kept.map(o => textSpans(p, o.listing_url)));
    // On a feed an advert is one object of its own: its link in exactly one object of each page that holds it, and no
    // object holding the link of two delivered adverts.
    const owners = new Map();
    for (const o of kept) for (const p of feeds) for (const h of new Set(holders(p, o.listing_url))) owners.set(h, (owners.get(h) ?? 0) + 1);
    const records = kept.filter((o, n) => {
      const perPage = feeds.map(p => [...new Set(holders(p, o.listing_url))]).filter(h => h.length);
      if (perPage.some(h => h.length > 1 || owners.get(h[0]) > 1)) { reject("price_not_on_page"); return false; }
      const held = perPage.flat(), want = priced(o.price_text);
      if (!links.some(l => l[n].length) && !held.length) { reject("link_not_on_page"); return false; }
      const match = want && held.map(h => [h, holds(h, want)]).find(([, got]) => got);
      if (match) {
        const [h, got] = match, op = saysOperation(h);
        if ((want.period && o.operation !== "rent") || (op && op !== o.operation)) { reject("invalid"); return false; } // a sale has no period
        // The period goes on only when the feed itself gives it: Hermes's own reading of the period is never passed on,
        // so a let whose feed has no unit reaches the app as an amount without a monthly figure.
        o.price_text = priceText({ pence: want.pence, period: o.operation === "rent" ? got.period : null });
        return true;
      }
      const ok = fetched.some((p, i) => !p.objects && at(p.text, o.price_text).some(q => {
        let best = Infinity, owner = -1;
        links[i].forEach((spans, m) => spans.forEach(([a, z]) => {
          const d = q >= z ? q - z : Math.max(0, a - q); // gap between the price and that link
          if (d < best) { best = d; owner = m; }
        }));
        return owner === n && best <= 1500;
      }));
      if (!ok) reject("price_not_on_page");
      return ok;
    });
    const rejected = Object.values(reasons).reduce((s, n) => s + n, 0);
    let fail = null;
    if (!fetched.length) fail = "unavailable";
    // An advert that is not on the page, or a price that is not its own, means the copy cannot be trusted: nothing of
    // this channel goes on. So does a list that filled every page slot (it may go on beyond them).
    else if (reasons.link_not_on_page || reasons.price_not_on_page || unique.length >= MAX_PAGES
      || rejected * 2 > adverts.length || (adverts.length && !records.length)) fail = "invalid_response";
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
    const chunks = []; let size = 0;
    try { for await (const c of req) { if ((size += c.length) > MAX_BODY) return tooBig(); chunks.push(c); } } catch { return res.destroy(); }
    const raw = Buffer.concat(chunks).toString("utf8");
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
  setInterval(() => { if (pumping) return; pumping = true; pump(cfg).catch(e => console.error(`mercado: queue round failed (${e.code ?? e.name})`))
    .finally(() => { pumping = false; }); }, 5000);
}
