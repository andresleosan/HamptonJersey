// ADM-18: the applicant's page loads nothing from a third party, keeps nothing in the browser, builds no HTML from data,
// takes no file and sends nothing just by opening; switched off, its address answers as before. API: tests/server/adm-18-*.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const html = readFileSync(join(__dirname, "../site/rental-application.html"), "utf8");
const js = html.slice(html.indexOf('<script type="module">'));

test("no third party, no storage, no HTML from data, no upload", () => {
  assert.deepEqual([...html.matchAll(/(?:src|href)=["']?(?:https?:)?\/\/[^"' >]+/g)].map(m => m[0]), []);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML|insertAdjacentHTML|outerHTML/);
  assert.doesNotMatch(html, /type[:=]\s*["']file["']|FormData|multipart/i);
  assert.ok(js.indexOf("history.replaceState") < js.indexOf("fetch("));
  assert.match(js, /addEventListener\("submit"[\s\S]*\/api\/case-access\/challenge/);
  assert.match(js, /if \(token\) \{ await signOut\(\); return askForCode\(\); \}\s*load\(\);/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /href="\/#\/privacy"/);
});

test("_headers keeps the page out of caches and search engines, with no referrer", () => {
  const rule = readFileSync(join(__dirname, "../site/_headers"), "utf8").split(/^(?=\S)/m).find(b => b.startsWith("/rental-application\n"));
  for (const line of ["! Referrer-Policy", "Referrer-Policy: no-referrer", "Cache-Control: no-store", "X-Frame-Options: DENY", "X-Robots-Tag: noindex"])
    assert.ok(rule?.includes(line), line);
});

test("switched off, the page's address serves the site's own page; on, the page", async () => {
  const { onRequest } = await import("../functions/rental-application.js");
  const request = new Request("https://hampton.test/rental-application");
  const env = flag => ({ ADM18_APPLICATION_READY: flag, ASSETS: { fetch: url => `asset:${new URL(url).pathname}` } });
  assert.equal(await onRequest({ request, env: env("0"), next: () => "page" }), "asset:/");
  assert.equal(await onRequest({ request, env: env(undefined), next: () => "page" }), "asset:/");
  assert.equal(await onRequest({ request, env: env("1"), next: () => "page" }), "page");
});
