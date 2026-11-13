// Real D1 API semantics via local, disposable Miniflare only; synthetic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {recomputeForApplicantWithStatus} from '../../server/match-store.js';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const migrations=new URL('../../migrations/',import.meta.url);
const timestamp='2026-01-01T12:00:00.000Z';

async function seedApplicant(DB,id) {
  await DB.prepare(`INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at)
    VALUES(?, 'Synthetic', ?, ?, ?, ?)`)
    .bind(id,`est01-${id}@example.test`,timestamp,timestamp,timestamp).run();
  await DB.prepare(`INSERT INTO applicants(id,contact_id,operation,source,budget_max,created_at,updated_at)
    VALUES(?,?,'buy','phone',1000000,?,?)`).bind(id,id,timestamp,timestamp).run();
}
async function seedListing(DB,id,matchable=1) {
  await DB.prepare(`INSERT INTO listings(id,use,title,operation,availability,matchable,sale_price,country,currency,created_at,updated_at)
    VALUES(?,'residential','Fixture','sale','for_sale',?,900000,'Jersey','GBP',?,?)`)
    .bind(id,matchable,timestamp,timestamp).run();
}
const count=(DB,sql,...args)=>DB.prepare(sql).bind(...args).first();

// Preserve the actual D1 statements while allowing a fixture mutation exactly before the write batch.
function instrument(DB) {
  let beforeWrite=null, failAfterInsert=false, loseCompletion=false, completionMeta=null, guardMeta=null;
  const wrap=(raw,sql)=>({sql,raw,bind:(...args)=>wrap(raw.bind(...args),sql),
    first:(...args)=>raw.first(...args),all:(...args)=>raw.all(...args),run:(...args)=>raw.run(...args)});
  const db={prepare:sql=>wrap(DB.prepare(sql),sql),async batch(statements){
    const isWrite=statements.some(s=>s.sql.includes('UPDATE applicants SET match_ranking_version=1'));
    if(isWrite && beforeWrite){const inject=beforeWrite;beforeWrite=null;await inject();}
    const raw=statements.map(s=>s.raw),insert=statements.findIndex(s=>s.sql.includes('INSERT INTO matches'));
    if(isWrite && failAfterInsert && insert>=0){failAfterInsert=false;raw.splice(insert+1,0,DB.prepare('INSERT INTO contacts(name) VALUES(NULL)'));}
    const results=await DB.batch(raw);
    if(isWrite){const i=statements.findIndex(s=>s.sql.includes('UPDATE applicants SET match_ranking_version=1'));
      completionMeta=results[i].meta;guardMeta=results[0].meta;}
    if(isWrite && loseCompletion) {
      loseCompletion=false;
      const i=statements.findIndex(s=>s.sql.includes('SELECT changes() AS direct_changes'));
      results[i].results=[]; // Simulate losing this result only after D1's transaction committed.
    }
    return results;
  }};
  return {db,before:fn=>{beforeWrite=fn;},failMidBatch:()=>{failAfterInsert=true;},
    loseCompletion:()=>{loseCompletion=true;},meta:()=>completionMeta,guardMeta:()=>guardMeta};
}

