import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { makeDb } from './helpers.mjs';

import * as publicIdentity from '../../server/market-identity.js';
let identity;
try { identity = await import('../../server/internal/market-identity-core.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const needIdentity = () => assert.ok(identity, 'BUS-10 identity service is not implemented yet');
const at = '2026-11-13T12:00:00.000Z';
const actor = 'admin@example.test';
const clock = () => new Date(at);
const op = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const exec = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const one = (db, sql, ...args) => db.prepare(sql).bind(...args).first();

async function seed(db) {
  await exec(db, `INSERT INTO market_directory_manifests(revision,sha256,accepted_at,reviewer_ref,status)
    VALUES('fixture-manifest',? ,?,'fixture-review','accepted')`, 'a'.repeat(64), at);
  for (const source of ['source-a','source-b','source-c']) {
    await exec(db, `INSERT INTO market_sources(source_ref,channel_id,directory_revision,source_kind,source_class,
      access_status,method,policy_version,evidence_ref,retention_ref,reviewed_at,review_due_at)
      VALUES(?,'site','fixture-manifest','external','general','allowed','manual',1,'evidence','retention',?,?)`,
      source, '2000-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z');
  }
  await exec(db, `INSERT INTO market_runs(id,kind,manifest_revision,manifest_sha256,operation_id,created_at,created_by)
    VALUES(?,'initial','fixture-manifest',?,?,?,'fixture')`, op(100), 'a'.repeat(64), op(101), at);
}
async function observation(db, { n, source='source-a', key='fixture-key', operation='sale', unit='one', country='JE' }) {
  const page=op(1000+n), id=op(2000+n);
  await exec(db, `INSERT INTO market_pages(id,run_id,source_ref,channel_id,page_key,content_sha256,
    exhausted,observed_at,committed_at,committed_by,lease_token,lease_generation,policy_version)
    VALUES(?,?,?,'site',?,?,1,?,?,'fixture','fixture',1,1)`,page,op(100),source,`page-${n}`,'b'.repeat(64),at,at);
  const normalized={country_code:country,territory_evidence:'fixture-scope',operation,observed_at:at,
    fields:{title:'Same building',parish:'Fixture parish'},unit};
  await exec(db, `INSERT INTO market_observations(id,page_id,source_ref,channel_id,external_key,raw_json,
    normalized_json,normalized_sha256,source_at,origin_sha256) VALUES(?,?,?,'site',?,'{}',?,?,?,?)`,
    id,page,source,key,JSON.stringify(normalized),'c'.repeat(64),at,'d'.repeat(64));
  return id;
}
const resolve = (db, observation_id, operation_id, who=actor) =>
  identity.resolvePropertyIdentityCore({DB:db},{observation_id,operation_id},who,clock);
const count = async (db, table) => (await one(db,`SELECT count(*) AS n FROM ${table}`)).n;

test('repeated observations of one publication remain physically provisional without unit evidence', async () => {
  needIdentity(); const db=makeDb();await seed(db);
  const first=await observation(db,{n:1}),second=await observation(db,{n:2});
  const a=await resolve(db,first,op(1)),b=await resolve(db,second,op(2));
  assert.notEqual(a.property_id,b.property_id);assert.equal(a.publication_id,b.publication_id);
  assert.equal(await count(db,'market_properties'),2);assert.equal(await count(db,'market_listings'),1);
  assert.equal(await count(db,'market_identity_observations'),2);assert.equal(await count(db,'market_observations'),2);
});

test('same address or an identical unscoped reference does not merge different units or sources', async () => {
  needIdentity(); const db=makeDb();await seed(db);
  const a=await resolve(db,await observation(db,{n:3,key:'flat-1',unit:'one'}),op(3));
  const b=await resolve(db,await observation(db,{n:4,key:'flat-2',unit:'two'}),op(4));
  const c=await resolve(db,await observation(db,{n:5,source:'source-b',key:'flat-1',unit:'one'}),op(5));
  assert.equal(new Set([a.property_id,b.property_id,c.property_id]).size,3);
  assert.equal(await count(db,'market_properties'),3);
});

test('one reference reused for different units never merges physical identities', async () => {
  needIdentity(); const db=makeDb();await seed(db);
  const a=await resolve(db,await observation(db,{n:19,key:'building',unit:'one'}),op(19));
  const b=await resolve(db,await observation(db,{n:20,key:'building',unit:'two'}),op(20));
  assert.notEqual(a.property_id,b.property_id);
  assert.equal(await count(db,'market_properties'),2);
});

test('same source reference for sale and rent never combines operations without a review', async () => {
  needIdentity(); const db=makeDb();await seed(db);
  const a=await resolve(db,await observation(db,{n:6,operation:'sale'}),op(6));
  const b=await resolve(db,await observation(db,{n:7,operation:'rent'}),op(7));
  assert.notEqual(a.publication_id,b.publication_id);assert.notEqual(a.property_id,b.property_id);
  assert.equal(await count(db,'market_listings'),2);
});

test('replayed operation is idempotent but cannot be reused for another observation', async () => {
  needIdentity(); const db=makeDb();await seed(db);
  const a=await observation(db,{n:8}),b=await observation(db,{n:9,key:'other'});
  const first=await resolve(db,a,op(8));assert.deepEqual(await resolve(db,a,op(8)),first);
  await assert.rejects(resolve(db,b,op(8)),error=>error.status===409);
  assert.equal(await count(db,'market_properties'),1);assert.equal(await count(db,'market_identity_observations'),1);
});

test('multiple operations on the same observation reuse its provisional identity', async () => {
  needIdentity(); const db=makeDb();await seed(db);const id=await observation(db,{n:21});
  const [a,b]=await Promise.all([resolve(db,id,op(21)),resolve(db,id,op(22))]);
  assert.equal(a.property_id,b.property_id);assert.equal(a.publication_id,b.publication_id);
  assert.equal(await count(db,'market_properties'),1);assert.equal(await count(db,'market_identity_observations'),1);
});

test('revoking source permission immediately before commit leaves no identity or receipt', async () => {
  needIdentity(); const db=makeDb();await seed(db);const observationId=await observation(db,{n:10});
  const original=db.batch.bind(db);let changed=false;
  db.batch=stmts=>{if(!changed){changed=true;db.raw.prepare("UPDATE market_sources SET access_status='denied',policy_version=policy_version+1 WHERE source_ref='source-a'").run();}return original(stmts);};
  await assert.rejects(resolve(db,observationId,op(10)),error=>error.status===409);
  assert.equal(await count(db,'market_properties'),0);assert.equal(await count(db,'market_identity_receipts'),0);
});

test('a revoked staff actor cannot create or replay an identity', async () => {
  needIdentity(); const db=makeDb();await seed(db);const observationId=await observation(db,{n:11});
  await resolve(db,observationId,op(11));db.raw.prepare('DELETE FROM admins WHERE email=?').run(actor);
  await assert.rejects(resolve(db,observationId,op(11)),error=>error.status===409);
  await assert.rejects(resolve(db,observationId,op(12)),error=>error.status===409);
  assert.equal(await count(db,'market_identity_receipts'),1);
});

test('a tombstoned source key or non-Jersey observation cannot be resurrected', async () => {
  needIdentity(); const db=makeDb();await seed(db);
  const old=await observation(db,{n:12}),newer=await observation(db,{n:13});
  db.raw.prepare('UPDATE market_observations SET deleted_tombstone=1 WHERE id=?').run(old);
  await assert.rejects(resolve(db,newer,op(13)),error=>error.status===409);
  const outside=await observation(db,{n:14,key:'outside',country:'GB'});
  await assert.rejects(resolve(db,outside,op(14)),error=>[400,409].includes(error.status));
  assert.equal(await count(db,'market_properties'),0);
});

test('concurrent observations share the scoped publication but not a physical identity', async () => {
  needIdentity(); const db=makeDb();await seed(db);
  const a=await observation(db,{n:15}),b=await observation(db,{n:16});
  const results=await Promise.all([resolve(db,a,op(15)),resolve(db,b,op(16))]);
  assert.notEqual(results[0].property_id,results[1].property_id);
  assert.equal(results[0].publication_id,results[1].publication_id);
  assert.equal(await count(db,'market_properties'),2);assert.equal(await count(db,'market_listings'),1);
  assert.equal(await count(db,'market_identity_observations'),2);
});

test('local D1 preserves provisional identities and foreign keys during concurrent observations', async () => {
  needIdentity(); const require=createRequire(import.meta.url);
  const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
  const {unstable_splitSqlQuery}=require('wrangler');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'bus10-synthetic'}}));
  try {
    const db=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
    for(const file of readdirSync(dir).filter(x=>x.endsWith('.sql')).sort())
      await db.batch(unstable_splitSqlQuery(readFileSync(new URL(file,dir),'utf8')).map(sql=>db.prepare(sql)));
    await exec(db,'INSERT INTO admins(email,added_at) VALUES(?,?)',actor,at);await seed(db);
    const a=await observation(db,{n:17}),b=await observation(db,{n:18});
    const results=await Promise.all([resolve(db,a,op(17)),resolve(db,b,op(18))]);
    assert.notEqual(results[0].property_id,results[1].property_id);
    assert.equal(results[0].publication_id,results[1].publication_id);
    assert.equal(await count(db,'market_properties'),2);assert.equal(await count(db,'market_identity_observations'),2);
    const rollbackDb={prepare:db.prepare.bind(db),batch:stmts=>db.batch([
      ...stmts.slice(0,4),db.prepare("INSERT INTO market_commit_guard(id,allowed) VALUES ('synthetic-rollback',0)"),
      ...stmts.slice(4)])};
    await assert.rejects(merge(rollbackDb,mergeInput(results[0],results[1],a,b,op(26))),e=>e.status===409);
    assert.equal(await count(db,'market_identity_aliases'),0);assert.equal(await count(db,'market_identity_decisions'),0);
    assert.equal((await one(db,'SELECT version FROM market_properties WHERE id=?',results[0].property_id)).version,1);
    const c=await observation(db,{n:22,source:'source-b'}),z=await resolve(db,c,op(23));
    const inputs=[mergeInput(results[0],results[1],a,b,op(24)),mergeInput(z,results[1],c,b,op(25))];
    const decisions=await Promise.allSettled(inputs.map(input=>merge(db,input)));
    assert.equal(decisions.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(decisions.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
    assert.equal(await count(db,'market_identity_aliases'),1);assert.equal(await count(db,'market_identity_decisions'),1);
    const winner=decisions.findIndex(x=>x.status==='fulfilled'),decision=decisions[winner].value;
    assert.deepEqual(await merge(db,inputs[winner]),decision);
    assert.equal((await readIdentity(db,inputs[winner].source_property_id)).root_property_id,results[1].property_id);
    const undoInput={decision_id:decision.decision_id,expected_source_version:2,expected_target_version:2,operation_id:op(27)};
    const undone=await undo(db,undoInput);assert.deepEqual(await undo(db,undoInput),undone);
    assert.equal((await readIdentity(db,inputs[winner].source_property_id)).root_property_id,inputs[winner].source_property_id);
    assert.equal(await count(db,'market_identity_aliases'),0);assert.equal(await count(db,'market_identity_decisions'),2);
    const before={properties:await count(db,'market_properties'),publications:await count(db,'market_listings'),
      links:await count(db,'market_identity_observations'),receipts:await count(db,'market_identity_receipts')};
    await exec(db,"UPDATE market_observations SET normalized_json=json_set(normalized_json,'$.operation','rent'), normalized_sha256=?, revision=revision+1 WHERE id=?",'7'.repeat(64),a);
    await assert.rejects(resolve(db,a,op(17)),e=>e.status===409);
    await assert.rejects(resolve(db,a,op(109)),e=>e.status===409);
    await assert.rejects(resolve(db,b,op(110)),e=>e.status===409);
    const secondSale=await observation(db,{n:66,operation:'sale'});
    await assert.rejects(resolve(db,secondSale,op(111)),e=>e.status===409);
    const after={properties:await count(db,'market_properties'),publications:await count(db,'market_listings'),
      links:await count(db,'market_identity_observations'),receipts:await count(db,'market_identity_receipts')};
    assert.deepEqual(after,before);assert.equal(await count(db,'market_commit_guard'),0);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  } finally { await mf.dispose(); }
});

