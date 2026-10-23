// Run: node --test tests/design.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const FILES = { site: read("site/index.html"), panel: read("admin/src/styles.css") };

const PALETTE = {
  "--ink": "#151515", "--paper": "#ffffff", "--mist": "#f4f3f0", "--line": "#e3e0da", "--stone": "#6b665e",
  "--bronze": "#a56b3d", "--bronze-dk": "#86542d", "--ok": "#2f6b4f", "--err": "#a32020", "--warn-bg": "#fff6e5",
  "--field-line": "#8f8a82",
};

// Colour tokens (--name:#hex) of the first :root{…} block in a file.
function tokens(src) {
  const root = src.match(/:root\s*\{([^}]*)\}/);
  assert.ok(root, "no :root block");
  return Object.fromEntries([...root[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{6})\b/gi)].map(m => [m[1], m[2].toLowerCase()]));
}

// WCAG 2.x contrast ratio between two #rrggbb colours.
function contrast(a, b) {
  const lum = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("site and panel share the palette", () => {
  const site = tokens(FILES.site), panel = tokens(FILES.panel);
  for (const [name, hex] of Object.entries(PALETTE)) {
    assert.equal(site[name], hex, `site ${name}`);
    assert.equal(panel[name], hex, `panel ${name}`);
  }
});

test("text pairs meet WCAG AA", () => {
  const t = { ...tokens(FILES.panel), ...tokens(FILES.site) };
  const pairs = [
    ["--stone on mist", t["--stone"], t["--mist"], 4.5],
    ["--stone on paper", t["--stone"], t["--paper"], 4.5],
    ["--bronze-dk on paper", t["--bronze-dk"], t["--paper"], 4.5],
    ["paper on --bronze-dk", t["--paper"], t["--bronze-dk"], 4.5],
    ["--bronze-on-dark on #1f1f1f", t["--bronze-on-dark"], "#1f1f1f", 4.5],
    ["--field-line on #fbfaf8", t["--field-line"], "#fbfaf8", 3],
  ];
  for (const [label, fg, bg, min] of pairs) {
    assert.ok(fg && bg, `${label}: token missing`);
    assert.ok(contrast(fg, bg) >= min, `${label}: ${contrast(fg, bg).toFixed(2)} < ${min}`);
  }
});

test("bronze is never used as text colour", () => {
  for (const [name, src] of Object.entries(FILES)) {
    const hits = src.split("\n").filter(l => /(^|[;{\s])color:\s*var\(--bronze\)/m.test(l));
    assert.deepEqual(hits, [], `${name} uses --bronze as text colour`);
  }
});
