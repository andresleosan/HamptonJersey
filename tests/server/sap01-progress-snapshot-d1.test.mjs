// Disposable local D1 only. The proposed schema is never installed remotely.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {getSearchProgressSnapshot,beginFullCheck,fullCheckSuccessStatement} from '../../server/search-progress.js';
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery}=require('wrangler');
const migrations=new URL('../../migrations/',import.meta.url);
const proposed=new URL('../../docs/roadmap/work/EST-01/search-progress.proposed.sql',import.meta.url);
const stamp='2026-01-01T00:00:00.000Z',finish='2026-01-01T00:01:00.000Z';

test('D1 synthetic snapshot keeps progress and counts from one query despite a subsequent write',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,host:'127.0.0.1',port:0,compatibilityDate:'2025-10-01',
  script:"export default {fetch(){return new Response('fixture')}}",d1Databases:{DB:'sap01-snapshot-synthetic'}}));
 try {
  const DB=await mf.getD1Database('DB');
  for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort()){
   const sql=unstable_splitSqlQuery(readFileSync(new URL(name,migrations),'utf8'));
   if(sql.length)await DB.batch(sql.map(s=>DB.prepare(s)));
  }
  await DB.batch(unstable_splitSqlQuery(readFileSync(proposed,'utf8')).map(s=>DB.prepare(s)));
  await DB.prepare("INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(1,'Synthetic','sample@example.test',?,?,?)").bind(stamp,stamp,stamp).run();
  await DB.prepare("INSERT INTO applicants(id,contact_id,operation,stage,source,created_at,updated_at) VALUES(1,1,'buy','searching','phone',?,?)").bind(stamp,stamp).run();
  await DB.prepare("INSERT INTO listings(id,use,title,operation,availability,country,currency,created_at,updated_at) VALUES('s1','residential','Synthetic','sale','for_sale','Jersey','GBP',?,?)").bind(stamp,stamp).run();
  const a=await DB.prepare('SELECT * FROM applicants WHERE id=1').first(),env={DB,EST01_PROGRESS_READY:'1'};
  const ticket=await beginFullCheck(env,a,{nowIso:stamp});
  await fullCheckSuccessStatement(env,ticket,{finishedAt:finish,checkedCount:0}).run();
  let reads=0,afterRead;
  const wrapped={prepare(sql){reads++;const statement=DB.prepare(sql);return {bind(...args){const bound=statement.bind(...args);return {async first(){
   const result=await bound.first();
   await DB.prepare("INSERT INTO matches(applicant_id,listing_id,score,checks,status,created_at,updated_at) VALUES(1,'s1',0,'[]','found',?,?)").bind(stamp,stamp).run();
   afterRead=new Date().toISOString();return result;
  }};}}}};
  const snapshot=await getSearchProgressSnapshot({DB:wrapped,EST01_PROGRESS_READY:'1'},1);
  assert.equal(reads,1);assert.equal(snapshot.match_counts.found,0);assert.equal(snapshot.search_progress.state,'succeeded');
  assert.ok(snapshot.server_time>=afterRead);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM matches').first()).n,1);
  assert.doesNotMatch(JSON.stringify(snapshot),/attempt_token|email|error_code/);
  // Use Miniflare's real D1 session; wrapping only records which constraint the reader requests.
  assert.equal(typeof DB.withSession,'function');
  let constraint, sessionReads=0;
  const sessionEnv={EST01_PROGRESS_READY:'1',DB:{withSession(value){
   constraint=value;const session=DB.withSession(value);
   return {prepare(sql){sessionReads++;return session.prepare(sql);}};
  }}};
  const sessionSnapshot=await getSearchProgressSnapshot(sessionEnv,1);
  assert.equal(constraint,'first-primary');assert.equal(sessionReads,1);
  assert.equal(sessionSnapshot.search_progress.state,'succeeded');assert.equal(sessionSnapshot.match_counts.found,1);
  assert.ok(sessionSnapshot.server_time>=afterRead);

 } finally {await mf.dispose();}
});
