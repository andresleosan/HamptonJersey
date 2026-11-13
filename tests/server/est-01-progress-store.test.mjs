import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEnv,seedListing,T0} from './helpers.mjs';
import * as progress from '../../server/search-progress.js';

const A='2026-11-10T10:00:00.000Z',B='2026-11-10T10:01:00.000Z',C='2026-11-10T10:02:00.000Z';
const proposal=new URL('../../docs/roadmap/work/EST-01/search-progress.proposed.sql',import.meta.url);
const get=(env,sql,...args)=>env.DB.raw.prepare(sql).get(...args);
const snapshot=env=>get(env,'SELECT id,updated_at,match_inputs_revision,search_state,search_category,archived_at,operation FROM applicants WHERE id=1');
function setup(){
  const env=makeEnv();env.DB.raw.exec(readFileSync(proposal,'utf8'));
  env.DB.raw.prepare("INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Synthetic','progress@example.test',?,?,?)").run(T0,T0,T0);
  env.DB.raw.prepare("INSERT INTO applicants(id,contact_id,operation,stage,source,created_at,updated_at) VALUES(1,1,'buy','searching','phone',?,?)").run(T0,T0);
  return env;
}
const begin=(env,nowIso=A)=>progress.beginFullCheck(env,snapshot(env),{nowIso});
const row=env=>get(env,'SELECT * FROM applicant_search_progress WHERE applicant_id=1');

test('a begin atomically returns its own ticket even with identical timestamps',async()=>{
  assert.equal(typeof progress.beginFullCheck,'function');
  const env=setup(),before=snapshot(env);
  const [first,second]=await Promise.all([begin(env),begin(env)]);
  assert.deepEqual([first.seq,second.seq],[1,2]);assert.notEqual(first.token,second.token);
  assert.equal(row(env).attempt_seq,2);assert.equal(row(env).attempt_token,second.token);
  assert.deepEqual(snapshot(env),before,'automatic checks do not edit the saved search');
  assert.equal(get(env,'SELECT last_activity_at FROM contacts WHERE id=1').last_activity_at,T0);
});

test('a superseded ticket cannot mark success or failure on the newer attempt',async()=>{
  assert.equal(typeof progress.fullCheckSuccessStatement,'function');assert.equal(typeof progress.finishFullCheckFailure,'function');
  const env=setup(),old=await begin(env),current=await begin(env);
  const success=await progress.fullCheckSuccessStatement(env,old,{finishedAt:B,checkedCount:0}).run();
  assert.equal(success.meta.changes,0);assert.equal(await progress.finishFullCheckFailure(env,old,{finishedAt:B}),false);
  assert.equal(row(env).attempt_state,'running');assert.equal(row(env).attempt_token,current.token);
});

test('a failed new attempt preserves the previous successful inventory count including zero',async()=>{
  assert.equal(typeof progress.beginFullCheck,'function');
  const env=setup(),first=await begin(env);
  assert.equal((await progress.fullCheckSuccessStatement(env,first,{finishedAt:B,checkedCount:0}).run()).meta.changes,1);
  const second=await begin(env,C);
  assert.equal(await progress.finishFullCheckFailure(env,second,{finishedAt:C}),true);
  assert.equal(await progress.finishFullCheckFailure(env,second,{finishedAt:C}),false);
  assert.equal(row(env).attempt_state,'failed');assert.equal(row(env).last_success_at,B);
  assert.equal(row(env).last_success_seq,1);assert.equal(row(env).last_success_checked_count,0);
  assert.equal(row(env).error_code,'check_failed');
});

test('changed inputs, closure or commercial conversion make the old ticket ineligible',async()=>{
  assert.equal(typeof progress.beginFullCheck,'function');
  for(const change of ["UPDATE applicants SET budget_max=900000 WHERE id=1",
    "UPDATE applicants SET search_state='needs_review' WHERE id=1",
    "UPDATE applicants SET search_category='commercial' WHERE id=1"]){
    const env=setup(),ticket=await begin(env);env.DB.raw.exec(change);
    assert.equal((await progress.fullCheckSuccessStatement(env,ticket,{finishedAt:B,checkedCount:1}).run()).meta.changes,0);
    assert.equal(await progress.finishFullCheckFailure(env,ticket,{finishedAt:B}),false);
    assert.equal(row(env).attempt_state,'running');
  }
});

test('deleted search ID cannot be reused to revive its old ticket',async()=>{
  const env=setup(),old=await begin(env);
  env.DB.raw.exec("DELETE FROM applicants WHERE id=1");assert.equal(row(env),undefined);
  assert.throws(()=>env.DB.raw.prepare("INSERT INTO applicants(id,contact_id,operation,stage,source,created_at,updated_at) VALUES(1,1,'buy','searching','phone',?,?)").run(T0,T0));
  assert.equal((await progress.fullCheckSuccessStatement(env,old,{finishedAt:B,checkedCount:0}).run()).meta.changes,0);
});

test('schema refuses incomplete success metadata instead of treating SQL NULL as true',async()=>{
  const env=setup();await begin(env);
  assert.throws(()=>env.DB.raw.prepare("UPDATE applicant_search_progress SET attempt_state='succeeded',attempt_finished_at=? WHERE applicant_id=1").run(B),/CHECK|transition/);
  assert.throws(()=>env.DB.raw.prepare("UPDATE applicant_search_progress SET attempt_state='failed',attempt_finished_at=? WHERE applicant_id=1").run(B),/CHECK|transition/);
  assert.throws(()=>env.DB.raw.prepare('UPDATE applicant_search_progress SET last_success_at=? WHERE applicant_id=1').run(B),/CHECK|transition/);
  assert.equal(row(env).attempt_state,'running');assert.equal(row(env).last_success_at,null);
});

