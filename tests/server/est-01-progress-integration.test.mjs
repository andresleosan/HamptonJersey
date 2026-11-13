import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEnv,seedListing,T0,adminCookie,call} from './helpers.mjs';
import {recomputeForApplicant,recomputeForApplicantWithStatus,recomputeForListing,afterSave} from '../../server/match-store.js';
import {projectSearchProgress} from '../../server/search-progress.js';

const proposal=new URL('../../docs/roadmap/work/EST-01/search-progress.proposed.sql',import.meta.url);
const get=(env,sql,...args)=>env.DB.raw.prepare(sql).get(...args);
const run=(env,sql,...args)=>env.DB.raw.prepare(sql).run(...args);
const progress=env=>get(env,'SELECT * FROM applicant_search_progress WHERE applicant_id=1');
const applicant=env=>get(env,'SELECT * FROM applicants WHERE id=1');
function setup({gate=true,schema=true}={}) {
  const env=makeEnv();
  run(env,"INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Synthetic','check@example.test',?,?,?)",T0,T0,T0);
  run(env,"INSERT INTO applicants(id,contact_id,operation,stage,source,budget_max,created_at,updated_at) VALUES(1,1,'buy','searching','phone',1000000,?,?)",T0,T0);
  if(schema)env.DB.raw.exec(readFileSync(proposal,'utf8'));
  if(gate)env.EST01_PROGRESS_READY='1';
  return env;
}
const add=(env,id,extra={})=>seedListing(env,{id,matchable:1,sale_price:900000,...extra});
function beforeWrites(env,change){
  const batch=env.DB.batch.bind(env.DB);let called=false;
  env.DB.batch=async statements=>{
    if(!called&&statements.some(s=>s.sql.includes('UPDATE applicants SET match_ranking_version=1'))){called=true;await change();}
    return batch(statements);
  };
  return ()=>called;
}

test('gate off keeps existing matching without reading the proposed schema',async()=>{
  const env=setup({gate:false,schema:false});add(env,'EST-OFF');
  const prepare=env.DB.prepare.bind(env.DB);let touched=false;
  env.DB.prepare=sql=>{if(sql.includes('applicant_search_progress'))touched=true;return prepare(sql);};
  assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),{created:1,completed:true});
  assert.equal(touched,false);
});

test('a recorded local check of zero candidates is complete while external coverage remains pending',async()=>{
  const env=setup(),before=applicant(env),batch=env.DB.batch.bind(env.DB);let runningBeforeRead=false;
  env.DB.batch=async statements=>{
    if(statements.some(s=>s.sql.includes('FROM listings WHERE (')))runningBeforeRead=progress(env)?.attempt_state==='running';
    return batch(statements);
  };
  assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),{created:0,completed:true});
  assert.equal(runningBeforeRead,true);assert.equal(progress(env).attempt_state,'succeeded');
  assert.equal(progress(env).last_success_checked_count,0);assert.equal(applicant(env).updated_at,before.updated_at);
  assert.equal(get(env,'SELECT last_activity_at FROM contacts WHERE id=1').last_activity_at,T0);
  const projection=projectSearchProgress(applicant(env),progress(env),new Date().toISOString());
  assert.equal(projection.state,'succeeded');assert.equal(projection.coverage_pending,true);
});

test('an evaluation counts eligible candidates, not retained shortlisted entries or new matches',async()=>{
  const env=setup();add(env,'EST-OLD');await recomputeForApplicantWithStatus(env,1,'system');
  run(env,"UPDATE matches SET status='shortlisted' WHERE listing_id='EST-OLD'");
  run(env,"UPDATE listings SET matchable=0 WHERE id='EST-OLD'");add(env,'EST-NEW');
  assert.equal((await recomputeForApplicantWithStatus(env,1,'system')).completed,true);
  assert.equal(progress(env).last_success_checked_count,1);
  const lastSuccess=progress(env).last_success_at;
  assert.equal((await recomputeForApplicantWithStatus(env,1,'system')).created,0);
  assert.equal(progress(env).last_success_checked_count,1);assert.ok(progress(env).last_success_at>=lastSuccess);
});

