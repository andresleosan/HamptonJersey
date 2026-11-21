// AUT-17 fase C: Hampton's mail carrier, with Gmail and the app simulated.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { siguiente, entregar, mime } from "../../hermes/correo.mjs";

const TASK = { id: 7, token: "f".repeat(64), kind: "availability", mode: "draft", purpose: "p", rules: "r",
  to: { email: "desk@agency.example.test", name: "Agency Desk" }, facts: { property: { reference: "HE-R001" } } };
function world({ task = TASK, check = { ok: true }, gmail = () => ({ status: 200, body: { id: "d1", message: { id: "m1", threadId: "t1" } } }), resultFails = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "correo-")), tokenFile = join(dir, "token.json"), calls = [];
  writeFileSync(tokenFile, JSON.stringify({ client_id: "c", client_secret: "s", refresh_token: "r" }));
  const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchFn = async (url, o) => {
    calls.push({ url: String(url), body: o.body, auth: o.headers?.authorization });
    if (url.endsWith("/mail/next")) { const t = task; task = null; return answer(200, t ? { task: t } : { task: null, reason: "none" }); }
    if (url.endsWith("/check")) return answer(200, check);
    if (url.endsWith("/result")) return resultFails-- > 0 ? answer(502, {}) : answer(200, { task: { id: 7, status: JSON.parse(o.body).outcome } });
    if (url.includes("oauth2")) return answer(200, { access_token: "a" });
    const g = gmail(url); return g.throws ? Promise.reject(new Error("timeout")) : answer(g.status, g.body);
  };
  return { cfg: { origin: "https://app.test", key: "k".repeat(40), tokenFile, estado: join(dir, "estado"), fetchFn }, calls };
}
const written = { id: 7, subject: "Enquiry\r\nBcc: x@evil.test", body: "Hello", to: "other@evil.test" };
const results = calls => calls.filter(c => c.url.endsWith("/result")).map(c => JSON.parse(c.body).outcome);

test("the model sees neither the address nor the token; the app is asked with the mail key", async () => {
  const { cfg, calls } = world(), out = await siguiente(cfg);
  assert.equal(JSON.stringify(out).includes(TASK.token), false);
  assert.equal(JSON.stringify(out).includes("desk@"), false);
  assert.deepEqual(out.task.to, { name: "Agency Desk" });
  assert.equal(calls[0].auth, `Bearer ${"k".repeat(40)}`);
});

test("a draft goes to the address the app chose, whatever the model wrote, with no added headers", async () => {
  const { cfg, calls } = world();
  await siguiente(cfg);
  assert.deepEqual(await entregar(cfg, written), { id: 7, status: "drafted" });
  const g = calls.find(c => c.url.endsWith("/drafts")), raw = Buffer.from(JSON.parse(g.body).message.raw, "base64url").toString();
  assert.match(raw, /^To: =\?UTF-8\?B\?[^\r\n]+\?= <desk@agency\.example\.test>\r\n/);
  assert.equal(raw.includes("evil"), false);
  assert.equal(raw.split("\r\n\r\n")[0].split("\r\n").length, 5, "To, Subject and three fixed headers only");
  const r = JSON.parse(calls.find(c => c.url.endsWith("/result")).body);
  assert.deepEqual([r.outcome, r.message_id, r.thread_id], ["drafted", "m1", "t1"]);
  await assert.rejects(entregar(cfg, written), /No claim/, "delivered once");
});

test("a send uses messages.send; a check that says no stops it before Gmail; bad text is reported failed", async () => {
  const sent = world({ task: { ...TASK, mode: "send" }, gmail: () => ({ status: 200, body: { id: "m9", threadId: "t9" } }) });
  await siguiente(sent.cfg);
  assert.equal((await entregar(sent.cfg, written)).status, "sent");
  assert.ok(sent.calls.some(c => c.url.endsWith("/messages/send")));
  const stopped = world({ check: { ok: false, reason: "paused" } });
  await siguiente(stopped.cfg);
  assert.deepEqual(await entregar(stopped.cfg, written), { skipped: "paused" });
  assert.equal(stopped.calls.some(c => c.url.includes("gmail")), false);
  const bad = world();
  await siguiente(bad.cfg);
  await entregar(bad.cfg, { id: 7, subject: "", body: "x" });
  assert.deepEqual(results(bad.calls), ["failed"]);
  assert.equal(bad.calls.some(c => c.url.endsWith("/check") || c.url.includes("gmail")), false);
});

test("a lost report goes again on the next poll; a carrier stopped mid-send reports unknown and never calls Gmail twice", async () => {
  const w = world({ resultFails: 1 });
  await siguiente(w.cfg);
  await assert.rejects(entregar(w.cfg, written));
  await siguiente(w.cfg);
  assert.deepEqual(results(w.calls), ["drafted", "drafted"]);
  assert.equal(w.calls.filter(c => c.url.includes("gmail")).length, 1);
  assert.equal(existsSync(join(w.cfg.estado, "7.json")), false);
  const s = world({ task: { ...TASK, mode: "send" } });
  await siguiente(s.cfg);
  const f = join(s.cfg.estado, "7.json");
  writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, "utf8")), sending: true })); // stopped after marking
  await assert.rejects(entregar(s.cfg, written), /Already/);
  await siguiente(s.cfg);
  assert.deepEqual(results(s.calls), ["unknown"]);
  assert.equal(s.calls.some(c => c.url.includes("gmail")), false);
});

test("Gmail's errors: refused is failed, no answer or 5xx is unknown, a bad token never reaches Gmail", async () => {
  for (const [mode, g, outcome] of [["send", { status: 400, body: {} }, "failed"], ["send", { status: 503, body: {} }, "unknown"],
    ["draft", { status: 503, body: {} }, "unknown"], ["send", { throws: true }, "unknown"]]) {
    const e = world({ task: { ...TASK, mode }, gmail: () => g });
    await siguiente(e.cfg);
    await entregar(e.cfg, written);
    assert.deepEqual(results(e.calls), [outcome], `${mode} ${g.status ?? "timeout"}`);
  }
});

test("mime: base64 headers, text wrapped at 76", () => {
  const raw = Buffer.from(mime({ email: "a@b.test", name: "Ñ" }, "Asunto", "x".repeat(300)), "base64url").toString();
  assert.ok(raw.includes(`Subject: =?UTF-8?B?${Buffer.from("Asunto").toString("base64")}?=`));
  assert.ok(raw.split("\r\n\r\n")[1].split("\r\n").every(l => l.length <= 76));
});

test("Google's consent asks only gmail.compose, offline, and keeps the refresh token", async () => {
  const { consentLink, exchange } = await import("../../hermes/correo.mjs");
  const c = { client_id: "id", client_secret: "sec" }, link = new URL(consentLink(c));
  assert.equal(link.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.compose");
  assert.equal(link.searchParams.get("access_type"), "offline");
  const t = await exchange(c, "code", async () => new Response(JSON.stringify({ refresh_token: "rt", access_token: "a" }), { status: 200 }));
  assert.deepEqual([t.type, t.refresh_token, t.client_id], ["authorized_user", "rt", "id"]);
  await assert.rejects(exchange(c, "code", async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })), /refresh token/);
});
