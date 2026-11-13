import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDb } from './helpers.mjs';
import * as core from '../../server/internal/market-identity-core.js';
import * as facade from '../../server/market-identity.js';

const at='2026-11-13T12:00:00.000Z', actor='admin@example.test', clock=()=>new Date(at);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const exec=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const get=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const count=(db,table)=>get(db,`SELECT count(*) AS n FROM ${table}`).then(r=>r.n);
const haveCore=()=>{
  assert.equal(typeof core.proposePropertyIdentityCore,'function','candidate proposal is missing');
  assert.equal(typeof core.inspectHumanMatchConflictsCore,'function','conflict inspection is missing');
};
function setupDb() {
  haveCore();
  const db=makeDb();
  db.raw.exec(readFileSync(new URL('../../docs/roadmap/work/BUS-10/candidate-schema-proposal.sql',import.meta.url),'utf8'));
  return db;
}
async function seed(db) {
  await exec(db,`INSERT INTO market_directory_manifests(revision,sha256,accepted_at,reviewer_ref,status)
    VALUES('synthetic',?,?,'synthetic-review','accepted')`,'a'.repeat(64),at);
  for(const source of ['source-a','source-b','source-c']) await exec(db,`INSERT INTO market_sources
    (source_ref,channel_id,directory_revision,source_kind,source_class,access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at)
    VALUES(?,'site','synthetic','external','general','allowed','manual',1,'evidence','retention',?,?)`,
    source,'2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z');
  await exec(db,`INSERT INTO market_runs(id,kind,manifest_revision,manifest_sha256,operation_id,created_at,created_by)
    VALUES(?,'initial','synthetic',?,?,?,'synthetic')`,id(100),'a'.repeat(64),id(101),at);
}
async function observation(db,n,{source='source-a',key=`key-${n}`,operation='sale',unit='one'}={}) {
  const page=id(1000+n),obs=id(2000+n);
  await exec(db,`INSERT INTO market_pages(id,run_id,source_ref,channel_id,page_key,content_sha256,
    exhausted,observed_at,committed_at,committed_by,lease_token,lease_generation,policy_version)
    VALUES(?,?,?,'site',?,?,1,?,?,'synthetic','synthetic',1,1)`,page,id(100),source,`page-${n}`,'b'.repeat(64),at,at);
  const normalized={country_code:'JE',territory_evidence:'synthetic-scope',operation,observed_at:at,
    fields:{title:'Same building',parish:'Synthetic parish'},unit};
  await exec(db,`INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,
    normalized_sha256,source_at,origin_sha256) VALUES(?,?,?,'site',?,'{}',?,?,?,?)`,
    obs,page,source,key,JSON.stringify(normalized),'c'.repeat(64),at,'d'.repeat(64));
  const result=await core.resolvePropertyIdentityCore({DB:db},{observation_id:obs,operation_id:id(3000+n)},actor,clock);
  return {obs,...result};
}
const input=(a,b,n,signal='shared_address')=>({left_property_id:a.property_id,right_property_id:b.property_id,
  left_evidence_observation_id:a.obs,right_evidence_observation_id:b.obs,
  expected_left_version:1,expected_right_version:1,expected_left_evidence_revision:1,expected_right_evidence_revision:1,
  signal,operation_id:id(n)});
const reverse=x=>({...x,left_property_id:x.right_property_id,right_property_id:x.left_property_id,
  left_evidence_observation_id:x.right_evidence_observation_id,right_evidence_observation_id:x.left_evidence_observation_id,
  expected_left_version:x.expected_right_version,expected_right_version:x.expected_left_version,
  expected_left_evidence_revision:x.expected_right_evidence_revision,expected_right_evidence_revision:x.expected_left_evidence_revision});
const propose=(db,request,who=actor)=>core.proposePropertyIdentityCore({DB:db},request,who,clock);
const conflict=e=>e.status===409;

test('candidate capability is available only inside the internal test core',()=>haveCore());

