import PostalMime from "postal-mime";
import { now, sha256 } from "./http.js";
import { emailAddress, EMAIL_REPLY_TO, serviceReady } from "./email.js";

const MAX_BYTES = 1024 * 1024;
const header = (value, max) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0,max) : null;

// The header From and envelope address remain untrusted. Matching is only a human-readable thread hint, never auth.
export async function receiveEmail(message, env, ts = now()) {
  const sender = emailAddress(message.from), to = emailAddress(message.to);
  if (!serviceReady(env) || !sender || to !== EMAIL_REPLY_TO || !Number.isFinite(message.rawSize)
    || message.rawSize < 0 || message.rawSize > MAX_BYTES) {
    message.setReject("This address cannot accept this message. Maximum size is 1 MiB."); return;
  }
  const chunks = [], reader = message.raw.getReader(); let size = 0;
  try {
    for (let r; !(r = await reader.read()).done;) {
      size += r.value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); message.setReject("Message exceeds 1 MiB."); return; }
      chunks.push(r.value);
    }
  } catch { throw new Error("Email read failed"); }
  finally { reader.releaseLock(); }
  const raw = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { raw.set(chunk,offset); offset += chunk.byteLength; }
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256",raw))].map(b => b.toString(16).padStart(2,"0")).join("");
  const key = await sha256([sender,to,digest].join("\0"));
  let parsed;
  try { parsed = await PostalMime.parse(raw, { maxNestingDepth: 20, maxHeadersSize: 32768, maxPartCount: 100,
    maxRfc822NestingDepth: 2, maxForwardedAddresses: 100 }); }
  catch { message.setReject("Message could not be read. Send a plain text email under 1 MiB."); return; }
  const from = emailAddress(parsed.from?.address), subject = header(parsed.subject,500) || "(No subject)";
  const messageId = header(parsed.messageId,512), reply = header(parsed.inReplyTo,512), refs = header(parsed.references,2048);
  const htmlOnly = !parsed.text && !!parsed.html;
  // HTML-only mail is literal source text; no HTML ever crosses a rendering boundary.
  const text = parsed.text || parsed.html || "(No text content)";
  let linked = null;
  try {
    if (sender === from) {
      const subjectRefs = [...new Set([...subject.matchAll(/\[HE-OUT-([a-f0-9]{32})\]/gi)].map(m => m[1].toLowerCase()))];
      const ids = [...new Set([reply,refs].flatMap(value => value?.match(/<[^<>\s]+>|[^<>\s]+/g) ?? []))];
      if (subjectRefs.length <= 1 && (subjectRefs.length || ids.length)) {
        // Consider all recognized clues together, including matches for other recipients.
        // External ancestors in References need not exist locally. A subject marker must resolve.
        // JSON arrays keep the query bounded even when a header contains many short identifiers.
        const {results} = await env.DB.prepare(`SELECT id,ref,recipient FROM outbound WHERE status IN ('accepted','unknown')
          AND (ref IN (SELECT value FROM json_each(?)) OR message_id IN (SELECT value FROM json_each(?)))`)
          .bind(JSON.stringify(subjectRefs),JSON.stringify(ids)).all();
        if (results.length === 1 && results[0].recipient === sender && (!subjectRefs.length || results[0].ref === subjectRefs[0]))
          linked = results[0];
      }
    }
    await env.DB.batch([
      env.DB.prepare("INSERT INTO email_inbound_keys VALUES (?,?) ON CONFLICT(key) DO NOTHING").bind(key,ts),
      env.DB.prepare(`INSERT INTO email_inbound(dedupe_key,sender,header_from,recipient,subject,text,html_only,truncated,
        attachments,message_id,in_reply_to,references_header,outbound_id,received_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1`).bind(key,sender,from,to,subject,text.slice(0,50000),
        htmlOnly ? 1 : 0,text.length > 50000 ? 1 : 0,parsed.attachments?.length ?? 0,messageId,reply,refs,linked?.id ?? null,ts),
    ]);
  } catch { throw new Error("Email storage failed"); } // never emit a successful return after a failed write
}
