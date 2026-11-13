// Disposable local D1 only; no real applicants or remote services.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {recomputeForApplicantWithStatus} from '../../server/match-store.js';
import {beginFullCheck,getSearchProgress,projectSearchProgress} from '../../server/search-progress.js';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const migrations=new URL('../../migrations/',import.meta.url);
const proposal=new URL('../../docs/roadmap/work/EST-01/search-progress.proposed.sql',import.meta.url);
const time='2026-10-07T10:00:00.000Z';
const get=(DB,sql,...args)=>DB.prepare(sql).bind(...args).first();
async function seedApplicant(DB,id){
  await DB.prepare("INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(?,'Synthetic',?,?,?,?)")
    .bind(id,`progress-${id}@example.test`,time,time,time).run();
  await DB.prepare("INSERT INTO applicants(id,contact_id,operation,stage,source,budget_max,created_at,updated_at) VALUES(?,?,'buy','searching','phone',1000000,?,?)")
    .bind(id,id,time,time).run();
}
async function seedListing(DB,id){
  await DB.prepare("INSERT INTO listings(id,use,title,operation,availability,matchable,sale_price,country,currency,created_at,updated_at) VALUES(?,'residential','Synthetic','sale','for_sale',1,900000,'Jersey','GBP',?,?)")
    .bind(id,time,time).run();
}
function instrument(DB){
  let before=null,lose=false,lastWriteStatements=0;
  const wrap=(raw,sql)=>({sql,raw,bind:(...args)=>wrap(raw.bind(...args),sql),first:(...args)=>raw.first(...args),
    all:(...args)=>raw.all(...args),run:(...args)=>raw.run(...args)});
  const db={prepare:sql=>wrap(DB.prepare(sql),sql),async batch(statements){
    const write=statements.some(s=>s.sql.includes('UPDATE applicants SET match_ranking_version=1'));
    if(write)lastWriteStatements=statements.length;
    if(write&&before){const action=before;before=null;await action();}
    const result=await DB.batch(statements.map(s=>s.raw));
    if(write&&lose){lose=false;throw Object.assign(new Error('synthetic response loss'),{code:'ECONNRESET'});}
    return result;
  }};
  return {db,before:fn=>{before=fn;},lose:()=>{lose=true;},statementCount:()=>lastWriteStatements};
}

