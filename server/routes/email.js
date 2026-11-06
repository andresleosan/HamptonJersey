import { json, fail, readJson, now, sha256 } from "../http.js";
import { logEvent } from "../events.js";
import { readEmailSettings, serviceReady, emailAddress, emailDay, summarySnapshot, EMAIL_FROM, EMAIL_REPLY_TO, DAILY_LIMIT } from "../email.js";

const audit = (env,actor,type,id="email",data=null,opts={}) =>
  logEvent(env,{actor,entity_type:"admin",entity_id:id,type:`email.${type}`,data},null,opts);
const exact = (b,keys) => b && typeof b === "object" && !Array.isArray(b) && Object.keys(b).length === keys.length && keys.every(k=>Object.hasOwn(b,k));
const pendingReview = "status='unknown' AND reviewed_at IS NULL";

async function settings({env}) {
  const s = await readEmailSettings(env), day = emailDay(now());
  const [{results:counts},{results:[used]},{results:suppressions},{results:[worker]},{results:[pending]}] = await env.DB.batch([
    env.DB.prepare(`SELECT status,COUNT(*) n FROM outbound WHERE id IN (SELECT outbound_id FROM email_attempts WHERE day=?)
      OR (template='team_summary' AND entity_id=?) GROUP BY status`).bind(day,day),
    env.DB.prepare("SELECT COUNT(*) n FROM email_attempts WHERE day=?").bind(day),
    env.DB.prepare("SELECT address_hash,created_at,reason FROM email_suppressions ORDER BY created_at DESC LIMIT 200"),
    env.DB.prepare("SELECT value FROM app_settings WHERE key='email_worker'"),
    env.DB.prepare(`SELECT COUNT(*) n FROM outbound WHERE ${pendingReview}`),
  ]);
  const n=status => counts.find(c=>c.status===status)?.n ?? 0;
  return json({settings:s,ready:serviceReady(env),from:EMAIL_FROM,reply_to:EMAIL_REPLY_TO,
    worker:worker ? JSON.parse(worker.value) : null,
    overview:{day,attempts_today:used.n,limit:DAILY_LIMIT,accepted_today:n("accepted"),failed_today:n("failed"),unknown_today:n("unknown"),queued_today:n("queued"),pending_review:pending.n},
    suppressions});
}

async function saveSettings({env,admin,request}) {
  const b=await readJson(request);
  if (!exact(b,["enabled","summary","recipients","expectedRevision","previewed"]) || typeof b.enabled!=="boolean"
    || typeof b.summary!=="boolean" || typeof b.previewed!=="boolean" || !Number.isSafeInteger(b.expectedRevision) || b.expectedRevision<0
    || !Array.isArray(b.recipients) || b.recipients.length>20 || b.recipients.some(a=>!emailAddress(a)))
    fail(400,"Use valid email preferences and up to 20 email addresses.");
  const recipients=[...new Set(b.recipients.map(emailAddress))];
  if (b.enabled && b.summary && (!b.previewed || !recipients.length))
    fail(400,"Review the sample summary and choose its team recipients before enabling daily sending.");
  if (b.enabled && !serviceReady(env)) fail(409,"Email service setup is not confirmed. Tell Optimyze before enabling sending.");
  const ts=now(), value={enabled:b.enabled,summary:b.summary,recipients,revision:b.expectedRevision+1,approved_by:admin,approved_at:ts};
  const r=await env.DB.batch([
    env.DB.prepare(`INSERT INTO app_settings(key,value,updated_at,updated_by) SELECT 'email',?,?,?
      WHERE (?=0 AND NOT EXISTS(SELECT 1 FROM app_settings WHERE key='email'))
        OR EXISTS(SELECT 1 FROM app_settings WHERE key='email' AND json_extract(value,'$.revision')=?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by
      WHERE json_extract(app_settings.value,'$.revision')=?`).bind(JSON.stringify(value),ts,admin,b.expectedRevision,b.expectedRevision,b.expectedRevision),
    ...audit(env,admin,"settings","email",{enabled:b.enabled,summary:b.summary,recipients:recipients.length,revision:value.revision},{ifChanged:true}),
    // No obsolete authorization survives a preference change. The day's idempotency keys still prevent a repeat.
    env.DB.prepare(`UPDATE outbound SET status=CASE WHEN status='sending' THEN 'unknown' ELSE 'cancelled' END,
      error_code=CASE WHEN status='sending' THEN 'PREFERENCES_CHANGED_IN_FLIGHT' ELSE error_code END,
      claim_token=NULL,updated_at=? WHERE template='team_summary'
      AND status IN ('queued','sending') AND config_revision < (SELECT json_extract(value,'$.revision') FROM app_settings WHERE key='email')`).bind(ts),
  ]);
  if (!r[0].meta.changes) fail(409,"Email preferences changed in another tab. Reload preferences before saving.");
  return json({settings:value});
}

