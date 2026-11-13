const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../admin/src/listing-completeness.js');
const form = {operation:'sale', use:'residential', country:'Jersey', bedrooms:0, sale_price:'', price_text:'On application', tenure_type:'freehold', housing_category:'qualified', summary:'A home'};
const photo = id => ({id, kind:'photo', public:1, origin:'upload', r2_key:`p${id}`});

test('recommendations use one list, including zero bedrooms and private price', async () => {
  const {listingCriteria, listingCompleteness} = await load();
  const items = listingCriteria(form, 'st_helier', [1,2,3,4,5].map(photo), 1);
  assert.equal(items.length, 8);
  assert.ok(items.every(c => c.met));
  assert.deepEqual(listingCompleteness(items), {met:8,total:8,percentage:100});
  const missing = listingCriteria({...form, summary:''}, 'st_helier', [1,2,3,4,5].map(photo), 1);
  assert.deepEqual(listingCompleteness(missing), {met:7,total:8,percentage:88});
  assert.deepEqual(missing.filter(c => !c.met).map(c => c.target), ['f-summary']);
});

test('counts only eligible saved photos and an eligible cover', async () => {
  const {listingCriteria} = await load();
  const photos = [1,2,3,4].map(photo).concat([{...photo(5),origin:'external'}, {...photo(6),public:0}, {...photo(7),kind:'floorplan'}, {...photo(8),r2_key:null}]);
  const criteria = listingCriteria(form, 'st_helier', photos, 5);
  assert.equal(criteria.find(c => c.id === 'photos').met, false);
  assert.equal(criteria.find(c => c.id === 'cover').met, false);
  assert.match(criteria.find(c => c.id === 'photos').label, /4 of 5/);
  assert.equal(listingCriteria(form, 'st_helier', [...photos,photo(9)], 9).find(c => c.id === 'photos').met, true);
});

test('operation and country change applicable criteria without changing the form', async () => {
  const {listingCriteria} = await load();
  const rent = {...form,operation:'rent',rent:1000,country:'UK'};
  const business = {...rent,operation:'business',use:'commercial',tenure_type:'leasehold',rent:100};
  assert.equal(listingCriteria(rent, '', [], null).length, 5);
  assert.equal(listingCriteria(business, '', [], null).length, 4);
  assert.equal(rent.bedrooms, 0);
  assert.equal(listingCriteria({...form,price_text:'',sale_price:''}, 'st_helier', [], null).find(c=>c.id==='price').met,false);
});

test('unknown media and empty criteria never imply a percentage', async () => {
  const {listingCriteria, listingCompleteness} = await load();
  assert.equal(listingCompleteness([]), null);
  assert.equal(listingCompleteness(listingCriteria(form, 'st_helier', null, null)), null);
});
