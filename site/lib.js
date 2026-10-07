// Pure helpers (no DOM): loaded by index.html as a classic script and by tests/lib.test.js via require().
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

// Viewings follow the office's calendar (Jersey), like the server: from tomorrow, never on Sunday.
const jerseyToday = (d = new Date()) => new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Jersey"}).format(d);
// "Open viewing: Saturday 10 October, 10:30 to 12:00" summary lines hide themselves once that day has passed (Jersey time).
// ponytail: the year is taken from `today`, so a line typed in December for a January date hides early; add the year then.
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const liveSummary = (lines, today) => lines.filter(l => {
  const m = /^open viewing:.*?\b(\d{1,2})\s+([a-z]+)/i.exec(l), mi = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return mi < 0 || `${today.slice(0, 4)}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` >= today;
});
const nextViewingDay = today => {
  const d = new Date(today + "T12:00:00Z");
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0);
  return d.toISOString().slice(0, 10);
};

const SYM = {GBP: "£", EUR: "€"};
const money = (n, cur) => (SYM[cur] ?? (cur ? `${cur} ` : "")) + Math.round(n).toLocaleString("en-GB");

// Sale price, rent and business premium are separate fields; unknown stays null (never 0).
const amount = p => ({sale: p.salePrice, rent: p.rent, business: p.premium})[p.operation] ?? null;
const priceLabel = p => {
  const a = amount(p);
  if (a == null) return "Price not published";
  return money(a, p.currency) + (p.operation === "rent" ? ({month: " pcm", year: " p.a."}[p.rentPeriod] ?? "") : "");
};
const isSold = p => /sold/i.test(p.status);

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
      && x.use === p.use && x.currency === p.currency && x.rentPeriod === p.rentPeriod && amount(x) != null
      && gap(x) <= Math.LN2)
    .sort((x, y) => gap(x) - gap(y)).slice(0, n);
}

// Monthly repayment for an amortising mortgage
const pmt = (principal, annualRate, years) => {
  const r = annualRate / 12, n = years * 12;
  return r === 0 ? principal / n : principal * r / (1 - (1 + r) ** -n);
};

if (typeof module === "object") module.exports = {jerseyToday, liveSummary, nextViewingDay, esc, safeUrl, safeMedia, safeHttps, embedUrl, EMBED_HOSTS, IMG_HOST, money, amount, priceLabel, isSold, matches, comparables, pmt};
