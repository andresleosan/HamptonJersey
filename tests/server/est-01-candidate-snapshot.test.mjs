import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,seedListing,T0,call,adminCookie} from './helpers.mjs';
import {recomputeForApplicantWithStatus,recomputeForApplicant,MATCH_SNAPSHOT_MAX_BYTES} from '../../server/match-store.js';

const sql=(env,statement,...args)=>env.DB.raw.prepare(statement).run(...args);
const get=(env,statement,...args)=>env.DB.raw.prepare(statement).get(...args);
const addListing=(env,id,other={})=>seedListing(env,{id,matchable:1,sale_price:900000,...other});
function setup() {
  const env=makeEnv();
  sql(env,"INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Fixture','est01@example.test',?,?,?)",T0,T0,T0);
  sql(env,"INSERT INTO applicants(contact_id,operation,stage,source,budget_max,created_at,updated_at) VALUES(1,'buy','searching','phone',1000000,?,?)",T0,T0);
  return env;
}
function justBeforeWrites(env,mutation) {
  const batch=env.DB.batch.bind(env.DB); let injected=false;
  env.DB.batch=async statements=>{
    if(!injected && statements.some(s=>s.sql.includes('UPDATE applicants SET match_ranking_version=1'))) {
      injected=true; mutation();
    }
    return batch(statements);
  };
  return ()=>injected;
}

test('a newly inserted candidate after an empty snapshot prevents completed',async()=>{
  const env=setup(),injected=justBeforeWrites(env,()=>addListing(env,'EST-NEW'));
  const result=await recomputeForApplicantWithStatus(env,1,'system');
  assert.equal(injected(),true); assert.equal(result.completed,false);
  assert.equal(get(env,'SELECT match_ranking_version FROM applicants WHERE id=1').match_ranking_version,0);
});

test('the recalculation route reports a retry instead of success if a candidate appears',async()=>{
  const env=setup(),injected=justBeforeWrites(env,()=>addListing(env,'EST-NEW-ROUTE'));
  const response=await call(env,'POST','/admin/applicants/1/matches/recalculate',
    {body:{},cookie:await adminCookie('admin@example.test')});
  assert.equal(injected(),true); assert.equal(response.status,409);
  assert.match(response.data.error,/changed|again/i);
});

test('candidate-set drift leaves no partial matches, matched event or notice',async()=>{
  const env=setup(); addListing(env,'EST-ORIGINAL');
  const injected=justBeforeWrites(env,()=>addListing(env,'EST-LATE'));
  const result=await recomputeForApplicantWithStatus(env,1,'system');
  assert.equal(injected(),true); assert.deepEqual(result,{created:0,completed:false});
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE category='matched'").n,0);
});

test('an unrelated database failure is not reported as a guarded conflict or success',async()=>{
  const env=setup(); const batch=env.DB.batch.bind(env.DB);
  env.DB.batch=async statements=>{
    if(statements.some(s=>s.sql.includes('UPDATE applicants SET match_ranking_version=1'))) throw Error('fixture batch failure');
    return batch(statements);
  };
  await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'),/fixture batch failure/);
});

test('a failure after a matched event and match insert rolls the entire batch back',async()=>{
  const env=setup(); addListing(env,'EST-ROLLBACK');
  const batch=env.DB.batch.bind(env.DB); let injected=false;
  env.DB.batch=async statements=>{
    const insert=statements.findIndex(s=>s.sql.includes('INSERT INTO matches'));
    if(!injected && insert>=0) {
      injected=true;
      return batch([...statements.slice(0,insert+1),env.DB.prepare('INSERT INTO contacts(name) VALUES(NULL)'),...statements.slice(insert+1)]);
    }
    return batch(statements);
  };
  await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'),/NOT NULL/i);
  assert.equal(injected,true);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE category='matched'").n,0);
  assert.equal(get(env,'SELECT match_ranking_version FROM applicants WHERE id=1').match_ranking_version,0);
});

test('a later constraint failure with unchanged inputs is not mistaken for a snapshot conflict',async()=>{
  const env=setup(); addListing(env,'EST-CONSTRAINT');
  const batch=env.DB.batch.bind(env.DB); let injected=false;
  env.DB.batch=async statements=>{
    const insert=statements.findIndex(s=>s.sql.includes('INSERT INTO matches'));
    if(!injected && insert>=0) {
      injected=true;
      return batch([...statements.slice(0,insert+1),env.DB.prepare('UPDATE applicants SET updated_at=NULL WHERE id=1'),...statements.slice(insert+1)]);
    }
    return batch(statements);
  };
  await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'),/NOT NULL/i);
  assert.equal(injected,true);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE category='matched'").n,0);
});

test('an existing non-candidate becoming eligible after the snapshot prevents completed',async()=>{
  const env=setup(); addListing(env,'EST-ELIGIBLE',{matchable:0});
  const injected=justBeforeWrites(env,()=>sql(env,"UPDATE listings SET matchable=1 WHERE id='EST-ELIGIBLE'"));
  const result=await recomputeForApplicantWithStatus(env,1,'system');
  assert.equal(injected(),true); assert.equal(result.completed,false);
  assert.equal(get(env,'SELECT match_ranking_version FROM applicants WHERE id=1').match_ranking_version,0);
});

