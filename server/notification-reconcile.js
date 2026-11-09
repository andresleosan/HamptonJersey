import {fail} from './http.js';
import {jerseyToday} from './viewings.js';
import {ARREARS_STEPS,COMPLIANCE,LEGAL} from './rentals.js';
import {ARREARS_SQL,DEADLINES,CHECKS,RENEWAL,ensureCharges} from './routes/rent.js';
import {WAITING,waitingCutoff} from './routes/sales.js';
import {TO_CONFIRM} from './listing.js';
import {taskStatements} from './notification-tasks.js';

// One shared definition is used for the grouped read and the INSERT's domain revalidation.
// Parameters: Jersey date, optional tenancy (always NULL here), processing ISO, Waiting cutoff.
const quote=s=>`'${s.replaceAll("'","''")}'`;
const checkState=`CASE WHEN c.expires_on IS NULL THEN 'missing' WHEN c.expires_on<?1 THEN 'overdue'
  ${LEGAL.warnDays.toReversed().map(d=>`WHEN c.expires_on<=date(?1,'+${d} days') THEN 'due${d}'`).join(' ')} ELSE 'ok' END`;
const stepLabel=`CASE a.next_step ${ARREARS_STEPS.map(([,key,label])=>`WHEN '${key}' THEN ${quote('Arrears: '+label)}`).join(' ')} END`;
const stepDue=`CASE a.next_step ${ARREARS_STEPS.map(([days,key])=>`WHEN '${key}' THEN date(a.oldest_unpaid_on,'+${days} days')||'T00:00:00.000Z'`).join(' ')} END`;
const checkLabel=`CASE c.kind ${COMPLIANCE.map(([key,label])=>`WHEN '${key}' THEN ${quote('Check: '+label)}`).join(' ')} END`;
const sortKey=(a='')=>`${a}kind||':'||CASE WHEN ${a}target_kind='listing' THEN ${a}target_id ELSE printf('%020d',CAST(${a}entity_id AS INTEGER)) END||':'||${a}entity_id||':'||${a}cycle`;
const columns='kind,entity_id,cycle,target_kind,target_id,target_context,title,due_at,urgency,signature,source_kind,source_id';
// D1 limits compound SELECTs more tightly than ordinary SQLite. Materialize bounded groups.
const deadlineRows=DEADLINES.map(([key,label,from,days,done])=>`SELECT 'deadline',CAST(t.id AS TEXT)||':${key}',t.${from},'rental',CAST(t.rental_id AS TEXT),
  json_object('tenancy_id',t.id,'deadline','${key}'),${quote(label+' overdue')},date(t.${from},'+${days} days')||'T00:00:00.000Z','normal',json_array(t.${from}),'rental',CAST(t.rental_id AS TEXT)
  FROM tenancies t JOIN rentals r ON r.id=t.rental_id WHERE r.archived_at IS NULL AND t.${from} IS NOT NULL AND t.${done} IS NULL AND date(t.${from},'+${days} days')<?1`).join('\nUNION ALL ');
