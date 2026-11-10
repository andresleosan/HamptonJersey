import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.env.QA_BACKEND_ROOT;
const load=path=>import(pathToFileURL(`${root}/server/${path}`));
const {qaEnvironment,qaSimulation,qaDrive}=await load('qa-integrations.js');
const QA='https://hamptonjersey-qa.pages.dev';
globalThis.fetch=()=>{throw Error('QA attempted network');};
function environment(){
  const raw=new DatabaseSync(':memory:');
  raw.exec(readFileSync(`${root}/setup.sql`,'utf8'));
  const stmt=(sql,args=[])=>({sql,bind:(...args)=>stmt(sql,args),first:async()=>raw.prepare(sql).get(...args)??null,
    all:async()=>({results:raw.prepare(sql).all(...args),meta:{}}),run:async()=>{const r=raw.prepare(sql).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}});
  const DB={raw,prepare:sql=>stmt(sql),batch:async statements=>{raw.exec('BEGIN');try {const out=[];for(const s of statements)out.push(/^\s*(SELECT|WITH)/i.test(s.sql)?await s.all():await s.run());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}}};
  return qaEnvironment({DB,MEDIA:{delete:async()=>{}},SESSION_SECRET:'qa-test-'.repeat(8)});
}
const request=(body,origin=QA)=>new Request(`${origin}/api/qa-simulation`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const simulate=(env,body,extra={})=>qaSimulation({request:request(body),env,runId:'run-test-001',...extra});
test('environment discards provider credentials and bindings, preserves only QA runtime inputs',()=>{
 const DB={},MEDIA={},ASSETS={},derived=qaEnvironment({DB,MEDIA,ASSETS,SESSION_SECRET:'synthetic',GOOGLE_SERVICE_ACCOUNT:'must-disappear',HERMES_KEY:'must-disappear',EMAIL:{send(){throw Error('real provider');}},QA_DB:{},SITE_URL:'https://wrong.test',EMAIL_SERVICE_READY:'true'});
 assert.equal(derived.DB,DB);assert.equal(derived.MEDIA,MEDIA);assert.equal(derived.ASSETS,ASSETS);assert.equal(derived.TURNSTILE_SITE_KEY,'qa-simulator');assert.equal(derived.SESSION_SECRET,'synthetic');
 assert.equal(derived.SITE_URL,QA);assert.equal(derived.FIREBASE_PROJECT_ID,'qa-disabled');assert.equal(derived.EMAIL_SERVICE_READY,'false');
 for(const key of ['GOOGLE_SERVICE_ACCOUNT','HERMES_KEY','EMAIL','QA_DB'])assert.equal(derived[key],undefined);
});
test('wrong guard, wrong origin, invalid run, malformed JSON and unknown action reject before writes',async()=>{
 const env=environment(),before=env.DB.raw.prepare('SELECT COUNT(*) n FROM app_settings').get().n;
 assert.equal((await simulate(env,{simulation:'unknown'})).status,400);
 assert.equal((await simulate(env,{simulation:'drive'},{runId:'../bad'})).status,400);
 assert.equal((await qaSimulation({request:request({simulation:'drive'},'https://wrong.test'),env,runId:'run-test-001'})).status,503);
 const malformed=new Request(`${QA}/api/qa-simulation`,{method:'POST',headers:{origin:QA,'content-type':'application/json'},body:'{'});
 assert.equal((await qaSimulation({request:malformed,env,runId:'run-test-001'})).status,400);
 env.DB.raw.prepare("UPDATE qa_app_guard SET marker='wrong'").run();
 assert.equal((await simulate(env,{simulation:'drive'})).status,503);
 assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM app_settings').get().n,before);
});
test('Drive fixtures expose only synthetic known documents and photos',async()=>{
 const env=environment(),r=await simulate(env,{simulation:'drive'});assert.equal(r.status,200);
 const fixture=await r.json(),folder=await qaDrive.folderInfo(env,fixture.folderId);assert.match(folder.name,/Synthetic/);
 const walked=await qaDrive.walkFolder(env,fixture.folderId);assert.equal(walked.documents.length,1);assert.equal(walked.editedFolders.length,1);
 const doc=await qaDrive.fileResponse(env,walked.documents[0]);assert.match(await doc.text(),/Synthetic QA/);
 const photos=await qaDrive.photosIn(env,walked.editedFolders[0].id);assert.equal(photos.photos.length,1);
 const photo=await qaDrive.fileResponse(env,photos.photos[0]);assert.equal(photo.headers.get('content-type'),'image/png');assert.ok((await photo.arrayBuffer()).byteLength>0);
 assert.equal(await qaDrive.folderInfo(env,'unrecognized-folder-01'),null);
 await assert.rejects(()=>qaDrive.fileResponse(env,{id:'unrecognized-file-01',mimeType:'text/plain'}));
 env.DB.raw.prepare("UPDATE qa_app_guard SET database_id='wrong'").run();
 await assert.rejects(()=>qaDrive.folderInfo(env,fixture.folderId));
});
test('simulated antispam accepts only exact synthetic token and artifact secret',async()=>{
 const {verifyTurnstile}=await load('turnstile.js');
 assert.equal(await verifyTurnstile('qa-simulated-antispam','qa-simulation-only'),true);
 assert.equal(await verifyTurnstile('qa-simulated-antispam','other'),false);
 assert.equal(await verifyTurnstile('real-token','qa-simulation-only'),false);
});
test('chat allows exact QA origin and rejects wildcard deployment hosts',async()=>{
 const {previewHost}=await load('chat.js');
 assert.equal(previewHost(new Request(`${QA}/`)),false);
 assert.equal(previewHost(new Request('https://abc.hamptonjersey-qa.pages.dev/')),true);
});
test('email rejects real recipients before loading or invoking provider code',async()=>{
 const env=environment();assert.equal((await simulate(env,{simulation:'email',recipient:'person@invalid.example'})).status,400);
 assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM app_settings WHERE key LIKE 'qa:%'").get().n,0);
});
test('email uses synthetic binding and existing inbound handler; receipts never include provider credentials',{skip:process.env.QA_BACKEND_FULL!=='1'},async()=>{
 const env=environment(),r=await simulate(env,{simulation:'email',recipient:'run-test-001@example.test'});assert.equal(r.status,200);
 const body=await r.json();assert.equal(body.simulated,true);assert.match(body.messageId,/qa-/);
 const row=env.DB.raw.prepare('SELECT sender,recipient,subject FROM email_inbound ORDER BY id DESC LIMIT 1').get();assert.equal(row.sender,'run-test-001@example.test');assert.equal(row.recipient,'replies@qa.example.test');
 assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM app_settings WHERE key LIKE 'qa:run:run-test-001:%'").get().n,1);
 assert.equal(env.EMAIL,undefined);assert.equal(env.EMAIL_SERVICE_READY,'false');
});
test('manual jobs reuse existing handler and remain entirely in QA',{skip:process.env.QA_BACKEND_FULL!=='1'},async()=>{
 const env=environment();
 const missing=await simulate(env,{simulation:'jobs'});assert.equal(missing.status,409);
 assert.equal(env.DB.raw.prepare("SELECT COUNT(*) n FROM notification_cursor WHERE key='queues'").get().n,0);
 env.DB.raw.exec("INSERT INTO notification_cursor(key,revision,after_key,observed_at) VALUES('queues',0,'','')");
 const r=await simulate(env,{simulation:'jobs'});assert.equal(r.status,200);assert.equal((await r.json()).simulated,true);
 assert.ok(env.DB.raw.prepare("SELECT value FROM app_settings WHERE key='clock'").get());
 assert.ok(env.DB.raw.prepare("SELECT revision FROM notification_cursor WHERE key='queues'").get()?.revision>0);
});

test('Hermes targets only a run-owned listing job and never claims unrelated queue rows',{skip:process.env.QA_BACKEND_FULL!=='1'},async()=>{
 const env=environment();
 const row=env.DB.raw.prepare("SELECT id FROM listings WHERE published=1 AND archived_at IS NULL ORDER BY id LIMIT 1").get();
 assert.ok(row);
 const unrelated=env.DB.raw.prepare("INSERT INTO jobs(kind,listing_id,requested_by,created_at) VALUES('listing_text',?,'qa-other',?) RETURNING id").get(row.id,new Date().toISOString());
 const conflict=await simulate(env,{simulation:'hermes'},{listingId:row.id});assert.equal(conflict.status,409);
 assert.equal(env.DB.raw.prepare('SELECT status FROM jobs WHERE id=?').get(unrelated.id).status,'queued');
 env.DB.raw.prepare('DELETE FROM jobs WHERE id=?').run(unrelated.id);
 const response=await simulate(env,{simulation:'hermes'},{listingId:row.id});assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.simulated,true);
 const job=env.DB.raw.prepare('SELECT status,result FROM jobs WHERE id=?').get(body.jobId);assert.equal(job.status,'draft');assert.match(job.result,/run-test-001/);
 assert.equal(env.HERMES_KEY,undefined);
});
