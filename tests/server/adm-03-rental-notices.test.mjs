// ADM-03: the rental milestones the Inbox was still missing, on the shared clock's notification pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readdirSync,readFileSync} from 'node:fs';
import {makeEnv,T0} from './helpers.mjs';
import {notificationsPass} from '../../server/notification-reconcile.js';

const AT='2026-11-09T12:00:00.000Z',ON={ADM13_INSPECTIONS_READY:'1'};
const SEED=`INSERT INTO landlords(name,created_at,updated_at) VALUES('Fixture','${T0}','${T0}');
  INSERT INTO rentals(landlord_id,address,parish,service,fee_percent,created_at,updated_at)
    VALUES(1,'Fixture one','St Helier','full',10,'${T0}','${T0}'),(1,'Fixture two','St Helier','full',10,'${T0}','${T0}');
  INSERT INTO tenancies(rental_id,tenant_name,kind,regime,start_on,end_on,rent,due_day,payment_ref,created_at,updated_at)
    VALUES(1,'Fixture tenant','periodic','2025','2026-05-20',NULL,100,1,'FIXTURE1','${T0}','${T0}'),
          (2,'Other tenant','periodic','2025','2026-11-01',NULL,100,1,'FIXTURE2','${T0}','${T0}');`;
function fixture(flags={}){const env={...makeEnv(),...flags};env.DB.raw.exec(SEED);return env;}
const rows=(env,sql,...a)=>env.DB.raw.prepare(sql).all(...a);
const task=(env,kind)=>rows(env,`SELECT * FROM notifications WHERE task_key LIKE 'queue:${kind}:%' ORDER BY id`);
const events=env=>rows(env,'SELECT COUNT(*) AS n FROM events')[0].n;

test('an emergency repair whose tenancy is on another property still alerts once, without that tenancy',async()=>{
  const env=fixture();
  env.DB.raw.exec(`INSERT INTO repairs(rental_id,tenancy_id,title,urgency,created_at,updated_at) VALUES(1,2,'Leak','emergency','${T0}','${T0}')`);
  await notificationsPass(env,AT);const [t]=task(env,'repair');
  assert.equal(t?.title,'Emergency repair');assert.equal(t.urgency,'urgent');assert.equal(t.target_id,'1');
  assert.deepEqual(JSON.parse(t.target_context),{repair_id:1});
  const before=events(env);await notificationsPass(env,'2026-11-09T12:10:00.000Z');
  assert.equal(events(env),before);assert.equal(task(env,'repair').length,1);
});

test('a consistent repair keeps its tenancy in the context, as before',async()=>{
  const env=fixture();
  env.DB.raw.exec(`INSERT INTO repairs(rental_id,tenancy_id,title,urgency,created_at,updated_at) VALUES(1,1,'Leak','emergency','${T0}','${T0}')`);
  await notificationsPass(env,AT);assert.deepEqual(JSON.parse(task(env,'repair')[0].target_context),{tenancy_id:1,repair_id:1});
});

test('ADM-13 on: an inspection due within 30 days opens one Compliance task, closed when the inspection is recorded',async()=>{
  const env=fixture(ON);await notificationsPass(env,AT);const [t,...more]=task(env,'inspection');
  assert.equal(more.length,0);assert.equal(t.title,'Inspection due');assert.equal(t.category,'compliance');
  assert.equal(t.due_at,'2026-11-20T00:00:00.000Z');assert.equal(t.target_kind,'rental');assert.equal(t.target_id,'1');
  assert.deepEqual(JSON.parse(t.target_context),{tenancy_id:1});assert.equal(t.resolved_at,null);
  const before=events(env);await notificationsPass(env,'2026-11-09T12:10:00.000Z');assert.equal(events(env),before);
  env.DB.raw.exec(`INSERT INTO rental_inspections(tenancy_id,seq,operation_id,revision,inspected_on,rooms,evidence_refs,recorded_at,recorded_by,updated_at,updated_by)
    VALUES(1,1,'fixture-op-1',1,'2026-11-09','[{"name":"Kitchen","condition":"ok","observations":"","repair":null}]','[]','${AT}','a@example.test','${AT}','a@example.test')`);
  await notificationsPass(env,'2026-11-09T12:20:00.000Z');
  const [closed,...next]=task(env,'inspection');assert.equal(next.length,0);assert.ok(closed.resolved_at);assert.equal(closed.closed_by_source,1);
});

test('no inspection task before the 30-day window, after move-out, on an archived property or with ADM-13 off',async()=>{
  const off=fixture();await notificationsPass(off,AT);assert.equal(task(off,'inspection').length,0);
  const early=fixture(ON);early.DB.raw.exec("UPDATE tenancies SET start_on='2026-06-20' WHERE id=1");
  await notificationsPass(early,AT);assert.equal(task(early,'inspection').length,0);
  const ended=fixture(ON);ended.DB.raw.exec("UPDATE tenancies SET ended_on='2026-11-15' WHERE id=1");
  await notificationsPass(ended,AT);assert.equal(task(ended,'inspection').length,0);
  const archived=fixture(ON);archived.DB.raw.exec(`UPDATE rentals SET archived_at='${T0}' WHERE id=1`);
  await notificationsPass(archived,AT);assert.equal(task(archived,'inspection').length,0);
});

test('the website and the clock share ADM-13\'s switch, so the Inbox task follows Rentals',()=>{
  const flag=file=>readFileSync(new URL(`../../${file}`,import.meta.url),'utf8').match(/^ADM13_INSPECTIONS_READY = "([01])"$/m)?.[1]??'0';
  assert.equal(flag('wrangler.toml'),flag('jobs/wrangler.toml'));
});

test('actual D1 runtime runs the pass with inspections and repairs within its compound SELECT limit',async()=>{
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'adm03-runtime-fixture'}}));
  try{
    const DB=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())
      await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>DB.prepare(sql)));
    await DB.batch(unstable_splitSqlQuery(`${SEED}
      INSERT INTO repairs(rental_id,tenancy_id,title,urgency,created_at,updated_at) VALUES(1,2,'Leak','emergency','${T0}','${T0}');`).map(sql=>DB.prepare(sql)));
    const env={DB,...ON,ADM10_STATEMENTS_READY:'1',ADM11_CALENDAR_READY:'1',ADM09_ARREARS_READY:'1'};
    await notificationsPass(env,AT);
    const kinds=(await DB.prepare("SELECT task_key FROM notifications WHERE task_key LIKE 'queue:%' ORDER BY task_key").all()).results.map(r=>r.task_key.split(':')[1]);
    assert.ok(kinds.includes('inspection'));assert.ok(kinds.includes('repair'));
  }finally{await mf.dispose();}
});