const merge = (db, input, who=actor) => identity.mergePropertyIdentitiesCore({DB:db},input,who,clock);
const undo = (db, input, who=actor) => identity.undoPropertyIdentityDecisionCore({DB:db},input,who,clock);
const readIdentity = (db, property_id, who=actor) => identity.readPropertyIdentityCore({DB:db},{property_id},who,clock);
const mergeInput = (source,target,sourceObs,targetObs,operation_id,sourceVersion=1,targetVersion=1) => ({
  source_property_id:source.property_id,target_property_id:target.property_id,
  source_evidence_observation_id:sourceObs,target_evidence_observation_id:targetObs,
  expected_source_version:sourceVersion,expected_target_version:targetVersion,operation_id,
});

test('explicit review links three publications and undo restores identities without rewriting observations', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const obs=[];for(let n=30;n<33;n++)obs.push(await observation(db,{n,source:['source-a','source-b','source-c'][n-30]}));
  const props=[];for(let i=0;i<3;i++)props.push(await resolve(db,obs[i],op(30+i)));
  const first=await merge(db,mergeInput(props[0],props[1],obs[0],obs[1],op(40)));
  const second=await merge(db,mergeInput(props[1],props[2],obs[1],obs[2],op(41),2,1));
  for(const property of props) assert.equal((await readIdentity(db,property.property_id)).root_property_id,props[2].property_id);
  await undo(db,{decision_id:second.decision_id,expected_source_version:3,expected_target_version:2,operation_id:op(42)});
  assert.equal((await readIdentity(db,props[0].property_id)).root_property_id,props[1].property_id);
  assert.equal((await readIdentity(db,props[2].property_id)).root_property_id,props[2].property_id);
  await undo(db,{decision_id:first.decision_id,expected_source_version:2,expected_target_version:4,operation_id:op(43)});
  for(const property of props) assert.equal((await readIdentity(db,property.property_id)).root_property_id,property.property_id);
  assert.equal(await count(db,'market_identity_decisions'),4);assert.equal(await count(db,'market_listings'),3);
  assert.equal(await count(db,'market_observations'),3);assert.equal(await count(db,'market_identity_observations'),3);
});