test('a candidate never joins same-address units, publications or decisions',async()=>{
  const db=setupDb();await seed(db);
  const a=await observation(db,1,{unit:'one'}),b=await observation(db,2,{unit:'two'});
  const result=await propose(db,input(a,b,4001));
  assert.equal(result.status,'pending_review');assert.equal(result.evidence_state,'revalidate_before_decision');
  assert.match(result.candidate_id,/^[0-9a-f-]{36}$/);
  assert.equal(await count(db,'market_identity_candidates'),1);
  assert.equal(await count(db,'market_identity_candidate_receipts'),1);
  assert.equal(await count(db,'market_identity_aliases'),0);assert.equal(await count(db,'market_identity_decisions'),0);
  assert.equal(await count(db,'market_properties'),2);assert.equal(await count(db,'market_observations'),2);
  assert.notEqual(a.property_id,b.property_id);assert.notEqual(a.publication_id,b.publication_id);
  const violations=await db.prepare('PRAGMA foreign_key_check').all();assert.deepEqual(violations.results,[]);
});

test('the same reference and different operations produce a suggestion only, never one physical property',async()=>{
  const db=setupDb();await seed(db);
  const a=await observation(db,3,{key:'shared',operation:'sale'}),b=await observation(db,4,{key:'shared',operation:'rent'});
  const result=await propose(db,input(a,b,4002,'shared_reference'));
  assert.equal(result.status,'pending_review');assert.notEqual(a.property_id,b.property_id);assert.notEqual(a.publication_id,b.publication_id);
  assert.equal(await count(db,'market_identity_aliases'),0);
});

test('replay, reversed pair and parallel operations are idempotent without accepting changed intent',async()=>{
  const db=setupDb();await seed(db);
  const a=await observation(db,5),b=await observation(db,6,{source:'source-b'});
  const x=input(a,b,4003),y={...reverse(x),operation_id:id(4004)};
  const [first,second]=await Promise.all([propose(db,x),propose(db,y)]);
  assert.equal(first.candidate_id,second.candidate_id);assert.deepEqual(await propose(db,reverse(x)),first);
  await assert.rejects(propose(db,{...x,signal:'manual_review'}),conflict);
  await assert.rejects(propose(db,{...x,signal:'manual_review',operation_id:id(4990)}),conflict);
  await assert.rejects(propose(db,x,'colleague@example.test'),conflict);
  assert.equal(await count(db,'market_identity_candidates'),1);assert.equal(await count(db,'market_identity_candidate_receipts'),2);
});


test('simultaneous retries with the same operation share exactly one receipt',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,29),b=await observation(db,30,{source:'source-b'}),x=input(a,b,4018);
  const [first,second]=await Promise.all([propose(db,x),propose(db,x)]);
  assert.deepEqual(first,second);assert.equal(await count(db,'market_identity_candidates'),1);
  assert.equal(await count(db,'market_identity_candidate_receipts'),1);
});


test('an operation cannot be replayed for a different candidate pair',async()=>{
  const db=setupDb();await seed(db);
  const a=await observation(db,31),b=await observation(db,32,{source:'source-b'}),c=await observation(db,33,{source:'source-c'});
  await propose(db,input(a,b,4019));
  await assert.rejects(propose(db,input(a,c,4019)),conflict);
  await assert.rejects(propose(db,input(a,c,3031)),conflict); // already used by the first observation's resolution
  assert.equal(await count(db,'market_identity_candidates'),1);assert.equal(await count(db,'market_identity_candidate_receipts'),1);
});

test('only known signal codes and bounded structured data are accepted',async()=>{
  const db=setupDb();await seed(db);
  const a=await observation(db,7),b=await observation(db,8,{source:'source-b'}),x=input(a,b,4005);
  for(const bad of [{...x,signal:'confirmed_same_property'},{...x,reason:'private free text'},
    {...x,expected_left_evidence_revision:0},{...x,right_property_id:x.left_property_id}]) {
    await assert.rejects(propose(db,bad),error=>[400,409].includes(error.status));
  }
  assert.equal(await count(db,'market_identity_candidates'),0);assert.equal(await count(db,'market_identity_candidate_receipts'),0);
});

test('an unrelated observation cannot be used as evidence for a candidate',async()=>{
  const db=setupDb();await seed(db);
  const a=await observation(db,9),b=await observation(db,10,{source:'source-b'}),c=await observation(db,11,{source:'source-c'});
  await assert.rejects(propose(db,{...input(a,b,4006),left_evidence_observation_id:c.obs}),conflict);
  assert.equal(await count(db,'market_identity_candidates'),0);
});

