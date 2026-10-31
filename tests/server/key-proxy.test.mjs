import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../../hermes/key-proxy.mjs";

// AUT-13, H4: the key's custodian, outside Hermes's container. Hermes calls it with no key; it forwards only the door.
const KEY = "hermes-test-key-hermes-test-key-0123456789";

async function start() {
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, method: init.method, headers: Object.fromEntries(new Headers(init.headers)), body: init.body && Buffer.from(init.body).toString() });
    return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { "content-type": "application/json", "set-cookie": "x=1" } });
  };
  const server = makeServer({ origin: "https://app.example", key: KEY, fetchFn });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  return { seen, base, close: () => server.close() };
}

test("forwards the door's GET and POST with the key, and nothing of the caller's credentials", async () => {
  const p = await start();
  try {
    const r = await fetch(`${p.base}/api/hermes/news?after=4`, { headers: { authorization: "Bearer stolen", cookie: "__Host-hs=x" } });
    assert.equal(r.status, 201);
    assert.deepEqual(await r.json(), { ok: true });
    assert.equal(r.headers.get("set-cookie"), null, "only the body and its type come back");
    const post = await fetch(`${p.base}/api/hermes/jobs/7/draft`, { method: "POST", body: '{"title":"T"}', headers: { "content-type": "application/json" } });
    assert.equal(post.status, 201);
    assert.equal(p.seen.length, 2);
    assert.equal(p.seen[0].url, "https://app.example/api/hermes/news?after=4");
    assert.equal(p.seen[0].method, "GET");
    assert.equal(p.seen[0].headers.authorization, `Bearer ${KEY}`);
    assert.equal(p.seen[0].headers.cookie, undefined);
    assert.equal(p.seen[1].body, '{"title":"T"}');
    assert.equal(p.seen[1].headers["content-type"], "application/json");
  } finally { p.close(); }
});

test("refuses everything else without calling the app", async () => {
  const p = await start();
  try {
    for (const path of ["/api/admin/listings", "/api/hermes", "/api/hermes/../admin/listings", "/api/hermesx/status", "//evil.example/api/hermes/status", "/"])
      assert.equal((await fetch(`${p.base}${path}`)).status, 404, path);
    assert.equal((await fetch(`${p.base}/api/hermes/jobs/1`, { method: "DELETE" })).status, 405);
    assert.equal((await fetch(`${p.base}/api/hermes/pause`, { method: "POST", body: "x".repeat(163841) })).status, 413);
    assert.equal(p.seen.length, 0);
  } finally { p.close(); }
});
