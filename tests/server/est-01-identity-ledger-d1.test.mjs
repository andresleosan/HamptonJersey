import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {beginFullCheck,fullCheckSuccessStatement} from '../../server/search-progress.js';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const time='2026-10-07T10:00:00.000Z';
const migrations=new URL('../../migrations/',import.meta.url);
test('D1 disposable: applicant and attempt identities persist and failed batches roll back',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,host:'127.0.0.1',port:0,compatibilityDate:'2025-10-01',script:"export default {fetch(){return new Response('fixture')}}",d1Databases:{DB:'est01-identity-fixture'}}));
 try {const DB=await mf.getD1Database('DB'),batch=async sql=>DB.batch(unstable_splitSqlQuery(sql).map(s=>DB.prepare(s)));
  for(const f of readdirSync(migrations).filter(x=>x.endsWith('.sql')).sort())await batch(readFileSync(new URL(f,migrations),'utf8'));
  await DB.prepare("INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(1,'Fixture','identity@example.test',?,?,?)").bind(time,time,time).run();
  const add=()=>DB.prepare("INSERT INTO applicants(id,contact_id,operation,stage,source,created_at,updated_at) VALUES(1,1,'buy','searching','phone',?,?)").bind(time,time);
  await add().run();await batch(readFileSync(new URL('../../docs/roadmap/work/EST-01/search-progress.proposed.sql',import.meta.url),'utf8'));
  const env={DB},snapshot=await DB.prepare('SELECT id,updated_at,match_inputs_revision FROM applicants WHERE id=1').first();
  const old=await beginFullCheck(env,snapshot,{nowIso:time});
  await assert.rejects(()=>DB.batch([DB.prepare('DELETE FROM applicant_search_progress WHERE applicant_id=1'),DB.prepare('DELETE FROM est01_attempt_tokens')]));
  assert.equal((await DB.prepare('SELECT count(*) n FROM applicant_search_progress').first()).n,1);
  const progress=await DB.prepare('SELECT * FROM applicant_search_progress').first();
  await DB.prepare('DELETE FROM applicant_search_progress').run();const cols=Object.keys(progress);
  await assert.rejects(()=>DB.prepare(`INSERT INTO applicant_search_progress(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).bind(...cols.map(k=>progress[k])).run());
  const fresh=await beginFullCheck(env,snapshot,{nowIso:time});assert.notEqual(fresh.token,old.token);
  assert.equal((await fullCheckSuccessStatement(env,old,{finishedAt:time,checkedCount:0}).run()).meta.changes,0);
  await DB.prepare('DELETE FROM applicants WHERE id=1').run();await assert.rejects(()=>add().run());
  assert.equal(await beginFullCheck(env,snapshot,{nowIso:time}),null);
  await DB.prepare("INSERT INTO applicants(id,contact_id,operation,stage,source,created_at,updated_at) VALUES(2,1,'buy','searching','phone',?,?)").bind(time,time).run();
  for(const alias of ['rowid','_rowid_','oid']) {
    await assert.rejects(()=>DB.prepare(`UPDATE applicants SET ${alias}=1 WHERE id=2`).run());
    assert.equal((await DB.prepare('SELECT id FROM applicants').first()).id,2);
  }
 } finally {await mf.dispose();}
});
