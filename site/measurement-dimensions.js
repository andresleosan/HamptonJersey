// Version 1 is immutable: later option changes must add a new version so old totals remain legible.
const SEARCH_DIMENSION_VERSIONS = {1: {
  version: 1,
  operations: ['sale', 'rent', 'business'],
  regions: ['jersey', 'uk', 'international'],
  operationLabels: {sale:'For sale', rent:'To let', business:'Businesses'},
  regionLabels: {jersey:'Jersey', uk:'UK', international:'International'},
  bedrooms: [2, 3, 4],
  max: {sale: [400000, 600000, 900000, 1500000], rent: [1500, 2500, 3500], business: [100000, 250000, 500000]},
}};
const SEARCH_DIMENSIONS = SEARCH_DIMENSION_VERSIONS[1];
const searchPriceCode = (op, n) => `${op}_gbp_${op === 'rent' ? 'month_' : ''}${n}`;
if (typeof module === 'object') module.exports = {SEARCH_DIMENSIONS, SEARCH_DIMENSION_VERSIONS, searchPriceCode};
