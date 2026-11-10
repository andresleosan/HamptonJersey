import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { validateApplicant } from '../../server/applicants.js';
import { locationAnswer } from '../../site/requirements.js';
import { makeEnv, call, adminCookie, T0 } from './helpers.mjs';

const form = extra => ({ name:'Area fixture', email:'area@example.test', source:'phone', operation:'rent', ...extra });
const validate = extra => validateApplicant(form(extra), { publicForm:false }, T0);
const req = async (env,method,path,body) => call(env,method,path,{body,cookie:await adminCookie()});

test('selected areas and an optional preferred parish survive validation',()=>{
  const r=validate({area_answer:'selected',parishes_wanted:['St Helier','Trinity'],parishes_excluded:['St Ouen'],preferred_parish:'Trinity'});
  assert.equal(r.errors,undefined,JSON.stringify(r.errors));
  assert.equal(r.value.applicant.area_answer,'selected');
  assert.equal(r.value.applicant.preferred_parish,'Trinity');
  assert.deepEqual(JSON.parse(r.value.applicant.parishes_wanted),['St Helier','Trinity']);
  assert.deepEqual(JSON.parse(r.value.applicant.parishes_excluded),['St Ouen']);
});

test('anywhere and unknown keep exclusions without inventing selected areas',()=>{
  for(const answer of ['any','unknown']){
    const r=validate({area_answer:answer,parishes_excluded:['St Ouen']});
    assert.equal(r.errors,undefined,JSON.stringify(r.errors));
    assert.equal(r.value.applicant.area_answer,answer);
    assert.equal(r.value.applicant.parishes_wanted,null);
    assert.deepEqual(JSON.parse(r.value.applicant.parishes_excluded),['St Ouen']);
  }
});

test('invalid combinations and preferences are rejected on the server',()=>{
  for(const body of [
    {area_answer:'selected'},
    {area_answer:'selected',parishes_wanted:['St Helier'],preferred_parish:'Trinity'},
    {area_answer:'selected',parishes_wanted:['St Helier'],parishes_excluded:['St Helier']},
    {area_answer:'any',parishes_wanted:['St Helier']},
    {area_answer:'unknown',preferred_parish:'St Helier'},
    {area_answer:'other'},
  ])assert.ok(validate(body).errors,JSON.stringify(body));
});

test('legacy answers remain legacy, including saved areas and empty data',()=>{
  for(const wanted of [undefined,['St Helier']]){
    const r=validate({parishes_wanted:wanted});
    assert.equal(r.errors,undefined,JSON.stringify(r.errors));
    assert.equal(r.value.applicant.area_answer,null);
    assert.equal(r.value.applicant.preferred_parish,null);
    const area=locationAnswer(r.value.applicant);
    assert.equal(area.state,'legacy');assert.deepEqual(area.wanted,wanted??[]);
  }
});

test('partial saves preserve area, exclusions and household details; stale versions conflict',async()=>{
  const env=makeEnv();
  const made=await req(env,'POST','/admin/applicants',form({area_answer:'selected',parishes_wanted:['St Helier','Trinity'],
    parishes_excluded:['St Ouen'],preferred_parish:'Trinity',pets:[{kind:'dog',count:1}],parking_spaces:2}));
  assert.equal(made.status,201,JSON.stringify(made.data));const id=made.data.id;
  const original=(await req(env,'GET',`/admin/applicants/${id}`)).data.applicant;
  const saved=await req(env,'PUT',`/admin/applicants/${id}`,{updated_at:original.updated_at,near:'Work'});
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  for(const k of ['area_answer','preferred_parish','parishes_wanted','parishes_excluded','pets','parking_spaces'])
    assert.deepEqual(saved.data.applicant[k],original[k],k);
  const stale=await req(env,'PUT',`/admin/applicants/${id}`,{updated_at:original.updated_at,area_answer:'any',parishes_wanted:null,preferred_parish:null});
  assert.equal(stale.status,409);
});

