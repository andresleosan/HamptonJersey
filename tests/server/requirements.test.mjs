import test from 'node:test';
import assert from 'node:assert/strict';
import { validateApplicant } from '../../server/applicants.js';
import { makeEnv, call, adminCookie, seedListing } from './helpers.mjs';
import { extractFeatures } from '../../server/listing-features.js';
import { recomputeForApplicant, recomputeForListing } from '../../server/match-store.js';
const priority = (values = {}, unknown = []) => ({ version: 1, values, unknown });
const form = o => ({ name: 'Test household', email: 'household@example.test', operation: 'rent', source: 'phone', budget_max: 2000, ...o });
const validate = o => validateApplicant(form(o), { publicForm: false }, '2026-11-07T12:00:00.000Z');
const req = async (env, method, path, body) => call(env, method, path, { body, cookie: await adminCookie('admin@example.test') });

test('priorities and ages preserve declarations, including baby and unknown', () => {
  const p = priority({ parking: 'must', children: 'must' });
  const r = validate({ parking_spaces: 2, requirement_priorities: p, household_children: 3, household_children_ages: [0, 7, null] });
  assert.equal(r.errors, undefined);
  assert.deepEqual(JSON.parse(r.value.applicant.requirement_priorities), p);
  assert.deepEqual(JSON.parse(r.value.applicant.household_children_ages), [0, 7, null]);
  assert.equal(r.value.applicant.household_ages_at, '2026-11-07T12:00:00.000Z');
});
test('legacy does not acquire a priority or invented ages', () => {
  const a = validate({ parking_spaces: 2, household_children: 2 }).value.applicant;
  assert.equal(a.requirement_priorities, null);
  assert.equal(a.household_children_ages, null);
});
test('invalid contracts cannot introduce unchecked criteria or false priorities', () => {
  for (const p of [[], 'must', {version: 2, values: {}}, priority({ parking: true }), priority({ invented: 'must' }),
    priority({}, ['invented']), {...priority(), extra: true}])
    assert.ok(validate({ requirement_priorities: p }).errors?.requirement_priorities, JSON.stringify(p));
});
test('a must-have cannot contradict no parking, no pets, either or no children', () => {
  for (const [key, fields] of [['parking', { parking_spaces: 0 }], ['pets', { pets: [{kind:'none'}] }],
    ['furnished', { furnished: 'either' }], ['children', { household_children: 0 }]])
    assert.ok(validate({ ...fields, requirement_priorities: priority({[key]:'must'}) }).errors?.requirement_priorities, key);
});
test('unknown answer is distinct from known quantity and a missing value', () => {
  assert.equal(validate({ requirement_priorities: priority({parking:'must'}, ['parking']) }).errors, undefined);
  assert.ok(validate({ parking_spaces: 2, requirement_priorities: priority({parking:'must'}, ['parking']) }).errors?.requirement_priorities);
  assert.ok(validate({ requirement_priorities: priority({parking:'must'}) }).errors?.requirement_priorities);
});
test('ages are bounded, counted and nullable, not converted from arbitrary input', () => {
  for (const ages of [[18], [-1], [1.5], ['7'], {}, [1,2]])
    assert.ok(validate({household_children:1, household_children_ages:ages}).errors?.household_children_ages, JSON.stringify(ages));
  assert.ok(validate({household_children_status:'unknown', household_children_ages:[3]}).errors?.household_children_ages);
  assert.equal(validate({household_children:0, household_children_ages:[]}).errors, undefined);
});
test('commercial and purchase clear inapplicable residential/rental priorities', () => {
  const commercial=validate({search_category:'commercial', requirement_priorities:priority({parking:'must'}), household_children:1, household_children_ages:[7]}).value.applicant;
  assert.equal(commercial.requirement_priorities,null);
  assert.equal(commercial.household_children_ages,null);
  const buy=validate({operation:'buy', budget_max:200000, requirement_priorities:priority({furnished:'must'})});
  assert.equal(buy.errors, undefined);
  assert.equal(JSON.parse(buy.value.applicant.requirement_priorities).values.furnished, undefined);
});
test('saving another field preserves ages, date and priorities; stale save changes nothing', async () => {
  const env=makeEnv(), p=priority({parking:'must',children:'must'});
  const made=await req(env,'POST','/admin/applicants',form({parking_spaces:2,requirement_priorities:p,household_children:2,household_children_ages:[2,7]}));
  assert.equal(made.status,201,JSON.stringify(made.data));
  const id=made.data.id, detail=await req(env,'GET',`/admin/applicants/${id}`), a=detail.data.applicant;
  assert.deepEqual(a.requirement_priorities,p); assert.deepEqual(a.household_children_ages,[2,7]);
  const saved=await req(env,'PUT',`/admin/applicants/${id}`,{updated_at:a.updated_at,near:'Work'});
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.deepEqual(saved.data.applicant.requirement_priorities,p);
  assert.deepEqual(saved.data.applicant.household_children_ages,[2,7]);
  assert.equal(saved.data.applicant.household_ages_at,a.household_ages_at);
  const stale=await req(env,'PUT',`/admin/applicants/${id}`,{updated_at:a.updated_at,household_children_ages:[3,8]});
  assert.equal(stale.status,409);
  assert.deepEqual((await req(env,'GET',`/admin/applicants/${id}`)).data.applicant.household_children_ages,[2,7]);
});