test('manual identity decisions are idempotent and cannot be reused for a different request', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:33}),b=await observation(db,{n:34,source:'source-b'});
  const x=await resolve(db,a,op(44)),y=await resolve(db,b,op(45));const input=mergeInput(x,y,a,b,op(46));
  const first=await merge(db,input);assert.deepEqual(await merge(db,input),first);
  await assert.rejects(merge(db,{...input,source_evidence_observation_id:b}),e=>e.status===409);
  assert.equal(await count(db,'market_identity_decisions'),1);assert.equal(await count(db,'market_identity_aliases'),1);
});

test('concurrent staff decisions conflict atomically and cannot create alias cycles', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const obs=[];for(let n=35;n<38;n++)obs.push(await observation(db,{n,source:['source-a','source-b','source-c'][n-35]}));
  const p=[];for(let i=0;i<3;i++)p.push(await resolve(db,obs[i],op(50+i)));
  const outcomes=await Promise.allSettled([merge(db,mergeInput(p[0],p[1],obs[0],obs[1],op(53))),
    merge(db,mergeInput(p[2],p[1],obs[2],obs[1],op(54)))]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
  const winner=outcomes[0].status==='fulfilled'?0:2;
  await assert.rejects(merge(db,mergeInput(p[1],p[winner],obs[1],obs[winner],op(55),2,2)),e=>e.status===409);
  assert.equal(await count(db,'market_identity_aliases'),1);assert.equal(await count(db,'market_identity_decisions'),1);
});

