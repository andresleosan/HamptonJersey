// Contract completeness is not an access grant or proof that a reader exists.
// External evidence is deliberately pending until a trusted intake verifies it.
const reference = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const list = (value, check) => Array.isArray(value) && value.length > 0 && value.length <= 50 && value.every(check);
const host = value => typeof value === 'string' && value.length <= 253 && value === value.toLowerCase() &&
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value) && !/(^|\.)(localhost|local|internal)(\.|$)/.test(value);
const path = value => typeof value === 'string' && value.length <= 1024 && value.startsWith('/') &&
  !value.startsWith('//') && !/[?#%\\\u0000-\u001f\u007f]/.test(value) && !value.split('/').some(part => part === '.' || part === '..');
const fixturePath = value => typeof value === 'string' && /^tests\/fixtures\/market\/[A-Za-z0-9._/-]+\.json$/.test(value) &&
  !value.split('/').some(part => part === '.' || part === '..');
const mapping = value => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0 &&
  Object.keys(value).length <= 100 && Object.entries(value).every(([key, item]) => /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(key) && text(item));
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const VALIDATE = {
  source_ref: reference, channel_id: reference, manifest_revision: reference,
  policy_version: value => Number.isSafeInteger(value) && value > 0,
  method: value => ['http', 'manual'].includes(value),
  allowed_hosts: value => list(value, host), allowed_paths: value => list(value, path),
  reader_id: value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,80}_v[1-9][0-9]*$/.test(value),
  fixture_path: fixturePath, fixture_sha256: hash, field_map: mapping, pagination_test: text,
  territorial_scope: value => value === 'JE', duplicate_cases: value => list(value, text),
  error_cases: value => list(value, text), expected_count_behavior: text,
  accepted_at: timestamp, reviewer_ref: reference, annex_sha256: hash,
};

export function validateSourceContract(input) {
  const candidate = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const missing = Object.entries(VALIDATE).filter(([key, validate]) => !validate(candidate[key])).map(([key]) => key);
  if (candidate.fixture_origin !== 'provider_permitted') missing.push('permitted_provider_fixture');
  if (candidate.fixture_origin === 'provider_permitted') missing.push('independent_evidence_verification');
  return { status: 'source_contract_pending', missing, definition: null };
}