test('an unchanged past move-in must-have does not block an unrelated edit', async () => {
  const env=makeEnv();
  const made=await req(env,'POST','/admin/applicants',form());
  assert.equal(made.status,201);
  env.DB.raw.prepare('UPDATE applicants SET move_in_date=?,requirement_priorities=? WHERE id=?')
    .run('2020-01-01',JSON.stringify(priority({move_in_date:'must'})),made.data.id);
  const a=(await req(env,'GET',`/admin/applicants/${made.data.id}`)).data.applicant;
  const saved=await req(env,'PUT',`/admin/applicants/${a.id}`,{updated_at:a.updated_at,near:'Work'});
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.equal(saved.data.applicant.move_in_date,'2020-01-01');
  assert.equal(saved.data.applicant.requirement_priorities.values.move_in_date,'must');
});

test('the database rejects priority objects without the required version and values',async()=>{
  const env=makeEnv();
  const made=await req(env,'POST','/admin/applicants',form());
  assert.equal(made.status,201);
  for(const contract of [{},{version:1},{values:{}}])
    assert.throws(()=>env.DB.raw.prepare('UPDATE applicants SET requirement_priorities=? WHERE id=?').run(JSON.stringify(contract),made.data.id));
});

test('the found pool puts a lower-score fulfilled requirement ahead of 27 alternatives, with no duplicate notices', async()=>{
  const env=makeEnv();
  for(let i=0;i<28;i++) seedListing(env,{id:`REG08-${String(i).padStart(3,'0')}`,operation:'rent',availability:'to_let',rent:1800,rent_period:'month',sale_price:null,bedrooms:2,bathrooms:1,matchable:1,
    published:i===27?0:1,...extractFeatures({description:i===27?'Parking for two cars':'Parking for one car'})});
  const made=await req(env,'POST','/admin/applicants',form({bedrooms_min:2,parking_spaces:2,requirement_priorities:priority({parking:'must',budget:'preferred',bedrooms:'preferred'})}));
  assert.equal(made.status,201,JSON.stringify(made.data));const id=made.data.id;
  let d=(await req(env,'GET',`/admin/applicants/${id}`)).data;
  assert.equal(d.matches.length,25);assert.equal(d.matches[0].listing.id,'REG08-027');assert.equal(d.matches[0].requirements_status,'meets');
  const count=()=>env.DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE type='applicant.matched'").get().n;
  const before=count();await recomputeForApplicant(env,id,'system');await recomputeForApplicant(env,id,'system');assert.equal(count(),before);
  await recomputeForListing(env,'REG08-000','system');
  d=(await req(env,'GET',`/admin/applicants/${id}`)).data;assert.equal(d.matches[0].listing.id,'REG08-027');
  const next=(await req(env,'GET','/admin/review')).data;assert.equal(next.listing.id,'REG08-027');
});

test('cards use current structured facts even when a stored check is old, without writing during GET',async()=>{
  const env=makeEnv();seedListing(env,{id:'REG08-live',operation:'rent',availability:'to_let',rent:1800,rent_period:'month',sale_price:null,matchable:1,
    ...extractFeatures({description:'Parking for two cars'})});
  const made=await req(env,'POST','/admin/applicants',form({parking_spaces:2,requirement_priorities:priority({parking:'must',budget:'preferred'})}));
  assert.equal(made.status,201);
  const before=env.DB.raw.prepare('SELECT checks FROM matches WHERE applicant_id=?').get(made.data.id);
  const f=extractFeatures({description:'Parking for one car'});
  env.DB.raw.prepare('UPDATE listings SET feat_parking=?,feat_evidence=? WHERE id=?').run(f.feat_parking,f.feat_evidence,'REG08-live');
  const card=(await req(env,'GET',`/admin/applicants/${made.data.id}`)).data.matches[0];
  assert.equal(card.requirements_status,'alternative');assert.equal(card.checks.find(c=>c.key==='parking').result,'fails');
  assert.equal(card.requirements_refresh_needed,true);
  assert.deepEqual(env.DB.raw.prepare('SELECT checks FROM matches WHERE applicant_id=?').get(made.data.id),before);
  assert.equal(card.eval_applicant,undefined);assert.equal(card.eval_listing,undefined);
});
