import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, adminCookie, captured, plan } from './helpers.mjs';
import { observedStageEntries, getSearchMilestones, readVerifiedSearchFacts } from '../../server/measurement-funnel.js';

const enabledEnv = () => ({...makeEnv(), SEARCH_MILESTONES_READY:'1'});
const stamp = '2026-10-25T12:00:00.000Z';
const run = (env, sql, ...args) => env.DB.raw.prepare(sql).run(...args);
const window = {from:'2026-10-25',to:'2026-10-25',operation:'all',category:'all'};
let serial = 0;
function contact(env) {
  const i = ++serial;
  return Number(run(env, `INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at)
    VALUES(?,?,?,?,?)`, 'SYNTHETIC_PERSON', `sample${i}@example.test`, stamp, stamp, stamp).lastInsertRowid);
}
function search(env, overrides = {}) {
  const row = {contact_id:contact(env),operation:'rent',source:'phone',stage:'new',
    created_at:'2026-10-25T00:00:00.000Z',updated_at:stamp,...overrides};
  const names = Object.keys(row);
  return Number(run(env, `INSERT INTO applicants(${names.join(',')}) VALUES(${names.map(() => '?').join(',')})`,
    ...names.map(name => row[name])).lastInsertRowid);
}
function event(env, id, at, data, type='applicant.stage_changed', entity='applicant') {
  run(env, `INSERT INTO events(at,actor,entity_type,entity_id,type,data) VALUES(?,?,?,?,?,?)`,
    at, 'synthetic', entity, String(id), type, typeof data === 'string' ? data : JSON.stringify(data));
}
const after = stage => ({after:{stage}});
const stageCount = (report, stage) => report.observed_stages.find(row => row.stage === stage)?.count;

test('recorded stages are explicit, valid and deduplicated by search with first timestamp', () => {
  const entries = observedStageEntries([
    {id:4,entity_id:'1',type:'applicant.stage_changed',at:'2026-10-25T10:00:00Z',data:JSON.stringify(after('agreed'))},
    {id:2,entity_id:'1',type:'applicant.updated',at:'2026-10-25T08:00:00Z',data:JSON.stringify(after('agreed'))},
    {id:3,entity_id:'1',type:'applicant.stage_changed',at:'bad',data:JSON.stringify(after('viewing'))},
    {id:5,entity_id:'1',type:'applicant.updated',at:'2026-10-25T09:00:00Z',data:'{broken'},
    {id:6,entity_id:'1',type:'applicant.created',at:'2026-10-25T09:00:00Z',data:JSON.stringify(after('viewing'))},
    {id:7,entity_id:'2',type:'applicant.updated',at:'2026-10-25T09:00:00Z',data:JSON.stringify(after('unknown'))},
  ]);
  assert.deepEqual([...entries.get('1')], [['agreed','2026-10-25T08:00:00Z']]);
  assert.equal(entries.get('1').has('viewing'), false);
  assert.equal(entries.has('2'), false);
});

test('cohort is search records, retains archives and never infers stages or real viewings', async () => {
  const env = enabledEnv(), one = contact(env);
  const agreed = search(env,{contact_id:one,stage:'agreed',updated_by:'import'});
  search(env,{contact_id:one,operation:'buy',source:'phone',archived_at:stamp});
  event(env,agreed,'2026-10-25T08:00:00.000Z',after('agreed'));
  event(env,agreed,'2026-10-25T09:00:00.000Z',after('agreed'),'applicant.updated');
  event(env,agreed,'2026-10-25T10:00:00.000Z','{broken');
  const d = await getSearchMilestones(env,window);
  assert.equal(d.enabled,true);
  assert.equal(d.cohort.count,2);
  assert.equal(d.cohort.unit,'search_record');
  assert.equal(stageCount(d,'agreed'),1);
  assert.equal(stageCount(d,'viewing'),0);
  assert.equal(d.coverage.excluded_invalid,1);
  assert.equal(d.coverage.deleted_history_unknown,true);
  assert.equal(d.coverage.measured_from,null);
  for (const kind of ['viewing_completed','offer','agreed','completed']) {
    assert.equal(d.verified_business[kind].count,null);
    assert.equal(d.verified_business[kind].coverage,'not_integrated');
  }
  assert.equal(Object.hasOwn(d.cohort,'web_registrations'),false);
  assert.equal(JSON.stringify(d).includes('SYNTHETIC_PERSON'),false);
  assert.equal(JSON.stringify(d).includes('{broken'),false);
});