test('a rollback marks the latest attempt failed and retains the last successful check',async()=>{
  const env=setup();add(env,'EST-FIRST');assert.equal((await recomputeForApplicantWithStatus(env,1,'system')).completed,true);
  const before={...progress(env)};add(env,'EST-SECOND');
  env.DB.raw.exec("CREATE TRIGGER fixture_match_failure BEFORE INSERT ON matches BEGIN SELECT RAISE(ABORT,'synthetic match failure'); END");
  await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'));
  assert.equal(progress(env).attempt_state,'failed');assert.equal(progress(env).error_code,'check_failed');
  assert.equal(progress(env).last_success_at,before.last_success_at);assert.equal(progress(env).last_success_seq,before.last_success_seq);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM matches WHERE listing_id='EST-SECOND'").n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,1);
});

test('a newer full check fences an earlier check even if it finishes first',async()=>{
  const env=setup();add(env,'EST-RACE');const batch=env.DB.batch.bind(env.DB);
  let release,entered;const paused=new Promise(resolve=>{entered=resolve;}),resume=new Promise(resolve=>{release=resolve;});let blocked=false;
  env.DB.batch=async statements=>{
    if(!blocked&&statements.some(s=>s.sql.includes('UPDATE applicants SET match_ranking_version=1'))){blocked=true;entered();await resume;}
    return batch(statements);
  };
  const earlier=recomputeForApplicantWithStatus(env,1,'system');await paused;
  const later=await recomputeForApplicantWithStatus(env,1,'system');release();const late=await earlier;
  assert.equal(later.completed,true);assert.equal(late.completed,false);
  assert.equal(progress(env).attempt_seq,2);assert.equal(progress(env).attempt_state,'succeeded');
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,1);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,1);
});

test('criteria or lifecycle changes before the write leave no match and cannot record success',async()=>{
  for(const change of ["UPDATE applicants SET budget_max=800000 WHERE id=1",
    "UPDATE applicants SET search_state='needs_review' WHERE id=1"]){
    const env=setup();add(env,'EST-STALE');const injected=beforeWrites(env,()=>env.DB.raw.exec(change));
    assert.equal((await recomputeForApplicantWithStatus(env,1,'system')).completed,false);assert.equal(injected(),true);
    assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
    assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,0);
    assert.notEqual(progress(env).attempt_state,'succeeded');
  }
});

test('closing and reopening with the same updated_at still invalidates the old check',async()=>{
  const env=setup();add(env,'EST-LIFECYCLE');const before=applicant(env);
  const injected=beforeWrites(env,()=>env.DB.raw.exec("UPDATE applicants SET search_state='needs_review' WHERE id=1; UPDATE applicants SET search_state='active' WHERE id=1"));
  const result=await recomputeForApplicantWithStatus(env,1,'system');assert.equal(injected(),true);
  assert.equal(applicant(env).updated_at,before.updated_at);assert.ok(applicant(env).match_inputs_revision>before.match_inputs_revision);
  assert.equal(result.completed,false);assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  assert.equal(progress(env).attempt_state,'running');
  assert.equal(projectSearchProgress(applicant(env),progress(env),new Date().toISOString()).state,'needs_recheck');
});

test('losing the write response after commit does not replace success with a false failure',async()=>{
  const env=setup();add(env,'EST-UNKNOWN');const batch=env.DB.batch.bind(env.DB);let lost=false;
  env.DB.batch=async statements=>{
    const result=await batch(statements);
    if(!lost&&statements.some(s=>s.sql.includes('UPDATE applicants SET match_ranking_version=1'))){lost=true;throw Object.assign(new Error('synthetic transport loss'),{code:'ECONNRESET'});}
    return result;
  };
  await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'),error=>error.status===503);
  assert.equal(lost,true);assert.equal(progress(env).attempt_state,'succeeded');
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,1);
});

