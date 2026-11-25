// BUS-09: the market custodian (hermes/mercado.mjs) against a strict fake app door and fake agency pages on localhost.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer, pump } from "../hermes/mercado.mjs";
import { parsePrice } from "../server/market-hermes.js";

const KEY = "k".repeat(40), CALLER = "c".repeat(40), RUN = "run-1";
const listen = handler => new Promise(ok => { const s = createServer(handler).listen(0, "127.0.0.1", () => ok(s)); });
const body = async req => { let raw = ""; for await (const c of req) raw += c; return raw ? JSON.parse(raw) : null; };

// The fake door: one lease per channel, min_interval_s between claims, ≤10 records, a page key that replays an
// identical post without a second commit, and every commit counted.
function fakeApp(clock, opts = {}) {
  const app = { on: true, claims: 0, pageCalls: 0, commits: [], fails: [], lease: null, lastClaim: -Infinity,
    claim409: opts.claim409 ?? 0, keys: new Map() };
  app.items = [{ source_ref: "src-a", channel_id: "ch-1", hosts: ["agency.test"], paths: ["/to-let"], status: "pending", min_interval_s: 60 }];
  app.handler = async (req, res) => {
    const reply = (s, v) => res.writeHead(s, { "content-type": "application/json" }).end(JSON.stringify(v));
    if (req.headers.authorization !== `Bearer ${KEY}` || !app.on) return reply(404, { error: "Not found" });
    const b = await body(req);
    if (req.url === "/api/hermes/market/work") return reply(200, { day: "2026-11-24", run_id: RUN, items: app.items });
    if (req.url === "/api/hermes/market/claim") {
      app.claims++;
      if (app.claim409 > 0) { app.claim409--; return reply(409, { retry_after_s: 120 }); }
      const wait = Math.ceil((app.lastClaim + 60000 - clock.t) / 1000);
      if (wait > 0 || (app.lease && app.lease.until > clock.t)) return reply(409, { retry_after_s: Math.max(wait, 1) });
      app.lastClaim = clock.t;
      app.lease = { token: `L${app.claims}`, until: clock.t + 120000 };
      return reply(200, { lease: { token: app.lease.token, channel_id: b.channel_id } });
    }
    if (req.url === "/api/hermes/market/page") {
      app.pageCalls++;
      if (!Array.isArray(b.records) || b.records.length > 10 || typeof b.exhausted !== "boolean") return reply(400, { error: "bad" });
      const seen = app.keys.get(b.lease.token);
      if (seen !== undefined) return seen === JSON.stringify(b) ? reply(200, { accepted: true, skipped: 0 }) : reply(409, { retry_after_s: 1 });
      if (!app.lease || app.lease.token !== b.lease.token) return reply(409, { retry_after_s: 1 });
      app.keys.set(b.lease.token, JSON.stringify(b));
      app.commits.push(b); app.lease = null;
      return reply(200, { accepted: true, skipped: 0 });
    }
    if (req.url === "/api/hermes/market/fail") { app.fails.push(b); return reply(200, { ok: true }); }
    reply(404, { error: "Not found" });
  };
  return app;
}

const card = (n, price = `£${1000 + n} pcm`) => `<li><a href="https://agency.test/to-let/home-${n}">Home ${n}</a> ${price.replace("£", "&pound;")}</li>`;
// A synthetic feed in the shape of the ones list pages load with JavaScript: adverts as objects, deep in the document,
// with the link whole or as a path and the amount as a number or a string, never "£" or "pcm".
const FEED = JSON.stringify({ meta: { pagination: { current_page: 1, total_pages: 1 } }, data: { results: [
  { id: 11, link: "https://agency.test/to-let/flat-11", price: 2265, beds: 2, type: { title: "For let" } },
  { id: 12, link: "/to-let/flat-12", price: "625,000.00", beds: 4, type: { title: "For sale" } },
  { id: 13, link: "https://agency.test/to-let/flat-13", pricing: { amount: 1800 }, beds: 1 },
  { id: 14, link: "https://agency.test/to-let/flat-14", price: 1450.5, beds: 3 },
  { id: 15, link: "https://agency.test/to-let/flat-15", price: "£1,950 pw", beds: 2 }] } });