test('D1 local: fenced progress, overlap, drift, rollback and uncertain transport',async()=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,host:'127.0.0.1',port:0,
    compatibilityDate:'2025-10-01',script:"export default {fetch(){return new Response('fixture')}}",d1Databases:{DB:'est01-progress-synthetic'}}));
  try {
    const DB=await mf.getD1Database('DB');
    for(const name of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort()){
      const statements=unstable_splitSqlQuery(readFileSync(new URL(name,migrations),'utf8'));
      if(statements.length)await DB.batch(statements.map(sql=>DB.prepare(sql)));
    }
    await DB.batch(unstable_splitSqlQuery(readFileSync(proposal,'utf8')).map(sql=>DB.prepare(sql)));
    for(let id=1;id<=11;id++)await seedApplicant(DB,id);
    const scoped=instrument(DB),env={DB:scoped.db,EST01_PROGRESS_READY:'1'};
    assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),{created:0,completed:true});
    let row=await get(DB,'SELECT * FROM applicant_search_progress WHERE applicant_id=1');
    assert.equal(row.attempt_state,'succeeded');assert.equal(row.last_success_checked_count,0);
    const a=await get(DB,'SELECT * FROM applicants WHERE id=1');
    assert.equal(projectSearchProgress(a,row,new Date().toISOString()).coverage_pending,true);
    const projection=await getSearchProgress({DB,EST01_PROGRESS_READY:'1'},1);
    assert.equal(projection.state,'succeeded');assert.equal(projection.last_success_checked_count,0);
    assert.equal(Object.hasOwn(projection,'attempt_token'),false);

    await seedListing(DB,'EST-D1-A');let later;
    scoped.before(async()=>{later=await recomputeForApplicantWithStatus(env,2,'system');});
    const earlier=await recomputeForApplicantWithStatus(env,2,'system');
    assert.equal(later.completed,true);assert.equal(earlier.completed,false);
    row=await get(DB,'SELECT * FROM applicant_search_progress WHERE applicant_id=2');
    assert.equal(row.attempt_seq,2);assert.equal(row.attempt_state,'succeeded');
    assert.equal((await get(DB,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=2')).n,1);
    assert.equal((await get(DB,"SELECT COUNT(*) AS n FROM events WHERE entity_type='applicant' AND entity_id='2' AND type='applicant.matched'")).n,1);

    scoped.before(()=>seedListing(DB,'EST-D1-LATE'));
    assert.equal((await recomputeForApplicantWithStatus(env,3,'system')).completed,false);
    row=await get(DB,'SELECT * FROM applicant_search_progress WHERE applicant_id=3');assert.equal(row.attempt_state,'failed');
    assert.equal((await get(DB,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=3')).n,0);

    scoped.lose();await assert.rejects(()=>recomputeForApplicantWithStatus(env,4,'system'),error=>error.status===503);
    row=await get(DB,'SELECT * FROM applicant_search_progress WHERE applicant_id=4');assert.equal(row.attempt_state,'succeeded');
    assert.ok((await get(DB,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=4')).n>0);

    await DB.prepare("CREATE TRIGGER fixture_fail_match BEFORE INSERT ON matches WHEN NEW.applicant_id=5 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
    await assert.rejects(()=>recomputeForApplicantWithStatus(env,5,'system'));
    assert.equal((await get(DB,'SELECT * FROM applicant_search_progress WHERE applicant_id=5')).attempt_state,'failed');
    assert.equal((await get(DB,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=5')).n,0);
    await DB.prepare('DROP TRIGGER fixture_fail_match').run();

    scoped.before(()=>DB.batch([DB.prepare("UPDATE applicants SET search_state='needs_review' WHERE id=6"),
      DB.prepare("UPDATE applicants SET search_state='active' WHERE id=6")]));
    assert.equal((await recomputeForApplicantWithStatus(env,6,'system')).completed,false);
    assert.equal((await get(DB,'SELECT * FROM applicant_search_progress WHERE applicant_id=6')).attempt_state,'running');
    assert.equal((await get(DB,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=6')).n,0);

    const snapshot=await get(DB,'SELECT id,updated_at,match_inputs_revision FROM applicants WHERE id=7');
    const [first,second]=await Promise.all([beginFullCheck(env,snapshot,{nowIso:time}),beginFullCheck(env,snapshot,{nowIso:time})]);
    assert.deepEqual([first.seq,second.seq].sort(),[1,2]);assert.notEqual(first.token,second.token);
    await assert.rejects(()=>DB.prepare('INSERT OR REPLACE INTO applicant_search_progress SELECT * FROM applicant_search_progress WHERE applicant_id=7').run());
    assert.equal((await get(DB,'SELECT attempt_seq FROM applicant_search_progress WHERE applicant_id=7')).attempt_seq,2);
    assert.equal((await get(DB,'SELECT last_activity_at FROM contacts WHERE id=7')).last_activity_at,time);

    for(const [id,table,condition] of [[8,'matches','NEW.applicant_id=8'],
      [9,'events',"NEW.type='applicant.matched' AND NEW.entity_id='9'"],[10,'notifications',"NEW.category='matched'"]]){
      await DB.prepare(`CREATE TRIGGER fixture_ignore BEFORE INSERT ON ${table} WHEN ${condition} BEGIN SELECT RAISE(IGNORE); END`).run();
      await assert.rejects(()=>recomputeForApplicantWithStatus(env,id,'system'));
      assert.equal((await get(DB,'SELECT * FROM applicant_search_progress WHERE applicant_id=?',id)).attempt_state,'failed');
      assert.equal((await get(DB,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=?',id)).n,0);
      assert.equal((await get(DB,"SELECT COUNT(*) AS n FROM events WHERE entity_type='applicant' AND entity_id=? AND type='applicant.matched'",String(id))).n,0);
      await DB.prepare('DROP TRIGGER fixture_ignore').run();
    }

    await DB.prepare(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<100)
      INSERT INTO listings(id,use,title,operation,availability,matchable,sale_price,country,currency,created_at,updated_at)
      SELECT printf('EST-CAP-%03d',i),'residential','Synthetic','sale','for_sale',1,900000,'Jersey','GBP',?,? FROM n`).bind(time,time).run();
    const start=performance.now(),capacity=await recomputeForApplicantWithStatus(env,11,'system');
    assert.equal(capacity.completed,true);assert.equal((await get(DB,'SELECT last_success_checked_count AS n FROM applicant_search_progress WHERE applicant_id=11')).n,102);
    console.log('EST-01 local D1 synthetic:',JSON.stringify({candidates:102,statements:scoped.statementCount(),ms:Math.round(performance.now()-start)}));
    assert.deepEqual((await DB.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally {await mf.dispose();}
});
