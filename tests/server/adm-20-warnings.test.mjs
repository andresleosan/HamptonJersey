import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, adminCookie, call } from './helpers.mjs';
import { jerseyToday } from '../../server/viewings.js';
import { addMonths, initialTermBeyondThreeYears } from '../../server/rentals.js';

test('long initial dates are flagged for review without declaring legal applicability', () => {
  assert.equal(initialTermBeyondThreeYears('2026-05-01', '2029-05-01'), false);
  assert.equal(initialTermBeyondThreeYears('2026-05-01', '2029-05-02'), true);
  assert.equal(initialTermBeyondThreeYears('2028-02-29', '2031-02-28'), false);
  assert.equal(initialTermBeyondThreeYears('2028-02-29', '2031-03-01'), true);
  for (const [start, end] of [['', '2029-01-01'], ['2026-02-30', '2030-01-01'], ['0000-01-01', '0004-01-01'],
    ['9998-01-01', '9999-01-01'], ['2026-01-01', null], [null, null]]) {
    assert.equal(initialTermBeyondThreeYears(start, end), false);
  }
});

async function fixture(regime) {
  const env = makeEnv(), cookie = await adminCookie();
  const req = (method, path, body) => call(env, method, path, { cookie, body });
  const owner = await req('POST', '/admin/landlords', { name: 'Synthetic owner' });
  assert.equal(owner.status, 201);
  const rental = await req('POST', '/admin/rentals', { landlord_id: owner.data.landlord.id,
    address: 'Synthetic street', parish: 'St Helier', service: 'let_only' });
  assert.equal(rental.status, 201);
  const t = await req('POST', `/admin/rentals/${rental.data.rental.id}/tenancies`, { tenant_name: 'Synthetic tenant',
    kind: 'fixed', regime, start_on: '2024-01-01', end_on: '2025-12-31', rent: 1000 });
  assert.equal(t.status, 201);
  return { env, req, tenancy: t.data.tenancy };
}

test('renewal keeps the recorded law label and payment reference without asserting which law applies', async () => {
  for (const regime of ['2011', '2025']) {
    const { env, req, tenancy } = await fixture(regime);
    const before = env.DB.raw.prepare('SELECT COUNT(*) AS n FROM payments').get().n;
    const res = await req('POST', `/admin/tenancies/${tenancy.id}/renew`, { kind: 'periodic' });
    assert.equal(res.status, 200);
    assert.equal(res.data.tenancy.regime, regime);
    assert.equal(res.data.tenancy.payment_ref, tenancy.payment_ref);
    assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM payments').get().n, before);
    const event = JSON.parse(env.DB.raw.prepare("SELECT data FROM rental_events WHERE tenancy_id=? AND type='tenancy.renewed' ORDER BY id DESC LIMIT 1").get(tenancy.id).data);
    assert.equal(event.before.regime, regime);
    assert.equal(event.after.regime, regime);
  }
});

test('renewal cannot overwrite a concurrently corrected law label', async () => {
  const { env, req, tenancy } = await fixture('2011'), batch = env.DB.batch.bind(env.DB);
  let changed = false;
  env.DB.batch = async statements => {
    if (!changed) { changed = true; env.DB.raw.prepare("UPDATE tenancies SET regime='2025' WHERE id=?").run(tenancy.id); }
    return batch(statements);
  };
  const res = await req('POST', `/admin/tenancies/${tenancy.id}/renew`, { kind: 'fixed', end_on: addMonths(jerseyToday(), 6) });
  assert.equal(res.status, 409);
  const current = env.DB.raw.prepare('SELECT regime, kind, end_on FROM tenancies WHERE id=?').get(tenancy.id);
  assert.deepEqual([current.regime, current.kind, current.end_on], ['2025', 'fixed', '2025-12-31']);
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM rental_events WHERE tenancy_id=? AND type='tenancy.renewed'").get(tenancy.id).n, 0);
});