// The review's attacks (25-nov): numbers under keys that are not the price, a path shared by two objects, two links in
// one object, and a filter echo that repeats whatever query Hermes asked for.
const TRICKY = JSON.stringify({ filters: { location: "/to-let/fake", maxPrice: "1200" }, results: [
  { url: "/to-let/x1", section: "/to-let/lettings", price: 2000, groundRent: 250, previousPrice: 2400, minPrice: 900,
    parentId: 17, pricePerSqft: 45, similar: "/to-let/x9" },
  { url: "/to-let/x2", section: "/to-let/lettings", price: 3000 },
  { url: "/to-let/x3", link: "/to-let/x4", price: 1500 }] });
const flat = (n, price_text, extra = {}) => ({ listing_url: `https://agency.test/to-let/flat-${n}`, operation: "rent",
  use: "residential", price_text, ...extra });
const advert = (n, extra = {}) => ({ listing_url: `https://agency.test/to-let/home-${n}`, operation: "rent", use: "residential",
  price_text: `£${1000 + n} pcm`, parish: "St Helier", bedrooms: 2, bathrooms: 1, parking: true, area_sqft: null, title: `Home ${n}`, ...extra });

async function setup(t, opts) {
  const clock = { t: 1_000_000 };
  const app = fakeApp(clock, opts);
  const pages = { "/to-let": `<ul>${Array.from({ length: 30 }, (_, i) => card(i)).join("\n")}</ul>`, "/to-let/empty": "<p>No homes</p>", "/to-let/feed.json": FEED, "/to-let/tricky.json": TRICKY,
    "/to-let/huge.json": JSON.stringify({ results: [{ url: "/to-let/h1", price: 2000,
      ...Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`k${i}`, i])) }] }),
    "/residential-for-rent": '<a href="/property/sea-view-flat/4321">Sea view</a> &pound;2,100 pcm',
    "/to-let/sales": '<a href="https://agency.test/to-let">All</a> <a href="https://agency.test/to-let/big">Big</a> &pound;625,000',
    "/to-let/a": '<nav><a href="/to-let/contact">Contact</a></nav>' + card(1) + '<a href="/to-let/page/2">Next</a>',
    "/to-let/b": '<nav><a href="/to-let/contact">Contact</a> &pound;1 pcm</nav>' + card(2) };
  const appSrv = await listen(app.handler);
  const agency = await listen((req, res) => pages[req.url] === undefined ? res.writeHead(404).end()
    : res.writeHead(200, { "content-type": "text/html" }).end(pages[req.url]));
  const origin = `http://127.0.0.1:${appSrv.address().port}`;
  const net = { lose: 0 };
  const fetchFn = async (url, init) => {
    const u = new URL(url);
    if (u.hostname === "agency.test" || u.hostname === "gaudin.co") return fetch(`http://127.0.0.1:${agency.address().port}${u.pathname}`, init);
    const r = await fetch(url, init);
    if (u.pathname.endsWith("/page") && net.lose > 0) { net.lose--; throw new Error("answer lost"); }
    return r;
  };
  const estado = mkdtempSync(join(tmpdir(), "mercado-"));
  const dns = { address: "93.184.216.34" }; // the agency's address as the custodian resolves it
  const lookupFn = async () => [{ address: dns.address, family: 4 }];
  const mk = () => ({ origin, key: KEY, callerKey: CALLER, estado, fetchFn, lookupFn, now: () => clock.t, log: () => {} });
  const cfg = mk();
  const srv = makeServer(cfg);
  await new Promise(ok => srv.listen(0, "127.0.0.1", ok));
  t.after(() => { srv.close(); appSrv.close(); agency.close(); });
  const call = async (method, path, b, auth = `Bearer ${CALLER}`) => {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}${path}`, { method, headers: { authorization: auth },
      body: b && JSON.stringify(b) });
    return { status: r.status, json: await r.json() };
  };
  const deliver = extra => call("POST", "/mercado/entregar", { run_id: RUN, source_ref: "src-a", channel_id: "ch-1",
    pages: ["https://agency.test/to-let"], ...extra });
  return { clock, app, cfg, mk, call, deliver, net, dns };
}

test("verified adverts pass with only the contract's fields", async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ adverts: [advert(1, { description: "lovely", phone: "07700" }), advert(2), advert(3)] });
  assert.equal(r.status, 202);
  assert.deepEqual(r.json, { queued: 3, rejected: 0, reasons: {} });
  await pump(cfg);
  assert.equal(app.commits.length, 1);
  assert.equal(app.commits[0].exhausted, true);
  assert.deepEqual(app.commits[0].records[0], { listing_url: "https://agency.test/to-let/home-1", operation: "rent",
    use: "residential", price_text: "£1001 pcm", parish: "St Helier", bedrooms: 2, bathrooms: 1, parking: true, area_sqft: null, title: "Home 1" });
});

// One advert not on the page, or one price that is not its own, and nothing of the channel goes on.
for (const [name, bad, reason] of [
  ["an invented link", advert(99), "link_not_on_page"],
  ["an invented price", advert(4, { price_text: "£999 pcm" }), "price_not_on_page"],
  ["a link that is only the prefix of another", { ...advert(1), listing_url: "https://agency.test/to-let/home-" }, "link_not_on_page"],
  ["a cut price (£100 of £1005 pcm)", advert(5, { price_text: "£100" }), "price_not_on_page"],
]) test(`${name} fails the whole delivery`, async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ adverts: [advert(1), advert(2), advert(3), advert(6), bad] });
  assert.deepEqual(r.json, { queued: 0, rejected: 1, reasons: { [reason]: 1 }, fail: "invalid_response" });
  await pump(cfg);
  assert.equal(app.commits.length, 0);
  assert.equal(app.fails[0].reason, "invalid_response");
});

test("swapped prices are rejected: each price must be in its own advert's card", async t => {
  const { deliver } = await setup(t);
  const r = await deliver({ adverts: [advert(1, { price_text: "£1002 pcm" }), advert(2, { price_text: "£1001 pcm" }), advert(3)] });
  assert.deepEqual(r.json, { queued: 0, rejected: 2, reasons: { price_not_on_page: 2 }, fail: "invalid_response" });
});

// A JSON page (a site's own feed): the link and the amount in one object, whatever the depth.
test("a JSON page: adverts pass with their link and amount in the same object, amount as a number or a string", async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ pages: ["https://agency.test/to-let/feed.json?page=1"], adverts: [flat(11, "£2,265 pcm"),
    flat(12, "£625,000", { operation: "sale" }), flat(14, "1450.5pcm"), flat(15, "£1,950 pw")] });
  assert.deepEqual(r.json, { queued: 4, rejected: 0, reasons: {} });
  await pump(cfg);
  // What reaches the door: "£", the verified amount and a period only when the feed gives one (never Hermes's).
  const sent = app.commits[0].records;
  assert.deepEqual(sent.map(x => x.price_text), ["£2,265", "£625,000", "£1,450.50", "£1,950 pw"]);
  assert.deepEqual(parsePrice(sent[1].price_text, "sale").map(x => [x.kind, x.amount_minor, x.period]), [["sale_price", 62500000, "sale"]]);
});

for (const [name, bad, reason] of [
  ["the amount of another object", flat(11, "£1,450.50 pcm"), "price_not_on_page"],
  ["an amount in a child of the link's object", flat(13, "1800"), "price_not_on_page"],
  ["a number of the object that is not the claimed amount", flat(11, "£2,266 pcm"), "price_not_on_page"],
  ["a period the feed contradicts", flat(15, "£1,950 pcm"), "price_not_on_page"],
  ["a price that is not an amount", flat(11, "POA"), "price_not_on_page"],
  ["a number under a key that is not a price (bedrooms)", flat(11, "2"), "price_not_on_page"],
  ["a number under a key that is not a price (id)", flat(11, "11"), "price_not_on_page"],
  ["a link that is not in it", flat(99, "£2,265 pcm"), "link_not_on_page"],
]) test(`a JSON page: ${name} fails the whole delivery`, async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ pages: ["https://agency.test/to-let/feed.json"], adverts: [flat(12, "£625,000", { operation: "sale" }),
    flat(14, "£1,450.50 pcm"), bad] });
  assert.deepEqual(r.json, { queued: 0, rejected: 1, reasons: { [reason]: 1 }, fail: "invalid_response" });
  await pump(cfg);
  assert.equal(app.commits.length, 0);
});

test("a JSON page: a sale with a period is dropped, a let without one keeps only its amount", async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ pages: ["https://agency.test/to-let/feed.json"], adverts: [flat(11, "2265"),
    flat(12, "£625,000 pcm", { operation: "sale" }), flat(14, "£1,450.50 pcm")] });
  assert.deepEqual(r.json, { queued: 2, rejected: 1, reasons: { invalid: 1 } });
  await pump(cfg);
  assert.deepEqual(app.commits[0].records.map(x => x.price_text), ["£2,265", "£1,450.50"]);
});

test("a JSON page: the feed's own operation must agree with Hermes's", async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ pages: ["https://agency.test/to-let/feed.json"], adverts: [flat(11, "£2,265"),
    flat(12, "£625,000"), flat(14, "£1,450.50")] }); // 12 is "For sale" in the feed but delivered as a let
  assert.deepEqual(r.json, { queued: 2, rejected: 1, reasons: { invalid: 1 } });
  await pump(cfg);
  assert.deepEqual(app.commits[0].records.map(x => x.listing_url.slice(-7)), ["flat-11", "flat-14"]);
});

const x = (path, price_text) => ({ listing_url: `https://agency.test/to-let/${path}`, operation: "rent", use: "residential", price_text });
for (const [name, bad, reason] of [
  ["a ground rent", x("x1", "£250"), "price_not_on_page"],
  ["a previous price", x("x1", "£2,400"), "price_not_on_page"],
  ["a minimum price", x("x1", "£900"), "price_not_on_page"],
  ["a parent id", x("x1", "£17"), "price_not_on_page"],
  ["a price per square foot", x("x1", "£45"), "price_not_on_page"],
  ["a section path two objects share", x("lettings", "£3,000"), "link_not_on_page"],
  ["a second link in another advert's object", x("x9", "£2,000"), "link_not_on_page"],
  ["a filter echo", x("fake", "£1,200"), "link_not_on_page"],
  ["an object holding two delivered adverts", x("x4", "£1,500"), "price_not_on_page"],
]) test(`a JSON page refuses ${name}`, async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ pages: ["https://agency.test/to-let/tricky.json"], adverts: [x("x2", "£3,000"), x("x3", "£1,500"), bad] });
  assert.equal(r.json.queued, 0);
  assert.equal(r.json.fail, "invalid_response");
  assert.equal(r.json.reasons[reason] >= 1, true, JSON.stringify(r.json));
  await pump(cfg);
  assert.equal(app.commits.length, 0);
});

