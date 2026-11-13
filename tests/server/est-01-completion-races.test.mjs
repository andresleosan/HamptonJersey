import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, seedListing, call, adminCookie, T0 } from './helpers.mjs';
import { recomputeForApplicant, recomputeForApplicantWithStatus } from '../../server/match-store.js';

const sql = (env, text, ...args) => env.DB.raw.prepare(text).run(...args);
const get = (env, text, ...args) => env.DB.raw.prepare(text).get(...args);
const add = (env,id,fields={}) => seedListing(env,{id,matchable:1,sale_price:900000,...fields});
function setup() {
  const env = makeEnv();
  sql(env,'INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES(?,?,?,?,?)','Fixture','race@example.test',T0,T0,T0);
  sql(env,"INSERT INTO applicants(contact_id,operation,stage,source,budget_max,created_at,updated_at) VALUES(1,'buy','searching','phone',1000000,?,?)",T0,T0);
  return env;
}
function beforeWrites(env, change) {
  const batch = env.DB.batch.bind(env.DB);
  let done = false;
  env.DB.batch = async statements => {
    if (!done && statements.some(s => s.sql.includes('UPDATE applicants SET match_ranking_version=1'))) {
      done = true;
      change();
    }
    return batch(statements);
  };
  return () => done;
}
function withoutCompletionResult(env, throwTransport = false) {
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async statements => {
    const results = await batch(statements);
    const index = statements.findIndex(s => s.sql.includes('SELECT changes() AS direct_changes'));
    if (index >= 0) {
      if (throwTransport) throw Object.assign(new Error('fixture transport response lost'),{code:'UND_ERR_SOCKET'});
      results[index].results = [];
    }
    return results;
  };
}
const admin = async (env,method,path,body) => call(env,method,path,{body,cookie:await adminCookie()});

test('concurrent Undo of an ineligible rejected match prevents false completion and a reopened notice', async () => {
  const env = setup(); add(env,'EST-UNDO');
  assert.equal((await recomputeForApplicantWithStatus(env,1,'system')).completed,true);
  sql(env,"UPDATE matches SET status='rejected',reject_reason='price' WHERE listing_id='EST-UNDO'");
  sql(env,"UPDATE listings SET matchable=0 WHERE id='EST-UNDO'");
  sql(env,"UPDATE notifications SET resolved_at=?,resolved_by='system' WHERE category='matched'",T0);
  sql(env,"INSERT INTO events(at,actor,entity_type,entity_id,type) VALUES(?,'system','applicant','1','applicant.search_reopened')",T0);
  const before=get(env,'SELECT matches_revision,match_inputs_revision FROM applicants WHERE id=1');
  const injected = beforeWrites(env,() => sql(env,"UPDATE matches SET status='found',reject_reason=NULL WHERE listing_id='EST-UNDO'"));
  const result = await recomputeForApplicantWithStatus(env,1,'system',true);
  assert.equal(injected(),true);
  assert.equal(result.completed,false);
  const after=get(env,'SELECT matches_revision,match_inputs_revision FROM applicants WHERE id=1');
  assert.ok(after.matches_revision > before.matches_revision);
  assert.equal(after.match_inputs_revision,before.match_inputs_revision);
  assert.equal(get(env,"SELECT status FROM matches WHERE listing_id='EST-UNDO'").status,'found');
  assert.equal(get(env,"SELECT COUNT(*) n FROM notifications WHERE category='matched' AND resolved_at IS NULL").n,0);
  assert.equal(get(env,"SELECT COUNT(*) n FROM events WHERE type='applicant.matched'").n,1);
  assert.equal((await recomputeForApplicantWithStatus(env,1,'system',true)).completed,true);
  assert.equal(get(env,"SELECT COUNT(*) n FROM matches WHERE listing_id='EST-UNDO'").n,0);
  assert.equal(get(env,"SELECT COUNT(*) n FROM notifications WHERE category='matched' AND resolved_at IS NULL").n,0);
});

for (const status of ['rejected','shortlisted']) test(`concurrent human ${status} review prevents a stale completed result`, async () => {
  const env = setup(); add(env,'EST-REVIEW');
  await recomputeForApplicantWithStatus(env,1,'system');
  const injected = beforeWrites(env,() => sql(env,'UPDATE matches SET status=? WHERE listing_id=?',status,'EST-REVIEW'));
  const result = await recomputeForApplicantWithStatus(env,1,'system');
  assert.equal(injected(),true);
  assert.equal(result.completed,false);
  assert.equal(get(env,"SELECT status FROM matches WHERE listing_id='EST-REVIEW'").status,status);
});

