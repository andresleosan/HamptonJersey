import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingGuideSteps, guideStepForSection } from '../admin/src/listing-guide.js';
test('six guide steps point to mounted editor sections and exclude unavailable fields', () => {
  const steps = listingGuideSteps();
  assert.deepEqual(steps.map(s => s.label), ['Identification','Physical','Financial','Legal','Marketing','Review']);
  assert.deepEqual(steps.flatMap(s => s.targets.map(t => t[1])), ['h-details','h-details','h-physical','h-price','h-details','h-desc','h-photos','h-prepub']);
  assert.match(steps[3].unavailable, /not available/);
  assert.equal(listingGuideSteps({review:false})[5].targets[0][1], 'h-editor');
  assert.equal(guideStepForSection('s-price'), 2);
  assert.equal(guideStepForSection('s-photos'), 4);
  assert.equal(guideStepForSection('s-viewings'), null);
});
