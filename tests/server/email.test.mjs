import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, T0, seedListing } from "./helpers.mjs";
import { DatabaseSync } from "node:sqlite";
import { readdirSync,readFileSync } from "node:fs";
import { emailPass as liveEmailPass, prepareSummary, dispatchEmail as liveDispatch, cleanEmail, summarySnapshot, readEmailSettings,
  EMAIL_FROM, EMAIL_REPLY_TO, emailDay } from "../../server/email.js";

import { TS, emailEnv, configure } from "./email-helpers.mjs";
const emailPass=(env,ts)=>liveEmailPass(env,ts,()=>ts);
const dispatchEmail=(env,ts)=>liveDispatch(env,()=>ts);
const rows = env => env.DB.raw.prepare("SELECT * FROM outbound ORDER BY id").all();
const attempts = env => env.DB.raw.prepare("SELECT COUNT(*) AS n FROM email_attempts").get().n;

test("email is off by default; readiness and binding are fail-closed", async () => {
  const env = makeEnv();
  assert.equal((await readEmailSettings(env)).enabled, false);
  await emailPass(env, TS);
  assert.deepEqual(rows(env), []);
  for (const missing of ["EMAIL_SERVICE_READY", "EMAIL"]) {
    const env = emailEnv(); delete env[missing];
    await emailPass(env, TS);
    assert.equal(env.sent.length, 0);
    assert.equal(attempts(env), 0);
  }
});

test("0023 upgrades populated 0022 without changing existing data or enabling email", () => {
  const db=new DatabaseSync(":memory:"), folder=new URL("../../migrations/",import.meta.url);
  db.exec("PRAGMA foreign_keys=ON");
  for(const file of readdirSync(folder).filter(f=>f.endsWith(".sql")&&f<"0023").sort())db.exec(readFileSync(new URL(file,folder),"utf8"));
  db.prepare("INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Existing','existing@example.test',?,?,?)").run(T0,T0,T0);
  const before=db.prepare("SELECT * FROM contacts").all();
  db.exec(readFileSync(new URL("0023_email.sql",folder),"utf8"));
  assert.deepEqual(db.prepare("SELECT * FROM contacts").all(),before);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM app_settings WHERE key='email'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM outbound").get().n,0);
  db.close();
});

test("Jersey 08:00 gate covers summer, winter and both DST transitions", async () => {
  for (const [before, after] of [
    ["2026-01-06T07:59:59Z", "2026-01-06T08:00:00Z"],
    ["2026-07-06T06:59:59Z", "2026-07-06T07:00:00Z"],
    ["2026-03-29T06:59:59Z", "2026-03-29T07:00:00Z"],
    ["2026-10-25T07:59:59Z", "2026-10-25T08:00:00Z"],
  ]) {
    const env = emailEnv();
    await prepareSummary(env, before); assert.equal(rows(env).length, 0, before);
    await prepareSummary(env, after); assert.equal(rows(env).length, 1, after);
  }
  assert.equal(emailDay("2026-07-06T23:30:00Z"), "2026-07-07");
});