test('cutoff, Jersey DST, filters, and event scope are enforced independently', async () => {
  const env = enabledEnv();
  const included = search(env,{created_at:'2026-10-24T23:00:00.000Z',search_category:'commercial',search_operation:'transfer'});
  search(env,{created_at:'2026-10-24T22:59:59.999Z'});
  search(env,{created_at:'2026-10-26T00:00:00.000Z'});
  const other = search(env,{operation:'buy'});
  event(env,included,'2026-10-24T22:59:59.000Z',after('viewing'));
  event(env,included,'2026-10-25T23:59:59.000Z',after('agreed'));
  event(env,included,'2026-10-26T00:00:00.000Z',after('completed'));
  event(env,other,'2026-10-25T08:00:00.000Z',after('viewing'));
  event(env,included,'2026-10-25T08:00:00.000Z',after('viewing'),'applicant.stage_changed','contact');
  const transfer = await getSearchMilestones(env,{...window,operation:'transfer',category:'commercial'});
  assert.equal(transfer.cohort.count,1);
  assert.equal(stageCount(transfer,'agreed'),1);
  assert.equal(stageCount(transfer,'viewing'),0);
  assert.equal(stageCount(transfer,'completed'),0);
  assert.equal(transfer.coverage.observed_until,'2026-10-26T00:00:00.000Z');
  assert.equal((await getSearchMilestones(env,{...window,operation:'rent'})).cohort.count,0);
  assert.equal((await getSearchMilestones(env,{...window,operation:'buy',category:'residential'})).cohort.count,1);
});

test('default verified adapter does not invent or accept unrelated facts', async () => {
  const result = await readVerifiedSearchFacts(enabledEnv(),{applicantIds:[1],cutoff:stamp});
  assert.deepEqual(result.facts,[]);
  assert.equal(result.coverage,'not_integrated');
});

test('staff endpoint validates filters and date ranges and is never cached', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse(stamp)});
  const env = enabledEnv(), cookie = await adminCookie();
  assert.equal((await call(env,'GET','/admin/insights/milestones')).status,401);
  for (const query of ['?days=31','?days=','?operation=sale','?category=office']) {
    assert.equal((await call(env,'GET',`/admin/insights/milestones${query}`,{cookie})).status,400);
  }
  const r = await call(env,'GET','/admin/insights/milestones?days=7&operation=transfer&category=commercial',{cookie});
  assert.equal(r.status,200);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.data.cohort.operation,'transfer');
  assert.equal(r.data.cohort.category,'commercial');
  assert.equal(r.data.cohort.from,'2026-10-19');
  assert.equal(r.data.cohort.to,'2026-10-25');
});

test('cohort and event reads use bounded indexed searches on synthetic history', async () => {
  const env = enabledEnv();
  const c = contact(env);
  const insert = env.DB.raw.prepare(`INSERT INTO applicants(contact_id,operation,source,stage,created_at,updated_at,archived_at)
    VALUES(?,'rent','phone','new',?,?,?)`);
  for(let i=0;i<5000;i++) insert.run(c,'2025-01-01T12:00:00.000Z',stamp,stamp);
  const id = search(env);
  event(env,id,'2026-10-25T10:00:00.000Z',after('agreed'));
  const seen = captured(env,/WITH\s+cohort/i);
  const d = await getSearchMilestones(env,window);
  assert.equal(d.cohort.count,1);
  assert.equal(seen.length,1);
  const details=plan(env,seen[0]);
  assert.match(details,/SEARCH a USING INDEX applicants_operation/);
  assert.match(details,/SEARCH e USING INDEX events_entity/);
});

test('offset timestamps are scoped by instant, malformed timestamps and bodies are excluded', async () => {
  const env=enabledEnv(), id=search(env,{created_at:'2026-10-24T23:00:00.000Z'});
  event(env,id,'2026-10-25T00:59:59+02:00',after('viewing'));
  event(env,id,'2026-10-26T00:59:59.999+01:00',after('agreed'));
  event(env,id,'2026-10-25T25:00:00Z',after('offer'));
  const d=await getSearchMilestones(env,window);
  assert.equal(stageCount(d,'viewing'),0);
  assert.equal(stageCount(d,'agreed'),1);
  assert.equal(stageCount(d,'offer'),0);
  assert.equal(d.coverage.excluded_invalid,1);
});