test("a JSON page: the real adverts of the tricky feed still pass", async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ pages: ["https://agency.test/to-let/tricky.json"], adverts: [x("x1", "£2,000"), x("x2", "£3,000")] });
  assert.deepEqual(r.json, { queued: 2, rejected: 0, reasons: {} });
  await pump(cfg);
  assert.deepEqual(app.commits[0].records.map(r => r.price_text), ["£2,000", "£3,000"]);
});

test("a JSON page does not switch off the navigation rule of the HTML pages beside it", async t => {
  const { deliver } = await setup(t);
  const r = await deliver({ pages: ["https://agency.test/to-let/a", "https://agency.test/to-let/b", "https://agency.test/to-let/feed.json"],
    adverts: [advert(1), { ...advert(1), listing_url: "https://agency.test/to-let/contact" }] });
  assert.equal(r.json.reasons.not_a_listing >= 1, true, JSON.stringify(r.json));
});

test("a feed with an object too wide to be an advert is not read as a feed: it fails closed", async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ pages: ["https://agency.test/to-let/huge.json"], adverts: [x("h1", "£2,000")] });
  assert.equal(r.json.queued, 0);
  assert.equal(r.json.fail, "invalid_response");
  await pump(cfg);
  assert.equal(app.commits.length, 0);
});

