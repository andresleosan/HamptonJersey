import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

const load = async () => {
  try { return await import('../admin/src/Activity.js'); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') assert.fail('Activity component is not available');
    throw error;
  }
};
const data = {
  period: { days: 7, from: '2026-10-18', to: '2026-10-24' },
  coverage: { measured_from: null, notes: 'Actions, not people or sessions; coverage is unknown.' },
  sources: [
    { key: 'listing_open', label: 'Listing opens', source: 'Website counters', unit: 'recorded_actions', count: 0,
      first_observed_day: null, coverage: 'unknown', definition: 'Recorded listing openings.', notes: 'Coverage is unknown.' },
    { key: 'gallery_open', label: 'Gallery opens', source: 'Website counters', unit: 'recorded_actions', count: 4,
      first_observed_day: '2026-10-23', coverage: 'unknown', definition: 'Recorded gallery openings.', notes: 'Coverage is unknown.' },
    { key: 'filter_actions', label: 'Filter actions', source: 'Not integrated', unit: 'recorded_actions', count: null,
      first_observed_day: null, coverage: 'not_configured', definition: 'Not integrated.', notes: 'Not integrated.' },
  ],
};
const dom = element => new JSDOM(renderToStaticMarkup(element)).window.document;

test('Activity shows stored actions, uncertainty and untracked sources in an accessible table', async () => {
  const { ActivityTable } = await load();
  const doc = dom(React.createElement(ActivityTable, { data }));
  const table = doc.querySelector('table');
  assert.ok(table);
  assert.ok(table.querySelectorAll('thead th[scope="col"]').length >= 4);
  assert.equal(table.querySelectorAll('tbody th[scope="row"]').length, 3);
  const rows = [...table.querySelectorAll('tbody tr')];
  assert.match(rows[0].textContent, /0/);
  assert.match(rows[0].textContent, /unknown/i);
  assert.match(rows[0].textContent, /Website counters/);
  assert.match(rows[1].textContent, /4/);
  assert.match(rows[1].textContent, /23 Oct 2026/);
  assert.match(rows[2].textContent, /Not tracked/i);
  assert.match(doc.body.textContent, /not people or sessions/i);
  assert.match(doc.body.textContent, /18 Oct 2026 to 24 Oct 2026/);
  assert.equal(table.querySelectorAll('a').length, 0);
  assert.doesNotMatch(table.textContent, /3D tour/i);
});

test('loading and error do not render a misleading zero or stale table', async () => {
  const { ActivityState } = await load();
  for (const props of [{ status: 'loading' }, { status: 'error', onRetry() {} }]) {
    const doc = dom(React.createElement(ActivityState, props));
    assert.equal(doc.querySelector('table'), null);
    assert.doesNotMatch(doc.body.textContent, /\b0\b/);
    if (props.status === 'error') {
      assert.ok(doc.querySelector('[role="alert"]'));
      assert.ok(doc.querySelector('button'));
    } else assert.match(doc.body.textContent, /Loading/i);
  }
});
