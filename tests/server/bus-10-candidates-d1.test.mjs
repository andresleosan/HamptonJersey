import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { proposePropertyIdentityCore, resolvePropertyIdentityCore } from '../../server/internal/market-identity-core.js';

const require=createRequire(import.meta.url),at='2026-11-13T12:00:00.000Z',actor='admin@example.test',clock=()=>new Date(at);
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const count=async(db,table)=>(await one(db,`SELECT count(*) AS n FROM ${table}`)).n;
async function seed(db) {
  await run(db,'INSERT INTO admins(email,added_at) VALUES(?,?)',actor,at);
  await run(db,`INSERT INTO market_directory_manifests(revision,sha256,accepted_at,reviewer_ref,status)
    VALUES('synthetic',?,?,'synthetic-review','accepted')`,'a'.repeat(64),at);
  for(const source of ['source-a','source-b'])await run(db,`INSERT INTO market_sources
    (source_ref,channel_id,directory_revision,source_kind,source_class,access_status,method,policy_version,
    evidence_ref,retention_ref,reviewed_at,review_due_at) VALUES(?,'site','synthetic','external','general','allowed',
    'manual',1,'evidence','retention',?,?)`,source,'2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z');
  await run(db,`INSERT INTO market_runs(id,kind,manifest_revision,manifest_sha256,operation_id,created_at,created_by)
    VALUES(?,'initial','synthetic',?,?,?,'synthetic')`,uid(100),'a'.repeat(64),uid(101),at);
}
async function observation(db,n,source) {
  const page=uid(1000+n),obs=uid(2000+n);
  await run(db,`INSERT INTO market_pages(id,run_id,source_ref,channel_id,page_key,content_sha256,exhausted,
    observed_at,committed_at,committed_by,lease_token,lease_generation,policy_version)
    VALUES(?,?,?,'site',?,?,1,?,?,'synthetic','synthetic',1,1)`,page,uid(100),source,`page-${n}`,'b'.repeat(64),at,at);
  const json=JSON.stringify({country_code:'JE',territory_evidence:'synthetic',operation:'sale',observed_at:at,
    fields:{title:'Synthetic building'}});
  await run(db,`INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,normalized_json,
    normalized_sha256,source_at,origin_sha256) VALUES(?,?,?,'site',?,'{}',?,?,?,?)`,obs,page,source,`key-${n}`,
    json,'c'.repeat(64),at,'d'.repeat(64));
  const identity=await resolvePropertyIdentityCore({DB:db},{observation_id:obs,operation_id:uid(3000+n)},actor,clock);
  return {obs,...identity};
}
const makeInput=(a,b,n)=>({left_property_id:a.property_id,right_property_id:b.property_id,
  left_evidence_observation_id:a.obs,right_evidence_observation_id:b.obs,expected_left_version:1,expected_right_version:1,
  expected_left_evidence_revision:1,expected_right_evidence_revision:1,signal:'shared_address',operation_id:uid(n)});
const propose=(db,x)=>proposePropertyIdentityCore({DB:db},x,actor,clock);

