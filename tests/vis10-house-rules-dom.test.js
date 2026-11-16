// VIS-10: the house rules editor never calls an active negotiator "(inactive)" while the list of negotiators is still
// loading (the e2e read the select between the two answers). Synthetic data, no server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const React = require('react');

test('who shows it: the saved negotiator keeps their real status while the negotiators load', async t => {
  const { createServer } = await import('vite');
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://hampton.test/', pretendToBeVisual: true });
  const saved = { window: global.window, document: global.document, Event: global.Event, fetch: global.fetch,
    IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(global, { window: dom.window, document: dom.window.document, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
  const rules = active => ({ enabled: true, occupancy: 'tenanted', notice_hours: 72, shown_by: 'negotiator', negotiator_id: 2,
    negotiator_name: 'Joshua Franco', negotiator_active: active, keys: null, access_note: null, updated_at: '2026-11-16T10:00:00.000Z',
    updated_by: 'admin@example.test' });
  let active = 1;
  // The negotiators' list never answers: the editor shows what the rules say.
  global.fetch = async url => url.includes('/admin/negotiators') ? new Promise(() => {})
    : { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => rules(active) };
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => {
    await React.act(async () => root.unmount()); await vite.close(); dom.window.close();
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete global[k] : global[k] = v;
  });
  const { default: HouseRules } = await vite.ssrLoadModule('/admin/src/HouseRules.jsx');
  const checked = () => dom.window.document.querySelector('#s-house-rules select option:checked')?.textContent;
  await React.act(async () => { root.render(React.createElement(HouseRules, { listingId: 'HE-R002' })); });
  await React.act(async () => { await new Promise(r => setTimeout(r, 20)); });
  assert.equal(checked(), 'Joshua Franco');
  active = 0;
  await React.act(async () => { root.render(React.createElement(HouseRules, { listingId: 'HE-R003' })); });
  await React.act(async () => { await new Promise(r => setTimeout(r, 20)); });
  assert.equal(checked(), 'Joshua Franco (inactive)', 'an inactive one still says so');
});
