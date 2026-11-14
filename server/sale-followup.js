import {json,fail,readJson,now} from './http.js';
import {WEEKDAYS,realDate,jerseyToday} from './viewings.js';
import {saleFollowupWindow} from './sale-followup-schedule.js';
import {taskStatements} from './notification-tasks.js';

// OFE-06: the weekly internal review of each sale in progress. The team sets the day and time (Jersey); until then,
// and without OFE06_WEEKLY_REVIEW_READY=1, nothing runs. Each sale and Jersey week gets one shared Inbox task (NOT-11
// taskStatements, idempotent by task_key); a review or the sale closing resolves it. Nothing is sent to anyone.
export const followupReady=env=>env.OFE06_WEEKLY_REVIEW_READY==='1';
const KEY='sale_followup_schedule',TITLE='Weekly sale review',BUDGET=50;
const PARTIES=['buyer_lawyer','seller_lawyer','buyer','seller','lender','other'];
const taskKey=(saleId,week)=>`sale-followup:${saleId}:${week}`;
const weekText=week=>new Date(`${week}T12:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const target=saleId=>({kind:'sale',id:String(saleId)});
// The steps as they are: a review made on an older reading is stale (binds the sale id).
const SNAPSHOT=`(SELECT COALESCE(group_concat(v,';'),'') FROM (SELECT key||'|'||COALESCE(planned_on,'')||'|'||COALESCE(done_on,'')
  ||'|'||not_needed||'|'||COALESCE(note,'') AS v FROM sale_milestones WHERE sale_id=? ORDER BY key))`;
// Binds the time and the actor first; the caller adds FROM sale_followups f JOIN sales s and its guards.
const followupEvent=type=>`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
  SELECT ?,?,'applicant',CAST(s.applicant_id AS TEXT),'${type}',json_object('version',1,'sale_id',s.id,'week_key',f.week_key)`;

async function readSchedule(env){
  const row=await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(KEY).first();
  return row?JSON.parse(row.value):null;
}
const scheduleDto=s=>({enabled:s?.enabled===true,day:s?.day??null,time:s?.time??null,activated_at:s?.enabled===true?s.activatedAt:null});

async function getSchedule({env}){return json({schedule:scheduleDto(await readSchedule(env))});}
async function putSchedule({request,env,admin}){
  const b=await readJson(request),enabled=b?.enabled;
  if(typeof enabled!=='boolean')fail(400,'Choose on or off');
  const prev=await readSchedule(env),day=b.day??(enabled?null:prev?.day??null),time=b.time??(enabled?null:prev?.time??null);
  if((enabled||day!==null)&&!WEEKDAYS.includes(day))fail(400,'Choose a day');
  if((enabled||time!==null)&&!(typeof time==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))fail(400,'Enter a time as HH:MM');
  // A new day or time starts from now: the clock never makes up a review that was due before the team set it.
  const same=prev?.enabled===true&&enabled&&prev.day===day&&prev.time===time,ts=now();
  const value={enabled,day,time,...(enabled?{activatedAt:same?prev.activatedAt:ts}:{})};
  await env.DB.prepare(`INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(KEY,JSON.stringify(value),ts,admin).run();
  return json({schedule:scheduleDto(value)});
}