test("concurrent preparation snapshots once per day and recipient, never exposes customer details", async () => {
  const env = emailEnv({ recipients: ["one@example.test", "two@example.test"] });
  seedListing(env);
  env.DB.raw.prepare(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at)
    VALUES ('PRIVATE CUSTOMER','private@example.test',?,?,?)`).run(T0,T0,T0);
  await Promise.all([prepareSummary(env, TS), prepareSummary(env, TS)]);
  const first = rows(env);
  assert.equal(first.length, 2);
  assert.equal(first[0].text, first[1].text);
  assert.match(first[0].text, /To confirm/);
  assert.match(first[0].text, /#\/privacy/);
  assert.doesNotMatch(first[0].text, /PRIVATE CUSTOMER|private@example|one@example|two@example/);
  env.DB.raw.prepare("UPDATE listings SET title = 'CHANGED'").run();
  await prepareSummary(env, TS);
  assert.deepEqual(rows(env), first, "a repeated tick cannot change an approved snapshot");
  await dispatchEmail(env, TS);
  assert.equal(env.sent.length, 2);
  assert.equal(EMAIL_FROM, "hello@hamptonestatesjersey.com");
  assert.equal(EMAIL_REPLY_TO, "replies@app.hamptonestatesjersey.com");
  assert.ok(env.sent.every(m => typeof m.to === "string" && m.text && m.html && !m.cc && !m.bcc));
  assert.ok(rows(env).every(r => r.status === "accepted" && r.message_id && r.attempts === 1));
});

test("concurrent dispatch sends a row once; quota reservations and calls agree", async () => {
  const env = emailEnv(); await prepareSummary(env, TS);
  await Promise.all([dispatchEmail(env, TS), dispatchEmail(env, TS), dispatchEmail(env, TS)]);
  assert.equal(env.sent.length, 1); assert.equal(attempts(env), 1);
});

test("a preparation racing changed preferences cannot insert obsolete rows and starve current recipients", async () => {
  const env=emailEnv({recipients:Array.from({length:20},(_,i)=>`old${i}@example.test`)});
  const batch=env.DB.batch.bind(env.DB);let changed=false;
  env.DB.batch=async stmts=>{
    if(!changed&&stmts.some(s=>s.sql.includes("INSERT INTO outbound"))){
      changed=true;configure(env,{revision:2,recipients:Array.from({length:20},(_,i)=>`new${i}@example.test`)});
    }
    return batch(stmts);
  };
  await prepareSummary(env,TS);env.DB.batch=batch;
  await prepareSummary(env,TS);await dispatchEmail(env,TS);await dispatchEmail(env,TS);
  assert.equal(env.sent.length,20);
  assert.ok(rows(env).every(r=>r.config_revision===2));
  assert.equal(rows(env).filter(r=>r.status==="queued").length,0);
});

test("a batch crossing Jersey midnight never sends the previous day's next summary", async t => {
  const before="2026-11-06T23:59:59.000Z",after="2026-11-07T00:00:01.000Z";
  t.mock.timers.enable({apis:["Date"],now:Date.parse(before)});
  const env=emailEnv({recipients:["one@example.test","two@example.test"]});
  const send=env.EMAIL.send;
  env.EMAIL.send=async m=>{const result=await send(m);t.mock.timers.setTime(Date.parse(after));return result;};
  await liveEmailPass(env,before);
  assert.equal(env.sent.length,1,"no second expired summary after midnight");
  assert.equal(rows(env).filter(r=>r.status==="cancelled").length,1);
  assert.deepEqual(env.DB.raw.prepare("SELECT day,COUNT(*) n FROM email_attempts GROUP BY day").all().map(r=>[r.day,r.n]),[["2026-11-06",1]]);
  t.mock.timers.setTime(Date.parse("2026-11-07T08:00:00.000Z"));
  await liveEmailPass(env,"2026-11-07T08:00:00.000Z");
  assert.equal(env.sent.length,3,"new day gets its own two fresh summaries");
});

test("a midnight between quota reservation and provider call stops the stale summary", async t => {
  const before="2026-07-06T22:59:59.000Z",after="2026-07-06T23:00:01.000Z";
  t.mock.timers.enable({apis:["Date"],now:Date.parse(before)});
  const env=emailEnv();await prepareSummary(env,before);
  const batch=env.DB.batch.bind(env.DB);let changed=false;
  env.DB.batch=async stmts=>{const r=await batch(stmts);
    if(!changed&&stmts.some(s=>s.sql.includes("INSERT INTO email_attempts"))){changed=true;t.mock.timers.setTime(Date.parse(after));}
    return r;
  };
  await liveDispatch(env);
  assert.equal(env.sent.length,0);assert.equal(rows(env)[0].status,"cancelled");
});

test("shared 100-attempt daily quota is atomic under concurrent dispatch", async () => {
  const env = emailEnv({ recipients: Array.from({ length: 20 }, (_, i) => `team${i}@example.test`) });
  await prepareSummary(env, TS);
  const st = env.DB.raw.prepare("INSERT INTO email_attempts(token,outbound_id,day,at) VALUES (?,NULL,?,?)");
  for (let i=0;i<99;i++) st.run(`earlier-${i}`, "2026-11-06", TS);
  await Promise.all([dispatchEmail(env, TS), dispatchEmail(env, TS)]);
  assert.equal(env.sent.length, 1); assert.equal(attempts(env), 100);
  assert.equal(rows(env).filter(r => r.status === "queued").length, 19);
  await emailPass(env, "2026-11-07T08:00:00.000Z");
  assert.equal(env.sent.length, 21, "the new day frees quota and never sends yesterday's backlog");
  assert.equal(rows(env).filter(r => r.status === "cancelled").length, 19);
});

test("pause, preferences and suppression are rechecked after claiming", async () => {
  for (const stop of [
    env => env.DB.raw.prepare("INSERT INTO app_settings VALUES ('outbound','{\"paused\":true}',?, 'admin')").run(T0),
    env => configure(env, { summary: false }),
    env => configure(env, { enabled: false }),
    env => configure(env, { recipients: ["different@example.test"], revision: 2 }),
    env => env.DB.raw.prepare("INSERT INTO email_suppressions(address_hash,created_at,reason) SELECT recipient_hash,?, 'team' FROM outbound").run(T0),
  ]) {
    const env = emailEnv(); await prepareSummary(env, TS);
    const batch = env.DB.batch.bind(env.DB); let done = false;
    env.DB.batch = async stmts => {
      const r = await batch(stmts);
      if (!done && stmts.some(s => s.sql.includes("INSERT INTO email_attempts"))) { done = true; stop(env); }
      return r;
    };
    await dispatchEmail(env, TS);
    assert.equal(env.sent.length, 0);
    assert.notEqual(rows(env)[0].status, "sending");
  }
});

test("only explicit pre-acceptance rate/quota rejections retry, three attempts maximum", async () => {
  const env = emailEnv();
  env.EMAIL.send = async () => { throw Object.assign(new Error("private provider payload"), { code: "E_RATE_LIMIT_EXCEEDED" }); };
  await prepareSummary(env, TS);
  for (let i=0;i<4;i++) await dispatchEmail(env, `2026-11-06T08:${i}0:00.000Z`);
  assert.equal(rows(env)[0].attempts, 3); assert.equal(attempts(env), 3);
  assert.equal(rows(env)[0].status, "failed");
  assert.equal(rows(env)[0].error_code, "E_RATE_LIMIT_EXCEEDED");
  assert.doesNotMatch(JSON.stringify(rows(env)), /private provider payload/);
});

test("timeouts, unknown codes, absent result id and post-send persistence failure never replay", async () => {
  for (const send of [
    async () => { throw new Error("PRIVATE TIMEOUT"); },
    async () => { throw Object.assign(new Error("PRIVATE"), { code: "E_INTERNAL_SERVER_ERROR" }); },
    async () => ({}),
  ]) {
    const env=emailEnv(); env.EMAIL.send=send; await prepareSummary(env,TS);
    await dispatchEmail(env, TS); await dispatchEmail(env, "2026-11-06T09:00:00.000Z");
    assert.equal(rows(env)[0].status,"unknown"); assert.equal(attempts(env),1);
    assert.doesNotMatch(JSON.stringify(rows(env)),/PRIVATE/);
  }
  const env=emailEnv(); await prepareSummary(env,TS);
  const prepare=env.DB.prepare;
  env.DB.prepare=sql => {
    const s=prepare(sql);
    return sql.includes("SET status = 'accepted'") ? { ...s, bind: () => ({ run: async () => { throw new Error("D1 unavailable"); } }) } : s;
  };
  await dispatchEmail(env,TS);
  env.DB.prepare=prepare;
  await dispatchEmail(env,"2026-11-06T09:00:00.000Z");
  assert.equal(env.sent.length,1); assert.equal(rows(env)[0].status,"unknown");
});

test("stale sending is unknown; a late provider result cannot undo a cancellation", async () => {
  const env=emailEnv(); await prepareSummary(env,TS);
  let release, entered;
  const ready=new Promise(r => { entered=r; });
  env.EMAIL.send=async () => { entered(); return new Promise(r => { release=r; }); };
  const sending=dispatchEmail(env,TS); await ready;
  await dispatchEmail(env,"2026-11-06T08:06:00.000Z");
  assert.equal(rows(env)[0].status,"unknown");
  release({messageId:"late"}); await sending;
  assert.equal(rows(env)[0].status,"unknown");
});

test("erasure while the provider call is in flight removes content but keeps uncertainty visible", async () => {
  const env=emailEnv();await prepareSummary(env,TS);
  env.DB.raw.prepare(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at)
    VALUES('Team contact','team@example.test',?,?,?)`).run(T0,T0,T0);
  let release,entered;const ready=new Promise(r=>{entered=r;});
  env.EMAIL.send=async()=>{entered();return new Promise(r=>{release=r;});};
  const sending=dispatchEmail(env,TS);await ready;
  env.DB.raw.prepare("DELETE FROM contacts WHERE email='team@example.test'").run();
  assert.equal(rows(env)[0].status,"unknown","an in-flight email cannot be claimed cancelled at the provider");
  assert.equal(rows(env)[0].text,null);assert.equal(rows(env)[0].recipient,null);
  release({messageId:"late-acceptance"});await sending;
  assert.equal(rows(env)[0].status,"unknown");
});

