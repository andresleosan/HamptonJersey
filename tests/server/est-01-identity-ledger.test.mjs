import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEnv,T0} from './helpers.mjs';
import {beginFullCheck,fullCheckSuccessStatement} from '../../server/search-progress.js';
const proposal=readFileSync(new URL('../../docs/roadmap/work/EST-01/search-progress.proposed.sql',import.meta.url),'utf8');
const add=db=>db.prepare("INSERT INTO applicants(id,contact_id,operation,stage,source,created_at,updated_at) VALUES(1,1,'buy','searching','phone',?,?)").run(T0,T0);
function setup(populated=false){const env=makeEnv(),db=env.DB.raw;
 db.prepare("INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(1,'Fixture','identity@example.test',?,?,?)").run(T0,T0,T0);
 if(populated)add(db);db.exec(proposal);if(!populated)add(db);return env;}
const snap=db=>db.prepare('SELECT id,updated_at,match_inputs_revision FROM applicants WHERE id=1').get();
const start=(env,a=snap(env.DB.raw))=>beginFullCheck(env,a,{nowIso:'2026-11-10T10:00:00.000Z'});
test('applicant ID cannot be reused after deletion or replaced, including populated installation',async()=>{
 for(const populated of [false,true]){const env=setup(populated),db=env.DB.raw,old=snap(db);
  assert.throws(()=>db.exec('INSERT OR REPLACE INTO applicants SELECT * FROM applicants WHERE id=1'));
  db.exec('DELETE FROM applicants WHERE id=1');assert.throws(()=>add(db));
  assert.equal(await start(env,old),null);assert.equal(db.prepare('SELECT count(*) n FROM applicants').get().n,0);
 }
});
test('deleted progress cannot be recreated with an old attempt token',async()=>{
 const env=setup(),db=env.DB.raw,old=await start(env),row=db.prepare('SELECT * FROM applicant_search_progress').get();
 db.exec('DELETE FROM applicant_search_progress');
 const cols=Object.keys(row);assert.throws(()=>db.prepare(`INSERT INTO applicant_search_progress(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...cols.map(k=>row[k])));
 const fresh=await start(env);assert.notEqual(fresh.token,old.token);
 assert.equal((await fullCheckSuccessStatement(env,old,{finishedAt:'2026-11-10T10:01:00.000Z',checkedCount:0}).run()).meta.changes,0);
});
test('identity ledgers reject deletion, mutation and replacement with recursive triggers disabled',async()=>{
 const env=setup(),db=env.DB.raw;await start(env);db.exec('PRAGMA recursive_triggers=OFF');
 assert.equal(db.prepare('SELECT count(*) n FROM est01_applicant_ids').get().n,1);
 for(const sql of ['DELETE FROM est01_applicant_ids','UPDATE est01_applicant_ids SET applicant_id=2','INSERT OR REPLACE INTO est01_applicant_ids SELECT * FROM est01_applicant_ids','DELETE FROM est01_attempt_tokens',"UPDATE est01_attempt_tokens SET attempt_token='replacement'",'INSERT OR REPLACE INTO est01_attempt_tokens SELECT * FROM est01_attempt_tokens'])assert.throws(()=>db.exec(sql));
});
