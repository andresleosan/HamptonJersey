// Pure helpers (no DOM): loaded by index.html as a classic script and by tests/lib.test.js via require().
const searchDimensionDefs = typeof module === "object" ? require("./measurement-dimensions.js")
  : typeof SEARCH_DIMENSIONS !== "undefined" && typeof searchPriceCode === "function" ? {SEARCH_DIMENSIONS, searchPriceCode} : null;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// Only https URLs under a known prefix are allowed into src/href attributes (team photos on Wix).
const IMG_HOST = "https://static.wixstatic.com/media/";
const safeUrl = (u, prefix) => {
  // ' ( ) are percent-encoded too, so a URL can't break out of a CSS url('...') value.
  try { const x = new URL(u); return x.protocol === "https:" && x.href.startsWith(prefix) ? x.href.replace(/['()]/g, c => "%" + c.charCodeAt(0).toString(16)) : null; }
  catch { return null; }
};
// Listing media come from our own /media endpoint.
const safeMedia = u => (typeof u === "string" && /^\/media\/[A-Za-z0-9]+(\?thumb)?$/.test(u) ? u : null);
const safeHttps = u => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : null; } catch { return null; } };
// Tours we embed in an iframe; any other https tour is offered as a link.
const EMBED_HOSTS = ["my.matterport.com", "player.vimeo.com", "www.youtube-nocookie.com"];
const embedUrl = u => { const s = safeHttps(u); return s && EMBED_HOSTS.includes(new URL(s).hostname) ? s : null; };

// Today on the office's calendar (Jersey), as the server counts it.
const jerseyToday = (d = new Date()) => new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Jersey"}).format(d);
// "Open viewing: Saturday 10 October, 10:30 to 12:00" summary lines hide themselves once that day has passed (Jersey time).
// ponytail: the year is taken from `today`, so a line typed in December for a January date hides early; add the year then.
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const liveSummary = (lines, today) => lines.filter(l => {
  const m = /^open viewing:.*?\b(\d{1,2})\s+([a-z]+)/i.exec(l), mi = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return mi < 0 || `${today.slice(0, 4)}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` >= today;
});

// Booking form, on GET /api/availability's slots: a negotiator's free times on a day.
const freeTimes = (day, id) => (day?.slots[id] || []).filter(s => !s.booked).map(s => s.time);
// The day and time the form shows as chosen. The wanted day stays while it has a free time, else the first day that
// has one. With no wanted time (the form opening) the first free time is chosen; a wanted time that isn't free (taken
// since, or not one of this negotiator's) leaves none, so the visitor picks it.
function pickSlot(days, id, want = {}) {
  const day = days.find(d => d.date === want.date && freeTimes(d, id).length) || days.find(d => freeTimes(d, id).length);
  if (!day) return {date: null, time: null};
  const free = freeTimes(day, id);
  return {date: day.date, time: !("time" in want) ? free[0] : free.includes(want.time) ? want.time : null};
}
// Only well-formed negotiators, days and slots reach the page; slots are kept per negotiator in the answer.
function parseAvailability(x) {
  if (!x || !Array.isArray(x.negotiators) || !Array.isArray(x.days)) return null;
  const negotiators = x.negotiators.filter(n => n && Number.isInteger(n.id) && n.id > 0 && typeof n.name === "string" && n.name)
    .map(n => ({id: n.id, name: n.name, role: typeof n.role === "string" ? n.role : null}));
  const days = x.days.filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date)).map(d => ({date: d.date,
    slots: Object.fromEntries(negotiators.map(({id}) => [id, (Array.isArray(d.slots?.[id]) ? d.slots[id] : [])
      .filter(s => s && /^\d{2}:\d{2}$/.test(s.time)).map(s => ({time: s.time, booked: s.booked !== false}))]))}));
  return {negotiators, days};
}

const SYM = {GBP: "£", EUR: "€"};
const money = (n, cur) => (SYM[cur] ?? (cur ? `${cur} ` : "")) + Math.round(n).toLocaleString("en-GB");

// Keep in step with server/listing-pricing.js; this file is also a classic browser script.
const priceOperation = p => p.operation !== "business" ? p.operation
  : String(p.tenureType || p.tenure_type || p.tenure || "").trim().toLowerCase() === "freehold" ? "sale" : "rent";
const amount = p => p.operation === "business" ? p.premium ?? null : ({sale: p.salePrice, rent: p.rent})[priceOperation(p)] ?? null;
const priceLabel = p => {
  if (p.operation === "business" && p.premium != null) {
    const premium = money(p.premium, p.currency);
    return p.rent != null && ["month", "year"].includes(p.rentPeriod)
      ? `${premium} premium + ${money(p.rent, p.currency)}${p.rentPeriod === "year" ? " p.a." : " pcm"}` : premium;
  }
  if (p.operation === "business" && p.rent != null && ["month", "year"].includes(p.rentPeriod))
    return `${money(p.rent, p.currency)}${p.rentPeriod === "year" ? " p.a." : " pcm"} (premium not published)`;
  const a = amount(p);
  if (a == null) return "Price not published";
  return money(a, p.currency) + (priceOperation(p) === "rent" ? ({month: " pcm", year: " p.a."}[p.rentPeriod] ?? "") : "");
};
const isSold = p => /^(?:sold|let(?: agreed)?|withdrawn)$/i.test(p.status);
// A closed booking policy does not make the property unavailable for other purposes.
const canBook = p => !isSold(p) && p.viewingsEnabled !== false;
// The listings the website shows: without a public photo a listing stays out of the public pages. The server uses it
// too (server/seo.js), so the sitemap and /p/<id> list and answer exactly what the page can show.
const shownOnSite = p => safeMedia(p.image) != null;

