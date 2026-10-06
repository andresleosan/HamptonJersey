// Pure helpers (no DOM): loaded by index.html as a classic script and by tests/lib.test.js via require().
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// Only https URLs under a known prefix are allowed into src/href attributes.
const IMG_HOST = "https://static.wixstatic.com/media/", SRC_HOST = "https://www.hamptonestatesjersey.com/";
const safeUrl = (u, prefix) => {
  // ' ( ) are percent-encoded too, so a URL can't break out of a CSS url('...') value.
  try { const x = new URL(u); return x.protocol === "https:" && x.href.startsWith(prefix) ? x.href.replace(/['()]/g, c => "%" + c.charCodeAt(0).toString(16)) : null; }
  catch { return null; }
};

const SYM = {GBP: "£", EUR: "€"};
const money = (n, cur) => (SYM[cur] ?? `${cur} `) + Math.round(n).toLocaleString("en-GB");

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

if (typeof module === "object") module.exports = {esc, safeUrl, IMG_HOST, SRC_HOST, money, amount, priceLabel, isSold, matches, comparables, pmt};
