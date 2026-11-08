// Shared by the public form, staff panel and server. Values stay in their existing search fields.
export const CRITERIA = {
  parking: ['Parking', ['parking_spaces']], area: ['Location', ['parishes_wanted']],
  type: ['Type of home', ['property_types']], bedrooms: ['Bedrooms', ['bedrooms_min', 'bedrooms_max']],
  bathrooms: ['Bathrooms', ['bathrooms_min']], garden: ['Garden', ['outdoor']],
  terrace: ['Terrace', ['outdoor']], balcony: ['Balcony', ['outdoor']], furnished: ['Furnished', ['furnished']],
  pets: ['Pets', ['pets']], budget: ['Budget', ['budget_max', 'budget_stretch']],
  move_in_date: ['Move-in date', ['move_in_date']], lease_term_months: ['Lease length', ['lease_term_months']],
  near: ['Near somewhere', ['near']], requirements: ['Other requirements', ['requirements']], children: ['Children', ['household_children']],
};
export const RENT_CRITERIA = ['furnished', 'lease_term_months'];
export function budgetLimitNote(a) {
  if (a.requirement_priorities?.values.budget !== 'must') return '';
  const amount = value => {
    const n = Number(String(value ?? '').replace(/[£,\s]/g,''));
    return Number.isFinite(n) && n > 0 ? `£${n.toLocaleString('en-GB')}` : 'to confirm';
  };
  if (a.operation === 'both') return `Must-have limits: ${amount(a.budget_max_rent)} per month to rent; ${amount(a.budget_max_buy)} to buy.`;
  const stretch = a.budget_stretch != null && a.budget_stretch !== '';
  return `Must-have limit${stretch ? ' including your stretch' : ''}: ${amount(stretch ? a.budget_stretch : a.budget_max)}${a.operation === 'rent' ? ' per month' : ''}.`;
}
export const parsePriorities = value => {
  try { const p = typeof value === 'string' ? JSON.parse(value) : value;
    return p?.version === 1 && p.values && !Array.isArray(p.values) && typeof p.values === 'object' ? p : null;
  } catch { return null; }
};
export const asList = v => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch { return []; } };
export function hasAnswer(key, a) {
  if (['garden', 'terrace', 'balcony'].includes(key)) return asList(a.outdoor).includes(key);
  return CRITERIA[key][1].some(k => a[k] != null && a[k] !== '' && (!Array.isArray(a[k]) || a[k].length)
    && !(typeof a[k] === 'string' && ['[]', 'null'].includes(a[k])));
}
export function notApplicable(key, a) {
  return (a.operation === 'buy' && RENT_CRITERIA.includes(key))
    || (key === 'parking' && a.parking_spaces != null && a.parking_spaces !== '' && Number(a.parking_spaces) === 0)
    || (key === 'pets' && asList(a.pets).some(p => p.kind === 'none'))
    || (key === 'furnished' && a.furnished === 'either')
    || (key === 'children' && (a.household_children_status === 'not_applicable'
      || (a.household_children != null && a.household_children !== '' && Number(a.household_children) === 0)));
}
export function prioritiesFor(p, a) {
  if (a.search_category === 'commercial' || !p) return null;
  const values = {}, unknown = [];
  for (const key of Object.keys(CRITERIA)) {
    if (a.operation === 'buy' && RENT_CRITERIA.includes(key)) continue;
    if (Object.hasOwn(p.values, key)) values[key] = notApplicable(key, a) ? 'preferred' : p.values[key];
    if (p.unknown?.includes(key) && !hasAnswer(key, a)) unknown.push(key);
  }
  return { version: 1, values, unknown };
}
