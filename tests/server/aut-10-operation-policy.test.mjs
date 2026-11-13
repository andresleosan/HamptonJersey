import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listAutomationDefinitions } from '../../server/automation-contracts.js';
import * as policy from '../../server/operation-policy.js';

const requiredHuman = [
  'match_approval', 'unknown_required_consultation', 'dictated_criteria_confirmation',
  'search_resolution', 'presentation_review',
];

test('known operations have a proposal-only Draft default without an effective policy or execution authority', () => {
  for (const definition of listAutomationDefinitions()) for (const operation of definition.operations) {
    const draft = policy.operationModeProposal(definition.id, operation, 'Draft');
    assert.deepEqual(policy.operationModeProposal(definition.id, operation), draft);
    assert.equal(draft.kind, 'proposal_only');
    assert.equal(draft.proposed_mode, 'Draft');
    assert.equal(draft.definition_version, definition.version);
    assert.equal(draft.effective_mode, null);
    assert.equal(draft.policy_version, null);
    assert.equal(draft.allowed, false);
    assert.deepEqual(draft.required_gates, definition.required_gates);
    for (const decision of requiredHuman) assert.ok(draft.hard_human_decisions.includes(decision));
  }
});

test('unknown automations, operations and modes are rejected without accepting extra parameters', () => {
  const cases = [
    ['unknown', 'prepare_draft', 'Draft'], ['__proto__', 'prepare_draft', 'Draft'],
    ['listing_text', 'publish', 'Auto'], ['listing_text', 'prepare_draft', 'auto'],
    ['listing_text', 'prepare_draft', null],
    ['listing_text', 'prepare_draft', 'Auto', { disable_human_review: true }],
  ];
  for (const args of cases) assert.throws(() => policy.operationModeProposal(...args));
});

test('Auto and the other modes cannot perform any protected human decision', () => {
  for (const definition of listAutomationDefinitions()) for (const operation of definition.operations) {
    for (const mode of ['Draft', 'Approve', 'Auto']) for (const decision of requiredHuman) {
      const result = policy.inspectOperationGate(definition.id, operation, mode, decision);
      assert.equal(result.allowed, false);
      assert.ok(result.reasons.includes('human_decision_required'));
    }
  }
});

test('unknown action, operation and mode fail closed even if a caller claims approval', () => {
  const cases = [
    ['listing_text', 'publish', 'Auto', 'perform_operation'],
    ['listing_text', 'prepare_draft', 'Auto', 'invented_decision'],
    ['listing_text', 'prepare_draft', 'Enabled', 'perform_operation'],
    ['unknown', 'prepare_draft', 'Auto', 'perform_operation'],
    ['listing_text', 'prepare_draft', 'Auto', 'perform_operation', { approved: true, actor: 'staff', origin: 'panel' }],
  ];
  for (const args of cases) {
    const result = policy.inspectOperationGate(...args);
    assert.equal(result.allowed, false);
    assert.ok(result.reasons.length);
  }
});

test('an apparent valid operation cannot infer policy, actor, source revision, gates or acceptance', () => {
  const expectedReasons = [
    'policy_unverified', 'actor_origin_unverified', 'source_revision_unverified', 'gates_unverified', 'acceptance_pending',
  ];
  for (const definition of listAutomationDefinitions()) for (const operation of definition.operations) {
    for (const mode of ['Draft', 'Approve', 'Auto']) {
      const result = policy.inspectOperationGate(definition.id, operation, mode, 'perform_operation');
      assert.equal(result.allowed, false);
      for (const reason of expectedReasons) assert.ok(result.reasons.includes(reason), reason);
    }
  }
});

test('mode proposals cannot mutate registry guards or create an effective policy', () => {
  const auto = policy.operationModeProposal('listing_text', 'prepare_draft', 'Auto');
  auto.required_gates.length = 0;
  auto.hard_human_decisions.length = 0;
  const draft = policy.operationModeProposal('listing_text', 'prepare_draft', 'Draft');
  assert.equal(draft.effective_mode, null);
  assert.equal(draft.policy_version, null);
  assert.equal(draft.allowed, false);
  assert.deepEqual(draft.required_gates, listAutomationDefinitions()[0].required_gates);
  for (const decision of requiredHuman) assert.ok(draft.hard_human_decisions.includes(decision));
  assert.equal(policy.inspectOperationGate('listing_text', 'prepare_draft', 'Auto', 'perform_operation').allowed, false);
  assert.equal(policy.inspectOperationGate('listing_text', 'prepare_draft', 'Draft', 'perform_operation').allowed, false);
});

test('non-primitive or uninspectable inputs cannot run getters or provide authority', () => {
  let accessed = false;
  const hostile = new Proxy({}, { get() { accessed = true; throw Error('fixture'); } });
  assert.throws(() => policy.operationModeProposal(hostile, 'prepare_draft', 'Draft'));
  const result = policy.inspectOperationGate('listing_text', hostile, 'Auto', 'perform_operation');
  assert.equal(result.allowed, false);
  assert.equal(accessed, false);
});

test('omitted modes use only a Draft proposal; explicit undefined and arbitrary actions fail closed', () => {
  assert.equal(policy.operationModeProposal('listing_text', 'prepare_draft').proposed_mode, 'Draft');
  assert.throws(() => policy.operationModeProposal('listing_text', 'prepare_draft', undefined));
  for (const action of [undefined, null, {}, 'constructor', '__proto__']) {
    const result = policy.inspectOperationGate('listing_text', 'prepare_draft', 'Auto', action);
    assert.deepEqual(result, { allowed: false, reasons: ['invalid_request'] });
  }
});

test('unsupported or incomplete registry definitions are rejected', async () => {
  const cases = [
    { index: 0, mutate: definition => { definition.version++; } },
    { index: 0, mutate: definition => { definition.id = 'hampton_intent_v1'; } },
    { index: 0, mutate: definition => { definition.purpose = 'hampton_intent_v1'; } },
    { index: 0, mutate: definition => { definition.operations = ['publish']; } },
    { index: 0, mutate: definition => { definition.hard_human_decisions = []; } },
    { index: 0, mutate: definition => { definition.required_gates = definition.required_gates.filter(gate => gate !== 'human_review'); } },
    { index: 0, mutate: definition => { definition.acceptance = null; } },
    { index: 1, mutate: definition => { definition.required_gates = definition.required_gates.filter(gate => gate !== 'source_policy'); } },
    { index: 1, mutate: definition => { definition.required_gates = definition.required_gates.filter(gate => gate !== 'reviewed_excerpt'); } },
    { index: 2, mutate: definition => { definition.required_gates = definition.required_gates.filter(gate => gate !== 'channel_authorization'); } },
  ];
  for (const { index, mutate } of cases) {
    const definition = listAutomationDefinitions()[index];
    const id = definition.id;
    const operation = definition.operations[0];
    mutate(definition);
    const dir = await mkdtemp(join(tmpdir(), 'aut10-contract-'));
    try {
      await writeFile(join(dir, 'package.json'), '{"type":"module"}');
      await copyFile(new URL('../../server/operation-policy.js', import.meta.url), join(dir, 'operation-policy.js'));
      await writeFile(join(dir, 'automation-contracts.js'),
        `export function getAutomationDefinition() { return ${JSON.stringify(definition)}; }\n`);
      const isolated = await import(pathToFileURL(join(dir, 'operation-policy.js')).href);
      assert.throws(() => isolated.operationModeProposal(id, operation, 'Auto'));
      assert.deepEqual(isolated.inspectOperationGate(id, operation, 'Auto', 'perform_operation'),
        { allowed: false, reasons: ['invalid_request'] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});
