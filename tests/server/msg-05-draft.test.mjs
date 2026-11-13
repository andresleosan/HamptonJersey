import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie, T0 } from "./helpers.mjs";

const addChat = env => {
  const id = Number(env.DB.raw.prepare(`INSERT INTO chats
    (key_hash, name, email, phone, privacy_ack_at, created_at, last_at, waiting_since)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run("fixture-chat-hash", "Sample Visitor", "visitor@example.test",
      "+447700900123", T0, T0, T0, T0).lastInsertRowid);
  env.DB.raw.prepare("INSERT INTO chat_messages (chat_id, role, text, created_at) VALUES (?, 'visitor', ?, ?)")
    .run(id, "A private conversation, not confirmed requirements", T0);
  return id;
};
const count = (env, table) => env.DB.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const get = async (env, id) => call(env, "GET", `/admin/chats/${id}/applicant-draft`, { cookie: await adminCookie() });

test("a private draft only proposes the current chat contact without creating a contact or search", async () => {
  const env = makeEnv(), id = addChat(env);
  const response = await get(env, id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(response.data, {
    chat_id: id, chat_version: null,
    contact: { name: "Sample Visitor", email: "visitor@example.test", phone: "+447700900123" },
    fields: {}, provenance: { contact: "chat", fields: "none" }, save_available: false,
  });
  assert.equal(count(env, "contacts"), 0);
  assert.equal(count(env, "applicants"), 0);
  assert.equal(count(env, "events"), 0);
  assert.ok(!JSON.stringify(response.data).includes("private conversation"));
});

test("draft retrieval requires staff and returns nothing for a deleted chat", async () => {
  const env = makeEnv(), id = addChat(env);
  assert.equal((await call(env, "GET", `/admin/chats/${id}/applicant-draft`)).status, 401);
  env.DB.raw.prepare("DELETE FROM chats WHERE id = ?").run(id);
  const response = await get(env, id);
  assert.equal(response.status, 404);
  assert.ok(!JSON.stringify(response.data).includes("visitor@example.test"));
  assert.equal(count(env, "contacts"), 0);
});

test("draft retrieval does not auto-link an existing person by name or infer consent", async () => {
  const env = makeEnv(), id = addChat(env);
  env.DB.raw.prepare(`INSERT INTO contacts (name, email, last_activity_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`).run("Sample Visitor", "another@example.test", T0, T0, T0);
  const response = await get(env, id);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.data.contact).sort(), ["email", "name", "phone"]);
  assert.equal(response.data.contact.email, "visitor@example.test");
  assert.equal(count(env, "contacts"), 1);
  assert.equal(count(env, "applicants"), 0);
});

test("draft reads reject cross-origin and cross-site metadata while allowing same-origin and absent browser headers", async () => {
  const { handleApi } = await import("../../server/api.js");
  const { ORIGIN } = await import("./helpers.mjs");
  const env = makeEnv(), id = addChat(env), cookie = await adminCookie();
  const totalChanges = () => env.DB.raw.prepare("SELECT total_changes() AS n").get().n;
  const before = totalChanges();
  const read = async (headers = {}, authenticated = true) => {
    const request = new Request(`${ORIGIN}/api/admin/chats/${id}/applicant-draft`, {
      headers: { ...(authenticated ? { cookie } : {}), ...headers },
    });
    return handleApi(request, env, ["admin", "chats", String(id), "applicant-draft"]);
  };
  const cases = [
    [{}, false, 401],
    [{ origin: "https://other.example.test" }, true, 403],
    [{ "sec-fetch-site": "cross-site" }, true, 403],
    [{ "sec-fetch-site": "same-site" }, true, 403],
    [{ origin: ORIGIN, "sec-fetch-site": "cross-site" }, true, 403],
    [{ origin: "null" }, true, 403],
    [{ origin: ORIGIN, "sec-fetch-site": "same-origin" }, true, 200],
    [{ "sec-fetch-site": "none" }, true, 200],
    [{}, true, 200],
  ];
  for (const [headers, authenticated, status] of cases) {
    const result = await read(headers, authenticated);
    assert.equal(result.status, status, `response for ${JSON.stringify(headers)}`);
    assert.equal(result.headers.get("cache-control"), "no-store");
    if (status !== 200) assert.ok(!(await result.text()).includes("visitor@example.test"));
  }
  assert.equal(totalChanges(), before, "draft requests do not write any database row");
});