test('a stale start and a clock moving backwards do not replace an existing attempt',async()=>{
  const env=setup(),stale=snapshot(env);env.DB.raw.exec('UPDATE applicants SET budget_max=900000 WHERE id=1');
  assert.equal(await progress.beginFullCheck(env,stale,{nowIso:A}),null);assert.equal(row(env),undefined);
  const current=await begin(env,B);
  assert.equal(await begin(env,A),null);assert.equal(row(env).attempt_token,current.token);
  assert.throws(()=>progress.fullCheckSuccessStatement(env,current,{finishedAt:A,checkedCount:0}),/finish time/);
  assert.throws(()=>progress.fullCheckSuccessStatement(env,current,{finishedAt:C,checkedCount:-1}),/checked count/);
});

test('the default finish time is captured when the database executes the successful write',async()=>{
  const env=setup(),ticket=await begin(env),statement=progress.fullCheckSuccessStatement(env,ticket,{checkedCount:0});
  const immediatelyBefore=new Date().toISOString();await statement.run();const immediatelyAfter=new Date().toISOString();
  assert.ok(row(env).last_success_at>=immediatelyBefore);assert.ok(row(env).last_success_at<=immediatelyAfter);
});

test('replacement or revision rollback cannot revive an older ticket with recursive triggers off',async()=>{
  const env=setup(),old=await begin(env),current=await begin(env);env.DB.raw.exec('PRAGMA recursive_triggers=OFF');
  const before={...row(env)};
  assert.throws(()=>env.DB.raw.exec('INSERT OR REPLACE INTO applicant_search_progress SELECT * FROM applicant_search_progress WHERE applicant_id=1'),/already exists/);
  assert.throws(()=>env.DB.raw.prepare('UPDATE applicant_search_progress SET attempt_seq=?,attempt_token=? WHERE applicant_id=1').run(old.seq,old.token),/transition/);
  assert.deepEqual({...row(env)},before);
  assert.equal((await progress.fullCheckSuccessStatement(env,old,{finishedAt:B,checkedCount:0}).run()).meta.changes,0);
  assert.equal(row(env).attempt_token,current.token);
});

test('installing the proposal over populated synthetic data preserves history and performs no backfill',()=>{
  const env=makeEnv(),db=env.DB.raw;
  db.prepare("INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(1,'Synthetic','migration@example.test',?,?,?)").run(T0,T0,T0);
  db.prepare("INSERT INTO applicants(id,contact_id,operation,stage,source,created_at,updated_at) VALUES(1,1,'buy','searching','phone',?,?)").run(T0,T0);
  seedListing(env);
  db.prepare("INSERT INTO matches(applicant_id,listing_id,score,checks,status,created_at,updated_at) VALUES(1,'HE-R001',50,'[]','found',?,?)").run(T0,T0);
  db.prepare("INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,'system','applicant','1','applicant.matched','{}')").run(T0);
  const tables=['contacts','applicants','matches','events','notifications'];
  const snapshot=()=>Object.fromEntries(tables.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all().map(row=>({...row}))]));
  const before=snapshot();db.exec(readFileSync(proposal,'utf8'));
  assert.deepEqual(snapshot(),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM applicant_search_progress').get().n,0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
});

test('private progress reads one scoped snapshot and never exposes the attempt token',async()=>{
  assert.equal(typeof progress.getSearchProgress,'function');
  const env=setup();env.EST01_PROGRESS_READY='1';const ticket=await begin(env);
  await progress.fullCheckSuccessStatement(env,ticket,{finishedAt:B,checkedCount:0}).run();
  const projected=await progress.getSearchProgress(env,1);
  assert.equal(projected.state,'succeeded');assert.equal(projected.last_success_checked_count,0);
  assert.equal(projected.coverage_pending,true);assert.equal(Object.hasOwn(projected,'attempt_token'),false);
  assert.equal(await progress.getSearchProgress(env,2),null);
  await assert.rejects(()=>progress.getSearchProgress(env,0),/Invalid applicant/);
});

test('a begin after the progress snapshot cannot be mixed into its earlier applicant read',async()=>{
  assert.equal(typeof progress.getSearchProgress,'function');
  const env=setup();env.EST01_PROGRESS_READY='1';const prepare=env.DB.prepare.bind(env.DB);let injected=false;
  env.DB.prepare=sql=>{
    const stmt=prepare(sql);if(!sql.includes('FROM applicants a LEFT JOIN applicant_search_progress'))return stmt;
    return {...stmt,bind:(...args)=>{
      const bound=stmt.bind(...args);
      return {...bound,first:async()=>{const result=await bound.first();if(!injected){injected=true;await begin(env);}return result;}};
    }};
  };
  const projected=await progress.getSearchProgress(env,1);
  assert.equal(injected,true);assert.equal(projected.state,'unrecorded');assert.equal(row(env).attempt_state,'running');
});

test('disabled progress reads never access a missing proposed schema',async()=>{
  assert.equal(typeof progress.getSearchProgress,'function');
  const env=makeEnv();let touched=false;const prepare=env.DB.prepare.bind(env.DB);
  env.DB.prepare=sql=>{touched ||= sql.includes('applicant_search_progress');return prepare(sql);};
  assert.equal(await progress.getSearchProgress(env,1),null);assert.equal(touched,false);
  env.EST01_PROGRESS_READY='1';await assert.rejects(()=>progress.getSearchProgress(env,1));
});