test('a lost begin response never starts untracked matching or invents a failure',async()=>{
  const env=setup();add(env,'EST-BEGIN-LOSS');const prepare=env.DB.prepare.bind(env.DB);let injected=false;
  env.DB.prepare=sql=>{
    const statement=prepare(sql);
    if(!sql.startsWith('INSERT INTO applicant_search_progress'))return statement;
    return {...statement,bind:(...args)=>{
      const bound=statement.bind(...args);
      return {...bound,first:async()=>{const result=await bound.first();if(!injected){injected=true;throw Object.assign(new Error('synthetic response loss'),{code:'ECONNRESET'});}return result;}};
    }};
  };
  await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'),error=>error.status===503);
  assert.equal(injected,true);assert.equal(progress(env).attempt_state,'running');assert.equal(progress(env).last_success_at,null);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
});

test('non-applicable searches do not begin full checks',async()=>{
  for(const change of ["UPDATE applicants SET search_state='needs_review' WHERE id=1",
    "UPDATE applicants SET search_category='commercial' WHERE id=1",
    "UPDATE applicants SET archived_at='2026-11-01T00:00:00.000Z' WHERE id=1"]){
    const env=setup();env.DB.raw.exec(change);
    const outcome=await recomputeForApplicantWithStatus(env,1,'system');
    assert.equal(outcome.reason,'not_applicable');assert.equal(progress(env),undefined);
  }
});

test('incremental listing recomputation never changes a full-check record',async()=>{
  const env=setup();add(env,'EST-INCREMENTAL');await recomputeForApplicantWithStatus(env,1,'system');
  const prior={...progress(env)};await recomputeForListing(env,'EST-INCREMENTAL','system');
  assert.deepEqual({...progress(env)},prior);
});

test('an ignored ranking update rolls back matching and cannot report a successful check',async()=>{
  const env=setup();add(env,'EST-IGNORE');
  env.DB.raw.exec("CREATE TRIGGER fixture_ignore_ranking BEFORE UPDATE OF match_ranking_version ON applicants BEGIN SELECT RAISE(IGNORE); END");
  await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'));
  assert.equal(progress(env).attempt_state,'failed');assert.equal(progress(env).last_success_at,null);
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,0);
});

test('silently ignored inserts or removals cannot produce a successful full check',async()=>{
  for(const operation of ['insert','delete']){
    const env=setup();add(env,'EST-IGNORE-PAIR');
    if(operation==='delete'){
      assert.equal((await recomputeForApplicantWithStatus(env,1,'system')).completed,true);
      run(env,"UPDATE listings SET matchable=0 WHERE id='EST-IGNORE-PAIR'");
    }
    env.DB.raw.exec(`CREATE TRIGGER fixture_ignore_pair BEFORE ${operation.toUpperCase()} ON matches BEGIN SELECT RAISE(IGNORE); END`);
    await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'));
    assert.equal(progress(env).attempt_state,'failed');
    assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,operation==='insert'?0:1);
    assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,operation==='insert'?0:1);
  }
});

test('a silently ignored matched event or required notice rolls back the entire check',async()=>{
  for(const table of ['events','notifications']){
    const env=setup();add(env,'EST-IGNORE-NOTICE');
    const condition=table==='events'?"NEW.type='applicant.matched'":"NEW.category='matched'";
    env.DB.raw.exec(`CREATE TRIGGER fixture_ignore_notice BEFORE INSERT ON ${table} WHEN ${condition} BEGIN SELECT RAISE(IGNORE); END`);
    await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'));
    assert.equal(progress(env).attempt_state,'failed');assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
    assert.equal(get(env,"SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").n,0);
    assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE category='matched'").n,0);
  }
});

