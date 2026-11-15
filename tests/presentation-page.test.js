// AGE-12: the client's private page loads nothing from a third party, keeps nothing in the browser, builds no HTML from
// data and never asks for the search again. Its headers are the server's and _headers' (tests/server/presentation-access).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const html = readFileSync(join(__dirname, "../site/presentation.html"), "utf8");
const js = readFileSync(join(__dirname, "../site/presentation.js"), "utf8");

test("no third party, no storage, no HTML from data, no application form", () => {
  assert.deepEqual([...`${html}\n${js}`.matchAll(/(?:src|href)=["']?(?:https?:)?\/\/[^"' >]+/g)].map(m => m[0]), []);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML|insertAdjacentHTML|outerHTML/);
  assert.doesNotMatch(`${html}${js}`, /budget|bedrooms_min|viewing_availability|<input[^>]+type=["']?(email|tel)/i);
  // The token leaves the address bar before anything else is fetched.
  assert.ok(js.indexOf("history.replaceState") < js.indexOf("fetch("));
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});

test("_headers keeps the page out of caches and search engines, with no referrer", () => {
  const rule = readFileSync(join(__dirname, "../site/_headers"), "utf8").split(/^(?=\S)/m).find(b => b.startsWith("/presentation\n"));
  for (const line of ["! Referrer-Policy", "Referrer-Policy: no-referrer", "Cache-Control: no-store", "X-Robots-Tag: noindex"])
    assert.ok(rule?.includes(line), line);
});
