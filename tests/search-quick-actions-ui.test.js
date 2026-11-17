// SAP-09: the quick actions' choices. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bookViewingHref, shortlistStart, bookingMode, searchGate, fillEmpty } from '../admin/src/quick-actions.js';

test('M4: the search\'s contact fills only the fields nobody typed in', () => {
  const person = { name: 'Ana Example', email: 'ana@example.je', phone: '+447700900123' };
  assert.deepEqual(fillEmpty({ listing_id: 'HE-R001', name: '', email: '', phone: '', notes: '' }, person),
    { listing_id: 'HE-R001', name: 'Ana Example', email: 'ana@example.je', phone: '+447700900123', notes: '' });
  assert.deepEqual(fillEmpty({ name: 'Typed name', email: '', phone: '07700', notes: 'x' }, person),
    { name: 'Typed name', email: 'ana@example.je', phone: '07700', notes: 'x' });
});

test('M5: New viewing for a search needs it active and a house for its operation', () => {
  assert.equal(searchGate(undefined, 'sale'), null, 'while the search is read');
  assert.equal(searchGate({ active: false, operation: 'buy' }, 'sale'), 'inactive');
  assert.equal(searchGate({ active: true, operation: 'buy' }, 'rent'), 'mismatch');
  assert.equal(searchGate({ active: true, operation: 'rent' }, 'sale'), 'mismatch');
  assert.equal(searchGate({ active: true, operation: 'buy' }, 'sale'), null);
  assert.equal(searchGate({ active: true, operation: 'buy' }, undefined), null, 'a general enquiry');
});

test('Book viewing opens New viewing for this search, by ids only (no_send_on_navigation)', () => {
  assert.equal(bookViewingHref(12), '#/viewings?applicant=12');
  assert.equal(bookViewingHref(12, 'HE-R001'), '#/viewings?applicant=12&listing=HE-R001');
  assert.doesNotMatch(bookViewingHref(12, 'HE-R001'), /@|name|phone|email/);
});

test('Send shortlist opens the link waiting to be sent, else ticks what can be presented now', () => {
  assert.equal(shortlistStart(null), null);
  assert.equal(shortlistStart({ enabled: false }), null, 'off: nothing to open');
  const homes = [1, 2, 3, 4].map(match_id => ({ match_id }));
  assert.deepEqual(shortlistStart({ enabled: true, grants: [], presentable: homes, max_homes: 3 }), { picked: [1, 2, 3] });
  assert.deepEqual(shortlistStart({ enabled: true, grants: [], presentable: [], max_homes: 3 }), { picked: [] });
  const grants = [{ id: 7, sent_at: 'x', revoked_at: null }, { id: 8, sent_at: null, revoked_at: 'x' }, { id: 9, sent_at: null, revoked_at: null }];
  assert.deepEqual(shortlistStart({ enabled: true, grants, presentable: homes, max_homes: 3 }), { review: 9 },
    'double_click_no_duplicate: a link not sent yet is reviewed, never a second one created');
  assert.deepEqual(shortlistStart({ enabled: true, grants: grants.slice(0, 2), presentable: homes, max_homes: 3 }), { picked: [1, 2, 3] },
    'revoked and sent links are history');
});

test('local_slot_not_agency_confirmation: only Hampton\'s own homes book at once', () => {
  assert.equal(bookingMode({ listingId: '' }), 'book', 'a general enquiry');
  assert.equal(bookingMode({ listingId: 'HE-R001', provenance: undefined, coordination: true }), 'checking');
  assert.equal(bookingMode({ listingId: 'HE-R001', provenance: null, coordination: true }), 'unknown', 'a failed read never books');
  assert.equal(bookingMode({ listingId: 'HE-R001', provenance: { kind: 'hampton' }, coordination: false }), 'book');
  assert.equal(bookingMode({ listingId: 'HE-R001', provenance: { kind: 'co_listed' }, coordination: true }), 'propose');
  assert.equal(bookingMode({ listingId: 'HE-R001', provenance: { kind: 'co_listed' }, coordination: false }), 'blocked');
  assert.equal(bookingMode({ listingId: 'HE-R001', provenance: { kind: 'co_listed' }, coordination: undefined }), 'checking');
});
