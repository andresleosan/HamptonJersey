// PRE-06: the panel's API client when Cloudflare Access asks for its sign-in again. It must say so (typed error, an
// event for the reauth dialog), never follow Access's redirect, never send a write twice, and keep other errors as before.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = new EventTarget();
const events = [];
for (const name of ["hs:access-reauth", "hs:signed-out"]) window.addEventListener(name, () => events.push(name));
const calls = [];
let answer;
globalThis.fetch = async (url, init) => { calls.push({ url, ...init }); return answer(); };
const { api } = await import("../../admin/src/api.js");

const run = async (respond, path = "/admin/listings", opts) => {
  answer = respond; calls.length = 0; events.length = 0;
  try { return { data: await api(path, opts) }; } catch (error) { return { error }; }
};
const redirected = () => ({ type: "opaqueredirect", status: 0, ok: false, headers: new Headers(), json: async () => { throw new Error(); } });
const html = (status = 200) => new Response("<!doctype html><title>Sign in</title>", { status, headers: { "content-type": "text/html" } });

test("Access's redirect, its HTML page or the origin's access_required become ACCESS_REAUTH_REQUIRED", async () => {
  for (const respond of [redirected, () => html(), () => html(403), () => new Response(null, { status: 302, headers: { location: "https://x" } }),
    () => Response.json({ error: "x", code: "access_required" }, { status: 403 })]) {
    const { error } = await run(respond);
    assert.equal(error.code, "ACCESS_REAUTH_REQUIRED");
    assert.equal(error.outcome, undefined, "a read has no uncertain outcome");
    assert.deepEqual(events, ["hs:access-reauth"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].redirect, "manual", "Access's redirect is never followed");
  }
});

test("a write cut off by Access is reported as unknown and is never sent again", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const { error } = await run(redirected, "/admin/listings/HE-R001", { method, body: { title: "x" } });
    assert.equal(error.code, "ACCESS_REAUTH_REQUIRED");
    assert.equal(error.outcome, "unknown");
    assert.match(error.message, /may or may not have been saved/);
    assert.equal(calls.length, 1, method);
  }
});

test("everything else behaves as before", async () => {
  assert.deepEqual((await run(() => Response.json({ ok: 1 }))).data, { ok: 1 });
  const signedOut = await run(() => Response.json({ error: "Please sign in to continue" }, { status: 401 }));
  assert.equal(signedOut.error.status, 401); assert.deepEqual(events, ["hs:signed-out"]);
  const mismatch = await run(() => Response.json({ error: "Different account", code: "access_mismatch" }, { status: 403 }));
  assert.equal(mismatch.error.status, 403); assert.equal(mismatch.error.code, undefined); assert.deepEqual(events, []);
  const down = await run(() => Response.json({ error: "Unavailable", code: "access_unavailable" }, { status: 503 }));
  assert.equal(down.error.status, 503); assert.equal(down.error.message, "Unavailable");
  const conflict = await run(() => Response.json({ error: "Someone else changed it" }, { status: 409 }));
  assert.equal(conflict.error.status, 409); assert.equal(conflict.error.message, "Someone else changed it");
});

test("the panel's own fetch calls (downloads, uploads) use the same check", async () => {
  const { accessReauth } = await import("../../admin/src/api.js");
  events.length = 0;
  assert.equal(await accessReauth(new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/png" } })), null);
  assert.equal(await accessReauth(new Response("a,b", { headers: { "content-type": "text/csv" } })), null);
  assert.equal(await accessReauth(Response.json({ error: "Gone" }, { status: 404 })), null);
  assert.deepEqual(events, []);
  const upload = await accessReauth(redirected(), "POST");
  assert.equal(upload.code, "ACCESS_REAUTH_REQUIRED"); assert.equal(upload.outcome, "unknown");
  const refused = Response.json({ error: "x", code: "access_required" }, { status: 403 });
  assert.equal((await accessReauth(refused)).code, "ACCESS_REAUTH_REQUIRED");
  assert.deepEqual(await refused.json(), { error: "x", code: "access_required" }, "the body is still readable");
  assert.equal((await accessReauth(html())).code, "ACCESS_REAUTH_REQUIRED");
  assert.deepEqual(events, ["hs:access-reauth", "hs:access-reauth", "hs:access-reauth"]);
});
