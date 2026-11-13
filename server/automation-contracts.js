// AUT-09: definitions only. This module neither authorizes nor executes an
// automation, selects a provider, grants access to data, or activates a mode.
// AUT-10/AUT-05 and the source owners retain their own runtime checks.
const DECISIONS = [
  'match_approval',
  'unknown_required_consultation',
  'search_resolution',
  'presentation_review',
];
const LIMITS = {
  monthly_cost_minor: null,
  currency: null,
  on_limit: 'draft',
  on_unknown_cost: 'block_and_review',
};
const pendingAcceptance = () => ({
  status: 'pending',
  cases: [],
  required_passes: null,
  evidence_ref: null,
  hard_guards: [...DECISIONS],
});
const DEFINITIONS = [
  {
    id: 'listing_text', version: 1, purpose: 'listing_text',
    trigger: 'staff_or_hermes_request', input_classes: ['C0'],
    operations: ['prepare_draft'],
    required_gates: ['source_revision', 'data_classification', 'model_authorization', 'human_review'],
    hard_human_decisions: [...DECISIONS],
    source_contracts: ['server/routes/hermes.js', 'docs/superpowers/specs/2026-11-01-hampton-app-automations-design.md'],
    owner: 'AUT-13', limits: {...LIMITS}, failure_policy: 'block_and_human_review', acceptance: pendingAcceptance(),
  },
  {
    id: 'market_ambiguity_v1', version: 1, purpose: 'market_ambiguity_v1',
    trigger: 'reviewed_observation', input_classes: ['C0'],
    operations: ['propose_interpretation'],
    required_gates: ['source_revision', 'source_policy', 'reviewed_excerpt', 'data_classification', 'model_authorization', 'human_review'],
    hard_human_decisions: [...DECISIONS],
    source_contracts: ['docs/superpowers/specs/2026-11-10-tp04-market-design.md', 'docs/superpowers/specs/2026-11-09-list2-model-message-contracts-design.md'],
    owner: 'BUS-09', limits: {...LIMITS}, failure_policy: 'block_and_human_review', acceptance: pendingAcceptance(),
  },
  {
    id: 'hampton_intent_v1', version: 1, purpose: 'hampton_intent_v1',
    trigger: 'reviewed_chat_purpose', input_classes: [],
    operations: ['propose_intent'],
    required_gates: ['source_revision', 'channel_authorization', 'data_classification', 'model_authorization', 'human_review'],
    hard_human_decisions: [...DECISIONS],
    source_contracts: ['docs/superpowers/specs/2026-11-09-list2-model-message-contracts-design.md'],
    owner: 'MSG-04', limits: {...LIMITS}, failure_policy: 'block_and_human_review', acceptance: pendingAcceptance(),
  },
];

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}
freeze(DEFINITIONS);
const BY_ID = new Map(DEFINITIONS.map(definition => [definition.id, definition]));

export function getAutomationDefinition(id) {
  const definition = typeof id === 'string' ? BY_ID.get(id) : undefined;
  if (!definition) throw new RangeError('Unknown automation definition');
  return structuredClone(definition);
}

export function listAutomationDefinitions() {
  return DEFINITIONS.map(definition => structuredClone(definition));
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

// A definition is valid only if it is the reviewed, versioned definition in
// this code. Unknown fields or changed gates/cases/costs require a code review;
// validating its shape is not evidence that any runtime gate has been met.
// This compares ordinary data DTOs, not hostile JavaScript objects or Proxies.
function compare(actual, expected, path, issues) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) { issues.push(path); return; }
    const expectedKeys = [...expected.keys()].map(String).concat('length');
    if (Reflect.ownKeys(actual).some(key => typeof key !== 'string' || !expectedKeys.includes(key))) { issues.push(path); return; }
    for (let i = 0; i < expected.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(actual, String(i));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) issues.push(`${path}[${i}]`);
      else compare(descriptor.value, expected[i], `${path}[${i}]`, issues);
    }
    return;
  }
  if (isRecord(expected)) {
    if (!isRecord(actual)) { issues.push(path); return; }
    const keys = Reflect.ownKeys(actual), expectedKeys = Object.keys(expected);
    if (keys.length !== expectedKeys.length || keys.some(key => typeof key !== 'string' || !Object.hasOwn(expected, key))) {
      issues.push(path); return;
    }
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(actual, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) issues.push(`${path}.${key}`);
      else compare(descriptor.value, expected[key], `${path}.${key}`, issues);
    }
    return;
  }
  if (!Object.is(actual, expected)) issues.push(path);
}

export function validateDefinition(definition) {
  try {
    if (!isRecord(definition)) return {valid: false, issues: ['definition']};
    const id = Object.getOwnPropertyDescriptor(definition, 'id');
    const expected = id && Object.hasOwn(id, 'value') && typeof id.value === 'string' ? BY_ID.get(id.value) : undefined;
    if (!expected) return {valid: false, issues: ['unknown_id']};
    const issues = [];
    compare(definition, expected, 'definition', issues);
    return {valid: issues.length === 0, issues};
  } catch {
    // Exotic objects that cannot be inspected fail closed; no values are logged.
    return {valid: false, issues: ['definition']};
  }
}
