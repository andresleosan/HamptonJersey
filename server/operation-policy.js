// AUT-10 foundation: this module describes proposals only. It does not read or
// write a policy, verify a session, or authorize or run an operation. The
// runtime service needs its own durable policy and final-effect checks.
import { getAutomationDefinition } from './automation-contracts.js';

const MODES = new Set(['Draft', 'Approve', 'Auto']);

// A new operation or definition version requires explicit server review.
const SUPPORTED_OPERATIONS = new Map([
  ['listing_text', new Map([['prepare_draft', { version: 1, extraGates: [] }]])],
  ['market_ambiguity_v1', new Map([['propose_interpretation', {
    version: 1, extraGates: ['source_policy', 'reviewed_excerpt'],
  }]])],
  ['hampton_intent_v1', new Map([['propose_intent', {
    version: 1, extraGates: ['channel_authorization'],
  }]])],
]);

// These are server-owned invariants, not flags supplied with a request.
// AUT-09 already carries the four shared decisions; dictated criteria are an
// additional AUT-10 safeguard until that registry contract is reconciled.
const HUMAN_DECISIONS = Object.freeze([
  'match_approval',
  'unknown_required_consultation',
  'dictated_criteria_confirmation',
  'search_resolution',
  'presentation_review',
]);
const SHARED_DECISIONS = HUMAN_DECISIONS.filter(decision => decision !== 'dictated_criteria_confirmation');
const ACTIONS = new Set(['perform_operation', ...HUMAN_DECISIONS]);
const COMMON_GATES = ['source_revision', 'data_classification', 'model_authorization', 'human_review'];

function definitionFor(automationId, operation, mode) {
  if (typeof automationId !== 'string' || typeof operation !== 'string' ||
      typeof mode !== 'string' || !MODES.has(mode)) {
    throw new TypeError('Invalid operation policy proposal');
  }
  const supported = SUPPORTED_OPERATIONS.get(automationId)?.get(operation);
  if (supported === undefined) throw new RangeError('Unknown automation or operation');

  const definition = getAutomationDefinition(automationId);
  if (definition.id !== automationId || definition.purpose !== automationId ||
      definition.version !== supported.version || !Array.isArray(definition.operations) ||
      !definition.operations.includes(operation) || !Array.isArray(definition.hard_human_decisions) ||
      !SHARED_DECISIONS.every(decision => definition.hard_human_decisions.includes(decision)) ||
      !Array.isArray(definition.required_gates) ||
      ![...COMMON_GATES, ...supported.extraGates].every(gate => definition.required_gates.includes(gate)) ||
      !definition.required_gates.every(gate => typeof gate === 'string' && gate.length > 0) ||
      !definition.acceptance || typeof definition.acceptance.status !== 'string') {
    throw new RangeError('Unsupported automation definition');
  }
  return definition;
}

// Draft is the proposed starting mode, not a persisted or effective default.
// Extra arguments and non-primitive values cannot supply actor or gate claims.
export function operationModeProposal(automationId, operation, mode) {
  if (arguments.length < 2 || arguments.length > 3) {
    throw new TypeError('Invalid operation policy proposal');
  }
  const proposedMode = arguments.length === 2 ? 'Draft' : mode;
  const definition = definitionFor(automationId, operation, proposedMode);
  return {
    kind: 'proposal_only',
    automation_id: automationId,
    operation,
    proposed_mode: proposedMode,
    definition_version: definition.version,
    effective_mode: null,
    policy_version: null,
    allowed: false,
    required_gates: [...definition.required_gates],
    hard_human_decisions: [...HUMAN_DECISIONS],
  };
}

// An inspection cannot verify policy version, actor, origin, source revision,
// or gates. There is deliberately no path from this preview to allowed:true.
export function inspectOperationGate(automationId, operation, mode, action) {
  if (arguments.length !== 4 || typeof action !== 'string' || !ACTIONS.has(action)) {
    return { allowed: false, reasons: ['invalid_request'] };
  }
  let definition;
  try {
    definition = definitionFor(automationId, operation, mode);
  } catch {
    return { allowed: false, reasons: ['invalid_request'] };
  }
  return {
    allowed: false,
    reasons: [
      'policy_unverified',
      'actor_origin_unverified',
      'source_revision_unverified',
      'gates_unverified',
      definition.acceptance.status === 'pending' ? 'acceptance_pending' : 'acceptance_unverified',
      ...(HUMAN_DECISIONS.includes(action) ? ['human_decision_required'] : []),
    ],
  };
}