test("HTML stays literal beside a JSON page: the same amount written another way is not the page's price", async t => {
  const { app, cfg, deliver } = await setup(t);
  const pages = ["https://agency.test/to-let", "https://agency.test/to-let/feed.json"];
  const r = await deliver({ pages, adverts: [advert(1), advert(2), flat(11, "£2,265 pcm")] });
  assert.deepEqual(r.json, { queued: 3, rejected: 0, reasons: {} }); // each advert on its own page; the other does not hold it
  await pump(cfg);
  assert.deepEqual(app.commits[0].records.map(x => x.price_text), ["£1001 pcm", "£1002 pcm", "£2,265"]);
  const { app: app2, deliver: again } = await setup(t);
  const bad = await again({ pages, adverts: [advert(1), advert(2), advert(3, { price_text: "£1,003 pcm" })] });
  assert.deepEqual(bad.json, { queued: 0, rejected: 1, reasons: { price_not_on_page: 1 }, fail: "invalid_response" });
  assert.equal(app2.commits.length, 0);
});

test("a null price, a query or a fragment is dropped per advert; the index and a repeat do not count", async t => {
  const { deliver } = await setup(t);
  const r = await deliver({ adverts: [advert(1), advert(2), advert(3), advert(6), advert(7), advert(2),
    advert(8, { price_text: null }),
    { ...advert(4), listing_url: "https://agency.test/to-let/home-4?ref=evil" },
    { ...advert(5), listing_url: "https://agency.test/to-let/home-5#x" },
    { ...advert(0), listing_url: "https://agency.test/to-let", price_text: "£1000 pcm" }] });
  assert.deepEqual(r.json, { queued: 5, rejected: 4, reasons: { no_price: 1, query_or_fragment: 2, not_a_listing: 1 } });
});

