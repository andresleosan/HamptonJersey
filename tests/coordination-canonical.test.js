import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyIntegrated} from '../coordination/src/canonical.mjs';

const SHA='a'.repeat(40), OTHER='b'.repeat(40);

test('integration proof omits large file patches and keeps global ancestry metadata',async t=>{
  const seen=[];
  t.mock.method(globalThis,'fetch',async input=>{
    const url=new URL(input);seen.push(url);
    const metadata={status:'ahead',merge_base_commit:{sha:SHA},commits:[{sha:OTHER}]};
    // GitHub includes comparison-wide files only on page 1. A valid old commit can have megabytes of patches.
    return Response.json(url.searchParams.get('page')==='2'?metadata:
      {...metadata,files:[{filename:'large-doc.json',patch:'x'.repeat(1_000_001)}]});
  });
  assert.equal(await verifyIntegrated({},SHA),SHA);
  assert.equal(seen.length,1);
  assert.equal(seen[0].origin,'https://api.github.com');
  assert.equal(seen[0].pathname,`/repos/andresleosan/HamptonJersey/compare/${SHA}...main`);
  assert.equal(seen[0].search,'?per_page=1&page=2');
});

for(const [status,commits] of [['identical',[]],['ahead',[]],['ahead',[{sha:OTHER}]]]) {
  test(`integration accepts ${status} metadata with ${commits.length} commits on the requested page`,async t=>{
    t.mock.method(globalThis,'fetch',async()=>Response.json({status,merge_base_commit:{sha:SHA},commits}));
    assert.equal(await verifyIntegrated({},SHA),SHA);
  });
}

for(const metadata of [
  {status:'diverged',merge_base_commit:{sha:SHA},commits:[]},
  {status:'behind',merge_base_commit:{sha:SHA},commits:[]},
  {status:'ahead',merge_base_commit:{sha:OTHER},commits:[]},
  {status:'identical',commits:[]},
]) {
  test(`integration rejects unproven ancestry: ${JSON.stringify(metadata)}`,async t=>{
    t.mock.method(globalThis,'fetch',async()=>Response.json(metadata));
    await assert.rejects(verifyIntegrated({},SHA),e=>e.status===409&&e.code==='COMMIT_NOT_ON_MAIN');
  });
}

test('pagination does not remove the response limit or retry the oversized first page',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{
    calls++;
    return Response.json({status:'ahead',merge_base_commit:{sha:SHA},padding:'x'.repeat(1_000_001)});
  });
  await assert.rejects(verifyIntegrated({},SHA),e=>e.status===503&&e.code==='CANONICAL_UNAVAILABLE');
  assert.equal(calls,1);
});

for(const response of [()=>new Response('unavailable',{status:503}),()=>new Response('invalid JSON')]) {
  test(`integration fails closed for ${response().status} invalid upstream response`,async t=>{
    t.mock.method(globalThis,'fetch',async()=>response());
    await assert.rejects(verifyIntegrated({},SHA),e=>e.status===503&&e.code==='CANONICAL_UNAVAILABLE');
  });
}
