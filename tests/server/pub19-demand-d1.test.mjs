import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync,readdirSync } from 'node:fs';
import { generateDemandDraft,readDemandDraft,markDemandPageReviewed,approveDemandDraft,publishDemandDraft,revokeDemandDraft,currentPublicDemand,prunePrivateDemandMatrices } from '../../server/public-demand.js';
const require=createRequire(import.meta.url), {Miniflare,convertV4MiniflareOptions}=require('miniflare'), {unstable_splitSqlQuery}=require('wrangler');
const authId='a0000000-0000-4000-8000-000000000001';

test('D1 synthetic: release needs independent authority, respects ledger and closes on revocation',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'pub19-synthetic'}}));
 try {
  const db=await mf.getD1Database('DB'),dir=new URL('../../migrations/',import.meta.url);
  for(const n of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(readFileSync(new URL(n,dir),'utf8')).map(q=>db.prepare(q)));
  await db.batch(unstable_splitSqlQuery(readFileSync(new URL('../../server/proposed-schema/public-demand.sql',import.meta.url),'utf8')).map(q=>db.prepare(q)));
  await db.prepare("INSERT INTO admins(email,added_by,added_at) VALUES('admin@example.test','fixture','2026-01-01T00:00:00.000Z')").run();
  for(let i=1;i<=21;i++) {
   await db.prepare("INSERT INTO contacts(id,name,email,phone,last_activity_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(i,`Synthetic ${i}`,`fixture${i}@example.test`,`+44770090000${i}`,'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z').run();
   if(i<=20) await db.prepare("INSERT INTO applicants(contact_id,operation,parishes_wanted,bedrooms_min,stage,source,created_at,updated_at) VALUES(?,'rent','[\"St Helier\"]',2,'searching','phone','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')").bind(i).run();
  }
  const env={DB:db,DEMAND_INTERNAL_READY:'1',PUBLIC_DEMAND_READY:'1',PUBLIC_DEMAND_POLICY_VERSION:'fixture-v1'}, actor='admin@example.test';
  const created=await generateDemandDraft(env,{operation:'rent',operation_id:'b0000000-0000-4000-8000-000000000001'},actor), draft=await readDemandDraft(env,created.id,0,actor);
  assert.equal(draft.cells[0].count,20); assert.equal(JSON.stringify(draft).includes('contact_ids'),false);
  await assert.rejects(()=>approveDemandDraft(env,{id:created.id,version:1,authorization_id:authId},actor));
  assert.deepEqual(await currentPublicDemand(env),{status:'not_available'});
  const state=await db.prepare('SELECT * FROM public_demand_release_state WHERE id=1').first();
  await db.prepare(`INSERT INTO demand_release_authorizations VALUES(?,?,?,?,?,1,'accepted','fixture-evidence','fixture-reviewer','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z',NULL)`).bind(authId,'fixture-v1',draft.public_sha256,state.releases_sha256,0).run();
  await assert.rejects(()=>approveDemandDraft(env,{id:created.id,version:1,authorization_id:authId},actor));
  await markDemandPageReviewed(env,{id:created.id,version:1,after:0},actor);
  const approved=await approveDemandDraft(env,{id:created.id,version:1,authorization_id:authId},actor); assert.equal(approved.version,2);
  const published=await publishDemandDraft(env,{id:created.id,version:2},actor); assert.equal(published.version,3);
  const now=await currentPublicDemand(env);assert.equal(now.status,'available');assert.deepEqual(now.snapshots[0].cells,[{parish:'St Helier',bedroom_band:'2',display_count:20}]);
  assert.equal(JSON.stringify(now).includes('contact_ids'),false);
  await db.prepare("INSERT INTO applicants(contact_id,operation,parishes_wanted,bedrooms_min,stage,source,created_at,updated_at) VALUES(21,'rent','[\"St Helier\"]',2,'searching','phone','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')").run();
  const op='b0000000-0000-4000-8000-000000000002';
  const retries=await Promise.all([generateDemandDraft(env,{operation:'rent',operation_id:op},actor),generateDemandDraft(env,{operation:'rent',operation_id:op},actor)]);
  assert.equal(retries[0].id,op);assert.equal(retries[1].id,op);
  assert.equal((await readDemandDraft(env,op,0,actor)).cells[0].count,21);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM public_demand_contributions WHERE snapshot_id=?').bind(op).first()).n,21);
  const different=await Promise.allSettled([generateDemandDraft(env,{operation:'rent',operation_id:'b0000000-0000-4000-8000-000000000003'},actor)]);
  assert.equal(different[0].status,'rejected');
  await db.prepare('DELETE FROM applicants WHERE contact_id=?').bind(1).run();
  await db.prepare('DELETE FROM contacts WHERE id=?').bind(1).run();
  const deleted=await db.prepare('SELECT status,private_payload FROM public_demand_snapshots WHERE id=?').bind(op).first();
  assert.equal(deleted.status,'revoked');assert.equal(deleted.private_payload,null);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM public_demand_contributions WHERE snapshot_id=?').bind(op).first()).n,0);
  await assert.rejects(()=>approveDemandDraft(env,{id:op,version:1,authorization_id:authId},actor));
  await db.prepare('UPDATE demand_release_authorizations SET revoked_at=? WHERE id=?').bind('2026-01-01T00:00:00.000Z',authId).run();
  assert.deepEqual(await currentPublicDemand(env),{status:'not_available'});
  await db.prepare("UPDATE public_demand_snapshots SET as_of='2000-01-01T00:00:00.000Z' WHERE id=?").bind(created.id).run();
  await prunePrivateDemandMatrices(env);assert.equal((await db.prepare('SELECT private_payload FROM public_demand_snapshots WHERE id=?').bind(created.id).first()).private_payload,null);

  const prepare=async(operation,id,authorization)=>{
    const currentState=await db.prepare('SELECT * FROM public_demand_release_state WHERE id=1').first();
    await generateDemandDraft(env,{operation,operation_id:id},actor);
    const d=await readDemandDraft(env,id,0,actor);
    await db.prepare(`INSERT INTO demand_release_authorizations VALUES(?,?,?,?,?,1,'accepted','fixture-evidence','fixture-reviewer','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z',NULL)`).bind(authorization,'fixture-v1',d.public_sha256,currentState.releases_sha256,currentState.ledger_version).run();
    await markDemandPageReviewed(env,{id,version:1,after:0},actor);
    await approveDemandDraft(env,{id,version:1,authorization_id:authorization},actor);
  };
  const rentId='c0000000-0000-4000-8000-000000000001', buyId='c0000000-0000-4000-8000-000000000002';
  await prepare('rent',rentId,'d0000000-0000-4000-8000-000000000001');
  await prepare('buy',buyId,'d0000000-0000-4000-8000-000000000002');
  const race=await Promise.allSettled([publishDemandDraft(env,{id:rentId,version:2},actor),publishDemandDraft(env,{id:buyId,version:2},actor)]);
  assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(race.filter(x=>x.status==='rejected').length,1);
  const loser=race[0].status==='rejected'?rentId:buyId, loserOperation=loser===rentId?'rent':'buy';
  await revokeDemandDraft(env,{id:loser,version:2},actor);
  const rollbackId='c0000000-0000-4000-8000-000000000003', rollbackAuth='d0000000-0000-4000-8000-000000000003';
  await prepare(loserOperation,rollbackId,rollbackAuth);
  const before=await db.prepare('SELECT * FROM public_demand_release_state WHERE id=1').first();
  await db.prepare("CREATE TRIGGER fail_release_fixture BEFORE INSERT ON public_demand_releases BEGIN SELECT RAISE(ABORT,'fixture failure'); END").run();
  await assert.rejects(()=>publishDemandDraft(env,{id:rollbackId,version:2},actor));
  const after=await db.prepare('SELECT * FROM public_demand_release_state WHERE id=1').first();
  assert.deepEqual(after,before);assert.equal((await db.prepare('SELECT status FROM public_demand_snapshots WHERE id=?').bind(rollbackId).first()).status,'approved');
  await db.prepare('DROP TRIGGER fail_release_fixture').run();
  await Promise.allSettled([publishDemandDraft(env,{id:rollbackId,version:2},actor),db.prepare('UPDATE demand_release_authorizations SET revoked_at=? WHERE id=?').bind('2026-01-01T00:00:00.000Z',rollbackAuth).run()]);
  const visible=await currentPublicDemand(env);
  assert.ok(!visible.snapshots || visible.snapshots.every(s=>s.id!==rollbackId));

  await db.prepare("INSERT INTO admins(email,added_by,added_at) VALUES('colleague@example.test','fixture','2026-01-01T00:00:00.000Z')").run();
  const target=await db.prepare('SELECT id FROM applicants WHERE contact_id=2').first();
  let interposed=false;
  const racingDB={prepare:sql=>db.prepare(sql),batch:async stmts=>{
    const result=await db.batch(stmts);
    if(!interposed) {interposed=true;await db.prepare('DELETE FROM applicants WHERE id=?').bind(target.id).run();}
    return result;
  }};
  const raceId='c0000000-0000-4000-8000-000000000004';
  await assert.rejects(()=>generateDemandDraft({...env,DB:racingDB},{operation:'rent',operation_id:raceId},'colleague@example.test'));
  assert.equal(await db.prepare('SELECT id FROM public_demand_snapshots WHERE id=?').bind(raceId).first(),null);


  const multiId='c0000000-0000-4000-8000-000000000005', multiAuth='d0000000-0000-4000-8000-000000000005', colleague='colleague@example.test';
  await generateDemandDraft(env,{operation:'buy',operation_id:multiId},colleague);
  const cells=Array.from({length:51},(_,i)=>({parish:'Fixture '+i,bedroom_band:'2',count:1}));
  await db.prepare('UPDATE public_demand_snapshots SET private_payload=? WHERE id=?').bind(JSON.stringify({cells,quality:{identity_verified:false}}),multiId).run();
  const page0=await readDemandDraft(env,multiId,0,colleague),page1=await readDemandDraft(env,multiId,50,colleague);
  assert.equal(page0.cells.length,50);assert.equal(page0.next,50);assert.equal(page1.cells.length,1);
  const multiState=await db.prepare('SELECT * FROM public_demand_release_state WHERE id=1').first();
  await db.prepare(`INSERT INTO demand_release_authorizations VALUES(?,?,?,?,?,1,'accepted','fixture-evidence','fixture-reviewer','2000-01-01T00:00:00.000Z','2999-01-01T00:00:00.000Z',NULL)`).bind(multiAuth,'fixture-v1',page0.public_sha256,multiState.releases_sha256,multiState.ledger_version).run();
  await markDemandPageReviewed(env,{id:multiId,version:1,after:0},colleague);
  await assert.rejects(()=>approveDemandDraft(env,{id:multiId,version:1,authorization_id:multiAuth},colleague));
  await markDemandPageReviewed(env,{id:multiId,version:1,after:50},colleague);
  assert.equal((await approveDemandDraft(env,{id:multiId,version:1,authorization_id:multiAuth},colleague)).status,'approved');

  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);

 } finally { await mf.dispose(); }
});
