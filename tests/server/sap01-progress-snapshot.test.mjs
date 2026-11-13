import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import * as progress from '../../server/search-progress.js';
const start='2026-01-01T00:00:00.000Z', finish='2026-01-01T00:01:00.000Z';
function setup(withProgress=true) {
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE applicants(id INTEGER PRIMARY KEY,updated_at TEXT,match_inputs_revision INTEGER,search_category TEXT,search_state TEXT,archived_at TEXT);
 CREATE TABLE matches(applicant_id INTEGER,status TEXT); CREATE INDEX matches_status ON matches(status,applicant_id);
 INSERT INTO applicants VALUES(1,'version',1,'residential','active',NULL),(2,'version',1,'residential','active',NULL);
 INSERT INTO matches VALUES(1,'found'),(1,'shortlisted'),(1,'rejected'),(2,'rejected');`);
 if(withProgress)db.exec(`CREATE TABLE applicant_search_progress(applicant_id INTEGER PRIMARY KEY,attempt_seq INTEGER,last_attempt_at TEXT,
 last_attempt_updated_at TEXT,last_attempt_inputs_revision INTEGER,attempt_state TEXT,attempt_finished_at TEXT,error_code TEXT,
 last_success_at TEXT,last_success_updated_at TEXT,last_success_inputs_revision INTEGER,last_success_seq INTEGER,last_success_checked_count INTEGER);
 INSERT INTO applicant_search_progress VALUES(1,1,'${start}','version',1,'succeeded','${finish}',NULL,'${finish}','version',1,1,0);`);
 let reads=0;
 const env={EST01_PROGRESS_READY:'1',DB:{prepare(sql){reads++;return {bind(...args){return {async first(){return db.prepare(sql).get(...args) ?? null;}}}}}}};
 return {env,db,reads:()=>reads};
}

test('snapshot returns one applicant, its global counts, sanitized progress and a clock after one read',async()=>{
 assert.equal(typeof progress.getSearchProgressSnapshot,'function');
 const {env,reads}=setup(),before=new Date().toISOString();
 const value=await progress.getSearchProgressSnapshot(env,1);
 assert.equal(reads(),1);assert.equal(value.applicant_id,1);assert.deepEqual(value.match_counts,{found:1,shortlisted:1,rejected:1});
 assert.equal(value.search_progress.state,'succeeded');assert.equal(value.search_progress.last_success_checked_count,0);
 assert.ok(value.server_time>=before && value.server_time<=new Date().toISOString());
 assert.deepEqual(Object.keys(value).sort(),['applicant_id','match_counts','search_progress','server_time']);
 assert.doesNotMatch(JSON.stringify(value),/attempt_token|email|error_code|last_attempt_updated_at/);
});

test('legacy absence remains unrecorded even if counts exist; searches do not share counts',async()=>{
 const {env}=setup();const value=await progress.getSearchProgressSnapshot(env,2);
 assert.equal(value.search_progress.state,'unrecorded');assert.equal(value.search_progress.last_success_at,null);
 assert.deepEqual(value.match_counts,{found:0,shortlisted:0,rejected:1});
 assert.equal(await progress.getSearchProgressSnapshot(env,99),null);
});

test('gate off does not touch schema; missing schema while enabled fails closed',async()=>{
 const {env,reads}=setup(false);delete env.EST01_PROGRESS_READY;
 assert.equal(await progress.getSearchProgressSnapshot(env,1),null);assert.equal(reads(),0);
 env.DB.withSession=()=>{throw new Error('disabled gate must not open a session');};
 assert.equal(await progress.getSearchProgressSnapshot(env,1),null);
 delete env.DB.withSession;
 env.EST01_PROGRESS_READY='1';await assert.rejects(progress.getSearchProgressSnapshot(env,1));
 for(const id of [0,-1,1.5,'1',Number.MAX_SAFE_INTEGER+1]) await assert.rejects(progress.getSearchProgressSnapshot(env,id),TypeError);
});

test('count subqueries use the status-applicant index',async()=>{
 const {env,db}=setup();let query;
 const prepare=env.DB.prepare;env.DB.prepare=sql=>{query=sql;return prepare(sql);};
 await progress.getSearchProgressSnapshot(env,1);
 const plan=db.prepare(`EXPLAIN QUERY PLAN ${query}`).all(1);
 assert.equal(plan.filter(row=>/matches_status/.test(row.detail)).length,3);
});
