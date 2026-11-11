import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicationReadiness} from '../../server/publication-policy.js';

test('minimal publication policy allows private prices and incomplete recommendations', () => {
  for (const operation of ['sale','rent','business']) {
    assert.deepEqual(publicationReadiness({title:' Home ',operation,price_text:null,summary:null,parish:null},1), {ready:true,missing:[]});
  }
});
test('minimal policy names only missing essentials and does not infer eligibility', () => {
  assert.deepEqual(publicationReadiness({title:'  ',operation:'unknown'},0), {ready:false,missing:['title','operation','public_photo']});
  assert.deepEqual(publicationReadiness({title:'Home',operation:'rent'},null), {ready:false,missing:['public_photo']});
  assert.deepEqual(publicationReadiness({title:'Home',operation:'sale'},0), {ready:false,missing:['public_photo']});
});
