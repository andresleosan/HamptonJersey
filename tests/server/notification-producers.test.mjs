import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,seedListing,call,adminCookie,T0} from './helpers.mjs';
import {logEvent} from '../../server/events.js';
import {taskStatements,getTask} from '../../server/notification-tasks.js';

const ADMIN='admin@example.test';
function fixture(){const env=makeEnv();seedListing(env);env.DB.raw.exec(`
  INSERT INTO contacts(name,email,created_at,updated_at,last_activity_at) VALUES('Private fixture','fixture@example.test','${T0}','${T0}','${T0}');
  INSERT INTO applicants(contact_id,operation,source,created_at,updated_at) VALUES(1,'buy','phone','${T0}','${T0}');
  INSERT INTO viewing_requests(kind,date,time,name,email,created_at) VALUES('In person','2030-01-10','11:30','Private viewing','viewing@example.test','${T0}');
  INSERT INTO offers(listing_id,applicant_id,amount,created_at,updated_at) VALUES('HE-R001',1,100,'${T0}','${T0}');
  INSERT INTO sales(listing_id,applicant_id,offer_id,price,created_at,updated_at) VALUES('HE-R001',1,1,100,'${T0}','${T0}');
  INSERT INTO landlords(name,created_at,updated_at) VALUES('Private landlord','${T0}','${T0}');
  INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at) VALUES(1,'Private address','St Helier','full',10,'${T0}','${T0}');
  INSERT INTO tenancies(rental_id,kind,regime,tenant_name,start_on,rent,due_day,payment_ref,created_at,updated_at)
    VALUES(1,'periodic','2025','Private tenant','2026-01-01',100,1,'FIXTURE','${T0}','${T0}');
  INSERT INTO payments(tenancy_id,received_on,amount,kind,source,created_at) VALUES(1,'2026-01-01',100,'rent','manual','${T0}');`);return env;}
const scalar=(env,sql)=>Object.values(env.DB.raw.prepare(sql).get())[0];

test('future work requires a declared phase, stable episode and useful source resolution',async()=>{
  const {futureTaskStatements}=await import('../../server/notification-events.js');const env=fixture();
  const d={work:'call',episode:'reply:1',target:{kind:'applicant',id:'1'},eventId:1,title:'Call about reply'};
  await env.DB.batch(logEvent(env,{actor:'system',entity_type:'applicant',entity_id:'1',type:'fixture.reply'}));
  assert.throws(()=>futureTaskStatements(env,d),/phase/i);
  assert.throws(()=>futureTaskStatements(env,{...d,phase:'pending',work:'unknown'}),/work/i);
  await env.DB.batch(futureTaskStatements(env,{...d,phase:'pending'}));
  assert.equal(scalar(env,'SELECT COUNT(*) FROM notifications'),1);
  await env.DB.batch(logEvent(env,{actor:'system',entity_type:'applicant',entity_id:'1',type:'fixture.reply-arrived'}));
  await env.DB.batch(futureTaskStatements(env,{...d,eventId:2,phase:'resolved'}));
  assert.equal(scalar(env,'SELECT COUNT(*) FROM notifications'),1);assert.ok(scalar(env,'SELECT resolved_at FROM notifications'));
});

test('a future producer can project a freshly inserted event inside the same guarded business batch',async()=>{
  const {futureTaskStatements}=await import('../../server/notification-events.js'),env=fixture();
  await env.DB.batch([env.DB.prepare('UPDATE applicants SET budget_max=1234 WHERE id=1'),
    ...logEvent(env,{actor:ADMIN,entity_type:'applicant',entity_id:'1',type:'fixture.future'},null,{ifInserted:true}),
    ...futureTaskStatements(env,{work:'must',phase:'pending',episode:'requirement:1',eventId:null,target:{kind:'applicant',id:'1'},title:'Review requirement'},{ifInserted:true})]);
  const n=env.DB.raw.prepare('SELECT * FROM notifications').get();assert.ok(n);assert.equal(n.event_id,1);
});

