// NOT-08/NOT-09 (NOT0809_INBOX_READY, migration 0087): agency replies and client answers in their tabs, the one-click
// actions each notice offers, and Snooze, which hides a task from Needs action until a time without the clock reopening it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,call,adminCookie,seedListing,T0} from './helpers.mjs';
import {logEvent} from '../../server/events.js';
import {taskStatements} from '../../server/notification-tasks.js';

const ON={NOT0809_INBOX_READY:'1'},OP='9b2f7c1e-0d6a-4c3b-8f21-5a7e9d0c4b11';
const tomorrow=()=>new Date(Date.now()+864e5).toISOString();
async function fixture(on=true){
  const env=Object.assign(makeEnv(),on?ON:{});seedListing(env);
  env.DB.raw.exec(`INSERT INTO contacts(name,email,phone,last_activity_at,created_at,updated_at)
      VALUES('Action fixture','action@example.test','+447700900123','${T0}','${T0}','${T0}');
    INSERT INTO applicants(contact_id,operation,source,created_at,updated_at) VALUES(1,'rent','phone','${T0}','${T0}');`);
  const task=(taskKey,entity,target,title)=>env.DB.batch([
    ...logEvent(env,{actor:'system',entity_type:entity,entity_id:target.id,type:'fixture.task'},null),
    ...taskStatements(env,{taskKey,eventId:null,category:'task',title,target,requiresAction:true},{ifInserted:true})]);
  await task(`consultation:${OP}:call`,'listing',{kind:'listing',id:'HE-R001'},'Call the advertiser about Le Bernage (HE-R001)');
  await task(`consultation:${OP}:reply`,'listing',{kind:'listing',id:'HE-R001'},'Agency needs more information');
  await task(`consultation:${OP}`,'listing',{kind:'listing',id:'HE-R001'},'Send enquiry manually');
  await task('presentation:1:1','applicant',{kind:'applicant',id:'1'},'Client answered about HE-R001');
  await task('work:dictation:applicant:1:criteria-proposal','applicant',{kind:'applicant',id:'1'},'Confirm proposed criteria changes');
  return {env,cookie:await adminCookie()};
}
const list=(env,cookie,box,category)=>call(env,'GET',`/admin/notifications?box=${box}${category?`&category=${category}`:''}`,{cookie});
const byTitle=(r,title)=>r.data.notifications.find(n=>n.title===title);
const change=(env,cookie,id,body)=>call(env,'PUT',`/admin/notification-tasks/${id}`,{cookie,body:{operation_id:crypto.randomUUID(),...body}});

test('switched off, every task keeps its stored category and no new action is offered',async()=>{
  const {env,cookie}=await fixture(false),r=await list(env,cookie,'action');
  assert.equal(r.data.counts.task,5);assert.equal(r.data.counts.agency_reply,0);assert.equal(r.data.counts.message,0);
  const n=byTitle(r,'Agency needs more information');
  assert.equal(n.category,'task');assert.equal('quick' in n,false);assert.equal('can_snooze' in n,false);assert.equal('task_key' in n,false);
  assert.equal((await change(env,cookie,n.id,{revision:n.revision,action:'snooze',snoozed_until:tomorrow()})).status,400);
});

test('agency call and reply tasks show under Agency replies and client answers under Messages, in lists and counts',async()=>{
  const {env,cookie}=await fixture(),all=await list(env,cookie,'action');
  assert.equal(all.data.counts.agency_reply,2);assert.equal(all.data.counts.message,1);assert.equal(all.data.counts.task,2);
  assert.equal(all.data.counts.action,5);
  const replies=await list(env,cookie,'action','agency_reply');
  assert.deepEqual(replies.data.notifications.map(n=>n.title).sort(),['Agency needs more information','Call the advertiser about Le Bernage (HE-R001)']);
  assert.ok(replies.data.notifications.every(n=>n.category==='agency_reply'&&!('task_key' in n)));
  assert.deepEqual((await list(env,cookie,'action','message')).data.notifications.map(n=>n.title),['Client answered about HE-R001']);
  // The stored category is not rewritten: switching off restores the previous tabs.
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM notifications WHERE category='task' AND task_key IS NOT NULL AND task_key NOT LIKE 'event:%'").get().n,5);
  const quick=Object.fromEntries(all.data.notifications.map(n=>[n.title,n.quick]));
  assert.equal(quick['Call the advertiser about Le Bernage (HE-R001)'],'call');assert.equal(quick['Agency needs more information'],'reply');
  assert.equal(quick['Confirm proposed criteria changes'],'approve');assert.equal(quick['Send enquiry manually'],null);
  assert.equal(byTitle(all,'Client answered about HE-R001').phone,'+447700900123');
});