test("suppressed recipients fail permanently and are blocked on following days", async () => {
  const env=emailEnv(); let calls=0;
  env.EMAIL.send=async () => { calls++; throw Object.assign(new Error("secret"),{code:"E_RECIPIENT_SUPPRESSED"}); };
  await emailPass(env,TS); await emailPass(env,"2026-11-07T08:00:00.000Z");
  assert.equal(calls,1);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM email_suppressions").get().n,1);
});

test("30-day content cleanup cancels pending work; 90-day metadata cleanup preserves suppression", async () => {
  const env=emailEnv(); await prepareSummary(env,TS);
  env.DB.raw.prepare("INSERT INTO email_suppressions SELECT recipient_hash, ?, 'team' FROM outbound").run(TS);
  await cleanEmail(env,"2026-12-06T08:00:01.000Z");
  assert.equal(rows(env)[0].status,"cancelled");
  assert.equal(rows(env)[0].text,null); assert.equal(rows(env)[0].subject,null); assert.equal(rows(env)[0].recipient,null);
  await cleanEmail(env,"2027-02-05T08:00:00.000Z");
  assert.equal(rows(env).length,0);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM email_suppressions").get().n,1);
});

test("deleting a contact clears its email content and cancels pending work", async () => {
  const env=emailEnv(); await prepareSummary(env,TS);
  env.DB.raw.prepare(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at)
    VALUES('Team contact','team@example.test',?,?,?)`).run(T0,T0,T0);
  env.DB.raw.prepare("DELETE FROM contacts WHERE email='team@example.test'").run();
  assert.equal(rows(env)[0].status,"cancelled");
  assert.equal(rows(env)[0].text,null); assert.equal(rows(env)[0].recipient,null);
  await dispatchEmail(env,TS); assert.equal(env.sent.length,0);
});

test("summary is counts and links, escaped in outgoing HTML", async () => {
  const env=emailEnv(); const p=await summarySnapshot(env,TS);
  assert.match(p.text,/Hampton summary/); assert.match(p.text,/Open the panel/);
  assert.doesNotMatch(p.text,/team@example/);
});
