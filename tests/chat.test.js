// Run: node --test tests/chat.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// MSG-02: the pure parts of site/chat.js, loaded as in apply.test.js.
const src = fs.readFileSync(path.join(__dirname, "..", "site", "chat.js"), "utf8");
const load = () => import("data:text/javascript," + encodeURIComponent(src));

test("polls every 5 s the first minute, 15 s to 5 minutes, 30 s to 2 hours, then stops", async () => {
  const { pollDelay } = await load();
  assert.deepEqual([0, 59e3, 60e3, 299e3, 300e3, 7199e3, 7200e3].map(pollDelay), [5000, 5000, 15000, 15000, 30000, 30000, null]);
});

test("the stored chat is dropped after 30 days, the chat's longest life, and holds only the key, a time and the last seen", async () => {
  const { readStore } = await load();
  const now = Date.parse("2026-11-06T12:00:00Z"), day = 864e5, key = "k".repeat(43);
  assert.equal(readStore("{oops", now), null);
  assert.equal(readStore(null, now), null);
  assert.equal(readStore(JSON.stringify({ at: now }), now), null, "no key");
  assert.equal(readStore(JSON.stringify({ key, at: now - 31 * day }), now), null, "older than any chat");
  // At 8 days the server decides: a team reply on day 6 keeps the key working until day 13.
  assert.deepEqual(readStore(JSON.stringify({ key, at: now - 8 * day, seen: 12, name: "Sam" }), now), { key, at: now - 8 * day, seen: 12 });
  assert.deepEqual(readStore(JSON.stringify({ key, at: now }), now), { key, at: now, seen: 0 });
});