test("next-page links and links on every page read (navigation) are not adverts", async t => {
  const { deliver } = await setup(t);
  const r = await deliver({ pages: ["https://agency.test/to-let/a", "https://agency.test/to-let/b"], adverts: [advert(1), advert(2),
    { ...advert(0), listing_url: "https://agency.test/to-let/page/2", price_text: "£1001 pcm" },
    { ...advert(0), listing_url: "https://agency.test/to-let/contact", price_text: "£1 pcm" }] });
  assert.deepEqual(r.json, { queued: 2, rejected: 2, reasons: { not_a_listing: 2 } });
});

test("a list that fills every page slot fails: it may go on beyond them", async t => {
  const { deliver } = await setup(t);
  const pages = Array.from({ length: 20 }, (_, i) => `https://agency.test/to-let${i ? `/p${i}` : ""}`);
  const r = await deliver({ pages, adverts: [advert(1)] });
  assert.equal(r.json.fail, "invalid_response");
});

test("an agency name that resolves to a private address is never fetched", async t => {
  const { app, cfg, deliver, dns } = await setup(t);
  dns.address = "127.0.0.1";
  assert.equal((await deliver({ adverts: [advert(1)] })).json.fail, "unavailable");
  await pump(cfg);
  assert.equal(app.fails[0].reason, "unavailable");
  const { publicAddress } = await import("../hermes/mercado.mjs");
  for (const a of ["10.0.0.1", "172.16.47.20", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1",
    "fe80::1", "::ffff:127.0.0.1"]) assert.equal(publicAddress(a), false, a);
  assert.equal(publicAddress("93.184.216.34"), true);
});

test("Gaudin-shaped: pages under the channel's paths, listings anywhere on its host", async t => {
  const { app, cfg, call } = await setup(t);
  app.items = [{ source_ref: "src-gaudin-co", channel_id: "rent", hosts: ["gaudin.co"], paths: ["/residential-for-rent"],
    status: "pending", min_interval_s: 60 }];
  const ids = { run_id: RUN, source_ref: "src-gaudin-co", channel_id: "rent" };
  const home = { ...advert(0), listing_url: null, price_text: "£2,100 pcm" };
  assert.equal((await call("POST", "/mercado/entregar", { ...ids, pages: ["https://gaudin.co/property/sea-view-flat/4321"],
    adverts: [] })).status, 400); // a page Hermes read must still be under the channel's paths
  const r = await call("POST", "/mercado/entregar", { ...ids, pages: ["https://gaudin.co/residential-for-rent"], adverts: [
    { ...home, listing_url: "https://www.gaudin.co/property/sea-view-flat/4321" },
    { ...home, listing_url: "https://www.gaudin.co/property/sea-view-flat/4321#photos" },
    { ...home, listing_url: "https://evil.test/property/sea-view-flat/4321" },
    { ...home, listing_url: "https://gaudin.co/property/sea-view-flat/4321" }] });
  assert.deepEqual(r.json, { queued: 1, rejected: 2, reasons: { query_or_fragment: 1, off_channel: 1 } });
  await pump(cfg);
  assert.equal(app.commits[0].records[0].listing_url, "https://www.gaudin.co/property/sea-view-flat/4321");
});

