import { decodeCsv, parseCsv } from '../../server/rentals.js';

export const LISTING_CSV_LIMIT = 650;

const asMoney = value => {
  const amount = Number(value.replaceAll(',', ''));
  return Number.isFinite(amount) && amount > 0 && amount < 1e10 ? amount : null;
};
const AMOUNT = /^(?:£\s*)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?:\s*(pcm|pm|pa|per month|per calendar month|per annum|per year))?$/i;
const asRoomCount = value => /^\d{1,3}$/.test(value) && Number(value) <= 100 ? Number(value) : null;
const PERIOD = { pcm: 'month', pm: 'month', 'per month': 'month', 'per calendar month': 'month',
  pa: 'year', 'per annum': 'year', 'per year': 'year' };
const UNKNOWN_PRICE = /^(?:POA|price on application|price not stated|not stated)$/i;

export function readListingCsv(bytes) {
  const [headers = [], ...records] = parseCsv(decodeCsv(bytes));
  const columns = headers.map(header => header.trim().toLowerCase());
  if (!columns.includes('url') || columns.some(column => !column) || new Set(columns).size !== columns.length) {
    throw new Error('Use a Listings CSV with a url column and unique column headings.');
  }
  if (!records.length || records.length > LISTING_CSV_LIMIT) {
    throw new Error(`Select a CSV with 1 to ${LISTING_CSV_LIMIT} listings.`);
  }
  return records.map((cells, index) => {
    if (cells.length !== columns.length) throw new Error(`CSV row ${index + 2} has a different number of columns.`);
    const record = Object.fromEntries(columns.map((column, i) => [column, cells[i].trim()]));
    const get = (...keys) => keys.map(key => Object.hasOwn(record, key) ? record[key] : '').find(Boolean) || '';
    const rawPrice = get('price_text');
    const explicitPrice = get('import_price_gbp', 'price');
    const amount = AMOUNT.exec(explicitPrice || rawPrice);
    const price = amount ? asMoney(amount[1] + (amount[2] ?? '')) : null;
    const sourcePeriod = PERIOD[amount?.[3]?.toLowerCase()];
    const beds = get('bedrooms'), baths = get('bathrooms');
    const bedrooms = asRoomCount(beds), bathrooms = asRoomCount(baths);
    const verified = /^(?:true|1|yes|sí|si)$/i.test(get('import_verified', 'verified')) &&
      (price !== null || (!explicitPrice && (!rawPrice || UNKNOWN_PRICE.test(rawPrice)))) &&
      (!beds || bedrooms !== null) && (!baths || bathrooms !== null);
    return {
      url: get('url'), title: get('listing_title', 'title', 'nombre_o_direccion_publica'), parish: get('parish'),
      location: get('import_location', 'location'), identity: get('import_identity', 'identity'), verified,
      operation: get('operation').toLowerCase(), use: get('use').toLowerCase(), price,
      price_qualifier: get('import_price_qualifier', 'price_qualifier'),
      rent_period: get('import_rent_period', 'rent_period').toLowerCase() || sourcePeriod || '',
      bedrooms, bathrooms, source: get('import_source', 'source', 'sources'),
      availability: get('import_availability', 'source_availability', 'availability'),
      hampton_code: get('hampton_codigo', 'hampton_code'),
      group: get('grupo_inmueble', 'group'), csv_state: get('hampton_cruce_estado', 'csv_state'),
    };
  });
}
