import shared from '../site/measurement-dimensions.js';
const {SEARCH_DIMENSIONS: D, SEARCH_DIMENSION_VERSIONS: VERSIONS, searchPriceCode} = shared;

// Only the current producer schema is accepted. Historic versions must stay readable when a new one is added.
export function validSearchAction(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const keys = ['event', 'version', 'op', 'region', 'beds', 'max', 'zero_results'];
  if (Object.keys(x).length !== keys.length || keys.some(k => !Object.hasOwn(x, k))) return false;
  return x.event === 'search_applied' && x.version === D.version && typeof x.zero_results === 'boolean'
    && (x.op === null || D.operations.includes(x.op))
    && (x.region === null || D.regions.includes(x.region))
    && (x.beds === null || D.bedrooms.map(String).includes(x.beds))
    && (x.max === null || (x.op !== null && D.max[x.op]?.some(n => searchPriceCode(x.op, n) === x.max)));
}

export function searchValueLabel(version, dimension, value) {
  const historical = VERSIONS[version];
  if (!historical) return `Unknown (version ${version})`;
  if (value === 'none') return 'Not selected';
  const labels = {op:{sale:'Buy',rent:'Rent',business:'Commercial'},
    region:{jersey:'Jersey',uk:'UK',international:'International'},beds:{'2':'2+','3':'3+','4':'4+'}};
  if (labels[dimension] && Object.hasOwn(labels[dimension], value)) return labels[dimension][value];
  if (dimension === 'max') {
    for (const op of historical.operations) for (const n of historical.max[op]) {
      if (searchPriceCode(op,n) === value) return `${labels.op[op]} · £${n.toLocaleString('en-GB')}${op === 'rent' ? ' pcm' : ''}`;
    }
  }
  return 'Unknown value';
}
