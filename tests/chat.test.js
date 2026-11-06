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

// The scheduler through init(): a fake browser (storage, fetch, document) and mocked timers. A fresh copy of the module
// per test, so its state starts empty.
let copy = 0;
const fresh = () => import("data:text/javascript," + encodeURIComponent(src + `\n// ${++copy}`));
function browser(lastAt) {
  const store = new Map([["hampton-chat", JSON.stringify({ key: "k".repeat(43), at: lastAt, seen: 0 })]]);
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  globalThis.document = { hidden: false };
  globalThis.addEventListener = () => {};
  const gets = [];
  globalThis.fetch = async url => {
    gets.push(url);
    return new Response(JSON.stringify({ status: "answered", listing: null,
      messages: [{ id: 1, role: "visitor", from: null, text: "Hi", at: new Date(lastAt).toISOString() }] }));
  };
  return { gets, btn: { textContent: "", hidden: true, setAttribute() {} } };
}
const settle = () => new Promise(r => setImmediate(r));
const NOW = Date.parse("2026-11-06T12:00:00Z");

test("a recent chat keeps polling: every 5 s in its first minute", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const { gets, btn } = browser(NOW - 10e3);
  const m = await fresh();
  await m.init({ btn, chatOn: true, hidden: () => false });
  assert.equal(gets.length, 1, "one look on load");
  for (const n of [2, 3]) { t.mock.timers.tick(5000); await settle(); assert.equal(gets.length, n); }
});

test("a chat quiet for over 2 hours is not polled in the background", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const { gets, btn } = browser(NOW - 3 * 3600e3);
  const m = await fresh();
  await m.init({ btn, chatOn: true, hidden: () => false });
  t.mock.timers.tick(10 * 60e3); await settle();
  assert.equal(gets.length, 1);
});

test("opening the chat starts the polling period again, however old its last message", async () => {
  const { nextPoll } = await load();
  const old = NOW - 3 * 3600e3;
  assert.equal(nextPoll(NOW, old, 0), null, "never opened on this page: quiet");
  assert.equal(nextPoll(NOW, old, NOW), 5000, "just opened: every 5 s");
  assert.equal(nextPoll(NOW + 2 * 60e3, old, NOW), 15000, "2 minutes after opening");
  assert.equal(nextPoll(NOW, NOW - 10e3, NOW - 3 * 3600e3), 5000, "a recent message counts too");
});