const PENDING=`${ARREARS_SQL},pending_deadlines(${columns}) AS MATERIALIZED (${deadlineRows}),rental_pending(${columns}) AS MATERIALIZED (
  SELECT 'arrears',CAST(a.tenancy_id AS TEXT),a.oldest_unpaid_on||':'||a.next_step,'rental',CAST(a.rental_id AS TEXT),
    json_object('tenancy_id',a.tenancy_id),${stepLabel},${stepDue},'normal',json_array(a.oldest_unpaid_on,a.next_step),'rental',CAST(a.rental_id AS TEXT)
    FROM arrears a JOIN rentals r ON r.id=a.rental_id WHERE a.next_step IS NOT NULL AND r.archived_at IS NULL
  UNION ALL SELECT 'check',CAST(c.rental_id AS TEXT)||':'||c.kind,COALESCE(c.done_on,'missing'),'rental',CAST(c.rental_id AS TEXT),
    json_object('compliance_kind',c.kind),${checkLabel},c.expires_on||'T00:00:00.000Z','normal',json_array(c.expires_on,${checkState}),'rental',CAST(c.rental_id AS TEXT)
    ${CHECKS} AND (${checkState})<>'ok'
  UNION ALL SELECT * FROM pending_deadlines
  UNION ALL SELECT 'renewal',CAST(t.id AS TEXT),t.end_on,'rental',CAST(t.rental_id AS TEXT),json_object('tenancy_id',t.id),
    'Decide renewal',NULL,'normal',json_array(t.end_on),'rental',CAST(t.rental_id AS TEXT)
    FROM tenancies t JOIN rentals r ON r.id=t.rental_id WHERE r.archived_at IS NULL AND ${RENEWAL}
  UNION ALL SELECT 'repair',CAST(p.id AS TEXT),'current','rental',CAST(p.rental_id AS TEXT),
    json_patch('{}',json_object('tenancy_id',p.tenancy_id,'repair_id',p.id)),'Emergency repair',NULL,'urgent',json_array(p.status,p.urgency),'rental',CAST(p.rental_id AS TEXT)
    FROM repairs p JOIN rentals r ON r.id=p.rental_id WHERE r.archived_at IS NULL AND p.urgency='emergency' AND p.status NOT IN ('done','cancelled')
),other_pending(${columns}) AS MATERIALIZED (
  SELECT 'payment',CAST(p.id AS TEXT),'current','payment',CAST(p.id AS TEXT),NULL,
    'Unmatched payment',NULL,'normal',json_array('unmatched'),'payment',CAST(p.id AS TEXT) FROM payments p WHERE p.tenancy_id IS NULL
  UNION ALL SELECT 'offer',CAST(o.id AS TEXT),o.updated_at,'offer',CAST(o.id AS TEXT),NULL,
    'Waiting offer',NULL,'normal',json_array(o.updated_at),'applicant',CAST(o.applicant_id AS TEXT) FROM offers o WHERE ${WAITING.replace('?', '?4')}
  UNION ALL SELECT 'milestone',CAST(s.id AS TEXT)||':'||m.key,m.planned_on,'sale',CAST(s.id AS TEXT),json_object('milestone',m.key),
    'Overdue sale milestone',m.planned_on||'T00:00:00.000Z','normal',json_array(m.planned_on),'applicant',CAST(s.applicant_id AS TEXT)
    FROM sales s JOIN sale_milestones m ON m.sale_id=s.id WHERE s.status='in_progress' AND m.planned_on<?1 AND m.done_on IS NULL AND m.not_needed=0
  UNION ALL SELECT 'listing',l.id,l.confirmed_at,'listing',l.id,NULL,'Confirm property availability',
    strftime('%Y-%m-%dT%H:%M:%fZ',l.confirmed_at,CASE l.operation WHEN 'rent' THEN '+1 month' ELSE '+3 months' END),
    'normal',json_array(l.confirmed_at,l.operation),'listing',l.id FROM listings l WHERE ${TO_CONFIRM.replace('?', '?3')}
),raw_pending AS MATERIALIZED (SELECT * FROM rental_pending UNION ALL SELECT * FROM other_pending),
pending AS MATERIALIZED (SELECT *,'queue:'||kind||':'||entity_id||':'||cycle AS task_key,${sortKey()} AS sort_key FROM raw_pending)`;

const reentry=`(o.active=0 OR (o.kind='repair' AND EXISTS(SELECT 1 FROM events x
  WHERE x.id>o.event_id AND x.entity_type='rental' AND x.entity_id=o.target_id
    AND json_extract(x.data,'$.repair_id')=CAST(o.entity_id AS INTEGER)
    AND (json_extract(x.data,'$.urgency') IN ('routine','urgent') OR json_extract(x.data,'$.state') IN ('done','cancelled'))))
  OR (o.kind='payment' AND EXISTS(SELECT 1 FROM events x WHERE x.id>o.event_id AND x.entity_type='payment'
    AND x.entity_id=o.entity_id AND json_extract(x.data,'$.unmatched')=0)))`;

