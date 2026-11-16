// VIS-12 review (16-nov): the panel's calendar notices. M9: Google's answer is shown only with the calendar switched on;
// M1: Settings shows which Google account is connected; M2: a disconnect Google could not revoke says so. No server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const React = require('react');

async function mount(t, url, answer) {
  const { createServer } = await import('vite');
  const dom = new JSDOM('<div id="root"></div>', { url, pretendToBeVisual: true });
  const saved = { window: global.window, document: global.document, Event: global.Event, fetch: global.fetch, confirm: global.confirm,
    location: global.location, history: global.history, requestAnimationFrame: global.requestAnimationFrame,
    IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(global, { window: dom.window, document: dom.window.document, Event: dom.window.Event, location: dom.window.location,
    history: dom.window.history, confirm: () => true, requestAnimationFrame: f => setTimeout(f, 0), IS_REACT_ACT_ENVIRONMENT: true });
  global.fetch = async (path, options = {}) => {
    const body = answer(path, options.method ?? 'GET');
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body };
  };
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => {
    await React.act(async () => root.unmount()); await vite.close(); dom.window.close();
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete global[k] : global[k] = v;
  });
  const render = async (name, props = {}) => {
    const mod = await vite.ssrLoadModule('/admin/src/Calendar.jsx');
    await React.act(async () => { root.render(React.createElement(mod[name], props)); });
    await React.act(async () => { await new Promise(r => setTimeout(r, 20)); });
  };
  const text = () => dom.window.document.getElementById('root').textContent;
  return { dom, render, text };
}

test('M9: switched off, a ?calendar= answer in the address shows nothing', async t => {
  const { render, text } = await mount(t, 'https://hampton.test/admin/?calendar=connected#/availability', () => ({ enabled: false }));
  await render('CalendarReturn');
  assert.equal(text(), '');
});

test('M9: switched on, the answer is shown once and taken off the address', async t => {
  const { dom, render, text } = await mount(t, 'https://hampton.test/admin/?calendar=connected_revoke_failed#/availability',
    () => ({ enabled: true, configured: true, connections: [] }));
  await render('CalendarReturn');
  assert.match(text(), /Google Calendar connected\./);
  assert.match(text(), /could not be told to remove the access given before/);
  assert.equal(dom.window.location.search, '');
});

test('M1: Settings shows the Google account connected for the negotiator', async t => {
  const { render, text } = await mount(t, 'https://hampton.test/admin/#/availability', () => ({ enabled: true, configured: true,
    connections: [{ negotiator_id: 4, state: 'active', google_email: 'ana@hamptonestates.je', connected_at: '2026-11-16T10:00:00.000Z',
      connected_by: 'admin@example.test' }] }));
  await render('CalendarConnection', { n: { id: 4, name: 'Ana Le Sueur' } });
  assert.match(text(), /Connected as ana@hamptonestates\.je\./);
});

test('M2: a disconnect Google could not revoke tells staff where to remove the access', async t => {
  let connected = true;
  const { dom, render, text } = await mount(t, 'https://hampton.test/admin/#/availability', (path, method) => method === 'POST'
    ? (connected = false, { ok: true, revoked: false })
    : { enabled: true, configured: true, connections: connected ? [{ negotiator_id: 4, state: 'active', google_email: 'ana@hamptonestates.je',
      connected_at: '2026-11-16T10:00:00.000Z', connected_by: 'admin@example.test' }] : [] });
  await render('CalendarConnection', { n: { id: 4, name: 'Ana Le Sueur' } });
  const button = [...dom.window.document.querySelectorAll('button')].find(b => b.textContent === 'Disconnect Google Calendar');
  await React.act(async () => { button.click(); await new Promise(r => setTimeout(r, 30)); });
  assert.match(text(), /Google could not be told to remove Hampton's access/);
  assert.match(text(), /myaccount\.google\.com\/permissions/);
});