test('a human decision requires evidence from both property groups', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:38}),b=await observation(db,{n:39,source:'source-b'});
  const x=await resolve(db,a,op(56)),y=await resolve(db,b,op(57));
  await assert.rejects(merge(db,mergeInput(x,y,a,a,op(58))),e=>e.status===409);
  assert.equal(await count(db,'market_identity_decisions'),0);assert.equal(await count(db,'market_identity_aliases'),0);
});

test('source revocation between review and commit aborts the whole human decision', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:40}),b=await observation(db,{n:41,source:'source-b'});
  const x=await resolve(db,a,op(59)),y=await resolve(db,b,op(60));
  const original=db.batch.bind(db);let changed=false;
  db.batch=stmts=>{if(!changed){changed=true;db.raw.prepare("UPDATE market_sources SET access_status='denied',policy_version=policy_version+1 WHERE source_ref='source-b'").run();}return original(stmts);};
  await assert.rejects(merge(db,mergeInput(x,y,a,b,op(61))),e=>e.status===409);
  assert.equal(await count(db,'market_identity_decisions'),0);assert.equal(await count(db,'market_identity_aliases'),0);
  assert.equal((await one(db,'SELECT version FROM market_properties WHERE id=?',x.property_id)).version,1);
});

test('reads and undo fail closed after source access or staff membership is revoked', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:42}),b=await observation(db,{n:43,source:'source-b'});
  const x=await resolve(db,a,op(62)),y=await resolve(db,b,op(63));
  const decision=await merge(db,mergeInput(x,y,a,b,op(64)));
  await exec(db,"UPDATE market_sources SET access_status='denied',policy_version=policy_version+1 WHERE source_ref='source-b'");
  await assert.rejects(readIdentity(db,x.property_id),e=>e.status===409);
  await assert.rejects(undo(db,{decision_id:decision.decision_id,expected_source_version:2,expected_target_version:2,operation_id:op(65)}),e=>e.status===409);
  db.raw.prepare('DELETE FROM admins WHERE email=?').run(actor);
  await assert.rejects(merge(db,mergeInput(x,y,a,b,op(64))),e=>e.status===409);
  assert.equal(await count(db,'market_identity_decisions'),1);
});