test('source revocation and evidence changes before commit abort without candidate or receipt',async()=>{
  for(const mutation of [
    db=>db.raw.prepare("UPDATE market_sources SET access_status='denied',policy_version=policy_version+1 WHERE source_ref='source-b'").run(),
    (db,b)=>db.raw.prepare('UPDATE market_observations SET revision=revision+1 WHERE id=?').run(b.obs),
    (db,b)=>db.raw.prepare("UPDATE market_observations SET raw_json='{} ',normalized_json=json_set(normalized_json,'$.unit','changed') WHERE id=?").run(b.obs),
    (db,b)=>db.raw.prepare('UPDATE market_properties SET version=version+1 WHERE id=?').run(b.property_id)
  ]) {
    const db=setupDb();await seed(db);const a=await observation(db,12),b=await observation(db,13,{source:'source-b'});
    const batch=db.batch.bind(db);let changed=false;
    db.batch=stmts=>{if(!changed){changed=true;mutation(db,b);}return batch(stmts)};
    await assert.rejects(propose(db,input(a,b,4007)),conflict);
    assert.equal(changed,true);assert.equal(await count(db,'market_identity_candidates'),0);assert.equal(await count(db,'market_identity_candidate_receipts'),0);
  }
});

test('retry after loss of access does not reveal a previous candidate',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,14),b=await observation(db,15,{source:'source-b'}),x=input(a,b,4008);
  await propose(db,x);await exec(db,"UPDATE market_sources SET access_status='denied',policy_version=policy_version+1 WHERE source_ref='source-b'");
  await assert.rejects(propose(db,x),conflict);
  assert.equal(await count(db,'market_identity_candidates'),1);assert.equal(await count(db,'market_identity_candidate_receipts'),1);
});

test('failure after inserting a candidate rolls back the candidate and receipt',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,16),b=await observation(db,17,{source:'source-b'});
  const batch=db.batch.bind(db);
  db.batch=stmts=>{const i=stmts.findIndex(s=>s.sql.includes('INSERT INTO market_identity_candidates'));
    return batch([...stmts.slice(0,i+1),db.prepare("INSERT INTO market_commit_guard(id,allowed) VALUES('synthetic-failure',0)"),...stmts.slice(i+1)]);};
  await assert.rejects(propose(db,input(a,b,4009)),conflict);
  assert.equal(await count(db,'market_identity_candidates'),0);assert.equal(await count(db,'market_identity_candidate_receipts'),0);
});



test('revoking the actor just before commit produces no candidate or receipt',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,24),b=await observation(db,25,{source:'source-b'});
  const batch=db.batch.bind(db);let changed=false;
  db.batch=stmts=>{if(!changed){changed=true;db.raw.prepare('DELETE FROM admins WHERE email=?').run(actor);}return batch(stmts)};
  await assert.rejects(propose(db,input(a,b,4014)),conflict);
  assert.equal(changed,true);assert.equal(await count(db,'market_identity_candidates'),0);assert.equal(await count(db,'market_identity_candidate_receipts'),0);
});

test('a candidate checks every source in both alias groups, not just its two evidence rows',async()=>{
  const db=setupDb();await seed(db);
  const a=await observation(db,26),b=await observation(db,27,{source:'source-b'}),c=await observation(db,28,{source:'source-c'});
  await core.mergePropertyIdentitiesCore({DB:db},{source_property_id:a.property_id,target_property_id:b.property_id,
    source_evidence_observation_id:a.obs,target_evidence_observation_id:b.obs,
    expected_source_version:1,expected_target_version:1,operation_id:id(4015)},actor,clock);
  const x={...input(b,c,4016),expected_left_version:2,left_evidence_observation_id:a.obs};
  assert.equal((await propose(db,x)).status,'pending_review');
  await exec(db,"UPDATE market_sources SET access_status='denied',policy_version=policy_version+1 WHERE source_ref='source-a'");
  await assert.rejects(propose(db,{...x,operation_id:id(4017)}),conflict);
  assert.equal(await count(db,'market_identity_candidates'),1);assert.equal(await count(db,'market_identity_candidate_receipts'),1);
  assert.equal(await count(db,'market_identity_aliases'),1);
});