export async function notificationsPass(env,isoNow) {
  if(typeof isoNow!=='string'||!Number.isFinite(Date.parse(isoNow))||new Date(isoNow).toISOString()!==isoNow)fail(400,'Use a processing UTC time');
  const args=[jerseyToday(new Date(isoNow)),null,isoNow,waitingCutoff(isoNow)];
  const q=(sql,...extra)=>env.DB.prepare(sql).bind(...args,...extra);
  const [,cursorRead,selection]=await env.DB.batch([
    // Existing idempotent rent generation: the same calculation used by Rentals, never a new money rule.
    ensureCharges(env,args[0]),
    env.DB.prepare("SELECT *,COALESCE((SELECT MAX(id) FROM events),0) AS source_max FROM notification_cursor WHERE key='queues'"),
    q(`WITH ${PENDING},identities AS (
      SELECT task_key,sort_key FROM pending UNION SELECT o.task_key,${sortKey('o.')} FROM notification_observations o WHERE o.active=1)
      SELECT i.task_key,i.sort_key,p.task_key IS NOT NULL AS pending,
        COALESCE(p.kind,o.kind) AS kind,COALESCE(p.entity_id,o.entity_id) AS entity_id,COALESCE(p.cycle,o.cycle) AS cycle,
        COALESCE(p.target_kind,o.target_kind) AS target_kind,COALESCE(p.target_id,o.target_id) AS target_id,
        CASE WHEN p.task_key IS NOT NULL THEN p.target_context ELSE n.target_context END AS target_context,
        COALESCE(p.title,n.title) AS title,CASE WHEN p.task_key IS NOT NULL THEN p.due_at ELSE n.due_at END AS due_at,
        COALESCE(p.urgency,n.urgency) AS urgency,COALESCE(p.signature,o.signature) AS signature,
        ${reentry} AS reentered,o.active AS prior_active,o.signature AS prior_signature
      FROM identities i LEFT JOIN pending p ON p.task_key=i.task_key
      LEFT JOIN notification_observations o ON o.task_key=i.task_key LEFT JOIN notifications n ON n.task_key=i.task_key
      WHERE i.sort_key>(SELECT after_key FROM notification_cursor WHERE key='queues') ORDER BY i.sort_key LIMIT 51`),
  ]);
  const cursor=cursorRead.results[0],selected=selection.results.slice(0,50),hasMore=selection.results.length>50;
  if(cursor.observed_at>isoNow)return {processed:0,hasMore:false,contended:true};
  const statements=[env.DB.prepare(`UPDATE notification_cursor SET revision=revision+1,after_key=?,observed_at=?
    WHERE key='queues' AND revision=? AND observed_at<=? AND COALESCE((SELECT MAX(id) FROM events),0)=?`)
    .bind(hasMore?selected.at(-1).sort_key:'',isoNow,cursor.revision,isoNow,cursor.source_max),
    env.DB.prepare("INSERT INTO notification_cursor(key,revision,after_key,observed_at) SELECT 'contended',0,'','' WHERE changes()=0")];
  for(const row of selected){
    if(row.pending&&row.prior_active===1&&row.signature===row.prior_signature&&!row.reentered)continue;
    const token=crypto.randomUUID(),target={kind:row.target_kind,id:row.target_id,...(row.target_context?{context:JSON.parse(row.target_context)}:{})};
    if(row.pending)statements.push(q(`WITH ${PENDING} INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT ?7,'system',p.source_kind,p.source_id,'notification.observed',json_object('version',1,'queue',p.kind,'identity',p.entity_id,'cycle',p.cycle,
        'offer_id',CASE WHEN p.target_kind='offer' THEN CAST(p.target_id AS INTEGER) END,
        'sale_id',CASE WHEN p.target_kind='sale' THEN CAST(p.target_id AS INTEGER) END,'observation_token',?8)
      FROM pending p WHERE p.task_key=?5 AND p.signature=?6`,row.task_key,row.signature,isoNow,token));
    else statements.push(q(`WITH ${PENDING} INSERT INTO events(at,actor,entity_type,entity_id,type,data)
      SELECT ?6,'system',e.entity_type,e.entity_id,'notification.observed',json_object('version',1,'queue',o.kind,'identity',o.entity_id,'cycle',o.cycle,
        'offer_id',CASE WHEN o.target_kind='offer' THEN CAST(o.target_id AS INTEGER) END,
        'sale_id',CASE WHEN o.target_kind='sale' THEN CAST(o.target_id AS INTEGER) END,'observation_token',?7)
      FROM notification_observations o JOIN events e ON e.id=o.event_id WHERE o.task_key=?5 AND o.active=1
        AND NOT EXISTS(SELECT 1 FROM pending p WHERE p.task_key=o.task_key)`,row.task_key,isoNow,token));
    statements.push(...taskStatements(env,{taskKey:row.task_key,eventId:null,target,category:'task',title:row.title,
      dueAt:row.due_at,urgency:row.urgency,resolved:!row.pending,preserveDone:true,reopen:Boolean(row.pending&&row.reentered)}, {ifInserted:true}));
    statements.push(env.DB.prepare(`INSERT INTO notification_observations(task_key,kind,entity_id,cycle,signature,active,target_kind,target_id,event_id)
      SELECT ?,?,?,?,?,?,?,?,n.event_id FROM notifications n JOIN events e ON e.id=n.event_id
      WHERE n.task_key=? AND json_extract(e.data,'$.observation_token')=?
      ON CONFLICT(task_key) DO UPDATE SET signature=excluded.signature,active=excluded.active,event_id=excluded.event_id`)
      .bind(row.task_key,row.kind,row.entity_id,row.cycle,row.signature,Number(row.pending),row.target_kind,row.target_id,row.task_key,token));
  }
  try{await env.DB.batch(statements);}catch(error){
    if(String(error?.message).includes('notification_cursor_cas'))return {processed:0,hasMore:true,contended:true};
    throw error;
  }
  return {processed:selected.length,hasMore,contended:false};
}
