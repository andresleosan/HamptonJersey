import test from 'node:test';
import assert from 'node:assert/strict';
import {show} from '../admin/src/format.js';

test('priority descriptions expose added and removed unknown answers', () => {
  const known = {version:1, values:{parking:'must'}, unknown:[]};
  const unknown = {...known, unknown:['parking']};
  assert.match(show('requirement_priorities', known), /Answers not yet known: None/);
  assert.match(show('requirement_priorities', unknown), /Answers not yet known: Parking/);
  assert.notEqual(show('requirement_priorities', known), show('requirement_priorities', unknown));
});
