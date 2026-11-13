import test from 'node:test';
import assert from 'node:assert/strict';
import { marketingHistory } from '../admin/src/marketing-history.js';

const old='2025-01-01T12:00:00.000Z', fresh='2025-02-01T12:00:00.000Z';
const event=(id,before,after)=>({id,entity_type:'contact',entity_id:'7',type:'contact.consent_changed',
  data:{before:{marketing_opt_in_at:before},after:{marketing_opt_in_at:after}}});

test('marketing history finds the latest actual withdrawal for the same contact',()=>{
  const rows=[event(1,old,null),event(3,null,fresh),event(5,fresh,null),{...event(8,old,null),entity_id:'8'}];
  assert.deepEqual(marketingHistory(rows,7),{known:true,lastWithdrawalId:5});
});
test('missing or malformed consent evidence fails closed',()=>{
  for(const bad of [null,{}, {before:{},after:{marketing_opt_in_at:null}},
    {before:{marketing_opt_in_at:'old'},after:{}}, {before:[],after:{marketing_opt_in_at:null}}]){
    assert.equal(marketingHistory([{...event(4,old,null),data:bad}],7).known,false);
  }
  for(const [before,after] of [['old',42],[false,null],['',null],[null,true]])
    assert.equal(marketingHistory([event(4,before,after)],7).known,false);
  assert.equal(marketingHistory([{...event(4,old,null),id:Number.MAX_SAFE_INTEGER+1}],7).known,false);
  assert.equal(marketingHistory(null,7).known,false);
});
test('no recorded withdrawals do not invent one',()=>{
  assert.deepEqual(marketingHistory([event(2,null,fresh)],7),{known:true,lastWithdrawalId:0});
});


test('invalid or impossible consent dates are unknown, including date rollovers and invalid offsets',()=>{
  for(const bad of ['not-a-date','2026-02-30T12:00:00Z','2100-02-29T12:00:00Z',
    '2025-13-01T12:00:00Z','2025-01-01T24:01:00Z','2025-01-01T12:00:00+25:00'])
    assert.equal(marketingHistory([event(4,bad,null)],7).known,false,bad);
});
test('valid historical dates, leap years and explicit time offsets remain readable',()=>{
  for(const value of ['2024-02-29T12:30:00.123Z','2026-11-13 12:30:00',
    '2025-01-01T13:30:00+01:30','2025-01-01T13:30:00-0400','2025-01-01'])
    assert.deepEqual(marketingHistory([event(4,value,null)],7),{known:true,lastWithdrawalId:4},value);
});
test('an explicit objection to an outstanding request invalidates previous evidence',()=>{
  const marked={...event(9,null,null),data:{before:{marketing_opt_in_at:null},
    after:{marketing_opt_in_at:null},objection_to_pending:true}};
  assert.deepEqual(marketingHistory([marked],7),{known:true,lastWithdrawalId:9});
});

test('a conservative objection with incomplete history is a withdrawal boundary',()=>{
  const marker={...event(10,null,null),data:{before:{marketing_opt_in_at:null},
    after:{marketing_opt_in_at:null},objection_with_incomplete_history:true}};
  assert.deepEqual(marketingHistory([marker],7),{known:true,lastWithdrawalId:10});
});