test('changing evidence during a decision is detected even without a revision bump', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:44}),b=await observation(db,{n:45,source:'source-b'});
  const x=await resolve(db,a,op(66)),y=await resolve(db,b,op(67));
  const original=db.batch.bind(db);let changed=false;
  db.batch=stmts=>{if(!changed){changed=true;db.raw.prepare("UPDATE market_observations SET raw_json=? WHERE id=?").run('{\"fixture\":\"changed\"}',b);}return original(stmts);};
  await assert.rejects(merge(db,mergeInput(x,y,a,b,op(68))),e=>e.status===409);
  assert.equal(await count(db,'market_identity_decisions'),0);assert.equal(await count(db,'market_identity_aliases'),0);
});

test('a removed and newly added staff grant cannot replay an old decision', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:46}),b=await observation(db,{n:47,source:'source-b'});
  const x=await resolve(db,a,op(69)),y=await resolve(db,b,op(70)),input=mergeInput(x,y,a,b,op(71));
  await merge(db,input);await exec(db,'DELETE FROM admins WHERE email=?',actor);
  await exec(db,'INSERT INTO admins(email,added_at) VALUES(?,?)',actor,'2026-11-14T12:00:00.000Z');
  await assert.rejects(merge(db,input),e=>e.status===409);
  assert.equal(await count(db,'market_identity_decisions'),1);
});

