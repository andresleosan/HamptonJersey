import test from 'node:test';
import assert from 'node:assert/strict';
import {validateApplicant} from '../../server/applicants.js';
import {evaluate} from '../../server/matching.js';
import {extractFeatures} from '../../server/listing-features.js';

const priorities = values => ({version:1, values, unknown:[]});
const dog = [{kind:'dog',count:2}];
const base = {name:'Local test',email:'pets@example.test',source:'phone',operation:'rent',budget_max:2000};
const valid = extra => validateApplicant({...base,...extra},{publicForm:false},'2026-11-11T12:00:00.000Z');
const listing = description => ({operation:'rent',rent:1800,rent_period:'month',bedrooms:2,bathrooms:1,
  published:1,archived_at:null,availability:'to_let',parish:'St Helier',...extractFeatures({description})});

test('declared pets are saved as essential even if the client omits or relaxes that priority',()=>{
  for(const values of [{pets:'preferred',parking:'preferred'},{parking:'preferred'},{pets:'unknown'}]){
    const r=valid({pets:dog,parking_spaces:1,requirement_priorities:priorities(values)});
    assert.equal(r.errors,undefined,JSON.stringify(r.errors));
    const saved=JSON.parse(r.value.applicant.requirement_priorities);
    assert.equal(saved.values.pets,'must');
    if(values.parking) assert.equal(saved.values.parking,'preferred');
    assert.deepEqual(JSON.parse(r.value.applicant.pets),dog);
  }
  const legacy=valid({pets:dog});
  assert.equal(legacy.errors,undefined);
  assert.equal(legacy.value.applicant.requirement_priorities,null,'legacy contracts remain legacy');
});

test('known pets cannot be treated as a negotiable preference, including old saved contracts',()=>{
  const applicant={operation:'rent',budget_max:2000,pets:JSON.stringify(dog),
    requirement_priorities:JSON.stringify(priorities({pets:'preferred'}))};
  const refusal=evaluate(applicant,listing('No pets'));
  const check=refusal.checks.find(c=>c.key==='pets');
  assert.equal(check.priority,'must');
  assert.equal(check.result,'fails');
  assert.equal(check.reason,'Must-have not met');
  assert.equal(refusal.pass,false);
  assert.equal(refusal.requirements_status,'excluded');
  const inconsistent=evaluate({...applicant,requirement_priorities:JSON.stringify({version:1,values:{pets:'preferred'},unknown:['pets']})},listing('No pets'));
  assert.equal(inconsistent.requirements_status,'excluded','a known animal is not erased by a contradictory legacy unknown');
  const uncertain=evaluate(applicant,listing('Pets considered'));
  assert.equal(uncertain.requirements_status,'pending');
  assert.equal(uncertain.checks.find(c=>c.key==='pets').result,'unknown');
  const noPets=evaluate({...applicant,pets:JSON.stringify([{kind:'none'}])},listing('No pets'));
  assert.equal(noPets.pass,true);
  assert.equal(noPets.checks.some(c=>c.key==='pets'),false);
});

test('a newly discovered refusal cannot be shortlisted and recalculation preserves reviewed decisions',async()=>{
  const {makeEnv,call,adminCookie,seedListing}=await import('./helpers.mjs');
  const {recomputeForApplicant}=await import('../../server/match-store.js');
  const env=makeEnv(), cookie=await adminCookie('admin@example.test');
  const req=(method,path,body)=>call(env,method,path,{body,cookie});
  for(const id of ['PET-FOUND','PET-SHORTLIST','PET-REJECT']) seedListing(env,{id,operation:'rent',availability:'to_let',
    rent:1800,rent_period:'month',sale_price:null,matchable:1,...extractFeatures({description:'Pets allowed'})});
  const made=await req('POST','/admin/applicants',{...base,pets:dog,requirement_priorities:priorities({pets:'preferred'})});
  assert.equal(made.status,201,JSON.stringify(made.data));
  const id=made.data.id;
  const found=(await req('GET',`/admin/applicants/${id}/matches?status=found`)).data.matches;
  assert.equal(found.length,3);
  const match=key=>found.find(m=>m.listing.id===key);
  assert.equal((await req('PUT',`/admin/matches/${match('PET-SHORTLIST').id}`,{status:'shortlisted',from:'found'})).status,200);
  assert.equal((await req('PUT',`/admin/matches/${match('PET-REJECT').id}`,{status:'rejected',from:'found',reject_reason:'other'})).status,200);
  const rejectedBefore=(await req('GET',`/admin/applicants/${id}/matches?status=rejected`)).data.matches[0];
  const refusal=extractFeatures({description:'No pets'});
  for(const key of ['PET-FOUND','PET-SHORTLIST','PET-REJECT'])
    env.DB.raw.prepare('UPDATE listings SET feat_pets=?,feat_evidence=? WHERE id=?').run(refusal.feat_pets,refusal.feat_evidence,key);
  const attempted=await req('PUT',`/admin/matches/${match('PET-FOUND').id}`,{status:'shortlisted',from:'found'});
  assert.equal(attempted.status,409,'a stale candidate with a confirmed refusal must not be shortlisted');
  await recomputeForApplicant(env,id,'admin@example.test');
  const remaining=(await req('GET',`/admin/applicants/${id}/matches?status=found`)).data.matches;
  assert.equal(remaining.length,0);
  const shortlisted=(await req('GET',`/admin/applicants/${id}/matches?status=shortlisted`)).data.matches;
  assert.equal(shortlisted.length,1);assert.equal(shortlisted[0].id,match('PET-SHORTLIST').id);
  assert.equal(shortlisted[0].requirements_status,'excluded');
  const rejectedAfter=(await req('GET',`/admin/applicants/${id}/matches?status=rejected`)).data.matches[0];
  assert.equal(rejectedAfter.id,rejectedBefore.id);
  assert.deepEqual(rejectedAfter.checks,rejectedBefore.checks);
  assert.equal(rejectedAfter.reject_reason,rejectedBefore.reject_reason);
});

