// Pure encoding only: callers must separately establish financial authority and a stable snapshot.
const COLUMNS = Object.freeze(['schema_version', 'record_type', 'record_id', 'tenancy_ref', 'date', 'kind', 'currency', 'amount_pence', 'direction', 'related_id', 'revision', 'supersedes']);
const TYPES = new Set(['rent_charges', 'rent_payments', 'rent_adjustments', 'landlord_statement_lines']);
export const MAX_ROWS = 50000;
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_PENCE = 100000000;

function text(value) {
  if (typeof value !== 'string' || !value.isWellFormed()) throw new TypeError('Invalid accounting text');
  // Protect controls even without a formula marker, and whitespace before a formula.
  return /^(?:[\u0000-\u001f\u007f-\u009f]|\s*[=+\-@])/.test(value) ? "'" + value : value;
}

function cell(value) {
  return /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function encodeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== COLUMNS.length || COLUMNS.some(key => !Object.hasOwn(row, key))) throw new TypeError('Invalid accounting columns');
  if (!Number.isSafeInteger(row.schema_version) || row.schema_version < 1 || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new TypeError('Invalid accounting version');
  if (!TYPES.has(row.record_type) || row.currency !== 'GBP' || !validDate(row.date)) throw new TypeError('Invalid accounting type, currency or date');
  if (!Number.isSafeInteger(row.amount_pence) || Math.abs(row.amount_pence) > MAX_PENCE) throw new TypeError('Invalid accounting amount');
  const values = [String(row.schema_version), row.record_type, text(row.record_id), text(row.tenancy_ref), row.date, text(row.kind), row.currency, String(row.amount_pence), text(row.direction), row.related_id === null ? '' : text(row.related_id), String(row.revision), row.supersedes === null ? '' : text(row.supersedes)];
  return values.map(cell).join(',');
}

export function encodeAccountingCsv(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new RangeError('Invalid accounting row count');
  const bytes = new TextEncoder().encode([COLUMNS.join(','), ...Array.from(rows, encodeRow)].join('\r\n') + '\r\n');
  if (bytes.length > MAX_BYTES) throw new RangeError('Accounting export over 16 MB');
  return bytes;
}
