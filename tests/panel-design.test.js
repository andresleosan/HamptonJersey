// Run: node --test tests/panel-design.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("panel labels are not tracked uppercase", () => {
  const css = read("admin/src/styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const tracked = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , rules]) => /text-transform:\s*uppercase/.test(rules))
    .map(([, selector]) => selector.trim());
  assert.deepEqual(tracked, [".btn"], "Only buttons use uppercase panel labels");
});
