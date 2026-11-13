import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { makeEnv, call, adminCookie } from './helpers.mjs';

async function criteriaModule() {
  try { return await import('../../server/search-criteria.js'); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('/server/search-criteria.js'))
      assert.fail('The search criteria snapshot loader has not been implemented');
    throw error;
  }
}

function search(env, { operation = 'rent', category = 'residential', searchOperation = null,
  state = 'active', priorities = null, parking = null } = {}) {
  const db = env.DB.raw, timestamp = '2026-01-01T12:00:00.000Z';
  const contact = db.prepare(`INSERT INTO contacts
    (name,email,last_activity_at,created_at,updated_at) VALUES (?,?,?,?,?)`)
    .run('Synthetic', `person-${crypto.randomUUID()}@example.test`, timestamp, timestamp, timestamp).lastInsertRowid;
  return Number(db.prepare(`INSERT INTO applicants
    (contact_id,operation,search_category,search_operation,search_state,source,requirement_priorities,parking_spaces,created_at,updated_at)
    VALUES (?,?,?,?,?,'phone',?,?,?,?)`)
    .run(contact, operation, category, searchOperation, state, priorities, parking, timestamp, timestamp).lastInsertRowid);
}

test('snapshot preserves unknown priorities, zero, search state and transfer operation without returning contact data', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  env.DB.raw.exec('ALTER TABLE applicants ADD COLUMN criteria_revision INTEGER NOT NULL DEFAULT 0');
  const id = search(env, { state: 'needs_review', parking: 0 });
  const other = search(env, { category: 'commercial', searchOperation: 'transfer' });

  const snapshot = await loadCriteriaSnapshot(env, id);
  assert.equal(snapshot.criteria_revision, 0);
  assert.equal(snapshot.search_state, 'needs_review');
  assert.equal(snapshot.search_category, 'residential');
  assert.equal(snapshot.operation, 'rent');
  assert.equal(snapshot.criteria.parking_spaces, 0);
  assert.equal(snapshot.criteria.requirement_priorities, null);
  assert.equal(snapshot.criteria.budget_max, null);
  assert.equal(Object.hasOwn(snapshot.criteria, 'email'), false);
  assert.equal((await loadCriteriaSnapshot(env, other)).operation, 'transfer');
  assert.equal(await loadCriteriaSnapshot(env, 999999), null);
});

const proposal = new URL('../../docs/roadmap/work/BUS-12/criteria-revision.proposed.sql', import.meta.url);
function applyProposal(env) {
  assert.ok(existsSync(proposal), 'The isolated revision schema proposal has not been prepared');
  env.DB.raw.exec(readFileSync(proposal, 'utf8'));
}

test('a missing revision schema fails closed rather than inventing revision zero', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv(), id = search(env);
  await assert.rejects(loadCriteriaSnapshot(env, id), /criteria_revision/i);
  for (const invalid of [0, -1, 1.5, NaN, '1'])
    await assert.rejects(loadCriteriaSnapshot(env, invalid), TypeError);
});

test('an invalid lifecycle revision fails closed rather than yielding a reusable snapshot', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const id = search(env);
  env.DB.raw.exec('PRAGMA ignore_check_constraints=ON');
  env.DB.raw.prepare('UPDATE applicants SET match_inputs_revision=-1 WHERE id=?').run(id);
  env.DB.raw.exec('PRAGMA ignore_check_constraints=OFF');
  await assert.rejects(loadCriteriaSnapshot(env, id), /Invalid match inputs revision/);
});

test('the proposed revision tracks material edits once and ignores repeated values, stage and search state', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const db = env.DB.raw, id = search(env, { state: 'needs_review' });
  db.prepare('UPDATE applicants SET budget_max=?, parking_spaces=? WHERE id=?').run(2000, 2, id);
  assert.equal((await loadCriteriaSnapshot(env, id)).criteria_revision, 1);
  db.prepare('UPDATE applicants SET budget_max=?, parking_spaces=? WHERE id=?').run(2000, 2, id);
  db.prepare("UPDATE applicants SET stage='searching' WHERE id=?").run(id);
  assert.equal((await loadCriteriaSnapshot(env, id)).criteria_revision, 1);
  assert.equal((await loadCriteriaSnapshot(env, id)).search_state, 'needs_review');
  db.prepare("UPDATE applicants SET search_state='active', preferred_language='English', viewing_availability='[]' WHERE id=?").run(id);
  assert.equal((await loadCriteriaSnapshot(env, id)).criteria_revision, 1);
  assert.equal((await loadCriteriaSnapshot(env, id)).search_state, 'active');
  db.prepare("UPDATE applicants SET area_answer='any',preferred_parish=NULL WHERE id=?").run(id);
  assert.equal((await loadCriteriaSnapshot(env, id)).criteria_revision, 2);
});

