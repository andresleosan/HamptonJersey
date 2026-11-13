import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { reservationPolicyGuard } from '../../server/viewing-policy.js';
import { logEvent } from '../../server/events.js';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const policy={duration_minutes:30,buffer_minutes:15,parish_extra_minutes:15,max_daily:8,revision:1};
const candidate=(date,time,parish='St Helier')=>({negotiator_id:1,date,time,listing_id:'HE-R001',parish});

async function apply(DB,file) {
  const sql=readFileSync(new URL(`../../migrations/${file}`,import.meta.url),'utf8');
  const statements=unstable_splitSqlQuery(sql).map(part=>DB.prepare(part));
  if(statements.length)await DB.batch(statements);
}
function endTime(v,p) {
  const n=Number(v.time.slice(0,2))*60+Number(v.time.slice(3))+p.duration_minutes;
  return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
function guardedBatch(DB,v,p,{brokenEvent=false}={}) {
  const g=reservationPolicyGuard(v,p);
  const first=DB.prepare(`INSERT INTO viewing_requests(listing_id,listing_ref,negotiator_id,kind,date,time,end_time,name,email,status,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${g.sql}`)
    .bind(v.listing_id,v.listing_id,v.negotiator_id,'In person',v.date,v.time,endTime(v,p),'Fixture',
      'visitor@example.test','requested','2026-11-13T00:00:00.000Z',...g.binds);
  const snapshot=DB.prepare(`INSERT INTO viewing_policy_snapshots(viewing_id,parish,buffer_minutes,parish_extra_minutes,policy_revision)
    SELECT last_insert_rowid(),?,?,?,? WHERE changes()=1`).bind(v.parish,p.buffer_minutes,p.parish_extra_minutes,p.revision);
  const events=brokenEvent
    ? [DB.prepare('INSERT INTO events (at,actor,entity_type,type) VALUES (NULL,?,?,?)').bind('fixture','viewing','viewing.requested')]
    : logEvent({DB},{actor:'fixture',entity_type:'viewing',entity_id:null,type:'viewing.requested',data:null},
      {category:'viewing',title:'Synthetic viewing',action_required:true},{ifInserted:true});
  return DB.batch([first,snapshot,...events]);
}

test('D1 local serializes the eighth appointment, rejects stale guards and rolls back event failures',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
    script:"export default {fetch(){return new Response('fixture')}}",compatibilityDate:'2025-10-01',
    host:'127.0.0.1',port:0,d1Databases:{DB:'vis09-synthetic'}}));
  try {
    const DB=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    const files=readdirSync(dir).filter(x=>x.endsWith('.sql')).sort();
    for(const file of files.filter(x=>x!=='0047_viewing_policy.sql'))await apply(DB,file);
    await DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,country,parish,published,created_at,updated_at)
      VALUES('HE-R001','residential','Fixture','sale','for_sale','Jersey','St Helier',1,?,?)`)
      .bind('2026-11-13T00:00:00.000Z','2026-11-13T00:00:00.000Z').run();
    for(let i=0;i<7;i++) {
      const h=String(i+8).padStart(2,'0');
      await DB.prepare(`INSERT INTO viewing_requests(listing_id,negotiator_id,kind,date,time,end_time,name,email,status,created_at)
        VALUES('HE-R001',1,'In person','2026-11-13',?,?,? ,?,'confirmed',?)`)
        .bind(`${h}:00`,`${h}:30`,'Fixture','visitor@example.test','2026-11-13T00:00:00.000Z').run();
    }
    const before=(await DB.prepare('SELECT * FROM viewing_requests ORDER BY id').all()).results;
    await apply(DB,'0047_viewing_policy.sql');
    assert.deepEqual((await DB.prepare('SELECT * FROM viewing_requests ORDER BY id').all()).results,before);
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM viewing_policy_snapshots').first()).n,0);
    await DB.prepare(`INSERT INTO viewing_policy_settings(negotiator_id,duration_minutes,buffer_minutes,parish_extra_minutes,max_daily,revision,updated_at,updated_by)
      VALUES(1,30,15,15,8,1,'2026-11-13T00:00:00.000Z','fixture')`).run();
    const count=async table=>(await DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n;
    const baseEvents=await count('events'),baseNotices=await count('notifications');
    const results=await Promise.all([guardedBatch(DB,candidate('2026-11-13','17:00'),policy),
      guardedBatch(DB,candidate('2026-11-13','18:00'),policy)]);
    assert.deepEqual(results.map(r=>r[0].meta.changes).sort(),[0,1]);
    assert.equal(await count('viewing_requests'),8);
    assert.equal(await count('viewing_policy_snapshots'),1);
    assert.equal(await count('events'),baseEvents+1);
    assert.equal(await count('notifications'),baseNotices+1);
    const winningRace=await DB.prepare("SELECT id FROM viewing_requests WHERE date='2026-11-13' AND time IN ('17:00','18:00')").first();
    const recorded=await DB.prepare("SELECT id,entity_id FROM events WHERE actor='fixture' AND type='viewing.requested' ORDER BY id DESC LIMIT 1").first();
    assert.equal(String(recorded.entity_id),String(winningRace.id));
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE event_id=?').bind(recorded.id).first()).n,1);

    const stale=candidate('2026-11-14','12:00');
    await DB.prepare('UPDATE viewing_policy_settings SET revision=2 WHERE negotiator_id=1').run();
    assert.equal((await guardedBatch(DB,stale,policy))[0].meta.changes,0);
    const revised={...policy,revision:2};
    await DB.prepare("UPDATE listings SET parish='Trinity' WHERE id='HE-R001'").run();
    assert.equal((await guardedBatch(DB,stale,revised))[0].meta.changes,0);
    await DB.prepare('UPDATE negotiators SET active=0 WHERE id=1').run();
    assert.equal((await guardedBatch(DB,candidate('2026-11-14','12:00','Trinity'),revised))[0].meta.changes,0);
    await DB.prepare('UPDATE negotiators SET active=1 WHERE id=1').run();

    const countsBefore=await Promise.all(['viewing_requests','viewing_policy_snapshots','events','notifications'].map(count));
    await assert.rejects(()=>guardedBatch(DB,candidate('2026-11-15','12:00','Trinity'),revised,{brokenEvent:true}));
    assert.deepEqual(await Promise.all(['viewing_requests','viewing_policy_snapshots','events','notifications'].map(count)),countsBefore);
    const nextDaySeed=await DB.prepare(`INSERT INTO viewing_requests(listing_id,negotiator_id,kind,date,time,end_time,name,email,status,created_at)
      VALUES('HE-R001',1,'In person','2026-11-19','23:30','24:00',?,?,'confirmed',?)`)
      .bind('Fixture','visitor@example.test','2026-11-13T00:00:00.000Z').run();
    await DB.prepare('INSERT INTO viewing_policy_snapshots(viewing_id,parish,buffer_minutes,parish_extra_minutes,policy_revision) VALUES(?,?,?,?,?)')
      .bind(nextDaySeed.meta.last_row_id,'Trinity',15,15,2).run();
    assert.equal((await guardedBatch(DB,candidate('2026-11-20','00:00','Trinity'),revised))[0].meta.changes,0);
    assert.equal((await guardedBatch(DB,candidate('2026-11-20','00:15','Trinity'),revised))[0].meta.changes,1);
    const winning=await DB.prepare("SELECT id FROM viewing_requests WHERE date='2026-11-13' AND time IN ('17:00','18:00')").first();
    await DB.prepare('DELETE FROM viewing_requests WHERE id=?').bind(winning.id).run();
    assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM viewing_policy_snapshots WHERE viewing_id=?').bind(winning.id).first()).n,0);
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally {await mf.dispose();}
});