test('area input changes invalidate ranking and cursors without changing the applicant timestamp',async()=>{
  const env=makeEnv();
  const made=await req(env,'POST','/admin/applicants',form({area_answer:'selected',parishes_wanted:['St Helier','Trinity']}));
  assert.equal(made.status,201);const id=made.data.id;
  const before=env.DB.raw.prepare('SELECT match_inputs_revision,matches_revision,match_ranking_version,updated_at FROM applicants WHERE id=?').get(id);
  env.DB.raw.prepare('UPDATE applicants SET preferred_parish=? WHERE id=?').run('Trinity',id);
  const after=env.DB.raw.prepare('SELECT match_inputs_revision,matches_revision,match_ranking_version,updated_at FROM applicants WHERE id=?').get(id);
  assert.ok(after.match_inputs_revision>before.match_inputs_revision);
  assert.ok(after.matches_revision>before.matches_revision);
  assert.equal(after.match_ranking_version,0);assert.equal(after.updated_at,before.updated_at);
});

test('the parish filter includes explicit anywhere and legacy selected areas, but not unknown or unanswered',async()=>{
  const env=makeEnv();
  const cases=[
    {area_answer:'any',parishes_excluded:['St Ouen']},
    {area_answer:'unknown'}, {}, {parishes_wanted:['Trinity']},
    {area_answer:'selected',parishes_wanted:['St Helier']},
  ];
  const ids=[];
  for(let i=0;i<cases.length;i++){
    const r=await req(env,'POST','/admin/applicants',form({email:`area-filter-${i}@example.test`,...cases[i]}));
    assert.equal(r.status,201);ids.push(r.data.id);
  }
  const list=async p=>(await req(env,'GET',`/admin/applicants?parish=${encodeURIComponent(p)}`)).data.applicants.map(x=>x.id).sort((a,b)=>a-b);
  assert.deepEqual(await list('Trinity'),[ids[0],ids[3]]);
  assert.deepEqual(await list('St Helier'),[ids[0],ids[4]]);
  assert.deepEqual(await list('St Ouen'),[]);
});

test('migration preserves populated legacy searches and rejected decisions',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  const dir=new URL('../../migrations/',import.meta.url);
  for(const f of readdirSync(dir).filter(x=>x.endsWith('.sql')&&x<'0039').sort())db.exec(readFileSync(new URL(f,dir),'utf8'));
  db.prepare('INSERT INTO contacts(id,name,email,last_activity_at,created_at,updated_at) VALUES(1,?,?,?,?,?)').run('Legacy','legacy@example.test',T0,T0,T0);
  db.prepare('INSERT INTO applicants(id,contact_id,operation,source,parishes_wanted,created_at,updated_at) VALUES(1,1,?,?,?,?,?)')
    .run('buy','phone','["St Helier"]',T0,T0);
  db.prepare('INSERT INTO listings(id,use,title,operation,availability,country,location,sale_price,currency,bedrooms,published,specs,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('AREA-1','residential','Legacy home','sale','for_sale','Jersey','St Helier',500000,'GBP',2,1,'[]',T0,T0,'fixture');
  db.prepare("INSERT INTO matches(id,applicant_id,listing_id,score,checks,status,reject_reason,created_at,updated_at) VALUES(1,1,'AREA-1',80,'[]','rejected','area',?,?)").run(T0,T0);
  const before={...db.prepare('SELECT id,status,reject_reason,score,checks FROM matches WHERE id=1').get()};
  db.exec(readFileSync(new URL('0039_area_answers.sql',dir),'utf8'));
  const a=db.prepare('SELECT area_answer,preferred_parish,parishes_wanted FROM applicants WHERE id=1').get();
  assert.deepEqual({...a},{area_answer:null,preferred_parish:null,parishes_wanted:'["St Helier"]'});
  assert.deepEqual({...db.prepare('SELECT id,status,reject_reason,score,checks FROM matches WHERE id=1').get()},before);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
});
