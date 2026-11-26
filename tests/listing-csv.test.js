import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readListingCsv } from '../admin/src/listing-csv.js';

const bytes = text => new TextEncoder().encode(text);

test('Listings CSV keeps official query identifiers, quoted fields and BOM', () => {
  const [row] = readListingCsv(bytes('\uFEFFurl,listing_title,operation,use,price_text,source_availability,hampton_codigo,grupo_inmueble,hampton_cruce_estado\r\n' +
    'https://www.maisonslesarches.je/PropertyDetail?id=1396_148,"148, Maisons Les Arches",sale,residential,"£225,000",Available,HE-R451,Maisons 148,posible_coincidencia\r\n'));
  assert.equal(row.url, 'https://www.maisonslesarches.je/PropertyDetail?id=1396_148');
  assert.equal(row.title, '148, Maisons Les Arches');
  assert.equal(row.price, 225000);
  assert.equal(row.availability, 'Available');
  assert.equal(row.hampton_code, 'HE-R451');
  assert.equal(row.group, 'Maisons 148');
  assert.equal(row.csv_state, 'posible_coincidencia');
  assert.equal(row.verified, false);
  assert.equal(row.identity, '');
});

test('prepared evidence overrides the raw CSV fields without guessing addresses', () => {
  const [row] = readListingCsv(bytes('url,title,operation,use,price_text,import_price_gbp,import_price_qualifier,import_rent_period,import_verified,import_identity,import_location,import_source,import_availability,bedrooms,bathrooms,parish\n' +
    'https://example.test/detail,The Cottage,rent,residential,"£1,500 pcm",1750,Guide price,month,true,"Flat 2, The Cottage","Flat 2, The Cottage, St Helier",Example,Available Now,2,1,St Helier'));
  assert.deepEqual(row, {
    url: 'https://example.test/detail', title: 'The Cottage', parish: 'St Helier', location: 'Flat 2, The Cottage, St Helier',
    identity: 'Flat 2, The Cottage', verified: true, operation: 'rent', use: 'residential', price: 1750,
    price_qualifier: 'Guide price', rent_period: 'month', bedrooms: 2, bathrooms: 1,
    source: 'Example', availability: 'Available Now', hampton_code: '', group: '', csv_state: '',
  });
});

test('malformed explicit evidence is held for review and malformed CSV is refused', () => {
  const [row] = readListingCsv(bytes('url,import_verified,import_price_gbp,price_text\nhttps://example.test,yes,unknown,"£1,250 pcm"'));
  assert.equal(row.verified, false);
  assert.equal(row.price, null);
  const [qualified] = readListingCsv(bytes('url,import_verified,price_text\nhttps://example.test,yes,"Guide price £1,250"'));
  assert.equal(qualified.verified, false);
  assert.throws(() => readListingCsv(bytes('title\nExample')), /url/i);
  assert.throws(() => readListingCsv(bytes('url,title\nhttps://example.test,"Open')), /unclosed quote/i);
});