test('reopening still restores an existing found notice with the gated completion barrier',async()=>{
  const env=setup();add(env,'EST-RESTORE');await recomputeForApplicantWithStatus(env,1,'system');
  run(env,"UPDATE notifications SET resolved_at=?,resolved_by='system' WHERE category='matched'",T0);
  run(env,"INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES(?,'system','applicant','1','applicant.search_reopened')",T0);
  assert.equal((await recomputeForApplicantWithStatus(env,1,'system',true)).completed,true);
  assert.equal(get(env,"SELECT COUNT(*) AS n FROM notifications WHERE category='matched' AND resolved_at IS NULL").n,1);
});

test('missing progress schema prevents untracked matching and afterSave logs no raw error',async()=>{
  const env=setup({schema:false});add(env,'EST-NOSCHEMA');
  await assert.rejects(()=>recomputeForApplicantWithStatus(env,1,'system'));
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  const original=console.error,logs=[];console.error=(...args)=>logs.push(args);
  try{await afterSave(recomputeForApplicant,env,1,'system');}finally{console.error=original;}
  assert.equal(get(env,'SELECT COUNT(*) AS n FROM matches').n,0);
  assert.equal(logs.length,1);assert.equal(logs[0].length,1);
});

test('a failing check does not leak exception text to the API or logs',async()=>{
  const env=setup();add(env,'EST-PRIVATE');
  env.DB.raw.exec("CREATE TRIGGER fixture_private_failure BEFORE INSERT ON matches BEGIN SELECT RAISE(ABORT,'SYNTHETIC_PRIVATE_MARKER'); END");
  const original=console.error,logs=[];console.error=(...args)=>logs.push(args.map(String).join(' '));
  let response;
  try{response=await call(env,'POST','/admin/applicants/1/matches/recalculate',{cookie:await adminCookie()});}finally{console.error=original;}
  assert.equal(response.status,500);assert.doesNotMatch(JSON.stringify(response.data),/SYNTHETIC_PRIVATE_MARKER/);
  assert.doesNotMatch(logs.join(' '),/SYNTHETIC_PRIVATE_MARKER/);
  assert.equal(progress(env).attempt_state,'failed');
});

test('failure loading the initial check input does not leak private error text',async()=>{
  const env=setup(),prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=sql=>{if(sql.includes('a.match_inputs_revision, a.matches_revision, a.requirement_priorities'))throw new Error('SYNTHETIC_PRIVATE_INPUT');return prepare(sql);};
  const original=console.error,logs=[];console.error=(...args)=>logs.push(args.map(String).join(' '));let response;
  try{response=await call(env,'POST','/admin/applicants/1/matches/recalculate',{cookie:await adminCookie()});}finally{console.error=original;}
  assert.ok(response.status>=500);assert.doesNotMatch(JSON.stringify(response.data),/SYNTHETIC_PRIVATE_INPUT/);
  assert.doesNotMatch(logs.join(' '),/SYNTHETIC_PRIVATE_INPUT/);assert.equal(progress(env),undefined);
});

test('public new and duplicate registration keep identical responses with progress enabled or its schema unavailable',async()=>{
  const originalFetch=globalThis.fetch,originalLog=console.error;
  globalThis.fetch=async()=>new Response(JSON.stringify({success:true,hostname:'hampton.test'}));console.error=()=>{};
  try {
    for(const schema of [true,false]){
      const env=setup({schema}),body={operation:'rent',name:'Synthetic',email:'new-progress@example.test',phone:'+447797123456',
        budget_max:2500,bedrooms_min:2,privacy:true,marketing:false,turnstile:'fixture'};
      const first=await call(env,'POST','/applicants',{body}),duplicate=await call(env,'POST','/applicants',{body});
      assert.equal(first.status,201);assert.equal(duplicate.status,201);assert.deepEqual(first.data,duplicate.data);
      if(schema){const stored=get(env,'SELECT attempt_seq FROM applicant_search_progress WHERE applicant_id=2');assert.equal(stored.attempt_seq,1);}
      assert.equal(get(env,"SELECT COUNT(*) AS n FROM applicants WHERE id=2").n,1);
    }
  } finally {globalThis.fetch=originalFetch;console.error=originalLog;}
});
