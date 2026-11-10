import test from 'node:test';
import assert from 'node:assert/strict';
import {widen} from '../../server/widen.js';
const a={operation:'buy',pets:'[{"kind":"none"}]',budget_max:900000,requirement_priorities:JSON.stringify({version:1,values:{budget:'must'}})};
const ls=Array.from({length:35},(_,i)=>({id:`W-${i}`,operation:'sale',sale_price:950000,archived_at:null}));
test('BUS-14 widening counts global improvements and new matches without a quota',()=>{
 const pairs=ls.slice(0,30).map(l=>({listing_id:l.id,status:'found',requirements_rank:2}));
 pairs[0].status='rejected';pairs[1].status='shortlisted';pairs[2].requirements_rank=0;
 const b=widen(a,ls,pairs).find(w=>w.key==='budget');assert.equal(b.added,32);assert.equal(b.improved,27);assert.equal(b.fresh,5);
});
test('BUS-14 legacy priorities cannot promise improvements',()=>{
 assert.deepEqual(widen({...a,requirement_priorities:null},ls,[]),[]);
});
