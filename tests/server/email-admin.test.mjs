import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, call, adminCookie } from "./helpers.mjs";
import { emailEnv, TS } from "./email-helpers.mjs";
import { emailPass, prepareSummary } from "../../server/email.js";
import { receiveEmail } from "../../server/email-inbound.js";

const admin=async (env,method,path,body) => call(env,method,path,{cookie:await adminCookie(),body});
const rawMessage = text => { const b=new TextEncoder().encode(`From: team@example.test\r\nSubject: Hello\r\nContent-Type: text/plain\r\n\r\n${text}`);
  return {from:"team@example.test",to:"replies@app.hamptonestatesjersey.com",rawSize:b.length,
    raw:new ReadableStream({start(c){c.enqueue(b);c.close();}}),setReject(){assert.fail("valid local message");}}; };

test("email endpoints require panel auth, same-origin mutations and no-store", async () => {
  const env=makeEnv();
  assert.equal((await call(env,"GET","/admin/email/settings")).status,401);
  assert.equal((await call(env,"PUT","/admin/email/settings",{cookie:await adminCookie(),origin:"https://evil.test",body:{}})).status,403);
  const r=await admin(env,"GET","/admin/email/settings");
  assert.equal(r.status,200); assert.equal(r.headers.get("cache-control"),"no-store");
  assert.equal(r.data.settings.enabled,false); assert.equal(r.data.ready,false);
});

test("settings validation, explicit preview acknowledgement and optimistic revision prevent silent changes", async t => {
  t.mock.timers.enable({apis:["Date"],now:Date.parse(TS)});
  const env=emailEnv(); await emailPass(env,TS);
  const body={enabled:true,summary:true,recipients:["Team@example.test"],expectedRevision:1,previewed:true};
  for (const bad of [{...body,previewed:false},{...body,unexpected:1},{...body,recipients:["bad\r\nX: injected"]},
    {...body,recipients:[]},{...body,summary:"true"},{...body,enabled:1}])
    assert.equal((await admin(env,"PUT","/admin/email/settings",bad)).status,400);
  const [a,b]=await Promise.all([admin(env,"PUT","/admin/email/settings",body),admin(env,"PUT","/admin/email/settings",body)]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);
  const r=await admin(env,"GET","/admin/email/settings");
  assert.equal(r.data.settings.revision,2); assert.deepEqual(r.data.settings.recipients,["team@example.test"]);
  assert.equal(r.data.overview.accepted_today,1);
  env.EMAIL_SERVICE_READY="false";
  assert.equal((await admin(env,"PUT","/admin/email/settings",{...body,expectedRevision:2})).status,409);
  const preview=await admin(env,"GET","/admin/email/preview");
  assert.equal(preview.status,200); assert.match(preview.data.text,/Hampton summary/);
  const events=env.DB.raw.prepare("SELECT data FROM events WHERE type='email.settings'").all();
  assert.equal(events.length,1); assert.doesNotMatch(JSON.stringify(events),/team@example/);
});

test("pagination, literal detail, deletion tombstones and suppression are usable without a sending endpoint", async () => {
  const env=emailEnv();
  for(let i=0;i<27;i++) await receiveEmail(rawMessage(`Reply ${i} <script>attack()</script>`),env,TS);
  const first=await admin(env,"GET","/admin/email?box=inbound");
  assert.equal(first.status,200); assert.equal(first.data.items.length,25); assert.ok(first.data.next);
  const second=await admin(env,"GET",`/admin/email?box=inbound&before=${first.data.next}`);
  assert.equal(second.data.items.length,2); assert.equal(second.data.next,null);
  assert.equal((await admin(env,"GET","/admin/email?box=unknown")).status,400);
  const id=first.data.items[0].id;
  const detail=await admin(env,"GET",`/admin/email/inbound/${id}`);
  assert.match(detail.data.message.text,/<script>/);
  assert.equal((await admin(env,"POST","/admin/email/suppressions",{address:detail.data.message.sender})).status,200);
  const hash=(await admin(env,"GET","/admin/email/settings")).data.suppressions[0].address_hash;
  await admin(env,"DELETE",`/admin/email/inbound/${id}`);
  assert.equal((await admin(env,"GET",`/admin/email/inbound/${id}`)).status,404);
  await receiveEmail(rawMessage("Reply 26 <script>attack()</script>"),env,TS);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM email_inbound").get().n,26);
  assert.equal((await admin(env,"DELETE",`/admin/email/suppressions/${hash}`)).status,200);
  assert.equal((await admin(env,"POST","/admin/email/send",{})).status,404);
});

test("unknown outcome review records acknowledgement but never requeues or sends", async () => {
  const env=emailEnv(); await prepareSummary(env,TS);
  env.DB.raw.prepare("UPDATE outbound SET status='unknown',error_code='UNKNOWN_RESULT'").run();
  const id=env.DB.raw.prepare("SELECT id FROM outbound").get().id;
  const r=await admin(env,"POST",`/admin/email/outbound/${id}/review`,{acknowledged:true});
  assert.equal(r.status,200);
  const row=env.DB.raw.prepare("SELECT * FROM outbound").get();
  assert.equal(row.status,"unknown"); assert.ok(row.reviewed_at); assert.equal(env.sent.length,0);
});