test('query bounds include rows excluded by filters and fails instead of returning partial counts', async () => {
  const env=enabledEnv(), c=contact(env);
  env.DB.raw.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<5001)
    INSERT INTO applicants(contact_id,operation,source,stage,created_at,updated_at,archived_at)
    SELECT ?,'rent','phone','new',?,?,? FROM seq`).run(c,stamp,stamp,stamp);
  await assert.rejects(getSearchMilestones(env,{...window,operation:'buy'}),e=>e.status===503);
});

test('query bounds include unrelated event types and fail rather than returning a partial history', async () => {
  const env=enabledEnv(), id=search(env);
  env.DB.raw.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<50001)
    INSERT INTO events(at,actor,entity_type,entity_id,type,data)
    SELECT ?,'synthetic','applicant',?,'applicant.note',NULL FROM seq`).run(stamp,String(id));
  await assert.rejects(getSearchMilestones(env,window),e=>e.status===503);
});

test('direct measurement rejects invalid and overlong ranges', async () => {
  const env=enabledEnv();
  for(const v of [{from:'2026-02-30',to:'2026-03-01'}, {from:'2026-01-01',to:'2026-04-01'},
    {from:'2026-10-26',to:'2026-10-25'}, {from:'2026-10-25',to:'2026-10-25',operation:'sale'}]) {
    await assert.rejects(getSearchMilestones(env,v),e=>e.status===400);
  }
  assert.equal((await getSearchMilestones(env,{from:'2026-01-01',to:'2026-03-31'})).cohort.count,0);
});

test('an oversized stage-event body fails closed instead of consuming an unbounded payload', async () => {
  const env=enabledEnv(), id=search(env);
  event(env,id,'2026-10-25T09:00:00.000Z',{after:{stage:'agreed'},padding:'x'.repeat(131073)});
  await assert.rejects(getSearchMilestones(env,window),e=>e.status===503);
});

test('fractional ISO timestamps just before and after the Jersey cutoff stay on the correct side', async () => {
  const env=enabledEnv(), id=search(env);
  event(env,id,'2026-10-25T23:59:59.9999Z',after('agreed'));
  event(env,id,'2026-10-26T00:00:00.0001Z',after('completed'));
  const d=await getSearchMilestones(env,window);
  assert.equal(stageCount(d,'agreed'),1);
  assert.equal(stageCount(d,'completed'),0);
});

test('spring clock change measures a 23-hour Jersey day at exact UTC boundaries', async () => {
  const env=enabledEnv();
  search(env,{created_at:'2026-03-28T23:59:59.999Z'});
  const first=search(env,{created_at:'2026-03-29T00:00:00.000Z'});
  search(env,{created_at:'2026-03-29T22:59:59.999Z'});
  search(env,{created_at:'2026-03-29T23:00:00.000Z'});
  event(env,first,'2026-03-29T22:59:59.999Z',after('agreed'));
  event(env,first,'2026-03-29T23:00:00.000Z',after('completed'));
  const d=await getSearchMilestones(env,{from:'2026-03-29',to:'2026-03-29'});
  assert.equal(d.cohort.count,2);
  assert.equal(stageCount(d,'agreed'),1);
  assert.equal(stageCount(d,'completed'),0);
  assert.equal(d.coverage.observed_until,'2026-03-29T23:00:00.000Z');
});

test('measurement gate defaults to not configured without preparing the measurement query', async () => {
  for (const setting of [undefined,'0','true']) {
    const env = makeEnv();
    if (setting !== undefined) env.SEARCH_MILESTONES_READY = setting;
    env.DB.prepare = () => { throw Error('measurement query must not run while disabled'); };
    assert.deepEqual(await getSearchMilestones(env,window),{enabled:false,reason:'not_configured'});
  }
});

test('staff endpoint returns a normal no-store disabled state without querying measurement', async () => {
  const env = makeEnv(), original = env.DB.prepare.bind(env.DB);
  env.DB.prepare = sql => {
    if (/WITH\s+cohort/i.test(sql)) throw Error('measurement query must not run while disabled');
    return original(sql);
  };
  const result = await call(env,'GET','/admin/insights/milestones?days=7',{cookie:await adminCookie()});
  assert.equal(result.status,200);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual(result.data,{enabled:false,reason:'not_configured'});
});

test('an enabled endpoint reports a real query-budget error rather than a disabled state', async t => {
  t.mock.timers.enable({apis:['Date'],now:Date.parse(stamp)});
  const env=enabledEnv(), c=contact(env);
  env.DB.raw.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<5001)
    INSERT INTO applicants(contact_id,operation,source,stage,created_at,updated_at,archived_at)
    SELECT ?,'rent','phone','new',?,?,? FROM seq`).run(c,stamp,stamp,stamp);
  const result=await call(env,'GET','/admin/insights/milestones?days=7',{cookie:await adminCookie()});
  assert.equal(result.status,503);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.match(result.data.error,/budget/i);
});