test('simultaneous retries of the same human decision share one receipt', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:48}),b=await observation(db,{n:49,source:'source-b'});
  const x=await resolve(db,a,op(72)),y=await resolve(db,b,op(73)),input=mergeInput(x,y,a,b,op(74));
  const [first,second]=await Promise.all([merge(db,input),merge(db,input)]);
  assert.deepEqual(first,second);assert.equal(await count(db,'market_identity_decisions'),1);
  assert.equal(await count(db,'market_identity_aliases'),1);
});


test('simultaneous retries of an undo preserve one immutable undo event', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:50}),b=await observation(db,{n:51,source:'source-b'});
  const x=await resolve(db,a,op(75)),y=await resolve(db,b,op(76));
  const decision=await merge(db,mergeInput(x,y,a,b,op(77)));
  const input={decision_id:decision.decision_id,expected_source_version:2,expected_target_version:2,operation_id:op(78)};
  const [first,second]=await Promise.all([undo(db,input),undo(db,input)]);
  assert.deepEqual(first,second);assert.equal(await count(db,'market_identity_decisions'),2);
  assert.equal(await count(db,'market_identity_aliases'),0);
});


test('even a still-allowed source policy revision invalidates an in-flight decision', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:52}),b=await observation(db,{n:53,source:'source-b'});
  const x=await resolve(db,a,op(79)),y=await resolve(db,b,op(80));
  const original=db.batch.bind(db);let changed=false;
  db.batch=stmts=>{if(!changed){changed=true;db.raw.prepare("UPDATE market_sources SET policy_version=policy_version+1 WHERE source_ref='source-b'").run();}return original(stmts);};
  await assert.rejects(merge(db,mergeInput(x,y,a,b,op(81))),e=>e.status===409);
  assert.equal(await count(db,'market_identity_decisions'),0);assert.equal(await count(db,'market_identity_aliases'),0);
});

test('identity records do not copy source keys or raw and normalized observation content', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const marker='synthetic-private-marker';
  const a=await observation(db,{n:54,key:marker}),b=await observation(db,{n:55,source:'source-b',key:marker});
  const x=await resolve(db,a,op(82)),y=await resolve(db,b,op(83));
  await merge(db,mergeInput(x,y,a,b,op(84)));
  for(const table of ['market_properties','market_listings','market_identity_observations','market_identity_receipts','market_identity_decisions','market_identity_aliases']) {
    const data=(await db.prepare(`SELECT * FROM ${table}`).all()).results;
    assert.equal(JSON.stringify(data).includes(marker),false);
  }
});

test('publication provenance and observation links cannot be rewritten in place', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:56}),b=await observation(db,{n:57,source:'source-b'}),c=await observation(db,{n:58,source:'source-c'});
  const x=await resolve(db,a,op(85)),y=await resolve(db,b,op(86));
  await assert.rejects(async ()=>exec(db,'UPDATE market_listings SET anchor_observation_id=? WHERE id=?',c,x.publication_id));
  await assert.rejects(async ()=>exec(db,'UPDATE market_identity_observations SET publication_id=? WHERE observation_id=?',y.publication_id,a));
  assert.equal((await one(db,'SELECT anchor_observation_id FROM market_listings WHERE id=?',x.publication_id)).anchor_observation_id,a);
  assert.equal((await one(db,'SELECT publication_id FROM market_identity_observations WHERE observation_id=?',a)).publication_id,x.publication_id);
});

test('identity operations are unavailable by default until real authorization is integrated', async () => {
  needIdentity();const env={};
  const check=e=>e.status===503;
  await assert.rejects(publicIdentity.resolvePropertyIdentity(env,{observation_id:op(90),operation_id:op(91)},actor,clock),check);
  await assert.rejects(publicIdentity.mergePropertyIdentities(env,{source_property_id:op(92),target_property_id:op(93),
    source_evidence_observation_id:op(94),target_evidence_observation_id:op(95),expected_source_version:1,
    expected_target_version:1,operation_id:op(96)},actor,clock),check);
  await assert.rejects(publicIdentity.undoPropertyIdentityDecision(env,{decision_id:op(97),expected_source_version:1,
    expected_target_version:1,operation_id:op(98)},actor,clock),check);
  await assert.rejects(publicIdentity.readPropertyIdentity(env,{property_id:op(99)},actor,clock),check);
});