test('a property change racing a shortlist action cannot approve a forbidden-pet match',async()=>{
  const {makeEnv,call,adminCookie,seedListing}=await import('./helpers.mjs');
  const env=makeEnv(), cookie=await adminCookie('admin@example.test');
  const req=(method,path,body)=>call(env,method,path,{body,cookie});
  seedListing(env,{id:'PET-RACE',operation:'rent',availability:'to_let',rent:1800,rent_period:'month',sale_price:null,
    matchable:1,...extractFeatures({description:'Pets allowed'})});
  const made=await req('POST','/admin/applicants',{...base,pets:dog,requirement_priorities:priorities({pets:'preferred'})});
  assert.equal(made.status,201);
  const id=made.data.id, initial=(await req('GET',`/admin/applicants/${id}/matches?status=found`)).data.matches[0];
  const batch=env.DB.batch.bind(env.DB);let changed=false;
  env.DB.batch=async stmts=>{
    if(!changed && stmts.some(s=>s.sql.includes('UPDATE matches SET status = CASE'))){
      changed=true;const refusal=extractFeatures({description:'No pets'});
      env.DB.raw.prepare('UPDATE listings SET feat_pets=?,feat_evidence=? WHERE id=?').run(refusal.feat_pets,refusal.feat_evidence,'PET-RACE');
    }
    return batch(stmts);
  };
  const attempted=await req('PUT',`/admin/matches/${initial.id}`,{status:'shortlisted',from:'found'});
  assert.equal(changed,true);assert.equal(attempted.status,409);
  const row=env.DB.raw.prepare('SELECT status FROM matches WHERE id=?').get(initial.id);
  assert.equal(row.status,'found');
});

test('contradictory or missing pet evidence remains pending for legacy and versioned searches',()=>{
  const cases=[
    {...listing('Pets considered'),feat_pets:'no'},
    {...listing('Pets allowed'),feat_pets:'no'},
    {...listing(''),feat_pets:'no',feat_evidence:null},
  ];
  for(const requirement_priorities of [null,JSON.stringify(priorities({pets:'preferred'}))]){
    for(const home of cases){
      const r=evaluate({operation:'rent',budget_max:2000,pets:JSON.stringify(dog),requirement_priorities},home);
      assert.equal(r.pass,true,'uncertain evidence must not exclude a household');
      assert.equal(r.requirements_status,'pending');
      assert.equal(r.checks.find(c=>c.key==='pets').result,'unknown');
    }
  }
});

test('ambiguous historical pet evidence does not block an internal shortlist decision',async()=>{
  const {makeEnv,call,adminCookie,seedListing}=await import('./helpers.mjs');
  const env=makeEnv(),cookie=await adminCookie('admin@example.test');
  const req=(method,path,body)=>call(env,method,path,{body,cookie});
  seedListing(env,{id:'PET-AMBIGUOUS',operation:'rent',availability:'to_let',rent:1800,rent_period:'month',sale_price:null,
    matchable:1,...extractFeatures({description:'Pets allowed'})});
  const made=await req('POST','/admin/applicants',{...base,pets:dog});
  assert.equal(made.status,201);
  const id=made.data.id, found=(await req('GET',`/admin/applicants/${id}/matches?status=found`)).data.matches[0];
  const ambiguous=extractFeatures({description:'Pets considered'});
  env.DB.raw.prepare('UPDATE listings SET feat_pets=?,feat_evidence=? WHERE id=?').run('no',ambiguous.feat_evidence,'PET-AMBIGUOUS');
  const result=await req('PUT',`/admin/matches/${found.id}`,{status:'shortlisted',from:'found'});
  assert.equal(result.status,200,'uncertain evidence is not an explicit refusal');
  assert.equal(result.data.match.requirements_status,'pending');
});

