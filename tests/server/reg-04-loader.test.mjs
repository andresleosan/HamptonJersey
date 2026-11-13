import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './helpers.mjs';
import { loadCriteriaSnapshot, normalizeBudgetTerms } from '../../server/search-criteria.js';

test('stored buy, rent and transfer searches normalize independently from the real loader', async () => {
  const env = makeEnv(), db = env.DB.raw;
  // The revision is part of the unactivated BUS-12 proposal, not a claim about production.
  db.exec('ALTER TABLE applicants ADD COLUMN criteria_revision INTEGER NOT NULL DEFAULT 0');
  const timestamp = '2026-01-01T12:00:00.000Z';
  const contact = db.prepare(`INSERT INTO contacts (name,email,last_activity_at,created_at,updated_at)
    VALUES (?,?,?,?,?)`).run('Synthetic', 'reg04-loader@example.test', timestamp, timestamp, timestamp).lastInsertRowid;
  const insert = db.prepare(`INSERT INTO applicants (contact_id, operation, search_category, search_operation,
    source, budget_max, budget_stretch, commercial_rent, commercial_rent_period, commercial_premium,
    requirement_priorities, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const priorities = JSON.stringify({ version: 1, values: { budget: 'must', parking: 'must' }, unknown: [] });
  const rent = Number(insert.run(contact, 'rent', 'residential', null, 'phone', 2000, 2200, null, null, null,
    priorities, timestamp, timestamp).lastInsertRowid);
  const buy = Number(insert.run(contact, 'buy', 'residential', null, 'phone', 650000, null, null, null, null,
    priorities, timestamp, timestamp).lastInsertRowid);
  const transfer = Number(insert.run(contact, 'rent', 'commercial', 'transfer', 'phone', null, null, 24000, 'year', 0,
    null, timestamp, timestamp).lastInsertRowid);
  const rentSnapshot = await loadCriteriaSnapshot(env, rent);
  const buySnapshot = await loadCriteriaSnapshot(env, buy);
  const transferSnapshot = await loadCriteriaSnapshot(env, transfer);
  const rentBefore = structuredClone(rentSnapshot);
  const rentTerms = normalizeBudgetTerms(rentSnapshot);
  const buyTerms = normalizeBudgetTerms(buySnapshot);
  const transferTerms = normalizeBudgetTerms(transferSnapshot);
  assert.equal(rentTerms.terms.budget_ceiling.amount_minor, 220000);
  assert.equal(buyTerms.terms.budget_ceiling.amount_minor, 65000000);
  assert.deepEqual(transferTerms.terms.commercial_rent.monthly_equivalent, { numerator_minor: 2400000, denominator: 12 });
  assert.equal(transferTerms.terms.commercial_premium.amount_minor, 0);
  assert.equal(transferTerms.terms.commercial_premium.operation, 'transfer');
  assert.equal(rentSnapshot.criteria.requirement_priorities, priorities);
  assert.deepEqual(rentSnapshot, rentBefore);
  assert.equal(db.prepare('SELECT budget_max FROM applicants WHERE id=?').get(rent).budget_max, 2000);
  assert.equal(db.prepare('SELECT budget_max FROM applicants WHERE id=?').get(buy).budget_max, 650000);
});

test('GBP provenance belongs only to the unchanged in-memory loader snapshot', async () => {
  const env = makeEnv(), db = env.DB.raw;
  db.exec('ALTER TABLE applicants ADD COLUMN criteria_revision INTEGER NOT NULL DEFAULT 0');
  const timestamp = '2026-01-01T12:00:00.000Z';
  const contact = db.prepare('INSERT INTO contacts (name,email,last_activity_at,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run('Synthetic', 'reg04-provenance@example.test', timestamp, timestamp, timestamp).lastInsertRowid;
  const id = Number(db.prepare(`INSERT INTO applicants (contact_id,operation,source,budget_max,created_at,updated_at)
    VALUES (?,'rent','phone',2000,?,?)`).run(contact, timestamp, timestamp).lastInsertRowid);
  const snapshot = await loadCriteriaSnapshot(env, id);
  assert.equal(normalizeBudgetTerms(snapshot).terms.budget_max.currency, 'GBP');
  assert.equal(normalizeBudgetTerms(snapshot).terms.budget_max.amount_minor, 200000);
  const copied = structuredClone(snapshot);
  assert.equal(normalizeBudgetTerms(copied).terms.budget_max.currency, null);
  assert.equal(normalizeBudgetTerms(copied).terms.budget_max.state, 'unknown');
  snapshot.criteria.budget_max = 2100;
  snapshot.currency = 'GBP';
  const changed = normalizeBudgetTerms(snapshot);
  assert.equal(changed.terms.budget_max.currency, null);
  assert.equal(changed.terms.budget_max.amount_minor, null);
  assert.equal(changed.terms.budget_max.state, 'unknown');
  snapshot.criteria.budget_max = 2000;
  delete snapshot.currency;
  assert.equal(normalizeBudgetTerms(snapshot).terms.budget_max.currency, null);
  const another = await loadCriteriaSnapshot(env, id);
  another.criteria.parking_spaces = 2;
  assert.equal(normalizeBudgetTerms(another).terms.budget_max.currency, null);
});

test('a tampered loader snapshot never executes an accessor to establish GBP provenance', async () => {
  const env = makeEnv(), db = env.DB.raw;
  db.exec('ALTER TABLE applicants ADD COLUMN criteria_revision INTEGER NOT NULL DEFAULT 0');
  const timestamp = '2026-01-01T12:00:00.000Z';
  const contact = db.prepare('INSERT INTO contacts (name,email,last_activity_at,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run('Synthetic', 'reg04-accessor@example.test', timestamp, timestamp, timestamp).lastInsertRowid;
  const id = Number(db.prepare(`INSERT INTO applicants (contact_id,operation,source,budget_max,created_at,updated_at)
    VALUES (?,'rent','phone',2000,?,?)`).run(contact, timestamp, timestamp).lastInsertRowid);
  const snapshot = await loadCriteriaSnapshot(env, id);
  let invoked = false;
  Object.defineProperty(snapshot.criteria, 'budget_max', { get() { invoked = true; throw new Error('private'); } });
  assert.throws(() => normalizeBudgetTerms(snapshot), error => error instanceof TypeError && !error.message.includes('private'));
  assert.equal(invoked, false);
});

test('a mutated criteria prototype does not retain the loader currency hint', async () => {
  const env = makeEnv(), db = env.DB.raw;
  db.exec('ALTER TABLE applicants ADD COLUMN criteria_revision INTEGER NOT NULL DEFAULT 0');
  const timestamp = '2026-01-01T12:00:00.000Z';
  const contact = db.prepare('INSERT INTO contacts (name,email,last_activity_at,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run('Synthetic', 'reg04-prototype@example.test', timestamp, timestamp, timestamp).lastInsertRowid;
  const id = Number(db.prepare(`INSERT INTO applicants (contact_id,operation,source,budget_max,created_at,updated_at)
    VALUES (?,'rent','phone',2000,?,?)`).run(contact, timestamp, timestamp).lastInsertRowid);
  const snapshot = await loadCriteriaSnapshot(env, id);
  Object.setPrototypeOf(snapshot.criteria, { currency: 'GBP' });
  const result = normalizeBudgetTerms(snapshot);
  assert.equal(result.terms.budget_max.currency, null);
  assert.equal(result.terms.budget_max.state, 'unknown');
});
