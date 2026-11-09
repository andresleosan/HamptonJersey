import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,seedListing,T0} from './helpers.mjs';
import {recomputeForApplicant,recomputeForListing} from '../../server/match-store.js';
const run=(e,s,...a)=>e.DB.raw.prepare(s).run(...a);
const get=(e,s,...a)=>e.DB.raw.prepare(s).get(...a);
function setup(n=60){
 const e=makeEnv();run(e,"INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Fixture','bus14@example.test',?,?,?)",T0,T0,T0);
 run(e,"INSERT INTO applicants(contact_id,operation,stage,source,budget_max,created_at,updated_at) VALUES(1,'buy','searching','phone',1000000,?,?)",T0,T0);
 for(let i=0;i<n;i++)seedListing(e,{id:`BUS-${String(i).padStart(3,'0')}`,matchable:1,sale_price:900000});
 return e;
}
test('BUS-14 retains 60 candidates and a listing recompute never displaces other pairs',async()=>{
 const e=setup();assert.deepEqual(await recomputeForApplicant(e,1,'system'),{created:60});
 assert.equal(get(e,'SELECT COUNT(*) n FROM matches').n,60);
 seedListing(e,{id:'BUS-extra',matchable:1});await recomputeForListing(e,'BUS-extra','system');
 assert.equal(get(e,'SELECT COUNT(*) n FROM matches').n,61);
 assert.deepEqual(await recomputeForApplicant(e,1,'system'),{created:0});
});
test('BUS-14 concurrent recomputes count actual inserts and emit one effective event and notice',async()=>{
 const e=setup(2),r=await Promise.all([recomputeForApplicant(e,1,'system'),recomputeForApplicant(e,1,'system')]);
 assert.equal(r.reduce((n,x)=>n+x.created,0),2);
 assert.equal(get(e,"SELECT COUNT(*) n FROM events WHERE type='applicant.matched'").n,1);
 assert.equal(get(e,"SELECT COUNT(*) n FROM notifications WHERE category='matched' AND resolved_at IS NULL").n,1);
 assert.equal(JSON.parse(get(e,"SELECT data FROM events WHERE type='applicant.matched'").data).new,2);
});
test('BUS-14 revisions preserve applicant timestamp and human decisions; archived listings are not proposed',async()=>{
 const e=setup(3);run(e,'UPDATE listings SET archived_at=? WHERE id=?',T0,'BUS-002');
 await recomputeForApplicant(e,1,'system');assert.equal(get(e,'SELECT COUNT(*) n FROM matches').n,2);
 const before=get(e,'SELECT matches_revision,updated_at,match_ranking_version FROM applicants WHERE id=1');
 assert.equal(before.match_ranking_version,1);
 run(e,"UPDATE matches SET status='shortlisted' WHERE listing_id='BUS-000'");run(e,"UPDATE matches SET status='rejected' WHERE listing_id='BUS-001'");
 run(e,"UPDATE listings SET sale_price=2000000 WHERE id IN ('BUS-000','BUS-001')");
 await recomputeForApplicant(e,1,'system');
 assert.equal(get(e,"SELECT status FROM matches WHERE listing_id='BUS-000'").status,'shortlisted');
 assert.equal(get(e,"SELECT status FROM matches WHERE listing_id='BUS-001'").status,'rejected');
 const after=get(e,'SELECT matches_revision,updated_at FROM applicants WHERE id=1');
 assert.ok(after.matches_revision>before.matches_revision);assert.equal(after.updated_at,before.updated_at);
 assert.equal(get(e,'PRAGMA integrity_check').integrity_check,'ok');
});
test('BUS-14 a listing edit between evaluation and writing invalidates stale results',async()=>{
 const e=setup(1),batch=e.DB.batch.bind(e.DB);let changed=false;
 e.DB.batch=async stmts=>{if(!changed&&stmts.some(s=>s.sql.includes('INSERT INTO matches'))){changed=true;run(e,"UPDATE listings SET sale_price=2000000 WHERE id='BUS-000'");}return batch(stmts);};
 assert.deepEqual(await recomputeForApplicant(e,1,'system'),{created:0});
 assert.equal(get(e,'SELECT COUNT(*) n FROM matches').n,0);
 assert.equal(get(e,'SELECT match_ranking_version FROM applicants WHERE id=1').match_ranking_version,0);
 assert.equal(get(e,"SELECT COUNT(*) n FROM events WHERE type='applicant.matched'").n,0);
});
test('BUS-14 a search edit with the same timestamp invalidates the evaluated inputs',async()=>{
 const e=setup(1),batch=e.DB.batch.bind(e.DB);let changed=false;
 e.DB.batch=async stmts=>{if(!changed&&stmts.some(s=>s.sql.includes('INSERT INTO matches'))){changed=true;run(e,'UPDATE applicants SET budget_max=500000 WHERE id=1');}return batch(stmts);};
 assert.deepEqual(await recomputeForApplicant(e,1,'system'),{created:0});assert.equal(get(e,'SELECT COUNT(*) n FROM matches').n,0);
 assert.equal(get(e,'SELECT match_ranking_version FROM applicants').match_ranking_version,0);
});
test('BUS-14 full and single-listing recomputes share an effective event without duplicates',async()=>{
 const e=setup(1);await Promise.all([recomputeForApplicant(e,1,'system'),recomputeForListing(e,'BUS-000','system')]);
 assert.equal(get(e,'SELECT COUNT(*) n FROM matches').n,1);
 assert.equal(get(e,"SELECT COUNT(*) n FROM events WHERE type='applicant.matched'").n,1);
});

test('BUS-14 migration preserves populated legacy scores, decisions and applicant timestamps',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');const migrations=new URL('../../migrations/',import.meta.url);
 for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')&&!n.startsWith('0037')).sort())db.exec(readFileSync(new URL(name,migrations),'utf8'));
 db.exec(`INSERT INTO contacts(name,email,last_activity_at,created_at,updated_at) VALUES('Legacy fixture','legacy-bus14@example.test','${T0}','${T0}','${T0}');
 INSERT INTO applicants(contact_id,operation,stage,source,created_at,updated_at) VALUES(1,'buy','searching','phone','${T0}','${T0}');`);
 for(const [i,status] of ['found','shortlisted','rejected'].entries()){
  seedListing({DB:{raw:db}},{id:`LEG-${i}`});
  db.prepare("INSERT INTO matches(applicant_id,listing_id,score,checks,status,created_at,updated_at) VALUES(1,?,100,'[]',?,?,?)").run(`LEG-${i}`,status,T0,T0);
 }
 const before=db.prepare('SELECT id,listing_id,status,score,checks FROM matches ORDER BY id').all();
 db.exec(readFileSync(new URL('0037_match_ranking.sql',migrations),'utf8'));
 assert.deepEqual(db.prepare('SELECT id,listing_id,status,score,checks FROM matches ORDER BY id').all(),before);
 const a=db.prepare('SELECT updated_at,matches_revision,match_ranking_version FROM applicants').get();
 assert.deepEqual({...a},{updated_at:T0,matches_revision:0,match_ranking_version:0});
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
});