// 24-nov: gaudin.je, keys.je and finderskeepers.je all answer 301 to their www. host; the first night failed on it.
test("a redirect to the channel's own host with or without www. is followed; to another host it is not", async t => {
  const { app, cfg, call } = await setup(t);
  app.items = ["rent", "rent2", "rent3"].map(channel_id => ({ source_ref: "src-gaudin-co", channel_id, hosts: ["gaudin.co"],
    paths: ["/residential-for-rent"], status: "pending", min_interval_s: 60 }));
  const orig = cfg.fetchFn, to = { host: "www.gaudin.co" };
  cfg.fetchFn = async (url, init) => {
    const u = new URL(url);
    if (u.hostname === "gaudin.co") return new Response(null, { status: 301, headers: { location: `https://${to.host}${u.pathname}` } });
    return orig(u.hostname === "www.gaudin.co" ? `https://gaudin.co${u.pathname}` : url, init);
  };
  const home = { ...advert(0), listing_url: "https://www.gaudin.co/property/sea-view-flat/4321", price_text: "£2,100 pcm" };
  const send = (channel_id, page = "https://gaudin.co/residential-for-rent") => call("POST", "/mercado/entregar",
    { run_id: RUN, source_ref: "src-gaudin-co", channel_id, pages: [page], adverts: [home] });
  assert.deepEqual((await send("rent")).json, { queued: 1, rejected: 0, reasons: {} });
  // Hermes keeps the address it landed on after the redirect: the www. page is the channel's page.
  assert.equal((await send("rent3", "https://www.gaudin.co/elsewhere")).status, 400);
  assert.deepEqual((await send("rent3", "https://www.gaudin.co/residential-for-rent")).json, { queued: 1, rejected: 0, reasons: {} });
  to.host = "evil.test";
  assert.equal((await send("rent2")).json.fail, "unavailable");
});

test("more than half rejected: the channel is reported as invalid_response, nothing posted", async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ adverts: [advert(1), advert(98), advert(99)] });
  assert.equal(r.json.fail, "invalid_response");
  assert.equal(r.json.queued, 0);
  await pump(cfg);
  assert.equal(app.commits.length, 0);
  assert.deepEqual(app.fails, [{ lease: null, run_id: RUN, source_ref: "src-a", channel_id: "ch-1", reason: "invalid_response" }]);
});

test("slices of 10, exhausted only on the last, min_interval_s between them", async t => {
  const { clock, app, cfg, deliver } = await setup(t);
  await deliver({ adverts: Array.from({ length: 23 }, (_, i) => advert(i)) });
  await pump(cfg);
  await pump(cfg); // too soon: nothing due
  assert.equal(app.claims, 1);
  clock.t += 60000; await pump(cfg);
  clock.t += 60000; await pump(cfg);
  assert.deepEqual(app.commits.map(c => [c.records.length, c.exhausted]), [[10, false], [10, false], [3, true]]);
  assert.equal(new Set(app.commits.flatMap(c => c.records.map(r => r.listing_url))).size, 23);
});

test("a 409 on claim waits its retry_after_s", async t => {
  const { clock, app, cfg, deliver } = await setup(t, { claim409: 1 });
  await deliver({ adverts: [advert(1)] });
  await pump(cfg);
  clock.t += 60000; await pump(cfg);
  assert.equal(app.claims, 1);
  clock.t += 60000; await pump(cfg);
  assert.equal(app.claims, 2);
  assert.equal(app.commits.length, 1);
});

