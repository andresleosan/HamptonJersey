// AGE-14: the panel coordinator remembers removed IDs (never personal data) and discards older responses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdvertiserSession } from '../admin/src/advertiserSession.js';

function bus() {
  const tabs = [];
  return class { constructor(name) { this.name = name; this.onmessage = null; tabs.push(this); }
    postMessage(data) { for (const t of tabs) if (t !== this && t.name === this.name) t.onmessage?.({ data }); } };
}

test('held_get_discarded_after_epoch_change: a response without the tombstone is stale once the ID was removed', () => {
  const s = createAdvertiserSession(null);
  let published = 0; s.subscribe(() => published++);
  const old = { id: 7, name: 'Synthetic Person', contacts: [{ name: 'Synthetic' }] };
  assert.equal(s.fresh(old), true);
  assert.equal(s.epoch, 0);
  s.removed(7);
  assert.equal(s.epoch, 1); assert.equal(published, 1);
  assert.equal(s.fresh(old), false);
  assert.equal(s.fresh({ id: 7, suppressed_at: '2026-11-14T10:00:00.000Z' }), true);
  assert.equal(s.fresh({ id: 8 }), true);
  s.removed('7'); assert.equal(s.epoch, 1, 'repeat is idempotent');
});

test('pending_post_after_broadcast: another tab learns only the removed ID', () => {
  const Channel = bus(), a = createAdvertiserSession(Channel), b = createAdvertiserSession(Channel);
  const sent = []; const spy = class extends Channel { postMessage(data) { sent.push(data); super.postMessage(data); } };
  const c = createAdvertiserSession(spy);
  c.removed(3);
  assert.deepEqual(sent, [{ suppressed: 3 }]);
  assert.equal(a.fresh({ id: 3 }), false); assert.equal(b.fresh({ id: 3 }), false);
  b.removed(4); assert.equal(a.fresh({ id: 4 }), false);
  // Malformed messages are ignored.
  new Channel('hampton-advertiser-privacy').postMessage({ suppressed: 'x' });
  assert.equal(a.epoch, 2);
});