test('expired or malformed source review dates never authorize identity resolution', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const a=await observation(db,{n:59}),b=await observation(db,{n:60,source:'source-b'});
  await exec(db,"UPDATE market_sources SET review_due_at='2001-01-01T00:00:00.000Z',policy_version=policy_version+1 WHERE source_ref='source-a'");
  await exec(db,"UPDATE market_sources SET reviewed_at='!',review_due_at='z',policy_version=policy_version+1 WHERE source_ref='source-b'");
  await assert.rejects(resolve(db,a,op(87)),e=>e.status===409);
  await assert.rejects(resolve(db,b,op(88)),e=>e.status===409);
  assert.equal(await count(db,'market_properties'),0);assert.equal(await count(db,'market_identity_receipts'),0);
});

test('correcting the operation on a linked observation rejects new resolution without orphan publication or receipt', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const id=await observation(db,{n:61,operation:'sale'}),first=await resolve(db,id,op(102));
  await exec(db,"UPDATE market_observations SET normalized_json=json_set(normalized_json,'$.operation','rent'), normalized_sha256=?, revision=revision+1 WHERE id=?",'e'.repeat(64),id);
  await assert.rejects(resolve(db,id,op(103)),error=>error.status===409);
  assert.equal(await count(db,'market_listings'),1);assert.equal(await count(db,'market_properties'),1);
  assert.equal(await count(db,'market_identity_receipts'),1);assert.equal(await count(db,'market_identity_observations'),1);
  assert.equal(await count(db,'market_commit_guard'),0);
  assert.equal((await one(db,'SELECT operation FROM market_listings WHERE id=?',first.publication_id)).operation,'sale');
  assert.equal((await one(db,'SELECT publication_id FROM market_identity_observations WHERE observation_id=?',id)).publication_id,first.publication_id);
});

test('a prior receipt cannot be replayed after its observation changes operation', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const id=await observation(db,{n:62,operation:'sale'});await resolve(db,id,op(104));
  await exec(db,"UPDATE market_observations SET normalized_json=json_set(normalized_json,'$.operation','rent'), normalized_sha256=?, revision=revision+1 WHERE id=?",'f'.repeat(64),id);
  await assert.rejects(resolve(db,id,op(104)),error=>error.status===409);
  assert.equal(await count(db,'market_listings'),1);assert.equal(await count(db,'market_identity_receipts'),1);
});

test('a correction unrelated to operation retains the existing publication', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const id=await observation(db,{n:63,operation:'sale'}),first=await resolve(db,id,op(105));
  await exec(db,"UPDATE market_observations SET normalized_json=json_set(normalized_json,'$.fields.title','Corrected synthetic title'), normalized_sha256=?, revision=revision+1 WHERE id=?",'9'.repeat(64),id);
  const second=await resolve(db,id,op(106));
  assert.equal(second.property_id,first.property_id);assert.equal(second.publication_id,first.publication_id);
  assert.equal(await count(db,'market_listings'),1);assert.equal(await count(db,'market_identity_receipts'),2);
});

test('a changed anchor cannot silently attach another observation to the stale publication', async () => {
  needIdentity();const db=makeDb();await seed(db);
  const anchor=await observation(db,{n:64,operation:'sale'});await resolve(db,anchor,op(107));
  await exec(db,"UPDATE market_observations SET normalized_json=json_set(normalized_json,'$.operation','rent'), normalized_sha256=?, revision=revision+1 WHERE id=?",'8'.repeat(64),anchor);
  const second=await observation(db,{n:65,operation:'sale'});
  await assert.rejects(resolve(db,second,op(108)),error=>error.status===409);
  assert.equal(await count(db,'market_properties'),1);assert.equal(await count(db,'market_listings'),1);
  assert.equal(await count(db,'market_identity_observations'),1);assert.equal(await count(db,'market_identity_receipts'),1);
});