test('a criteria edit never reopens a resolved or archived search', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const db = env.DB.raw, id = search(env);
  db.prepare(`UPDATE applicants SET search_state='resolved',resolved_at=?,resolved_by=?,resolution_reason=? WHERE id=?`)
    .run('2026-01-02T00:00:00.000Z', 'fixture', 'Found a home', id);
  db.prepare('UPDATE applicants SET budget_max=? WHERE id=?').run(2000, id);
  let snapshot = await loadCriteriaSnapshot(env, id);
  assert.equal(snapshot.search_state, 'resolved');
  assert.equal(snapshot.criteria_revision, 1);
  db.prepare('UPDATE applicants SET archived_at=? WHERE id=?').run('2026-01-03T00:00:00.000Z', id);
  snapshot = await loadCriteriaSnapshot(env, id);
  assert.equal(snapshot.search_state, 'resolved');
  assert.equal(snapshot.archived_at, '2026-01-03T00:00:00.000Z');
  assert.equal(snapshot.criteria_revision, 1);
});

test('resolve and reopen invalidate the lifecycle token even when the visible state returns to its original value', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const id = search(env), cookie = await adminCookie('admin@example.test');
  const before = await loadCriteriaSnapshot(env, id);
  const transition = async state => {
    const updated_at = env.DB.raw.prepare('SELECT updated_at FROM applicants WHERE id=?').get(id).updated_at;
    return call(env, 'POST', `/admin/applicants/${id}/search`,
      { cookie, body: { state, reason: 'Confirmed by staff', updated_at } });
  };
  assert.equal((await transition('resolved')).status, 200);
  const resolved = await loadCriteriaSnapshot(env, id);
  assert.equal((await transition('active')).status, 200);
  const reopened = await loadCriteriaSnapshot(env, id);
  assert.equal(reopened.search_state, before.search_state);
  assert.equal(reopened.archived_at, before.archived_at);
  assert.equal(reopened.criteria_revision, before.criteria_revision);
  assert.ok(Number.isSafeInteger(before.match_inputs_revision));
  assert.ok(resolved.match_inputs_revision > before.match_inputs_revision);
  assert.ok(reopened.match_inputs_revision > resolved.match_inputs_revision);
});

test('archive and restore invalidate the lifecycle token without changing the criteria revision', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const id = search(env), cookie = await adminCookie('admin@example.test');
  const updated_at = env.DB.raw.prepare('SELECT updated_at FROM applicants WHERE id=?').get(id).updated_at;
  assert.equal((await call(env, 'POST', `/admin/applicants/${id}/search`,
    { cookie, body: { state: 'resolved', reason: 'Confirmed by staff', updated_at } })).status, 200);
  const before = await loadCriteriaSnapshot(env, id);
  assert.equal((await call(env, 'POST', `/admin/applicants/${id}/archive`, { cookie })).status, 200);
  const archived = await loadCriteriaSnapshot(env, id);
  assert.equal((await call(env, 'POST', `/admin/applicants/${id}/restore`, { cookie })).status, 200);
  const restored = await loadCriteriaSnapshot(env, id);
  assert.equal(restored.search_state, before.search_state);
  assert.equal(restored.archived_at, before.archived_at);
  assert.equal(restored.criteria_revision, before.criteria_revision);
  assert.ok(Number.isSafeInteger(before.match_inputs_revision));
  assert.ok(archived.match_inputs_revision > before.match_inputs_revision);
  assert.ok(restored.match_inputs_revision > archived.match_inputs_revision);
});

