// Run: node --test tests/check-release.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// The gate reads the site/ next to its own scripts/ folder, so each case runs a copy of it beside a made-up site.
const gate = (pages, env = {}, args = []) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-release-"));
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.copyFileSync(path.join(__dirname, "..", "scripts", "check-release.mjs"), path.join(dir, "scripts", "check-release.mjs"));
  for (const [file, text] of Object.entries(pages)) {
    fs.mkdirSync(path.dirname(path.join(dir, "site", file)), { recursive: true });
    fs.writeFileSync(path.join(dir, "site", file), text);
  }
  const { CF_PAGES, ...rest } = process.env;
  const r = spawnSync(process.execPath, [path.join(dir, "scripts", "check-release.mjs"), ...args],
    { env: { ...rest, ...env }, encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
};
const marked = { "apply.js": "<p>Trading name of TO CONFIRM: legal name, of TO CONFIRM: address.</p>\n",
  "admin/assets/x.js": "TO CONFIRM: not counted" };

test("a local build with markers warns, lists them and goes on", () => {
  const r = gate(marked);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /Warning: 2 TO CONFIRM marker\(s\)/);
  assert.match(r.stderr, /site\/apply\.js:1: TO CONFIRM: legal name/);
  assert.doesNotMatch(r.stderr, /admin/);
});

test("a Cloudflare Pages build with markers fails", () => {
  const r = gate(marked, { CF_PAGES: "1" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /2 TO CONFIRM marker\(s\) left in site\/\. Not ready to release/);
});

test("check:release (--strict) with markers fails locally", () => {
  const r = gate(marked, {}, ["--strict"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /site\/apply\.js:1: TO CONFIRM: address/);
});

test("without markers every mode passes", () => {
  const clean = { "index.html": "<p>Hampton Estates</p>", "admin/assets/x.js": "TO CONFIRM: not counted" };
  for (const [env, args] of [[{}, []], [{ CF_PAGES: "1" }, []], [{}, ["--strict"]]]) {
    const r = gate(clean, env, args);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /No TO CONFIRM markers in site\//);
  }
});
