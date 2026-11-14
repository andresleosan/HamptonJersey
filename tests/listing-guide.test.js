import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingGuideSteps, guideStepForSection } from '../admin/src/listing-guide.js';
test('six guide steps point to mounted editor sections and exclude unavailable fields', () => {
  const steps = listingGuideSteps();
  assert.deepEqual(steps.map(s => s.label), ['Identification','Physical','Financial','Legal','Marketing','Review']);
  assert.deepEqual(steps.flatMap(s => s.targets.map(t => t[1])), ['h-details','h-internal-address','h-physical','h-price','h-details','h-desc','h-photos','h-tour','h-prepub','h-history']);
  assert.match(steps[3].unavailable, /not available/);
  // PUB-01: every family the listing brings is a target; none is offered while its section is not mounted.
  const full = listingGuideSteps({ compliance: true, content: true, documents: true });
  assert.deepEqual(full[3].targets.map(t => t[1]), ['h-compliance','h-documents']);
  assert.equal(full[3].unavailable, undefined);
  assert.deepEqual(full[4].targets.map(t => t[1]), ['h-desc','h-content','h-photos','h-tour']);
  assert.equal(guideStepForSection('s-compliance'), 3);
  assert.equal(guideStepForSection('s-documents'), 3);
  assert.equal(listingGuideSteps({review:false})[5].targets[0][1], 'h-editor');
  assert.equal(guideStepForSection('s-price'), 2);
  assert.equal(guideStepForSection('s-photos'), 4);
  assert.equal(guideStepForSection('s-viewings'), null);
});
