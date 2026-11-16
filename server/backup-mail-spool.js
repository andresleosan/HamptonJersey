// PRE-14 · Task 5: while the weekly backup has the write gate closed, an inbound email is kept, encrypted, in a private
// R2 bucket (INBOUND_SPOOL) instead of being refused; the clock stores it once the gate reopens, with its arrival time.
// Without the bucket or its own key (BACKUP_SPOOL_KEY, 32 bytes base64, not the backup keys) nothing is accepted and
// the caller refuses the email as before. Never accepts and drops: a failed write throws, so the sender is refused.
// ponytail: the key names only the arrival time; sender, recipient and content are all inside the ciphertext.
import { now } from "./http.js";
import { emailAddress, EMAIL_REPLY_TO, serviceReady } from "./email.js";
import { receiveEmail } from "./email-inbound.js";

const MAX_BYTES = 1024 * 1024, MAX_ITEMS = 1000, MAX_TOTAL = 256 * 1024 * 1024;
const enc = new TextEncoder(), dec = new TextDecoder();

export const spoolReady = env => !!env?.INBOUND_SPOOL && /^[A-Za-z0-9+/]{43}=$/.test(env?.BACKUP_SPOOL_KEY ?? "");
const aesKey = env => crypto.subtle.importKey("raw", Uint8Array.from(atob(env.BACKUP_SPOOL_KEY), c => c.charCodeAt(0)),
  "AES-GCM", false, ["encrypt", "decrypt"]);

async function readRaw(message) {
  const chunks = [], reader = message.raw.getReader(); let size = 0;
  try {
    for (let r; !(r = await reader.read()).done;) {
      size += r.value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(r.value);
    }
  } finally { reader.releaseLock(); }
  const raw = new Uint8Array(size); let offset = 0;
  for (const c of chunks) { raw.set(c, offset); offset += c.byteLength; }
  return raw;
}

// -> 'staged' | 'spool_unavailable' | 'not_accepted' | 'too_large' | 'spool_full'; throws if the write fails.
export async function stageInboundDuringBackup(message, env, received_at = now()) {
  if (!spoolReady(env)) return "spool_unavailable";
  const to = emailAddress(message.to);
  if (!serviceReady(env) || !emailAddress(message.from) || to !== EMAIL_REPLY_TO || !Number.isFinite(message.rawSize)
    || message.rawSize < 0 || message.rawSize > MAX_BYTES) return "not_accepted";
  const listed = await env.INBOUND_SPOOL.list({ limit: MAX_ITEMS }); // mail/ and refused/ both count
  const used = listed.objects.reduce((s, o) => s + o.size, 0);
  if (listed.truncated || listed.objects.length >= MAX_ITEMS || used + message.rawSize > MAX_TOTAL) return "spool_full";
  const raw = await readRaw(message);
  if (!raw) return "too_large";
  const head = enc.encode(JSON.stringify({ from: message.from, to: message.to, received_at }) + "\n");
  const plain = new Uint8Array(head.byteLength + raw.byteLength);
  plain.set(head); plain.set(raw, head.byteLength);
  const key = `mail/${received_at}/${crypto.randomUUID()}`, iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(key) },
    await aesKey(env), plain));
  const body = new Uint8Array(12 + sealed.byteLength);
  body.set(iv); body.set(sealed, 12);
  await env.INBOUND_SPOOL.put(key, body);
  return "staged";
}

// Oldest first. Removed only after receiveEmail stored it; its dedupe key makes a retry after an uncertain D1 write
// store nothing twice. A D1 failure leaves it for the next tick. One that cannot be read, or that receiveEmail refuses
// (the sender already had "accepted"), moves, still encrypted, to refused/ for a person: never deleted here, and it no
// longer blocks the queue. With the email service off nothing is replayed, so nothing is refused for that reason.
// ponytail: refused/ has no review screen or retention yet (MEJORAS); it only counts against the spool's cap.
export async function replayBackupInbound(env, { limit = 25 } = {}) {
  const counts = { stored: 0, rejected: 0, failed: 0 };
  if (!spoolReady(env) || !serviceReady(env)) return counts;
  const { objects } = await env.INBOUND_SPOOL.list({ prefix: "mail/", limit });
  for (const { key } of objects) {
    let body, mail;
    try {
      body = new Uint8Array(await (await env.INBOUND_SPOOL.get(key)).arrayBuffer());
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: body.slice(0, 12),
        additionalData: enc.encode(key) }, await aesKey(env), body.slice(12)));
      const nl = plain.indexOf(10);
      mail = { ...JSON.parse(dec.decode(plain.slice(0, nl))), raw: plain.slice(nl + 1) };
    } catch {
      if (body) await quarantine(env, key, body).catch(() => {}); // unreadable: no retry will change it
      counts.failed++; continue;
    }
    try {
      let refused = false;
      await receiveEmail({ from: mail.from, to: mail.to, rawSize: mail.raw.byteLength, setReject: () => { refused = true; },
        raw: new ReadableStream({ start(c) { c.enqueue(mail.raw); c.close(); } }) }, env, mail.received_at);
      if (refused) { await quarantine(env, key, body); counts.rejected++; }
      else { await env.INBOUND_SPOOL.delete(key); counts.stored++; }
    } catch { counts.failed++; }
  }
  return counts;
}

// Same bytes under refused/ (the AAD stays the original key, so it can still be read), then the original goes.
const quarantine = async (env, key, body) => {
  await env.INBOUND_SPOOL.put("refused/" + key, body);
  await env.INBOUND_SPOOL.delete(key);
};