async function list({env,request}) {
  const q=new URL(request.url).searchParams, box=q.get("box"), before=q.get("before"), review=q.get("review");
  if (!["inbound","outbound"].includes(box) || (before!==null && !/^[1-9]\d{0,14}$/.test(before))
    || (review!==null && (review!=="pending" || box!=="outbound"))) fail(400,"Invalid email page.");
  // Table and columns are chosen only from these constants, never from user text.
  const table=box==="inbound"?"email_inbound":"outbound";
  const cols=box==="inbound"?"id,sender,subject,received_at,outbound_id":"id,ref,recipient,subject,status,attempts,error_code,reviewed_at,created_at";
  const conditions=[...(review?[pendingReview]:[]),...(before?["id < ?"]:[])];
  const [{results},{results:[pending]}]=await env.DB.batch([
    env.DB.prepare(`SELECT ${cols} FROM ${table} ${conditions.length?`WHERE ${conditions.join(" AND ")}`:""} ORDER BY id DESC LIMIT 26`)
      .bind(...(before?[Number(before)]:[])),
    env.DB.prepare(`SELECT COUNT(*) n FROM outbound WHERE ${pendingReview}`),
  ]);
  return json({items:results.slice(0,25),next:results.length>25?results[24].id:null,pending_review:pending.n});
}
async function detail({env,params:[box,id]}) {
  const table=box==="inbound"?"email_inbound":"outbound";
  const message=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
  if (!message) fail(404,"Email no longer exists. Refresh the list.");
  return json({message});
}
async function remove({env,admin,params:[id]}) {
  const r=await env.DB.batch([
    env.DB.prepare("DELETE FROM email_inbound WHERE id=?").bind(id),
    ...audit(env,admin,"deleted",`email:inbound:${id}`,null,{ifChanged:true}),
  ]);
  if (!r[0].meta.changes) fail(404,"Email no longer exists. Refresh the list.");
  return json({ok:true});
}
async function suppress({env,admin,request}) {
  const b=await readJson(request), address=emailAddress(b?.address);
  if (!exact(b,["address"]) || !address) fail(400,"Use a valid email address.");
  const hash=await sha256(address), ts=now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO email_suppressions VALUES (?,?,'team') ON CONFLICT(address_hash) DO NOTHING").bind(hash,ts),
    ...audit(env,admin,"suppressed","email",null,{ifInserted:true}),
    env.DB.prepare(`UPDATE outbound SET status=CASE WHEN status='sending' THEN 'unknown' ELSE 'cancelled' END,
      error_code=CASE WHEN status='sending' THEN 'SUPPRESSED_IN_FLIGHT' ELSE error_code END,claim_token=NULL,updated_at=?
      WHERE recipient_hash=? AND status IN ('draft','queued','sending')`).bind(ts,hash),
  ]);
  return json({ok:true});
}
async function unsuppress({env,admin,params:[hash]}) {
  await env.DB.batch([env.DB.prepare("DELETE FROM email_suppressions WHERE address_hash=?").bind(hash),
    ...audit(env,admin,"suppression_removed","email",null,{ifChanged:true})]);
  return json({ok:true});
}
async function review({env,admin,request,params:[id]}) {
  const b=await readJson(request);
  if (!exact(b,["acknowledged"]) || b.acknowledged!==true) fail(400,"Confirm that you have checked the unknown result.");
  const r=await env.DB.batch([
    env.DB.prepare("UPDATE outbound SET reviewed_at=?,reviewed_by=? WHERE id=? AND status='unknown' AND reviewed_at IS NULL").bind(now(),admin,id),
    ...audit(env,admin,"reviewed",`email:outbound:${id}`,null,{ifChanged:true}),
  ]);
  if (!r[0].meta.changes) fail(409,"This email is no longer waiting for review. Refresh the list.");
  return json({ok:true});
}
export default [
  ["GET",/^\/admin\/email\/settings$/,settings,true],
  ["PUT",/^\/admin\/email\/settings$/,saveSettings,true],
  ["GET",/^\/admin\/email\/preview$/,async ({env})=>json(await summarySnapshot(env,now())),true],
  ["GET",/^\/admin\/email$/,list,true],
  ["GET",/^\/admin\/email\/(inbound|outbound)\/([1-9]\d{0,14})$/,detail,true],
  ["DELETE",/^\/admin\/email\/inbound\/([1-9]\d{0,14})$/,remove,true],
  ["POST",/^\/admin\/email\/suppressions$/,suppress,true],
  ["DELETE",/^\/admin\/email\/suppressions\/([a-f0-9]{64})$/,unsuppress,true],
  ["POST",/^\/admin\/email\/outbound\/([1-9]\d{0,14})\/review$/,review,true],
];
