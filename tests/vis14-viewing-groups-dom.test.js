// VIS-14 review (16-nov): the panel reports viewings it could not cancel (M4), says which requests are already planned
// back-to-back (M8) and never offers an open viewing's time as free (M6). Synthetic data, no server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const React = require('react');

async function mount(t, answer) {
  const { createServer } = await import('vite');
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://hampton.test/', pretendToBeVisual: true });
  const saved = { window: global.window, document: global.document, Event: global.Event, fetch: global.fetch, confirm: global.confirm,
    requestAnimationFrame: global.requestAnimationFrame, IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(global, { window: dom.window, document: dom.window.document, Event: dom.window.Event,
    confirm: () => true, requestAnimationFrame: f => setTimeout(f, 0), IS_REACT_ACT_ENVIRONMENT: true });
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET' });
    const body = answer(url, options.method ?? 'GET');
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body };
  };
  const vite = await createServer({ logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => {
    await React.act(async () => root.unmount()); await vite.close(); dom.window.close();
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete global[k] : global[k] = v;
  });
  const render = async (path, props, name = 'default') => {
    const mod = await vite.ssrLoadModule(path);
    await React.act(async () => { root.render(React.createElement(mod[name], props)); });
    await React.act(async () => { await new Promise(r => setTimeout(r, 20)); });
  };
  return { dom, calls, render, vite };
}
const group = { id: 7, listing_id: 'HE-R001', listing_title: 'Le Bernage', negotiator_id: 2, negotiator_name: 'Joshua Franco',
  date: '2030-01-02', time: '10:00', end_time: '10:30', capacity: 5, pending: 2, confirmed: 1 };

test('M4: cancelling an open viewing says which viewings could not be cancelled', async t => {
  let cancelled = false;
  const { dom, render } = await mount(t, (url, method) => method === 'POST' ? (cancelled = true, { cancelled: [1, 2], refused: [3] })
    : { requests: [], groups: cancelled ? [] : [group] });
  await render('/admin/src/ViewingGroups.jsx', {});
  const button = [...dom.window.document.querySelectorAll('button')].find(b => b.textContent === 'Cancel open viewing');
  assert.ok(button);
  await React.act(async () => { button.click(); await new Promise(r => setTimeout(r, 20)); });
  const text = dom.window.document.querySelector('[role="status"], [role="alert"]')?.textContent ?? '';
  assert.match(text, /Open viewing cancelled, with 2 viewings\./);
  assert.match(text, /1 viewing could not be cancelled/);
});

test('M8: requests planned back-to-back say so, with their time and negotiator', async t => {
  const asked = (id, back) => ({ id, listing_id: 'HE-R001', listing_title: 'Le Bernage', name: `Person ${id}`, date: '2030-01-03',
    time: `1${id}:00`, negotiator_id: 2, negotiator_name: 'Joshua Franco', updated_at: null, back_to_back: back });
  const { dom, render } = await mount(t, () => ({ requests: [asked(1, 1), asked(2, 1)], groups: [] }));
  await render('/admin/src/ViewingGroups.jsx', {});
  const card = dom.window.document.querySelector('article.block-house').textContent;
  assert.match(card, /2 requests planned back-to-back/);
  assert.match(card, /Person 1 · back-to-back .*11:00 with Joshua Franco/);
  assert.doesNotMatch(card, /open requests for this house/, 'planned requests are not waiting for a plan');
});

test("M6: the slot picker never offers an open viewing's time, even if it reads as free", async t => {
  const { dom, render, vite } = await mount(t, () => null);
  const { jerseyToday, plusDays } = await vite.ssrLoadModule('/server/viewings.js');
  const date = plusDays(jerseyToday(), 3);
  global.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({
    negotiators: [{ id: 2, name: 'Joshua Franco', role: null, active: 1 }],
    days: [{ date, slots: { 2: [{ time: '10:00', booked: false }, { time: '11:00', booked: false }] } }],
    groups: [{ ...group, date }] }) });
  await render('/admin/src/SlotPicker.jsx', { value: { negotiator_id: 2, date, time: null }, onChange: () => {} });
  const radios = [...dom.window.document.querySelectorAll('input[name$="-time"]')];
  assert.deepEqual(radios.map(r => [r.value, r.disabled]), [['10:00', true], ['11:00', false]]);
});
