// AUT-17, fase C (plan docs/roadmap/work/AUT-17/plan-correo-hermes.md): Hampton's mail carrier, the part of Hermes's
// email that is not the model. It runs on the VPS in its own container, outside Hermes's, and alone holds the mail
// door's key (HERMES_MAIL_KEY), the Google token and the claims. Hermes reaches it on a private network with two calls:
//   POST /siguiente               claims one email and answers only what the model writes from (no address, no token);
//   POST /entregar {id, subject, body}  checks once with the app, puts the address the app chose, leaves a Gmail draft
//                                 or sends it, and reports the result.
// A claim is marked "sending" before Gmail is called and its outcome kept before it is reported: a carrier stopped
// mid-send reports unknown and never calls Gmail twice, and a lost report is sent again on the next /siguiente.
// Node, no dependencies.
//
// APP_ORIGIN=https://<app host> HERMES_MAIL_KEY_FILE=<file> CARTERO_KEY_FILE=<Hermes's key to call it> \
//   GOOGLE_TOKEN_FILE=<authorized_user JSON> \
//   ESTADO_DIR=<private dir> LISTEN_HOST=<private address> LISTEN_PORT=8788 node hermes/correo.mjs
// Once, before: GOOGLE_TOKEN_FILE=<file> node hermes/correo.mjs autorizar|codigo <client.json> [<code>] (see below).
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const claimFile = (dir, id) => join(dir, `${Number(id)}.json`);
const read = f => JSON.parse(readFileSync(f, "utf8"));
const keep = (f, v) => { writeFileSync(`${f}.tmp`, JSON.stringify(v), { mode: 0o600 }); renameSync(`${f}.tmp`, f); };

