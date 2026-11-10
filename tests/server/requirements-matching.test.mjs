import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate} from '../../server/matching.js';
import {extractFeatures} from '../../server/listing-features.js';
const priorities = (values,unknown=[])=>JSON.stringify({version:1,values:{budget:'preferred',bedrooms:'preferred',...values},unknown});
const applicant = o=>({operation:'rent',budget_max:2000,bedrooms_min:2,...o});
const listing = (description='',o={})=>({operation:'rent',rent:1800,rent_period:'month',bedrooms:2,bathrooms:2,
  published:1,archived_at:null,...extractFeatures({description}),parish:'St Helier',...o});
const result = (a,l)=>evaluate(applicant(a),l);
const parking = (description)=> result({parking_spaces:2,requirement_priorities:priorities({parking:'must'})},listing(description));
const check = (r,k)=>r.checks.find(c=>c.key===k);
test('parking certainty separates exact failure, lower bound and fulfilled requirement',()=>{
  assert.equal(parking('Parking for one car').requirements_status,'alternative');
  assert.equal(parking('Garage').requirements_status,'pending');
  assert.equal(check(parking('Parking for two cars'),'parking').result,'meets');
  assert.equal(check(parking('Parking for one car'),'parking').result,'fails');
  assert.equal(check(parking('Parking for one car plus a garage'),'parking').result,'unknown');
  assert.equal(check(parking('Parking for two cars plus a garage'),'parking').result,'meets');
  for(const s of ['Two visitor parking spaces','2 visitor parking spaces','Parking for up to 2 cars','Parking for 2/3 cars','Garage: No','No parking. Parking for two cars','Parking for two cars nearby'])
    assert.equal(check(parking(s),'parking').result,'unknown',s);
});
test('legacy numeric parking never proves the new requirement',()=>{
  const r=result({parking_spaces:2,requirement_priorities:priorities({parking:'must'})},listing('',{feat_parking:2,feat_evidence:null}));
  assert.equal(check(r,'parking').result,'unknown');
  assert.equal(r.requirements_status,'pending');
});
test('must-have parish is any selected parish and failure cannot be compensated by score',()=>{
  const a={parishes_wanted:'["St Helier","Trinity"]',requirement_priorities:priorities({area:'must'})};
  assert.equal(check(result(a,listing('',{parish:'Trinity'})),'area').result,'meets');
  const r=result(a,listing('',{parish:'St Saviour'}));
  assert.equal(r.pass,true);assert.equal(r.requirements_status,'alternative');
});
test('a negotiable shortfall remains a candidate; a must shortfall is an alternative',()=>{
  const l=listing('',{bedrooms:1,bathrooms:1});
  for(const p of ['must','preferred']){
    const r=result({pets:'[{"kind":"none"}]',bathrooms_min:2,requirement_priorities:priorities({bedrooms:p,bathrooms:p})},l);
    assert.equal(r.pass,true);assert.equal(check(r,'bedrooms').result,'fails');
    assert.equal(r.requirements_status,p==='must'?'alternative':'meets');
  }
});
test('pets considered is pending and a refusal never becomes compatible when priority is off',()=>{
  const a={pets:'[{"kind":"dog","count":2}]',requirement_priorities:priorities({pets:'must'})};
  for(const description of ['Pets considered','Pets by negotiation','Cats only','One dog allowed','No pets. Pets allowed'])
    assert.equal(check(result(a,listing(description)),'pets').result,'unknown',description);
  assert.equal(check(result(a,listing('Pets allowed')),'pets').result,'meets');
  assert.equal(result({...a,requirement_priorities:priorities({pets:'preferred'})},listing('No pets')).requirements_status,'alternative');
});
test('unanswered pet ownership stays pending rather than implying compatibility',()=>{
  const r=result({requirement_priorities:priorities({})},listing('No pets'));
  assert.equal(r.requirements_status,'pending');
  assert.equal(check(r,'pets')?.result,'unknown');
  assert.equal(check(r,'pets')?.reason,'Confirm whether the household has pets');
});
test('a not-sure pet answer stays pending even when pets are preferred',()=>{
  const r=result({requirement_priorities:priorities({pets:'preferred'},['pets'])},listing('No pets'));
  assert.equal(r.requirements_status,'pending');
  assert.equal(check(r,'pets')?.result,'unknown');
  assert.equal(check(r,'pets')?.reason,'Confirm whether the household has pets');
});
test('an explicit no-pets answer does not create an unknown pet requirement',()=>{
  const r=result({pets:'[{"kind":"none"}]',requirement_priorities:priorities({pets:'preferred'})},listing('No pets'));
  assert.equal(r.requirements_status,'meets');
  assert.equal(check(r,'pets'),undefined);
});
test('malformed feature evidence cannot confirm pet compatibility',()=>{
  const a={pets:'[{"kind":"dog","count":1}]',requirement_priorities:priorities({pets:'must'})};
  for(const evidence of ['not-json','null','[]']){
    const r=result(a,listing('',{feat_pets:'yes',feat_evidence:evidence}));
    assert.equal(r.requirements_status,'pending');
    assert.equal(check(r,'pets')?.result,'unknown');
  }
});
test('a negated garden and a balcony do not meet a required garden',()=>{
  const a={outdoor:'["garden","balcony"]',requirement_priorities:priorities({garden:'must',balcony:'preferred'})};
  assert.notEqual(check(result(a,listing('No garden, but a balcony')),'garden').result,'meets');
  assert.equal(check(result(a,listing('Private garden and balcony')),'garden').result,'meets');
  assert.equal(check(result(a,listing('No garden. Private garden to the rear.')),'garden').result,'unknown');
});
test('household, date and free text requirements wait for evidence, not a guess',()=>{
  const a={household_children:2,household_children_ages:'[2,7]',move_in_date:'2026-12-01',near:'School',
    requirement_priorities:priorities({children:'must',move_in_date:'must',near:'must'})};
  const r=result(a,listing('Family friendly, near a school'));
  for(const k of ['children','move_in_date','near'])assert.equal(check(r,k).result,'unknown');
  assert.equal(r.requirements_status,'pending');
});
test('explicit stretch sets the must-have ceiling, and exclusion stays exclusion',()=>{
  const a={budget_max:2000,budget_stretch:2200,requirement_priorities:priorities({budget:'must'})};
  assert.equal(check(result(a,listing('',{rent:2100})),'budget').result,'meets');
  assert.equal(result(a,listing('',{rent:2201})).requirements_status,'alternative');
  assert.equal(result({...a,parishes_excluded:'["St Helier"]'},listing()).pass,false);
  assert.equal(result(a,listing('',{availability:'sold'})).requirements_status,'excluded');
  assert.equal(result(a,listing('',{archived_at:'2026-11-07'})).requirements_status,'excluded');
});