test('successful own writes can advance matches_revision without conflicting with their starting snapshot', async () => {
  const env = setup(); add(env,'EST-OWN');
  const before=get(env,'SELECT matches_revision FROM applicants WHERE id=1').matches_revision;
  assert.deepEqual(await recomputeForApplicantWithStatus(env,1,'system'),{created:1,completed:true});
  assert.ok(get(env,'SELECT matches_revision FROM applicants WHERE id=1').matches_revision > before);
});

test('wrapper and bulk route report candidate-set drift instead of success', async () => {
  for (const kind of ['wrapper','bulk']) {
    const env = setup(); add(env,'EST-ORIGINAL');
    const injected = beforeWrites(env,() => add(env,'EST-LATE'));
    if (kind === 'wrapper') await assert.rejects(() => recomputeForApplicant(env,1,'system'),e => e.status===409);
    else {
      const response = await admin(env,'POST','/admin/matches/recalculate',{phase:'applicants'});
      assert.equal(response.status,409);
    }
    assert.equal(injected(),true);
    assert.equal(get(env,'SELECT COUNT(*) n FROM matches').n,0);
    assert.equal(get(env,"SELECT COUNT(*) n FROM events WHERE type='applicant.matched'").n,0);
  }
});

for (const kind of ['wrapper','individual route','bulk route']) test(`${kind} reports an unknown outcome when the completion result disappears after commit`, async () => {
  const env = setup(); add(env,'EST-NO-COMPLETION'); withoutCompletionResult(env);
  if (kind === 'wrapper') await assert.rejects(() => recomputeForApplicant(env,1,'system'),e => e.status===503 && /unknown|not.*verified/i.test(e.message));
  else {
    const path = kind === 'bulk route' ? '/admin/matches/recalculate' : '/admin/applicants/1/matches/recalculate';
    const response = await admin(env,'POST',path,kind === 'bulk route' ? {phase:'applicants'} : {});
    assert.equal(response.status,503);
    assert.match(response.data.error,/unknown|not.*verified/i);
  }
  assert.equal(get(env,'SELECT COUNT(*) n FROM matches WHERE applicant_id=1').n,1,
    'the lost response is injected after commit, not a rollback');
});

test('a lost transport response after commit is reported as unknown without claiming rollback', async () => {
  const env = setup(); add(env,'EST-TRANSPORT'); withoutCompletionResult(env,true);
  const response = await admin(env,'POST','/admin/matches/recalculate',{phase:'applicants'});
  assert.equal(response.status,503);
  assert.match(response.data.error,/unknown|not.*verified/i);
  assert.equal(get(env,'SELECT COUNT(*) n FROM matches WHERE applicant_id=1').n,1);
});

test('a direct zero completion count does not turn a committed partial result into success', async () => {
  const env = setup(); add(env,'EST-ZERO-COMPLETION');
  const batch=env.DB.batch.bind(env.DB);
  env.DB.batch=async statements=>{
    const results=await batch(statements);
    const index=statements.findIndex(s=>s.sql.includes('SELECT changes() AS direct_changes'));
    if(index>=0)results[index].results=[{direct_changes:0}];
    return results;
  };
  const response=await admin(env,'POST','/admin/matches/recalculate',{phase:'applicants'});
  assert.equal(response.status,409);
  assert.match(response.data.error,/could not be confirmed/i);
  assert.equal(get(env,'SELECT COUNT(*) n FROM matches WHERE applicant_id=1').n,1,
    'the direct result is changed only after the fixture batch committed');
});

test('non-applicable inactive, commercial and missing searches remain harmless no-ops', async () => {
  for (const kind of ['inactive','commercial','missing']) {
    const env = setup();
    if (kind === 'inactive') sql(env,"UPDATE applicants SET stage='lost',search_state='needs_review' WHERE id=1");
    if (kind === 'commercial') sql(env,"UPDATE applicants SET search_category='commercial' WHERE id=1");
    assert.deepEqual(await recomputeForApplicant(env,kind === 'missing' ? 999 : 1,'system'),{created:0});
  }
  const env = setup();
  sql(env,"UPDATE applicants SET search_category='commercial' WHERE id=1");
  assert.equal((await admin(env,'POST','/admin/matches/recalculate',{phase:'applicants'})).status,200);
});
