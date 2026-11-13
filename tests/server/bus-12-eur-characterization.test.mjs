import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../server/matching.js';
import { widen } from '../../server/widen.js';

const applicant = { operation:'buy', budget_max:900000, area_answer:'any', pets:'[{"kind":"none"}]',
  requirement_priorities:JSON.stringify({version:1,values:{budget:'preferred'},unknown:[]}) };
const listing = { id:'EUR-fixture', operation:'sale', sale_price:950000, currency:'EUR',
  availability:'for_sale', archived_at:null };

test('EUR preferred budget remains unknown even if the must-have summary is meets', () => {
  const result=evaluate(applicant,listing);
  assert.equal(result.checks.find(c=>c.key==='budget').result,'unknown');
  assert.equal(result.requirements_status,'meets');
});

test('budget widening counts only a known budget failure becoming a known success', () => {
  const homes=[listing,{...listing,id:'no-currency',currency:null},{...listing,id:'gbp-change',currency:'GBP'},
    {...listing,id:'gbp-already-fits',currency:'GBP',sale_price:800000}];
  const proposal=widen(applicant,homes,[]).find(c=>c.key==='budget');
  assert.equal(proposal.added,1);
  assert.equal(proposal.fresh,1);
  assert.equal(proposal.unknownPrices,2);
});

test('budget uncertainty excludes human decisions and preserves known GBP rental comparisons', () => {
  const a={...applicant,operation:'rent',budget_max:2000,
    requirement_priorities:JSON.stringify({version:1,values:{budget:'must'},unknown:[]})};
  const homes=[{...listing,id:'annual',operation:'rent',rent:25200,rent_period:'year',currency:'GBP'},
    {...listing,id:'unknown',operation:'rent',rent:25200,rent_period:'year',currency:null},
    {...listing,id:'rejected',operation:'rent',rent:25200,rent_period:'year',currency:null},
    {...listing,id:'shortlisted',operation:'rent',rent:25200,rent_period:'year',currency:null}];
  const proposal=widen(a,homes,[{listing_id:'rejected',status:'rejected'},{listing_id:'shortlisted',status:'shortlisted'}]).find(c=>c.key==='budget');
  assert.equal(proposal.added,1);
  assert.equal(proposal.unknownPrices,1);
});

test('EUR budget asks to confirm compatibility while missing currency asks for the currency', () => {
  const check = currency => evaluate(applicant,{...listing,currency}).checks.find(c=>c.key==='budget');
  assert.deepEqual([check('EUR').result,check('EUR').evidence],['unknown','Confirm whether the EUR price fits the GBP budget']);
  assert.deepEqual([check(null).result,check(null).evidence],['unknown','Confirm the price currency']);
});
