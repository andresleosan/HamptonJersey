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

// Two tabs share one storage (Codex, second review): what another tab does to the stored chat applies to this tab.
const A = "a".repeat(43), B = "b".repeat(43);
function tabs(chats) {
  const store = new Map(), listeners = [];
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  globalThis.document = { hidden: false };
  globalThis.addEventListener = (type, fn) => { if (type === "storage") listeners.push(fn); };
  const keys = [];
  let hold = null; // a promise that delays the next answer, to put another tab's change in between
  globalThis.fetch = async (url, init) => {
    const key = init.headers.authorization?.slice(7);
    keys.push(key);
    if (hold) { const h = hold; hold = null; await h; }
    return chats[key] ? new Response(JSON.stringify(chats[key])) : new Response(JSON.stringify({ error: "ended" }), { status: 401 });
  };
  // The other tab writes the storage; the browser tells this tab with a storage event (or not yet, with quiet).
  const other = (value, quiet) => {
    value == null ? store.delete("hampton-chat") : store.set("hampton-chat", JSON.stringify(value));
    if (!quiet) listeners.forEach(fn => fn({ key: "hampton-chat" }));
  };
  return { store, keys, other, holdNext: p => { hold = p; }, btn: { textContent: "", hidden: true, setAttribute() {} } };
}
const said = (id, role, at, from = null) => ({ id, role, from, text: `${role} ${id}`, at: new Date(at).toISOString() });

test("another tab's End chat ends it here too, and a late answer never stores it again", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const chats = { [A]: { status: "waiting", listing: null, messages: [said(1, "visitor", NOW - 10e3)] } };
  const w = tabs(chats);
  w.store.set("hampton-chat", JSON.stringify({ key: A, at: NOW - 10e3, seen: 1 }));
  const m = await fresh();
  await m.init({ btn: w.btn, chatOn: false, hidden: () => false });
  assert.equal(w.btn.hidden, false, "a chat to come back to");
  // A poll is on its way when the other tab ends the chat, before this tab hears of it.
  let release;
  w.holdNext(new Promise(r => { release = r; }));
  t.mock.timers.tick(5000); await settle();
  w.other(null, true);
  release(); await settle();
  assert.equal(w.store.get("hampton-chat"), undefined, "the late answer did not store the ended chat again");
  assert.equal(w.btn.hidden, true, "no chat here either, and new chats are off");
  const asked = w.keys.length;
  t.mock.timers.tick(60e3); await settle();
  assert.equal(w.keys.length, asked, "no more polls for the ended chat");
});

test("a chat started in another tab replaces this one: its key, its replies, nothing of the old one", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const chats = {
    [A]: { status: "answered", listing: null, messages: [said(1, "visitor", NOW - 20e3), said(2, "team", NOW - 10e3, "Gilberto · Hampton Estates")] },
    [B]: { status: "answered", listing: null, messages: [said(7, "visitor", NOW - 5e3), said(8, "team", NOW - 4e3, "Hampton Estates"),
      said(9, "team", NOW - 3e3, "Hampton Estates")] },
  };
  const w = tabs(chats);
  w.store.set("hampton-chat", JSON.stringify({ key: A, at: NOW - 10e3, seen: 0 }));
  const m = await fresh();
  await m.init({ btn: w.btn, chatOn: true, hidden: () => false });
  assert.equal(w.btn.textContent, "Message us · 1 new reply");
  w.other({ key: B, at: NOW - 3e3, seen: 7 });
  await settle();
  assert.equal(w.keys.at(-1), B, "it reads the new chat at once");
  assert.equal(w.btn.textContent, "Message us · 2 new replies", "the new chat's replies only, none of the old one");
  t.mock.timers.tick(5000); await settle();
  assert.equal(w.keys.at(-1), B, "and polls it");
  assert.equal(JSON.parse(w.store.get("hampton-chat")).key, B);
  assert.ok(!w.keys.slice(2).includes(A), "the old chat is never asked for again");
});