test('D1 local: direct changes, candidate drift, stale revision and transactional rollback',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
    script:'export default { fetch() { return new Response("fixture") } }',compatibilityDate:'2025-10-01',
    host:'127.0.0.1',port:0,d1Databases:{DB:'est01-synthetic'}}));
  try {
    const DB=await mf.getD1Database('DB');
    for(const name of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort()) {
      const sql=unstable_splitSqlQuery(readFileSync(new URL(name,migrations),'utf8'));
      if(sql.length)await DB.batch(sql.map(statement=>DB.prepare(statement)));
    }
    await seedApplicant(DB,1); await seedListing(DB,'EST-D1-01');
    const scoped=instrument(DB),env={DB:scoped.db};
    assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),{created:1,completed:true});
    assert.ok(scoped.meta().changes>=1);
    assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),{created:0,completed:true});
    assert.equal((await count(DB,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'")).n,1);

    await seedApplicant(DB,2);
    scoped.before(()=>seedListing(DB,'EST-D1-02'));
    assert.deepEqual(await recomputeForApplicantWithStatus(env,2,'system'),{created:0,completed:false});
    assert.equal((await count(DB,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=2')).n,0);
    assert.equal((await count(DB,"SELECT COUNT(*) AS n FROM events WHERE entity_type='applicant' AND entity_id='2' AND type='applicant.matched'")).n,0);

    await seedApplicant(DB,3); scoped.failMidBatch();
    await assert.rejects(()=>recomputeForApplicantWithStatus(env,3,'system'));
    assert.equal((await count(DB,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=3')).n,0);
    assert.equal((await count(DB,"SELECT COUNT(*) AS n FROM events WHERE entity_type='applicant' AND entity_id='3' AND type='applicant.matched'")).n,0);
    assert.equal((await count(DB,"SELECT COUNT(*) AS n FROM notifications n JOIN events e ON e.id=n.event_id WHERE e.entity_type='applicant' AND e.entity_id='3' AND n.category='matched'")).n,0);

    await DB.prepare("UPDATE notifications SET resolved_at=?,resolved_by='system' WHERE category='matched'").bind(timestamp).run();
    await DB.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES(?,'system','applicant','1','applicant.search_reopened')").bind(timestamp).run();
    scoped.before(()=>DB.prepare('UPDATE applicants SET budget_max=500000 WHERE id=1').run());
    assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system',true),{created:0,completed:false});
    assert.equal((await count(DB,"SELECT COUNT(*) AS n FROM notifications n JOIN events e ON e.id=n.event_id WHERE e.entity_type='applicant' AND e.entity_id='1' AND n.category='matched' AND n.resolved_at IS NULL")).n,0);

    await seedApplicant(DB,5); await seedListing(DB,'EST-D1-UNDO');
    assert.equal((await recomputeForApplicantWithStatus(env,5,'system')).completed,true);
    await DB.prepare("UPDATE matches SET status='rejected' WHERE applicant_id=5").run();
    await DB.prepare("UPDATE listings SET matchable=0 WHERE id='EST-D1-UNDO'").run();
    await DB.prepare(`UPDATE notifications SET resolved_at=?,resolved_by='system' WHERE id IN
      (SELECT n.id FROM notifications n JOIN events e ON e.id=n.event_id WHERE e.entity_type='applicant' AND e.entity_id='5' AND n.category='matched')`).bind(timestamp).run();
    await DB.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES(?,'system','applicant','5','applicant.search_reopened')").bind(timestamp).run();
    scoped.before(()=>DB.prepare("UPDATE matches SET status='found' WHERE applicant_id=5 AND listing_id='EST-D1-UNDO'").run());
    assert.deepEqual(await recomputeForApplicantWithStatus(env,5,'system',true),{created:0,completed:false});
    assert.equal((await count(DB,"SELECT status FROM matches WHERE applicant_id=5 AND listing_id='EST-D1-UNDO'")).status,'found');
    assert.equal((await count(DB,"SELECT COUNT(*) AS n FROM notifications n JOIN events e ON e.id=n.event_id WHERE e.entity_type='applicant' AND e.entity_id='5' AND n.category='matched' AND n.resolved_at IS NULL")).n,0);

    await seedApplicant(DB,6); scoped.loseCompletion();
    await assert.rejects(()=>recomputeForApplicantWithStatus(env,6,'system'),e=>e.status===503 && /unknown/i.test(e.message));
    assert.ok((await count(DB,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=6')).n>0,
      'the deliberately lost response was injected after commit');

    await seedApplicant(DB,7); await seedListing(DB,'EST-D1-NO-CURRENCY');
    await DB.prepare("UPDATE listings SET currency=NULL,sale_price=1200000 WHERE id='EST-D1-NO-CURRENCY'").run();
    await DB.prepare("UPDATE applicants SET area_answer='any',pets=?,requirement_priorities=? WHERE id=7")
      .bind('[{"kind":"none"}]',JSON.stringify({version:1,values:{budget:'must'},unknown:[]})).run();
    assert.equal((await recomputeForApplicantWithStatus(env,7,'system')).completed,true);
    const uncertain=await count(DB,"SELECT requirements_rank,checks FROM matches WHERE applicant_id=7 AND listing_id='EST-D1-NO-CURRENCY'");
    assert.equal(uncertain.requirements_rank,1);
    assert.equal(JSON.parse(uncertain.checks).find(check=>check.key==='budget').result,'unknown');

    await seedApplicant(DB,8);
    scoped.before(()=>DB.prepare(`UPDATE applicants SET search_state='resolved',resolved_at=?,resolved_by='system',
      resolution_reason='Fixture resolution',updated_at=? WHERE id=8`).bind(timestamp,timestamp).run());
    assert.deepEqual(await recomputeForApplicantWithStatus(env,8,'system'),{created:0,completed:false,reason:'not_applicable'});
    assert.equal((await count(DB,'SELECT search_state FROM applicants WHERE id=8')).search_state,'resolved');
    assert.equal((await count(DB,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=8')).n,0);
    assert.equal((await count(DB,"SELECT COUNT(*) AS n FROM events WHERE entity_type='applicant' AND entity_id='8' AND type='applicant.matched'")).n,0);
    assert.equal((await count(DB,"SELECT COUNT(*) AS n FROM notifications n JOIN events e ON e.id=n.event_id WHERE e.entity_type='applicant' AND e.entity_id='8' AND n.category='matched'")).n,0);

    // One bounded synthetic measurement; this is not a remote-D1 cost estimate.
    await seedApplicant(DB,4);
    await DB.prepare(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<1000)
      INSERT INTO listings(id,use,title,operation,availability,matchable,sale_price,country,currency,created_at,updated_at)
      SELECT printf('EST-LOAD-%04d',i),'residential','Fixture','sale','for_sale',1,2000000,'Jersey','GBP',?,? FROM n`)
      .bind(timestamp,timestamp).run();
    assert.deepEqual(await recomputeForApplicantWithStatus(env,4,'system'),{created:3,completed:true});
    const guard=scoped.guardMeta();
    console.log('EST-01 D1 local guard, 1003 candidates:',JSON.stringify({duration:guard.duration,rows_read:guard.rows_read??null}));
  } finally { await mf.dispose(); }
});