test('all allowed viewing, offer, sale and property facts produce one Feed entry; legacy and unknown events do not',async()=>{
  const env=fixture();let count=0;env.DB.raw.exec("INSERT INTO sale_milestones(sale_id,key) VALUES(1,'mortgage')");
  for(const [kind,id,prefix,names,data] of [
    ['viewing','1','viewing',['booked','confirmed','rescheduled','cancelled','completed','no_show'],null],
    ['applicant','1','offer',['recorded','updated','countered','rejected','withdrawn','accepted'],{offer_id:1}],
    ['applicant','1','sale',['updated','milestone','completed','fallen_through'],{sale_id:1,key:'mortgage'}],
    ['listing','HE-R001','listing',['created','updated','published','unpublished','archived','restored','confirmed','availability_changed','featured_changed','cover_changed','recalculated','deleted'],null],
  ])for(const name of names){await env.DB.batch(logEvent(env,{actor:ADMIN,entity_type:kind,entity_id:id,type:`${prefix}.${name}`,data}));count++;}
  assert.equal(scalar(env,'SELECT COUNT(*) FROM notifications'),count);
  for(const type of ['applicant.created','applicant.duplicate','applicant.matched','viewing.requested','task.done','unknown.fact'])
    await env.DB.batch(logEvent(env,{actor:ADMIN,entity_type:'applicant',entity_id:'1',type}));
  assert.equal(scalar(env,'SELECT COUNT(*) FROM notifications'),count);
  assert.equal(scalar(env,'SELECT COUNT(*) FROM notifications WHERE action_required=1'),0);
});

test('a deleted child context closes and sanitizes the task immediately',async()=>{
  const env=fixture();env.DB.raw.exec(`INSERT INTO repairs(rental_id,title,urgency,created_at,updated_at) VALUES(1,'Private repair','emergency','${T0}','${T0}')`);
  await env.DB.batch(logEvent(env,{actor:ADMIN,entity_type:'rental',entity_id:'1',type:'fixture.child'}));
  const eventId=scalar(env,'SELECT MAX(id) FROM events');
  await env.DB.batch(taskStatements(env,{eventId,taskKey:'child:repair:1',category:'task',title:'Private task',reason:'Private reason',target:{kind:'rental',id:'1',context:{repair_id:1}}}));
  env.DB.raw.exec('DELETE FROM repairs WHERE id=1');
  const n=env.DB.raw.prepare("SELECT * FROM notifications WHERE task_key='child:repair:1'").get();
  assert.ok(n.resolved_at);assert.equal(n.target_deleted,1);assert.equal(n.target_context,null);assert.equal(n.task_reason,null);
});

test('every allowlisted rental subtype bridges one technical Feed fact while settings and landlord facts stay out',async()=>{
  const env=fixture(),{rentalEvent}=await import('../../server/routes/rentals.js');
  const types=['rental.created','rental.updated','rental.archived','rental.restored','tenancy.created','tenancy.updated','tenancy.renewed','tenancy.ended','tenancy.end_cancelled',
    'rent.changed','notice.recorded','arrears.step_done','charge.edited','compliance.updated','repair.created','repair.updated','payment.recorded','payment.updated','payments.imported'];
  for(const type of types)await env.DB.batch([rentalEvent(env,{rental_id:1,tenancy_id:1,actor:ADMIN,type,data:{payment_id:1,private_text:'Never copy fixture text'}})]);
  assert.equal(scalar(env,'SELECT COUNT(*) FROM notifications'),types.length);
  assert.equal(scalar(env,'SELECT COUNT(*) FROM events'),types.length);
  assert.ok(!JSON.stringify(env.DB.raw.prepare('SELECT * FROM events').all()).includes('Never copy'));
  for(const type of ['settings.updated','landlord.updated'])await env.DB.batch([rentalEvent(env,{actor:ADMIN,type})]);
  assert.equal(scalar(env,'SELECT COUNT(*) FROM events'),types.length);
});

test('unassigning a payment bridges the sole previous tenancy while a move bridges only its destination',async()=>{
  const env=fixture(),{rentalEvent}=await import('../../server/routes/rentals.js');
  env.DB.raw.exec('UPDATE payments SET tenancy_id=NULL WHERE id=1');
  await env.DB.batch([rentalEvent(env,{rental_id:1,tenancy_id:1,actor:ADMIN,type:'payment.updated',data:{payment_id:1,before:{tenancy_id:1},after:{tenancy_id:null}}})]);
  assert.equal(scalar(env,"SELECT COUNT(*) FROM events WHERE entity_type='payment'"),1);
  env.DB.raw.exec(`UPDATE tenancies SET ended_on='2026-11-01' WHERE id=1;
    INSERT INTO tenancies(rental_id,kind,regime,tenant_name,start_on,rent,due_day,payment_ref,created_at,updated_at)
    VALUES(1,'periodic','2025','Other fixture','2026-11-02',100,1,'OTHER','${T0}','${T0}');UPDATE payments SET tenancy_id=2 WHERE id=1;`);
  const data={payment_id:1,before:{tenancy_id:1},after:{tenancy_id:2}};
  await env.DB.batch([rentalEvent(env,{rental_id:1,tenancy_id:1,actor:ADMIN,type:'payment.updated',data}),rentalEvent(env,{rental_id:1,tenancy_id:2,actor:ADMIN,type:'payment.updated',data})]);
  assert.equal(scalar(env,"SELECT COUNT(*) FROM events WHERE entity_type='payment'"),2);
  assert.equal(scalar(env,"SELECT json_extract(data,'$.tenancy_id') FROM events ORDER BY id DESC LIMIT 1"),2);
});

