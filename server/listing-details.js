export const PROPERTY_CONDITION_LABELS = {
  new_build: 'New build',
  existing: 'Existing (condition not assessed)',
  good: 'Good condition',
  needs_modernisation: 'Needs modernisation',
  needs_renovation: 'Needs renovation',
};

export const LISTING_DETAIL_FIELDS = [
  'building_name_or_number', 'postcode', 'property_condition', 'developer_name',
];

const ADDRESS_FIELDS = ['building_name_or_number', 'postcode', 'developer_name'];
const JERSEY_POSTCODE = /^JE[0-9]{1,2} [0-9][A-Z]{2}$/;
const emptyDetails = () => Object.fromEntries(LISTING_DETAIL_FIELDS.map(key => [key, null]));
const blank = value => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

function text(value, max, label) {
  if (blank(value)) return null;
  if (typeof value !== 'string') throw new Error('Must be text');
  const result = value.trim();
  if (result.length > max) throw new Error(`At most ${max} characters`);
  return result;
}

export function normalizePostcode(value, country = 'Jersey') {
  if (blank(value)) return null;
  if (typeof value !== 'string') throw new Error('Must be text');
  let result = value.trim().replace(/\s+/g, ' ').toUpperCase();
  if (result.length > 32) throw new Error('At most 32 characters');
  if (country === 'Jersey') {
    if (!result.includes(' ') && result.length > 3) result = `${result.slice(0, -3)} ${result.slice(-3)}`;
    if (!JERSEY_POSTCODE.test(result)) throw new Error('Enter a Jersey postcode in the format JE1 1AA, or leave blank');
  }
  return result;
}

export function validateListingDetails(input, { partial = true, country = 'Jersey' } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null))
    return { errors: { details: 'Must be an object' } };

  const errors = {}, value = {};
  for (const key of Object.keys(input)) {
    if (!LISTING_DETAIL_FIELDS.includes(key)) errors[key] = 'Unknown field';
  }
  const fields = [
    ['building_name_or_number', v => text(v, 200, 'Building name or number')],
    ['postcode', v => normalizePostcode(v, country)],
    ['property_condition', v => {
      if (blank(v)) return null;
      if (typeof v !== 'string' || !Object.hasOwn(PROPERTY_CONDITION_LABELS, v.trim()))
        throw new Error('Choose a listed value or leave blank');
      return v.trim();
    }],
    ['developer_name', v => text(v, 200, 'Developer')],
  ];
  for (const [key, check] of fields) {
    if (!Object.hasOwn(input, key)) {
      if (!partial) errors[key] = 'Required';
      continue;
    }
    try { value[key] = check(input[key]); }
    catch (error) { errors[key] = error.message; }
  }
  return Object.keys(errors).length ? { errors } : { value };
}

export async function readListingDetails(env, id) {
  const row = await env.DB.prepare(`SELECT d.building_name_or_number,d.postcode,l.property_condition,d.developer_name,
      d.public_address_snapshot,d.public_address_snapshot_hash,d.public_address_evidence_ref,
      d.public_address_reviewed_by,d.public_address_reviewed_at
    FROM listings l LEFT JOIN listing_details d ON d.listing_id=l.id WHERE l.id=?`).bind(id).first();
  return { ...Object.fromEntries(LISTING_DETAIL_FIELDS.map(key => [key, row?.[key] ?? null])),
    public_address_snapshot: row?.public_address_snapshot ?? null,
    public_address_snapshot_hash: row?.public_address_snapshot_hash ?? null,
    public_address_evidence_ref: row?.public_address_evidence_ref ?? null,
    public_address_reviewed_by: row?.public_address_reviewed_by ?? null,
    public_address_reviewed_at: row?.public_address_reviewed_at ?? null };
}

export function changedListingDetails(current, next) {
  return Object.fromEntries(LISTING_DETAIL_FIELDS.filter(key => Object.hasOwn(next, key)
    && (current[key] ?? null) !== (next[key] ?? null)).map(key => [key, next[key]]));
}

const presentText = value => typeof value === 'string' ? value.trim() : '';

export function exactAddressErrors(listing, details) {
  const errors = {};
  if (!presentText(details.building_name_or_number)) errors.building_name_or_number = 'Enter the building name or number';
  if (!presentText(listing.road_name)) errors.road_name = 'Enter the road';
  if (!presentText(listing.country)) errors.country = 'Choose the country';
  if (listing.country === 'Jersey' && !presentText(details.postcode)) errors.postcode = 'Enter the Jersey postcode';
  return errors;
}

export function formatExactAddress(listing, details) {
  const parts = [details.building_name_or_number, listing.road_name, listing.location, listing.parish,
    details.postcode, listing.country].map(presentText).filter(Boolean);
  const unique = parts.filter((part, index) => parts.findIndex(value => value.toLocaleLowerCase() === part.toLocaleLowerCase()) === index);
  return unique.join(', ');
}

export function listingDetailsUpdateStatement(env, id, patch) {
  const keys = Object.keys(patch).filter(key => ADDRESS_FIELDS.includes(key));
  if (!keys.length) return null;
  const columns = ['listing_id', ...keys];
  const values = [id, ...keys.map(key => patch[key])];
  return env.DB.prepare(`INSERT INTO listing_details (${columns.join(',')})
    SELECT ${columns.map(() => '?').join(',')}
    WHERE changes() > 0
    ON CONFLICT(listing_id) DO UPDATE SET ${keys.map(key => `${key}=excluded.${key}`).join(',')}`)
    .bind(...values);
}

export function publicAddressReviewStatement(env, id, { snapshot = null, hash = null, evidenceRef = null, actor = null, at = null } = {}) {
  return env.DB.prepare(`INSERT INTO listing_details (listing_id,public_address_snapshot,public_address_snapshot_hash,
      public_address_evidence_ref,public_address_reviewed_by,public_address_reviewed_at)
    SELECT ?,?,?,?,?,? WHERE changes() > 0
    ON CONFLICT(listing_id) DO UPDATE SET public_address_snapshot=excluded.public_address_snapshot,
      public_address_snapshot_hash=excluded.public_address_snapshot_hash,public_address_evidence_ref=excluded.public_address_evidence_ref,
      public_address_reviewed_by=excluded.public_address_reviewed_by,public_address_reviewed_at=excluded.public_address_reviewed_at`)
    .bind(id, snapshot, hash, evidenceRef, actor, at);
}
