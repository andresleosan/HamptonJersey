import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {inspectOperationPolicySnapshot,proposeOperationPolicyCAS,setOperationPolicy} from '../../server/operation-policy-store.js';

const ID='listing_text',OP='prepare_draft',KEY='aut10:operation:listing_text:prepare_draft';
const GEN='00000000-0000-4000-8000-000000000001',GEN2='00000000-0000-4000-8000-000000000002';
const TS='2026-11-13T00:00:00.000Z';
const row=(generation=GEN)=>JSON.stringify({schema:1,automation_id:ID,operation:OP,definition_version:1,mode:'Draft',revision:1,generation,params:{}});
const update=(db,candidate)=>db.prepare('UPDATE app_settings SET value=?,updated_at=?,updated_by=? WHERE key=? AND value=? AND updated_at=? AND updated_by IS ?')
  .bind(candidate.next_value,TS,'fixture',candidate.key,candidate.expected_value,TS,'fixture');
let mf,DB;
const read=()=>DB.prepare('SELECT value,updated_at,updated_by FROM app_settings WHERE key=?').bind(KEY).first();
async function reset(raw=row()){
  await DB.batch([DB.prepare('DELETE FROM app_settings WHERE key=?').bind(KEY),
    DB.prepare('INSERT INTO app_settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)').bind(KEY,raw,TS,'fixture')]);
}
before(async()=>{
  const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{unstable_splitSqlQuery}=require('wrangler');
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('fixture')}}",
    compatibilityDate:'2025-10-01',host:'127.0.0.1',port:0,d1Databases:{DB:'aut10-store-fixture'}}));
  DB=await mf.getD1Database('DB');
  const dir=new URL('../../migrations/',import.meta.url);
  for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())
    await DB.batch(unstable_splitSqlQuery(readFileSync(new URL(name,dir),'utf8')).map(sql=>DB.prepare(sql)));
  await DB.prepare('CREATE TABLE aut10_local_assertion(ok INTEGER NOT NULL CHECK(ok=1))').run();
});
after(async()=>{if(mf)await mf.dispose();});

test('local D1 no-op preserves the entire row and the unavailable writer never touches it',async()=>{
  await reset();const before=await read();
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Draft',1,GEN,before.value),{state:'no_change',allowed:false});
  await assert.rejects(setOperationPolicy({DB},{automation_id:ID,operation:OP,mode:'Auto',revision:1,params:{}},'fixture@example.test'),e=>e.status===503);
  assert.deepEqual(await read(),before);
});

test('local D1 compares the complete row bytes so concurrent candidates have at most one winner',async()=>{
  await reset();const initial=(await read()).value;
  const a=proposeOperationPolicyCAS(ID,OP,'Approve',1,GEN,initial),b=proposeOperationPolicyCAS(ID,OP,'Auto',1,GEN,initial);
  const results=await Promise.all([DB.batch([update(DB,a)]),DB.batch([update(DB,b)])]);
  assert.deepEqual(results.map(result=>result[0].meta.changes).sort(),[0,1]);
  const stored=inspectOperationPolicySnapshot(ID,OP,(await read()).value);
  assert.equal(stored.state,'candidate');assert.equal(stored.revision,2);assert.ok(['Approve','Auto'].includes(stored.mode));
  assert.equal(stored.allowed,false);
});

test('local D1 rolls back a successful CAS if a later assertion fails',async()=>{
  await reset();const before=await read(),candidate=proposeOperationPolicyCAS(ID,OP,'Auto',1,GEN,before.value);
  await assert.rejects(DB.batch([update(DB,candidate),DB.prepare('INSERT INTO aut10_local_assertion(ok) VALUES(0)')]));
  assert.deepEqual(await read(),before);
});

test('a fresh generation rejects stale bytes, but deleting and restoring old bytes defeats the local CAS',async()=>{
  await reset();const original=await read(),stale=proposeOperationPolicyCAS(ID,OP,'Approve',1,GEN,original.value);
  await reset(row(GEN2));
  assert.deepEqual(proposeOperationPolicyCAS(ID,OP,'Approve',1,GEN,(await read()).value),{state:'stale',allowed:false});
  assert.equal((await update(DB,stale).run()).meta.changes,0,'a different generation rejects the stale candidate');
  await reset(original.value);
  assert.equal((await update(DB,stale).run()).meta.changes,1,'exact byte restoration reproduces the ABA');
});

test('local schema rejects malformed JSON but accepts JSON shapes the candidate validator rejects',async()=>{
  await reset();
  await assert.rejects(DB.prepare('UPDATE app_settings SET value=? WHERE key=?').bind('{',KEY).run());
  for(const raw of ['null','[]','{}',JSON.stringify({schema:1,mode:'Auto'})]){
    await DB.prepare('UPDATE app_settings SET value=? WHERE key=?').bind(raw,KEY).run();
    assert.deepEqual(inspectOperationPolicySnapshot(ID,OP,(await read()).value),{state:'invalid',allowed:false});
  }
});