test('a changed proposal cannot replace an existing pair without an explicit lifecycle',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,18),b=await observation(db,19,{source:'source-b'});
  const first=await propose(db,input(a,b,4010));
  await exec(db,'UPDATE market_observations SET revision=revision+1 WHERE id=?',b.obs);
  const newer={...input(a,b,4011),expected_right_evidence_revision:2};
  await assert.rejects(propose(db,newer),conflict);
  assert.equal(await count(db,'market_identity_candidates'),1);assert.equal(await count(db,'market_identity_candidate_receipts'),1);
  assert.equal(first.evidence_state,'revalidate_before_decision');
});

test('missing a receipt after commit is an error; the same request can safely retry',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,20),b=await observation(db,21,{source:'source-b'}),x=input(a,b,4012);
  const batch=db.batch.bind(db);let inject=true;
  db.batch=async stmts=>{const result=await batch(stmts);if(inject){inject=false;result.at(-2).results=[];}return result;};
  await assert.rejects(propose(db,x),/receipt missing/i);
  assert.equal(await count(db,'market_identity_candidates'),1);assert.equal(await count(db,'market_identity_candidate_receipts'),1);
  assert.equal((await propose(db,x)).status,'pending_review');
  assert.equal(await count(db,'market_identity_candidates'),1);
});

test('candidate and receipt store no raw or normalized observation content',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,22),b=await observation(db,23,{source:'source-b'});
  await exec(db,"UPDATE market_observations SET raw_json=json_object('note','synthetic-private-marker') WHERE id=?",a.obs);
  await propose(db,input(a,b,4013));
  for(const table of ['market_identity_candidates','market_identity_candidate_receipts']) {
    const rows=await db.prepare(`SELECT * FROM ${table}`).all();
    assert.doesNotMatch(JSON.stringify(rows.results),/synthetic-private-marker|Same building|Synthetic parish/);
  }
});

test('human matches show a supplied conflict but never prove merge is safe',()=>{
  haveCore();
  const left=[{search_id:1,operation:'sale',status:'shortlisted'}],right=[{search_id:1,operation:'sale',status:'rejected'}];
  const before=JSON.stringify({left,right}),result=core.inspectHumanMatchConflictsCore({left,right});
  assert.deepEqual(result,{status:'conflict_in_supplied_evidence',conflict_count:1,can_auto_merge:false});
  assert.equal(JSON.stringify({left,right}),before);
  assert.deepEqual(core.inspectHumanMatchConflictsCore({left:[left[0],right[0]],right:[]}),
    {status:'conflict_in_supplied_evidence',conflict_count:1,can_auto_merge:false});
  assert.deepEqual(core.inspectHumanMatchConflictsCore({left,right:[{...right[0],operation:'rent'}]}),
    {status:'unverified',conflict_count:0,can_auto_merge:false});
  assert.deepEqual(core.inspectHumanMatchConflictsCore({left:[],right:[]}),
    {status:'unverified',conflict_count:0,can_auto_merge:false});
  assert.throws(()=>core.inspectHumanMatchConflictsCore({left:[{...left[0],name:'private'}],right}),e=>e.status===400);
  assert.throws(()=>core.inspectHumanMatchConflictsCore({left:[{...left[0],status:'unknown'}],right}),e=>e.status===400);
  assert.throws(()=>core.inspectHumanMatchConflictsCore({left:Array(51).fill(left[0]),right}),e=>e.status===400);
});

test('the public facade remains unavailable',async()=>{
  for(const name of ['resolvePropertyIdentity','mergePropertyIdentities','undoPropertyIdentityDecision','readPropertyIdentity'])
    await assert.rejects(facade[name]({}, {}, actor),error=>error.status===503);
  assert.equal('proposePropertyIdentity' in facade,false);
});

