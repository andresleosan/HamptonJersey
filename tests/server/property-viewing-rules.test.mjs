import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePropertyViewingRules, assessPropertyViewingRules } from '../../server/property-viewing-rules.js';

const scope={listing_id:'HE-R901',operation:'rent'};
const rules={notice_hours:24,allowed_negotiator_ids:[1,2],keyholder_ref:'negotiator:1',instructions:'Synthetic instructions'};
const snapshot=()=>({scope,rules,listing:{id:'HE-R901',operation:'rent',occupancy:'occupied'},
  negotiator:{id:1,active:true},starts_at:'2026-10-26T01:30:00.000Z',now:'2026-10-25T01:30:00.000Z'});

test('validates closed fields and 0–168 hours; private text has a bounded length',()=>{
  assert.equal(validatePropertyViewingRules({...rules,notice_hours:0}).notice_hours,0);
  assert.equal(validatePropertyViewingRules({...rules,notice_hours:168}).notice_hours,168);
  for(const value of [-1,169,1.5,'24',null]) assert.throws(()=>validatePropertyViewingRules({...rules,notice_hours:value}));
  assert.throws(()=>validatePropertyViewingRules({...rules,instructions:'x'.repeat(2001)}));
  assert.equal(validatePropertyViewingRules({...rules,instructions:'x'.repeat(2000)}).instructions.length,2000);
  assert.throws(()=>validatePropertyViewingRules({...rules,extra:true}));
  assert.throws(()=>validatePropertyViewingRules({...rules,allowed_negotiator_ids:[1,1]}));
  assert.throws(()=>validatePropertyViewingRules({...rules,allowed_negotiator_ids:[0]}));
  for(const keyholder_ref of ['any personal name','negotiator:0','negotiator:1\n',{},'staff:1'])
    assert.throws(()=>validatePropertyViewingRules({...rules,keyholder_ref}));
});

test('scope, active negotiator and whitelist are independent restrictions',()=>{
  const initial=snapshot();
  assert.equal(assessPropertyViewingRules(initial).status,'needs_review');
  assert.deepEqual(assessPropertyViewingRules({...initial,listing:{...initial.listing,operation:'sale'}}).reasons,['scope_mismatch']);
  assert.deepEqual(assessPropertyViewingRules({...initial,negotiator:{id:1,active:false}}).reasons,['inactive_negotiator']);
  assert.deepEqual(assessPropertyViewingRules({...initial,negotiator:{id:3,active:true}}).reasons,['negotiator_not_permitted']);
});

test('notice uses elapsed UTC time across DST and has an exact inclusive boundary',()=>{
  const s=snapshot();
  assert.equal(assessPropertyViewingRules(s).status,'needs_review');
  const earlier={...s,starts_at:'2026-10-26T01:29:59.999Z'};
  assert.deepEqual(assessPropertyViewingRules(earlier).reasons,['insufficient_notice']);
  assert.throws(()=>assessPropertyViewingRules({...s,starts_at:'2026-10-26T01:30:00'}));
  assert.throws(()=>assessPropertyViewingRules({...s,now:'2026-02-30T01:30:00.000Z'}));
});

test('unverified access and occupancy never become authorization or private output',()=>{
  const s=snapshot();
  const output=assessPropertyViewingRules(s);
  assert.deepEqual(output,{status:'needs_review',reasons:['access_review_required']});
  assert.equal(JSON.stringify(output).includes('Synthetic instructions'),false);
  assert.equal(JSON.stringify(output).includes('negotiator:1'),false);
  assert.deepEqual(assessPropertyViewingRules({...s,listing:{...s.listing,occupancy:'unknown'}}).reasons,
    ['occupancy_unknown','access_review_required']);
  assert.throws(()=>assessPropertyViewingRules({...s,listing:{...s.listing,occupancy:null}}));
  assert.throws(()=>assessPropertyViewingRules({...s,rules:null}));
});
