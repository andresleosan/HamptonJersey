import {updateListingEvent} from './listing-events.js';
import {taskStatements} from './notification-tasks.js';
import {rentalClosureEnabled} from './rental-closure.js';

const DB_NOW="strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const key=id=>`pub16:withdrawal:${id}`;
const resolveFailure=(env,closureId)=>env.DB.prepare(`UPDATE notifications SET resolved_at=COALESCE(resolved_at,${DB_NOW}),
  resolved_by=COALESCE(resolved_by,'system'),closed_by_source=1,task_actor='system',task_action='source_resolved'
  WHERE task_key=? AND EXISTS(SELECT 1 FROM rental_closure_windows WHERE closure_id=? AND state='withdrawn')`)
  .bind(key(closureId),closureId);

async function reportFailure(env,row) {
  // The event and task are conditional on the closure still being due; another tick may have fixed it meanwhile.
  const event=env.DB.prepare(`INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    SELECT ${DB_NOW},'system','listing',w.listing_id,'listing.withdrawal_failed',json_object('version',1,'closure_id',w.closure_id)
    FROM rental_closure_windows w WHERE w.closure_id=? AND w.state='open' AND w.due_at<=${DB_NOW}
      AND EXISTS(SELECT 1 FROM listings WHERE id=w.listing_id)
      AND NOT EXISTS(SELECT 1 FROM notifications WHERE task_key=? AND resolved_at IS NULL)`)
    .bind(row.closure_id,key(row.closure_id));
  const task=taskStatements(env,{eventId:null,taskKey:key(row.closure_id),target:{kind:'listing',id:row.listing_id},
    category:'task',title:'Automatic withdrawal needs review',reason:'The rental was not withdrawn by the scheduled process.',
    urgency:'urgent',dueAt:row.due_at,actor:'system',reopen:true},{ifInserted:true});
  await env.DB.batch([event,...task]);
}

async function withdraw(env,row) {
  if(!row.live_id)throw new Error('Rental withdrawal target unavailable');
  if(row.operation!=='rent'||row.availability!=='let_agreed'||row.archived_at!==null)
    throw new Error('Rental withdrawal requires review');
  if(row.published===0) {
    // Preserve a prior unpublish only while this is still the expected, non-archived rental.
    const result=await env.DB.batch([
      env.DB.prepare(`UPDATE rental_closure_windows SET state='withdrawn',withdrawn_at=${DB_NOW}
        WHERE closure_id=? AND state='open' AND due_at<=${DB_NOW}
        AND EXISTS(SELECT 1 FROM listings l WHERE l.id=rental_closure_windows.listing_id AND l.published=0
          AND l.operation='rent' AND l.availability='let_agreed' AND l.archived_at IS NULL AND l.updated_at=?)`)
        .bind(row.closure_id,row.updated_at),
      env.DB.prepare('SELECT changes() AS direct_changes'),resolveFailure(env,row.closure_id),
    ]);
    const changed=result[1].results[0]?.direct_changes;
    if(changed===1)return true;
    if(changed!==0)throw new Error('Rental withdrawal outcome unavailable');
    // Another worker may have closed/corrected it. An overdue window still open needs a task.
    const pending=await env.DB.prepare(`SELECT 1 AS pending FROM rental_closure_windows
      WHERE closure_id=? AND state='open' AND due_at<=${DB_NOW}`).bind(row.closure_id).first();
    if(pending)throw new Error('Rental withdrawal changed during processing');
    return false;
  }
  const guard=env.DB.prepare(`INSERT INTO listing_event_context(listing_id) SELECT NULL
    WHERE EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=?)
    AND NOT EXISTS(SELECT 1 FROM rental_closure_windows w JOIN listings l ON l.id=w.listing_id
      WHERE w.closure_id=? AND w.state='open' AND w.due_at<=${DB_NOW} AND l.id=?
        AND l.updated_at=? AND l.published=1 AND l.archived_at IS NULL AND l.operation='rent' AND l.availability='let_agreed')`)
    .bind(row.listing_id,row.closure_id,row.listing_id,row.updated_at);
  const finish=env.DB.prepare(`UPDATE rental_closure_windows SET state='withdrawn',withdrawn_at=${DB_NOW}
    WHERE closure_id=? AND state='open' AND due_at<=${DB_NOW}
      AND EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=?)`).bind(row.closure_id,row.listing_id);
  const finishGuard=env.DB.prepare(`INSERT INTO listing_event_context(listing_id) SELECT NULL
    WHERE changes()=0 AND EXISTS(SELECT 1 FROM listing_event_context WHERE listing_id=?)`).bind(row.listing_id);
  const result=await updateListingEvent(env,{id:row.listing_id,actor:'system',source:'recalculate',action:'unpublished',
    patch:{published:0},expectedAt:row.updated_at,operationId:`pub16.${row.closure_id}`,
    preconditionStatements:[guard],additionalStatements:[finish,finishGuard,resolveFailure(env,row.closure_id)]});
  return !result.replayed && result.changed;
}

// The cursor makes a bounded page fair to later due windows even when an earlier window repeatedly fails.
export async function processExpiredRentalClosures(env) {
  if(!rentalClosureEnabled(env))return {processed:0,withdrawn:0,failed:0};
  const cursor=await env.DB.prepare('SELECT after_due,after_id,revision FROM rental_closure_cursor WHERE singleton=1').first();
  if(!cursor)throw new Error('Rental closure cursor unavailable');
  const later=cursor.after_due!==null;
  const page=env.DB.prepare(`SELECT w.*,l.id AS live_id,l.updated_at,l.published,l.archived_at,l.operation,l.availability
    FROM rental_closure_windows w LEFT JOIN listings l ON l.id=w.listing_id
    WHERE w.state='open' AND w.due_at<=${DB_NOW}
      ${later?'AND (w.due_at,w.closure_id)>(?,?)':''}
    ORDER BY w.due_at,w.closure_id LIMIT 25`);
  const {results:rows}=await (later?page.bind(cursor.after_due,cursor.after_id):page).all();
  let withdrawn=0,failed=0;
  for(const row of rows) {
    try { if(await withdraw(env,row))withdrawn++; }
    catch {
      failed++;
      try { await reportFailure(env,row); } catch { console.error('Rental withdrawal task unavailable'); }
    }
  }
  const last=rows.length===25?rows.at(-1):null;
  await env.DB.prepare(`UPDATE rental_closure_cursor SET after_due=?,after_id=?,revision=revision+1
    WHERE singleton=1 AND revision=?`).bind(last?.due_at??null,last?.closure_id??null,cursor.revision).run();
  return {processed:rows.length,withdrawn,failed};
}
