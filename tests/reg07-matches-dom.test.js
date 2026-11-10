const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');

test('a stale match offers a recalculate action and clears it after refresh', async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const original = { window: global.window, document: global.document, fetch: global.fetch,
    Event: global.Event, IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  global.window = dom.window; global.document = dom.window.document; global.Event = dom.window.Event;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  let stale = true, recalculations = 0;
  global.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      recalculations++;
      if(recalculations === 1)return { ok: false, status: 409, json: async () => ({ error: 'Search or property details changed during recalculation. Try again.' }) };
      stale = false; return { ok: true, json: async () => ({}) };
    }
    const status = new URL(url, 'http://localhost').searchParams.get('status');
    const match = { id: 1, status: 'found', score: 90, requirements_status: 'pending',
      ...(stale ? { requirements_refresh_needed: true } : {}),
      checks: [{ key: 'pets', result: 'unknown', reason: 'Confirm whether the household has pets' }],
      listing: { id: 'LOCAL-1', title: 'Local fixture', operation: 'rent', availability: 'to_let' } };
    return { ok: true, json: async () => ({ rankingVersion: 1, counts: { found: 1, shortlisted: 0, rejected: 0 },
      matches: status === 'found' ? [match] : [], next: null }) };
  };
  let root;
  try {
    const { default: ApplicantMatches } = await vite.ssrLoadModule('/admin/src/ApplicantMatches.jsx');
    const applicant = { search_state: 'active', stage: 'new', search_category: 'residential', matches_revision: 1 };
    root = createRoot(dom.window.document.getElementById('root'));
    await React.act(async () => {
      root.render(React.createElement(ApplicantMatches, { applicantId: 1, applicant, counts: {},
        onChange: async () => ({ applicant }), onBusy: () => {} }));
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    const button = [...dom.window.document.querySelectorAll('button')].find(b => b.textContent === 'Recalculate matches');
    assert.ok(button, 'a stale match must offer the existing recalculate action');
    assert.match(dom.window.document.body.textContent, /Confirm whether the household has pets/);
    button.focus();assert.equal(dom.window.document.activeElement,button);
    await React.act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 30)); });
    assert.equal(recalculations, 1);assert.match(dom.window.document.querySelector('[role="alert"]').textContent, /changed during recalculation/i);
    assert.equal(dom.window.document.activeElement,button);
    assert.doesNotMatch(dom.window.document.body.textContent, /Matches recalculated/);
    await React.act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 30)); });
    assert.equal(recalculations, 2);
    assert.match(dom.window.document.body.textContent, /Matches recalculated/);
    assert.equal([...dom.window.document.querySelectorAll('button')].some(b => b.textContent === 'Recalculate matches'), false);
    assert.equal(dom.window.document.activeElement.id, 'group-found');
  } finally {
    if (root) await React.act(async () => root.unmount());
    dom.window.close(); await vite.close();
    for (const [key, value] of Object.entries(original)) value === undefined ? delete global[key] : global[key] = value;
  }
});