// One tick: resolve the reviews of sales that closed, then open the week's reviews that are due. At most BUDGET of each
// kind per tick, so a backlog spreads over the next ticks. Every statement is guarded, so a repeated tick writes nothing.
export async function saleFollowupPass(env,at){
  const statements=[];
  const {results:closing}=await env.DB.prepare(`SELECT f.id,f.sale_id,f.task_key FROM sale_followups f JOIN sales s ON s.id=f.sale_id
    WHERE f.status='open' AND s.status<>'in_progress' ORDER BY f.id LIMIT ?`).bind(BUDGET).all();
  for(const f of closing)statements.push(
    env.DB.prepare(`${followupEvent('sale.followup_closed')} FROM sale_followups f JOIN sales s ON s.id=f.sale_id
      WHERE f.id=? AND f.status='open' AND s.status<>'in_progress'`).bind(at,'system',f.id),
    ...taskStatements(env,{taskKey:f.task_key,eventId:null,category:'task',title:TITLE,target:target(f.sale_id),
      resolved:true,preserveDone:true},{ifInserted:true}),
    env.DB.prepare(`UPDATE sale_followups SET status='cancelled',closed_at=? WHERE id=? AND status='open'
      AND EXISTS(SELECT 1 FROM sales WHERE id=sale_followups.sale_id AND status<>'in_progress')`).bind(at,f.id));
  const window=saleFollowupWindow(at,await readSchedule(env));
  let opened=0;
  for(const w of window.state==='due'?window.dueWindows:[]){
    const {results:due}=await env.DB.prepare(`SELECT id FROM sales s WHERE status='in_progress' AND created_at<?
      AND NOT EXISTS(SELECT 1 FROM sale_followups f WHERE f.sale_id=s.id AND f.week_key=?) ORDER BY id LIMIT ?`)
      .bind(w.dueAt,w.weekStart,BUDGET-opened).all();
    for(const {id} of due){
      const key=taskKey(id,w.weekStart);
      statements.push(
        env.DB.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
          SELECT ?,'system','applicant',CAST(applicant_id AS TEXT),'sale.followup_due',json_object('version',1,'sale_id',id,'week_key',?)
          FROM sales s WHERE id=? AND status='in_progress' AND created_at<?
            AND NOT EXISTS(SELECT 1 FROM sale_followups f WHERE f.sale_id=s.id AND f.week_key=?)`)
          .bind(at,w.weekStart,id,w.dueAt,w.weekStart),
        ...taskStatements(env,{taskKey:key,eventId:null,category:'task',title:TITLE,target:target(id),preserveDone:true,
          reason:`Week of ${weekText(w.weekStart)}: check the steps and record any step taken outside the app.`},{ifInserted:true}),
        env.DB.prepare(`INSERT INTO sale_followups(sale_id,week_key,task_key,created_at)
          SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM notifications WHERE task_key=?) ON CONFLICT DO NOTHING`)
          .bind(id,w.weekStart,key,at,key));
    }
    opened+=due.length;
    if(opened>=BUDGET)break;
  }
  if(statements.length)await env.DB.batch(statements);
  return {closed:closing.length,opened};
}

// The sale's reviews (open first, then the last few) and its outside steps, with the steps' snapshot a review sends back.
async function view({env,params:[id]}){
  const saleId=Number(id),q=(sql,...args)=>env.DB.prepare(sql).bind(...args);
  const [[sale],followups,contacts]=(await env.DB.batch([
    q(`SELECT id,status,${SNAPSHOT} AS snapshot FROM sales WHERE id=?`,saleId,saleId),
    q(`SELECT id,week_key,status,note,reviewed_at,reviewed_by,closed_at FROM sale_followups WHERE sale_id=?
      ORDER BY status<>'open',week_key DESC LIMIT 12`,saleId),
    q(`SELECT id,party,occurred_on,reference,created_at,created_by FROM sale_external_contacts WHERE sale_id=?
      ORDER BY occurred_on DESC,id DESC LIMIT 50`,saleId),
  ])).map(r=>r.results);
  if(!sale)fail(404,'Sale not found');
  return json({snapshot:sale.snapshot,followups,contacts});
}

// A person reviewed the week's steps. Only an open review of this sale in progress, read on the steps as they are now;
// it resolves the Inbox task and never changes a step.
async function review({request,env,admin,params:[id,fid]}){
  const b=await readJson(request),saleId=Number(id),followupId=Number(fid);
  const note=b?.note==null||b.note===''?null:typeof b.note==='string'&&b.note.trim().length<=300?b.note.trim()||null:fail(400,'Use 300 characters or fewer');
  if(typeof b?.snapshot!=='string')fail(400,'Reload the sale and review again');
  const f=await env.DB.prepare(`SELECT f.status,f.task_key,s.status AS sale_status FROM sale_followups f JOIN sales s ON s.id=f.sale_id
    WHERE f.id=? AND f.sale_id=?`).bind(followupId,saleId).first()??fail(404,'Review not found');
  if(f.status!=='open'||f.sale_status!=='in_progress')fail(409,'This review is no longer open');
  const ts=now();
  const [updated]=await env.DB.batch([
    env.DB.prepare(`UPDATE sale_followups SET status='reviewed',reviewed_at=?,reviewed_by=?,note=? WHERE id=? AND sale_id=? AND status='open'
      AND EXISTS(SELECT 1 FROM sales WHERE id=? AND status='in_progress') AND ${SNAPSHOT}=?`)
      .bind(ts,admin,note,followupId,saleId,saleId,saleId,b.snapshot),
    env.DB.prepare(`${followupEvent('sale.followup_reviewed')} FROM sale_followups f JOIN sales s ON s.id=f.sale_id
      WHERE f.id=? AND changes()=1`).bind(ts,admin,followupId),
    ...taskStatements(env,{taskKey:f.task_key,eventId:null,category:'task',title:TITLE,target:target(saleId),resolved:true,
      preserveDone:true,actor:admin},{ifInserted:true}),
  ]);
  if(!updated.meta.changes){
    const cur=await env.DB.prepare('SELECT status FROM sale_followups WHERE id=?').bind(followupId).first();
    fail(409,cur?.status==='open'?'The steps changed since you loaded them. Reload and review again.':'This review is no longer open');
  }
  return json({ok:true});
}

// A minimal reference to a step taken outside the app: who, when and a short reference. Not a milestone, not advice.
async function contact({request,env,admin,params:[id]}){
  const b=await readJson(request),saleId=Number(id),errors={};
  if(!PARTIES.includes(b?.party))errors.party='Choose who it was with';
  if(!realDate(b?.occurred_on))errors.occurred_on='Enter a date as YYYY-MM-DD';
  else if(b.occurred_on>jerseyToday())errors.occurred_on='Use today or an earlier date';
  const reference=typeof b?.reference==='string'?b.reference.trim():'';
  if(!reference||reference.length>120)errors.reference='Enter a short reference, 120 characters or fewer';
  if(Object.keys(errors).length)return json({error:'Please check the highlighted fields',fields:errors},400);
  const ts=now();
  const res=await env.DB.prepare(`INSERT INTO sale_external_contacts(sale_id,party,occurred_on,reference,created_at,created_by)
    SELECT id,?,?,?,?,? FROM sales WHERE id=? AND status='in_progress'`).bind(b.party,b.occurred_on,reference,ts,admin,saleId).run();
  if(!res.meta.changes){
    if(!await env.DB.prepare('SELECT 1 FROM sales WHERE id=?').bind(saleId).first())fail(404,'Sale not found');
    fail(409,'This sale is no longer in progress');
  }
  return json({contact:{id:res.meta.last_row_id,party:b.party,occurred_on:b.occurred_on,reference,created_at:ts,created_by:admin}},201);
}

export default [
  ['GET',/^\/admin\/sale-followups\/schedule$/,getSchedule,true],
  ['PUT',/^\/admin\/sale-followups\/schedule$/,putSchedule,true],
  ['GET',/^\/admin\/sales\/(\d+)\/followup$/,view,true],
  ['POST',/^\/admin\/sales\/(\d+)\/followups\/(\d+)\/review$/,review,true],
  ['POST',/^\/admin\/sales\/(\d+)\/contacts$/,contact,true],
];