test('explicit replacement creates a version and rejects stale replacement or replay',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,40),b=await observation(db,41,{source:'source-b'});
  const firstInput=input(a,b,4040),first=await propose(db,firstInput);
  await exec(db,'UPDATE market_observations SET revision=revision+1 WHERE id=?',b.obs);
  const next={...input(a,b,4041),expected_right_evidence_revision:2,supersedes_candidate_id:first.candidate_id};
  const second=await propose(db,next);
  assert.notEqual(first.candidate_id,second.candidate_id);assert.equal(second.evidence_state,'revalidate_before_decision');
  assert.deepEqual(await propose(db,next),second);
  await assert.rejects(propose(db,{...next,operation_id:id(4042)}),conflict);
  await assert.rejects(propose(db,firstInput),conflict);
  assert.equal(await count(db,'market_identity_candidates'),2);assert.equal(await count(db,'market_identity_candidate_receipts'),2);
  assert.equal(await count(db,'market_identity_decisions'),0);assert.equal(await count(db,'market_identity_aliases'),0);
});

test('concurrent replacements have one winner, and revocation rolls back replacement',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,42),b=await observation(db,43,{source:'source-b'});
  const first=await propose(db,input(a,b,4043));
  const next={...input(a,b,4044,'manual_review'),supersedes_candidate_id:first.candidate_id};
  const results=await Promise.allSettled([propose(db,next),propose(db,{...next,operation_id:id(4045),signal:'shared_reference'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&conflict(r.reason)).length,1);
  const winner=results.find(r=>r.status==='fulfilled').value;
  const batch=db.batch.bind(db);db.batch=stmts=>{db.raw.prepare("UPDATE market_sources SET access_status='denied',policy_version=policy_version+1 WHERE source_ref='source-b'").run();return batch(stmts)};
  await assert.rejects(propose(db,{...input(a,b,4046),supersedes_candidate_id:winner.candidate_id}),conflict);
  assert.equal(await count(db,'market_identity_candidates'),2);assert.equal(await count(db,'market_identity_candidate_receipts'),2);
});

test('replacement requires the head of the same pair and checks actor and evidence at commit',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,44),b=await observation(db,45,{source:'source-b'}),c=await observation(db,46,{source:'source-c'});
  const first=await propose(db,input(a,b,4047));
  await assert.rejects(propose(db,{...input(a,c,4048),supersedes_candidate_id:first.candidate_id}),conflict);
  const batch=db.batch.bind(db);db.batch=stmts=>{db.raw.prepare('DELETE FROM admins WHERE email=?').run(actor);return batch(stmts)};
  await assert.rejects(propose(db,{...input(a,b,4049),supersedes_candidate_id:first.candidate_id}),conflict);
  assert.equal(await count(db,'market_identity_candidates'),1);assert.equal(await count(db,'market_identity_candidate_receipts'),1);
});

test('proposed history and receipts cannot be deleted to revive an earlier version',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,47),b=await observation(db,48,{source:'source-b'});
  const first=await propose(db,input(a,b,4050));
  const next={...input(a,b,4051),supersedes_candidate_id:first.candidate_id};
  const second=await propose(db,next);
  await assert.rejects(exec(db,'DELETE FROM market_identity_candidates WHERE id=?',second.candidate_id));
  await assert.rejects(exec(db,'DELETE FROM market_identity_candidate_receipts WHERE operation_id=?',next.operation_id));
  await assert.rejects(propose(db,input(a,b,4050)),conflict);
  assert.equal(await count(db,'market_identity_candidates'),2);assert.equal(await count(db,'market_identity_candidate_receipts'),2);
});

test('superseded receipt is rejected even if its evidence versions did not change',async()=>{
  const db=setupDb();await seed(db);const a=await observation(db,49),b=await observation(db,50,{source:'source-b'});
  const original=input(a,b,4052),first=await propose(db,original);
  const next={...input(a,b,4053,'manual_review'),supersedes_candidate_id:first.candidate_id};
  const batch=db.batch.bind(db);let inject=true;
  db.batch=async stmts=>{const result=await batch(stmts);if(inject){inject=false;result.at(-2).results=[];}return result;};
  await assert.rejects(propose(db,next),/receipt missing/i);
  const second=await propose(db,next);assert.notEqual(first.candidate_id,second.candidate_id);
  await assert.rejects(propose(db,original),conflict);
  assert.equal(await count(db,'market_identity_candidates'),2);assert.equal(await count(db,'market_identity_candidate_receipts'),2);
});