test('a legacy stale card exposes a confirmed pet refusal without rewriting its history',async()=>{
  const {makeEnv,call,adminCookie,seedListing}=await import('./helpers.mjs');
  const env=makeEnv(),cookie=await adminCookie('admin@example.test');
  const req=(method,path,body)=>call(env,method,path,{body,cookie});
  seedListing(env,{id:'PET-LEGACY',operation:'rent',availability:'to_let',rent:1800,rent_period:'month',sale_price:null,
    matchable:1,...extractFeatures({description:'Pets allowed'})});
  const made=await req('POST','/admin/applicants',{...base,pets:dog});
  assert.equal(made.status,201);
  const id=made.data.id;
  const before=(await req('GET',`/admin/applicants/${id}/matches?status=found`)).data.matches[0];
  const refusal=extractFeatures({description:'No pets'});
  env.DB.raw.prepare('UPDATE listings SET feat_pets=?,feat_evidence=? WHERE id=?').run(refusal.feat_pets,refusal.feat_evidence,'PET-LEGACY');
  const after=(await req('GET',`/admin/applicants/${id}/matches?status=found`)).data.matches[0];
  assert.equal(after.id,before.id);
  assert.equal(after.requirements_status,'excluded');
  assert.equal(after.pets_refused,true,'staff must be told when Shortlist is blocked');
  const attempt=await req('PUT',`/admin/matches/${after.id}`,{status:'shortlisted',from:'found'});
  assert.equal(attempt.status,409);
});

test('contradictory historical none plus a real pet is never treated as having no pets',()=>{
  const r=evaluate({operation:'rent',budget_max:2000,pets:'[{"kind":"none"},{"kind":"cat","count":1}]',
    requirement_priorities:JSON.stringify(priorities({pets:'preferred'}))},listing('No pets'));
  assert.notEqual(r.requirements_status,'meets');
  assert.equal(r.requirements_status,'pending');
  assert.equal(r.checks.find(c=>c.key==='pets').result,'unknown');
});

test('an empty legacy pet list with whitespace remains unanswered',()=>{
  const r=evaluate({operation:'rent',budget_max:2000,pets:' [ ] ',
    requirement_priorities:JSON.stringify(priorities({pets:'preferred'}))},listing('No pets'));
  assert.equal(r.requirements_status,'pending');
  assert.equal(r.checks.find(c=>c.key==='pets').result,'unknown');
});

test('malformed historical pet entries are unknown rather than errors or confirmed compatibility',()=>{
  for(const pets of ['[null]','[{"kind":"unknown"}]','[{"kind":"dog","count":0}]']){
    for(const requirement_priorities of [null,JSON.stringify(priorities({pets:'preferred'}))]){
      const r=evaluate({operation:'rent',budget_max:2000,pets,requirement_priorities},listing('No pets'));
      assert.equal(r.requirements_status,'pending',pets);
      assert.notEqual(r.requirements_status,'meets');
    }
  }
});

test('malformed household facts do not make the card and Shortlist disagree',async()=>{
  const {makeEnv,call,adminCookie,seedListing}=await import('./helpers.mjs');
  for(const pets of ['[null]','[{"kind":"none"},{"kind":"cat","count":1}]','[{"kind":"dog","count":0}]']){
    const env=makeEnv(),cookie=await adminCookie('admin@example.test');
    const req=(method,path,body)=>call(env,method,path,{body,cookie});
    seedListing(env,{id:'PET-INCONSISTENT',operation:'rent',availability:'to_let',rent:1800,rent_period:'month',sale_price:null,
      matchable:1,...extractFeatures({description:'Pets allowed'})});
    const made=await req('POST','/admin/applicants',{...base,pets:dog,requirement_priorities:priorities({pets:'preferred'})});
    assert.equal(made.status,201);
    const id=made.data.id;
    env.DB.raw.prepare('UPDATE applicants SET pets=? WHERE id=?').run(pets,id);
    const refusal=extractFeatures({description:'No pets'});
    env.DB.raw.prepare('UPDATE listings SET feat_pets=?,feat_evidence=? WHERE id=?').run(refusal.feat_pets,refusal.feat_evidence,'PET-INCONSISTENT');
    const card=(await req('GET',`/admin/applicants/${id}/matches?status=found`)).data.matches[0];
    assert.equal(card.requirements_status,'pending',pets);assert.notEqual(card.pets_refused,true);
    const attempt=await req('PUT',`/admin/matches/${card.id}`,{status:'shortlisted',from:'found'});
    assert.equal(attempt.status,200,pets);
  }
});
