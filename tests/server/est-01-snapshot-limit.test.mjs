import test from 'node:test';
import assert from 'node:assert/strict';
import * as matching from '../../server/match-store.js';

test('snapshot encoding respects UTF-8 and the larger event payload at the exact byte boundary',()=>{
  assert.equal(typeof matching.encodeMatchSnapshot,'function');
  const rows=[{id:'EST-é-🐾',match_inputs_revision:7}], encoder=new TextEncoder();
  const eventBytes=encoder.encode(JSON.stringify([{listing_id:rows[0].id,version:7}])).byteLength;
  assert.deepEqual(matching.encodeMatchSnapshot(rows,eventBytes-1),{issue:'snapshot_too_large'});
  assert.deepEqual(matching.encodeMatchSnapshot(rows,eventBytes),{json:JSON.stringify([{id:rows[0].id,version:7}])});
  assert.deepEqual(matching.encodeMatchSnapshot([],2),{json:'[]'});
});

test('large inventories fail closed without truncation or inventing a completion',()=>{
  assert.equal(typeof matching.encodeMatchSnapshot,'function');
  const rows=Array.from({length:60000},(_,i)=>({id:`EST-${String(i).padStart(8,'0')}`,match_inputs_revision:0}));
  assert.deepEqual(matching.encodeMatchSnapshot(rows),{issue:'snapshot_too_large'});
});

test('missing identities or unsafe revisions cannot be asserted as a verified snapshot',()=>{
  assert.equal(typeof matching.encodeMatchSnapshot,'function');
  for(const bad of [{id:null,match_inputs_revision:0},{id:'',match_inputs_revision:0},
    {id:'EST',match_inputs_revision:-1},{id:'EST',match_inputs_revision:Number.MAX_SAFE_INTEGER+1}])
    assert.deepEqual(matching.encodeMatchSnapshot([bad]),{issue:'snapshot_invalid'});
});