test("a restart resumes the queue without posting a slice twice", async t => {
  const { clock, app, cfg, mk, deliver, net } = await setup(t);
  await deliver({ adverts: Array.from({ length: 23 }, (_, i) => advert(i)) });
  await pump(cfg); // slice 1 posted
  clock.t += 60000;
  net.lose = 1; // slice 2 reaches the app, its answer is lost, then the custodian stops
  await pump(cfg);
  assert.equal(app.commits.length, 2);
  const again = mk(); again.busy = new Set(); // a new process over the same ESTADO_DIR
  clock.t += 30000; await pump(again); // the same lease and slice again: replayed, not committed twice
  assert.equal(app.commits.length, 2);
  assert.equal(app.claims, 2);
  clock.t += 60000; await pump(again);
  assert.deepEqual(app.commits.map(c => [c.records.length, c.exhausted]), [[10, false], [10, false], [3, true]]);
  assert.equal(new Set(app.commits.flatMap(c => c.records.map(r => r.listing_url))).size, 23);
});

test("an empty verified channel is one empty exhausted page", async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ pages: ["https://agency.test/to-let/empty"], adverts: [] });
  assert.deepEqual(r.json, { queued: 0, rejected: 0, reasons: {} });
  await pump(cfg);
  assert.deepEqual(app.commits.map(c => [c.records, c.exhausted]), [[[], true]]);
});

test("a page no one can read is reported as unavailable; a fail from Hermes is passed on", async t => {
  const { app, cfg, call, deliver } = await setup(t);
  assert.equal((await deliver({ pages: ["https://agency.test/to-let/gone"], adverts: [advert(1)] })).json.fail, "unavailable");
  await pump(cfg);
  app.items.push({ source_ref: "src-b", channel_id: "ch-2", hosts: ["b.test"], paths: ["/"], status: "pending", min_interval_s: 60 });
  const r = await call("POST", "/mercado/entregar", { run_id: RUN, source_ref: "src-b", channel_id: "ch-2", fail: "access_denied" });
  assert.equal(r.status, 202);
  await pump(cfg);
  assert.deepEqual(app.fails.map(f => f.reason), ["unavailable", "access_denied"]);
});

test("callers without the key get 401; off-channel pages 400; repeats and unknown channels 409", async t => {
  const { call, deliver } = await setup(t);
  assert.equal((await call("GET", "/mercado/trabajo", null, "Bearer wrong")).status, 401);
  assert.equal((await call("GET", "/mercado/trabajo", null, `Bearer ${KEY}`)).status, 401); // the app's key is not Hermes's
  assert.equal((await deliver({ pages: ["https://evil.test/to-let"], adverts: [] })).status, 400);
  assert.equal((await deliver({ pages: ["https://agency.test/admin"], adverts: [] })).status, 400);
  assert.equal((await call("POST", "/mercado/entregar", { run_id: RUN, source_ref: "x", channel_id: "y", fail: "unavailable" })).status, 409);
  assert.equal((await deliver({ adverts: [advert(1)] })).status, 202);
  assert.equal((await deliver({ adverts: [advert(1)] })).status, 409);
});

test("trabajo lists the app's channels minus the queued ones, and says when the door is off", async t => {
  const { app, call, deliver } = await setup(t);
  assert.equal((await call("GET", "/mercado/trabajo")).json.items.length, 1);
  await deliver({ adverts: [advert(1)] });
  assert.deepEqual((await call("GET", "/mercado/trabajo")).json, { day: "2026-11-24", run_id: RUN, items: [] });
  app.on = false;
  assert.deepEqual(await call("GET", "/mercado/trabajo"), { status: 502, json: { error: "Hampton App answered 404 to market/work" } });
});

test('behind the proxy: IP literals and NO_PROXY hosts are still judged locally', async () => {
  const { publicAddress } = await import('../hermes/mercado.mjs');
  const keep = { ...process.env };
  Object.assign(process.env, { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: 'http://172.16.46.2:3128', NO_PROXY: 'internal.test' });
  try {
    const { _publicHostForTest: ph } = await import('../hermes/mercado.mjs');
    if (ph) {
      assert.equal(await ph({}, '10.0.0.5'), false);
      assert.equal(await ph({}, 'agency.je'), true); // resolves publicly or is left to squid
      assert.equal(await ph({ lookupFn: async () => [{ address: '127.0.0.1' }] }, 'x.internal.test'), false);
    }
    assert.equal(publicAddress('10.0.0.5'), false);
  } finally { for (const k of ['NODE_USE_ENV_PROXY', 'HTTPS_PROXY', 'NO_PROXY']) if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
});