test('isolated local D1: candidate concurrency, revocation, rollback and post-commit retry',async()=>{
  const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'bus10-candidate-synthetic'}}));
  try {
    const db=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const file of readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(file,dir),'utf8')).map(sql=>db.prepare(sql)));
    const proposed=readFileSync(new URL('../../docs/roadmap/work/BUS-10/candidate-schema-proposal.sql',import.meta.url),'utf8');
    await db.batch(unstable_splitSqlQuery(proposed).map(sql=>db.prepare(sql)));
    await seed(db);
    const a=await observation(db,1,'source-a'),b=await observation(db,2,'source-b'),x=makeInput(a,b,4001);
    const [first,second]=await Promise.all([propose(db,x),propose(db,{...x,operation_id:uid(4002)})]);
    assert.equal(first.candidate_id,second.candidate_id);assert.equal(await count(db,'market_identity_candidates'),1);
    assert.equal(await count(db,'market_identity_candidate_receipts'),2);
    assert.equal(await count(db,'market_identity_aliases'),0);assert.equal(await count(db,'market_identity_decisions'),0);
    const c=await observation(db,3,'source-a'),d=await observation(db,4,'source-b');
    let inject=true;
    const lost={prepare:db.prepare.bind(db),batch:async statements=>{
      const out=await db.batch(statements);
      if(inject){inject=false;return out.map((row,i)=>i===out.length-2?{...row,results:[]}:row);}return out;
    }};
    const y=makeInput(c,d,4003);
    await assert.rejects(propose(lost,y),/receipt missing/i);
    assert.equal((await propose(db,y)).status,'pending_review');
    assert.equal(await count(db,'market_identity_candidates'),2);assert.equal(await count(db,'market_identity_candidate_receipts'),3);
    const next={...makeInput(a,b,4010),signal:'manual_review',supersedes_candidate_id:first.candidate_id};
    const concurrent=await Promise.allSettled([propose(db,next),
      propose(db,{...next,operation_id:uid(4011),signal:'shared_reference'})]);
    assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(concurrent.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
    const current=concurrent.find(r=>r.status==='fulfilled').value;
    await assert.rejects(propose(db,x),err=>err.status===409);
    await assert.rejects(run(db,'DELETE FROM market_identity_candidates WHERE id=?',current.candidate_id));
    assert.equal(await count(db,'market_identity_candidates'),3);assert.equal(await count(db,'market_identity_candidate_receipts'),4);
    const cols='id,left_property_id,right_property_id,left_evidence_observation_id,right_evidence_observation_id,expected_left_version,expected_right_version,expected_left_evidence_revision,expected_right_evidence_revision,signal,supersedes_candidate_id,created_at,created_by';
    const selection='left_property_id,right_property_id,left_evidence_observation_id,right_evidence_observation_id,expected_left_version,expected_right_version,expected_left_evidence_revision,expected_right_evidence_revision';
    for(const [replacement,source] of [[current.candidate_id,current.candidate_id],
      [uid(4991),first.candidate_id],[uid(4992),current.candidate_id]]) {
      await assert.rejects(run(db,`INSERT OR REPLACE INTO market_identity_candidates(${cols}) SELECT ?,${selection},'shared_reference',supersedes_candidate_id,created_at,created_by FROM market_identity_candidates WHERE id=?`,replacement,source),/identity candidate key already exists/);
    }
    await assert.rejects(run(db,`INSERT OR REPLACE INTO market_identity_candidate_receipts(operation_id,candidate_id,actor,actor_added_at,created_at)
      SELECT operation_id,candidate_id,'attacker@example.test',actor_added_at,created_at FROM market_identity_candidate_receipts WHERE candidate_id=?`,current.candidate_id),/identity candidate receipt key already exists/);
    assert.equal(await count(db,'market_identity_candidates'),3);assert.equal(await count(db,'market_identity_candidate_receipts'),4);
    const e=await observation(db,5,'source-a'),f=await observation(db,6,'source-b');
    const recordedSql=new WeakMap();
    const rollback={prepare:sql=>{const stmt=db.prepare(sql);return {bind(...args){
      const bound=stmt.bind(...args);recordedSql.set(bound,sql);return bound;
    }};},batch:statements=>{
      const i=statements.findIndex(s=>recordedSql.get(s)?.includes('INSERT INTO market_identity_candidates'));
      assert.ok(i>=0,'the injected failure follows the candidate insert');
      return db.batch([...statements.slice(0,i+1),db.prepare("INSERT INTO market_commit_guard(id,allowed) VALUES('synthetic-failure',0)"),...statements.slice(i+1)]);
    }};
    await assert.rejects(propose(rollback,makeInput(e,f,4004)),err=>err.status===409);
    assert.equal(await count(db,'market_identity_candidates'),3);assert.equal(await count(db,'market_identity_candidate_receipts'),4);
    const revoked={prepare:db.prepare.bind(db),batch:async statements=>{
      await run(db,"UPDATE market_sources SET access_status='denied',policy_version=policy_version+1 WHERE source_ref='source-b'");
      return db.batch(statements);
    }};
    await assert.rejects(propose(revoked,makeInput(e,f,4005)),err=>err.status===409);
    assert.equal(await count(db,'market_identity_candidates'),3);assert.equal(await count(db,'market_identity_candidate_receipts'),4);
    const fk=await db.prepare('PRAGMA foreign_key_check').all();assert.deepEqual(fk.results,[]);
  } finally { await mf.dispose(); }
});