test('Snooze moves a task to the Feed until its time, with its own revision, history and event; Wake brings it back',async()=>{
  const {env,cookie}=await fixture(),n=byTitle(await list(env,cookie,'action'),'Agency needs more information');
  assert.equal(n.can_snooze,true);assert.equal(n.snoozed_until,null);
  const until=tomorrow(),r=await change(env,cookie,n.id,{revision:n.revision,action:'snooze',snoozed_until:until});
  assert.equal(r.status,200);assert.equal(r.data.task.snoozed_until,until);assert.equal(r.data.task.revision,n.revision+1);
  assert.equal(r.data.task.can_snooze,false);
  const action=await list(env,cookie,'action');
  assert.equal(byTitle(action,'Agency needs more information'),undefined);assert.equal(action.data.counts.agency_reply,1);assert.equal(action.data.counts.action,4);
  // Hidden Feed categories never hide a snoozed task.
  await call(env,'PUT','/admin/notification-preferences',{cookie,body:{revision:0,feed_categories:['compliance']}});
  assert.equal(byTitle(await list(env,cookie,'feed'),'Agency needs more information').snoozed_until,until);
  assert.equal(env.DB.raw.prepare('SELECT action FROM notification_task_history WHERE task_id=? ORDER BY revision DESC').get(n.id).action,'snooze');
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE type='task.snooze'").get().n,1);
  const woke=await change(env,cookie,n.id,{revision:r.data.task.revision,action:'unsnooze'});
  assert.equal(woke.status,200);assert.equal(woke.data.task.snoozed_until,null);
  assert.ok(byTitle(await list(env,cookie,'action'),'Agency needs more information'));
});

test('Snooze takes only an open task and a time within the next 30 days',async()=>{
  const {env,cookie}=await fixture(),n=byTitle(await list(env,cookie,'action'),'Send enquiry manually');
  for(const snoozed_until of [new Date(Date.now()-6e4).toISOString(),new Date(Date.now()+31*864e5).toISOString(),'tomorrow',null])
    assert.equal((await change(env,cookie,n.id,{revision:n.revision,action:'snooze',snoozed_until})).status,400);
  assert.equal((await change(env,cookie,n.id,{revision:n.revision,action:'snooze'})).status,400);
  assert.equal((await change(env,cookie,n.id,{revision:n.revision,action:'done',snoozed_until:tomorrow()})).status,400);
  const done=await change(env,cookie,n.id,{revision:n.revision,action:'done'});
  assert.equal((await change(env,cookie,n.id,{revision:done.data.task.revision,action:'snooze',snoozed_until:tomorrow()})).status,409);
});

test('new context from the source wakes a snoozed task; an unchanged clock tick does not reopen or duplicate it',async()=>{
  const env=Object.assign(makeEnv(),ON);
  env.DB.raw.exec(`INSERT INTO payments(received_on,amount,kind,source,created_at) VALUES('2026-11-08',100,'rent','manual','${T0}');`);
  const {notificationsPass}=await import('../../server/notification-reconcile.js'),at='2026-11-09T12:00:00.000Z',cookie=await adminCookie();
  await notificationsPass(env,at);
  const n=byTitle(await list(env,cookie,'action'),'Unmatched payment');
  assert.equal((await change(env,cookie,n.id,{revision:n.revision,action:'snooze',snoozed_until:tomorrow()})).status,200);
  const count=()=>env.DB.raw.prepare('SELECT COUNT(*) AS n FROM events').get().n,before=count();
  await notificationsPass(env,'2026-11-09T12:05:00.000Z');await notificationsPass(env,'2026-11-09T12:10:00.000Z');
  assert.equal(count(),before);
  assert.equal(byTitle(await list(env,cookie,'action'),'Unmatched payment'),undefined);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM notifications WHERE title='Unmatched payment'").get().n,1);
  const t=env.DB.raw.prepare('SELECT revision FROM notifications WHERE id=?').get(n.id).revision;
  await env.DB.batch(taskStatements(env,{taskKey:env.DB.raw.prepare('SELECT task_key FROM notifications WHERE id=?').get(n.id).task_key,
    eventId:env.DB.raw.prepare('SELECT MAX(id) AS id FROM events').get().id,sourceVersion:1e9,category:'task',title:'Unmatched payment',
    reason:'New context',target:{kind:'payment',id:'1'}}));
  assert.ok(env.DB.raw.prepare('SELECT revision FROM notifications WHERE id=?').get(n.id).revision>t);
  assert.ok(byTitle(await list(env,cookie,'action'),'Unmatched payment'));
});
