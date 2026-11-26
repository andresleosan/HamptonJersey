import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";

// MSG-01, Hermes's draft of a Facebook reply (plan-borrador-hermes.md): a drafter asks, Hermes writes through its own
// door, a person uses or discards it and sends it with the usual route. Fictitious ids, names and keys.
const PAGE = "100000000000001", PSID = "200000000000002";
const KEY = "hermes-test-key-hermes-test-key-0123456789", MAIL = "mail-test-key-mail-test-key-0123456789",
  MARKET = "market-test-key-market-test-key-0123456789", RKEY = "reply-test-key-reply-test-key-0123456789";
const ADMIN = "admin@example.test", MIN = 60e3, iso = ms => new Date(ms).toISOString();
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const row = (env, sql, ...args) => ({ ...env.DB.raw.prepare(sql).get(...args) });
const world = ({ on = true, skip = [], drafters = JSON.stringify([ADMIN]) } = {}) => {
  const env = makeEnv({ skip });
  Object.assign(env, { META_MESSAGES_READY: "1", META_APP_SECRET: "fake-secret", META_VERIFY_TOKEN: "fake-verify", META_PAGE_ID: PAGE,
    HERMES_KEY: KEY, HERMES_MAIL_KEY: MAIL, HERMES_MARKET_KEY: MARKET, HERMES_REPLY_KEY: RKEY, ...(on && { MSG01_HERMES_DRAFTS_READY: "1" }) });
  if (drafters !== null) run(env, `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES ('hermes_drafters', ?, ?, 'setup')`, drafters, T0);
  return env;
};
const admin = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie() });
const door = (env, path, body, bearer = RKEY) => call(env, "POST", `/hermes/replies${path}`, { body, bearer, origin: null });
let mid = 0;
const message = (env, id, direction, text, at = iso(Date.now() - 30 * MIN), status = null) => Number(run(env, `INSERT INTO channel_messages
  (conversation_id, direction, text, external_id, status, sent_by, sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, direction, text,
  `m_secret_${++mid}`, status, direction === "out" ? ADMIN : null, at, at).lastInsertRowid);
const conversation = (env, text = "Do you have 2-bed flats to rent?", psid = PSID) => {
  const at = iso(Date.now() - 30 * MIN);
  const id = Number(run(env, `INSERT INTO channel_conversations (channel, account_id, external_user_id, status, waiting_since, last_inbound_at,
    last_at, created_at) VALUES ('messenger', ?, ?, 'waiting', ?, ?, ?, ?)`, PAGE, psid, at, at, at, at).lastInsertRowid);
  message(env, id, "in", text, at);
  return id;
};
const ask = (env, id) => admin(env, "POST", `/admin/facebook/${id}/draft`);
const shown = async (env, id) => (await admin(env, "GET", `/admin/facebook/${id}`)).data.drafts;
const write = async (env, text = "Hello, thanks for getting in touch. We will check and come back to you.") => {
  const { data } = await door(env, "/next");
  assert.ok(data.draft, "a draft was claimed");
  assert.equal((await door(env, `/${data.draft.id}/draft`, { text })).status, 200);
  return data.draft.id;
};

test("switched off or before migration 0130: no panel route, no button, and the door answers 404", async () => {
  for (const [label, env, wrongKey] of [["off", world({ on: false }), 404], ["before 0130", world({ skip: [130] }), 401]]) {
    const id = conversation(env);
    assert.equal((await ask(env, id)).status, 404, label);
    assert.equal((await admin(env, "POST", `/admin/facebook/${id}/draft/1/use`)).status, 404, label);
    assert.equal((await admin(env, "POST", `/admin/facebook/${id}/draft/1/discard`)).status, 404, label);
    const d = await admin(env, "GET", `/admin/facebook/${id}`);
    assert.equal(d.status, 200, label);
    assert.equal("drafts" in d.data, false, label);
    assert.equal((await door(env, "/next", {})).status, 404, label);
    assert.equal((await door(env, "/next", {}, "wrong-key-wrong-key-wrong-key-0123456789")).status, wrongKey, label);
  }
});

test("on, the detail carries drafts only for someone on the drafters list", async () => {
  for (const drafters of [null, "[]", JSON.stringify(["other@example.test"])]) {
    const env = world({ drafters }), id = conversation(env);
    assert.equal((await ask(env, id)).status, 403);
    assert.equal("drafts" in (await admin(env, "GET", `/admin/facebook/${id}`)).data, false);
    assert.equal((await admin(env, "POST", `/admin/facebook/${id}/draft/1/use`)).status, 403);
    assert.equal((await admin(env, "POST", `/admin/facebook/${id}/draft/1/discard`)).status, 403);
    assert.equal(row(env, "SELECT COUNT(*) n FROM channel_reply_drafts").n, 0);
  }
  const env = world(), id = conversation(env);
  assert.deepEqual(await shown(env, id), { draft: null });
  assert.equal((await call(env, "POST", `/admin/facebook/${id}/draft`)).status, 401);
});

test("the door answers 401 without its own key, with a wrong one, and with another door's key", async () => {
  const env = world(), id = conversation(env);
  assert.equal((await ask(env, id)).status, 201);
  assert.equal((await door(env, "/next", {}, null)).status, 401);
  for (const bad of ["wrong-key-wrong-key-wrong-key-0123456789", KEY, MAIL, MARKET]) assert.equal((await door(env, "/next", {}, bad)).status, 401, bad);
  for (const same of [KEY, MAIL, MARKET]) {
    const e = world(); e.HERMES_REPLY_KEY = same; conversation(e);
    assert.equal((await door(e, "/next", {}, same)).status, 401);
  }
  const none = world(); delete none.HERMES_REPLY_KEY;
  assert.equal((await door(none, "/next", {}, RKEY)).status, 401);
  // The reply key opens nothing else.
  assert.equal((await call(env, "GET", "/hermes/status", { bearer: RKEY, origin: null })).status, 401);
  assert.equal((await door(env, "/next", {})).status, 200);
});

test("what the door hands Hermes is the message text only: 10 messages, 4000 characters, no name or id", async () => {
  const env = world(), id = conversation(env, "First message of the thread");
  run(env, "INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at) VALUES ('Alice Contactname', 'alice@example.test', ?, ?, ?)", T0, T0, T0);
  run(env, "UPDATE channel_conversations SET contact_id = 1 WHERE id = ?", id);
  for (let i = 0; i < 12; i++) message(env, id, i % 2 ? "out" : "in", `message ${i} ${"x".repeat(100)}`, iso(Date.now() - (20 - i) * MIN), i % 2 ? "sent" : null);
  message(env, id, "out", "never delivered", iso(Date.now() - 5 * MIN), "failed");
  assert.equal((await ask(env, id)).status, 201);
  const r = await door(env, "/next", {});
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.data.draft).sort(), ["id", "messages"]);
  const ms = r.data.draft.messages;
  assert.equal(ms.length, 10);
  assert.ok(ms.every(m => JSON.stringify(Object.keys(m).sort()) === '["at","direction","text"]' && ["in", "out"].includes(m.direction) && !isNaN(Date.parse(m.at))));
  assert.ok(ms.at(-1).text.startsWith("message 11"), "the newest is last, the failed reply is left out");
  assert.ok(ms[0].at < ms.at(-1).at);
  for (const secret of [PSID, PAGE, "m_secret_", "Alice", "alice@example.test", "contact", "external", "account"]) assert.ok(!r.text.includes(secret), secret);
  // A long thread is cut at 4000 characters in total, keeping the newest.
  const env2 = world(), id2 = conversation(env2, "y".repeat(1500));
  for (let i = 0; i < 4; i++) message(env2, id2, "in", `${i}`.repeat(1500), iso(Date.now() - (9 - i) * MIN));
  await ask(env2, id2);
  const long = (await door(env2, "/next", {})).data.draft.messages;
  assert.ok(long.reduce((n, m) => n + m.text.length, 0) <= 4000);
  assert.ok(long.at(-1).text.startsWith("3333"));
  // One message longer than the cap is cut too.
  const env3 = world(), id3 = conversation(env3, "z".repeat(9000));
  await ask(env3, id3);
  assert.equal((await door(env3, "/next", {})).data.draft.messages[0].text.length, 4000);
});

test("one open draft per conversation, and a new one once it is closed or failed", async () => {
  const env = world(), id = conversation(env), other = conversation(env, "Hello", "200000000000009");
  assert.equal((await ask(env, id)).status, 201);
  assert.equal((await ask(env, id)).status, 409);
  assert.equal((await ask(env, other)).status, 201);
  await write(env);
  assert.equal((await ask(env, id)).status, 409, "a draft ready still counts as open");
  assert.equal(row(env, "SELECT COUNT(*) n FROM channel_reply_drafts WHERE conversation_id = ?", id).n, 1);
  const d = (await shown(env, id)).draft;
  assert.equal((await admin(env, "POST", `/admin/facebook/${id}/draft/${d.id}/discard`)).status, 200);
  assert.equal((await ask(env, id)).status, 201);
  assert.throws(() => run(env, `INSERT INTO channel_reply_drafts (conversation_id, last_message_id, requested_by, created_at)
    VALUES (?, 1, 'x', ?)`, id, T0), /UNIQUE/);
  assert.equal((await ask(env, 9999)).status, 404);
});

test("the full path: ask, Hermes writes, the panel shows it, using it only marks it used and nothing is sent", async () => {
  const env = world(), id = conversation(env), calls = [], real = globalThis.fetch;
  globalThis.fetch = async (...a) => { calls.push(a); return Response.json({}); };
  try {
    assert.equal((await ask(env, id)).status, 201);
    assert.equal((await shown(env, id)).draft.status, "queued");
    const { data } = await door(env, "/next", {});
    assert.equal((await shown(env, id)).draft.status, "working");
    assert.equal((await door(env, `/${data.draft.id}/draft`, { text: "  " })).status, 400);
    assert.equal((await door(env, `/${data.draft.id}/draft`, { text: "x".repeat(2001) })).status, 400);
    assert.equal((await door(env, `/${data.draft.id}/draft`, { text: "Hello, we will check." })).status, 200);
    assert.equal((await door(env, `/${data.draft.id}/draft`, { text: "Again" })).status, 409, "only a claimed draft takes a text");
    assert.equal((await door(env, "/99999/draft", { text: "Hi" })).status, 404);
    const draft = (await shown(env, id)).draft;
    assert.equal(draft.status, "draft");
    assert.equal(draft.text, "Hello, we will check.");
    const used = await admin(env, "POST", `/admin/facebook/${id}/draft/${draft.id}/use`);
    assert.equal(used.status, 200);
    assert.equal(used.data.draft.text, "Hello, we will check.");
    assert.equal(row(env, "SELECT status FROM channel_reply_drafts").status, "used");
    assert.equal((await admin(env, "POST", `/admin/facebook/${id}/draft/${draft.id}/use`)).status, 409);
    assert.deepEqual(await shown(env, id), { draft: null });
    assert.equal(row(env, "SELECT COUNT(*) n FROM channel_messages WHERE direction = 'out'").n, 0);
    assert.equal(calls.length, 0, "nothing left for Facebook");
    assert.equal(row(env, "SELECT status FROM channel_conversations").status, "waiting");
  } finally { globalThis.fetch = real; }
});

test("a draft goes void when they write again or the conversation is handled, and is never offered to use", async () => {
  const env = world(), a = conversation(env), b = conversation(env, "Hi", "200000000000003");
  await ask(env, a); await ask(env, b);
  await write(env); await write(env);
  const da = (await shown(env, a)).draft, db = (await shown(env, b)).draft;
  assert.equal(da.status, "draft");
  message(env, a, "in", "Also, is it pet friendly?", iso(Date.now() - MIN));
  const voided = (await shown(env, a)).draft;
  assert.equal(voided.status, "void");
  assert.equal(voided.text ?? null, null, "a void draft's text is not offered");
  assert.equal((await admin(env, "POST", `/admin/facebook/${a}/draft/${da.id}/use`)).status, 409);
  const last = row(env, "SELECT MAX(id) m FROM channel_messages WHERE conversation_id = ?", b).m;
  assert.equal((await admin(env, "POST", `/admin/facebook/${b}/handled`, { last })).status, 200);
  assert.equal((await shown(env, b)).draft.status, "void");
  assert.equal((await admin(env, "POST", `/admin/facebook/${b}/draft/${db.id}/use`)).status, 409);
  assert.equal((await ask(env, b)).status, 409, "a handled conversation takes no draft");
  // A void draft does not block a new request, and a void one waiting for Hermes is never claimed.
  assert.equal((await ask(env, a)).status, 201);
  assert.equal(row(env, "SELECT status FROM channel_reply_drafts WHERE id = ?", da.id).status, "discarded");
  const c = conversation(env, "Hello", "200000000000004");
  await ask(env, c);
  message(env, c, "in", "Sorry, one more thing", iso(Date.now() - MIN));
  const next = (await door(env, "/next", {})).data.draft;
  assert.equal(next.id, row(env, "SELECT id FROM channel_reply_drafts WHERE conversation_id = ? AND status = 'working'", a).id);
  assert.equal((await door(env, "/next", {})).data.draft, null);
});

test("deleting the conversation deletes its drafts", async () => {
  const env = world(), id = conversation(env);
  await ask(env, id); await write(env);
  assert.equal((await admin(env, "DELETE", `/admin/facebook/${id}`)).status, 204);
  assert.equal(row(env, "SELECT COUNT(*) n FROM channel_reply_drafts").n, 0);
});

test("claim, stale and attempts work like jobs: one UPDATE claims, 10 minutes, 3 attempts, then failed", async () => {
  const env = world(), id = conversation(env);
  await ask(env, id);
  const [one, two] = await Promise.all([door(env, "/next", {}), door(env, "/next", {})]);
  assert.equal([one, two].filter(r => r.data.draft).length, 1, "two polls never get the same draft");
  const draft = row(env, "SELECT * FROM channel_reply_drafts");
  assert.equal(draft.attempts, 1);
  assert.equal((await door(env, "/next", {})).data.draft, null, "just claimed: not offered again");
  const age = min => run(env, "UPDATE channel_reply_drafts SET claimed_at = ? WHERE id = ?", iso(Date.now() - min * MIN), draft.id);
  age(9);
  assert.equal((await door(env, "/next", {})).data.draft, null);
  age(11);
  assert.equal((await door(env, "/next", {})).data.draft.id, draft.id);
  assert.equal(row(env, "SELECT attempts FROM channel_reply_drafts").attempts, 2);
  age(11);
  assert.equal((await door(env, "/next", {})).data.draft.id, draft.id);
  assert.equal(row(env, "SELECT attempts FROM channel_reply_drafts").attempts, 3);
  age(11);
  assert.equal((await door(env, "/next", {})).data.draft, null);
  assert.equal(row(env, "SELECT status FROM channel_reply_drafts").status, "failed");
  assert.equal((await shown(env, id)).draft.status, "failed");
  assert.equal((await ask(env, id)).status, 201, "after a failure the person can ask again");
});

test("Discard closes a draft being written, and a late text from Hermes is refused", async () => {
  const env = world(), id = conversation(env);
  await ask(env, id);
  const { data } = await door(env, "/next", {});
  assert.equal((await admin(env, "POST", `/admin/facebook/${id}/draft/${data.draft.id}/discard`)).status, 200);
  assert.equal((await door(env, `/${data.draft.id}/draft`, { text: "Too late" })).status, 409);
  assert.equal((await admin(env, "POST", `/admin/facebook/${id}/draft/${data.draft.id}/discard`)).status, 409);
});

test("migration 0130 only adds the table and its indexes; both workers carry the same switch, off", () => {
  const sql = readFileSync(new URL("../../migrations/0130_channel_reply_drafts.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.deepEqual([...sql.matchAll(/^\s*(CREATE|ALTER|DROP|UPDATE|DELETE|INSERT)\s+(UNIQUE\s+)?(\w+)/gim)].map(m => `${m[1]} ${m[3]}`.toUpperCase()),
    ["CREATE TABLE", "CREATE INDEX"]);
  assert.match(sql, /ON DELETE CASCADE/);
  const flag = file => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").match(/^MSG01_HERMES_DRAFTS_READY = "(.*)"$/m)?.[1];
  assert.equal(flag("wrangler.toml"), "0");
  assert.equal(flag("jobs/wrangler.toml"), "0");
});

// The Hermes side (hermes/respuestas.mjs): the custodian against the app's own door, with a fake fetch.
test("the replies custodian claims a task with the rules and no id, delivers the text, and never sends", async () => {
  const { siguiente, entregar, RULES, callerOk } = await import("../../hermes/respuestas.mjs");
  const env = world(), id = conversation(env, "Do you have 2-bed flats to rent?"), urls = [];
  await ask(env, id);
  const through = target => async (url, init) => {
    urls.push(String(url).replace("https://app.example.test", ""));
    const bearer = /^Bearer (\S+)$/.exec(init.headers.authorization)[1];
    const r = await call(target, "POST", String(url).replace("https://app.example.test/api", ""), { body: JSON.parse(init.body), bearer, origin: null });
    return new Response(r.text, { status: r.status });
  };
  const cfg = { origin: "https://app.example.test", key: RKEY, fetchFn: through(env) };
  const { task } = await siguiente(cfg);
  assert.deepEqual(Object.keys(task).sort(), ["id", "messages", "rules"]);
  assert.deepEqual(task.rules, RULES);
  assert.match(RULES.join(" "), /English[\s\S]*Never state or guess a price[\s\S]*Never ask for sensitive data/);
  assert.ok(!JSON.stringify(task).includes(PSID));
  assert.deepEqual(await siguiente(cfg), { task: null });
  await assert.rejects(entregar(cfg, { id: task.id, text: " " }), /reply text/);
  await assert.rejects(entregar(cfg, { id: "x", text: "Hi" }), /task's id/);
  assert.deepEqual(await entregar(cfg, { id: task.id, text: "Hello, we will check and come back to you." }), { id: task.id, status: "draft" });
  assert.deepEqual(await entregar(cfg, { id: task.id, text: "Again" }), { skipped: "closed" });
  assert.deepEqual([...new Set(urls)], ["/api/hermes/replies/next", `/api/hermes/replies/${task.id}/draft`]);
  assert.equal(callerOk(`Bearer ${RKEY}`, RKEY), true);
  assert.equal(callerOk(`Bearer ${KEY}`, RKEY), false);
  // Switched off: the custodian finds nothing to do.
  assert.deepEqual(await siguiente({ ...cfg, fetchFn: through(world({ on: false })) }), { task: null });
});