test('a revision token alone does not identify a deleted row recreated with an explicit ID', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const db = env.DB.raw, id = search(env);
  const before = await loadCriteriaSnapshot(env, id);
  const contact = db.prepare('SELECT contact_id FROM applicants WHERE id=?').get(id).contact_id;
  db.prepare('DELETE FROM applicants WHERE id=?').run(id);
  assert.equal(await loadCriteriaSnapshot(env, id), null);
  db.prepare(`INSERT INTO applicants (id,contact_id,operation,source,created_at,updated_at)
    VALUES (?,?,'rent','phone','2026-01-02T00:00:00.000Z','2026-01-02T00:00:00.000Z')`).run(id, contact);
  const recreated = await loadCriteriaSnapshot(env, id);
  assert.equal(recreated.applicant_id, before.applicant_id);
  assert.equal(recreated.criteria_revision, before.criteria_revision);
  assert.equal(recreated.match_inputs_revision, before.match_inputs_revision);
  assert.equal(recreated.search_state, before.search_state);
});

test('equivalent priorities object formatting does not invent a criteria change', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const first = '{"version":1,"values":{"parking":"must","pets":"preferred"},"unknown":[]}';
  const reordered = '{ "unknown": [], "values": { "pets": "preferred", "parking": "must" }, "version": 1 }';
  const id = search(env, { priorities: first, parking: 2 });
  env.DB.raw.prepare('UPDATE applicants SET requirement_priorities=? WHERE id=?').run(reordered, id);
  assert.equal((await loadCriteriaSnapshot(env, id)).criteria_revision, 0);
  env.DB.raw.prepare('UPDATE applicants SET requirement_priorities=? WHERE id=?')
    .run('{"version":1,"values":{"parking":"preferred","pets":"preferred"},"unknown":[]}', id);
  assert.equal((await loadCriteriaSnapshot(env, id)).criteria_revision, 1);
});

test('the existing staff writer rejects a stale concurrent edit; the proposed trigger does not alter that route', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const id = search(env), cookie = await adminCookie('admin@example.test');
  const initial = env.DB.raw.prepare('SELECT updated_at FROM applicants WHERE id=?').get(id).updated_at;
  const save = value => call(env, 'PUT', `/admin/applicants/${id}`,
    { cookie, body: { updated_at: initial, budget_max: value } });
  assert.equal((await save(2000)).status, 200);
  assert.equal((await save(2200)).status, 409);
  const snapshot = await loadCriteriaSnapshot(env, id);
  assert.equal(snapshot.criteria_revision, 1);
  assert.equal(snapshot.criteria.budget_max, 2000);
});

test('each stored search criterion invalidates a snapshot and a multi-field edit increments only once', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const db = env.DB.raw, id = search(env);
  const changes = [
    ['budget_min', 1000], ['budget_max', 2000], ['budget_stretch', 2200],
    ['property_types', '["house"]'], ['bedrooms_min', 2], ['bedrooms_max', 3], ['bedrooms_ideal', 3],
    ['bathrooms_min', 1], ['parking_spaces', 2], ['outdoor', '["garden"]'], ['furnished', 'yes'],
    ['pets', '[{"kind":"dog","count":1}]'], ['area_answer', 'selected'], ['preferred_parish', 'St Helier'],
    ['parishes_wanted', '["St Helier"]'], ['parishes_excluded', '["Trinity"]'], ['near', 'school'],
    ['move_in_date', '2030-02-01'], ['lease_term_months', 12], ['buyer_position', 'cash'],
    ['mortgage_aip', 'yes'], ['housing_status', 'entitled'], ['household_adults', 2],
    ['household_children', 1], ['household_total', 3], ['household_children_status', 'known'],
    ['household_children_ages', '[4]'], ['household_ages_at', '2026-01-01T12:00:00.000Z'],
    ['requirements', 'ground floor'], ['commercial_kind', 'business'], ['commercial_use', 'shop'],
    ['area_min', 10], ['area_max', 20], ['area_unit', 'sqm'], ['commercial_purchase', 400000],
    ['commercial_rent', 24000], ['commercial_rent_period', 'year'], ['commercial_premium', 0],
    ['commercial_expenses', 0],
  ];
  let revision = 0;
  for (const [field, value] of changes) {
    db.prepare(`UPDATE applicants SET ${field}=? WHERE id=?`).run(value, id);
    const snapshot = await loadCriteriaSnapshot(env, id);
    assert.equal(snapshot.criteria_revision, ++revision, field);
    assert.equal(snapshot.criteria[field], value, field);
  }
  db.prepare("UPDATE applicants SET search_category='commercial', search_operation='transfer' WHERE id=?").run(id);
  let snapshot = await loadCriteriaSnapshot(env, id);
  assert.equal(snapshot.criteria_revision, ++revision);
  assert.equal(snapshot.operation, 'transfer');
  db.prepare("UPDATE applicants SET operation='buy', search_operation=NULL WHERE id=?").run(id);
  snapshot = await loadCriteriaSnapshot(env, id);
  assert.equal(snapshot.criteria_revision, ++revision);
  assert.equal(snapshot.operation, 'buy');
});

