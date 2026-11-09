import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeHistoryPage,HISTORY_VISIBLE_LIMIT} from '../../admin/src/listing-history-window.mjs';

const items=(start,count)=>Array.from({length:count},(_,i)=>({id:start+i}));

test('older history stays navigable beyond the visible validation limit',()=>{
  const first={items:items(1,HISTORY_VISIBLE_LIMIT),next_cursor:'older'};
  const older={items:items(HISTORY_VISIBLE_LIMIT+1,50),next_cursor:'older-again'};
  const window=mergeHistoryPage(first,older);
  assert.equal(window.items.length,HISTORY_VISIBLE_LIMIT);
  assert.equal(window.items[0].id,51);
  assert.equal(window.items.at(-1).id,HISTORY_VISIBLE_LIMIT+50);
  assert.equal(window.next_cursor,'older-again');
  assert.equal(window.trimmed,true);
  const last=mergeHistoryPage(window,{items:items(HISTORY_VISIBLE_LIMIT+51,50),next_cursor:null});
  assert.equal(last.items[0].id,101);
  assert.equal(last.items.at(-1).id,HISTORY_VISIBLE_LIMIT+100);
  assert.equal(last.trimmed,true);
  assert.equal(last.next_cursor,null);
  const refreshed=mergeHistoryPage(null,{items:items(1,50),next_cursor:'fresh'});
  assert.equal(refreshed.trimmed,false);
  assert.equal(refreshed.items[0].id,1);
});

test('history window deduplicates old and new IDs before validation',()=>{
  const window=mergeHistoryPage({items:items(1,50),next_cursor:'x'},
    {items:[{id:50},{id:51}],next_cursor:null});
  assert.deepEqual(window.items.map(i=>i.id),items(1,51).map(i=>i.id));
});
