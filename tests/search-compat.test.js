const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const {SEARCH_DIMENSIONS}=require('../site/measurement-dimensions.js');
const normal = x => JSON.parse(JSON.stringify(x));
const runWithoutDimensions = () => {
  const script=readFileSync('site/lib.js','utf8');
  return vm.runInNewContext(`${script}\n;({CATALOG,readCatalogQuery,catalogFilter,searchAction})`,{URL,URLSearchParams,Intl,Date});
};

test('new library supports a document that did not load measurement dimensions',()=>{
  const lib=runWithoutDimensions();
  assert.deepEqual(normal(lib.CATALOG),{op:SEARCH_DIMENSIONS.operations,region:SEARCH_DIMENSIONS.regions,beds:SEARCH_DIMENSIONS.bedrooms});
  assert.deepEqual(normal(lib.catalogFilter('?op=rent&region=jersey&beds=2&max=2500',true,SEARCH_DIMENSIONS.max)),
    {op:'rent',region:'jersey',beds:2,max:2500});
  assert.equal(lib.searchAction({op:'rent',region:'jersey',beds:2,max:2500},[],true),null,'no telemetry without the canonical dimensions');
});

test('document fallback exactly matches the canonical dimensions',()=>{
  const lib=runWithoutDimensions();
  const html=readFileSync('site/index.html','utf8');
  const part='const $ ='+html.split('const $ =')[1].split('const BRAND =')[0];
  const result=vm.runInNewContext(`${part}\n;UI_DIMENSIONS`,{CATALOG:lib.CATALOG,Intl,Date,URL});
  assert.deepEqual(normal(result),normal(SEARCH_DIMENSIONS));
});