test('legacy unknown priorities and explicit preferred or must parking remain distinct', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const preferred = '{"version":1,"values":{"parking":"preferred"},"unknown":[]}';
  const must = '{"version":1,"values":{"parking":"must"},"unknown":[]}';
  const ids = [search(env, { parking: 2 }), search(env, { parking: 2, priorities: preferred }),
    search(env, { parking: 2, priorities: must })];
  const snapshots = await Promise.all(ids.map(id => loadCriteriaSnapshot(env, id)));
  assert.deepEqual(snapshots.map(s => s.criteria.requirement_priorities), [null, preferred, must]);
});

test('ambiguous duplicate JSON keys cause an invalidation rather than hiding a changed answer', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const before = '{"version":1,"values":{"parking":"must","parking":"preferred"},"unknown":[]}';
  const after = '{"version":1,"values":{"parking":"preferred","parking":"must"},"unknown":[]}';
  const id = search(env, { priorities: before });
  env.DB.raw.prepare('UPDATE applicants SET requirement_priorities=? WHERE id=?').run(after, id);
  assert.equal((await loadCriteriaSnapshot(env, id)).criteria_revision, 1);
});

test('reordered arrays are conservatively treated as a criteria change', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const before = '{"version":1,"values":{},"unknown":["parking","pets"]}';
  const after = '{"version":1,"values":{},"unknown":["pets","parking"]}';
  const id = search(env, { priorities: before });
  const db = env.DB.raw;
  db.prepare('UPDATE applicants SET requirement_priorities=? WHERE id=?').run(after, id);
  assert.equal((await loadCriteriaSnapshot(env, id)).criteria_revision, 1);
  db.prepare('UPDATE applicants SET property_types=? WHERE id=?').run('["house","flat"]', id);
  db.prepare('UPDATE applicants SET property_types=? WHERE id=?').run('["flat","house"]', id);
  assert.equal((await loadCriteriaSnapshot(env, id)).criteria_revision, 3);
});

test('an explicit revision increment combined with a criteria edit advances the proposed version twice', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const id = search(env);
  env.DB.raw.prepare('UPDATE applicants SET budget_max=?, criteria_revision=criteria_revision+1 WHERE id=?').run(2000, id);
  assert.equal((await loadCriteriaSnapshot(env, id)).criteria_revision, 2);
});

test('rollback preserves the prior revision and a direct version reset is rejected', async () => {
  const { loadCriteriaSnapshot } = await criteriaModule();
  const env = makeEnv();
  applyProposal(env);
  const db = env.DB.raw, id = search(env);
  db.prepare('UPDATE applicants SET budget_max=? WHERE id=?').run(2000, id);
  db.exec('BEGIN');
  db.prepare('UPDATE applicants SET budget_max=? WHERE id=?').run(3000, id);
  db.exec('ROLLBACK');
  const snapshot = await loadCriteriaSnapshot(env, id);
  assert.equal(snapshot.criteria_revision, 1);
  assert.equal(snapshot.criteria.budget_max, 2000);
  assert.throws(() => db.prepare('UPDATE applicants SET criteria_revision=0 WHERE id=?').run(id), /invalid criteria revision/);
});