test('urgent alert baseline is global and composite pages never skip same-version siblings',async()=>{
  const env=fixture(),cookie=await adminCookie();
  await env.DB.batch(logEvent(env,{actor:ADMIN,entity_type:'applicant',entity_id:'1',type:'fixture.baseline'}));
  env.DB.raw.exec(`INSERT INTO notifications(event_id,source_version,category,title,action_required,created_at)
    VALUES(1,999,'task','Historical',0,'${T0}');`);
  for(let i=0;i<205;i++)env.DB.raw.prepare(`INSERT INTO notifications(event_id,source_version,category,title,action_required,created_at)
    VALUES(1,1,'task','Newer Feed window fixture',0,'2026-11-09T00:00:00.000Z')`).run();
  const get=s=>call(env,'GET','/admin/notification-alerts'+s,{cookie});
  const baseline=await get('');assert.equal(baseline.status,200);assert.deepEqual(baseline.data.cursor,{version:999,id:1});assert.deepEqual(baseline.data.alerts,[]);
  for(let i=0;i<205;i++)env.DB.raw.prepare(`INSERT INTO notifications(event_id,source_version,category,title,action_required,created_at,urgency)
    VALUES(1,1000,'task','Private title',1,?,'urgent')`).run(T0);
  const first=await get('?version=999&id=1');assert.equal(first.data.alerts.length,200);assert.equal(first.data.hasMore,true);
  assert.ok(first.data.alerts.every(x=>Object.keys(x).sort().join(',')==='id,version'));
  const second=await get(`?version=${first.data.cursor.version}&id=${first.data.cursor.id}`);assert.equal(second.data.alerts.length,5);assert.equal(second.data.hasMore,false);
  assert.equal(new Set([...first.data.alerts,...second.data.alerts].map(a=>a.id)).size,205);
  assert.ok(!JSON.stringify(first.data).includes('Private'));
  assert.equal((await call(env,'GET','/admin/notification-alerts')).status,401);
  assert.equal((await get('?version=1')).status,400);assert.equal((await get('?version=-1&id=1')).status,400);
});

test('exact offer and payment routes authenticate and retrieve an assigned payment beyond any Unmatched window',async()=>{
  const env=fixture(),cookie=await adminCookie();
  for(const path of ['/admin/offers/1','/admin/payments/1']){
    assert.equal((await call(env,'GET',path)).status,401);
    const r=await call(env,'GET',path,{cookie});assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);
  }
  const p=await call(env,'GET','/admin/payments/1',{cookie});assert.equal(p.data.payment.tenancy_id,1);assert.equal(p.data.payment.rental_id,1);
  assert.equal((await call(env,'GET','/admin/payments/999',{cookie})).status,404);
  assert.equal((await call(env,'GET','/admin/offers/999',{cookie})).status,404);
});

test('a real sale milestone fact links its exact validated step',async()=>{
  const env=fixture();env.DB.raw.exec("INSERT INTO sale_milestones(sale_id,key,planned_on) VALUES(1,'mortgage','2026-11-01')");
  await env.DB.batch(logEvent(env,{actor:ADMIN,entity_type:'applicant',entity_id:'1',type:'sale.milestone',data:{sale_id:1,key:'mortgage'}}));
  const id=scalar(env,'SELECT id FROM notifications');assert.equal((await getTask(env,id,ADMIN)).link,'#/sales/1?milestone=mortgage');
  await env.DB.batch(logEvent(env,{actor:ADMIN,entity_type:'applicant',entity_id:'1',type:'sale.milestone',data:{sale_id:1,key:'unknown'}}));
  assert.equal(scalar(env,'SELECT COUNT(*) FROM notifications'),1);
});
