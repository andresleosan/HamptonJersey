// ADM-12: the tenant's repair page loads nothing from a third party, keeps nothing in the browser, builds no HTML from
// data, takes no file or photo and sends nothing just by opening. Its API answers are tested in tests/server/adm-12-tp03-*.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const html = readFileSync(join(__dirname, "../site/repair-report.html"), "utf8");
const js = readFileSync(join(__dirname, "../site/repair-report.js"), "utf8");

test("no third party, no storage, no HTML from data, no upload", () => {
  assert.deepEqual([...`${html}\n${js}`.matchAll(/(?:src|href)=["']?(?:https?:)?\/\/[^"' >]+/g)].map(m => m[0]), []);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML|insertAdjacentHTML|outerHTML/);
  assert.doesNotMatch(`${html}${js}`, /type[:=]\s*["']file["']|FormData|multipart/i);
  // The token leaves the address bar before anything is fetched, and only a click asks for a code.
  assert.ok(js.indexOf("history.replaceState") < js.indexOf("fetch("));
  assert.match(js, /addEventListener\("submit"[\s\S]*\/api\/case-access\/challenge/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
});

// Review 16-nov: on a shared browser, a session left by another link must never show or file into that other tenancy.
test("a link in the address bar always starts its own sign-in, after ending any session; and the tenant can sign out", () => {
  const start = js.slice(js.lastIndexOf("\n(async"));
  assert.match(start, /if \(token\) \{ await signOut\(\); return askForCode\(\); \}\s*load\(\);/);
  assert.match(js, /const signOut = \(\) => fetch\("\/api\/case-access\/sign-out", \{ method: "POST"/);
  assert.match(js, /button\("Sign out", true\)/);
});

test("_headers keeps the page out of caches and search engines, with no referrer", () => {
  const rule = readFileSync(join(__dirname, "../site/_headers"), "utf8").split(/^(?=\S)/m).find(b => b.startsWith("/repair-report\n"));
  for (const line of ["! Referrer-Policy", "Referrer-Policy: no-referrer", "Cache-Control: no-store", "X-Frame-Options: DENY", "X-Robots-Tag: noindex"])
    assert.ok(rule?.includes(line), line);
});