test('a candidate removed or made ineligible after evaluation prevents completed',async()=>{
  for(const mutation of [
    env=>sql(env,"DELETE FROM listings WHERE id='EST-CANDIDATE'"),
    env=>sql(env,"UPDATE listings SET matchable=0 WHERE id='EST-CANDIDATE'"),
  ]) {
    const env=setup(); addListing(env,'EST-CANDIDATE');
    const injected=justBeforeWrites(env,()=>mutation(env));
    const result=await recomputeForApplicantWithStatus(env,1,'system');
    assert.equal(injected(),true); assert.equal(result.completed,false);
    assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  }
});

test('a new ineligible or other-operation listing does not change the evaluated candidate set',async()=>{
  for(const fields of [{matchable:0},{operation:'rent',availability:'to_let',sale_price:null,rent:1500,rent_period:'month'}]) {
    const env=setup(),injected=justBeforeWrites(env,()=>addListing(env,'EST-OTHER',fields));
    const result=await recomputeForApplicantWithStatus(env,1,'system');
    assert.equal(injected(),true); assert.deepEqual(result,{created:0,completed:true});
  }
});

test('trigger-inclusive batch metadata does not inflate inserted counts or turn a successful update into a conflict',async()=>{
  const env=setup(); addListing(env,'EST-META');
  const batch=env.DB.batch.bind(env.DB);
  env.DB.batch=async statements=>{
    const results=await batch(statements);
    for(let i=0;i<statements.length;i++)
      if((statements[i].sql.includes('UPDATE applicants SET match_ranking_version=1') || statements[i].sql.includes('INSERT INTO matches')) && results[i]?.meta?.changes)
        results[i].meta.changes=2; // D1 may count the trigger's update as well as the direct update.
    return results;
  };
  assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),{created:1,completed:true});
});

test('an unreadable inserted-count result is not silently reported as zero',async()=>{
  const env=setup(); addListing(env,'EST-NO-COUNT');
  const batch=env.DB.batch.bind(env.DB);
  env.DB.batch=async statements=>{
    const results=await batch(statements);
    const index=statements.findIndex(s=>s.sql.includes('END AS created'));
    if(index>=0)results[index].results=[];
    return results;
  };
  await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'),/count unavailable/i);
  // The injected response failure happens after commit; do not claim it rolled anything back.
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches WHERE applicant_id=1').n,1);
});

test('repeating a valid run counts zero inserts and still reports a completed local evaluation',async()=>{
  const env=setup(); addListing(env,'EST-NO-OP');
  assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),{created:1,completed:true});
  assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),{created:0,completed:true});
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,1);
});

test('a revision change with the same timestamp cannot restore an obsolete reopened notice',async()=>{
  const env=setup(); addListing(env,'EST-FOUND');
  assert.equal((await recomputeForApplicantWithStatus(env,1,'system')).completed,true);
  sql(env,"UPDATE notifications SET resolved_at=?,resolved_by='system' WHERE category='matched'",T0);
  sql(env,"INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES(?,'system','applicant','1','applicant.search_reopened')",T0);
  const injected=justBeforeWrites(env,()=>sql(env,'UPDATE applicants SET budget_max=500000 WHERE id=1'));
  const result=await recomputeForApplicantWithStatus(env,1,'system',true);
  assert.equal(injected(),true); assert.equal(result.completed,false);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE category='matched' AND resolved_at IS NULL").n,0);
});

test('an obsolete search revision creates neither matches nor a matched notice',async()=>{
  const env=setup(); addListing(env,'EST-OLD-INPUT');
  const injected=justBeforeWrites(env,()=>sql(env,'UPDATE applicants SET budget_max=500000 WHERE id=1'));
  const result=await recomputeForApplicantWithStatus(env,1,'system');
  assert.equal(injected(),true); assert.equal(result.completed,false);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE category='matched'").n,0);
});

test('an oversized snapshot stops before writes and the manual route reports a distinct safe limit',async()=>{
  const env=setup(); addListing(env,'X'.repeat(MATCH_SNAPSHOT_MAX_BYTES));
  const before=get(env,'SELECT updated_at,match_ranking_version FROM applicants WHERE id=1');
  assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),
    {created:0,completed:false,reason:'snapshot_too_large'});
  const response=await call(env,'POST','/admin/applicants/1/matches/recalculate',
    {body:{},cookie:await adminCookie('admin@example.test')});
  assert.equal(response.status,409); assert.match(response.data.error,/safe processing limit/i);
  assert.doesNotMatch(response.data.error,/X{20}|\d{4}/);
  await assert.rejects(()=>recomputeForApplicant(env,1,'system'),error=>error.status===409&&/safe processing limit/i.test(error.message));
  assert.deepEqual({...get(env,'SELECT updated_at,match_ranking_version FROM applicants WHERE id=1')},{...before});
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE category='matched'").n,0);
});

test('an invalid input revision remains unverified and does not save a matching result',async()=>{
  const env=setup(); addListing(env,'EST-INVALID');
  sql(env,"INSERT INTO listing_match_inputs(listing_id,version) VALUES('EST-INVALID',0.5)");
  assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),
    {created:0,completed:false,reason:'snapshot_invalid'});
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  const response=await call(env,'POST','/admin/applicants/1/matches/recalculate',
    {body:{},cookie:await adminCookie('admin@example.test')});
  assert.equal(response.status,409); assert.match(response.data.error,/could not be verified/i);
});