// filter = {region, op, beds, max}; max is in GBP and only applies once an operation is chosen.
function matches(p, f) {
  if (f.region !== "all" && p.region !== f.region) return false;
  if (f.op !== "all" && p.operation !== f.op) return false;
  if (f.beds && !(p.beds >= f.beds)) return false;
  if (f.max && f.op !== "all") {
    const a = amount(p);
    if (a == null || p.currency !== "GBP" || (p.operation === "rent" && p.rentPeriod !== "month") || a > f.max) return false;
  }
  return true;
}

// Same region, operation, use, currency and rent period; within 2x of the price. Fewer results beat bad ones.
function comparables(p, all, n = 3) {
  const a = amount(p);
  if (a == null) return [];
  const gap = x => Math.abs(Math.log(amount(x) / a));
  return all.filter(x => x.id !== p.id && !isSold(x) && x.region === p.region && x.operation === p.operation
      && x.use === p.use && x.currency === p.currency && (p.operation !== "rent" || x.rentPeriod === p.rentPeriod) && amount(x) != null
      && gap(x) <= Math.LN2)
    .sort((x, y) => gap(x) - gap(y)).slice(0, n);
}

// Monthly repayment for an amortising mortgage
const pmt = (principal, annualRate, years) => {
  const r = annualRate / 12, n = years * 12;
  return r === 0 ? principal / n : principal * r / (1 - (1 + r) ** -n);
};

// PUB-22: newest on the website first (publishedAt, migration 0021); listings without a date after. Ties return 0,
// so a stable sort keeps the order they had (the site sorts by region first).
const newestFirst = (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
// The home page's latest: the first n still on the market, from a list already newest first.
const homePicks = (pub, n = 5) => pub.filter(p => !isSold(p)).slice(0, n);
// /properties?op=…&region=…&beds=…&max=…: anything unknown falls back to "all" / 0, never to an empty page.
// Keep catalogue navigation usable with cached older HTML or an unavailable measurement resource.
// The compatibility values are checked against the canonical dimensions in tests.
const CATALOG = searchDimensionDefs ? {op: searchDimensionDefs.SEARCH_DIMENSIONS.operations, region: searchDimensionDefs.SEARCH_DIMENSIONS.regions,
  beds: searchDimensionDefs.SEARCH_DIMENSIONS.bedrooms} : {op: ["sale", "rent", "business"], region: ["jersey", "uk", "international"], beds: [2, 3, 4]};
function readCatalogQuery(search) {
  const q = new URLSearchParams(search), beds = +q.get("beds"), max = q.get("max");
  return {op: CATALOG.op.includes(q.get("op")) ? q.get("op") : "all", region: CATALOG.region.includes(q.get("region")) ? q.get("region") : "all",
    beds: CATALOG.beds.includes(beds) ? beds : 0, max: /^[1-9]\d{0,9}$/.test(max ?? "") ? +max : 0};
}
const catalogQuery = f => {
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v && v !== "all"));
  return String(q) ? `?${q}` : ""; // not q.size: Safari 16 has no size
};
// The filter /properties applies: only what its page shows. With few listings (no filters on the page) just the
// operation and the International choice; a max price only when offered for that operation.
function catalogFilter(search, full, max) {
  const f = readCatalogQuery(search);
  if (!full) return {op: f.op, region: f.region === "international" ? f.region : "all", beds: 0, max: 0};
  return {...f, max: (max[f.op] || []).includes(f.max) ? f.max : 0};
}
// Only the filters actually shown after navigation, and an already loaded result set, may be measured.
function searchAction(f, visible, loaded) {
  if (!searchDimensionDefs) return null; // never measure using compatibility values
  const D = searchDimensionDefs.SEARCH_DIMENSIONS;
  if (loaded !== true || !Array.isArray(visible) || !f ||
      !(f.op === "all" || D.operations.includes(f.op)) || !(f.region === "all" || D.regions.includes(f.region)) ||
      !(f.beds === 0 || D.bedrooms.includes(f.beds)) ||
      !(f.max === 0 || (D.max[f.op] || []).includes(f.max))) return null;
  return {event: "search_applied", version: D.version, op: f.op === "all" ? null : f.op,
    region: f.region === "all" ? null : f.region, beds: f.beds === 0 ? null : String(f.beds),
    max: f.max === 0 ? null : searchDimensionDefs.searchPriceCode(f.op, f.max), zero_results: visible.length === 0};
}
// The category photo: newest matching operation, or international region, with the page fallback if absent.
const buttonPhoto = (pub, op) => [...pub].sort(newestFirst).find(p => op === "international" ? p.region === op : p.operation === op)?.image ?? null;

if (typeof module === "object") module.exports = {searchAction, newestFirst, homePicks, readCatalogQuery, catalogQuery, catalogFilter, buttonPhoto, shownOnSite, jerseyToday, liveSummary, freeTimes, pickSlot, parseAvailability, esc, safeUrl, safeMedia, safeHttps, embedUrl, EMBED_HOSTS, IMG_HOST, money, priceOperation, amount, priceLabel, isSold, canBook, matches, comparables, pmt};
