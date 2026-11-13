import test from 'node:test';
import assert from 'node:assert/strict';
import { marketingHistory } from '../admin/src/marketing-history.js';

const event=(id,before,after)=>({id,entity_type:'contact',entity_id:'7',type:'contact.consent_changed',
  data:{before:{marketing_opt_in_at:before},after:{marketing_opt_in_at:after}}});

test('marketing history finds the latest actual withdrawal for the same contact',()=>{
  const rows=[event(1,'old',null),event(3,null,'new'),event(5,'new',null),{...event(8,'other',null),entity_id:'8'}];
  assert.deepEqual(marketingHistory(rows,7),{known:true,lastWithdrawalId:5});
});
test('missing or malformed consent evidence fails closed',()=>{
  for(const bad of [null,{}, {before:{},after:{marketing_opt_in_at:null}},
    {before:{marketing_opt_in_at:'old'},after:{}}, {before:[],after:{marketing_opt_in_at:null}}]){
    assert.equal(marketingHistory([{...event(4,'old',null),data:bad}],7).known,false);
  }
  for(const [before,after] of [['old',42],[false,null],['',null],[null,true]])
    assert.equal(marketingHistory([event(4,before,after)],7).known,false);
  assert.equal(marketingHistory([{...event(4,'old',null),id:Number.MAX_SAFE_INTEGER+1}],7).known,false);
  assert.equal(marketingHistory(null,7).known,false);
});
test('no recorded withdrawals do not invent one',()=>{
  assert.deepEqual(marketingHistory([event(2,null,'recorded')],7),{known:true,lastWithdrawalId:0});
});