test('outdoor negations and contradictory specification rows cannot certify a garden',()=>{
  const a={outdoor:'["garden"]',requirement_priorities:priorities({garden:'must'})};
  for(const description of ['There is no private rear garden','The garden is not included'])
    assert.notEqual(check(result(a,listing(description)),'garden').result,'meets',description);
  for(const specs of [[{label:'Garden',value:'No'}],[{label:'Garden',value:'Yes'},{label:'Garden',value:'No'}]]){
    const l=listing('',extractFeatures({specs:JSON.stringify(specs)}));
    assert.notEqual(check(result(a,l),'garden').result,'meets',JSON.stringify(specs));
  }
});
test('pet restrictions and contradictory permissions remain unconfirmed',()=>{
  const a={pets:'[{"kind":"dog","count":1}]',requirement_priorities:priorities({pets:'must'})};
  for(const description of ['Pets allowed. No dogs.','Pets allowed with landlord consent'])
    assert.equal(check(result(a,listing(description)),'pets').result,'unknown',description);
  const l=listing('',extractFeatures({specs:JSON.stringify([{label:'Pets Allowed',value:'Yes'}]),description:'No pets allowed'}));
  assert.equal(check(result(a,l),'pets').result,'unknown');
  assert.equal(check(result(a,listing('',extractFeatures({specs:JSON.stringify([{label:'Pets Allowed',value:'No'}])}))),'pets').result,'fails');
});
test('parking offered at additional cost is not confirmed capacity',()=>{
  for(const text of ['Parking for two cars available to rent for £100 per month.','Two parking spaces at an additional cost.','Parking for two cars subject to availability.'])
    assert.equal(check(parking(text),'parking').result,'unknown',text);
});
test('a budget must-have concerns the final ceiling; the legacy minimum remains a score preference',()=>{
  const a={pets:'[{"kind":"none"}]',budget_min:1500,budget_max:2000,requirement_priorities:priorities({budget:'must'})};
  const low=result(a,listing('',{rent:1000}));
  assert.equal(check(low,'budget').result,'meets');assert.equal(low.requirements_status,'meets');
  assert.ok(low.score<result(a,listing('',{rent:1800})).score);
  assert.equal(result({...a,requirement_priorities:null},listing('',{rent:1000})).pass,false);
});
