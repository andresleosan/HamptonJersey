import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeServer } from "../../hermes/key-proxy.mjs";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { request } from "node:http";

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

test("over the limit: 413 and the connection closed, without reading the rest", async () => {
  const p = await start();
  try {
    const { port } = new URL(p.base);
    const answer = await new Promise((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, method: "POST", path: "/api/hermes/pause" }, res => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode, connection: res.headers.connection }));
      });
      req.on("error", reject);
      req.write("x".repeat(163841)); // no content-length: chunked, so the limit is found while reading
      // Never ends the body: a proxy that read to the end would never answer.
    });
    assert.deepEqual(answer, { status: 413, connection: "close" });
    const declared = await fetch(`${p.base}/api/hermes/pause`, { method: "POST", headers: { "content-length": "999999" }, body: "x" })
      .then(r => r.status, () => "refused before the body");
    assert.ok([413, "refused before the body"].includes(declared));
    assert.equal(p.seen.length, 0);
  } finally { p.close(); }
});

test("refuses to listen on every interface", () => {
  const dir = mkdtempSync(`${tmpdir()}/kp-`), file = `${dir}/key`;
  writeFileSync(file, KEY);
  const script = new URL("../../hermes/key-proxy.mjs", import.meta.url).pathname;
  for (const host of ["0.0.0.0", "::", "[::]", ""]) {
    const r = spawnSync(process.execPath, [script], { timeout: 5000, encoding: "utf8",
      env: { APP_ORIGIN: "https://app.example", HERMES_KEY_FILE: file, LISTEN_HOST: host, LISTEN_PORT: "0" } });
    assert.equal(r.status, 1, `LISTEN_HOST=${host}`);
  }
});
