// AUT-17 fase C: Hampton's mail carrier, with Gmail and the app simulated.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { siguiente, entregar, mime, consentLink } from "../../hermes/correo.mjs";

const TASK = { id: 7, token: "f".repeat(64), kind: "availability", mode: "draft", purpose: "p", rules: "r",
  to: { email: "desk@agency.example.test", name: "Agency Desk" }, facts: { property: { reference: "HE-R001" } } };
function world({ task = TASK, check = { ok: true }, gmail = () => ({ status: 200, body: { id: "d1", message: { id: "m1", threadId: "t1" } } }), resultFails = 0, outbound = [], threads = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "correo-")), tokenFile = join(dir, "token.json"), calls = [];
  writeFileSync(tokenFile, JSON.stringify({ client_id: "c", client_secret: "s", refresh_token: "r" }));
  const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchFn = async (url, o) => {
    calls.push({ url: String(url), body: o.body, auth: o.headers?.authorization });
    if (url.endsWith("/outbound/next")) { const e = outbound.shift() ?? null; return answer(200, { email: e }); }
    if (/\/outbound\/[a-f0-9]{32}\/result$/.test(url)) return answer(200, { ok: true });
    if (url.endsWith("/mail/next")) { const t = task; task = null; return answer(200, t ? { task: t } : { task: null, reason: "none" }); }
    if (url.endsWith("/check")) return answer(200, check);
    if (url.endsWith("/mail/threads")) return answer(200, { threads });
    if (url.endsWith("/mail/replies")) return answer(200, { stored: JSON.parse(o.body).messages.length });
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
  assert.equal(calls.find(c => c.url.endsWith("/mail/next")).auth, `Bearer ${"k".repeat(40)}`);
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

test("the carrier answers only Hermes's key, and listens only on a private address", async () => {
  const { makeCarrier, callerOk, privateHost } = await import("../../hermes/correo.mjs");
  const { cfg } = world(), callerKey = "h".repeat(40), server = makeCarrier({ ...cfg, callerKey });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/siguiente`;
  try {
    assert.equal((await fetch(url, { method: "POST" })).status, 401);
    assert.equal((await fetch(url, { method: "POST", headers: { authorization: `Bearer ${"x".repeat(40)}` } })).status, 401);
    assert.equal((await fetch(url, { method: "POST", headers: { authorization: `Bearer ${callerKey}` } })).status, 200);
  } finally { server.close(); }
  assert.equal(callerOk(`Bearer ${callerKey}`, "short"), false, "no key configured: closed");
  for (const h of ["127.0.0.1", "10.0.0.5", "172.16.45.2", "192.168.1.9", "::1", "fd00::5"]) assert.equal(privateHost(h), true, h);
  for (const h of ["0.0.0.0", "::", "8.8.8.8", "172.32.0.1", "", undefined]) assert.equal(privateHost(h), false, String(h));
});

test("the app's approved queue goes first, verbatim and always sent, before any task Hermes writes", async () => {
  const email = { ref: "a".repeat(32), token: "t".repeat(36), to: "team@example.test", subject: "Hampton summary [HE-OUT-x]", text: "Counts" };
  const w = world({ outbound: [email], gmail: () => ({ status: 200, body: { id: "m5", threadId: "t5" } }) });
  const out = await siguiente(w.cfg);
  const send = w.calls.findIndex(c => c.url.endsWith("/messages/send")), next = w.calls.findIndex(c => c.url.endsWith("/mail/next"));
  assert.ok(send >= 0 && send < next, "queue first");
  const raw = Buffer.from(JSON.parse(w.calls[send].body).raw, "base64url").toString();
  assert.ok(raw.includes("<team@example.test>"));
  assert.ok(raw.includes(Buffer.from("Counts").toString("base64")));
  const r = JSON.parse(w.calls.find(c => /outbound\/a{32}\/result$/.test(c.url)).body);
  assert.deepEqual([r.outcome, r.message_id], ["sent", "m5"]);
  assert.equal(out.task.id, 7);
});

test("the queue: Google down claims nothing; a rate limit is retry and stops the run; no Gmail id is unknown", async () => {
  const email = n => ({ ref: String(n).repeat(32), token: "t".repeat(36), to: "team@example.test", subject: "S", text: "T" });
  const down = world({ outbound: [email(1)] });
  down.cfg.fetchFn = (orig => async (url, o) => String(url).includes("oauth2") ? new Response("{}", { status: 500 }) : orig(url, o))(down.cfg.fetchFn);
  await siguiente(down.cfg);
  assert.equal(down.calls.some(c => c.url.endsWith("/outbound/next")), false, "nothing claimed while Google's token fails");
  const limited = world({ outbound: [email(2), email(3)], gmail: () => ({ status: 429, body: {} }) });
  await siguiente(limited.cfg);
  const posted = limited.calls.filter(c => /outbound\/\d{32}\/result$/.test(c.url)).map(c => JSON.parse(c.body).outcome);
  assert.deepEqual(posted, ["retry"], "one tried, the run stops");
  const noId = world({ outbound: [email(4)], gmail: () => ({ status: 200, body: {} }) });
  await siguiente(noId.cfg);
  assert.deepEqual(noId.calls.filter(c => /outbound\/4{32}\/result$/.test(c.url)).map(c => JSON.parse(c.body).outcome), ["unknown"]);
});

// Fase D: the replies in the threads the app names, read by the carrier (never the model) and handed to the app.
const b64 = v => Buffer.from(v, "utf8").toString("base64url");
const THREAD = { id: "t1", messages: [
  { id: "m1", internalDate: String(Date.parse("2026-11-24T10:00:00Z")), labelIds: ["SENT"], payload: { mimeType: "text/plain", headers: [], body: { data: b64("ours") } } },
  { id: "g1", internalDate: String(Date.parse("2026-11-24T11:00:00Z")), labelIds: ["INBOX"], payload: { mimeType: "multipart/alternative",
    headers: [{ name: "From", value: "Agency Desk <desk@agency.example.test>" }, { name: "Subject", value: "Re: Enquiry" },
      { name: "Message-ID", value: "<r1@agency>" }, { name: "In-Reply-To", value: "<m1@gmail>" }, { name: "Auto-Submitted", value: "auto-replied" },
      { name: "X-Autoreply", value: "yes" }],
    parts: [{ mimeType: "text/html", body: { data: b64("<p>Yes</p>") } }, { mimeType: "text/plain", body: { data: b64("Yes, still available.") } }] } }] };

test("the carrier reads only the threads the app names and hands their replies to the app, not to the model", async () => {
  const { cfg, calls } = world({ threads: [{ id: "t1", after: "2026-11-24T10:00:00.000Z" }],
    gmail: url => url.includes("/threads/t1") ? { status: 200, body: THREAD } : { status: 404, body: {} } });
  const out = await siguiente(cfg);
  assert.equal(JSON.stringify(out).includes("still available"), false, "the model sees no reply");
  assert.ok(calls.some(c => c.url.endsWith("/users/me/threads/t1?format=full")));
  assert.equal(calls.some(c => /\/messages\?|q=/.test(c.url)), false, "never a mailbox search");
  const sent = JSON.parse(calls.find(c => c.url.endsWith("/mail/replies")).body);
  assert.equal(sent.thread_id, "t1");
  assert.deepEqual(sent.messages, [{ id: "g1", at: "2026-11-24T11:00:00.000Z", from: "Agency Desk <desk@agency.example.test>", subject: "Re: Enquiry",
    message_id: "<r1@agency>", in_reply_to: "<m1@gmail>", references: null, auto_submitted: "auto-replied", precedence: null,
    autoreply: true, content_type: "multipart/alternative", text: "Yes, still available." }]);
});

test("without the read permission (Gmail 403) the carrier hands nothing and Hermes still gets its task", async () => {
  const { cfg, calls } = world({ threads: [{ id: "t1", after: "2026-11-24T10:00:00.000Z" }], gmail: () => ({ status: 403, body: {} }) });
  const out = await siguiente(cfg);
  assert.equal(out.task.id, 7);
  assert.equal(calls.some(c => c.url.endsWith("/mail/replies")), false);
});

test("the consent asks to read the mailbox only when Luis sets GMAIL_LEER", () => {
  const scope = read => new URL(consentLink({ client_id: "c" }, read)).searchParams.get("scope");
  assert.equal(scope(false), "https://www.googleapis.com/auth/gmail.compose");
  assert.equal(scope(true), "https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.readonly");
});

test("a thread the app refuses, or a 403 on a later thread, does not stop the other threads", async () => {
  let refused = false;
  const { cfg, calls } = world({ threads: [{ id: "t1", after: "2026-11-24T10:00:00.000Z" }, { id: "t2", after: "2026-11-24T10:00:00.000Z" },
    { id: "t3", after: "2026-11-24T10:00:00.000Z" }],
    gmail: url => url.includes("/threads/t2") ? { status: 403, body: {} } : { status: 200, body: { ...THREAD, id: "x" } } });
  const inner = cfg.fetchFn;
  cfg.fetchFn = async (url, o) => {
    if (url.endsWith("/mail/replies") && !refused) { refused = true; return new Response("{}", { status: 400 }); }
    return inner(url, o);
  };
  await siguiente(cfg);
  assert.ok(calls.some(c => c.url.includes("/threads/t3")), "t3 is still read");
  assert.equal(calls.filter(c => c.url.endsWith("/mail/replies")).length, 1, "t3's replies reach the app after t1's were refused");
});
