// BUS-09: the market custodian (hermes/mercado.mjs) against a strict fake app door and fake agency pages on localhost.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeServer, pump } from "../hermes/mercado.mjs";

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
const advert = (n, extra = {}) => ({ listing_url: `https://agency.test/to-let/home-${n}`, operation: "rent", use: "residential",
  price_text: `£${1000 + n} pcm`, parish: "St Helier", bedrooms: 2, bathrooms: 1, parking: true, area_sqft: null, title: `Home ${n}`, ...extra });

async function setup(t, opts) {
  const clock = { t: 1_000_000 };
  const app = fakeApp(clock, opts);
  const pages = { "/to-let": `<ul>${Array.from({ length: 30 }, (_, i) => card(i)).join("\n")}</ul>`, "/to-let/empty": "<p>No homes</p>",
    "/to-let/sales": '<a href="https://agency.test/to-let">All</a> <a href="https://agency.test/to-let/big">Big</a> &pound;625,000' };
  const appSrv = await listen(app.handler);
  const agency = await listen((req, res) => pages[req.url] === undefined ? res.writeHead(404).end()
    : res.writeHead(200, { "content-type": "text/html" }).end(pages[req.url]));
  const origin = `http://127.0.0.1:${appSrv.address().port}`;
  const net = { lose: 0 };
  const fetchFn = async (url, init) => {
    const u = new URL(url);
    if (u.hostname === "agency.test") return fetch(`http://127.0.0.1:${agency.address().port}${u.pathname}`, init);
    const r = await fetch(url, init);
    if (u.pathname.endsWith("/page") && net.lose > 0) { net.lose--; throw new Error("answer lost"); }
    return r;
  };
  const estado = mkdtempSync(join(tmpdir(), "mercado-"));
  const mk = () => ({ origin, key: KEY, callerKey: CALLER, estado, fetchFn, now: () => clock.t, log: () => {} });
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
  return { clock, app, cfg, mk, call, deliver, net };
}

test("a verified advert passes with only the contract's fields; an invented link or price is rejected", async t => {
  const { app, cfg, deliver } = await setup(t);
  const r = await deliver({ adverts: [advert(1, { description: "lovely", phone: "07700" }), advert(2), advert(3),
    advert(99), advert(4, { price_text: "£999 pcm" })] });
  assert.equal(r.status, 202);
  assert.deepEqual(r.json, { queued: 3, rejected: 2, reasons: { link_not_on_page: 1, price_not_on_page: 1 } });
  await pump(cfg);
  assert.equal(app.commits.length, 1);
  assert.equal(app.commits[0].exhausted, true);
  assert.deepEqual(app.commits[0].records[0], { listing_url: "https://agency.test/to-let/home-1", operation: "rent",
    use: "residential", price_text: "£1001 pcm", parish: "St Helier", bedrooms: 2, bathrooms: 1, parking: true, area_sqft: null, title: "Home 1" });
});

test("a link is matched as a whole token, not as the prefix of another listing; a repeated advert counts once", async t => {
  const { deliver } = await setup(t);
  const r = await deliver({ adverts: [advert(1), advert(2), { ...advert(2), listing_url: "https://agency.test/to-let/home-2" + "" },
    { ...advert(1), listing_url: "https://agency.test/to-let/home-" }] });
  assert.equal(r.json.queued, 2);
  assert.equal(r.json.reasons.link_not_on_page, 1);
});

test("a cut price, the index page, a query or a fragment never pass", async t => {
  const { deliver } = await setup(t);
  const sale = { operation: "sale", parish: null, bedrooms: null, bathrooms: null, parking: null, title: null };
  const r = await deliver({ pages: ["https://agency.test/to-let", "https://agency.test/to-let/sales"], adverts: [
    advert(1), advert(2), advert(3), advert(6), advert(7),
    { ...advert(0), ...sale, listing_url: "https://agency.test/to-let/big", price_text: "£625" },
    { ...advert(0), ...sale, listing_url: "https://agency.test/to-let", price_text: null },
    { ...advert(4), listing_url: "https://agency.test/to-let/home-4?ref=evil" },
    { ...advert(5), listing_url: "https://agency.test/to-let/home-5#x" }] });
  assert.deepEqual(r.json, { queued: 5, rejected: 4,
    reasons: { price_not_on_page: 1, not_a_listing: 1, query_or_fragment: 2 } });
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
