import test from 'node:test';
import assert from 'node:assert/strict';
import { groupDistinctDemand, buildDemandSnapshot } from '../../server/demand-snapshot.js';

const row=(contact_id,parishes,bedrooms_min,matched=0,operation='rent')=>({contact_id,operation,parishes_wanted:JSON.stringify(parishes),bedrooms_min,matched});
test('groups distinct contacts per cell and excludes contacts with a matched search in the same operation',()=>{
  const {cells}=groupDistinctDemand([row(1,['St Helier'],2),row(1,['St Helier','St Peter'],2),row(2,['St Helier'],2),row(2,['St Peter'],3,1),row(1,['St Helier'],2,1,'buy')]);
  assert.deepEqual(cells.map(({parish,bedroom_band,count})=>({parish,bedroom_band,count})),[
    {parish:'St Helier',bedroom_band:'2',count:1},{parish:'St Peter',bedroom_band:'2',count:1}]);
});
test('does not expand unknown areas and handles all bedroom bands without truncating cells',()=>{
  const parishes=['Grouville','St Brelade','St Clement','St Helier','St John','St Lawrence','St Martin','St Mary','St Ouen','St Peter','St Saviour','Trinity'];
  const input=parishes.map((p,i)=>row(i+1,[p],[0,1,2,3,4,null][i%6]));
  input.push(row(25,[],2),row(26,['Anywhere'],2));
  const {cells,quality}=groupDistinctDemand(input);
  assert.equal(cells.length,12); assert.equal(quality.excluded_area_rows,2);
  assert.deepEqual(new Set(cells.map(x=>x.bedroom_band)),new Set(['0','1','2','3','4+','Any']));
});
test('draft uses SQL as-of and rejects client-controlled history',async()=>{
  let statements;
  const db={prepare(sql){return {sql,bind(...args){this.args=args;return this;}}},async batch(s){statements=s;return [{results:[{as_of:'2026-11-13T10:00:00.000Z'}]},{results:[row(1,['St Helier'],2)]}];}};
  const d=await buildDemandSnapshot({DB:db},{operation:'rent'});
  assert.equal(d.as_of,'2026-11-13T10:00:00.000Z');assert.match(statements[0].sql,/strftime/i);assert.equal(d.operation,'rent');
  await assert.rejects(()=>buildDemandSnapshot({DB:db},{operation:'rent',as_of:'2020-01-01'}));
});
