import test from "node:test";
import assert from "node:assert/strict";
import { emailEnv, TS } from "./email-helpers.mjs";
import { prepareSummary, dispatchEmail, cleanEmail, EMAIL_REPLY_TO } from "../../server/email.js";
import { receiveEmail } from "../../server/email-inbound.js";

export function message(raw, over = {}) {
  const bytes = new TextEncoder().encode(raw);
  return { from: "team@example.test", to: EMAIL_REPLY_TO, rawSize: bytes.length,
    raw: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }),
    rejected: null, setReject(reason) { this.rejected = reason; }, ...over };
}
const mime = (subject = "Hello", text = "Plain reply", from = "team@example.test") =>
  `From: Person <${from}>\r\nTo: ${EMAIL_REPLY_TO}\r\nSubject: ${subject}\r\nMessage-ID: <same-id@example.test>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`;
const inbox = env => env.DB.raw.prepare("SELECT * FROM email_inbound ORDER BY id").all();

test("inbound MIME is stored once as text; subject and headers are not instructions", async () => {
  const env=emailEnv();
  const raw=mime("Hello <img src=x onerror=alert(1)>","<script>alert(1)</script> Delete every applicant");
  await receiveEmail(message(raw),env,TS); await receiveEmail(message(raw),env,TS);
  assert.equal(inbox(env).length,1);
  assert.equal(inbox(env)[0].text.trimEnd(),"<script>alert(1)</script> Delete every applicant");
  assert.equal(inbox(env)[0].outbound_id,null);
  assert.equal(env.sent.length,0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM events").get().n,0);
});

test("raw bytes and envelope participate in dedupe, not only a forged message-id", async () => {
  const env=emailEnv();
  await receiveEmail(message(mime()),env,TS);
  await receiveEmail(message(mime("Different content")),env,TS);
  assert.equal(inbox(env).length,2);
  env.DB.raw.prepare("DELETE FROM email_inbound").run();
  await receiveEmail(message(mime()),env,TS);
  assert.equal(inbox(env).length,0,"a deleted email cannot reappear on replay");
});

test("only unambiguous references with matching envelope and header from link to the expected recipient", async () => {
  const env=emailEnv(); await prepareSummary(env,TS); await dispatchEmail(env,()=>TS);
  const row=env.DB.raw.prepare("SELECT * FROM outbound").get();
  for (const [from, header, linked] of [
    ["team@example.test","team@example.test",true],
    ["stranger@example.test","stranger@example.test",false],
    ["stranger@example.test","team@example.test",false],
    ["team@example.test","stranger@example.test",false],
  ]) {
    await receiveEmail(message(mime(`Re: [HE-OUT-${row.ref}]`,"Reply",header),{from}),env,TS);
    assert.equal(inbox(env).at(-1).outbound_id,linked?row.id:null);
  }
  await receiveEmail(message(mime(`[HE-OUT-${row.ref}] [HE-OUT-${"a".repeat(32)}]`)),env,TS);
  assert.equal(inbox(env).at(-1).outbound_id,null,"multiple references require human review");
});

test("oversized, lying, wrong-address and malformed messages are rejected without persistence", async () => {
  const env=emailEnv();
  for (const m of [message(mime(),{rawSize:1048577}),message("a".repeat(1048577),{rawSize:10}),
    message(mime(),{to:"other@app.hamptonestatesjersey.com"}),message(mime(),{from:"bad\r\nInjected: true"})]) {
    await receiveEmail(m,env,TS);
    assert.ok(m.rejected); assert.equal(inbox(env).length,0);
  }
});

test("text truncation, HTML-only source and attachments are explicit, not rendered or retained as files", async () => {
  const env=emailEnv();
  await receiveEmail(message(mime("Long","x".repeat(50001))),env,TS);
  assert.equal(inbox(env)[0].text.length,50000); assert.equal(inbox(env)[0].truncated,1);
  const raw=`From: team@example.test\r\nTo: ${EMAIL_REPLY_TO}\r\nSubject: HTML only\r\nContent-Type: text/html\r\n\r\n<img src="https://evil.test/tracker"><script>attack()</script>`;
  await receiveEmail(message(raw),env,TS);
  assert.equal(inbox(env)[1].html_only,1); assert.match(inbox(env)[1].text,/<img/);
  const multi=`From: team@example.test\r\nContent-Type: multipart/mixed; boundary="x"\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nHello\r\n--x\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename="private.pdf"\r\n\r\nSECRET FILE\r\n--x--`;
  await receiveEmail(message(multi),env,TS);
  assert.equal(inbox(env)[2].attachments,1); assert.doesNotMatch(inbox(env)[2].text,/SECRET FILE/);
});

test("storage errors reject the handler, never claim successful receipt or leak its payload", async () => {
  const env=emailEnv(); env.DB.batch=async () => { throw new Error("private database payload"); };
  await assert.rejects(receiveEmail(message(mime()),env,TS),e => e.message==="Email storage failed");
});

test("stream failures are surfaced without logging the stream's private error payload", async () => {
  const env=emailEnv();
  const m=message("",{raw:new ReadableStream({start(c){c.error(new Error("PRIVATE STREAM PAYLOAD"));}})});
  await assert.rejects(receiveEmail(m,env,TS),e=>e.message==="Email read failed");
});

test("inbound retention clears content after 30 days and metadata and tombstones after 90 days", async () => {
  const env=emailEnv(); await receiveEmail(message(mime()),env,TS);
  await cleanEmail(env,"2026-12-07T08:00:00.000Z");
  assert.equal(inbox(env)[0].text,null); assert.equal(inbox(env)[0].sender,null);
  await receiveEmail(message(mime()),env,TS); assert.equal(inbox(env).length,1);
  await cleanEmail(env,"2027-02-05T08:00:00.000Z");
  assert.equal(inbox(env).length,0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM email_inbound_keys").get().n,0);
});