async function door(cfg, path, body) {
  const r = await cfg.fetchFn(`${cfg.origin}/api/hermes/mail/${path}`, { method: "POST", body: JSON.stringify(body ?? {}), redirect: "manual",
    headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Hampton App answered ${r.status} to mail/${path.replace(/^\d+\//, ":id/")}`);
  return r.json();
}

// Reports what a previous run kept: a result, or a claim stopped mid-send (unknown: it may have left).
async function pending(cfg) {
  for (const name of readdirSync(cfg.estado).filter(n => /^\d+\.json$/.test(n))) {
    const f = join(cfg.estado, name), claim = read(f);
    if (!claim.result && !claim.sending) continue;
    const result = claim.result ?? { outcome: "unknown", error: "carrier_stopped" };
    try { await door(cfg, `${claim.id}/result`, { token: claim.token, ...result }); rmSync(f); }
    catch (e) { if (/ 40[349] /.test(e.message)) rmSync(f); } // gone, or already settled: nothing more to say
  }
}

export async function siguiente(cfg) {
  mkdirSync(cfg.estado, { recursive: true, mode: 0o700 });
  await pending(cfg);
  const { task, reason } = await door(cfg, "next");
  if (!task) return { task: null, reason };
  keep(claimFile(cfg.estado, task.id), { id: task.id, token: task.token, to: task.to, mode: task.mode });
  const { token, to, ...forModel } = task;
  return { task: { ...forModel, to: { name: to.name } } };
}

// Headers are base64 encoded-words and the address is the app's, so nothing the model writes adds a header or a recipient.
const header = v => `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
export function mime(to, subject, body) {
  const name = to.name ? `${header(to.name)} ` : "";
  return Buffer.from([`To: ${name}<${to.email}>`, `Subject: ${header(subject)}`, "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    Buffer.from(body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n")].join("\r\n")).toString("base64url");
}

async function accessToken(cfg) {
  const t = read(cfg.tokenFile);
  const r = await cfg.fetchFn(t.token_uri ?? "https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: t.client_id, client_secret: t.client_secret, refresh_token: t.refresh_token }) });
  if (!r.ok) throw new Error("token");
  return (await r.json()).access_token;
}

// Gmail took it, refused it (a 4xx but 429: nothing was made), or it is not known (no answer, 5xx, 429, a body that
// cannot be read): then it may exist, and a person checks Gmail.
async function gmail(cfg, claim, subject, body) {
  let auth;
  try { auth = `Bearer ${await accessToken(cfg)}`; } catch { return { outcome: "failed", error: "google_token" }; }
  const send = claim.mode === "send", raw = mime(claim.to, subject, body);
  try {
    const r = await cfg.fetchFn(send ? `${GMAIL}/messages/send` : `${GMAIL}/drafts`, { method: "POST",
      headers: { authorization: auth, "content-type": "application/json" }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify(send ? { raw } : { message: { raw } }) });
    if (!r.ok) return { outcome: r.status < 500 && r.status !== 429 ? "failed" : "unknown", error: `gmail_${r.status}` };
    const m = await r.json(), msg = send ? m : m.message ?? {};
    return { outcome: send ? "sent" : "drafted", message_id: msg.id, thread_id: msg.threadId };
  } catch { return { outcome: "unknown", error: "gmail_no_answer" }; }
}

const busy = new Set(); // one delivery per claim at a time, within this carrier
export async function entregar(cfg, written) {
  const id = Number(written?.id);
  if (!Number.isSafeInteger(id) || id < 1) throw Object.assign(new Error("Send the task's id"), { status: 400 });
  const f = claimFile(cfg.estado, id);
  let claim;
  try { claim = read(f); } catch { throw Object.assign(new Error("No claim with that id"), { status: 404 }); }
  if (busy.has(id) || claim.sending || claim.result) throw Object.assign(new Error("Already delivered or being delivered"), { status: 409 });
  busy.add(id);
  try {
    const subject = typeof written.subject === "string" ? written.subject.replace(/\s+/g, " ").trim() : "";
    const body = typeof written.body === "string" ? written.body.trim() : "";
    if (!subject || subject.length > 200 || !body || body.length > 10000) {
      claim.result = { outcome: "failed", error: "bad_text" };
    } else {
      const check = await door(cfg, `${id}/check`, { token: claim.token });
      if (!check.ok) { rmSync(f); return { skipped: check.reason }; }
      keep(f, { ...claim, sending: true }); // from here, a stop reports unknown, never a second call
      claim.result = { ...await gmail(cfg, claim, subject, body), subject, body };
    }
    keep(f, claim);
    const { task } = await door(cfg, `${id}/result`, { token: claim.token, ...claim.result });
    rmSync(f);
    return { id, status: task.status };
  } finally { busy.delete(id); }
}

// Only Hermes calls the carrier, with its own key (CARTERO_KEY_FILE, never the mail door's), compared in constant time.
const digest = v => createHash("sha256").update(String(v)).digest();
export const callerOk = (header, key) => typeof key === "string" && key.length >= 32
  && timingSafeEqual(digest(/^Bearer (\S+)$/.exec(header ?? "")?.[1] ?? ""), digest(key));
// Loopback or a private network (RFC 1918, IPv6 ULA): never every interface nor a public address.
export const privateHost = h => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}(\.\d{1,3})?$/.test(h ?? "")
  || /^(::1|f[cd][0-9a-f]{2}:[0-9a-f:]+)$/i.test(h ?? "");

export function makeCarrier(cfg) {
  return createServer(async (req, res) => {
    const reply = (status, v) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(v));
    if (!callerOk(req.headers.authorization, cfg.callerKey)) return reply(401, { error: "Unauthorized" });
    if (req.method !== "POST" || !["/siguiente", "/entregar"].includes(req.url)) return reply(404, { error: "Not found" });
    let raw = "";
    try { for await (const c of req) { raw += c; if (raw.length > 65536) return reply(413, { error: "Too large" }); } }
    catch { return res.destroy(); }
    try {
      reply(200, req.url === "/siguiente" ? await siguiente(cfg) : await entregar(cfg, JSON.parse(raw || "{}")));
    } catch (e) { reply(e.status ?? 502, { error: e.status ? e.message : "Hampton App or Gmail did not answer as expected" }); }
  });
}

// Fase B, once, from the carrier (never from Hermes): Google's consent for Hampton's Gmail with the least scope that
// creates drafts and sends (gmail.compose: it cannot read the mailbox). `autorizar <client.json>` prints the link to
// open signed in as Hampton; the browser then lands on a localhost address that will not load: its `code` goes to
// `codigo <client.json> <code>`, which writes GOOGLE_TOKEN_FILE (0600).
const SCOPE = "https://www.googleapis.com/auth/gmail.compose", REDIRECT = "http://localhost";
const client = file => { const c = read(file); return c.installed ?? c; };
export const consentLink = c => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: c.client_id,
  redirect_uri: REDIRECT, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent" })}`;
export async function exchange(c, code, fetchFn = fetch) {
  const r = await fetchFn("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: REDIRECT }) });
  const t = await r.json();
  if (!r.ok || !t.refresh_token) throw new Error(`Google did not give a refresh token (${r.status} ${t.error ?? ""})`);
  return { type: "authorized_user", client_id: c.client_id, client_secret: c.client_secret, refresh_token: t.refresh_token, token_uri: "https://oauth2.googleapis.com/token" };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { APP_ORIGIN: origin, HERMES_MAIL_KEY_FILE: keyFile, GOOGLE_TOKEN_FILE: tokenFile, ESTADO_DIR: estado,
    CARTERO_KEY_FILE: callerFile, LISTEN_HOST: host, LISTEN_PORT: port = "8788" } = process.env;
  const [cmd, clientFile, code] = process.argv.slice(2);
  if (cmd === "autorizar") { console.log(consentLink(client(clientFile))); process.exit(0); }
  if (cmd === "codigo") {
    if (!tokenFile || !code) { console.error("Set GOOGLE_TOKEN_FILE and pass the code"); process.exit(1); }
    exchange(client(clientFile), code).then(t => { writeFileSync(tokenFile, JSON.stringify(t), { mode: 0o600 }); console.log("Token saved"); },
      e => { console.error(e.message); process.exit(1); });
  } else {
    const key = keyFile ? readFileSync(keyFile, "utf8").trim() : "", callerKey = callerFile ? readFileSync(callerFile, "utf8").trim() : "";
    if (!/^https:\/\/[^/]+$/.test(origin ?? "") || key.length < 32 || callerKey.length < 32 || callerKey === key || !tokenFile || !estado
      || !privateHost(host)) {
      console.error("Set APP_ORIGIN, HERMES_MAIL_KEY_FILE, CARTERO_KEY_FILE (another key of 32+), GOOGLE_TOKEN_FILE, ESTADO_DIR"
        + " and LISTEN_HOST (a loopback or private address)");
      process.exit(1);
    }
    makeCarrier({ origin, key, callerKey, tokenFile, estado, fetchFn: fetch }).on("error", e => { console.error(e.message); process.exit(1); })
      .listen(Number(port), host, () => console.log(`Mail carrier on ${host}:${port}`));
  }
}
